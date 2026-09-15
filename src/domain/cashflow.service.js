/** Projeção de fluxo de caixa — lógica pura (testável) */

function fmtAlertAmount(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso + 'T12:00:00');
  const b = new Date(toIso + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function normalizeFrequency(freq) {
  const map = {
    diaria: 'daily', daily: 'daily',
    semanal: 'weekly', weekly: 'weekly', biweekly: 'biweekly',
    mensal: 'monthly', monthly: 'monthly',
    anual: 'yearly', yearly: 'yearly'
  };
  return map[freq] || 'monthly';
}

export function advanceDateISO(isoDate, frequency) {
  const d = new Date(isoDate + 'T12:00:00');
  const f = normalizeFrequency(frequency);
  if (f === 'daily') d.setDate(d.getDate() + 1);
  else if (f === 'weekly') d.setDate(d.getDate() + 7);
  else if (f === 'biweekly') d.setDate(d.getDate() + 14);
  else if (f === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function effectiveReceivableStatus(row, today = todayISO()) {
  if (row.status === 'received' || row.status === 'cancelled') return row.status;
  const received = Number(row.received_amount || 0);
  const amount = Number(row.amount || 0);
  if (received > 0 && received < amount) return 'partial';
  if (row.due_date && row.due_date < today && received < amount) return 'overdue';
  return row.status || 'pending';
}

export function effectivePayableStatus(row, today = todayISO()) {
  if (row.status === 'paid' || row.status === 'cancelled') return row.status;
  const paid = Number(row.paid_amount || 0);
  const amount = Number(row.amount || 0);
  if (paid > 0 && paid < amount) return 'partial';
  if (row.due_date && row.due_date < today && paid < amount) return 'overdue';
  return row.status || 'pending';
}

function isOpenReceivable(row, today) {
  const eff = effectiveReceivableStatus(row, today);
  return ['pending', 'partial', 'overdue'].includes(eff);
}

function isOpenPayable(row, today) {
  const eff = effectivePayableStatus(row, today);
  return ['pending', 'partial', 'overdue'].includes(eff);
}

function eventDateForDue(dueDate, today) {
  if (!dueDate) return today;
  return dueDate < today ? today : dueDate;
}

export function collectReceivableEvents(receivables, today, horizonEnd) {
  const events = [];
  (receivables || []).forEach(row => {
    if (!isOpenReceivable(row, today)) return;
    const remaining = Number(row.amount) - Number(row.received_amount || 0);
    if (remaining <= 0) return;
    const date = eventDateForDue(row.due_date, today);
    if (date > horizonEnd) return;
    events.push({
      date,
      amount: remaining,
      source: 'receivable',
      label: row.description || 'Conta a receber'
    });
  });
  return events;
}

export function collectPayableEvents(payables, today, horizonEnd) {
  const events = [];
  const recurringGroups = new Set();

  (payables || []).forEach(row => {
    if (!isOpenPayable(row, today)) return;
    const remaining = Number(row.amount) - Number(row.paid_amount || 0);
    if (remaining <= 0) return;

    const date = eventDateForDue(row.due_date, today);
    if (date <= horizonEnd) {
      events.push({
        date,
        amount: -remaining,
        source: 'payable',
        label: row.description || 'Conta a pagar'
      });
    }

    if (row.is_recurring && row.recurrence_frequency) {
      const group = row.recurrence_group_id || row.id;
      if (recurringGroups.has(group)) return;
      recurringGroups.add(group);

      let nextDue = advanceDateISO(row.due_date || today, row.recurrence_frequency);
      while (nextDue <= horizonEnd) {
        events.push({
          date: nextDue,
          amount: -Number(row.amount),
          source: 'payable_recurring',
          label: row.description || 'Conta recorrente'
        });
        nextDue = advanceDateISO(nextDue, row.recurrence_frequency);
      }
    }
  });
  return events;
}

export function collectRecurringEvents(recurring, today, horizonEnd) {
  const events = [];
  (recurring || []).forEach(rec => {
    if (rec.active === false) return;
    const endDate = rec.endDate || rec.end_date;
    let next = rec.nextOccurrence || rec.next_execution || rec.startDate || rec.start_date || today;
    if (next < today) next = today;

    while (next <= horizonEnd) {
      if (endDate && next > endDate) break;
      const signed = rec.type === 'credit' || rec.type === 'income'
        ? Number(rec.amount)
        : -Number(rec.amount);
      events.push({
        date: next,
        amount: signed,
        source: 'recurring',
        label: rec.desc || rec.description || 'Recorrente'
      });
      next = advanceDateISO(next, rec.frequency || 'monthly');
    }
  });
  return events;
}

export function collectFutureTransactionEvents(txs, today, horizonEnd) {
  const events = [];
  (txs || []).forEach(tx => {
    if (!tx.date || tx.date <= today || tx.date > horizonEnd) return;
    const signed = tx.type === 'credit' ? Number(tx.amount) : -Number(tx.amount);
    events.push({
      date: tx.date,
      amount: signed,
      source: 'transaction',
      label: tx.desc || tx.description || 'Lançamento'
    });
  });
  return events;
}

export function buildCashFlowProjection({
  startingBalance = 0,
  horizonDays = 30,
  receivables = [],
  payables = [],
  recurring = [],
  txs = [],
  today = new Date()
} = {}) {
  const todayStr = todayISO(today);
  const horizonEnd = addDaysISO(todayStr, horizonDays);

  const events = [
    ...collectReceivableEvents(receivables, todayStr, horizonEnd),
    ...collectPayableEvents(payables, todayStr, horizonEnd),
    ...collectRecurringEvents(recurring, todayStr, horizonEnd),
    ...collectFutureTransactionEvents(txs, todayStr, horizonEnd)
  ];

  const buckets = new Map();
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDaysISO(todayStr, i);
    buckets.set(date, { date, inflow: 0, outflow: 0 });
  }

  events.forEach(ev => {
    let date = ev.date;
    if (date < todayStr) date = todayStr;
    if (date > horizonEnd || !buckets.has(date)) return;
    const b = buckets.get(date);
    if (ev.amount >= 0) b.inflow += ev.amount;
    else b.outflow += Math.abs(ev.amount);
  });

  let balance = Number(startingBalance);
  let totalInflow = 0;
  let totalOutflow = 0;
  const points = [];

  [...buckets.keys()].sort().forEach(date => {
    const b = buckets.get(date);
    balance += b.inflow - b.outflow;
    totalInflow += b.inflow;
    totalOutflow += b.outflow;
    points.push({
      date,
      inflow: b.inflow,
      outflow: b.outflow,
      balance
    });
  });

  const minPoint = points.reduce(
    (min, p) => (p.balance < min.balance ? p : min),
    points[0] || { date: todayStr, balance: startingBalance }
  );

  return {
    startingBalance: Number(startingBalance),
    totalInflow,
    totalOutflow,
    projectedBalance: points.length ? points[points.length - 1].balance : balance,
    minBalance: minPoint.balance,
    minBalanceDate: minPoint.date,
    points,
    horizonDays,
    eventCount: events.length
  };
}

export function generateCashFlowAlerts(projection, { receivables = [], payables = [] } = {}, today = new Date()) {
  const alerts = [];
  const todayStr = todayISO(today);
  const weekEnd = addDaysISO(todayStr, 7);

  if (projection.minBalance < 0 && projection.minBalanceDate >= todayStr) {
    const days = Math.max(0, daysBetween(todayStr, projection.minBalanceDate));
    const when = days === 0 ? 'hoje' : `em ${days} dia${days === 1 ? '' : 's'}`;
    alerts.push({
      type: 'danger',
      text: `Seu caixa poderá ficar negativo ${when}.`
    });
  }

  let recvWeek = 0;
  (receivables || []).forEach(row => {
    if (!isOpenReceivable(row, todayStr)) return;
    const due = row.due_date;
    if (!due || due > weekEnd) return;
    recvWeek += Number(row.amount) - Number(row.received_amount || 0);
  });
  if (recvWeek > 0) {
    alerts.push({
      type: 'success',
      text: `Você possui R$ ${fmtAlertAmount(recvWeek)} para receber nos próximos 7 dias.`
    });
  }

  let payWeek = 0;
  (payables || []).forEach(row => {
    if (!isOpenPayable(row, todayStr)) return;
    const due = row.due_date;
    if (!due || due > weekEnd) return;
    payWeek += Number(row.amount) - Number(row.paid_amount || 0);
  });
  if (payWeek > 0) {
    alerts.push({
      type: 'warning',
      text: `R$ ${fmtAlertAmount(payWeek)} em pagamentos vencem nesta semana.`
    });
  }

  return alerts;
}

export function computeStartingBalance(accounts = []) {
  return accounts
    .filter(a => a.active !== false)
    .reduce((s, a) => s + Number(a.balance ?? a.current_balance ?? a.initialBalance ?? 0), 0);
}

export function hasProjectionData({ accounts, receivables, payables, recurring, txs, today = new Date() }) {
  const todayStr = todayISO(today);
  if (computeStartingBalance(accounts) !== 0) return true;
  if ((receivables || []).some(r => isOpenReceivable(r, todayStr))) return true;
  if ((payables || []).some(p => isOpenPayable(p, todayStr))) return true;
  if ((recurring || []).some(r => r.active !== false)) return true;
  if ((txs || []).some(t => t.date && t.date > todayStr)) return true;
  return false;
}
