import { describe, it, expect } from 'vitest';
import { computeBalance, calculateHealthMetrics, aggregateByMonth } from '../../src/domain/finance.service.js';

describe('finance.service', () => {
  it('computeBalance calcula saldo corretamente', () => {
    const txs = [
      { type: 'credit', amount: 1000 },
      { type: 'debit', amount: 300 },
      { type: 'credit', amount: 500 }
    ];
    expect(computeBalance(txs)).toBe(1200);
  });

  it('calculateHealthMetrics retorna score entre 0 e 100', () => {
    const data = {
      txs: [
        { type: 'credit', amount: 5000 },
        { type: 'debit', amount: 2000, categoryId: 1 }
      ],
      goals: [{ categoryId: 1, limit: 3000 }],
      categories: [],
      accounts: []
    };
    const health = calculateHealthMetrics(data);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it('aggregateByMonth agrupa por mês', () => {
    const txs = [
      { date: '2026-01-15', type: 'credit', amount: 100 },
      { date: '2026-01-20', type: 'debit', amount: 50 },
      { date: '2026-02-10', type: 'credit', amount: 200 }
    ];
    const agg = aggregateByMonth(txs);
    expect(agg.labels).toHaveLength(2);
    expect(agg.credits[0]).toBe(100);
  });
});
