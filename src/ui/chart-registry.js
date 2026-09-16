import { fmtMoney, escapeHtml } from '../core/utils.js';
import { buildExecutiveCharts } from '../domain/dashboard.service.js';

const CHART_DEFAULTS = {
  grid: { color: 'rgba(255,255,255,0.04)' },
  tick: { color: '#64748b' },
  legend: { color: '#94a3b8', usePointStyle: true }
};

/** Registro centralizado de instâncias Chart.js — evita variáveis globais espalhadas */
export class ChartRegistry {
  #charts = {};

  get(id) {
    return this.#charts[id];
  }

  create(id, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (this.#charts[id]) {
      this.#charts[id].destroy();
    }
    this.#charts[id] = new Chart(canvas.getContext('2d'), config);
    return this.#charts[id];
  }

  update(id, updater) {
    const chart = this.#charts[id];
    if (!chart) return;
    updater(chart);
    chart.update();
  }

  initExecutive() {
    this.create('execRevExp', 'chart-exec-rev-exp', {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Receitas', data: [], backgroundColor: 'rgba(52, 211, 153, 0.85)', borderRadius: 6 },
          { label: 'Despesas', data: [], backgroundColor: 'rgba(248, 113, 113, 0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.tick },
          x: { grid: { display: false }, ticks: CHART_DEFAULTS.tick }
        },
        plugins: { legend: { labels: CHART_DEFAULTS.legend } }
      }
    });

