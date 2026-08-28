-- Nexus 3.0 — Orçamentos comerciais

CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  accounts_receivable_id UUID,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotes_status_check CHECK (
    status IN ('draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'cancelled')
  ),
  CONSTRAINT quotes_amounts_nonneg CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0),
  CONSTRAINT quotes_unique_number UNIQUE (workspace_id, number)
);

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_items_qty_positive CHECK (quantity > 0),
  CONSTRAINT quote_items_amounts_nonneg CHECK (
    unit_price >= 0 AND discount >= 0 AND total >= 0
  )
);

CREATE INDEX idx_quotes_workspace ON public.quotes (workspace_id);
CREATE INDEX idx_quotes_customer ON public.quotes (customer_id);
CREATE INDEX idx_quotes_status ON public.quotes (workspace_id, status);
CREATE INDEX idx_quote_items_quote ON public.quote_items (quote_id);
CREATE INDEX idx_quote_items_workspace ON public.quote_items (workspace_id);

CREATE TRIGGER quotes_set_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Vínculo orçamento ↔ conta a receber (idempotência via quote_id em AR)
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_accounts_receivable_quote_unique
  ON public.accounts_receivable (quote_id)
  WHERE quote_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_accounts_receivable_quote ON public.accounts_receivable (quote_id);

COMMENT ON COLUMN public.quotes.accounts_receivable_id IS
  'Vínculo denormalizado — preenchido pela RPC generate_receivable_from_quote.';
