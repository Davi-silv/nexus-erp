-- Nexus 3.0 — Estrutura financeira base
-- v2: accounts→financial_accounts, categories, costCenters, cards→credit_cards

CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  type TEXT NOT NULL,
  initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_accounts_type_check CHECK (
    type IN ('checking', 'savings', 'cash', 'investment', 'digital_wallet', 'other')
  )
);

CREATE INDEX idx_financial_accounts_workspace_id ON public.financial_accounts (workspace_id);
CREATE INDEX idx_financial_accounts_workspace_active ON public.financial_accounts (workspace_id, active)
  WHERE deleted_at IS NULL;

CREATE TRIGGER financial_accounts_set_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  limit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_cards_closing_day_check CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
  CONSTRAINT credit_cards_due_day_check CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  CONSTRAINT credit_cards_limit_nonneg CHECK (limit_amount >= 0)
);

CREATE INDEX idx_credit_cards_workspace_id ON public.credit_cards (workspace_id);

CREATE TRIGGER credit_cards_set_updated_at
  BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  color TEXT,
  dre_group TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_type_check CHECK (type IN ('income', 'expense')),
  CONSTRAINT categories_dre_group_check CHECK (
    dre_group IS NULL OR dre_group IN (
      'gross_revenue', 'deduction', 'cost', 'operating_expense',
      'financial_income', 'financial_expense', 'tax', 'other'
    )
  )
);

CREATE INDEX idx_categories_workspace_id ON public.categories (workspace_id);
CREATE INDEX idx_categories_parent_id ON public.categories (parent_id);
CREATE INDEX idx_categories_workspace_type ON public.categories (workspace_id, type);

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.categories.color IS 'Compat v2: categorias tinham cor hex no localStorage.';
COMMENT ON COLUMN public.categories.dre_group IS 'Classificação DRE derivada — não usar tabela DRE fixa.';

-- Metas orçamentárias (v2: goals[] com categoryId + limit)
CREATE TABLE public.category_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  monthly_limit NUMERIC(15, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT category_budgets_limit_positive CHECK (monthly_limit >= 0),
  CONSTRAINT category_budgets_unique_category UNIQUE (workspace_id, category_id)
);

CREATE INDEX idx_category_budgets_workspace ON public.category_budgets (workspace_id);

CREATE TRIGGER category_budgets_set_updated_at
  BEFORE UPDATE ON public.category_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_centers_workspace_id ON public.cost_centers (workspace_id);

CREATE TRIGGER cost_centers_set_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transações (v2: txs[] — credit→income, debit→expense)
-- ---------------------------------------------------------------------------

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  financial_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  customer_id UUID,
  supplier_id UUID,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  transaction_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  source_type TEXT,
  source_id UUID,
  transfer_from_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  transfer_to_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense', 'transfer')),
  CONSTRAINT transactions_status_check CHECK (status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT transactions_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT transactions_transfer_accounts_check CHECK (
    type <> 'transfer'
    OR (transfer_from_account_id IS NOT NULL AND transfer_to_account_id IS NOT NULL
        AND transfer_from_account_id <> transfer_to_account_id)
  )
);

CREATE INDEX idx_transactions_workspace_id ON public.transactions (workspace_id);
CREATE INDEX idx_transactions_transaction_date ON public.transactions (transaction_date);
CREATE INDEX idx_transactions_workspace_date ON public.transactions (workspace_id, transaction_date DESC);
CREATE INDEX idx_transactions_financial_account ON public.transactions (financial_account_id);
CREATE INDEX idx_transactions_category ON public.transactions (category_id);
CREATE INDEX idx_transactions_cost_center ON public.transactions (cost_center_id);
CREATE INDEX idx_transactions_not_deleted ON public.transactions (workspace_id, transaction_date)
  WHERE deleted_at IS NULL;

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.transactions.transfer_from_account_id IS
  'Transferências não entram como receita/despesa no DRE.';
