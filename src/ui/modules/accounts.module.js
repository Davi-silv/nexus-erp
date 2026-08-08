import { uid, toggleForm, fmtMoney, escapeHtml } from '../../core/utils.js';
import { renderAccountSelect } from '../chart-registry.js';
import { isBusiness } from '../../domain/profile.service.js';
import { renderBankAccountSelect } from './banking.module.js';

export function initAccountsModule(store, auth) {
  const accountsBody = document.getElementById('accounts-body');
  const accountSelect = document.getElementById('tx-account-select');
  const accountSelectMain = document.getElementById('tx-account-select-main');
  const openAddAcc = document.getElementById('open-add-account');
  const accForm = document.getElementById('add-account-form');
  const cancelAddAcc = document.getElementById('cancel-add-account');

  function renderAccountOptions() {
    const accounts = store.currentUserData?.accounts ?? [];
    const render = isBusiness(store.currentUser()) ? renderBankAccountSelect : renderAccountSelect;
    render(accountSelect, accounts);
    render(accountSelectMain, accounts);
  }

  function renderAccounts() {
    if (!accountsBody || !store.currentUserData) return;
    accountsBody.innerHTML = store.currentUserData.accounts.map(acc => `
      <tr>
        <td>${escapeHtml(acc.name)}</td>
        <td>${escapeHtml(acc.bank)}</td>
        <td>${fmtMoney(acc.balance)}</td>
        <td><button type="button" data-id="${acc.id}" class="acc-del">Remover</button></td>
      </tr>
    `).join('');
  }

  openAddAcc?.addEventListener('click', () => toggleForm(accForm, openAddAcc, true));
  cancelAddAcc?.addEventListener('click', () => {
    accForm?.reset();
    toggleForm(accForm, openAddAcc, false);
  });

  accForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(accForm);
    store.mutate(data => {
      data.accounts.push({
        id: uid(),
        name: f.get('name'),
        bank: f.get('bank'),
        initialBalance: parseFloat(f.get('balance')) || 0,
        balance: parseFloat(f.get('balance')) || 0
      });
    });
    renderAccounts();
    renderAccountOptions();
    accForm.reset();
    toggleForm(accForm, openAddAcc, false);
  });

  accountsBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('acc-del')) return;
    const id = Number(e.target.dataset.id);
    store.mutate(data => {
      data.accounts = data.accounts.filter(a => a.id !== id);
      data.txs = data.txs.filter(t => t.accountId !== id);
    });
    renderAccounts();
    renderAccountOptions();
  });

  return { renderAccounts, renderAccountOptions };
}
