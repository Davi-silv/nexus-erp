import { test, expect } from '@playwright/test';
import {
  resetApp,
  acceptDialogs,
  registerPF,
  login,
  PF_USER,
  navigateTo,
  addPFAccount,
  addTransaction
} from './helpers.js';

test.describe('Conta Pessoa Física (PF)', () => {
  test.beforeEach(async ({ page }) => {
    acceptDialogs(page);
    await resetApp(page);
    await registerPF(page);
    await login(page, PF_USER.email, PF_USER.password);
  });

  test('exibe perfil PF e menu correto', async ({ page }) => {
    await expect(page.locator('#profile-badge')).toHaveText('Pessoa Física');
    await expect(page.locator('.nav-item[data-view="contas"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="bancos"]')).toBeHidden();
    await expect(page.locator('.nav-item[data-view="cartoes"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="empresa"]')).toBeHidden();
    await expect(page.locator('#dashboard-title')).toHaveText('Visão geral financeira');
  });

  test('cadastra conta bancária e lançamento', async ({ page }) => {
    await addPFAccount(page, { name: 'Nubank PF', bank: 'Nubank', balance: 1000 });
    await addTransaction(page, {
      desc: 'Salário',
      amount: 5000,
      type: 'credit',
      accountLabel: 'Nubank PF'
    });
    await addTransaction(page, {
      desc: 'Supermercado',
      amount: 350,
      type: 'debit',
      accountLabel: 'Nubank PF'
    });

    await navigateTo(page, 'dashboard');
    await expect(page.locator('#saldo')).not.toHaveText('R$ 0,00');
    await expect(page.locator('#dashboard-receitas')).toContainText('5000');
    await expect(page.locator('#dashboard-despesas')).toContainText('350');
  });

  test('cadastra cartão pessoal', async ({ page }) => {
    await navigateTo(page, 'cartoes');
    await page.locator('#open-add-card').click();
    const form = page.locator('#add-card-form');
    await form.locator('input[name="name"]').fill('Visa Nubank');
    await form.locator('input[name="holder"]').fill(PF_USER.name);
    await form.locator('input[name="last4"]').fill('4321');
    await form.locator('input[name="anniversary"]').fill('2026-08-15');
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('#cards-body')).toContainText('Visa Nubank');
    await expect(page.locator('#cards-body')).toContainText('2026-08-15');
  });

  test('categorias padrão PF estão disponíveis', async ({ page }) => {
    await navigateTo(page, 'categorias');
    await expect(page.locator('#categories-body')).toContainText('Alimentação');
    await expect(page.locator('#categories-body')).toContainText('Transporte');
    await expect(page.locator('#categories-body')).toContainText('Moradia');
  });

  test('fluxo completo: conta → lançamento → saúde financeira', async ({ page }) => {
    await addPFAccount(page, { name: 'Conta Principal', bank: 'Itaú', balance: 2000 });
    await addTransaction(page, {
      desc: 'Freelance',
      amount: 3000,
      type: 'credit',
      accountLabel: 'Conta Principal'
    });

    await navigateTo(page, 'saude');
    await expect(page.locator('#health-score')).toBeVisible();
    await expect(page.locator('#health-score')).not.toHaveText('--');
  });
});
