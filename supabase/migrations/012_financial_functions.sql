-- Nexus 3.0 — Integridade cross-workspace, saldos e RPCs transacionais

-- ---------------------------------------------------------------------------
-- Validação: entidades referenciadas devem pertencer ao mesmo workspace
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_same_workspace_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ref_workspace UUID;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT workspace_id INTO ref_workspace FROM public.categories WHERE id = NEW.category_id;
    IF ref_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'category_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    SELECT workspace_id INTO ref_workspace FROM public.financial_accounts WHERE id = NEW.financial_account_id;
    IF ref_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'financial_account_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT workspace_id INTO ref_workspace FROM public.cost_centers WHERE id = NEW.cost_center_id;
    IF ref_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'cost_center_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT workspace_id INTO ref_workspace FROM public.customers WHERE id = NEW.customer_id;
    IF ref_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'customer_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.supplier_id IS NOT NULL THEN
    SELECT workspace_id INTO ref_workspace FROM public.suppliers WHERE id = NEW.supplier_id;
    IF ref_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'supplier_id pertence a outro workspace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_validate_workspace_refs
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_same_workspace_refs();

-- ---------------------------------------------------------------------------
-- Recalcular saldo materializado (consistência transacional)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS NUMERIC(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initial NUMERIC(15, 2);
  v_workspace UUID;
  v_balance NUMERIC(15, 2);
BEGIN
  SELECT initial_balance, workspace_id INTO v_initial, v_workspace
  FROM public.financial_accounts WHERE id = p_account_id;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;

  IF NOT public.can_write_financial(v_workspace) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT v_initial
    + COALESCE((
      SELECT SUM(CASE
        WHEN t.type = 'income' AND t.financial_account_id = p_account_id THEN t.amount
        WHEN t.type = 'expense' AND t.financial_account_id = p_account_id THEN -t.amount
        WHEN t.type = 'transfer' AND t.transfer_to_account_id = p_account_id THEN t.amount
        WHEN t.type = 'transfer' AND t.transfer_from_account_id = p_account_id THEN -t.amount
        ELSE 0
      END)
      FROM public.transactions t
      WHERE t.deleted_at IS NULL
        AND t.status = 'completed'
        AND (t.financial_account_id = p_account_id
          OR t.transfer_from_account_id = p_account_id
          OR t.transfer_to_account_id = p_account_id)
    ), 0)
  INTO v_balance;

  UPDATE public.financial_accounts
  SET current_balance = v_balance, updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_account_balance(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria (sanitizada — sem segredos)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_workspace_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    workspace_id, user_id, action, entity_type, entity_id,
    old_data, new_data, metadata
  ) VALUES (
    p_workspace_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    p_old_data, p_new_data, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log(UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Marcar conta a pagar (atômico)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_payable_paid(
  p_payable_id UUID,
  p_payment_amount NUMERIC(15, 2),
  p_financial_account_id UUID,
  p_payment_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payable public.accounts_payable%ROWTYPE;
  v_tx_id UUID;
  v_new_paid NUMERIC(15, 2);
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_payable FROM public.accounts_payable WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada'; END IF;
  IF NOT public.can_write_financial(v_payable.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_payment_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  v_new_paid := LEAST(v_payable.amount, v_payable.paid_amount + p_payment_amount);
  v_new_status := CASE
    WHEN v_new_paid >= v_payable.amount THEN 'paid'
    WHEN v_new_paid > 0 THEN 'partial'
    ELSE v_payable.status
  END;

  INSERT INTO public.transactions (
    workspace_id, financial_account_id, supplier_id, category_id, cost_center_id,
    type, description, amount, transaction_date, status,
    source_type, source_id, created_by
  ) VALUES (
    v_payable.workspace_id, p_financial_account_id, v_payable.supplier_id,
    v_payable.category_id, v_payable.cost_center_id,
    'expense', v_payable.description, p_payment_amount, p_payment_date, 'completed',
    'accounts_payable', v_payable.id, auth.uid()
  ) RETURNING id INTO v_tx_id;

  UPDATE public.accounts_payable
  SET paid_amount = v_new_paid,
      status = v_new_status,
      payment_date = CASE WHEN v_new_status = 'paid' THEN p_payment_date ELSE payment_date END,
      transaction_id = COALESCE(transaction_id, v_tx_id),
      updated_at = NOW()
  WHERE id = p_payable_id;

  PERFORM public.recalculate_account_balance(p_financial_account_id);
  PERFORM public.write_audit_log(
    v_payable.workspace_id, 'payment', 'accounts_payable', p_payable_id,
    to_jsonb(v_payable), NULL, jsonb_build_object('transaction_id', v_tx_id)
  );

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payable_paid(UUID, NUMERIC, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payable_paid(UUID, NUMERIC, UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Marcar conta a receber (atômico)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_receivable_received(
  p_receivable_id UUID,
  p_received_amount NUMERIC(15, 2),
  p_financial_account_id UUID,
  p_received_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recv public.accounts_receivable%ROWTYPE;
  v_tx_id UUID;
  v_new_received NUMERIC(15, 2);
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_recv FROM public.accounts_receivable WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;
  IF NOT public.can_write_financial(v_recv.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_new_received := LEAST(v_recv.amount, v_recv.received_amount + p_received_amount);
  v_new_status := CASE
    WHEN v_new_received >= v_recv.amount THEN 'received'
    WHEN v_new_received > 0 THEN 'partial'
    ELSE v_recv.status
  END;

  INSERT INTO public.transactions (
    workspace_id, financial_account_id, customer_id, category_id, cost_center_id,
    type, description, amount, transaction_date, status,
    source_type, source_id, created_by
  ) VALUES (
    v_recv.workspace_id, p_financial_account_id, v_recv.customer_id,
    v_recv.category_id, v_recv.cost_center_id,
    'income', v_recv.description, p_received_amount, p_received_date, 'completed',
    'accounts_receivable', v_recv.id, auth.uid()
  ) RETURNING id INTO v_tx_id;

  UPDATE public.accounts_receivable
  SET received_amount = v_new_received,
      status = v_new_status,
      received_date = CASE WHEN v_new_status = 'received' THEN p_received_date ELSE received_date END,
      transaction_id = COALESCE(transaction_id, v_tx_id),
      updated_at = NOW()
  WHERE id = p_receivable_id;

  PERFORM public.recalculate_account_balance(p_financial_account_id);
  PERFORM public.write_audit_log(
    v_recv.workspace_id, 'receipt', 'accounts_receivable', p_receivable_id,
    to_jsonb(v_recv), NULL, jsonb_build_object('transaction_id', v_tx_id)
  );

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_receivable_received(UUID, NUMERIC, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_receivable_received(UUID, NUMERIC, UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Transferência entre contas (atômico)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_account_transfer(
  p_workspace_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC(15, 2),
  p_description TEXT,
  p_transfer_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
BEGIN
  IF NOT public.can_write_financial(p_workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Contas iguais'; END IF;

  INSERT INTO public.transactions (
    workspace_id, type, description, amount, transaction_date, status,
    transfer_from_account_id, transfer_to_account_id,
    financial_account_id, created_by
  ) VALUES (
    p_workspace_id, 'transfer', p_description, p_amount, p_transfer_date, 'completed',
    p_from_account_id, p_to_account_id,
    p_from_account_id, auth.uid()
  ) RETURNING id INTO v_tx_id;

  PERFORM public.recalculate_account_balance(p_from_account_id);
  PERFORM public.recalculate_account_balance(p_to_account_id);
  PERFORM public.write_audit_log(
    p_workspace_id, 'create', 'transactions', v_tx_id,
    NULL, jsonb_build_object('type', 'transfer', 'amount', p_amount),
    jsonb_build_object('from', p_from_account_id, 'to', p_to_account_id)
  );

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_account_transfer(UUID, UUID, UUID, NUMERIC, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account_transfer(UUID, UUID, UUID, NUMERIC, TEXT, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap workspace (criar workspace + owner member)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  p_name TEXT,
  p_type TEXT,
  p_document TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  INSERT INTO public.workspaces (name, type, document, owner_id)
  VALUES (p_name, p_type, p_document, auth.uid())
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, auth.uid(), 'owner');

  RETURN v_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_with_owner(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(TEXT, TEXT, TEXT) TO authenticated;
