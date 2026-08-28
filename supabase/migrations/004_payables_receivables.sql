-- Nexus 3.0 — Contas a pagar e receber

CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers (id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  financial_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  issue_date DATE,
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  transaction_id UUID REFERENCES public.transactions (id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_payable_status_check CHECK (
    status IN ('pending', 'paid', 'overdue', 'partial', 'cancelled')
  ),
  CONSTRAINT accounts_payable_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT accounts_payable_paid_nonneg CHECK (paid_amount >= 0),
  CONSTRAINT accounts_payable_paid_lte_amount CHECK (paid_amount <= amount)
);

CREATE INDEX idx_accounts_payable_workspace ON public.accounts_payable (workspace_id);
CREATE INDEX idx_accounts_payable_supplier ON public.accounts_payable (supplier_id);
CREATE INDEX idx_accounts_payable_due_date ON public.accounts_payable (due_date);
CREATE INDEX idx_accounts_payable_status ON public.accounts_payable (status);
CREATE INDEX idx_accounts_payable_workspace_due_status
  ON public.accounts_payable (workspace_id, due_date, status);

CREATE TRIGGER accounts_payable_set_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  financial_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  received_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  issue_date DATE,
  due_date DATE NOT NULL,
  received_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  transaction_id UUID REFERENCES public.transactions (id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_receivable_status_check CHECK (
    status IN ('pending', 'received', 'overdue', 'partial', 'cancelled')
  ),
  CONSTRAINT accounts_receivable_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT accounts_receivable_received_nonneg CHECK (received_amount >= 0),
  CONSTRAINT accounts_receivable_received_lte_amount CHECK (received_amount <= amount)
);

CREATE INDEX idx_accounts_receivable_workspace ON public.accounts_receivable (workspace_id);
CREATE INDEX idx_accounts_receivable_customer ON public.accounts_receivable (customer_id);
CREATE INDEX idx_accounts_receivable_due_date ON public.accounts_receivable (due_date);
CREATE INDEX idx_accounts_receivable_status ON public.accounts_receivable (status);
CREATE INDEX idx_accounts_receivable_workspace_due_status
  ON public.accounts_receivable (workspace_id, due_date, status);

CREATE TRIGGER accounts_receivable_set_updated_at
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Status "overdue" calculado dinamicamente — ver effective_payable_status()

CREATE OR REPLACE FUNCTION public.effective_payable_status(
  p_due_date DATE,
  p_status TEXT,
  p_paid_amount NUMERIC,
  p_amount NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('paid', 'cancelled') THEN p_status
    WHEN p_paid_amount > 0 AND p_paid_amount < p_amount THEN 'partial'
    WHEN p_due_date < CURRENT_DATE AND p_paid_amount < p_amount THEN 'overdue'
    ELSE p_status
  END;
$$;

CREATE OR REPLACE FUNCTION public.effective_receivable_status(
  p_due_date DATE,
  p_status TEXT,
  p_received_amount NUMERIC,
  p_amount NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('received', 'cancelled') THEN p_status
    WHEN p_received_amount > 0 AND p_received_amount < p_amount THEN 'partial'
    WHEN p_due_date < CURRENT_DATE AND p_received_amount < p_amount THEN 'overdue'
    ELSE p_status
  END;
$$;

COMMENT ON FUNCTION public.effective_payable_status IS
  'Evita cron para overdue — calcular em queries/views.';
