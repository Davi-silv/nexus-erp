# Roadmap até o lançamento comercial

## Estado atual — v2.0 (MVP local)

- [x] Arquitetura modular (domain, repositories, UI modules)
- [x] Perfis PF e PJ
- [x] Bancos & Cartões (PJ)
- [x] PWA instalável
- [x] Testes unitários, integração e E2E
- [x] CI GitHub Actions (workflow local pronto)
- [ ] Backend / autenticação cloud
- [ ] Billing / assinaturas
- [ ] Domínio e deploy produção

---

## Fase 1 — Product-Market Fit (0–2 meses)

**Objetivo:** validar com usuários reais em ambiente hospedado.

| Entrega | Prioridade |
|---------|------------|
| Deploy estático (Vercel/Netlify/Cloudflare) | Alta |
| Domínio + HTTPS | Alta |
| Landing page de captura (waitlist) | Alta |
| Analytics (Plausible/GA4) | Média |
| Feedback in-app (botão “Enviar sugestão”) | Média |
| Termos de uso + Política de privacidade | Alta |

**Stack sugerida:** `dist/` via CDN + formulário waitlist (Formspree/Tally).

---

## Fase 2 — SaaS Foundation (2–4 meses)

**Objetivo:** sair do localStorage e habilitar multi-dispositivo.

```
Frontend (Vite/React ou manter vanilla)
        ↓ REST/GraphQL
API (Node/Fastify ou Supabase)
        ↓
PostgreSQL + Redis (sessões)
        ↓
Stripe / Asaas (pagamentos BR)
```

| Entrega | Detalhe |
|---------|---------|
| API de autenticação | JWT + refresh token |
| Sync de dados | Migrar repositories para HTTP |
| Backup automático | Snapshots diários |
| Rate limit IA | Por plano (`plans.config.js`) |
| Email transacional | Resend/SES (boas-vindas, reset senha) |

Ver `docs/BACKEND-MIGRATION.md` para estratégia de migração.

---

## Fase 3 — Monetização (4–6 meses)

**Objetivo:** receita recorrente.

| Plano | Preço sugerido | Público |
|-------|----------------|---------|
| PF Grátis | R$ 0 | Aquisição |
| PF Pro | R$ 19,90/mês | Power users PF |
| PME Starter | R$ 49,90/mês | MEI / micro |
| PME Business | R$ 99,90/mês | PME 5–20 func. |

| Entrega | Detalhe |
|---------|---------|
| Stripe/Asaas checkout | Portal de assinatura |
| Feature gating | `APP_CONFIG.features` + backend |
| Trial 14 dias | PJ Business |
| Nota fiscal de serviço | Integração contábil parceiro |

---

## Fase 4 — Escala (6–12 meses)

| Entrega | Impacto |
|---------|---------|
| Open Banking (Pluggy/Belvo) | Conciliação automática PJ |
| App nativo (Capacitor) | Stores iOS/Android |
| Portal do contador | Exportação SPED/DRE |
| API pública | Integrações ERP/contábil |
| White-label | Revenda para contadores |

---

## Organização do repositório (evolução)

```
nexus-erp/
├── docs/              # Produto, legal, deploy, roadmap
├── src/               # Frontend atual
├── server/            # (Fase 2) API backend
├── packages/          # (Fase 4) shared types, SDK
├── marketing/         # (Fase 1) landing page
├── infra/             # (Fase 2) Terraform/Docker
└── tests/
```

---

## Checklist pré-lançamento público

- [ ] Domínio registrado
- [ ] SSL ativo
- [ ] Política de privacidade (LGPD)
- [ ] Termos de uso
- [ ] Canal de suporte (email/WhatsApp Business)
- [ ] Monitoramento de erros (Sentry)
- [ ] Backup de dados (quando houver backend)
- [ ] Página de status (Statuspage)
- [ ] Processo de onboarding documentado