    this.create('execRevenue', 'chart-exec-revenue', {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Faturamento',
          data: [],
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#34d399'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.tick },
          x: { grid: { display: false }, ticks: CHART_DEFAULTS.tick }
        }
      }
    });

    this.create('execProfit', 'chart-exec-profit', {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Lucro',
          data: [],
          backgroundColor: ctx => {
            const v = ctx.raw;
            return v >= 0 ? 'rgba(99, 102, 241, 0.85)' : 'rgba(248, 113, 113, 0.85)';
          },
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.tick },
          x: { grid: { display: false }, ticks: CHART_DEFAULTS.tick }
        }
      }
    });

    this.create('execArAp', 'chart-exec-ar-ap', {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: ['rgba(52, 211, 153, 0.85)', 'rgba(248, 113, 113, 0.85)'],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.tick },
          x: { grid: { display: false }, ticks: CHART_DEFAULTS.tick }
        }
      }
    });

    this.create('execFunnel', 'chart-exec-funnel', {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Oportunidades',
          data: [],
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: CHART_DEFAULTS.grid, ticks: { ...CHART_DEFAULTS.tick, stepSize: 1 } },
          y: { grid: { display: false }, ticks: CHART_DEFAULTS.tick }
        }
      }
    });
  }

  updateExecutive({ txs = [], receivables = [], payables = [], opportunities = [], stages = [] } = {}) {
    const data = buildExecutiveCharts({ txs, receivables, payables, opportunities, stages });

    this.update('execRevExp', c => {
      c.data.labels = data.revExp.labels;
      c.data.datasets[0].data = data.revExp.credits;
      c.data.datasets[1].data = data.revExp.debits;
    });
    this.update('execRevenue', c => {
      c.data.labels = data.revenueEvolution.labels;
      c.data.datasets[0].data = data.revenueEvolution.values;
    });
    this.update('execProfit', c => {
      c.data.labels = data.monthlyProfit.labels;
      c.data.datasets[0].data = data.monthlyProfit.values;
    });
    this.update('execArAp', c => {
      c.data.labels = data.arAp.labels;
      c.data.datasets[0].data = data.arAp.values;
    });
    this.update('execFunnel', c => {
      c.data.labels = data.funnel.labels.length ? data.funnel.labels : ['Sem etapas'];
      c.data.datasets[0].data = data.funnel.counts.length ? data.funnel.counts : [0];
    });
  }

  /** @deprecated use initExecutive */
  initDashboard() { this.initExecutive(); }

  /** @deprecated use updateExecutive via dashboard module */
  updateDashboard(txs) { this.updateExecutive({ txs }); }

  initCategories() {
    this.create('categories', 'chart-categories', {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: '#02050a', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  updateCategories(categories, txs) {
    const labels = categories.map(c => c.name);
    const data = categories.map(c =>
      txs.filter(t => t.type === 'debit' && t.categoryId === c.id).reduce((s, t) => s + Number(t.amount), 0)
    );
    const colors = categories.map(c => c.color + 'cc');
    this.update('categories', c => {
      c.data.labels = labels;
      c.data.datasets[0].data = data;
      c.data.datasets[0].backgroundColor = colors;
    });
  }

  initHealth() {
    this.create('healthEvolution', 'chart-health-evolution', {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Score', data: [], borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.12)', fill: true, tension: 0.4, pointBackgroundColor: '#818cf8' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }, x: { grid: { display: false }, ticks: { color: '#64748b' } } } }
    });
    this.create('healthRatio', 'chart-health-ratio', {
      type: 'bar',
      data: { labels: ['Receitas', 'Despesas'], datasets: [{ data: [0, 0], backgroundColor: ['rgba(52,211,153,0.85)', 'rgba(248,113,113,0.85)'], borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: false }, scales: { x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
    });
  }

  updateHealth(healthHistory, health) {
    const last12 = healthHistory.slice(-12);
    this.update('healthEvolution', c => {
      c.data.labels = last12.map(h => new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
      c.data.datasets[0].data = last12.map(h => h.score);
    });
    this.update('healthRatio', c => {
      c.data.datasets[0].data = [health.metrics.credits, health.metrics.debits];
    });
  }

  initCards() {
    this.create('chargesType', 'chart-charges-type', {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: ['rgba(99,102,241,0.9)', 'rgba(52,211,153,0.9)', 'rgba(244,114,182,0.9)', 'rgba(34,211,238,0.9)', 'rgba(251,191,36,0.9)'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    this.create('chargesTrend', 'chart-charges-trend', {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Encargos', data: [], borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.4, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }, x: { grid: { display: false }, ticks: { color: '#64748b' } } }, plugins: { legend: { display: false } } }
    });
    this.create('chargesCard', 'chart-charges-card', {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Encargos', data: [], backgroundColor: 'rgba(99,102,241,0.8)', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false } } }
    });
  }

  initCashflow() {
    this.create('cashflow', 'chart-cashflow', {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Saldo projetado',
          data: [],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#818cf8'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#64748b',
              callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR')
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', maxTicksLimit: 10 }
          }
        }
      }
    });
  }

  updateCashflow({ labels, balance }) {
    this.update('cashflow', c => {
      c.data.labels = labels;
      c.data.datasets[0].data = balance;
    });
  }

  updateCards(charges, cards) {
    const typeMap = { annual_fee: 'Taxa Anual', interest: 'Juros', annuity: 'Anuidade', insurance: 'Seguro', other: 'Outro' };
    const typeData = {};
    charges.forEach(c => {
      const label = typeMap[c.type] || c.type;
      typeData[label] = (typeData[label] || 0) + Number(c.amount);
    });
    this.update('chargesType', c => {
      c.data.labels = Object.keys(typeData);
      c.data.datasets[0].data = Object.values(typeData);
    });

    const monthData = {};
    charges.forEach(c => { monthData[c.date.slice(0, 7)] = (monthData[c.date.slice(0, 7)] || 0) + Number(c.amount); });
    const months = Object.keys(monthData).sort();
    this.update('chargesTrend', c => {
      c.data.labels = months.map(m => { const [y, mo] = m.split('-'); return `${mo}/${y}`; });
      c.data.datasets[0].data = months.map(m => monthData[m]);
    });

    const cardData = {};
    charges.forEach(c => {
      const card = cards.find(ca => ca.id === c.cardId);
      const name = card ? `${card.name} (****${card.last4})` : 'Desconhecido';
      cardData[name] = (cardData[name] || 0) + Number(c.amount);
    });
    this.update('chargesCard', c => {
      c.data.labels = Object.keys(cardData);
      c.data.datasets[0].data = Object.values(cardData);
    });
  }
}

export function renderAccountSelect(select, accounts, placeholder = 'Selecione a conta') {
  if (!select) return;
  select.innerHTML = '';
  if (!accounts.length) {
    select.innerHTML = `<option value="">Nenhuma conta disponível</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = `<option value="">${placeholder}</option>` +
    accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${escapeHtml(a.bank)})</option>`).join('');
}

export { fmtMoney, escapeHtml };
