/**
 * Planos comerciais — estrutura legada informativa.
 * Fonte de verdade: PostgreSQL (plans + plan_features) via subscription.service.js
 */
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
