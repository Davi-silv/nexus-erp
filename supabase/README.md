# Nexus 3.0 — Banco de Dados PostgreSQL (Supabase)

Arquitetura multi-tenant para SaaS financeiro. Migrations incrementais em `supabase/migrations/`.

## Análise do projeto v2 (antes das migrations)

| Aspecto | Estado v2 | Ação Nexus 3.0 |
|---------|-----------|----------------|
| PostgreSQL | **Inexistente** | Criar schema do zero |
| Persistência | localStorage (`nexus:users`, `nexus:user:{id}:*`) | Migrar via API/script |
| Tabelas SQL | Nenhuma | 25 tabelas + 5 views |
| Auth | Hash local em JS | Supabase Auth → `auth.users` + `profiles` |
| Multi-tenant | 1 usuário = 1 silo | `workspaces` + `workspace_members` |
| Planos | `plans.config.js` (não usado) | `plans` + `plan_features` + seed |

**Nenhuma tabela PostgreSQL foi removida** — greenfield com mapeamento v2 documentado.

### Mapeamento localStorage → PostgreSQL

| v2 (localStorage) | v3 (PostgreSQL) |
|-------------------|-----------------|
| `users[]` | `auth.users` + `profiles` |
| `profileType: pf` | `workspaces.type = 'personal'` |
| `profileType: pj` + `company` | `workspaces.type = 'business'/'mei'` |
| `accounts[]` | `financial_accounts` |
| `txs[]` (credit/debit) | `transactions` (income/expense) |
| `cards[]` | `credit_cards` |
| `charges[]` | `credit_card_transactions` |
| `categories[]` | `categories` (+ `color`) |
| `goals[]` | `category_budgets` |
| `costCenters[]` | `cost_centers` |
| `recurring[]` | `recurring_transactions` |
| `healthHistory[]` | `financial_health_scores` |
| IDs numéricos (`uid()`) | UUID + `legacy_migration_map` |

---

## Diagrama de relações (textual)

```
auth.users
    └── profiles (1:1)
            ├── workspaces.owner_id
            └── workspace_members.user_id
                    └── workspaces
                            ├── financial_accounts
                            ├── credit_cards
                            ├── categories ──► category_budgets
                            │       └── (self parent_id)
                            ├── cost_centers
                            ├── customers
                            ├── suppliers
                            ├── transactions ──► (AP/AR/bank_import link)
                            ├── accounts_payable
                            ├── accounts_receivable
                            ├── credit_card_transactions
                            ├── recurring_transactions
                            ├── subscriptions ──► plans ──► plan_features
                            ├── ai_usage
                            ├── financial_health_scores
                            ├── notifications
                            ├── audit_logs
                            ├── bank_imports ──► bank_import_items
                            └── legacy_migration_map

Views (RLS-aware): monthly_cash_flow, workspace_balances,
  accounts_payable_summary, accounts_receivable_summary, dre_summary
```

---

## Tabelas criadas (25)

1. `profiles`
2. `workspaces`
3. `workspace_members`
4. `legacy_migration_map`
5. `financial_accounts`
6. `credit_cards`
7. `categories`
8. `category_budgets` *(compat v2 goals)*
9. `cost_centers`
10. `transactions`
11. `customers`
12. `suppliers`
13. `accounts_payable`
14. `accounts_receivable`
15. `credit_card_transactions`
16. `recurring_transactions`
17. `plans`
18. `plan_features`
19. `subscriptions`
20. `ai_usage`
21. `financial_health_scores`
22. `notifications`
23. `audit_logs`
24. `bank_imports`
25. `bank_import_items`

---

## Migrations

| Arquivo | Conteúdo |
|---------|----------|
| `001_core_profiles_workspaces.sql` | Core, triggers auth, legacy map |
| `002_financial_structure.sql` | Contas, cartões, categorias, transações |
| `003_customers_suppliers.sql` | Clientes, fornecedores, FKs |
| `004_payables_receivables.sql` | AP/AR, status overdue dinâmico |
| `005_cards_recurring.sql` | Cartão, recorrências |
| `006_saas_plans.sql` | Planos, features, assinaturas |
| `007_ai_health_notifications.sql` | IA, saúde, notificações |
| `008_audit_imports.sql` | Auditoria, importação bancária |
| `009_indexes.sql` | Índices analíticos |
| `010_rls_helpers.sql` | `is_workspace_member`, roles |
| `011_rls_policies.sql` | RLS completo |
| `012_financial_functions.sql` | RPCs transacionais |
| `013_seed_plans.sql` | Seed Personal/Start/Pro/Business |
| `014_financial_views.sql` | Views financeiras |

---

## Funções SQL (backend deve chamar)

