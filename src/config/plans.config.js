/**
 * Catálogo comercial — fallback local e referência de preços.
 * Fonte de verdade em produção: PostgreSQL (plans + plan_features).
 */
export const COMMERCIAL_PLANS = [
  {
    slug: 'personal',
    name: 'Nexus Pessoal',
    description: 'Controle financeiro pessoal completo',
    price_monthly: 19.9,
    currency: 'BRL',
    recommended: false,
    sort_order: 1
  },
  {
    slug: 'start',
    name: 'Nexus Start',
    description: 'Autônomos e MEIs — fluxo de caixa e operacional',
    price_monthly: 49.9,
    currency: 'BRL',
    recommended: false,
    sort_order: 2
  },
  {
    slug: 'pro',
    name: 'Nexus Pro',
    description: 'MEIs e pequenas empresas — gestão financeira completa',
    price_monthly: 99.9,
    currency: 'BRL',
    recommended: true,
    sort_order: 3
  },
  {
    slug: 'business',
    name: 'Nexus Business',
    description: 'Empresas em crescimento — escala e auditoria',
    price_monthly: 179.9,
    currency: 'BRL',
    recommended: false,
    sort_order: 4
  }
];

/** @deprecated — use COMMERCIAL_PLANS / subscription.service */
export const PLANS = {
  pf: {
    free: {
      id: 'pf-free',
      name: 'Nexus PF Grátis',
      priceMonthly: 0,
      profiles: ['pf'],
      limits: { accounts: 3, transactions: 500, cards: 2, aiRequestsMonth: 5 }
    },
    pro: {
      id: 'pf-pro',
      name: 'Nexus PF Pro',
      priceMonthly: 19.9,
      profiles: ['pf'],
      limits: { accounts: 20, transactions: 10000, cards: 10, aiRequestsMonth: 100 },
      highlights: ['Metas ilimitadas', 'Relatórios avançados', 'IA prioritária', 'Suporte email']
    }
  },
  pj: {
    starter: {
      id: 'pj-starter',
      name: 'Nexus PME Starter',
      priceMonthly: 49.9,
      profiles: ['pj'],
      limits: { accounts: 5, users: 3, costCenters: 10, aiRequestsMonth: 20 },
      highlights: ['Bancos & Cartões', 'DRE simplificado', 'Centros de custo', 'Até 3 usuários']
    },
    business: {
      id: 'pj-business',
      name: 'Nexus PME Business',
      priceMonthly: 99.9,
      profiles: ['pj'],
      limits: { accounts: 20, users: 10, costCenters: 50, aiRequestsMonth: 200 },
      highlights: ['Multi-usuário', 'Conciliação avançada', 'Exportação contábil', 'Suporte prioritário']
    }
  }
};

export function getPlansForProfile(profileType) {
  return profileType === 'pj' ? PLANS.pj : PLANS.pf;
}
