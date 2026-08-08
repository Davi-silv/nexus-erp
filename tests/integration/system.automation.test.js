import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/event-bus.js';
import { AppStore } from '../../src/state/app-store.js';
import { PROFILE, getDefaultCategories, calculateDRE, isBusiness } from '../../src/domain/profile.service.js';
import { computeBalance, sumByType } from '../../src/domain/finance.service.js';

/** Limpa storage entre testes */
function clearStorage() {
  localStorage.clear();
  sessionStorage.clear();
}

async function createStore() {
  const store = new AppStore(new EventBus());
  await store.init();
  return store;
}

describe('Automação PF — fluxo completo', () => {
  beforeEach(clearStorage);

  it('registra, loga e cria conta + lançamentos', async () => {
    const store = await createStore();

    const reg = await store.register('Ana PF', 'ana@test.local', '123456', { profileType: PROFILE.PF });
    expect(reg.ok).toBe(true);

    const login = await store.login('ana@test.local', '123456');
    expect(login.ok).toBe(true);
    expect(store.currentUser().profileType).toBe(PROFILE.PF);
    expect(isBusiness(store.currentUser())).toBe(false);

    const cats = getDefaultCategories(PROFILE.PF);
    expect(cats.some(c => c.name === 'Alimentação')).toBe(true);

    store.mutate(data => {
      data.accounts.push({ id: 1, name: 'Nubank', bank: 'Nubank', initialBalance: 1000, balance: 1000 });
      data.txs.push(
        { id: 1, date: '2026-08-01', desc: 'Salário', type: 'credit', amount: 5000, accountId: 1 },
        { id: 2, date: '2026-08-02', desc: 'Mercado', type: 'debit', amount: 400, accountId: 1 }
      );
    });

    expect(computeBalance(store.currentUserData.txs)).toBe(4600);
    expect(sumByType(store.currentUserData.txs, 'credit')).toBe(5000);
    expect(sumByType(store.currentUserData.txs, 'debit')).toBe(400);
    expect(store.currentUserData.accounts[0].balance).toBe(5600);
  });

  it('isola dados entre usuários PF', async () => {
    const store = await createStore();
    await store.register('User A', 'a@test.local', 'pass', { profileType: PROFILE.PF });
    store.mutate(d => {
      d.accounts.push({ id: 1, name: 'Conta A', bank: 'X', balance: 100, initialBalance: 100 });
    });

    store.logout();
    await store.register('User B', 'b@test.local', 'pass', { profileType: PROFILE.PF });
    await store.login('b@test.local', 'pass');

    expect(store.currentUserData.accounts).toHaveLength(0);
  });
});

describe('Automação PJ — fluxo completo', () => {
  beforeEach(clearStorage);

  it('registra empresa com CNPJ e plano de contas PJ', async () => {
    const store = await createStore();

    const reg = await store.register('João', 'pj@test.local', '123456', {
      profileType: PROFILE.PJ,
      company: {
        legalName: 'Acme Ltda',
        tradeName: 'Acme',
        cnpj: '12.345.678/0001-99',
        taxRegime: 'simples'
      }
    });
    expect(reg.ok).toBe(true);

    await store.login('pj@test.local', '123456');
    const user = store.currentUser();
    expect(user.profileType).toBe(PROFILE.PJ);
    expect(user.company.legalName).toBe('Acme Ltda');

    const cats = store.currentUserData.categories.map(c => c.name);
    expect(cats).toContain('Vendas / Receitas');
    expect(cats).toContain('Folha de pagamento');
  });

  it('cadastra bancos, cartões, centros de custo e DRE', async () => {
    const store = await createStore();
    await store.register('CEO', 'ceo@test.local', '123456', {
      profileType: PROFILE.PJ,
      company: { legalName: 'Tech Co', tradeName: 'Tech', cnpj: '00.000.000/0001-00', taxRegime: 'simples' }
    });
    await store.login('ceo@test.local', '123456');

    store.mutate(data => {
      data.accounts.push({
        id: 1, name: 'Itaú PJ', bank: 'Itaú', agency: '1234', accountNumber: '56789-0',
        accountType: 'corrente', initialBalance: 10000, balance: 10000
      });
      data.cards.push({
        id: 1, name: 'Visa Corp', holder: 'Tech Co', last4: '1234', anniversary: '2026-08-15'
      });
      data.charges.push({
        id: 1, cardId: 1, date: '2026-08-01', type: 'annuity', desc: 'Anuidade', amount: 120
      });
      data.costCenters.push({ id: 1, code: 'ADM', name: 'Administrativo', budget: 5000 });
      data.txs.push(
        { id: 1, date: '2026-08-01', desc: 'Faturamento', type: 'credit', amount: 25000, accountId: 1, counterparty: 'Cliente X' },
        { id: 2, date: '2026-08-02', desc: 'Folha', type: 'debit', amount: 12000, accountId: 1, costCenterId: 1 }
      );
    });

    const { accounts, cards, charges, costCenters, txs } = store.currentUserData;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].agency).toBe('1234');
    expect(cards).toHaveLength(1);
    expect(charges).toHaveLength(1);
    expect(costCenters).toHaveLength(1);

    const dre = calculateDRE(txs, store.currentUserData.categories);
    expect(dre.revenue).toBe(25000);
    expect(dre.expenses).toBe(12000);
    expect(dre.net).toBe(13000);
    expect(dre.margin).toBe(52);
  });

  it('admin demo é PJ com empresa configurada', async () => {
    const store = await createStore();
    const login = await store.login('admin@nexus.local', 'admin');
    expect(login.ok).toBe(true);
    expect(store.currentUser().profileType).toBe(PROFILE.PJ);
    expect(store.currentUser().company.tradeName).toBe('Nexus ERP');
  });
});

describe('Automação cross-profile', () => {
  beforeEach(clearStorage);

  it('PF e PJ coexistem com categorias distintas', async () => {
    const store = await createStore();

    await store.register('PF User', 'pf@t.local', 'pass', { profileType: PROFILE.PF });
    await store.login('pf@t.local', 'pass');
    const pfCats = [...store.currentUserData.categories.map(c => c.name)];
    store.logout();

    await store.register('PJ User', 'pj@t.local', 'pass', {
      profileType: PROFILE.PJ,
      company: { legalName: 'Co', tradeName: 'Co', cnpj: '00.000.000/0001-00', taxRegime: 'mei' }
    });
    await store.login('pj@t.local', 'pass');
    const pjCats = [...store.currentUserData.categories.map(c => c.name)];

    expect(pfCats).toContain('Alimentação');
    expect(pfCats).not.toContain('Folha de pagamento');
    expect(pjCats).toContain('Folha de pagamento');
    expect(pjCats).not.toContain('Alimentação');
  });
});
