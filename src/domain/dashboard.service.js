/** Dashboard executivo — agregações puras a partir de dados reais */

import { sumByType, computeBalance, aggregateByMonth } from './finance.service.js';
import { calculateCrmMetrics, isOpenOpportunity, stageById } from './crm.service.js';
import {
  buildCashFlowProjection,
  computeStartingBalance,
  effectiveReceivableStatus,
  effectivePayableStatus,
  todayISO
} from './cashflow.service.js';

export function monthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}

export function txsInMonth(txs, key) {
  return (txs || []).filter(t => t.date?.startsWith(key));
}

export function sumByTypeInMonth(txs, type, key) {
  return sumByType(txsInMonth(txs, key), type);
}

export function comparePeriod(current, previous) {
  if (previous === 0 && current === 0) {
    return { text: 'Sem variação em relação ao mês anterior', direction: 'neutral', deltaPercent: 0 };
  }
  if (previous === 0) {
    return { text: 'Sem base no mês anterior', direction: 'up', deltaPercent: 100 };
  }
  const deltaPercent = ((current - previous) / Math.abs(previous)) * 100;
  const sign = deltaPercent >= 0 ? '+' : '';
  const formatted = `${sign}${deltaPercent.toFixed(1).replace('.', ',')}% comparado ao mês anterior`;
  return {
    text: formatted,
    direction: deltaPercent > 0.05 ? 'up' : deltaPercent < -0.05 ? 'down' : 'neutral',
    deltaPercent
  };
}

function openReceivableRemaining(row) {
  return Math.max(0, Number(row.amount || 0) - Number(row.received_amount || 0));
}

function openPayableRemaining(row) {
  return Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0));
}

export function summarizeReceivables(receivables, today = todayISO()) {
  let totalOpen = 0;
  let overdue = 0;
  (receivables || []).forEach(row => {
    const eff = effectiveReceivableStatus(row, today);
    if (!['pending', 'partial', 'overdue'].includes(eff)) return;
    const rem = openReceivableRemaining(row);
    totalOpen += rem;
    if (eff === 'overdue') overdue += rem;
  });
  return { totalOpen, overdue };
}

export function summarizePayables(payables, today = todayISO()) {
  let totalOpen = 0;
  let overdue = 0;
  (payables || []).forEach(row => {
    const eff = effectivePayableStatus(row, today);
    if (!['pending', 'partial', 'overdue'].includes(eff)) return;
    const rem = openPayableRemaining(row);
    totalOpen += rem;
    if (eff === 'overdue') overdue += rem;
  });
  return { totalOpen, overdue };
}

export function calculateFinancialMetrics({
  txs = [],
  accounts = [],
  receivables = [],
  payables = [],
  today = new Date()
} = {}) {
  const currentKey = monthKey(today);
  const prevKey = previousMonthKey(currentKey);

  const revenue = sumByTypeInMonth(txs, 'credit', currentKey);
  const expenses = sumByTypeInMonth(txs, 'debit', currentKey);
  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const prevRevenue = sumByTypeInMonth(txs, 'credit', prevKey);
  const prevExpenses = sumByTypeInMonth(txs, 'debit', prevKey);
  const prevProfit = prevRevenue - prevExpenses;

  const balance = accounts.length
    ? computeStartingBalance(accounts)
    : computeBalance(txs);

  const recv = summarizeReceivables(receivables, todayISO(today));
  const pay = summarizePayables(payables, todayISO(today));

  return {
    revenue,
    expenses,
    profit,
    margin,
    balance,
    receivablesOpen: recv.totalOpen,
    payablesOpen: pay.totalOpen,
    overdueTotal: recv.overdue + pay.overdue,
    comparisons: {
      revenue: comparePeriod(revenue, prevRevenue),
      expenses: comparePeriod(expenses, prevExpenses),
      profit: comparePeriod(profit, prevProfit)
    }
  };
}

export function calculateCommercialMetrics(opportunities = [], stages = []) {
  const base = calculateCrmMetrics(opportunities, stages);
  const openCount = opportunities.filter(o => isOpenOpportunity(o, stages)).length;

  return {
    pipelineTotal: base.pipelineTotal,
    openCount,
    closedSales: base.closedWonCount,
    closedValue: base.closedWonTotal,
    avgTicket: base.avgTicket,
    conversionRate: base.conversionRate
  };
}

export function calculateCashflowSnapshot({
  accounts = [],
  receivables = [],
  payables = [],
  recurring = [],
  txs = [],
  today = new Date()
} = {}) {
  const startingBalance = accounts.length
    ? computeStartingBalance(accounts)
    : computeBalance(txs);

  const projection = buildCashFlowProjection({
    startingBalance,
    horizonDays: 30,
    receivables,
    payables,
    recurring,
    txs,
    today
  });

  return {
    currentBalance: startingBalance,
    projection30: projection.projectedBalance
  };
}

export function buildMonthlySeries(txs, months = 6, today = new Date()) {
  const keys = [];
  const d = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(monthKey(dt));
  }

  const labels = keys.map(k => {
    const [y, m] = k.split('-');
    return `${m}/${y}`;
  });

  const credits = keys.map(k => sumByTypeInMonth(txs, 'credit', k));
  const debits = keys.map(k => sumByTypeInMonth(txs, 'debit', k));
  const profit = keys.map((_, i) => credits[i] - debits[i]);

  return { labels, credits, debits, profit, keys };
}

export function buildFunnelData(opportunities = [], stages = []) {
  const sorted = [...stages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const openStages = sorted.filter(s => !s.is_closed_won && !s.is_closed_lost);

  return openStages.map(stage => {
    const opps = opportunities.filter(o => o.stage_id === stage.id);
    const value = opps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
    return {
      label: stage.name,
      count: opps.length,
      value
    };
  });
}

export function buildExecutiveCharts({
  txs = [],
  receivables = [],
  payables = [],
  opportunities = [],
  stages = [],
  months = 6,
  today = new Date()
} = {}) {
  const series = buildMonthlySeries(txs, months, today);
  const recv = summarizeReceivables(receivables, todayISO(today));
  const pay = summarizePayables(payables, todayISO(today));
  const funnel = buildFunnelData(opportunities, stages);

  return {
    revExp: {
      labels: series.labels,
      credits: series.credits,
      debits: series.debits
    },
    revenueEvolution: {
      labels: series.labels,
      values: series.credits
    },
    monthlyProfit: {
      labels: series.labels,
      values: series.profit
    },
    arAp: {
      labels: ['A receber', 'A pagar'],
      values: [recv.totalOpen, pay.totalOpen]
    },
    funnel: {
      labels: funnel.map(f => f.label),
      counts: funnel.map(f => f.count),
      values: funnel.map(f => f.value)
    }
  };
}

/** Compatibilidade com gráficos legados do dashboard */
export { aggregateByMonth, sumByType };
