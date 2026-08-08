import { uid, toggleForm, fmtMoney, escapeHtml, currentMonthKey } from '../../core/utils.js';
import { CHARGE_TYPES } from '../../core/constants.js';
import { isBusiness } from '../../domain/profile.service.js';

const ACCOUNT_TYPES = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  pagamento: 'Conta pagamento'
};

export function initBankingModule(store, auth, router) {
  const accountsBody = document.getElementById('bank-accounts-body');
  const cardsBody = document.getElementById('bank-cards-body');
  const chargesBody = document.getElementById('bank-charges-body');
  const prompt = document.getElementById('pj-banking-prompt');

  function updateMetrics() {
    if (!store.currentUserData) return;
    const { accounts, cards, charges } = store.currentUserData;
    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const month = currentMonthKey();
    const chargesMonth = charges.filter(c => c.date.startsWith(month)).reduce((s, c) => s + Number(c.amount), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('bank-total-balance', fmtMoney(totalBalance));
    set('bank-account-count', accounts.length);
    set('bank-card-count', cards.length);
    set('bank-charges-month', fmtMoney(chargesMonth));
  }

  function renderAccounts() {
    if (!accountsBody || !store.currentUserData) return;
    accountsBody.innerHTML = store.currentUserData.accounts.map(acc => `
      <tr>
        <td>${escapeHtml(acc.name)}</td>
        <td>${escapeHtml(acc.bank)}</td>
        <td>${escapeHtml(acc.agency || '—')}</td>
        <td>${escapeHtml(acc.accountNumber || '—')}</td>
        <td>${ACCOUNT_TYPES[acc.accountType] || acc.accountType || '—'}</td>
        <td class="credit">${fmtMoney(acc.balance)}</td>
        <td><button type="button" data-id="${acc.id}" class="bank-acc-del">Remover</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="empty-row">Nenhuma conta cadastrada. Clique em "+ Nova conta bancária".</td></tr>';
  }

  function renderCards() {
    if (!cardsBody || !store.currentUserData) return;
    const month = currentMonthKey();
    cardsBody.innerHTML = store.currentUserData.cards.map(card => {
      const monthly = store.currentUserData.charges
        .filter(c => c.cardId === card.id && c.date.startsWith(month))
        .reduce((s, c) => s + Number(c.amount), 0);
      return `
        <tr>
          <td>${escapeHtml(card.name)}</td>
          <td>${escapeHtml(card.holder)}</td>
          <td>**** ${escapeHtml(card.last4)}</td>
          <td>${escapeHtml(card.anniversary)}</td>
          <td>${fmtMoney(monthly)}</td>
          <td><button type="button" data-id="${card.id}" class="bank-card-del">Remover</button></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="empty-row">Nenhum cartão cadastrado.</td></tr>';
  }

  function renderCharges() {
    if (!chargesBody || !store.currentUserData) return;
    const sorted = store.currentUserData.charges.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    chargesBody.innerHTML = sorted.map(charge => {
      const card = store.currentUserData.cards.find(c => c.id === charge.cardId);
      return `
        <tr>
          <td>${escapeHtml(charge.date)}</td>
          <td>${card ? escapeHtml(card.name) : '—'}</td>
          <td>${CHARGE_TYPES[charge.type] || charge.type}</td>
          <td class="debit">${fmtMoney(charge.amount)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" class="empty-row">Sem encargos registrados.</td></tr>';
  }

  function renderCardSelect() {
    const select = document.getElementById('bank-charge-card-select');
    if (!select || !store.currentUserData) return;
    const cards = store.currentUserData.cards;
    if (!cards.length) {
      select.innerHTML = '<option value="">Cadastre um cartão primeiro</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">Selecione o cartão</option>' +
      cards.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (****${escapeHtml(c.last4)})</option>`).join('');
  }

  function updatePrompt() {
    const u = store.currentUser();
    const show = isBusiness(u) && store.currentUserData &&
      (store.currentUserData.accounts.length === 0 || store.currentUserData.cards.length === 0);
    prompt?.classList.toggle('hidden', !show);
    const pagePrompt = document.getElementById('pj-banking-prompt-page');
    const noAccounts = store.currentUserData?.accounts.length === 0;
    pagePrompt?.classList.toggle('hidden', !isBusiness(u) || !noAccounts);
  }

  // ── Conta bancária ──
  const accForm = document.getElementById('bank-add-account-form');
  const openAcc = document.getElementById('bank-open-add-account');
  const cancelAcc = document.getElementById('bank-cancel-add-account');

  openAcc?.addEventListener('click', () => toggleForm(accForm, openAcc, true));
  cancelAcc?.addEventListener('click', () => { accForm?.reset(); toggleForm(accForm, openAcc, false); });

  accForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(accForm);
    store.mutate(data => {
      data.accounts.push({
        id: uid(),
        name: f.get('name'),
        bank: f.get('bank'),
        agency: f.get('agency') || '',
        accountNumber: f.get('accountNumber') || '',
        accountType: f.get('accountType') || 'corrente',
        initialBalance: parseFloat(f.get('balance')) || 0,
        balance: parseFloat(f.get('balance')) || 0
      });
    });
    refresh();
    accForm.reset();
    toggleForm(accForm, openAcc, false);
  });

  accountsBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('bank-acc-del')) return;
    if (!confirm('Remover esta conta e todos os lançamentos vinculados?')) return;
    const id = Number(e.target.dataset.id);
    store.mutate(data => {
      data.accounts = data.accounts.filter(a => a.id !== id);
      data.txs = data.txs.filter(t => t.accountId !== id);
    });
    refresh();
  });

  // ── Cartão ──
  const cardForm = document.getElementById('bank-add-card-form');
  const openCard = document.getElementById('bank-open-add-card');
  const cancelCard = document.getElementById('bank-cancel-add-card');

  openCard?.addEventListener('click', () => toggleForm(cardForm, openCard, true));
  cancelCard?.addEventListener('click', () => { cardForm?.reset(); toggleForm(cardForm, openCard, false); });

  cardForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(cardForm);
    store.mutate(data => {
      data.cards.push({
        id: uid(),
        name: f.get('name'),
        last4: f.get('last4'),
        holder: f.get('holder'),
        anniversary: f.get('anniversary')
      });
    });
    refresh();
    cardForm.reset();
    toggleForm(cardForm, openCard, false);
  });

  cardsBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('bank-card-del')) return;
    const id = Number(e.target.dataset.id);
    store.mutate(data => {
      data.cards = data.cards.filter(c => c.id !== id);
      data.charges = data.charges.filter(ch => ch.cardId !== id);
    });
    refresh();
  });

  // ── Encargo ──
  const chargeForm = document.getElementById('bank-add-charge-form');
  const openCharge = document.getElementById('bank-open-add-charge');
  const cancelCharge = document.getElementById('bank-cancel-add-charge');

  openCharge?.addEventListener('click', () => { renderCardSelect(); toggleForm(chargeForm, openCharge, true); });
  cancelCharge?.addEventListener('click', () => { chargeForm?.reset(); toggleForm(chargeForm, openCharge, false); });

  chargeForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(chargeForm);
    const cardId = Number(f.get('cardId'));
    if (!cardId) return alert('Selecione um cartão.');
    store.mutate(data => {
      data.charges.push({
        id: uid(),
        cardId,
        date: f.get('date'),
        type: f.get('type'),
        desc: f.get('desc'),
        amount: parseFloat(f.get('amount')) || 0
      });
    });
    refresh();
    chargeForm.reset();
    toggleForm(chargeForm, openCharge, false);
  });

  document.getElementById('pj-banking-goto')?.addEventListener('click', () => router.navigate('bancos'));
  document.getElementById('pj-banking-goto-dash')?.addEventListener('click', () => router.navigate('bancos'));

  function refresh() {
    renderAccounts();
    renderCards();
    renderCharges();
    renderCardSelect();
    updateMetrics();
    updatePrompt();
  }

  return { refresh, updateMetrics, updatePrompt };
}

export function renderBankAccountSelect(select, accounts) {
  if (!select) return;
  if (!accounts?.length) {
    select.innerHTML = '<option value="">Cadastre uma conta em Bancos & Cartões</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = '<option value="">Selecione a conta</option>' +
    accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} — ${escapeHtml(a.bank)}</option>`).join('');
}
