-- Nexus 3.0 — Cobranças PIX (e futuros métodos)

CREATE TABLE public.payment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable (id) ON DELETE SET NULL,
  provider TEXT,
  provider_charge_id TEXT,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  amount NUMERIC(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  pix_copy_paste TEXT,
  pix_qr_code_url TEXT,
  webhook_event_id TEXT,
  paid_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_charges_status_check CHECK (
    status IN ('pending', 'paid', 'expired', 'cancelled', 'failed')
  ),
  CONSTRAINT payment_charges_method_check CHECK (
    payment_method IN ('pix', 'boleto', 'credit_card')
  ),
  CONSTRAINT payment_charges_amount_nonneg CHECK (amount >= 0)
);

CREATE UNIQUE INDEX idx_payment_charges_provider_id
  ON public.payment_charges (provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

CREATE UNIQUE INDEX idx_payment_charges_idempotency
  ON public.payment_charges (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX idx_payment_charges_receivable_active
  ON public.payment_charges (accounts_receivable_id)
  WHERE accounts_receivable_id IS NOT NULL AND status = 'pending';

CREATE INDEX idx_payment_charges_workspace ON public.payment_charges (workspace_id);
CREATE INDEX idx_payment_charges_status ON public.payment_charges (workspace_id, status);

CREATE TRIGGER payment_charges_set_updated_at
  BEFORE UPDATE ON public.payment_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.payment_charges IS
  'Cobranças geradas via gateway (PIX). Confirmação via webhook idempotente no backend.';
