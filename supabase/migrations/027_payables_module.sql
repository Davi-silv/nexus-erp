-- Nexus ERP — Contas a Pagar: campos extras, anexos e RPCs

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;

ALTER TABLE public.accounts_payable
  DROP CONSTRAINT IF EXISTS accounts_payable_payment_method_check;

ALTER TABLE public.accounts_payable
  ADD CONSTRAINT accounts_payable_payment_method_check CHECK (
    payment_method IS NULL OR payment_method IN (
      'pix', 'boleto', 'transfer', 'cash', 'card', 'debit', 'other'
    )
  );

ALTER TABLE public.accounts_payable
  DROP CONSTRAINT IF EXISTS accounts_payable_recurrence_frequency_check;

ALTER TABLE public.accounts_payable
  ADD CONSTRAINT accounts_payable_recurrence_frequency_check CHECK (
    recurrence_frequency IS NULL OR recurrence_frequency IN ('weekly', 'monthly', 'yearly')
  );

CREATE INDEX IF NOT EXISTS idx_accounts_payable_recurrence_group
  ON public.accounts_payable (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- Bucket para comprovantes (privado por workspace)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payable-attachments',
  'payable-attachments',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS payable_attachments_select ON storage.objects;
DROP POLICY IF EXISTS payable_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS payable_attachments_delete ON storage.objects;

CREATE POLICY payable_attachments_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payable-attachments'
    AND public.can_read_workspace((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY payable_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY payable_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  );

-- ---------------------------------------------------------------------------
-- Marcar como pago (atualizado — evita duplicidade e gera recorrência)
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
  v_remaining NUMERIC(15, 2);
  v_next_due DATE;
  v_group UUID;
BEGIN
  SELECT * INTO v_payable FROM public.accounts_payable WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada'; END IF;
  IF NOT public.can_write_financial(v_payable.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
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
      financial_account_id = COALESCE(financial_account_id, p_financial_account_id),
      transaction_id = COALESCE(transaction_id, v_tx_id),
      updated_at = NOW()
  WHERE id = p_payable_id;

  PERFORM public.recalculate_account_balance(p_financial_account_id);
  PERFORM public.write_audit_log(
    v_payable.workspace_id, 'payment', 'accounts_payable', p_payable_id,
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
      workspace_id, supplier_id, category_id, cost_center_id, financial_account_id,
      description, amount, issue_date, due_date, status, notes,
      payment_method, is_recurring, recurrence_frequency, recurrence_group_id, created_by
    ) VALUES (
      v_payable.workspace_id, v_payable.supplier_id, v_payable.category_id,
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
  IF NOT public.can_write_financial(v_payable.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_payable.status = 'paid' THEN RAISE EXCEPTION 'Não é possível cancelar conta já paga'; END IF;
  IF v_payable.paid_amount > 0 THEN RAISE EXCEPTION 'Conta com pagamento parcial — estorne antes de cancelar'; END IF;

  UPDATE public.accounts_payable
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_payable_id;

  PERFORM public.write_audit_log(
    v_payable.workspace_id, 'cancel', 'accounts_payable', p_payable_id,
    to_jsonb(v_payable), NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_payable(UUID) TO authenticated;
