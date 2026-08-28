-- Nexus 3.0 — Configurações fiscais do workspace (sem segredos em texto aberto)

CREATE TABLE public.fiscal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces (id) ON DELETE CASCADE,
  legal_name TEXT,
  trade_name TEXT,
  document TEXT,
  municipal_registration TEXT,
  state_registration TEXT,
  tax_regime TEXT,
  city_code TEXT,
  city_name TEXT,
  state TEXT,
  postal_code TEXT,
  address TEXT,
  address_number TEXT,
  address_complement TEXT,
  neighborhood TEXT,
  fiscal_email TEXT,
  certificate_type TEXT,
  provider TEXT,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fiscal_settings_workspace ON public.fiscal_settings (workspace_id);

CREATE TRIGGER fiscal_settings_set_updated_at
  BEFORE UPDATE ON public.fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fiscal_settings IS
  'Dados fiscais públicos do emissor. Certificados e API secrets ficam no backend/secret manager.';
