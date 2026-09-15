import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectivePayableStatus, STATUS_LABELS } from '../../src/ui/modules/payables.module.js';

describe('payables — effectivePayableStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna paid ou cancelled sem recalcular', () => {
    expect(effectivePayableStatus({ status: 'paid', due_date: '2020-01-01', amount: 100 })).toBe('paid');
    expect(effectivePayableStatus({ status: 'cancelled', due_date: '2020-01-01', amount: 100 })).toBe('cancelled');
  });

  it('detecta partial quando paid_amount > 0 e < amount', () => {
    expect(effectivePayableStatus({
      status: 'pending',
      amount: 100,
      paid_amount: 40,
      due_date: '2099-01-01'
    })).toBe('partial');
  });

  it('detecta overdue quando vencido e saldo em aberto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    expect(effectivePayableStatus({
      status: 'pending',
      amount: 100,
      paid_amount: 0,
      due_date: '2026-09-01'
    })).toBe('overdue');
  });

  it('mantém pending quando vencimento futuro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    expect(effectivePayableStatus({
      status: 'pending',
      amount: 100,
      paid_amount: 0,
      due_date: '2026-10-01'
    })).toBe('pending');
  });

  it('expõe labels de status em português', () => {
    expect(STATUS_LABELS.pending).toBe('Pendente');
    expect(STATUS_LABELS.overdue).toBe('Vencido');
    expect(STATUS_LABELS.paid).toBe('Pago');
    expect(STATUS_LABELS.cancelled).toBe('Cancelado');
  });
});
