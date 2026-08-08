# Modelo de monetização

Configuração de referência em `src/config/plans.config.js`.

## Estratégia: Freemium + assinatura mensal

### Pessoa Física (PF)

| Plano | Preço | Limites principais |
|-------|-------|-------------------|
| **Grátis** | R$ 0 | 3 contas, 500 lançamentos, 5 IA/mês |
| **Pro** | R$ 19,90/mês | 20 contas, IA ilimitada*, relatórios avançados |

*Fair use policy recomendada.

### Empresa PME (PJ)

| Plano | Preço | Limites principais |
|-------|-------|-------------------|
| **Starter** | R$ 49,90/mês | 5 bancos, 3 usuários, DRE |
| **Business** | R$ 99,90/mês | 20 bancos, 10 usuários, conciliação avançada |

## Add-ons futuros

| Add-on | Preço sugerido |
|--------|----------------|
| Usuário extra (PJ) | R$ 9,90/mês |
| Open Banking sync | R$ 29,90/mês |
| Portal contador | R$ 39,90/mês |
| White-label | Sob consulta |

## Gateways de pagamento (Brasil)

| Provedor | Uso |
|----------|-----|
| **Asaas** | Boleto + PIX + cartão, NF automática |
| **Stripe** | Cartão internacional, UX excelente |
| **Mercado Pago** | Alcance massa BR |

Recomendação PME BR: **Asaas** (PIX nativo) + Stripe para expansão.

## Métricas financeiras alvo

| Métrica | Meta ano 1 |
|---------|------------|
| MRR | R$ 15.000 |
| Churn mensal | < 5% |
| LTV/CAC | > 3x |
| ARPU | R$ 45 |

## Implementação técnica (Fase 3)

1. Stripe/Asaas Customer + Subscription
2. Webhook `invoice.paid` / `subscription.deleted`
3. Campo `plan_id` no user (backend)
4. Middleware de feature gate:

```js
if (!user.plan.features.aiAnalysis) showUpgradeModal();
```

5. Página `/planos` no app com checkout link

## Trial

- **PJ Business:** 14 dias grátis, cartão opcional
- **PF Pro:** 7 dias via cupom launch

## Lançamento (go-to-market)

1. **Beta fechado** — 50 usuários, plano grátis vitalício (early adopters)
2. **Launch Product Hunt / LinkedIn** — PF Pro 50% off 3 meses
3. **Parcerias contadores** — revenda PJ Starter com comissão 20%
