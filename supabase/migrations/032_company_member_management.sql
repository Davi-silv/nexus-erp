-- Nexus ERP 032 — Convite (e-mail) e gestão de cargos em company_users

-- ---------------------------------------------------------------------------
-- RLS company_users (company_id + RBAC módulo usuários)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_members_select ON public.company_users;
DROP POLICY IF EXISTS workspace_members_insert_admin ON public.company_users;
DROP POLICY IF EXISTS workspace_members_update_admin ON public.company_users;
DROP POLICY IF EXISTS workspace_members_delete_admin ON public.company_users;

DROP POLICY IF EXISTS company_users_select ON public.company_users;
CREATE POLICY company_users_select ON public.company_users
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.can_module_permission(company_id, 'users', 'view')
  );

DROP POLICY IF EXISTS company_users_insert ON public.company_users;
CREATE POLICY company_users_insert ON public.company_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_module_permission(company_id, 'users', 'create')
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS company_users_update ON public.company_users;
CREATE POLICY company_users_update ON public.company_users
  FOR UPDATE TO authenticated
  USING (
    public.can_module_permission(company_id, 'users', 'edit')
    AND role <> 'owner'
  )
  WITH CHECK (
    public.can_module_permission(company_id, 'users', 'edit')
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS company_users_delete ON public.company_users;
CREATE POLICY company_users_delete ON public.company_users
  FOR DELETE TO authenticated
  USING (
    public.can_module_permission(company_id, 'users', 'delete')
    AND role <> 'owner'
  );

-- ---------------------------------------------------------------------------
-- Helpers (server-side)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_assignable_member_role(
  p_actor_role TEXT,
  p_target_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  actor TEXT := lower(trim(COALESCE(p_actor_role, '')));
  target TEXT := lower(trim(COALESCE(p_target_role, '')));
BEGIN
  IF target = 'owner' THEN
    RAISE EXCEPTION 'Cargo owner não pode ser atribuído por convite';
  END IF;

  IF target NOT IN (
    'admin', 'financial', 'commercial', 'seller', 'accountant', 'viewer'
  ) THEN
    RAISE EXCEPTION 'Cargo inválido: %', p_target_role;
  END IF;

  IF actor = 'owner' THEN
    RETURN;
  END IF;

  IF actor = 'admin' AND target <> 'admin' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Sem permissão para atribuir o cargo %', p_target_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_company_members(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  out JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.can_module_permission(p_company_id, 'users', 'view') THEN
    RAISE EXCEPTION 'Sem permissão para listar usuários';
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key, sort_name), '[]'::jsonb)
  INTO out
  FROM (
    SELECT
      jsonb_build_object(
        'user_id', cu.user_id,
        'role', cu.role,
        'name', COALESCE(p.full_name, 'Membro'),
        'email', COALESCE(u.email, '')
      ) AS item,
      CASE cu.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        ELSE 2
      END AS sort_key,
      COALESCE(p.full_name, '') AS sort_name
    FROM public.company_users cu
    JOIN public.profiles p ON p.id = cu.user_id
    LEFT JOIN auth.users u ON u.id = cu.user_id
    WHERE cu.company_id = p_company_id
      AND cu.status = 'active'
  ) sub;

  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_company_member_by_email(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_user_id UUID;
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_role TEXT := lower(trim(COALESCE(p_role, 'viewer')));
BEGIN
  IF NOT public.can_module_permission(p_company_id, 'users', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para adicionar membros';
  END IF;

  v_actor_role := public.get_company_role(p_company_id);
  PERFORM public._assert_assignable_member_role(v_actor_role, v_role);

  IF v_email = '' THEN
    RAISE EXCEPTION 'E-mail é obrigatório';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta encontrada com este e-mail. Peça para a pessoa se cadastrar no Nexus ERP e tente novamente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_users
    WHERE company_id = p_company_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Este usuário já faz parte da empresa';
  END IF;

  INSERT INTO public.company_users (company_id, user_id, role, status)
  VALUES (p_company_id, v_user_id, v_role, 'active');

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'role', v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_company_member_role(
  p_company_id UUID,
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_current_role TEXT;
  v_role TEXT := lower(trim(COALESCE(p_role, '')));
BEGIN
  IF NOT public.can_module_permission(p_company_id, 'users', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar cargos';
  END IF;

  SELECT role INTO v_current_role
  FROM public.company_users
  WHERE company_id = p_company_id AND user_id = p_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado';
  END IF;

  IF v_current_role = 'owner' THEN
    RAISE EXCEPTION 'O cargo owner não pode ser alterado';
  END IF;

  v_actor_role := public.get_company_role(p_company_id);
  PERFORM public._assert_assignable_member_role(v_actor_role, v_role);

  UPDATE public.company_users
  SET role = v_role
  WHERE company_id = p_company_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_company_member(
  p_company_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT public.can_module_permission(p_company_id, 'users', 'delete') THEN
    RAISE EXCEPTION 'Sem permissão para remover membros';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo';
  END IF;

  SELECT role INTO v_role
  FROM public.company_users
  WHERE company_id = p_company_id AND user_id = p_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado';
  END IF;

  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'O owner não pode ser removido';
  END IF;

  DELETE FROM public.company_users
  WHERE company_id = p_company_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public._assert_assignable_member_role(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_company_members(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_company_member_by_email(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_company_member_role(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_company_member(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_company_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_company_member_by_email(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_member_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_company_member(UUID, UUID) TO authenticated;
