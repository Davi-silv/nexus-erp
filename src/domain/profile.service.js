/** Perfis de uso: Pessoa Física e Empresa (PME) */

export const PROFILE = { PF: 'pf', PJ: 'pj' };

export function isBusiness(user) {
  return user?.profileType === PROFILE.PJ;
}

export function getProfileType(user) {
  return user?.profileType === PROFILE.PJ ? PROFILE.PJ : PROFILE.PF;
}

export function getLabels(profileType) {
  if (profileType === PROFILE.PJ) {
    return {
      profileBadge: 'Empresa · PME',
      income: 'Faturamento',
      expense: 'Despesas operacionais',
      balance: 'Fluxo de caixa',
      healthTitle: 'Indicadores da Empresa',
      healthScore: 'Score financeiro',
      savings: 'Margem líquida',
      expenseRatio: 'Custo operacional',
      categories: 'Plano de contas',
      goals: 'Orçamentos por conta',
      transactions: 'Lançamentos contábeis',
      counterparty: 'Cliente / Fornecedor',
      docNumber: 'Nº documento (NF)',
      costCenter: 'Centro de custo',
      dashboardTitle: 'Visão geral do negócio',
      dashboardDesc: 'Monitore faturamento, despesas operacionais e fluxo de caixa da sua empresa em tempo real.',
      authHero: 'Gestão financeira para PMEs',
      authDesc: 'Fluxo de caixa, centros de custo, DRE simplificado e conciliação — feito para pequenas e médias empresas.',
      registerName: 'Razão social ou responsável',
      companySection: 'Dados da empresa'
    };
  }
  return {
    profileBadge: 'Pessoa Física',
    income: 'Receitas mensais',
    expense: 'Despesas mensais',
    balance: 'Saldo disponível',
    healthTitle: 'Saúde Financeira',
    healthScore: 'Score de Saúde',
    savings: 'Taxa de Poupança',
    expenseRatio: 'Índice de Despesa',
    categories: 'Categorias',
    goals: 'Metas Mensais',
    transactions: 'Lançamentos',
    counterparty: 'Origem / Destino',
    docNumber: 'Referência',
    costCenter: 'Centro de custo',
    dashboardTitle: 'Visão geral financeira',
    dashboardDesc: 'Monitore receitas, despesas e metas pessoais em um painel centralizado.',
    authHero: 'Controle total das suas finanças',
    authDesc: 'Dashboard inteligente, metas, análise com IA e relatórios — ideal para finanças pessoais.',
    registerName: 'Nome completo',
    companySection: 'Dados pessoais'
  };
}

export function getDefaultCategories(profileType) {
  if (profileType === PROFILE.PJ) {
    return [
      { name: 'Vendas / Receitas', color: '#34d399' },
      { name: 'Fornecedores', color: '#f87171' },
      { name: 'Folha de pagamento', color: '#818cf8' },
      { name: 'Impostos e taxas', color: '#fbbf24' },
      { name: 'Marketing', color: '#f472b6' },
      { name: 'Aluguel e facilities', color: '#22d3ee' },
      { name: 'Serviços terceiros', color: '#a78bfa' },
      { name: 'Administrativo', color: '#94a3b8' }
    ];
  }
  return [
    { name: 'Alimentação', color: '#34d399' },
    { name: 'Transporte', color: '#818cf8' },
    { name: 'Moradia', color: '#22d3ee' },
    { name: 'Lazer', color: '#f472b6' },
    { name: 'Saúde', color: '#f87171' },
    { name: 'Educação', color: '#fbbf24' },
    { name: 'Investimentos', color: '#6ee7b7' },
    { name: 'Outros', color: '#94a3b8' }
  ];
}

export function formatCNPJ(value) {
  const d = String(value || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function calculateDRE(txs, categories) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const revenue = txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const byCategory = {};

  txs.filter(t => t.type === 'debit').forEach(t => {
    const name = t.categoryId ? (catMap[t.categoryId] || 'Sem categoria') : 'Sem categoria';
    byCategory[name] = (byCategory[name] || 0) + Number(t.amount);
  });

  return {
    revenue,
    expenses,
    net: revenue - expenses,
    margin: revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0,
    byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  };
}
