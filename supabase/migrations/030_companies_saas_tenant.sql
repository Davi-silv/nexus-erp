-- Nexus ERP 030 — SaaS multi-tenant: companies / company_users / company_id
-- Renomeia workspaces → companies (modelo solicitado) e reforça isolamento RLS.

-- ---------------------------------------------------------------------------
-- 1) Tabelas núcleo tenant
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspaces RENAME TO companies;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.companies
SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.companies
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.workspace_members RENAME TO company_users;

ALTER TABLE public.company_users RENAME COLUMN workspace_id TO company_id;

ALTER TABLE public.company_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- 2) Renomear FK tenant em todas as tabelas operacionais
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'workspace_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN workspace_id TO company_id',
      r.table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Helpers RLS (company) + compatibilidade workspace_*
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.user_id = auth.uid()
      AND cu.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_company_role(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.role FROM public.company_users cu
  WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(p_company_id UUID, p_allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.user_id = auth.uid()
      AND cu.status = 'active'
      AND cu.role = ANY (p_allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_financial(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_company_role(
           p_company_id,
           ARRAY['owner', 'admin', 'financial']::TEXT[]
         )
     AND public.is_company_member(p_company_id)
     AND public.can_write_financial_data(p_company_id);
$$;

CREATE OR REPLACE FUNCTION public.can_read_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_company_member(p_company_id);
$$;

CREATE OR REPLACE FUNCTION public.can_admin_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_company_role(p_company_id, ARRAY['owner', 'admin']::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION public.can_write_fiscal(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_company_role(
    p_company_id,
    ARRAY['owner', 'admin', 'financial', 'accountant']::TEXT[]
  ) AND public.can_write_financial_data(p_company_id);
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_company_member(p_workspace_id);
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(p_workspace_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_company_role(p_workspace_id);
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id UUID, p_allowed_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_company_role(p_workspace_id, p_allowed_roles);
$$;

CREATE OR REPLACE FUNCTION public.can_read_workspace(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_read_company(p_workspace_id);
$$;

CREATE OR REPLACE FUNCTION public.can_admin_workspace(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_admin_company(p_workspace_id);
$$;

REVOKE ALL ON FUNCTION public.is_company_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.can_write_financial(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_financial(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) company_id imutável + membership obrigatória (defesa em profundidade)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_company_id_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_company_membership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(NEW.company_id) THEN
    RAISE EXCEPTION 'Access denied for company';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'company_id'
      AND table_name NOT IN ('company_users')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_company_id_change ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_prevent_company_id_change BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_company_id_change()',
      r.table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_company_membership ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_enforce_company_membership BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_membership()',
      r.table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Views financeiras (company_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.monthly_cash_flow
WITH (security_invoker = true) AS
SELECT
  t.company_id,
  date_trunc('month', t.transaction_date)::DATE AS month,
  SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) AS net_cash_flow
FROM public.transactions t
WHERE t.deleted_at IS NULL AND t.status = 'completed' AND t.type IN ('income', 'expense')
GROUP BY t.company_id, date_trunc('month', t.transaction_date);

CREATE OR REPLACE VIEW public.workspace_balances
WITH (security_invoker = true) AS
SELECT fa.company_id, fa.id AS financial_account_id, fa.name, fa.type, fa.currency,
       fa.initial_balance, fa.current_balance, fa.active
FROM public.financial_accounts fa
WHERE fa.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6) RPCs / triggers atualizados (company_id)
-- ---------------------------------------------------------------------------
-- patched from 012_financial_functions.sql
CREATE OR REPLACE FUNCTION public.validate_same_company_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ref_workspace UUID;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT company_id INTO ref_workspace FROM public.categories WHERE id = NEW.category_id;
    IF ref_workspace IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'category_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    SELECT company_id INTO ref_workspace FROM public.financial_accounts WHERE id = NEW.financial_account_id;
    IF ref_workspace IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'financial_account_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT company_id INTO ref_workspace FROM public.cost_centers WHERE id = NEW.cost_center_id;
    IF ref_workspace IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'cost_center_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT company_id INTO ref_workspace FROM public.customers WHERE id = NEW.customer_id;
    IF ref_workspace IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'customer_id pertence a outro workspace';
    END IF;
  END IF;

  IF NEW.supplier_id IS NOT NULL THEN
    SELECT company_id INTO ref_workspace FROM public.suppliers WHERE id = NEW.supplier_id;
    IF ref_workspace IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'supplier_id pertence a outro workspace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_validate_workspace_refs ON public.transactions;
DROP TRIGGER IF EXISTS transactions_validate_company_refs ON public.transactions;
CREATE TRIGGER transactions_validate_company_refs
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_same_company_refs();

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
  SELECT initial_balance, company_id INTO v_initial, v_workspace
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
    company_id, user_id, action, entity_type, entity_id,
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
  IF NOT public.can_write_financial(v_payable.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_payment_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  v_new_paid := LEAST(v_payable.amount, v_payable.paid_amount + p_payment_amount);
  v_new_status := CASE
    WHEN v_new_paid >= v_payable.amount THEN 'paid'
    WHEN v_new_paid > 0 THEN 'partial'
    ELSE v_payable.status
  END;

  INSERT INTO public.transactions (
    company_id, financial_account_id, supplier_id, category_id, cost_center_id,
    type, description, amount, transaction_date, status,
    source_type, source_id, created_by
  ) VALUES (
    v_payable.company_id, p_financial_account_id, v_payable.supplier_id,
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
    v_payable.company_id, 'payment', 'accounts_payable', p_payable_id,
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
  IF NOT public.can_write_financial(v_recv.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_new_received := LEAST(v_recv.amount, v_recv.received_amount + p_received_amount);
  v_new_status := CASE
    WHEN v_new_received >= v_recv.amount THEN 'received'
    WHEN v_new_received > 0 THEN 'partial'
    ELSE v_recv.status
  END;

  INSERT INTO public.transactions (
    company_id, financial_account_id, customer_id, category_id, cost_center_id,
    type, description, amount, transaction_date, status,
    source_type, source_id, created_by
  ) VALUES (
    v_recv.company_id, p_financial_account_id, v_recv.customer_id,
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
    v_recv.company_id, 'receipt', 'accounts_receivable', p_receivable_id,
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
    company_id, type, description, amount, transaction_date, status,
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

-- patched from 016_subscription_functions.sql
CREATE OR REPLACE FUNCTION public._plan_id_by_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.plans WHERE slug = p_slug AND active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._write_subscription_event(
  p_workspace_id UUID,
  p_subscription_id UUID,
  p_event_type TEXT,
  p_old_plan_id UUID DEFAULT NULL,
  p_new_plan_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscription_events (
    company_id, subscription_id, event_type, old_plan_id, new_plan_id, metadata
  ) VALUES (
    p_workspace_id, p_subscription_id, p_event_type, p_old_plan_id, p_new_plan_id, p_metadata
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Sincronizar status (expirar trial sem apagar dados)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_subscription_status(p_workspace_id UUID)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE company_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at <= NOW()
     AND v_sub.status NOT IN ('active', 'past_due') THEN
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;

    PERFORM public._write_subscription_event(
      p_workspace_id, v_sub.id, 'trial_expired', v_sub.plan_id, v_sub.plan_id,
      jsonb_build_object('trial_ends_at', v_sub.trial_ends_at)
    );
  END IF;

  IF v_sub.status = 'active'
     AND v_sub.cancel_at_period_end = TRUE
     AND v_sub.current_period_end IS NOT NULL
     AND v_sub.current_period_end <= NOW() THEN
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;

    PERFORM public._write_subscription_event(
      p_workspace_id, v_sub.id, 'cancelled', v_sub.plan_id, v_sub.plan_id, '{}'
    );
  END IF;

  RETURN v_sub;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trial de 30 dias (Pro) — uma vez por workspace
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_workspace_trial(p_workspace_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_id UUID;
  v_sub_id UUID;
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE company_id = p_workspace_id) THEN
    RETURN NULL;
  END IF;

  v_pro_id := public._plan_id_by_slug('pro');
  IF v_pro_id IS NULL THEN
    RAISE EXCEPTION 'Plano Pro não encontrado';
  END IF;

  INSERT INTO public.subscriptions (
    company_id, plan_id, status,
    trial_started_at, trial_ends_at
  ) VALUES (
    p_workspace_id, v_pro_id, 'trialing',
    NOW(), NOW() + INTERVAL '30 days'
  ) RETURNING id INTO v_sub_id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub_id, 'trial_started', NULL, v_pro_id,
    jsonb_build_object('trial_plan_slug', 'pro', 'trial_days', 30)
  );

  RETURN v_sub_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Plano efetivo (trial = Pro)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_effective_plan_id(p_workspace_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_pro_id UUID;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE company_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN public._plan_id_by_slug('personal');
  END IF;

  v_pro_id := public._plan_id_by_slug('pro');

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at > NOW() THEN
    RETURN v_pro_id;
  END IF;

  IF v_sub.status IN ('active', 'past_due') THEN
    RETURN v_sub.plan_id;
  END IF;

  IF v_sub.status = 'trialing' THEN
    RETURN v_pro_id;
  END IF;

  RETURN v_sub.plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_trial_active(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;
  RETURN v_sub.status = 'trialing' AND v_sub.trial_ends_at > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trial_days_remaining(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;
  IF v_sub.id IS NULL OR v_sub.trial_ends_at IS NULL THEN
    RETURN 0;
  END IF;
  RETURN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.trial_ends_at - NOW())) / 86400)::INTEGER);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_subscription_active(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;

  IF v_sub.status IN ('active', 'past_due') THEN
    IF v_sub.cancel_at_period_end AND v_sub.current_period_end IS NOT NULL THEN
      RETURN v_sub.current_period_end > NOW();
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Uso e limites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_feature_usage(p_workspace_id UUID, p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW());
BEGIN
  CASE p_feature
    WHEN 'financial_accounts' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.financial_accounts
      WHERE company_id = p_workspace_id AND deleted_at IS NULL;
    WHEN 'users' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.company_users
      WHERE company_id = p_workspace_id;
    WHEN 'ai_requests' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.ai_usage
      WHERE company_id = p_workspace_id AND created_at >= v_month_start;
    ELSE
      v_count := 0;
  END CASE;
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_feature_limit(p_workspace_id UUID, p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_limit INTEGER;
BEGIN
  v_plan_id := public.get_effective_plan_id(p_workspace_id);
  SELECT pf.limit_value INTO v_limit
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id AND pf.feature = p_feature AND pf.enabled = TRUE;
  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_use_feature(p_workspace_id UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_enabled BOOLEAN;
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  IF NOT public.is_subscription_active(p_workspace_id) THEN
    RETURN FALSE;
  END IF;

  v_plan_id := public.get_effective_plan_id(p_workspace_id);

  SELECT pf.enabled, pf.limit_value INTO v_enabled, v_limit
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id AND pf.feature = p_feature;

  IF NOT FOUND OR v_enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_limit IS NOT NULL THEN
    v_usage := public.get_feature_usage(p_workspace_id, p_feature);
    IF v_usage >= v_limit THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_financial_data(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_subscription_active(p_workspace_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Snapshot JSON para frontend
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_subscription_snapshot(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_effective_plan_id UUID;
  v_effective_plan public.plans;
  v_base_plan public.plans;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  PERFORM public.ensure_trial_notifications(p_workspace_id);

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  v_effective_plan_id := public.get_effective_plan_id(p_workspace_id);
  SELECT * INTO v_effective_plan FROM public.plans WHERE id = v_effective_plan_id;

  IF v_sub.id IS NOT NULL THEN
    SELECT * INTO v_base_plan FROM public.plans WHERE id = v_sub.plan_id;
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'status', COALESCE(v_sub.status, 'none'),
    'is_active', public.is_subscription_active(p_workspace_id),
    'is_trialing', public.is_trial_active(p_workspace_id),
    'trial_days_remaining', public.get_trial_days_remaining(p_workspace_id),
    'trial_started_at', v_sub.trial_started_at,
    'trial_ends_at', v_sub.trial_ends_at,
    'cancel_at_period_end', COALESCE(v_sub.cancel_at_period_end, FALSE),
    'current_period_end', v_sub.current_period_end,
    'cancelled_at', v_sub.cancelled_at,
    'effective_plan', jsonb_build_object(
      'id', v_effective_plan.id,
      'slug', v_effective_plan.slug,
      'name', v_effective_plan.name,
      'price_monthly', v_effective_plan.price_monthly,
      'recommended', v_effective_plan.recommended
    ),
    'base_plan', CASE WHEN v_base_plan.id IS NOT NULL THEN jsonb_build_object(
      'id', v_base_plan.id,
      'slug', v_base_plan.slug,
      'name', v_base_plan.name
    ) ELSE NULL END,
    'can_write', public.can_write_financial_data(p_workspace_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Notificações de trial (7, 3, 1 dia) — sem duplicatas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_trial_notifications(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER;
  v_sub public.subscriptions;
  v_type TEXT;
  v_title TEXT;
  v_msg TEXT;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF NOT public.is_trial_active(p_workspace_id) THEN
    RETURN;
  END IF;

  v_days := public.get_trial_days_remaining(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  IF v_days NOT IN (7, 3, 1) THEN
    RETURN;
  END IF;

  v_type := 'trial_reminder_' || v_days::TEXT;
  v_title := 'Seu teste grátis termina em ' || v_days::TEXT || ' dia' || CASE WHEN v_days > 1 THEN 's' ELSE '' END;
  v_msg := 'Escolha um plano para continuar utilizando todos os recursos do Nexus.';

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.company_id = p_workspace_id
      AND n.type = v_type
      AND n.user_id = COALESCE(v_uid, n.user_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (company_id, user_id, type, severity, title, message)
  VALUES (p_workspace_id, v_uid, v_type, 'warning', v_title, v_msg);
END;
$$;

-- ---------------------------------------------------------------------------
-- Seleção de plano (sem gateway — prepara assinatura; pagamento via webhook futuro)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.select_subscription_plan(
  p_workspace_id UUID,
  p_plan_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_new_plan_id UUID;
  v_old_plan_id UUID;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar plano';
  END IF;

  v_new_plan_id := public._plan_id_by_slug(p_plan_slug);
  IF v_new_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano inválido';
  END IF;

  PERFORM public.sync_subscription_status(p_workspace_id);

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  v_old_plan_id := v_sub.plan_id;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;

  -- Sem gateway: marca incomplete até webhook confirmar pagamento
  UPDATE public.subscriptions
  SET
    plan_id = v_new_plan_id,
    status = 'incomplete',
    trial_ends_at = COALESCE(trial_ends_at, NOW()),
    updated_at = NOW()
  WHERE id = v_sub.id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub.id,
    CASE WHEN v_old_plan_id = v_new_plan_id THEN 'plan_selected' ELSE 'upgrade_requested' END,
    v_old_plan_id, v_new_plan_id,
    jsonb_build_object('plan_slug', p_plan_slug, 'awaiting_payment', TRUE)
  );

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_subscription_cancel(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id AND status IN ('active', 'past_due')
  ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma assinatura ativa para cancelar';
  END IF;

  UPDATE public.subscriptions
  SET cancel_at_period_end = TRUE, updated_at = NOW()
  WHERE id = v_sub.id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub.id, 'cancel_requested', v_sub.plan_id, v_sub.plan_id, '{}'
  );

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_subscription(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE company_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  UPDATE public.subscriptions
  SET cancel_at_period_end = FALSE, cancelled_at = NULL, updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Listar planos + features (página de preços)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_plans_with_features()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(plan_row ORDER BY sort_order), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'price_monthly', p.price_monthly,
      'currency', p.currency,
      'recommended', p.recommended,
      'sort_order', p.sort_order,
      'features', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'feature', pf.feature,
          'enabled', pf.enabled,
          'limit_value', pf.limit_value
        )), '[]'::jsonb)
        FROM public.plan_features pf WHERE pf.plan_id = p.id
      )
    ) AS plan_row, p.sort_order
    FROM public.plans p
    WHERE p.active = TRUE
  ) sub;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap workspace + trial automático
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
  INSERT INTO public.companies (name, type, document, owner_id)
  VALUES (p_name, p_type, p_document, auth.uid())
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (v_workspace_id, auth.uid(), 'owner');

  PERFORM public.start_workspace_trial(v_workspace_id);

  RETURN v_workspace_id;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.sync_subscription_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_workspace_trial(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_effective_plan_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trial_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_days_remaining(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_subscription_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_usage(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_limit(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_feature(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_financial_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subscription_snapshot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_trial_notifications(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_subscription_plan(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_subscription_cancel(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_plans_with_features() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_workspace_trial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_plan_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trial_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_days_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_usage(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_limit(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_feature(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_financial_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_trial_notifications(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_subscription_plan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_subscription_cancel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_plans_with_features() TO authenticated;

-- patched from 025_commercial_functions.sql
CREATE OR REPLACE FUNCTION public.next_quote_number(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.quotes
  WHERE company_id = p_workspace_id;

  RETURN 'ORC-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Recalcular totais do orçamento (backend — não confiar só no frontend)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalculate_quote_totals(p_quote_id UUID)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_subtotal NUMERIC(15, 2);
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado'; END IF;
  IF NOT public.can_write_financial(v_quote.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT COALESCE(SUM(
    GREATEST((quantity * unit_price) - discount, 0)
  ), 0) INTO v_subtotal
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  UPDATE public.quotes
  SET subtotal = v_subtotal,
      total = GREATEST(v_subtotal - discount, 0),
      updated_at = NOW()
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public._quote_items_after_delete_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_quote_totals(OLD.quote_id);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public._quote_items_set_line_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total := GREATEST((NEW.quantity * NEW.unit_price) - NEW.discount, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._quote_items_after_change_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_quote_totals(COALESCE(NEW.quote_id, OLD.quote_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER quote_items_set_line_total
  BEFORE INSERT OR UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public._quote_items_set_line_total();

CREATE TRIGGER quote_items_recalc_after_change
  AFTER INSERT OR UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public._quote_items_after_change_recalc();

CREATE TRIGGER quote_items_recalc_after_delete
  AFTER DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public._quote_items_after_delete_recalc();

-- ---------------------------------------------------------------------------
-- Alterar status do orçamento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_quote_status(
  p_quote_id UUID,
  p_status TEXT
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_before JSONB;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado'; END IF;
  IF NOT public.can_write_financial(v_quote.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_before := to_jsonb(v_quote);

  UPDATE public.quotes
  SET status = p_status, updated_at = NOW()
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;

  PERFORM public.write_audit_log(
    v_quote.company_id,
    CASE WHEN p_status = 'approved' THEN 'approve' ELSE 'update' END,
    'quotes', p_quote_id, v_before, to_jsonb(v_quote), NULL
  );

  RETURN v_quote;
END;
$$;

-- ---------------------------------------------------------------------------
-- Gerar conta a receber a partir de orçamento aprovado (idempotente)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_receivable_from_quote(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_ar_id UUID;
  v_due DATE;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado'; END IF;
  IF NOT public.can_write_financial(v_quote.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_quote.status <> 'approved' THEN
    RAISE EXCEPTION 'Orçamento precisa estar aprovado para gerar conta a receber';
  END IF;

  PERFORM public.recalculate_quote_totals(p_quote_id);
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

  SELECT id INTO v_ar_id
  FROM public.accounts_receivable
  WHERE quote_id = p_quote_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_ar_id IS NOT NULL THEN
    UPDATE public.quotes SET accounts_receivable_id = v_ar_id WHERE id = p_quote_id;
    RETURN v_ar_id;
  END IF;

  v_due := COALESCE(v_quote.valid_until, CURRENT_DATE + 7);

  INSERT INTO public.accounts_receivable (
    company_id, customer_id, description, amount, issue_date, due_date,
    status, notes, quote_id, created_by
  ) VALUES (
    v_quote.company_id,
    v_quote.customer_id,
    'Orçamento ' || v_quote.number,
    v_quote.total,
    v_quote.issue_date,
    v_due,
    'pending',
    v_quote.notes,
    p_quote_id,
    auth.uid()
  ) RETURNING id INTO v_ar_id;

  UPDATE public.quotes
  SET accounts_receivable_id = v_ar_id, updated_at = NOW()
  WHERE id = p_quote_id;

  PERFORM public.write_audit_log(
    v_quote.company_id, 'create', 'accounts_receivable', v_ar_id,
    NULL, jsonb_build_object('quote_id', p_quote_id, 'amount', v_quote.total), NULL
  );

  RETURN v_ar_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Uso mensal de NFS-e
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_monthly_invoice_usage(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.fiscal_invoices fi
  WHERE fi.company_id = p_workspace_id
    AND fi.status IN ('processing', 'authorized')
    AND fi.issued_at >= date_trunc('month', NOW())
    AND fi.issued_at < date_trunc('month', NOW()) + INTERVAL '1 month';
$$;

CREATE OR REPLACE FUNCTION public.get_invoice_limit(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_feature_limit(p_workspace_id, 'nfse');
$$;

CREATE OR REPLACE FUNCTION public.can_issue_invoice(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  v_enabled := public.can_use_feature(p_workspace_id, 'nfse');
  IF NOT v_enabled THEN RETURN FALSE; END IF;

  v_limit := public.get_feature_limit(p_workspace_id, 'nfse');
  IF v_limit IS NULL THEN RETURN TRUE; END IF;

  v_usage := public.get_monthly_invoice_usage(p_workspace_id);
  RETURN v_usage < v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Solicitar emissão NFS-e (stub — confirmação real via provider/backend)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_fiscal_invoice(
  p_workspace_id UUID,
  p_receivable_id UUID,
  p_service_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.fiscal_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recv public.accounts_receivable%ROWTYPE;
  v_invoice public.fiscal_invoices%ROWTYPE;
  v_settings public.fiscal_settings%ROWTYPE;
  v_key TEXT;
BEGIN
  IF NOT public.can_write_fiscal(p_workspace_id) THEN RAISE EXCEPTION 'Sem permissão fiscal'; END IF;
  IF NOT public.can_issue_invoice(p_workspace_id) THEN
    RAISE EXCEPTION 'Limite de NFS-e do plano atingido';
  END IF;

  v_key := COALESCE(p_idempotency_key, 'nfse_' || p_receivable_id::TEXT);

  SELECT * INTO v_invoice FROM public.fiscal_invoices
  WHERE company_id = p_workspace_id AND idempotency_key = v_key;
  IF FOUND THEN RETURN v_invoice; END IF;

  SELECT * INTO v_recv FROM public.accounts_receivable
  WHERE id = p_receivable_id AND company_id = p_workspace_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;

  SELECT * INTO v_settings FROM public.fiscal_settings WHERE company_id = p_workspace_id;

  INSERT INTO public.fiscal_invoices (
    company_id, customer_id, accounts_receivable_id, quote_id,
    provider, status, service_description, gross_amount, net_amount,
    idempotency_key, created_by
  ) VALUES (
    p_workspace_id, v_recv.customer_id, p_receivable_id, v_recv.quote_id,
    COALESCE(v_settings.provider, 'stub'),
    'processing',
    COALESCE(p_service_description, v_recv.description),
    v_recv.amount,
    v_recv.amount,
    v_key,
    auth.uid()
  ) RETURNING * INTO v_invoice;

  INSERT INTO public.fiscal_invoice_events (company_id, fiscal_invoice_id, event_type, message)
  VALUES (p_workspace_id, v_invoice.id, 'submitted', 'Enviado ao provedor fiscal (stub)');

  PERFORM public.write_audit_log(
    p_workspace_id, 'create', 'fiscal_invoices', v_invoice.id,
    NULL, to_jsonb(v_invoice), NULL
  );

  RETURN v_invoice;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cobrança PIX (stub provider — QR gerado no backend)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pix_charge(
  p_receivable_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.payment_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recv public.accounts_receivable%ROWTYPE;
  v_charge public.payment_charges%ROWTYPE;
  v_key TEXT;
  v_remaining NUMERIC(15, 2);
BEGIN
  SELECT * INTO v_recv FROM public.accounts_receivable
  WHERE id = p_receivable_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;
  IF NOT public.can_write_financial(v_recv.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT public.can_use_feature(v_recv.company_id, 'pix_charges') THEN
    RAISE EXCEPTION 'Cobrança PIX não disponível no plano';
  END IF;
  IF v_recv.status IN ('received', 'cancelled') THEN
    RAISE EXCEPTION 'Conta a receber já quitada ou cancelada';
  END IF;

  v_key := COALESCE(p_idempotency_key, 'pix_' || p_receivable_id::TEXT);

  SELECT * INTO v_charge FROM public.payment_charges
  WHERE company_id = v_recv.company_id AND idempotency_key = v_key;
  IF FOUND THEN RETURN v_charge; END IF;

  SELECT * INTO v_charge FROM public.payment_charges
  WHERE accounts_receivable_id = p_receivable_id AND status = 'pending';
  IF FOUND THEN RETURN v_charge; END IF;

  v_remaining := v_recv.amount - v_recv.received_amount;

  INSERT INTO public.payment_charges (
    company_id, customer_id, accounts_receivable_id,
    provider, provider_charge_id, payment_method, amount, status, due_date,
    pix_copy_paste, idempotency_key
  ) VALUES (
    v_recv.company_id, v_recv.customer_id, p_receivable_id,
    'stub', 'stub_pix_' || gen_random_uuid()::TEXT, 'pix',
    v_remaining, 'pending', v_recv.due_date,
    'PIX-STUB-' || v_recv.company_id::TEXT || '-' || p_receivable_id::TEXT || '-' || v_remaining::TEXT,
    v_key
  ) RETURNING * INTO v_charge;

  PERFORM public.write_audit_log(
    v_recv.company_id, 'create', 'payment_charges', v_charge.id,
    NULL, jsonb_build_object('receivable_id', p_receivable_id), NULL
  );

  RETURN v_charge;
END;
$$;

-- ---------------------------------------------------------------------------
-- Webhook PIX idempotente (chamado por Edge Function / backend)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_pix_payment_webhook(
  p_provider_charge_id TEXT,
  p_webhook_event_id TEXT,
  p_amount NUMERIC(15, 2) DEFAULT NULL,
  p_financial_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.payment_charges%ROWTYPE;
  v_tx_id UUID;
  v_amount NUMERIC(15, 2);
BEGIN
  IF p_webhook_event_id IS NULL OR p_provider_charge_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos';
  END IF;

  SELECT * INTO v_charge FROM public.payment_charges
  WHERE provider_charge_id = p_provider_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança não encontrada'; END IF;

  IF v_charge.webhook_event_id = p_webhook_event_id THEN
    RETURN jsonb_build_object('ok', TRUE, 'duplicate', TRUE, 'charge_id', v_charge.id);
  END IF;

  IF v_charge.status = 'paid' THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_paid', TRUE, 'charge_id', v_charge.id);
  END IF;

  v_amount := COALESCE(p_amount, v_charge.amount);

  IF p_financial_account_id IS NOT NULL AND v_charge.accounts_receivable_id IS NOT NULL THEN
    v_tx_id := public.mark_receivable_received(
      v_charge.accounts_receivable_id, v_amount, p_financial_account_id, CURRENT_DATE
    );
  ELSIF v_charge.accounts_receivable_id IS NOT NULL THEN
    UPDATE public.accounts_receivable
    SET received_amount = amount, status = 'received', received_date = CURRENT_DATE, updated_at = NOW()
    WHERE id = v_charge.accounts_receivable_id;
  END IF;

  UPDATE public.payment_charges
  SET status = 'paid',
      paid_at = NOW(),
      webhook_event_id = p_webhook_event_id,
      updated_at = NOW()
  WHERE id = v_charge.id;

  INSERT INTO public.notifications (company_id, user_id, type, severity, title, message)
  SELECT v_charge.company_id, wm.user_id, 'payment_received', 'success',
    'Pagamento PIX recebido',
    'Cobrança confirmada — R$ ' || v_amount::TEXT
  FROM public.company_users wm
  WHERE wm.company_id = v_charge.company_id
    AND wm.role IN ('owner', 'admin', 'financial')
  LIMIT 5;

  PERFORM public.write_audit_log(
    v_charge.company_id, 'payment', 'payment_charges', v_charge.id,
    NULL, jsonb_build_object('webhook_event_id', p_webhook_event_id, 'transaction_id', v_tx_id), NULL
  );

  RETURN jsonb_build_object(
    'ok', TRUE, 'charge_id', v_charge.id,
    'transaction_id', v_tx_id, 'receivable_id', v_charge.accounts_receivable_id
  );
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.next_quote_number(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_quote_totals(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_quote_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_receivable_from_quote(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_monthly_invoice_usage(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invoice_limit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_issue_invoice(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_fiscal_invoice(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pix_charge(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_pix_payment_webhook(TEXT, TEXT, NUMERIC, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.next_quote_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_quote_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_receivable_from_quote(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_invoice_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_issue_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_fiscal_invoice(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pix_charge(UUID, TEXT) TO authenticated;
-- Webhook: service_role only (Edge Function)
GRANT EXECUTE ON FUNCTION public.process_pix_payment_webhook(TEXT, TEXT, NUMERIC, UUID) TO service_role;

-- patched from 027_payables_module.sql
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
  v_remaining NUMERIC(15, 2);
  v_next_due DATE;
  v_group UUID;
BEGIN
  SELECT * INTO v_payable FROM public.accounts_payable WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada'; END IF;
  IF NOT public.can_write_financial(v_payable.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_payable.status = 'cancelled' THEN RAISE EXCEPTION 'Conta cancelada'; END IF;
  IF v_payable.status = 'paid' OR v_payable.paid_amount >= v_payable.amount THEN
    RAISE EXCEPTION 'Conta já quitada';
  END IF;
  IF p_payment_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  v_remaining := v_payable.amount - v_payable.paid_amount;
  IF p_payment_amount > v_remaining THEN
    RAISE EXCEPTION 'Valor excede saldo em aberto (%)', v_remaining;
  END IF;

  v_new_paid := v_payable.paid_amount + p_payment_amount;
  v_new_status := CASE
    WHEN v_new_paid >= v_payable.amount THEN 'paid'
    WHEN v_new_paid > 0 THEN 'partial'
    ELSE v_payable.status
  END;

  INSERT INTO public.transactions (
    company_id, financial_account_id, supplier_id, category_id, cost_center_id,
    type, description, amount, transaction_date, status,
    source_type, source_id, created_by
  ) VALUES (
    v_payable.company_id, p_financial_account_id, v_payable.supplier_id,
    v_payable.category_id, v_payable.cost_center_id,
    'expense', v_payable.description, p_payment_amount, p_payment_date, 'completed',
    'accounts_payable', v_payable.id, auth.uid()
  ) RETURNING id INTO v_tx_id;

  UPDATE public.accounts_payable
  SET paid_amount = v_new_paid,
      status = v_new_status,
      payment_date = CASE WHEN v_new_status = 'paid' THEN p_payment_date ELSE payment_date END,
      financial_account_id = COALESCE(financial_account_id, p_financial_account_id),
      transaction_id = COALESCE(transaction_id, v_tx_id),
      updated_at = NOW()
  WHERE id = p_payable_id;

  PERFORM public.recalculate_account_balance(p_financial_account_id);
  PERFORM public.write_audit_log(
    v_payable.company_id, 'payment', 'accounts_payable', p_payable_id,
    to_jsonb(v_payable), NULL, jsonb_build_object('transaction_id', v_tx_id)
  );

  IF v_new_status = 'paid' AND v_payable.is_recurring AND v_payable.recurrence_frequency IS NOT NULL THEN
    v_group := COALESCE(v_payable.recurrence_group_id, v_payable.id);
    v_next_due := CASE v_payable.recurrence_frequency
      WHEN 'weekly' THEN v_payable.due_date + INTERVAL '7 days'
      WHEN 'monthly' THEN (v_payable.due_date + INTERVAL '1 month')::DATE
      WHEN 'yearly' THEN (v_payable.due_date + INTERVAL '1 year')::DATE
      ELSE (v_payable.due_date + INTERVAL '1 month')::DATE
    END;

    INSERT INTO public.accounts_payable (
      company_id, supplier_id, category_id, cost_center_id, financial_account_id,
      description, amount, issue_date, due_date, status, notes,
      payment_method, is_recurring, recurrence_frequency, recurrence_group_id, created_by
    ) VALUES (
      v_payable.company_id, v_payable.supplier_id, v_payable.category_id,
      v_payable.cost_center_id, v_payable.financial_account_id,
      v_payable.description, v_payable.amount, CURRENT_DATE, v_next_due, 'pending',
      v_payable.notes, v_payable.payment_method, TRUE, v_payable.recurrence_frequency,
      v_group, auth.uid()
    );
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payable_paid(UUID, NUMERIC, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payable_paid(UUID, NUMERIC, UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cancelar conta a pagar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_payable(p_payable_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payable public.accounts_payable%ROWTYPE;
BEGIN
  SELECT * INTO v_payable FROM public.accounts_payable WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada'; END IF;
  IF NOT public.can_write_financial(v_payable.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_payable.status = 'paid' THEN RAISE EXCEPTION 'Não é possível cancelar conta já paga'; END IF;
  IF v_payable.paid_amount > 0 THEN RAISE EXCEPTION 'Conta com pagamento parcial — estorne antes de cancelar'; END IF;

  UPDATE public.accounts_payable
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_payable_id;

  PERFORM public.write_audit_log(
    v_payable.company_id, 'cancel', 'accounts_payable', p_payable_id,
    to_jsonb(v_payable), NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_payable(UUID) TO authenticated;

-- patched from 029_crm_pipeline.sql
CREATE OR REPLACE FUNCTION public.seed_crm_stages(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_write_financial(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crm_pipeline_stages WHERE company_id = p_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.crm_pipeline_stages (company_id, slug, name, sort_order, is_closed_won, is_closed_lost, color) VALUES
    (p_workspace_id, 'new_lead', 'Novo Lead', 1, FALSE, FALSE, '#6366f1'),
    (p_workspace_id, 'contact_made', 'Contato realizado', 2, FALSE, FALSE, '#818cf8'),
    (p_workspace_id, 'qualified', 'Qualificado', 3, FALSE, FALSE, '#22d3ee'),
    (p_workspace_id, 'meeting', 'Reunião', 4, FALSE, FALSE, '#34d399'),
    (p_workspace_id, 'proposal_sent', 'Proposta enviada', 5, FALSE, FALSE, '#fbbf24'),
    (p_workspace_id, 'negotiation', 'Negociação', 6, FALSE, FALSE, '#f472b6'),
    (p_workspace_id, 'closed_won', 'Fechado', 7, TRUE, FALSE, '#34d399'),
    (p_workspace_id, 'closed_lost', 'Perdido', 8, FALSE, TRUE, '#94a3b8');
END;
$$;

REVOKE ALL ON FUNCTION public.seed_crm_stages(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_crm_stages(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mover oportunidade de etapa (com histórico)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_crm_opportunity_stage(
  p_opportunity_id UUID,
  p_stage_id UUID
)
RETURNS public.crm_opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp public.crm_opportunities%ROWTYPE;
  v_stage public.crm_pipeline_stages%ROWTYPE;
  v_from_stage_id UUID;
  v_from_name TEXT;
  v_to_name TEXT;
BEGIN
  SELECT * INTO v_opp FROM public.crm_opportunities WHERE id = p_opportunity_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oportunidade não encontrada'; END IF;
  IF NOT public.can_write_financial(v_opp.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT * INTO v_stage FROM public.crm_pipeline_stages WHERE id = p_stage_id AND company_id = v_opp.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida'; END IF;

  IF v_opp.stage_id = p_stage_id THEN RETURN v_opp; END IF;

  v_from_stage_id := v_opp.stage_id;
  SELECT name INTO v_from_name FROM public.crm_pipeline_stages WHERE id = v_from_stage_id;
  v_to_name := v_stage.name;

  UPDATE public.crm_opportunities
  SET stage_id = p_stage_id,
      probability = CASE
        WHEN v_stage.is_closed_won THEN 100
        WHEN v_stage.is_closed_lost THEN 0
        ELSE probability
      END,
      closed_at = CASE
        WHEN v_stage.is_closed_won OR v_stage.is_closed_lost THEN NOW()
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = p_opportunity_id
  RETURNING * INTO v_opp;

  INSERT INTO public.crm_opportunity_activities (
    company_id, opportunity_id, activity_type, title, description,
    from_stage_id, to_stage_id, created_by
  ) VALUES (
    v_opp.company_id, p_opportunity_id, 'stage_change',
    'Etapa alterada',
    COALESCE(v_from_name, '—') || ' → ' || v_to_name,
    v_from_stage_id, p_stage_id, auth.uid()
  );

  RETURN v_opp;
END;
$$;

REVOKE ALL ON FUNCTION public.move_crm_opportunity_stage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_crm_opportunity_stage(UUID, UUID) TO authenticated;

-- CRM RLS policies (029) continuam válidas após rename de coluna company_id.

