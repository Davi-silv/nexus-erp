-- Nexus 3.0 — Billing: extensão de planos, assinaturas e eventos

-- ---------------------------------------------------------------------------
-- plans: colunas comerciais
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS recommended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.plans.recommended IS 'Badge "MAIS ESCOLHIDO" na UI (ex.: Nexus Pro).';

-- ---------------------------------------------------------------------------
-- subscriptions: cancelamento e status ampliado
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE public.subscriptions SET status = 'trialing' WHERE status = 'trial';

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (
  status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'incomplete')
);

DROP INDEX IF EXISTS public.idx_subscriptions_workspace_active_unique;
CREATE UNIQUE INDEX idx_subscriptions_workspace_active_unique
  ON public.subscriptions (workspace_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'incomplete');

-- ---------------------------------------------------------------------------
-- subscription_events — histórico para métricas (MRR, churn, conversão)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  old_plan_id UUID REFERENCES public.plans (id) ON DELETE SET NULL,
  new_plan_id UUID REFERENCES public.plans (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_workspace
  ON public.subscription_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type
  ON public.subscription_events (event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription
  ON public.subscription_events (subscription_id);

COMMENT ON TABLE public.subscription_events IS
  'Auditoria de ciclo de vida: trial, upgrade, downgrade, pagamentos. Sem dados de cartão.';

-- RLS
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_events_select ON public.subscription_events
  FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));

-- Inserções apenas via funções SECURITY DEFINER (sem policy INSERT para authenticated)
