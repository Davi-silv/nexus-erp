import { uid } from '../core/utils.js';

/** Geração de lançamentos recorrentes — lógica de domínio */

function advanceDate(date, frequency) {
  const next = new Date(date);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

export function generateRecurringTransactions(recurring, today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  const newTxs = [];
  let generated = 0;

  recurring.forEach(rec => {
    let nextDate = new Date(rec.nextOccurrence || rec.startDate);
    nextDate.setHours(0, 0, 0, 0);

    while (nextDate <= cutoff) {
      newTxs.push({
        id: uid(),
        date: nextDate.toISOString().split('T')[0],
        type: rec.type,
        amount: rec.amount,
        desc: rec.desc,
        accountId: rec.accountId,
        categoryId: undefined,
        source: 'recurring'
      });
      generated++;
      nextDate = advanceDate(nextDate, rec.frequency);
    }
    rec.nextOccurrence = nextDate.toISOString().split('T')[0];
  });

  return { newTxs, generated };
}
