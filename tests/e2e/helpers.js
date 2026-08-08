/** Helpers compartilhados para testes E2E do Nexus ERP */

export const PF_USER = {
  name: 'Maria Silva',
  email: 'maria.pf@test.local',
  password: 'senha123'
};

export const PJ_USER = {
  name: 'Carlos Responsável',
  email: 'empresa.pj@test.local',
  password: 'senha123',
  legalName: 'Tech Solutions Ltda',
  tradeName: 'Tech Solutions',
  cnpj: '12345678000199'
};

export const ADMIN = {
  email: 'admin@nexus.local',
  password: 'admin'
};

/** Limpa storage e abre a tela de autenticação */
export async function resetApp(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/#auth');
  await page.waitForFunction(() => window.__NEXUS_READY__ === true, { timeout: 30_000 });
  await ensureAuthView(page);
}

/** Garante que a view de login/cadastro está visível */
export async function ensureAuthView(page) {
  const auth = page.locator('#auth.view.active');
  if (await auth.isVisible()) return;
  await page.locator('#btn-login').click();
  await auth.waitFor({ state: 'visible', timeout: 10_000 });
}

/** Aceita alertas nativos do app (cadastro, validações) */
export function acceptDialogs(page) {
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
}

export async function registerPF(page, user = PF_USER) {
  await ensureAuthView(page);
  await page.locator('#profile-pf').click();
  await page.locator('#register-form input[name="name"]').fill(user.name);
  await page.locator('#register-form input[name="email"]').fill(user.email);
  await page.locator('#register-form input[name="password"]').fill(user.password);
  await page.locator('#register-form button[type="submit"]').click();
}

export async function registerPJ(page, user = PJ_USER) {
  await ensureAuthView(page);
  await page.locator('#profile-pj').click();
  await page.locator('#register-form input[name="name"]').fill(user.name);
  await page.locator('#register-pj-fields input[name="legalName"]').fill(user.legalName);
  await page.locator('#register-pj-fields input[name="tradeName"]').fill(user.tradeName);
  await page.locator('#register-pj-fields input[name="cnpj"]').fill(user.cnpj);
  await page.locator('#register-form input[name="email"]').fill(user.email);
  await page.locator('#register-form input[name="password"]').fill(user.password);
  await page.locator('#register-form button[type="submit"]').click();
}

export async function login(page, email, password) {
  await ensureAuthView(page);
  await page.locator('#login-form input[name="email"]').fill(email);
  await page.locator('#login-form input[name="password"]').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForFunction(() => window.__NEXUS_READY__ && !document.querySelector('#auth.view.active'));
}

export async function navigateTo(page, view) {
  const active = page.locator(`#${view}.view.active`);
  if (!(await active.isVisible())) {
    const nav = page.locator(`.nav-item[data-view="${view}"]`);
    await nav.waitFor({ state: 'visible', timeout: 10_000 });
    await nav.click();
    await active.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

export async function addPFAccount(page, { name, bank, balance }) {
  await navigateTo(page, 'contas');
  await page.locator('#open-add-account').click();
  const form = page.locator('#add-account-form');
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="bank"]').fill(bank);
  await form.locator('input[name="balance"]').fill(String(balance));
  await form.locator('button[type="submit"]').click();
  await page.locator('#accounts-body').getByText(name).waitFor();
}

export async function addPJBankAccount(page, { name, bank, agency, accountNumber, balance }) {
  await navigateTo(page, 'bancos');
  await page.locator('#bank-open-add-account').click();
  const form = page.locator('#bank-add-account-form');
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="bank"]').fill(bank);
  await form.locator('input[name="agency"]').fill(agency);
  await form.locator('input[name="accountNumber"]').fill(accountNumber);
  await form.locator('input[name="balance"]').fill(String(balance));
  await form.locator('button[type="submit"]').click();
  await page.locator('#bank-accounts-body').getByText(name).waitFor();
}

export async function selectAccountOption(form, accountLabel) {
  const select = form.locator('select[name="account"]');
  const option = select.locator('option').filter({ hasText: accountLabel }).first();
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`Conta não encontrada: ${accountLabel}`);
  await select.selectOption(value);
}

export async function addTransaction(page, { desc, amount, type = 'credit', accountLabel }) {
  await navigateTo(page, 'lancamentos');
  const form = page.locator('#add-tx-form-lancamentos');
  const openBtn = page.locator('#lancamentos #open-add-lancamento');
  if (!(await form.isVisible())) {
    await openBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await openBtn.click();
    await form.waitFor({ state: 'visible', timeout: 5_000 });
  }
  const today = new Date().toISOString().slice(0, 10);
  await form.locator('input[name="date"]').fill(today);
  await form.locator('input[name="desc"]').fill(desc);
  if (accountLabel) {
    await selectAccountOption(form, accountLabel);
  } else {
    const options = form.locator('select[name="account"] option:not([value=""])');
    const count = await options.count();
    if (count > 0) {
      const value = await options.first().getAttribute('value');
      await form.locator('select[name="account"]').selectOption(value);
    }
  }
  await form.locator('select[name="type"]').selectOption(type);
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.locator('button[type="submit"]').click();
  await page.locator('#tx-body-main').getByText(desc).waitFor();
}

export async function addPJCard(page, { name, holder, last4 }) {
  await navigateTo(page, 'bancos');
  await page.locator('#bank-open-add-card').click();
  const form = page.locator('#bank-add-card-form');
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="holder"]').fill(holder);
  await form.locator('input[name="last4"]').fill(last4);
  const today = new Date().toISOString().slice(0, 10);
  await form.locator('input[name="anniversary"]').fill(today);
  await form.locator('button[type="submit"]').click();
  await page.locator('#bank-cards-body').getByText(name).waitFor();
}
