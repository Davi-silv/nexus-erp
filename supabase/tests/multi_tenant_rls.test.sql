-- Testes manuais RLS multi-tenant (executar no SQL Editor com JWT de teste)
-- Requer dois usuários de teste criados no Supabase Auth.
--
-- CENÁRIO:
--   user_a → company_a (owner)
--   user_b → company_b (owner)
--
-- VALIDAR: user_a NÃO acessa dados de company_b

-- 1. Como user_a autenticado:
-- SELECT * FROM transactions WHERE company_id = '<company_b_id>';
-- → deve retornar 0 linhas

-- 2. Como user_a:
-- INSERT INTO transactions (company_id, type, description, amount, transaction_date)
-- VALUES ('<company_b_id>', 'expense', 'ataque', 100, CURRENT_DATE);
-- → deve falhar por RLS / trigger enforce_company_membership

-- 3. RBAC (migration 031 — rbac_allowed / can_module_permission):
-- seller → SELECT crm_opportunities OK, INSERT transactions FAIL
-- seller → INSERT customers OK, SELECT fiscal_settings FAIL (sem view fiscal)
-- accountant → SELECT transactions OK, UPDATE crm_opportunities FAIL
-- accountant → INSERT fiscal_invoices OK (create fiscal)
-- financial → INSERT accounts_payable OK, INSERT crm_opportunities FAIL (sem create crm)
-- owner → tudo OK
-- SELECT public.get_my_permissions('<company_id>'); → JSON com matriz por módulo

-- 4. RPC mark_payable_paid:
-- Deve criar transaction + atualizar payable + audit_log atomicamente

-- 5. Cross-workspace FK:
-- INSERT transaction com category_id de outro workspace
-- → trigger validate_same_workspace_refs deve falhar
