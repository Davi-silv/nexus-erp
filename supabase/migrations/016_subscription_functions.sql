-- Nexus 3.0 — Funções centrais de assinatura, trial 30 dias e feature gating

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._plan_id_by_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.plans WHERE slug = p_slug AND active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._write_subscription_event(
  p_workspace_id UUID,
  p_subscription_id UUID,
  p_event_type TEXT,
  p_old_plan_id UUID DEFAULT NULL,
  p_new_plan_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscription_events (
    workspace_id, subscription_id, event_type, old_plan_id, new_plan_id, metadata
  ) VALUES (
    p_workspace_id, p_subscription_id, p_event_type, p_old_plan_id, p_new_plan_id, p_metadata
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Sincronizar status (expirar trial sem apagar dados)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_subscription_status(p_workspace_id UUID)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE workspace_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at <= NOW()
     AND v_sub.status NOT IN ('active', 'past_due') THEN
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;

    PERFORM public._write_subscription_event(
      p_workspace_id, v_sub.id, 'trial_expired', v_sub.plan_id, v_sub.plan_id,
      jsonb_build_object('trial_ends_at', v_sub.trial_ends_at)
    );
  END IF;

  IF v_sub.status = 'active'
     AND v_sub.cancel_at_period_end = TRUE
     AND v_sub.current_period_end IS NOT NULL
     AND v_sub.current_period_end <= NOW() THEN
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;

    PERFORM public._write_subscription_event(
      p_workspace_id, v_sub.id, 'cancelled', v_sub.plan_id, v_sub.plan_id, '{}'
    );
  END IF;

  RETURN v_sub;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trial de 30 dias (Pro) — uma vez por workspace
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_workspace_trial(p_workspace_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_id UUID;
  v_sub_id UUID;
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE workspace_id = p_workspace_id) THEN
    RETURN NULL;
  END IF;

  v_pro_id := public._plan_id_by_slug('pro');
  IF v_pro_id IS NULL THEN
    RAISE EXCEPTION 'Plano Pro não encontrado';
  END IF;

  INSERT INTO public.subscriptions (
    workspace_id, plan_id, status,
    trial_started_at, trial_ends_at
  ) VALUES (
    p_workspace_id, v_pro_id, 'trialing',
    NOW(), NOW() + INTERVAL '30 days'
  ) RETURNING id INTO v_sub_id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub_id, 'trial_started', NULL, v_pro_id,
    jsonb_build_object('trial_plan_slug', 'pro', 'trial_days', 30)
  );

  RETURN v_sub_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Plano efetivo (trial = Pro)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_effective_plan_id(p_workspace_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_pro_id UUID;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE workspace_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN public._plan_id_by_slug('personal');
  END IF;

  v_pro_id := public._plan_id_by_slug('pro');

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at > NOW() THEN
    RETURN v_pro_id;
  END IF;

  IF v_sub.status IN ('active', 'past_due') THEN
    RETURN v_sub.plan_id;
  END IF;

  IF v_sub.status = 'trialing' THEN
    RETURN v_pro_id;
  END IF;

  RETURN v_sub.plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_trial_active(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;
  RETURN v_sub.status = 'trialing' AND v_sub.trial_ends_at > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trial_days_remaining(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;
  IF v_sub.id IS NULL OR v_sub.trial_ends_at IS NULL THEN
    RETURN 0;
  END IF;
  RETURN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.trial_ends_at - NOW())) / 86400)::INTEGER);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_subscription_active(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;

  IF v_sub.status IN ('active', 'past_due') THEN
    IF v_sub.cancel_at_period_end AND v_sub.current_period_end IS NOT NULL THEN
      RETURN v_sub.current_period_end > NOW();
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Uso e limites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_feature_usage(p_workspace_id UUID, p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW());
BEGIN
  CASE p_feature
    WHEN 'financial_accounts' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.financial_accounts
      WHERE workspace_id = p_workspace_id AND deleted_at IS NULL;
    WHEN 'users' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.workspace_members
      WHERE workspace_id = p_workspace_id;
    WHEN 'ai_requests' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM public.ai_usage
      WHERE workspace_id = p_workspace_id AND created_at >= v_month_start;
    ELSE
      v_count := 0;
  END CASE;
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_feature_limit(p_workspace_id UUID, p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_limit INTEGER;
BEGIN
  v_plan_id := public.get_effective_plan_id(p_workspace_id);
  SELECT pf.limit_value INTO v_limit
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id AND pf.feature = p_feature AND pf.enabled = TRUE;
  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_use_feature(p_workspace_id UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_enabled BOOLEAN;
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  IF NOT public.is_subscription_active(p_workspace_id) THEN
    RETURN FALSE;
  END IF;

  v_plan_id := public.get_effective_plan_id(p_workspace_id);

  SELECT pf.enabled, pf.limit_value INTO v_enabled, v_limit
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id AND pf.feature = p_feature;

  IF NOT FOUND OR v_enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_limit IS NOT NULL THEN
    v_usage := public.get_feature_usage(p_workspace_id, p_feature);
    IF v_usage >= v_limit THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_financial_data(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_subscription_active(p_workspace_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Snapshot JSON para frontend
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_subscription_snapshot(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_effective_plan_id UUID;
  v_effective_plan public.plans;
  v_base_plan public.plans;
BEGIN
  PERFORM public.sync_subscription_status(p_workspace_id);
  PERFORM public.ensure_trial_notifications(p_workspace_id);

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  v_effective_plan_id := public.get_effective_plan_id(p_workspace_id);
  SELECT * INTO v_effective_plan FROM public.plans WHERE id = v_effective_plan_id;

  IF v_sub.id IS NOT NULL THEN
    SELECT * INTO v_base_plan FROM public.plans WHERE id = v_sub.plan_id;
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'status', COALESCE(v_sub.status, 'none'),
    'is_active', public.is_subscription_active(p_workspace_id),
    'is_trialing', public.is_trial_active(p_workspace_id),
    'trial_days_remaining', public.get_trial_days_remaining(p_workspace_id),
    'trial_started_at', v_sub.trial_started_at,
    'trial_ends_at', v_sub.trial_ends_at,
    'cancel_at_period_end', COALESCE(v_sub.cancel_at_period_end, FALSE),
    'current_period_end', v_sub.current_period_end,
    'cancelled_at', v_sub.cancelled_at,
    'effective_plan', jsonb_build_object(
      'id', v_effective_plan.id,
      'slug', v_effective_plan.slug,
      'name', v_effective_plan.name,
      'price_monthly', v_effective_plan.price_monthly,
      'recommended', v_effective_plan.recommended
    ),
    'base_plan', CASE WHEN v_base_plan.id IS NOT NULL THEN jsonb_build_object(
      'id', v_base_plan.id,
      'slug', v_base_plan.slug,
      'name', v_base_plan.name
    ) ELSE NULL END,
    'can_write', public.can_write_financial_data(p_workspace_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Notificações de trial (7, 3, 1 dia) — sem duplicatas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_trial_notifications(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER;
  v_sub public.subscriptions;
  v_type TEXT;
  v_title TEXT;
  v_msg TEXT;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF NOT public.is_trial_active(p_workspace_id) THEN
    RETURN;
  END IF;

  v_days := public.get_trial_days_remaining(p_workspace_id);
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  IF v_days NOT IN (7, 3, 1) THEN
    RETURN;
  END IF;

  v_type := 'trial_reminder_' || v_days::TEXT;
  v_title := 'Seu teste grátis termina em ' || v_days::TEXT || ' dia' || CASE WHEN v_days > 1 THEN 's' ELSE '' END;
  v_msg := 'Escolha um plano para continuar utilizando todos os recursos do Nexus.';

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.workspace_id = p_workspace_id
      AND n.type = v_type
      AND n.user_id = COALESCE(v_uid, n.user_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (workspace_id, user_id, type, severity, title, message)
  VALUES (p_workspace_id, v_uid, v_type, 'warning', v_title, v_msg);
END;
$$;

-- ---------------------------------------------------------------------------
-- Seleção de plano (sem gateway — prepara assinatura; pagamento via webhook futuro)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.select_subscription_plan(
  p_workspace_id UUID,
  p_plan_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_new_plan_id UUID;
  v_old_plan_id UUID;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar plano';
  END IF;

  v_new_plan_id := public._plan_id_by_slug(p_plan_slug);
  IF v_new_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano inválido';
  END IF;

  PERFORM public.sync_subscription_status(p_workspace_id);

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  v_old_plan_id := v_sub.plan_id;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;

  -- Sem gateway: marca incomplete até webhook confirmar pagamento
  UPDATE public.subscriptions
  SET
    plan_id = v_new_plan_id,
    status = 'incomplete',
    trial_ends_at = COALESCE(trial_ends_at, NOW()),
    updated_at = NOW()
  WHERE id = v_sub.id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub.id,
    CASE WHEN v_old_plan_id = v_new_plan_id THEN 'plan_selected' ELSE 'upgrade_requested' END,
    v_old_plan_id, v_new_plan_id,
    jsonb_build_object('plan_slug', p_plan_slug, 'awaiting_payment', TRUE)
  );

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_subscription_cancel(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id AND status IN ('active', 'past_due')
  ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma assinatura ativa para cancelar';
  END IF;

  UPDATE public.subscriptions
  SET cancel_at_period_end = TRUE, updated_at = NOW()
  WHERE id = v_sub.id;

  PERFORM public._write_subscription_event(
    p_workspace_id, v_sub.id, 'cancel_requested', v_sub.plan_id, v_sub.plan_id, '{}'
  );

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_subscription(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF NOT public.can_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE workspace_id = p_workspace_id ORDER BY created_at DESC LIMIT 1;

  UPDATE public.subscriptions
  SET cancel_at_period_end = FALSE, cancelled_at = NULL, updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN public.get_subscription_snapshot(p_workspace_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Listar planos + features (página de preços)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_plans_with_features()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(plan_row ORDER BY sort_order), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'price_monthly', p.price_monthly,
      'currency', p.currency,
      'recommended', p.recommended,
      'sort_order', p.sort_order,
      'features', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'feature', pf.feature,
          'enabled', pf.enabled,
          'limit_value', pf.limit_value
        )), '[]'::jsonb)
        FROM public.plan_features pf WHERE pf.plan_id = p.id
      )
    ) AS plan_row, p.sort_order
    FROM public.plans p
    WHERE p.active = TRUE
  ) sub;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap workspace + trial automático
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  p_name TEXT,
  p_type TEXT,
  p_document TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  INSERT INTO public.workspaces (name, type, document, owner_id)
  VALUES (p_name, p_type, p_document, auth.uid())
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, auth.uid(), 'owner');

  PERFORM public.start_workspace_trial(v_workspace_id);

  RETURN v_workspace_id;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.sync_subscription_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_workspace_trial(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_effective_plan_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trial_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_days_remaining(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_subscription_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_usage(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_limit(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_feature(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_financial_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subscription_snapshot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_trial_notifications(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_subscription_plan(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_subscription_cancel(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_plans_with_features() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_workspace_trial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_plan_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trial_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_days_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_usage(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_limit(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_feature(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_financial_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_trial_notifications(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_subscription_plan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_subscription_cancel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_plans_with_features() TO authenticated;
