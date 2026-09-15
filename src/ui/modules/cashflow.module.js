import { fmtMoney } from '../../core/utils.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { commercialRepo } from '../../repositories/supabase/commercial.repository.js';
import { FEATURES } from '../../domain/features.js';
import {
  buildCashFlowProjection,
  generateCashFlowAlerts,
  computeStartingBalance,
  hasProjectionData
} from '../../domain/cashflow.service.js';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
  { days: 60, label: '60 dias' },
  { days: 90, label: '90 dias' }
];

export function initCashflowModule(store, auth, router, subscription, charts) {
  const summaryEl = document.getElementById('cashflow-summary');
  const alertsEl = document.getElementById('cashflow-alerts');
  const tableBody = document.getElementById('cashflow-body');
  const emptyEl = document.getElementById('cashflow-empty');
  const contentEl = document.getElementById('cashflow-content');
  const lockedEl = document.getElementById('cashflow-locked');
  const periodBar = document.getElementById('cashflow-periods');

  let horizonDays = 30;
  let lastProjection = null;

  function renderPeriodButtons() {
    if (!periodBar) return;
    periodBar.innerHTML = PERIODS.map(p => `
      <button type="button" class="cashflow-period-btn${p.days === horizonDays ? ' active' : ''}" data-days="${p.days}">
        ${p.label}
      </button>
    `).join('');
  }

  function renderSummary(projection) {
    if (!summaryEl) return;
    summaryEl.innerHTML = `
      <div class="metric-card"><span>Saldo atual</span><strong>${fmtMoney(projection.startingBalance)}</strong></div>
      <div class="metric-card metric-card--income"><span>Entradas previstas</span><strong>${fmtMoney(projection.totalInflow)}</strong></div>
      <div class="metric-card metric-card--expense"><span>Saídas previstas</span><strong>${fmtMoney(projection.totalOutflow)}</strong></div>
      <div class="metric-card"><span>Saldo projetado</span><strong>${fmtMoney(projection.projectedBalance)}</strong></div>
    `;
  }

  function renderAlerts(alerts) {
    if (!alertsEl) return;
    alertsEl.innerHTML = alerts.length
      ? alerts.map(a => `<div class="cashflow-alert cashflow-alert--${a.type}">${a.text}</div>`).join('')
      : '';
  }

  function renderTable(projection) {
    if (!tableBody) return;
    tableBody.innerHTML = projection.points.length
      ? projection.points.map(p => `
        <tr>
          <td>${formatDateBR(p.date)}</td>
          <td class="text-income">${p.inflow > 0 ? fmtMoney(p.inflow) : '—'}</td>
          <td class="text-expense">${p.outflow > 0 ? fmtMoney(p.outflow) : '—'}</td>
          <td><strong>${fmtMoney(p.balance)}</strong></td>
        </tr>
      `).join('')
      : '<tr><td colspan="4">Nenhum movimento previsto no período.</td></tr>';
  }

  function formatDateBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function showEmpty() {
    emptyEl?.classList.remove('hidden');
    contentEl?.classList.add('hidden');
  }

  function showContent() {
    emptyEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
  }

  async function loadData() {
    const accounts = store.currentUserData?.accounts ?? [];
    const recurring = (store.currentUserData?.recurring ?? []).filter(r => r.active !== false);
    const txs = store.currentUserData?.txs ?? [];
    let receivables = [];
    let payables = [];

    if (isSupabaseEnabled && store.workspaceId) {
      try {
        const [recv, pay] = await Promise.all([
          commercialRepo.listReceivables(store.workspaceId),
          commercialRepo.listPayables(store.workspaceId, { limit: 1000 })
        ]);
        receivables = recv;
        payables = pay.rows || [];
      } catch (err) {
        console.warn('[cashflow] Erro ao carregar AR/AP:', err);
      }
    }

    return { accounts, recurring, txs, receivables, payables };
  }

  async function refresh() {
    renderPeriodButtons();

    if (!store.isAuthenticated()) return;

    const allowed = await subscription.canUseFeature(FEATURES.CASH_PROJECTION);
    if (subscription.isCloudEnforced() && !allowed) {
      lockedEl?.classList.remove('hidden');
      contentEl?.classList.add('hidden');
      emptyEl?.classList.add('hidden');
      return;
    }
    lockedEl?.classList.add('hidden');

    await store.loadUserData();
    const data = await loadData();
    const startingBalance = computeStartingBalance(data.accounts);

    if (!hasProjectionData(data)) {
      showEmpty();
      charts?.updateCashflow?.({ labels: [], balance: [] });
      return;
    }

    showContent();
    const projection = buildCashFlowProjection({
      startingBalance,
      horizonDays,
      receivables: data.receivables,
      payables: data.payables,
      recurring: data.recurring,
      txs: data.txs
    });
    lastProjection = projection;

    renderSummary(projection);
    renderAlerts(generateCashFlowAlerts(projection, data));
    renderTable(projection);
    charts?.updateCashflow?.({
      labels: projection.points.map(p => formatDateBR(p.date)),
      balance: projection.points.map(p => p.balance)
    });
  }

  periodBar?.addEventListener('click', e => {
    const days = parseInt(e.target.dataset.days, 10);
    if (!days || days === horizonDays) return;
    horizonDays = days;
    refresh();
  });

  document.getElementById('cashflow-empty-accounts')?.addEventListener('click', () => router.navigate('contas'));
  document.getElementById('cashflow-empty-receivables')?.addEventListener('click', () => router.navigate('contas-receber'));
  document.getElementById('cashflow-empty-payables')?.addEventListener('click', () => router.navigate('contas-pagar'));
  document.getElementById('cashflow-empty-recurring')?.addEventListener('click', () => router.navigate('recorrentes'));
  document.getElementById('cashflow-upgrade')?.addEventListener('click', () => router.navigate('planos'));

  return { refresh };
}
