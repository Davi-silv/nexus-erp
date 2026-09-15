import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCashFlowProjection,
  generateCashFlowAlerts,
  computeStartingBalance,
  hasProjectionData,
  advanceDateISO
} from '../../src/domain/cashflow.service.js';

describe('cashflow.service', () => {
  afterEach(() => vi.useRealTimers());

  it('computeStartingBalance soma contas ativas', () => {
    expect(computeStartingBalance([
      { balance: 1000, active: true },
      { balance: 500, active: true },
      { balance: 999, active: false }
    ])).toBe(1500);
  });

  it('projeta entradas e saídas por vencimento', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    const projection = buildCashFlowProjection({
      startingBalance: 10000,
      horizonDays: 30,
      receivables: [
        { status: 'pending', amount: 5000, received_amount: 0, due_date: '2026-09-20', description: 'Cliente A' }
      ],
      payables: [
        { status: 'pending', amount: 2000, paid_amount: 0, due_date: '2026-09-18', description: 'Fornecedor B' }
      ]
    });

    expect(projection.totalInflow).toBe(5000);
    expect(projection.totalOutflow).toBe(2000);
    expect(projection.projectedBalance).toBe(13000);
  });

  it('move vencidos para hoje na projeção', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    const projection = buildCashFlowProjection({
      startingBalance: 1000,
      horizonDays: 7,
      payables: [
        { status: 'overdue', amount: 300, paid_amount: 0, due_date: '2026-09-01', description: 'Vencida' }
      ]
    });

    expect(projection.points[0].outflow).toBe(300);
    expect(projection.projectedBalance).toBe(700);
  });

  it('gera alertas de caixa negativo e semana', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    const projection = buildCashFlowProjection({
      startingBalance: 1000,
      horizonDays: 30,
      payables: [
        { status: 'pending', amount: 5000, paid_amount: 0, due_date: '2026-09-16', description: 'Aluguel' }
      ],
      receivables: [
        { status: 'pending', amount: 12800, received_amount: 0, due_date: '2026-09-18', description: 'Projeto' }
      ]
    });

    const alerts = generateCashFlowAlerts(projection, {
      receivables: [{ status: 'pending', amount: 12800, received_amount: 0, due_date: '2026-09-18' }],
      payables: [{ status: 'pending', amount: 4200, paid_amount: 0, due_date: '2026-09-17' }]
    });

    expect(alerts.some(a => a.text.includes('negativo'))).toBe(true);
    expect(alerts.some(a => a.text.includes('12.800,00'))).toBe(true);
    expect(alerts.some(a => a.text.includes('4.200,00'))).toBe(true);
  });

  it('advanceDateISO avança mensalmente', () => {
    expect(advanceDateISO('2026-01-31', 'monthly')).toBe('2026-03-03');
  });

  it('hasProjectionData detecta ausência de dados', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    expect(hasProjectionData({ accounts: [], receivables: [], payables: [], recurring: [], txs: [] })).toBe(false);
    expect(hasProjectionData({ accounts: [{ balance: 100, active: true }] })).toBe(true);
  });
});
