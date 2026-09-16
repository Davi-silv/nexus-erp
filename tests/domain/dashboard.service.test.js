import { describe, it, expect } from 'vitest';
import {
  monthKey,
  comparePeriod,
  sumByTypeInMonth,
  calculateFinancialMetrics,
  summarizeReceivables,
  buildMonthlySeries
} from '../../src/domain/dashboard.service.js';

describe('dashboard.service', () => {
  const today = new Date('2026-09-15');

  it('comparePeriod formata variação percentual', () => {
    const cmp = comparePeriod(38420, 34200);
    expect(cmp.text).toBe('+12,3% comparado ao mês anterior');
    expect(cmp.direction).toBe('up');
  });

  it('sumByTypeInMonth filtra por mês', () => {
    const txs = [
      { date: '2026-09-01', type: 'credit', amount: 1000 },
      { date: '2026-08-15', type: 'credit', amount: 500 }
    ];
    expect(sumByTypeInMonth(txs, 'credit', '2026-09')).toBe(1000);
    expect(sumByTypeInMonth(txs, 'credit', '2026-08')).toBe(500);
  });

  it('calculateFinancialMetrics calcula lucro e margem do mês', () => {
    const txs = [
      { date: '2026-09-05', type: 'credit', amount: 10000 },
      { date: '2026-09-10', type: 'debit', amount: 4000 },
      { date: '2026-08-20', type: 'credit', amount: 8000 }
    ];
    const fin = calculateFinancialMetrics({ txs, today });
    expect(fin.revenue).toBe(10000);
    expect(fin.expenses).toBe(4000);
    expect(fin.profit).toBe(6000);
    expect(fin.margin).toBe(60);
    expect(fin.comparisons.revenue.direction).toBe('up');
  });

  it('summarizeReceivables soma vencidos', () => {
    const rows = [
      { amount: 1000, received_amount: 0, due_date: '2026-09-01', status: 'pending' },
      { amount: 500, received_amount: 0, due_date: '2026-10-01', status: 'pending' }
    ];
    const s = summarizeReceivables(rows, '2026-09-15');
    expect(s.totalOpen).toBe(1500);
    expect(s.overdue).toBe(1000);
  });

  it('buildMonthlySeries retorna 6 meses', () => {
    const series = buildMonthlySeries([], 6, today);
    expect(series.labels).toHaveLength(6);
    expect(monthKey(today)).toBe('2026-09');
  });
});
