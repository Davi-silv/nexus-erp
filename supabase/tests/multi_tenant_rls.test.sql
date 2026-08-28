-- Testes manuais RLS multi-tenant (executar no SQL Editor com JWT de teste)
-- Requer dois usuários de teste criados no Supabase Auth.
--
-- CENÁRIO:
--   user_a → workspace_a (owner)
--   user_b → workspace_b (owner)
--
-- VALIDAR: user_a NÃO acessa dados de workspace_b

-- 1. Como user_a autenticado:
-- SELECT * FROM transactions WHERE workspace_id = '<workspace_b_id>';
-- → deve retornar 0 linhas

-- 2. Como user_a:
-- INSERT INTO transactions (workspace_id, type, description, amount, transaction_date)
-- VALUES ('<workspace_b_id>', 'expense', 'ataque', 100, CURRENT_DATE);
-- → deve falhar por RLS

-- 3. Roles:
-- financial → INSERT transaction OK
-- viewer → INSERT transaction FAIL
-- manager → SELECT OK, INSERT FAIL
-- accountant → SELECT audit_logs OK, INSERT transaction FAIL

-- 4. RPC mark_payable_paid:
-- Deve criar transaction + atualizar payable + audit_log atomicamente

-- 5. Cross-workspace FK:
-- INSERT transaction com category_id de outro workspace
-- → trigger validate_same_workspace_refs deve falhar
