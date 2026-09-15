-- Nexus ERP — CRM com pipeline de vendas

CREATE TABLE public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_closed_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed_lost BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_stages_slug_check CHECK (slug ~ '^[a-z0-9_]+$'),
  CONSTRAINT crm_stages_unique_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_crm_stages_workspace ON public.crm_pipeline_stages (workspace_id, sort_order);

CREATE TRIGGER crm_stages_set_updated_at
  BEFORE UPDATE ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages (id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  owner_name TEXT,
  estimated_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
  lead_source TEXT,
  probability INTEGER NOT NULL DEFAULT 10,
  expected_close_date DATE,
  notes TEXT,
  next_activity TEXT,
  next_activity_at DATE,
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_opportunities_value_nonneg CHECK (estimated_value >= 0),
  CONSTRAINT crm_opportunities_probability_range CHECK (probability BETWEEN 0 AND 100)
);

CREATE INDEX idx_crm_opportunities_workspace ON public.crm_opportunities (workspace_id);
CREATE INDEX idx_crm_opportunities_stage ON public.crm_opportunities (stage_id);
CREATE INDEX idx_crm_opportunities_customer ON public.crm_opportunities (customer_id);
CREATE INDEX idx_crm_opportunities_close_date ON public.crm_opportunities (expected_close_date);

CREATE TRIGGER crm_opportunities_set_updated_at
  BEFORE UPDATE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.crm_opportunity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities (id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  from_stage_id UUID REFERENCES public.crm_pipeline_stages (id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.crm_pipeline_stages (id) ON DELETE SET NULL,
  metadata JSONB,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_activities_type_check CHECK (
    activity_type IN ('stage_change', 'call', 'meeting', 'whatsapp', 'email', 'note')
  )
);

CREATE INDEX idx_crm_activities_opportunity ON public.crm_opportunity_activities (opportunity_id, created_at DESC);

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS crm_opportunity_id UUID REFERENCES public.crm_opportunities (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Seed etapas padrão por workspace
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_crm_stages(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_write_financial(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crm_pipeline_stages WHERE workspace_id = p_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.crm_pipeline_stages (workspace_id, slug, name, sort_order, is_closed_won, is_closed_lost, color) VALUES
    (p_workspace_id, 'new_lead', 'Novo Lead', 1, FALSE, FALSE, '#6366f1'),
    (p_workspace_id, 'contact_made', 'Contato realizado', 2, FALSE, FALSE, '#818cf8'),
    (p_workspace_id, 'qualified', 'Qualificado', 3, FALSE, FALSE, '#22d3ee'),
    (p_workspace_id, 'meeting', 'Reunião', 4, FALSE, FALSE, '#34d399'),
    (p_workspace_id, 'proposal_sent', 'Proposta enviada', 5, FALSE, FALSE, '#fbbf24'),
    (p_workspace_id, 'negotiation', 'Negociação', 6, FALSE, FALSE, '#f472b6'),
    (p_workspace_id, 'closed_won', 'Fechado', 7, TRUE, FALSE, '#34d399'),
    (p_workspace_id, 'closed_lost', 'Perdido', 8, FALSE, TRUE, '#94a3b8');
END;
$$;

REVOKE ALL ON FUNCTION public.seed_crm_stages(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_crm_stages(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mover oportunidade de etapa (com histórico)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_crm_opportunity_stage(
  p_opportunity_id UUID,
  p_stage_id UUID
)
RETURNS public.crm_opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp public.crm_opportunities%ROWTYPE;
  v_stage public.crm_pipeline_stages%ROWTYPE;
  v_from_stage_id UUID;
  v_from_name TEXT;
  v_to_name TEXT;
BEGIN
  SELECT * INTO v_opp FROM public.crm_opportunities WHERE id = p_opportunity_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oportunidade não encontrada'; END IF;
  IF NOT public.can_write_financial(v_opp.workspace_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT * INTO v_stage FROM public.crm_pipeline_stages WHERE id = p_stage_id AND workspace_id = v_opp.workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida'; END IF;

  IF v_opp.stage_id = p_stage_id THEN RETURN v_opp; END IF;

  v_from_stage_id := v_opp.stage_id;
  SELECT name INTO v_from_name FROM public.crm_pipeline_stages WHERE id = v_from_stage_id;
  v_to_name := v_stage.name;

  UPDATE public.crm_opportunities
  SET stage_id = p_stage_id,
      probability = CASE
        WHEN v_stage.is_closed_won THEN 100
        WHEN v_stage.is_closed_lost THEN 0
        ELSE probability
      END,
      closed_at = CASE
        WHEN v_stage.is_closed_won OR v_stage.is_closed_lost THEN NOW()
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = p_opportunity_id
  RETURNING * INTO v_opp;

  INSERT INTO public.crm_opportunity_activities (
    workspace_id, opportunity_id, activity_type, title, description,
    from_stage_id, to_stage_id, created_by
  ) VALUES (
    v_opp.workspace_id, p_opportunity_id, 'stage_change',
    'Etapa alterada',
    COALESCE(v_from_name, '—') || ' → ' || v_to_name,
    v_from_stage_id, p_stage_id, auth.uid()
  );

  RETURN v_opp;
END;
$$;

REVOKE ALL ON FUNCTION public.move_crm_opportunity_stage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_crm_opportunity_stage(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_stages_select ON public.crm_pipeline_stages FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY crm_stages_write ON public.crm_pipeline_stages FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_opportunities_select ON public.crm_opportunities FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY crm_opportunities_write ON public.crm_opportunities FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

ALTER TABLE public.crm_opportunity_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_activities_select ON public.crm_opportunity_activities FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY crm_activities_insert ON public.crm_opportunity_activities FOR INSERT TO authenticated
  WITH CHECK (public.can_write_financial(workspace_id));

-- Feature CRM nos planos Start+
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, 'crm', TRUE, NULL
FROM public.plans p
WHERE p.slug IN ('start', 'pro', 'business')
ON CONFLICT (plan_id, feature) DO NOTHING;
