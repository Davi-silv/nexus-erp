-- Permite que qualquer membro leia a PRÓPRIA linha em company_users (bootstrap de sessão/login).
-- Listagem completa da equipe continua via RPC list_company_members (módulo Usuários).

DROP POLICY IF EXISTS company_users_select ON public.company_users;
CREATE POLICY company_users_select ON public.company_users
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      user_id = auth.uid()
      OR public.can_module_permission(company_id, 'users', 'view')
    )
  );

CREATE OR REPLACE FUNCTION public.get_my_company_membership()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'company_id', cu.company_id,
    'role', cu.role,
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'type', c.type,
      'document', c.document
    )
  )
  INTO out
  FROM public.company_users cu
  JOIN public.companies c ON c.id = cu.company_id
  WHERE cu.user_id = auth.uid()
    AND cu.status = 'active'
  ORDER BY (cu.role = 'owner') DESC, cu.created_at ASC
  LIMIT 1;

  RETURN COALESCE(out, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_company_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_company_membership() TO authenticated;
