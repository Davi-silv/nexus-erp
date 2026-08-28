-- Nexus 3.0 — Índices adicionais (consultas analíticas)

CREATE INDEX IF NOT EXISTS idx_transactions_workspace_type_date
  ON public.transactions (workspace_id, type, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_workspace_status
  ON public.transactions (workspace_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_open
  ON public.accounts_payable (workspace_id, due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('paid', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_open
  ON public.accounts_receivable (workspace_id, due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('received', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_active
  ON public.workspace_members (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

COMMENT ON INDEX idx_transactions_workspace_type_date IS
  'DRE e fluxo de caixa mensal por tipo.';
