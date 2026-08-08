import { getLabels, getProfileType, isBusiness } from '../domain/profile.service.js';

/** Aplica labels e visibilidade conforme perfil PF/PJ */
export function applyProfileUI(store) {
  const user = store.currentUser();
  const type = getProfileType(user);
  const labels = getLabels(type);
  const business = isBusiness(user);

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  };

  setText('label-income', labels.income);
  setText('label-expense', labels.expense);
  setText('label-balance', labels.balance);
  setText('label-health-score', labels.healthScore);
  setText('label-savings', labels.savings);
  setText('label-expense-ratio', labels.expenseRatio);
  setText('dashboard-title', labels.dashboardTitle);
  setText('dashboard-desc', labels.dashboardDesc);
  setText('profile-badge', labels.profileBadge);

  const companyNav = document.querySelector('.nav-item[data-view="empresa"]');
  const bancosNav = document.querySelector('.nav-item[data-view="bancos"]');
  const contasNav = document.querySelector('.nav-item[data-view="contas"]');
  const cartoesNav = document.querySelector('.nav-item[data-view="cartoes"]');
  const drePanel = document.getElementById('dre-panel');
  const pjTxFields = document.querySelectorAll('.pj-only');

  if (companyNav) companyNav.closest('li').style.display = business ? '' : 'none';
  if (bancosNav) bancosNav.closest('li').style.display = business ? '' : 'none';
  if (contasNav) contasNav.closest('li').style.display = business ? 'none' : '';
  if (cartoesNav) cartoesNav.closest('li').style.display = business ? 'none' : '';
  if (drePanel) drePanel.classList.toggle('hidden', !business);

  pjTxFields.forEach(el => el.classList.toggle('hidden', !business));

  document.querySelectorAll('.pj-field').forEach(el => {
    el.classList.toggle('hidden', !business);
  });

  if (user?.company?.tradeName && business) {
    setText('current-user', user.company.tradeName || user.name);
  } else if (user) {
    setText('current-user', user.name);
  }

  setText('auth-hero-title', labels.authHero);
  setText('auth-hero-desc', labels.authDesc);
  document.body.dataset.profile = type;
}

export function bindProfileTypeToggle() {
  const pfBtn = document.getElementById('profile-pf');
  const pjBtn = document.getElementById('profile-pj');
  const pjFields = document.getElementById('register-pj-fields');
  const nameInput = document.querySelector('#register-form input[name="name"]');
  const profileInput = document.getElementById('register-profile-type');

  if (!pfBtn || !pjBtn) return;

  const select = (type) => {
    pfBtn.classList.toggle('active', type === 'pf');
    pjBtn.classList.toggle('active', type === 'pj');
    if (pjFields) pjFields.classList.toggle('hidden', type !== 'pj');
    if (profileInput) profileInput.value = type;
    if (nameInput) {
      nameInput.placeholder = type === 'pj' ? 'Nome do responsável' : 'Nome completo';
    }
  };

  pfBtn.addEventListener('click', () => select('pf'));
  pjBtn.addEventListener('click', () => select('pj'));
  select('pf');
}
