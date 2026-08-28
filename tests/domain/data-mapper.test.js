import { describe, it, expect } from 'vitest';
import {
  mapAccountToDb,
  mapAccountFromDb,
  mapTransactionToDb,
  mapTransactionFromDb,
  mapCostCenterToDb,
  mapCostCenterFromDb,
  mapGoalToDb,
  mapGoalFromDb
} from '../../src/infrastructure/supabase/data-mapper.js';

describe('data-mapper — campos PJ em JSON', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';

  it('preserva agency e accountNumber em contas', () => {
    const row = {
      id: 'acc-1',
      name: 'Conta PJ',
      bank: 'Itaú',
      agency: '1234',
      accountNumber: '56789-0',
      initialBalance: 1000,
      balance: 1500,
      accountType: 'corrente'
    };
    const db = mapAccountToDb(row, workspaceId, userId);
    const back = mapAccountFromDb({ ...db, current_balance: db.current_balance, initial_balance: db.initial_balance });
    expect(back.bank).toBe('Itaú');
    expect(back.agency).toBe('1234');
    expect(back.accountNumber).toBe('56789-0');
  });

  it('preserva counterparty e docNumber em transações', () => {
    const tx = {
      id: 'tx-1',
      date: '2026-08-01',
      desc: 'Venda',
      type: 'credit',
      amount: 500,
      accountId: 'acc-1',
      counterparty: 'Cliente ABC',
      docNumber: 'NF-123'
    };
    const db = mapTransactionToDb(tx, workspaceId, userId);
    const back = mapTransactionFromDb({
      ...db,
      transaction_date: db.transaction_date,
      financial_account_id: db.financial_account_id
    });
    expect(back.counterparty).toBe('Cliente ABC');
    expect(back.docNumber).toBe('NF-123');
  });

  it('preserva code e budget em centros de custo', () => {
    const cc = { id: 'cc-1', code: 'ADM', name: 'Administrativo', budget: 5000 };
    const db = mapCostCenterToDb(cc, workspaceId);
    const back = mapCostCenterFromDb(db);
    expect(back.code).toBe('ADM');
    expect(back.budget).toBe(5000);
    expect(back.name).toBe('Administrativo');
  });

  it('metas exigem id para upsert', () => {
    const goal = { id: 'goal-1', categoryId: 'cat-1', limit: 800 };
    const db = mapGoalToDb(goal, workspaceId);
    expect(db.id).toBe('goal-1');
    expect(mapGoalFromDb(db).limit).toBe(800);
  });
});
