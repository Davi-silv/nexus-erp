-- Nexus 3.0 — Cartões, transações de cartão, recorrências
-- v2: charges[]→credit_card_transactions, recurring[]→recurring_transactions

CREATE TABLE public.credit_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards (id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  purchase_date DATE NOT NULL,
  installment_number INTEGER NOT NULL DEFAULT 1,
  installments_total INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_card_tx_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT credit_card_tx_installment_number CHECK (installment_number >= 1),
  CONSTRAINT credit_card_tx_installments_total CHECK (installments_total >= 1),
  CONSTRAINT credit_card_tx_installment_order CHECK (installment_number <= installments_total)
);

CREATE INDEX idx_credit_card_tx_workspace ON public.credit_card_transactions (workspace_id);
CREATE INDEX idx_credit_card_tx_card ON public.credit_card_transactions (credit_card_id);
CREATE INDEX idx_credit_card_tx_purchase_date ON public.credit_card_transactions (purchase_date);

CREATE TRIGGER credit_card_transactions_set_updated_at
  BEFORE UPDATE ON public.credit_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  financial_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  next_execution DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_transactions_type_check CHECK (type IN ('income', 'expense')),
  CONSTRAINT recurring_transactions_frequency_check CHECK (
    frequency IN ('daily', 'weekly', 'monthly', 'yearly')
  ),
  CONSTRAINT recurring_transactions_amount_nonneg CHECK (amount >= 0)
);

CREATE INDEX idx_recurring_transactions_workspace ON public.recurring_transactions (workspace_id);
CREATE INDEX idx_recurring_transactions_next_execution ON public.recurring_transactions (next_execution)
  WHERE active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_recurring_transactions_active ON public.recurring_transactions (workspace_id, active);

CREATE TRIGGER recurring_transactions_set_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.recurring_transactions IS
  'Execução via cron/Edge Function — nunca gerar lançamentos só no frontend.';
