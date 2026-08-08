import { fmtMoney } from '../../core/utils.js';
import { calculateHealthMetrics, generateHealthRecommendations } from '../../domain/finance.service.js';

export function initHealthModule(store, charts) {
  const healthScoreEl = document.getElementById('health-score');
  const savingsRateEl = document.getElementById('savings-rate');
  const expenseRatioEl = document.getElementById('expense-ratio');
  const healthIndicatorsDiv = document.getElementById('health-indicators');
  const healthRecommendationsDiv = document.getElementById('health-recommendations');

  function updateHealthMetrics() {
    if (!store.currentUserData) return;
    const health = calculateHealthMetrics(store.currentUserData);

    if (healthScoreEl) healthScoreEl.textContent = health.score;
    if (savingsRateEl) savingsRateEl.textContent = health.savingsRate + '%';
    if (expenseRatioEl) expenseRatioEl.textContent = health.expenseRatio + '%';

    if (healthIndicatorsDiv) {
      const balance = health.metrics.credits - health.metrics.debits;
      healthIndicatorsDiv.innerHTML = `
        <div class="card health-score-card">
          <div class="health-score-value">${health.score}</div>
          <div class="health-score-label">Pontuação de Saúde (0-100)</div>
        </div>
        <div class="card"><strong>Receitas (mês):</strong><br>${fmtMoney(health.metrics.credits)}</div>
        <div class="card"><strong>Despesas (mês):</strong><br>${fmtMoney(health.metrics.debits)}</div>
        <div class="card"><strong>Saldo (mês):</strong><br>
          <span class="${balance >= 0 ? 'credit' : 'debit'}">${fmtMoney(balance)}</span>
        </div>
      `;
    }

    const recs = generateHealthRecommendations(health, store.currentUserData);
    if (healthRecommendationsDiv) {
      healthRecommendationsDiv.innerHTML = recs.map(r =>
        `<div class="health-rec">${r}</div>`
      ).join('');
    }

    charts.updateHealth(store.currentUserData.healthHistory, health);

    const today = new Date().toISOString().split('T')[0];
    const record = store.currentUserData.healthHistory.find(h => h.date === today);
    if (record) record.score = health.score;
    else store.currentUserData.healthHistory.push({ date: today, score: health.score });
    store.saveUserData({ silent: true });

    return health;
  }

  return { updateHealthMetrics, calculateHealthMetrics: () => calculateHealthMetrics(store.currentUserData) };
}
