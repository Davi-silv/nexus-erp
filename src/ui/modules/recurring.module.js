import { uid, toggleForm, fmtMoney, escapeHtml } from '../../core/utils.js';
import { generateRecurringTransactions } from '../../domain/recurring.service.js';
import { renderAccountSelect } from '../chart-registry.js';

export function initRecurringModule(store) {
  const recurringBody = document.getElementById('recurring-body');
  const recurringAccountSelect = document.getElementById('recurring-account-select');
  const recurringStatus = document.getElementById('recurring-status');

  function renderRecurring() {
    if (!recurringBody || !store.currentUserData) return;
    recurringBody.innerHTML = store.currentUserData.recurring.map(rec => {
      const nextDate = new Date(rec.nextOccurrence || rec.startDate).toLocaleDateString('pt-BR');
      return `
        <tr>
          <td>${escapeHtml(rec.desc)}</td>
          <td>${rec.type === 'credit' ? 'Crédito' : 'Débito'}</td>
          <td>${fmtMoney(rec.amount)}</td>
          <td>${escapeHtml(rec.frequency)}</td>
          <td>${nextDate}</td>
          <td><button type="button" class="rec-del" data-id="${rec.id}">Del</button></td>
        </tr>
      `;
    }).join('');
  }

  function populateAccountSelect() {
    renderAccountSelect(recurringAccountSelect, store.currentUserData?.accounts ?? [], 'Selecione');
  }

  const openAddRecurring = document.getElementById('open-add-recurring');
  const addRecurringForm = document.getElementById('add-recurring-form');
  const cancelAddRecurring = document.getElementById('cancel-add-recurring');

  openAddRecurring?.addEventListener('click', () => toggleForm(addRecurringForm, openAddRecurring, true));
  cancelAddRecurring?.addEventListener('click', () => {
    addRecurringForm?.reset();
    toggleForm(addRecurringForm, openAddRecurring, false);
  });

  addRecurringForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addRecurringForm);
    store.mutate(data => {
      data.recurring.push({
        id: uid(),
        desc: f.get('desc'),
        type: f.get('type'),
        amount: parseFloat(f.get('amount')) || 0,
        frequency: f.get('frequency'),
        accountId: Number(f.get('accountId')),
        startDate: f.get('startDate'),
        nextOccurrence: f.get('startDate'),
        active: true
      });
    });
    renderRecurring();
    addRecurringForm.reset();
    toggleForm(addRecurringForm, openAddRecurring, false);
  });

  recurringBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('rec-del')) return;
    store.mutate(data => {
      data.recurring = data.recurring.filter(r => r.id !== Number(e.target.dataset.id));
    });
    renderRecurring();
  });

  document.getElementById('generate-recurring')?.addEventListener('click', () => {
    if (!store.currentUserData) return;
    const { newTxs, generated } = generateRecurringTransactions(store.currentUserData.recurring);
    store.mutate(data => { data.txs.push(...newTxs); });
    renderRecurring();
    if (recurringStatus) {
      recurringStatus.innerHTML = `<p class="status-success">✓ ${generated} lançamentos gerados com sucesso</p>`;
      setTimeout(() => { recurringStatus.innerHTML = ''; }, 3000);
    }
  });

  function refresh() {
    renderRecurring();
    populateAccountSelect();
  }

  return { renderRecurring, populateAccountSelect, refresh };
}