| Função | Uso |
|--------|-----|
| `create_workspace_with_owner(name, type, document?)` | Onboarding pós-login |
| `mark_payable_paid(id, amount, account_id, date?)` | Pagar conta (atômico) |
| `mark_receivable_received(id, amount, account_id, date?)` | Receber conta (atômico) |
| `create_account_transfer(workspace, from, to, amount, desc, date?)` | Transferência |
| `recalculate_account_balance(account_id)` | Sync saldo |
| `write_audit_log(...)` | Auditoria |
| `effective_payable_status(...)` | Status com overdue calculado |
| `effective_receivable_status(...)` | Idem recebíveis |

---

## Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # apenas backend/Edge Functions
VITE_APP_ENV=production
```

Copie `.env.example` → `.env.local` e preencha as chaves Supabase. **Sem essas variáveis**, o app continua em modo localStorage (ideal para testes e demo offline).

---

## Integração frontend (modo dual)

O frontend detecta automaticamente o Supabase via `VITE_SUPABASE_*`:

| Arquivo | Função |
|---------|--------|
| `src/config/supabase.config.js` | Feature flag `isSupabaseEnabled` |
| `src/infrastructure/supabase.client.js` | Cliente `@supabase/supabase-js` |
| `src/infrastructure/supabase/data-mapper.js` | Mapeamento v2 ↔ PostgreSQL |
| `src/repositories/supabase/auth.repository.js` | Login, cadastro, workspace |
| `src/repositories/supabase/user-data.repository.js` | Sync contas, txs, cartões… |
| `src/services/migration.service.js` | Migração automática localStorage → cloud |
| `src/state/app-store.js` | Modo dual (local ou cloud) |

### Fluxo

1. Aplicar migrations `001`–`014` no projeto Supabase
2. Configurar `.env.local` com URL + anon key
3. `npm run dev` — cadastro/login usa Supabase Auth
4. Na primeira sessão cloud, dados locais existentes são migrados automaticamente

### Campos PJ em JSON (sem migration extra)

Campos extras do v2 são serializados em colunas texto existentes:

- Contas: `institution` → `{ bank, agency, accountNumber }`
- Lançamentos: `notes` → `{ docNumber, counterparty }`
- Centros de custo: `description` → `{ code, budget, text }`

### Limitações conhecidas

- Convite de membros ao workspace (multi-usuário cloud) — em breve
- Chaves de IA ainda no localStorage — migrar para proxy backend
- Modo local continua disponível sem variáveis Supabase (testes E2E)

### Cadastro

- PF → `workspaces.type = 'personal'`
- PJ → `workspaces.type = 'business'` ou `'mei'`
- Categorias padrão inseridas via RPC pós-registro

---

## Como aplicar

### Supabase CLI (recomendado)

```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

### Manual (SQL Editor)

Execute os arquivos `001` → `014` **em ordem** no SQL Editor do Supabase Dashboard.

### Local

```bash
supabase init   # se ainda não existir config local
supabase start
supabase db reset
```

---

## Testes multi-tenant

Ver `supabase/tests/multi_tenant_rls.test.sql` e `docs/MIGRATION_FROM_V2.md`.

Cenário mental:
- Usuário A → Workspace A
- Usuário B → Workspace B
- RLS bloqueia SELECT/INSERT/UPDATE/DELETE cruzado

Roles testados: owner, admin, financial, manager, accountant, viewer.

---

## Riscos identificados

1. **Migração localStorage** — script one-time necessário (não automático)
2. **Saldo materializado** — usar `recalculate_account_balance` após cada mutação
3. **IA no client** — registrar consumo via Edge Function + `ai_usage`
4. **Overdue** — preferir views/funções; status persistido pode ficar stale
5. **SECURITY DEFINER** — funções com `search_path` fixo; revisar periodicamente
6. **Recorrência** — exige cron (Supabase pg_cron ou Edge Function)

---

## Recomendações futuras

1. Edge Functions para IA, billing webhooks, cron de recorrências
2. `HttpRepository` no frontend (Strangler Fig — ver `docs/BACKEND-MIGRATION.md`)
3. Particionamento de `transactions` e `audit_logs` por data (>1M rows)
4. Read replicas para relatórios pesados
5. Criptografia em repouso de `document` (CPF/CNPJ) — pgcrypto ou vault

---

## Conflitos com app atual

| Item | Impacto | Mitigação |
|------|---------|-----------|
| App v2 usa localStorage | Não lê Supabase ainda | Repositório HTTP paralelo |
| IDs numéricos vs UUID | Migração precisa mapa | `legacy_migration_map` |
| `credit/debit` vs `income/expense` | Transform na migração | Script documentado |
| PWA offline | Conflito com cloud-first | HybridRepo futuro |

**Nenhum DROP/TRUNCATE** foi executado — schema 100% aditivo.
