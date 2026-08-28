# Nexus — Fluxo Comercial (Serviços → NFS-e → PIX)

Relatório da evolução implementada (base incremental, Partes 1–30).

## Tabelas criadas (migrations 019–026)

| Tabela | Migration | Descrição |
|--------|-----------|-----------|
| `services` | 019 | Catálogo de serviços |
| `quotes` | 020 | Orçamentos |
| `quote_items` | 020 | Itens do orçamento |
| `fiscal_settings` | 021 | Config fiscal (sem segredos) |
| `fiscal_invoices` | 022 | NFS-e |
| `fiscal_invoice_events` | 022 | Eventos fiscais sanitizados |
| `payment_charges` | 023 | Cobranças PIX |

**Alteração:** `accounts_receivable.quote_id` (020) — vínculo idempotente orçamento → CR.

## Migrations

```
019_services.sql
020_quotes.sql
021_fiscal_settings.sql
022_fiscal_invoices.sql
023_payment_charges.sql
024_commercial_rls.sql
025_commercial_functions.sql
026_commercial_plan_features.sql
```

## Funções SQL / RPCs (025)

| RPC | Função |
|-----|--------|
| `next_quote_number` | Número sequencial ORC-AAAA-NNNN |
| `recalculate_quote_totals` | Totais recalculados no backend |
| `set_quote_status` | Aprovar / enviar / etc. + audit |
| `generate_receivable_from_quote` | CR idempotente a partir de orçamento aprovado |
| `create_pix_charge` | Cobrança PIX (stub) |
| `process_pix_payment_webhook` | Webhook idempotente (service_role) |
| `request_fiscal_invoice` | NFS-e processing + limite de plano |
| `get_monthly_invoice_usage` | Consumo mensal NFS-e |
| `can_issue_invoice` | Feature gating fiscal |

## RLS (024)

- Leitura: membros do workspace (`can_read_workspace`)
- Escrita serviços/orçamentos/PIX: `can_write_financial`
- Escrita fiscal: `can_write_fiscal` (owner, admin, financial, accountant)
- Helper: `can_write_fiscal(workspace_id)`

## Plan features (026)

| Feature | Start | Pro | Business |
|---------|-------|-----|----------|
| services | ✅ | ✅ | ✅ |
| quotes | ✅ | ✅ | ✅ |
| nfse | ✅ (5/mês) | ✅ (50/mês) | ✅ (200/mês) |
| pix_charges | ✅ | ✅ | ✅ |
| fiscal_reports | ❌ | ✅ | ✅ |

## Frontend

### Páginas / rotas

| Rota | Menu |
|------|------|
| `#servicos` | Gestão → Serviços |
| `#clientes` | Gestão → Clientes |
| `#orcamentos` | Comercial → Orçamentos |
| `#contas-receber` | Comercial → Contas a Receber |
| `#notas-fiscais` | Fiscal → Notas fiscais |
| `#config-fiscal` | Fiscal → Config. fiscal |

### Arquivos

- `src/ui/modules/commercial.module.js` — UI clientes, serviços, orçamentos, CR, fiscal
- `src/repositories/supabase/commercial.repository.js` — acesso Supabase
- `src/services/fiscal/fiscal-provider.js` — abstração FiscalProvider (stub)
- `src/services/quote-pdf.service.js` — PDF imprimível do orçamento
- `src/domain/features.js` — features `services`, `quotes`, `nfse`, `pix_charges`

## Fluxo implementado

```
Cliente → Serviço → Orçamento → Aprovar → Gerar CR → Gerar PIX → (webhook) → Recebido → Emitir NFS-e
```

## Integrações pendentes

| Integração | Estado |
|------------|--------|
| Provedor fiscal (Focus, eNotas, etc.) | Stub `FiscalProvider` |
| Gateway PIX (Asaas, Mercado Pago) | Stub em `create_pix_charge` |
| Edge Function webhook PIX | RPC `process_pix_payment_webhook` pronta (service_role) |
| E-mail / WhatsApp orçamento | Não implementado (PDF via impressão) |
| Nexus CFO insights fiscais | Schema pronto; prompt IA pendente |

## Variáveis de ambiente

Nenhuma nova no frontend. Segredos ficam no backend:

- `FISCAL_PROVIDER_API_KEY` (futuro)
- `PIX_WEBHOOK_SECRET` (futuro)
- Certificado A1 — secret manager, **nunca** em `fiscal_settings`

## Testes

- `npm run build` — OK
- Migrations 019–025 aplicadas no Supabase Nexus
- Migration 026 — aplicar após fix de cast (`limit_value::INTEGER`)

## Riscos restantes

1. Webhook PIX requer Edge Function com validação de assinatura
2. NFS-e stub não comunica com prefeitura — status `processing` manual
3. Módulos comerciais exigem **modo cloud** (Supabase)
4. Relatórios fiscais CSV/XLSX/PDF — Parte 22 pendente
5. Dashboard indicadores fiscais — Parte 19 parcial (via `#notas-fiscais`)

## Próximos passos

1. `supabase db push` (026 corrigida)
2. Edge Function `pix-webhook` chamando `process_pix_payment_webhook`
3. Implementar `AsaasPixProvider` / `FocusFiscalProvider`
4. Modal pós-pagamento “Emitir NFS-e?” (Parte 17)
5. Nexus CFO — contexto fiscal no `ai.service.js`
6. Testes E2E do fluxo completo (Parte 28)
