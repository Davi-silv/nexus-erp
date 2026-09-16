import { fmtMoney } from '../../core/utils.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { commercialRepo } from '../../repositories/supabase/commercial.repository.js';
import { crmRepo } from '../../repositories/supabase/crm.repository.js';
import {
  calculateFinancialMetrics,
  calculateCommercialMetrics,
  calculateCashflowSnapshot
} from '../../domain/dashboard.service.js';

function comparisonClass(metric, direction) {
  if (direction === 'neutral') return 'neutral';
  if (metric === 'expenses') return direction === 'down' ? 'positive' : 'negative';
  return direction === 'up' ? 'positive' : 'negative';
}

function execCard(label, value, compare, { metric, format = 'money', suffix = '' } = {}) {
  const display = format === 'money'
    ? fmtMoney(value)
    : format === 'percent'
      ? `${Number(value).toFixed(1).replace('.', ',')}%`
      : `${value}${suffix}`;

  const compareHtml = compare
    ? `<span class="exec-card__compare exec-card__compare--${comparisonClass(metric, compare.direction)}">${compare.text}</span>`
    : '';

  return `
    <article class="exec-card">
      <span class="exec-card__label">${label}</span>
      <strong class="exec-card__value">${display}</strong>
      ${compareHtml}
    </article>
  `;
}

export function initDashboardModule(store, charts) {
  const financialEl = document.getElementById('exec-financial');
  const commercialEl = document.getElementById('exec-commercial');
  const cashflowEl = document.getElementById('exec-cashflow');

  async function loadCloudData() {
    if (!isSupabaseEnabled || !store.workspaceId) {
      return { receivables: [], payables: [], opportunities: [], stages: [] };
    }
    try {
      const [receivables, payResult, stages, opportunities] = await Promise.all([
        commercialRepo.listReceivables(store.workspaceId),
        commercialRepo.listPayables(store.workspaceId, { limit: 1000 }),
        crmRepo.listStages(store.workspaceId).catch(() => []),
        crmRepo.listOpportunities(store.workspaceId).catch(() => [])
      ]);
      return {
        receivables,
        payables: payResult.rows || [],
        stages,
        opportunities
      };
    } catch {
      return { receivables: [], payables: [], opportunities: [], stages: [] };
    }
  }

  function renderFinancial(fin) {
    if (!financialEl) return;
    financialEl.innerHTML = [
      execCard('Receita do mês', fin.revenue, fin.comparisons.revenue, { metric: 'revenue' }),
      execCard('Despesas do mês', fin.expenses, fin.comparisons.expenses, { metric: 'expenses' }),
      execCard('Lucro', fin.profit, fin.comparisons.profit, { metric: 'profit' }),
      execCard('Margem', fin.margin, null, { format: 'percent' }),
      execCard('Saldo disponível', fin.balance, null),
      execCard('Contas a receber', fin.receivablesOpen, null),
      execCard('Contas a pagar', fin.payablesOpen, null),
      execCard('Valores vencidos', fin.overdueTotal, null)
    ].join('');
  }

  function renderCommercial(com) {
    if (!commercialEl) return;
    commercialEl.innerHTML = [
      execCard('Pipeline total', com.pipelineTotal, null),
      execCard('Oportunidades abertas', com.openCount, null, { format: 'number' }),
      execCard('Vendas fechadas', com.closedSales, null, { format: 'number' }),
      execCard('Ticket médio', com.avgTicket, null),
      execCard('Taxa de conversão', com.conversionRate, null, { format: 'percent' })
    ].join('');
  }

  function renderCashflow(cf) {
    if (!cashflowEl) return;
    cashflowEl.innerHTML = [
      execCard('Saldo atual', cf.currentBalance, null),
      execCard('Projeção 30 dias', cf.projection30, null)
    ].join('');
  }

  async function refresh() {
    if (!store.currentUserData) return;

    const { accounts, txs, recurring } = store.currentUserData;
    const cloud = await loadCloudData();

    const fin = calculateFinancialMetrics({
      txs,
      accounts,
      receivables: cloud.receivables,
      payables: cloud.payables
    });

    const com = calculateCommercialMetrics(cloud.opportunities, cloud.stages);

    const cf = calculateCashflowSnapshot({
      accounts,
      receivables: cloud.receivables,
      payables: cloud.payables,
      recurring,
      txs
    });

    renderFinancial(fin);
    renderCommercial(com);
    renderCashflow(cf);

    charts?.updateExecutive({
      txs,
      receivables: cloud.receivables,
      payables: cloud.payables,
      opportunities: cloud.opportunities,
      stages: cloud.stages
    });
  }

  return { refresh };
}
