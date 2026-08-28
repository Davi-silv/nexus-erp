import { Events } from '../../core/event-bus.js';
import { VIEWS, PROFILE } from '../../core/constants.js';
import { formatCNPJ } from '../../domain/profile.service.js';

export function initAuthModule(store, router) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const btnLogout = document.getElementById('btn-logout');
  const btnLogin = document.getElementById('btn-login');
  const btnCurrentUser = document.getElementById('current-user');

  function refreshAuthUI() {
    const u = store.currentUser();
    const avatarEl = document.getElementById('user-avatar');
    if (u) {
      if (btnCurrentUser) btnCurrentUser.textContent = u.name;
      if (avatarEl) avatarEl.textContent = u.name.charAt(0).toUpperCase();
      btnLogout?.classList.remove('hidden');
      btnLogin?.classList.add('hidden');
    } else {
      if (btnCurrentUser) btnCurrentUser.textContent = 'Convidado';
      if (avatarEl) avatarEl.textContent = '?';
      btnLogout?.classList.add('hidden');
      btnLogin?.classList.remove('hidden');
    }
    const usersNav = document.querySelector('.nav-item[data-view="usuarios"]');
    if (usersNav) usersNav.style.display = (u?.role === 'admin') ? 'block' : 'none';
  }

  function requireAuth() {
    if (!store.isAuthenticated()) {
      router.navigate(VIEWS.AUTH);
      return false;
    }
    return true;
  }

  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(loginForm);
    const r = await store.login(f.get('email'), f.get('password'));
    if (!r.ok) alert(r.msg);
  });

  registerForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(registerForm);
    const profileType = f.get('profileType') || PROFILE.PF;
    const options = { profileType };

    if (profileType === PROFILE.PJ) {
      options.company = {
        legalName: f.get('legalName') || f.get('name'),
        tradeName: f.get('tradeName') || '',
        cnpj: formatCNPJ(f.get('cnpj')),
        taxRegime: f.get('taxRegime') || 'simples'
      };
    }

    const r = await store.register(f.get('name'), f.get('email'), f.get('password'), options);
    if (!r.ok) alert(r.msg);
    else if (r.needsEmailConfirmation) {
      alert(r.msg || 'Verifique seu e-mail para confirmar o cadastro.');
      registerForm.reset();
    } else if (r.autoLogin) {
      router.navigate(VIEWS.DASHBOARD);
    } else {
      alert('Cadastro realizado com sucesso. Faça login.');
      registerForm.reset();
      router.navigate(VIEWS.AUTH);
    }
  });

  btnLogout?.addEventListener('click', () => store.logout());
  btnLogin?.addEventListener('click', () => router.navigate(VIEWS.AUTH));

  store.bus.on(Events.AUTH_CHANGED, () => refreshAuthUI());

  return { refreshAuthUI, requireAuth };
}
