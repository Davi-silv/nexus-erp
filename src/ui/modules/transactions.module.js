import { uid, toggleForm, fmtMoney, escapeHtml, parseId } from '../../core/utils.js';
import { computeBalance, sumByType } from '../../domain/finance.service.js';
import { isBusiness } from '../../domain/profile.service.js';
import { populateCostCenterSelect } from './company.module.js';

export function initTransactionsModule(store, auth, accounts) {
  const txBody = document.getElementById('tx-body');
  const txBodyMain = document.getElementById('tx-body-main');
  const saldoEl = document.getElementById('saldo');
  const receitasEl = document.getElementById('dashboard-receitas');
  const despesasEl = document.getElementById('dashboard-despesas');

  const forms = [
    { open: 'open-add', form: 'add-tx-form', cancel: 'cancel-add' },
    { open: 'open-add-lancamento', form: 'add-tx-form-lancamentos', cancel: 'cancel-add-lancamento' }
  ];

  function renderCostCenterOptions() {
    ['tx-cost-center-select', 'tx-cost-center-select-main'].forEach(id => {
      populateCostCenterSelect(
        document.getElementById(id),
        store.currentUserData?.costCenters
      );
    });
  }

  function renderCategoryOptionsForTx() {
    const select = document.getElementById('tx-category-select');
    if (!select || !store.currentUserData) return;
    const current = select.value;
    select.innerHTML = '<option value="">Sem categoria</option>' +
      store.currentUserData.categories.map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)}</option>`
      ).join('');
    select.value = current;
  }

  function renderDashboardMetrics() {
    if (!store.currentUserData) return;
    const txs = store.currentUserData.txs;
    if (receitasEl) receitasEl.textContent = fmtMoney(sumByType(txs, 'credit'));
    if (despesasEl) despesasEl.textContent = fmtMoney(sumByType(txs, 'debit'));
  }

  function updateSaldo() {
    if (!store.currentUserData || !saldoEl) return;
    saldoEl.textContent = fmtMoney(computeBalance(store.currentUserData.txs));
  }

  function renderRecentTransactions() {
    if (!txBody || !store.currentUserData) return;
    const recent = store.currentUserData.txs.slice(-6).reverse();
    txBody.innerHTML = recent.map(tx => `
      <tr>
        <td>${escapeHtml(tx.date)}</td>
        <td>${escapeHtml(tx.desc)}</td>
        <td>${tx.type === 'credit' ? 'Crédito' : 'Débito'}</td>
        <td class="${tx.type}">${fmtMoney(tx.amount)}</td>
      </tr>
    `).join('');
  }

  function renderTxs(filter) {
    if (!txBodyMain || !store.currentUserData) return;
    const business = isBusiness(store.currentUser());
    const ccMap = Object.fromEntries((store.currentUserData.costCenters || []).map(c => [c.id, c.name]));
    const list = store.currentUserData.txs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const filtered = list.filter(t => {
      if (filter?.from && t.date < filter.from) return false;
      if (filter?.to && t.date > filter.to) return false;
      return true;
    });
    txBodyMain.innerHTML = filtered.map(tx => {
      const acc = store.currentUserData.accounts.find(a => a.id === tx.accountId);
      const pjCols = business ? `
          <td>${escapeHtml(tx.counterparty || '—')}</td>
          <td>${tx.costCenterId ? escapeHtml(ccMap[tx.costCenterId] || '—') : '—'}</td>
        ` : '';
      return `
        <tr>
          <td>${escapeHtml(tx.date)}</td>
          <td>${escapeHtml(tx.desc)}</td>
          <td>${tx.type === 'credit' ? 'Crédito' : 'Débito'}</td>
          <td class="${tx.type}">${fmtMoney(tx.amount)}</td>
          <td>${acc ? escapeHtml(acc.name) : '-'}</td>
          ${pjCols}
          <td><button type="button" data-id="${tx.id}" class="tx-del">Remover</button></td>
        </tr>
      `;
    }).join('');
  }

  function handleTransactionSubmit(evt, formEl) {
    evt.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(formEl);
    const date = f.get('date');
    const desc = f.get('desc')?.trim();
    const type = f.get('type');
    const amount = parseFloat(f.get('amount')) || 0;
    const accId = parseId(f.get('account')) || null;
    const categoryId = f.get('category') ? parseId(f.get('category')) : undefined;
    const counterparty = f.get('counterparty')?.trim() || undefined;
    const docNumber = f.get('docNumber')?.trim() || undefined;
    const costCenterId = f.get('costCenter') ? parseId(f.get('costCenter')) : undefined;
    if (!date || !desc || amount <= 0 || !accId) {
      return alert('Preencha todos os campos e selecione a conta.');
    }
    const tx = { id: uid(), date, desc, type, amount, accountId: accId, categoryId };
    if (counterparty) tx.counterparty = counterparty;
    if (docNumber) tx.docNumber = docNumber;
    if (costCenterId) tx.costCenterId = costCenterId;
    store.mutate(data => { data.txs.push(tx); });
    formEl.reset();
    accounts.renderAccountOptions();
  }

  forms.forEach(({ open, form, cancel }) => {
    const openBtn = document.getElementById(open);
    const formEl = document.getElementById(form);
    const cancelBtn = document.getElementById(cancel);
    openBtn?.addEventListener('click', () => {
      accounts.renderAccountOptions();
      renderCostCenterOptions();
      toggleForm(formEl, openBtn, true);
    });
    cancelBtn?.addEventListener('click', () => {
      formEl?.reset();
      toggleForm(formEl, openBtn, false);
    });
    formEl?.addEventListener('submit', e => handleTransactionSubmit(e, formEl));
  });

  document.getElementById('apply-filters')?.addEventListener('click', () => {
    renderTxs({
      from: document.getElementById('filter-date-from')?.value || null,
      to: document.getElementById('filter-date-to')?.value || null
    });
  });

  document.getElementById('clear-filters')?.addEventListener('click', () => {
    const fd = document.getElementById('filter-date-from');
    const td = document.getElementById('filter-date-to');
    if (fd) fd.value = '';
    if (td) td.value = '';
    renderTxs();
  });

  txBodyMain?.addEventListener('click', e => {
    if (!e.target.classList.contains('tx-del')) return;
    store.mutate(data => {
      data.txs = data.txs.filter(t => t.id !== parseId(e.target.dataset.id));
    });
  });

  function refresh() {
    renderCategoryOptionsForTx();
    renderCostCenterOptions();
    renderRecentTransactions();
    renderTxs();
    renderDashboardMetrics();
    updateSaldo();
  }

  return { renderRecentTransactions, renderTxs, renderDashboardMetrics, updateSaldo, renderCategoryOptionsForTx, refresh };
}
