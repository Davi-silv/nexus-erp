/** Lógica financeira pura — sem dependência de DOM ou storage */

export function sumByType(txs, type) {
  return txs.filter(t => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
}

export function computeBalance(txs) {
  return sumByType(txs, 'credit') - sumByType(txs, 'debit');
}

export function aggregateByMonth(txs) {
  const map = {};
  txs.forEach(t => {
    const parts = t.date?.split('-');
    if (!parts || parts.length < 2) return;
    const key = `${parts[0]}-${parts[1]}`;
    if (!map[key]) map[key] = { credit: 0, debit: 0 };
    if (t.type === 'credit') map[key].credit += Number(t.amount);
    else map[key].debit += Number(t.amount);
  });
  const keys = Object.keys(map).sort();
  return {
    labels: keys.map(k => {
      const [y, m] = k.split('-');
      return `${m}/${y}`;
    }),
    credits: keys.map(k => map[k].credit),
    debits: keys.map(k => map[k].debit)
  };
}

export function syncAccountBalances(accounts, txs) {
  return accounts.map(acc => {
    const accTxs = txs.filter(t => t.accountId === acc.id);
    const initial = acc.initialBalance ?? acc.balance ?? 0;
    const movement = computeBalance(accTxs);
    return { ...acc, balance: initial + movement };
  });
}

export function calculateHealthMetrics(userData) {
  if (!userData) return { score: 0, savingsRate: 0, expenseRatio: 0, metrics: { credits: 0, debits: 0, goalsProgress: [] } };

  const credits = sumByType(userData.txs, 'credit');
  const debits = sumByType(userData.txs, 'debit');
  const savingsRate = credits > 0 ? Math.max(0, Math.min(100, ((credits - debits) / credits) * 100)) : 0;
  const expenseRatio = credits > 0 ? Math.max(0, Math.min(100, (debits / credits) * 100)) : 0;

  let score = 50;
  if (savingsRate > 30) score += 30;
  else if (savingsRate > 15) score += 15;
  if (expenseRatio < 70) score += 15;
  else if (expenseRatio < 85) score += 5;
  if (credits > 0) score += 5;

  const goalsProgress = userData.goals.map(g => {
    const spent = userData.txs
      .filter(t => t.type === 'debit' && t.categoryId === g.categoryId)
      .reduce((s, t) => s + Number(t.amount), 0);
    return spent <= g.limit ? 100 : (g.limit / spent) * 100;
  });
  const avgGoalAdherence = goalsProgress.length > 0
    ? goalsProgress.reduce((s, p) => s + p, 0) / goalsProgress.length
    : 50;
  score = Math.min(100, Math.max(0, score + (avgGoalAdherence - 50) * 0.2));

  return {
    score: Math.round(score),
    savingsRate: Math.round(savingsRate),
    expenseRatio: Math.round(expenseRatio),
    metrics: { credits, debits, goalsProgress }
  };
}

export function categorySpent(txs, categoryId) {
  return txs
    .filter(t => t.type === 'debit' && t.categoryId === categoryId)
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function generateHealthRecommendations(health, userData) {
  const recs = [];
  if (health.savingsRate < 10) recs.push('🎯 Aumente sua poupança - tente economizar pelo menos 10% das receitas');
  if (health.expenseRatio > 80) recs.push('⚠️ Suas despesas são altas - revise categorias com maior gasto');
  if (health.metrics.credits === 0) recs.push('📊 Registre suas receitas para começar análise financeira');
  if (userData.goals.length === 0) recs.push('💡 Defina metas orçamentárias para melhor controle');
  if (health.score < 40) recs.push('🚨 Sua saúde financeira necessita atenção - revise seus gastos');
  else if (health.score >= 80) recs.push('✨ Parabéns! Você está com ótima saúde financeira');
  return recs;
}
