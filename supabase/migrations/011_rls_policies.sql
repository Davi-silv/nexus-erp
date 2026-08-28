-- Nexus 3.0 — Row Level Security policies

-- ===========================================================================
-- profiles
-- ===========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_select_workspace_peers ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members me
      JOIN public.workspace_members peer ON peer.workspace_id = me.workspace_id
      WHERE me.user_id = auth.uid()
        AND peer.user_id = profiles.id
    )
  );

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ===========================================================================
-- workspaces
-- ===========================================================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_select_member ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id));

CREATE POLICY workspaces_insert_authenticated ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY workspaces_update_admin ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.can_admin_workspace(id))
  WITH CHECK (public.can_admin_workspace(id));

CREATE POLICY workspaces_delete_owner ON public.workspaces
  FOR DELETE TO authenticated
  USING (
    public.has_workspace_role(id, ARRAY['owner']::TEXT[])
  );

-- ===========================================================================
-- workspace_members
-- ===========================================================================
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_members_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY workspace_members_insert_admin ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_workspace(workspace_id));

CREATE POLICY workspace_members_update_admin ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (public.can_admin_workspace(workspace_id))
  WITH CHECK (public.can_admin_workspace(workspace_id));

CREATE POLICY workspace_members_delete_admin ON public.workspace_members
  FOR DELETE TO authenticated
  USING (
    public.can_admin_workspace(workspace_id)
    AND role <> 'owner'
  );

-- ===========================================================================
-- Macro: tabelas financeiras com workspace_id
-- ===========================================================================

-- financial_accounts
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_accounts_select ON public.financial_accounts FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY financial_accounts_insert ON public.financial_accounts FOR INSERT TO authenticated
  WITH CHECK (public.can_write_financial(workspace_id));
CREATE POLICY financial_accounts_update ON public.financial_accounts FOR UPDATE TO authenticated
  USING (public.can_write_financial(workspace_id)) WITH CHECK (public.can_write_financial(workspace_id));
CREATE POLICY financial_accounts_delete ON public.financial_accounts FOR DELETE TO authenticated
  USING (public.can_write_financial(workspace_id));

-- credit_cards
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_cards_select ON public.credit_cards FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY credit_cards_write ON public.credit_cards FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- category_budgets
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_budgets_select ON public.category_budgets FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY category_budgets_write ON public.category_budgets FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- cost_centers
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_centers_select ON public.cost_centers FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY cost_centers_write ON public.cost_centers FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY transactions_write ON public.transactions FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- accounts_payable / receivable
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_payable_select ON public.accounts_payable FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY accounts_payable_write ON public.accounts_payable FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_receivable_select ON public.accounts_receivable FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY accounts_receivable_write ON public.accounts_receivable FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- credit_card_transactions
ALTER TABLE public.credit_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_card_tx_select ON public.credit_card_transactions FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY credit_card_tx_write ON public.credit_card_transactions FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- recurring_transactions
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_select ON public.recurring_transactions FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY recurring_write ON public.recurring_transactions FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- subscriptions (admin/owner)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY subscriptions_write ON public.subscriptions FOR ALL TO authenticated
  USING (public.can_admin_workspace(workspace_id))
  WITH CHECK (public.can_admin_workspace(workspace_id));

-- plans / plan_features (leitura global para autenticados)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select_all ON public.plans FOR SELECT TO authenticated USING (active = TRUE);

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_features_select ON public.plan_features FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.active = TRUE));

-- ai_usage
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','financial']::TEXT[]));
CREATE POLICY ai_usage_insert ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (public.can_write_financial(workspace_id));

-- financial_health_scores
ALTER TABLE public.financial_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_health_select ON public.financial_health_scores FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY financial_health_insert ON public.financial_health_scores FOR INSERT TO authenticated
  WITH CHECK (public.can_write_financial(workspace_id));

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_read_workspace(workspace_id));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- audit_logs (leitura restrita)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','accountant']::TEXT[]));
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_write_financial(workspace_id));

-- bank imports
ALTER TABLE public.bank_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_imports_select ON public.bank_imports FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY bank_imports_write ON public.bank_imports FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

ALTER TABLE public.bank_import_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_import_items_select ON public.bank_import_items FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY bank_import_items_write ON public.bank_import_items FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- legacy_migration_map (admin only)
ALTER TABLE public.legacy_migration_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_migration_select ON public.legacy_migration_map FOR SELECT TO authenticated
  USING (public.can_admin_workspace(workspace_id));
CREATE POLICY legacy_migration_write ON public.legacy_migration_map FOR ALL TO authenticated
  USING (public.can_admin_workspace(workspace_id))
  WITH CHECK (public.can_admin_workspace(workspace_id));
