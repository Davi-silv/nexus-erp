-- Nexus 3.0 — Catálogo de serviços (prestadores)

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  fiscal_description TEXT,
  default_price NUMERIC(15, 2),
  service_code TEXT,
  tax_code TEXT,
  tax_rate NUMERIC(8, 4),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT services_default_price_nonneg CHECK (
    default_price IS NULL OR default_price >= 0
  )
);

CREATE INDEX idx_services_workspace ON public.services (workspace_id);
CREATE INDEX idx_services_workspace_active ON public.services (workspace_id, active)
  WHERE deleted_at IS NULL;

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.services IS 'Catálogo de serviços vendidos pelo workspace (prestadores).';
