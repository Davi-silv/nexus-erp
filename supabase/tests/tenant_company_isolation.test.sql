-- Isolamento multi-tenant (companies / company_users / company_id)
-- Executar no SQL Editor com JWT de dois usuários (Empresa A e Empresa B).
--
-- Pré-requisitos: migration 030 aplicada; user_a membro de company_a; user_b membro de company_b.

-- 1) Leitura cruzada (deve retornar 0 linhas)
-- SET request.jwt.claim.sub = '<user_a_uuid>';
-- SELECT count(*) FROM public.transactions WHERE company_id = '<company_b_uuid>';
-- SELECT count(*) FROM public.customers WHERE company_id = '<company_b_uuid>';
-- SELECT count(*) FROM public.crm_opportunities WHERE company_id = '<company_b_uuid>';

-- 2) INSERT em outra empresa (deve falhar RLS ou trigger)
-- INSERT INTO public.customers (company_id, name, person_type, active)
-- VALUES ('<company_b_uuid>', 'Cliente invasor', 'company', true);

-- 3) UPDATE trocando company_id (deve falhar trigger prevent_company_id_change)
-- UPDATE public.customers SET company_id = '<company_b_uuid>' WHERE id = '<id_da_company_a>';

-- 4) DELETE registro de outra empresa (0 rows affected / RLS)
-- DELETE FROM public.accounts_payable WHERE company_id = '<company_b_uuid>';

-- 5) RPC comercial respeita membership
-- SELECT public.is_company_member('<company_a_uuid>'); -- true para user_a
-- SELECT public.is_company_member('<company_b_uuid>'); -- false para user_a
