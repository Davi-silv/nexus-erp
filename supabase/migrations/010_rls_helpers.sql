-- Nexus 3.0 — Helpers RLS (SECURITY DEFINER controlado)

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_workspace_role(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wm.role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(UUID) TO authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_workspace_role(
  p_workspace_id UUID,
  p_allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = ANY (p_allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.has_workspace_role(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, TEXT[]) TO authenticated;

-- Roles de escrita financeira
CREATE OR REPLACE FUNCTION public.can_write_financial(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_workspace_role(
    p_workspace_id,
    ARRAY['owner', 'admin', 'financial']::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION public.can_write_financial(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_financial(UUID) TO authenticated;

-- Roles de leitura (inclui manager, accountant, viewer)
CREATE OR REPLACE FUNCTION public.can_read_workspace(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_workspace_member(p_workspace_id);
$$;

REVOKE ALL ON FUNCTION public.can_read_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_workspace(UUID) TO authenticated;

-- Admin (exceto ações exclusivas owner — aplicadas por policy específica)
CREATE OR REPLACE FUNCTION public.can_admin_workspace(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_workspace_role(
    p_workspace_id,
    ARRAY['owner', 'admin']::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION public.can_admin_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_admin_workspace(UUID) TO authenticated;

COMMENT ON FUNCTION public.is_workspace_member IS
  'SECURITY DEFINER com search_path fixo — base de todo RLS multi-tenant.';
