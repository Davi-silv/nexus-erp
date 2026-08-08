# Migração para backend SaaS

## Situação atual

O Nexus ERP v2 persiste dados em **localStorage** via `StorageAdapter` e repositories:

- `src/repositories/users.repository.js`
- `src/repositories/user-data.repository.js`
- `src/infrastructure/storage.js`

Isso é ideal para MVP e demos, mas **não suporta** multi-dispositivo, backup centralizado ou billing.

## Estratégia recomendada: Strangler Fig

Substituir repositories gradualmente sem reescrever a UI.

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  UI Modules  │ ──► │    AppStore     │ ──► │ Repository   │
└──────────────┘     └─────────────────┘     │  Interface   │
                                              └──────┬───────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                    LocalStorageRepo          HttpRepository           HybridRepo
                    (dev/offline)             (produção)          (offline-first)
```

## Passo 1 — Contrato de repository

Criar interface comum (JSDoc ou TypeScript futuro):

```js
// src/repositories/user-data.repository.interface.js
/** @typedef {object} IUserDataRepository */
// load(userId), save(userId, data), createEmpty(userId)
```

## Passo 2 — HttpUserDataRepository

```js
// src/repositories/http/user-data.http.repository.js
export class HttpUserDataRepository {
  constructor(apiClient) { this.api = apiClient; }
  async load(userId) {
    return this.api.get(`/users/${userId}/data`);
  }
  async save(userId, data) {
    return this.api.put(`/users/${userId}/data`, data);
  }
}
```

## Passo 3 — Injeção no AppStore

```js
// main.js — Composition Root
const userDataRepo = import.meta.env.PROD
  ? new HttpUserDataRepository(api)
  : userDataRepoLocal;
```

## Passo 4 — Migração de dados do cliente

Script one-time na primeira login cloud:

1. Ler `localStorage` keys `nexus:*`
2. POST `/api/migrate` com payload
3. Limpar local após confirmação

## Modelo de dados sugerido (PostgreSQL)

```sql
-- tenants (PJ) ou users (PF)
users (id, email, profile_type, company_json, plan_id, created_at)
user_data (user_id, accounts, txs, cards, ... JSONB)
subscriptions (user_id, plan_id, status, stripe_customer_id)
audit_log (user_id, action, metadata, created_at)
```

## API endpoints mínimos (v1)

| Método | Rota | Uso |
|--------|------|-----|
| POST | `/auth/register` | Cadastro PF/PJ |
| POST | `/auth/login` | Login |
| GET | `/me/data` | Carregar dados financeiros |
| PUT | `/me/data` | Salvar (debounce no client) |
| POST | `/ai/analyze` | Proxy IA (rate limit) |
| GET | `/billing/plans` | Planos ativos |

## Stack backend sugerida (Brasil)

| Opção | Prós | Contras |
|-------|------|---------|
| **Supabase** | Rápido, auth + DB | Vendor lock-in |
| **Node + Fastify + Prisma** | Controle total | Mais dev time |
| **Firebase** | Realtime | Preço escala |

Recomendação para PME BR: **Supabase ou Node+PostgreSQL na Railway/Render**.

## Offline-first (opcional Fase 4)

Service Worker + IndexedDB sync queue para PWA continuar offline e sincronizar quando online.
