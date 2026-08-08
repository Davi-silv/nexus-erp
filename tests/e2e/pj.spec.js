import { test, expect } from '@playwright/test';
import {
  resetApp,
  acceptDialogs,
  registerPJ,
  login,
  PJ_USER,
  ADMIN,
  navigateTo,
  addPJBankAccount,
  addPJCard,
  addTransaction
} from './helpers.js';

test.describe('Conta Empresa PME (PJ)', () => {
  test.beforeEach(async ({ page }) => {
    acceptDialogs(page);
    await resetApp(page);
    await registerPJ(page);
    await login(page, PJ_USER.email, PJ_USER.password);
  });

  test('exibe perfil PJ e redireciona para bancos sem contas', async ({ page }) => {
    await expect(page.locator('#profile-badge')).toHaveText('Empresa · PME');
    await expect(page.locator('#bancos.view.active')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="bancos"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="contas"]')).toBeHidden();
    await expect(page.locator('.nav-item[data-view="cartoes"]')).toBeHidden();
    await expect(page.locator('.nav-item[data-view="empresa"]')).toBeVisible();
    await expect(page.locator('#dashboard-title')).toHaveText('Visão geral do negócio');
  });

  test('cadastra conta bancária corporativa', async ({ page }) => {
    await addPJBankAccount(page, {
      name: 'Itaú PJ Principal',
      bank: 'Itaú',
      agency: '1234',
      accountNumber: '56789-0',
      balance: 15000
    });

    await expect(page.locator('#bank-accounts-body')).toContainText('Itaú PJ Principal');
    await expect(page.locator('#bank-accounts-body')).toContainText('1234');
    await expect(page.locator('#bank-account-count')).toHaveText('1');
    await expect(page.locator('#bank-total-balance')).toContainText('15000');
  });

  test('cadastra cartão corporativo e encargo', async ({ page }) => {
    await addPJBankAccount(page, {
      name: 'Conta Operacional',
      bank: 'Bradesco',
      agency: '0001',
      accountNumber: '12345-6',
      balance: 5000
    });
    await addPJCard(page, {
      name: 'Nubank PJ',
      holder: PJ_USER.legalName,
      last4: '9876'
    });

    await expect(page.locator('#bank-card-count')).toHaveText('1');
    await expect(page.locator('#bank-cards-body')).toContainText('Nubank PJ');

    await page.locator('#bank-open-add-charge').click();
    const chargeForm = page.locator('#bank-add-charge-form');
    await chargeForm.locator('select[name="cardId"]').selectOption({ index: 1 });
    await chargeForm.locator('input[name="date"]').fill(new Date().toISOString().slice(0, 10));
    await chargeForm.locator('input[name="desc"]').fill('Anuidade cartão');
    await chargeForm.locator('input[name="amount"]').fill('89.90');
    await chargeForm.locator('button[type="submit"]').click();

    await expect(page.locator('#bank-charges-body')).toContainText('Taxa Anual');
    await expect(page.locator('#bank-charges-body')).toContainText('89,90');
  });

  test('lançamento contábil com campos PJ', async ({ page }) => {
    await addPJBankAccount(page, {
      name: 'Caixa Empresa',
      bank: 'Santander',
      agency: '4321',
      accountNumber: '99887-6',
      balance: 10000
    });

    await navigateTo(page, 'lancamentos');
    await page.locator('#open-add-lancamento').click();
    const form = page.locator('#add-tx-form-lancamentos');
    const today = new Date().toISOString().slice(0, 10);

    await form.locator('input[name="date"]').fill(today);
    await form.locator('input[name="desc"]').fill('Venda de serviços');
    const accValue = await form.locator('select[name="account"] option').filter({ hasText: 'Caixa Empresa' }).first().getAttribute('value');
    await form.locator('select[name="account"]').selectOption(accValue);
    await form.locator('select[name="type"]').selectOption('credit');
    await form.locator('input[name="amount"]').fill('8500');
    await form.locator('input[name="counterparty"]').fill('Cliente ABC Ltda');
    await form.locator('input[name="docNumber"]').fill('NF-2026-001');
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('#tx-body-main')).toContainText('Venda de serviços');
    await expect(page.locator('#tx-body-main')).toContainText('Cliente ABC Ltda');
  });

  test('centro de custo e DRE na empresa', async ({ page }) => {
    await addPJBankAccount(page, {
      name: 'Conta DRE',
      bank: 'Inter',
      agency: '0001',
      accountNumber: '11111-1',
      balance: 0
    });

    await addTransaction(page, {
      desc: 'Faturamento mensal',
      amount: 20000,
      type: 'credit',
      accountLabel: 'Conta DRE'
    });
    await addTransaction(page, {
      desc: 'Folha de pagamento',
      amount: 8000,
      type: 'debit',
      accountLabel: 'Conta DRE'
    });

    await navigateTo(page, 'empresa');
    await page.locator('#open-add-cost-center').click();
    const ccForm = page.locator('#add-cost-center-form');
    await ccForm.locator('input[name="name"]').fill('Operações');
    await ccForm.locator('input[name="code"]').fill('OP-01');
    await ccForm.locator('button[type="submit"]').click();
    await expect(page.locator('#cost-centers-body')).toContainText('Operações');

    await expect(page.locator('#dre-summary-company')).toContainText('20000');
    await expect(page.locator('#dre-summary-company')).toContainText('8000');
  });

  test('categorias padrão PJ (plano de contas)', async ({ page }) => {
    await navigateTo(page, 'categorias');
    await expect(page.locator('#categories-body')).toContainText('Vendas / Receitas');
    await expect(page.locator('#categories-body')).toContainText('Fornecedores');
    await expect(page.locator('#categories-body')).toContainText('Folha de pagamento');
  });
});

test.describe('Admin PJ (conta demo)', () => {
  test('login admin acessa bancos e usuários', async ({ page }) => {
    acceptDialogs(page);
    await resetApp(page);
    await login(page, ADMIN.email, ADMIN.password);

    await expect(page.locator('#profile-badge')).toHaveText('Empresa · PME');
    await expect(page.locator('.nav-item[data-view="usuarios"]')).toBeVisible();

    await navigateTo(page, 'bancos');
    await expect(page.locator('#bancos.view.active')).toBeVisible();
  });
});
