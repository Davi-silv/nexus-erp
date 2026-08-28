-- Nexus 3.0 — Auditoria e importação bancária
-- v2: conciliação CSV → bank_imports + bank_import_items

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_action_check CHECK (
    action IN (
      'create', 'update', 'delete', 'payment', 'receipt',
      'import', 'login_sensitive_action', 'permission_change'
    )
  )
);

CREATE INDEX idx_audit_logs_workspace ON public.audit_logs (workspace_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (workspace_id, created_at DESC);

COMMENT ON TABLE public.audit_logs IS
  'Nunca armazenar senhas, tokens, API keys ou dados completos de cartão.';

-- ---------------------------------------------------------------------------

CREATE TABLE public.bank_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  financial_account_id UUID REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  file_name TEXT,
  file_type TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  ignored_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_imports_workspace ON public.bank_imports (workspace_id);
CREATE INDEX idx_bank_imports_account ON public.bank_imports (financial_account_id);
CREATE INDEX idx_bank_imports_created_at ON public.bank_imports (created_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE public.bank_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_import_id UUID NOT NULL REFERENCES public.bank_imports (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  external_reference TEXT,
  description TEXT,
  amount NUMERIC(15, 2),
  transaction_date DATE,
  status TEXT,
  matched_transaction_id UUID REFERENCES public.transactions (id) ON DELETE SET NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_import_items_import ON public.bank_import_items (bank_import_id);
CREATE INDEX idx_bank_import_items_workspace ON public.bank_import_items (workspace_id);
CREATE INDEX idx_bank_import_items_matched ON public.bank_import_items (matched_transaction_id);

COMMENT ON COLUMN public.bank_import_items.raw_data IS
  'Payload bruto da importação — colunas principais ficam tipadas acima.';
