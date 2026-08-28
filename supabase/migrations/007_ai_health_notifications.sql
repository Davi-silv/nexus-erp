-- Nexus 3.0 — IA, saúde financeira, notificações
-- v2: healthHistory[]→financial_health_scores, ai config local

CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  model TEXT,
  request_type TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(15, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_usage_tokens_nonneg CHECK (input_tokens >= 0 AND output_tokens >= 0),
  CONSTRAINT ai_usage_cost_nonneg CHECK (estimated_cost >= 0)
);

CREATE INDEX idx_ai_usage_workspace ON public.ai_usage (workspace_id);
CREATE INDEX idx_ai_usage_user ON public.ai_usage (user_id);
CREATE INDEX idx_ai_usage_created_at ON public.ai_usage (created_at);
CREATE INDEX idx_ai_usage_workspace_created ON public.ai_usage (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE public.financial_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  liquidity_score INTEGER,
  margin_score INTEGER,
  cashflow_score INTEGER,
  debt_score INTEGER,
  default_score INTEGER,
  reserve_score INTEGER,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_health_score_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_liquidity_range CHECK (liquidity_score IS NULL OR liquidity_score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_margin_range CHECK (margin_score IS NULL OR margin_score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_cashflow_range CHECK (cashflow_score IS NULL OR cashflow_score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_debt_range CHECK (debt_score IS NULL OR debt_score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_default_range CHECK (default_score IS NULL OR default_score BETWEEN 0 AND 100),
  CONSTRAINT financial_health_reserve_range CHECK (reserve_score IS NULL OR reserve_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_financial_health_workspace ON public.financial_health_scores (workspace_id);
CREATE INDEX idx_financial_health_calculated ON public.financial_health_scores (workspace_id, calculated_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id UUID,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_severity_check CHECK (
    severity IN ('info', 'success', 'warning', 'critical')
  )
);

CREATE INDEX idx_notifications_workspace ON public.notifications (workspace_id);
CREATE INDEX idx_notifications_user ON public.notifications (user_id);
CREATE INDEX idx_notifications_read ON public.notifications (user_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created_at ON public.notifications (created_at DESC);
