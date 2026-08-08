import { uid, toggleForm, fmtMoney, escapeHtml, currentMonthKey } from '../../core/utils.js';
import { CHARGE_TYPES } from '../../core/constants.js';

export function initCardsModule(store, auth, charts) {
  const cardsBody = document.getElementById('cards-body');
  const chargesBody = document.getElementById('charges-body');
  const chargeCardSelect = document.getElementById('charge-card-select');
  const cardCountEl = document.getElementById('card-count');
  const chargesMonthEl = document.getElementById('card-charges-month');
  const chargesTotalEl = document.getElementById('card-charges-total');

  function renderCardOptions() {
    if (!chargeCardSelect) return;
    const cards = store.currentUserData?.cards ?? [];
    if (!cards.length) {
      chargeCardSelect.innerHTML = '<option value="">Nenhum cartão cadastrado</option>';
      chargeCardSelect.disabled = true;
      return;
    }
    chargeCardSelect.disabled = false;
    chargeCardSelect.innerHTML = '<option value="">Selecione o cartão</option>' +
      cards.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (****${escapeHtml(c.last4)})</option>`).join('');
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
          <td>${escapeHtml(card.anniversary)}</td>
          <td>${fmtMoney(monthly)}</td>
          <td><button type="button" data-id="${card.id}" class="card-del">Remover</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderCharges() {
    if (!chargesBody || !store.currentUserData) return;
    const sorted = store.currentUserData.charges.slice().sort((a, b) => b.date.localeCompare(a.date));
    chargesBody.innerHTML = sorted.map(charge => {
      const card = store.currentUserData.cards.find(c => c.id === charge.cardId);
      return `
        <tr>
          <td>${escapeHtml(charge.date)}</td>
          <td>${card ? escapeHtml(card.name) : '-'}</td>
          <td>${CHARGE_TYPES[charge.type] || charge.type}</td>
          <td>${escapeHtml(charge.desc)}</td>
          <td>${fmtMoney(charge.amount)}</td>
          <td><button type="button" data-id="${charge.id}" class="charge-del">Remover</button></td>
        </tr>
      `;
    }).join('');
  }

  function updateChargeMetrics() {
    if (!store.currentUserData) return;
    const month = currentMonthKey();
    const monthlyTotal = store.currentUserData.charges.filter(c => c.date.startsWith(month)).reduce((s, c) => s + Number(c.amount), 0);
    const totalAll = store.currentUserData.charges.reduce((s, c) => s + Number(c.amount), 0);
    if (chargesMonthEl) chargesMonthEl.textContent = fmtMoney(monthlyTotal);
    if (chargesTotalEl) chargesTotalEl.textContent = fmtMoney(totalAll);
    if (cardCountEl) cardCountEl.textContent = store.currentUserData.cards.length;
  }

  function refresh() {
    renderCards();
    renderCharges();
    renderCardOptions();
    updateChargeMetrics();
    if (store.currentUserData) charts.updateCards(store.currentUserData.charges, store.currentUserData.cards);
  }

  const openAddCard = document.getElementById('open-add-card');
  const cardForm = document.getElementById('add-card-form');
  const cancelAddCard = document.getElementById('cancel-add-card');

  openAddCard?.addEventListener('click', () => toggleForm(cardForm, openAddCard, true));
  cancelAddCard?.addEventListener('click', () => {
    cardForm?.reset();
    toggleForm(cardForm, openAddCard, false);
  });

  cardForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(cardForm);
    store.mutate(data => {
      data.cards.push({ id: uid(), name: f.get('name'), last4: f.get('last4'), holder: f.get('holder'), anniversary: f.get('anniversary') });
    });
    refresh();
    cardForm.reset();
    toggleForm(cardForm, openAddCard, false);
  });

  cardsBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('card-del')) return;
    const id = Number(e.target.dataset.id);
    store.mutate(data => {
      data.cards = data.cards.filter(c => c.id !== id);
      data.charges = data.charges.filter(ch => ch.cardId !== id);
    });
    refresh();
  });

  const openAddCharge = document.getElementById('open-add-charge');
  const chargeForm = document.getElementById('add-charge-form');
  const cancelAddCharge = document.getElementById('cancel-add-charge');

  openAddCharge?.addEventListener('click', () => {
    renderCardOptions();
    toggleForm(chargeForm, openAddCharge, true);
  });
  cancelAddCharge?.addEventListener('click', () => {
    chargeForm?.reset();
    toggleForm(chargeForm, openAddCharge, false);
  });

  chargeForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(chargeForm);
    const cardId = Number(f.get('cardId')) || null;
    const date = f.get('date');
    const type = f.get('type');
    const desc = f.get('desc')?.trim();
    const amount = parseFloat(f.get('amount')) || 0;
    if (!cardId || !date || !type || !desc || amount <= 0) {
      return alert('Preencha todos os campos obrigatórios.');
    }
    store.mutate(data => {
      data.charges.push({ id: uid(), cardId, date, type, desc, amount });
    });
    refresh();
    chargeForm.reset();
    toggleForm(chargeForm, openAddCharge, false);
  });

  chargesBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('charge-del')) return;
    store.mutate(data => {
      data.charges = data.charges.filter(c => c.id !== Number(e.target.dataset.id));
    });
    refresh();
  });

  return { renderCards, renderCharges, renderCardOptions, updateChargeMetrics, refresh };
}
