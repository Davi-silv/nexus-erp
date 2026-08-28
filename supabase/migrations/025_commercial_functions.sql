-- Nexus 3.0 — RPCs comerciais: orçamentos, AR, PIX, NFS-e

-- ---------------------------------------------------------------------------
-- Número sequencial de orçamento por workspace
-- ---------------------------------------------------------------------------

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
  WHERE workspace_id = p_workspace_id;

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
  IF NOT public.can_write_financial(v_quote.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

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
  IF NOT public.can_write_financial(v_quote.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_before := to_jsonb(v_quote);

  UPDATE public.quotes
  SET status = p_status, updated_at = NOW()
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;

  PERFORM public.write_audit_log(
    v_quote.workspace_id,
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
  IF NOT public.can_write_financial(v_quote.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
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
    workspace_id, customer_id, description, amount, issue_date, due_date,
    status, notes, quote_id, created_by
  ) VALUES (
    v_quote.workspace_id,
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
    v_quote.workspace_id, 'create', 'accounts_receivable', v_ar_id,
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
  WHERE fi.workspace_id = p_workspace_id
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
  WHERE workspace_id = p_workspace_id AND idempotency_key = v_key;
  IF FOUND THEN RETURN v_invoice; END IF;

  SELECT * INTO v_recv FROM public.accounts_receivable
  WHERE id = p_receivable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;

  SELECT * INTO v_settings FROM public.fiscal_settings WHERE workspace_id = p_workspace_id;

  INSERT INTO public.fiscal_invoices (
    workspace_id, customer_id, accounts_receivable_id, quote_id,
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

  INSERT INTO public.fiscal_invoice_events (workspace_id, fiscal_invoice_id, event_type, message)
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
  IF NOT public.can_write_financial(v_recv.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT public.can_use_feature(v_recv.workspace_id, 'pix_charges') THEN
    RAISE EXCEPTION 'Cobrança PIX não disponível no plano';
  END IF;
  IF v_recv.status IN ('received', 'cancelled') THEN
    RAISE EXCEPTION 'Conta a receber já quitada ou cancelada';
  END IF;

  v_key := COALESCE(p_idempotency_key, 'pix_' || p_receivable_id::TEXT);

  SELECT * INTO v_charge FROM public.payment_charges
  WHERE workspace_id = v_recv.workspace_id AND idempotency_key = v_key;
  IF FOUND THEN RETURN v_charge; END IF;

  SELECT * INTO v_charge FROM public.payment_charges
  WHERE accounts_receivable_id = p_receivable_id AND status = 'pending';
  IF FOUND THEN RETURN v_charge; END IF;

  v_remaining := v_recv.amount - v_recv.received_amount;

  INSERT INTO public.payment_charges (
    workspace_id, customer_id, accounts_receivable_id,
    provider, provider_charge_id, payment_method, amount, status, due_date,
    pix_copy_paste, idempotency_key
  ) VALUES (
    v_recv.workspace_id, v_recv.customer_id, p_receivable_id,
    'stub', 'stub_pix_' || gen_random_uuid()::TEXT, 'pix',
    v_remaining, 'pending', v_recv.due_date,
    'PIX-STUB-' || v_recv.workspace_id::TEXT || '-' || p_receivable_id::TEXT || '-' || v_remaining::TEXT,
    v_key
  ) RETURNING * INTO v_charge;

  PERFORM public.write_audit_log(
    v_recv.workspace_id, 'create', 'payment_charges', v_charge.id,
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

  INSERT INTO public.notifications (workspace_id, user_id, type, severity, title, message)
  SELECT v_charge.workspace_id, wm.user_id, 'payment_received', 'success',
    'Pagamento PIX recebido',
    'Cobrança confirmada — R$ ' || v_amount::TEXT
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_charge.workspace_id
    AND wm.role IN ('owner', 'admin', 'financial')
  LIMIT 5;

  PERFORM public.write_audit_log(
    v_charge.workspace_id, 'payment', 'payment_charges', v_charge.id,
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
