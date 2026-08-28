import { test, expect } from '@playwright/test';
import {
  resetApp,
  acceptDialogs,
  registerPF,
  registerPJ,
  login,
  PF_USER,
  PJ_USER,
  navigateTo,
  addPFAccount,
  addPJBankAccount,
  addTransaction
} from './helpers.js';

test.describe('Automação completa do sistema', () => {
  test('PF e PJ operam de forma independente no mesmo navegador', async ({ page }) => {
    acceptDialogs(page);
    await resetApp(page);

    // ── Fluxo PF ──
    await registerPF(page);
    await login(page, PF_USER.email, PF_USER.password);
    await addPFAccount(page, { name: 'PF Wallet', bank: 'C6', balance: 500 });
    await addTransaction(page, { desc: 'Pix recebido', amount: 200, type: 'credit', accountLabel: 'PF Wallet' });
    await expect(page.locator('#saldo')).toContainText('200');
    await page.locator('#btn-logout').click();
    await expect(page.locator('#auth.view.active')).toBeVisible();

    // ── Fluxo PJ ──
    await registerPJ(page);
    await login(page, PJ_USER.email, PJ_USER.password);
    await expect(page.locator('#bancos.view.active')).toBeVisible();
    await addPJBankAccount(page, {
      name: 'Conta PJ',
      bank: 'Itaú',
      agency: '1000',
      accountNumber: '55555-5',
      balance: 10000
    });
    await addTransaction(page, { desc: 'Receita PJ', amount: 5000, type: 'credit', accountLabel: 'Conta PJ' });
    await expect(page.locator('#bank-total-balance')).toContainText('15000');

    // ── Re-login PF — dados isolados ──
    await page.locator('#btn-logout').click();
    await login(page, PF_USER.email, PF_USER.password);
    await navigateTo(page, 'contas');
    await expect(page.locator('#accounts-body')).toContainText('PF Wallet');
    await expect(page.locator('#accounts-body')).not.toContainText('Conta PJ');
  });

  test('build PWA: manifest e service worker registrados', async ({ page }) => {
    acceptDialogs(page);
    await resetApp(page);

    const isViteDev = await page.locator('script[src*="@vite/client"]').count() > 0;
    if (isViteDev) return;

    await registerPF(page);
    await login(page, PF_USER.email, PF_USER.password);

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });
    expect(swRegistered).toBe(true);
  });
});
