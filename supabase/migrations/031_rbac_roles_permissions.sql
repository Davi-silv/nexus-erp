-- Nexus ERP 031 — Cargos (RBAC) e permissões por módulo (server-side)

-- ---------------------------------------------------------------------------
-- Cargos em company_users
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_users DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.company_users DROP CONSTRAINT IF EXISTS company_users_role_check;

ALTER TABLE public.company_users
  ADD CONSTRAINT company_users_role_check CHECK (
    role IN (
      'owner', 'admin', 'financial', 'commercial', 'seller', 'accountant', 'viewer'
    )
  );

UPDATE public.company_users SET role = 'commercial' WHERE role = 'manager';

COMMENT ON COLUMN public.company_users.role IS
  'RBAC: owner, admin, financial, commercial, seller, accountant, viewer';

-- ---------------------------------------------------------------------------
-- Matriz de permissões (espelha src/domain/rbac.service.js)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rbac_allowed(
  p_role TEXT,
  p_module TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r TEXT := lower(trim(COALESCE(p_role, 'viewer')));
  m TEXT := lower(trim(COALESCE(p_module, '')));
  a TEXT := lower(trim(COALESCE(p_action, '')));
BEGIN
  IF r = 'owner' THEN
    RETURN TRUE;
  END IF;

  IF r IN ('admin') THEN
    IF m = 'users' AND a = 'delete' THEN RETURN FALSE; END IF;
    IF a IN ('view', 'create', 'edit', 'delete') THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  IF r = 'financial' THEN
    IF m = 'financial' THEN RETURN a IN ('view', 'create', 'edit', 'delete'); END IF;
    IF m = 'dashboard' AND a = 'view' THEN RETURN TRUE; END IF;
    IF m IN ('crm', 'fiscal', 'settings') AND a = 'view' THEN RETURN TRUE; END IF;
    IF m IN ('customers', 'quotes', 'reports') AND a IN ('view', 'create', 'edit') THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  IF r = 'commercial' THEN
    IF m IN ('crm', 'customers', 'quotes') THEN RETURN a IN ('view', 'create', 'edit', 'delete'); END IF;
    IF m IN ('dashboard', 'financial', 'fiscal', 'reports') AND a = 'view' THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  IF r = 'seller' THEN
    IF m IN ('crm', 'customers', 'quotes') AND a IN ('view', 'create', 'edit') THEN RETURN TRUE; END IF;
    IF m = 'dashboard' AND a = 'view' THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  IF r = 'accountant' THEN
    IF m = 'dashboard' AND a = 'view' THEN RETURN TRUE; END IF;
    IF m = 'financial' AND a = 'view' THEN RETURN TRUE; END IF;
    IF m IN ('crm', 'customers', 'quotes') AND a = 'view' THEN RETURN TRUE; END IF;
    IF m = 'fiscal' AND a IN ('view', 'create', 'edit') THEN RETURN TRUE; END IF;
    IF m = 'reports' AND a IN ('view', 'create') THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  IF r = 'viewer' THEN
    RETURN a = 'view';
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_module_permission(
  p_company_id UUID,
  p_module TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(p_company_id)
    AND public.rbac_allowed(public.get_company_role(p_company_id), p_module, p_action);
$$;

REVOKE ALL ON FUNCTION public.rbac_allowed(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_allowed(TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.can_module_permission(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_module_permission(UUID, TEXT, TEXT) TO authenticated;

-- Snapshot de permissões para o frontend (cloud)
CREATE OR REPLACE FUNCTION public.get_my_permissions(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  modules TEXT[] := ARRAY[
    'dashboard', 'financial', 'crm', 'customers', 'quotes',
    'fiscal', 'reports', 'settings', 'users'
  ];
  actions TEXT[] := ARRAY['view', 'create', 'edit', 'delete'];
  m TEXT;
  a TEXT;
  out JSONB := '{}'::jsonb;
  mod JSONB;
BEGIN
  IF NOT public.is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Not a company member';
  END IF;
  v_role := public.get_company_role(p_company_id);
  FOREACH m IN ARRAY modules LOOP
    mod := '{}'::jsonb;
    FOREACH a IN ARRAY actions LOOP
      mod := mod || jsonb_build_object(a, public.rbac_allowed(v_role, m, a));
    END LOOP;
    out := out || jsonb_build_object(m, mod);
  END LOOP;
  RETURN jsonb_build_object('role', v_role, 'permissions', out);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_permissions(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Escrita financeira: papel + assinatura + permissão RBAC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_financial(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(p_company_id)
    AND public.can_write_financial_data(p_company_id)
    AND public.rbac_allowed(
      public.get_company_role(p_company_id),
      'financial',
      'edit'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_fiscal(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(p_company_id)
    AND public.can_write_financial_data(p_company_id)
    AND public.rbac_allowed(
      public.get_company_role(p_company_id),
      'fiscal',
      'edit'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_workspace(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(p_company_id);
$$;

-- ---------------------------------------------------------------------------
-- RLS — leitura por módulo (não confiar só no frontend)
-- ---------------------------------------------------------------------------

-- Financeiro
DROP POLICY IF EXISTS financial_accounts_select ON public.financial_accounts;
CREATE POLICY financial_accounts_select ON public.financial_accounts FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'financial', 'view') AND deleted_at IS NULL);

DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'financial', 'view') AND deleted_at IS NULL);

DROP POLICY IF EXISTS accounts_payable_select ON public.accounts_payable;
CREATE POLICY accounts_payable_select ON public.accounts_payable FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'financial', 'view') AND deleted_at IS NULL);

DROP POLICY IF EXISTS accounts_receivable_select ON public.accounts_receivable;
CREATE POLICY accounts_receivable_select ON public.accounts_receivable FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'financial', 'view') AND deleted_at IS NULL);

-- Clientes
DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'customers', 'view') AND deleted_at IS NULL);

-- CRM
DROP POLICY IF EXISTS crm_opportunities_select ON public.crm_opportunities;
CREATE POLICY crm_opportunities_select ON public.crm_opportunities FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'crm', 'view') AND deleted_at IS NULL);

