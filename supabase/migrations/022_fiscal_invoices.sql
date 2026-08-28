-- Nexus 3.0 — NFS-e e eventos fiscais

CREATE TABLE public.fiscal_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable (id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL,
  provider TEXT,
  external_id TEXT,
  invoice_type TEXT NOT NULL DEFAULT 'nfse',
  number TEXT,
  verification_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  service_description TEXT,
  service_code TEXT,
  gross_amount NUMERIC(15, 2),
  deduction_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(15, 2),
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  pdf_url TEXT,
  xml_url TEXT,
  rejection_code TEXT,
  rejection_message TEXT,
  idempotency_key TEXT,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fiscal_invoices_status_check CHECK (
    status IN ('draft', 'processing', 'authorized', 'rejected', 'cancelled')
  ),
  CONSTRAINT fiscal_invoices_type_check CHECK (invoice_type IN ('nfse'))
);

CREATE UNIQUE INDEX idx_fiscal_invoices_idempotency
  ON public.fiscal_invoices (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_fiscal_invoices_workspace ON public.fiscal_invoices (workspace_id);
CREATE INDEX idx_fiscal_invoices_status ON public.fiscal_invoices (workspace_id, status);
CREATE INDEX idx_fiscal_invoices_customer ON public.fiscal_invoices (customer_id);
CREATE INDEX idx_fiscal_invoices_receivable ON public.fiscal_invoices (accounts_receivable_id);
CREATE INDEX idx_fiscal_invoices_issued ON public.fiscal_invoices (workspace_id, issued_at);

CREATE TRIGGER fiscal_invoices_set_updated_at
  BEFORE UPDATE ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.fiscal_invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  fiscal_invoice_id UUID NOT NULL REFERENCES public.fiscal_invoices (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fiscal_invoice_events_type_check CHECK (
    event_type IN (
      'created', 'submitted', 'processing', 'authorized',
      'rejected', 'cancelled', 'downloaded'
    )
  )
);

CREATE INDEX idx_fiscal_invoice_events_invoice ON public.fiscal_invoice_events (fiscal_invoice_id);
CREATE INDEX idx_fiscal_invoice_events_workspace ON public.fiscal_invoice_events (workspace_id);

COMMENT ON COLUMN public.fiscal_invoice_events.provider_payload IS
  'Payload sanitizado — nunca armazenar tokens, certificados ou segredos.';