-- Orçamentos / serviços
DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'quotes', 'view') AND deleted_at IS NULL);

DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'quotes', 'view') AND deleted_at IS NULL);

-- Fiscal
DROP POLICY IF EXISTS fiscal_invoices_select ON public.fiscal_invoices;
CREATE POLICY fiscal_invoices_select ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'fiscal', 'view'));

DROP POLICY IF EXISTS fiscal_settings_select ON public.fiscal_settings;
CREATE POLICY fiscal_settings_select ON public.fiscal_settings FOR SELECT TO authenticated
  USING (public.can_module_permission(company_id, 'fiscal', 'view'));

-- INSERT/UPDATE financeiro (create/edit via can_write_financial + ação)
DROP POLICY IF EXISTS financial_accounts_insert ON public.financial_accounts;
CREATE POLICY financial_accounts_insert ON public.financial_accounts FOR INSERT TO authenticated
  WITH CHECK (
    public.can_module_permission(company_id, 'financial', 'create')
    AND public.can_write_financial_data(company_id)
  );

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_module_permission(company_id, 'financial', 'create')
    AND public.can_write_financial_data(company_id)
  );

DROP POLICY IF EXISTS customers_write ON public.customers;
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.can_module_permission(company_id, 'customers', 'create') AND public.can_write_financial_data(company_id));
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
  USING (public.can_module_permission(company_id, 'customers', 'edit'))
  WITH CHECK (public.can_module_permission(company_id, 'customers', 'edit'));

DROP POLICY IF EXISTS crm_opportunities_write ON public.crm_opportunities;
CREATE POLICY crm_opportunities_insert ON public.crm_opportunities FOR INSERT TO authenticated
  WITH CHECK (public.can_module_permission(company_id, 'crm', 'create') AND public.can_write_financial_data(company_id));
CREATE POLICY crm_opportunities_update ON public.crm_opportunities FOR UPDATE TO authenticated
  USING (public.can_module_permission(company_id, 'crm', 'edit'))
  WITH CHECK (public.can_module_permission(company_id, 'crm', 'edit'));

DROP POLICY IF EXISTS quotes_write ON public.quotes;
CREATE POLICY quotes_insert ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (public.can_module_permission(company_id, 'quotes', 'create') AND public.can_write_financial_data(company_id));
CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated
  USING (public.can_module_permission(company_id, 'quotes', 'edit'))
  WITH CHECK (public.can_module_permission(company_id, 'quotes', 'edit'));

DROP POLICY IF EXISTS customers_delete ON public.customers;
CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated
  USING (public.can_module_permission(company_id, 'customers', 'delete'));

DROP POLICY IF EXISTS crm_opportunities_delete ON public.crm_opportunities;
CREATE POLICY crm_opportunities_delete ON public.crm_opportunities FOR DELETE TO authenticated
  USING (public.can_module_permission(company_id, 'crm', 'delete'));

DROP POLICY IF EXISTS quotes_delete ON public.quotes;
CREATE POLICY quotes_delete ON public.quotes FOR DELETE TO authenticated
  USING (public.can_module_permission(company_id, 'quotes', 'delete'));
