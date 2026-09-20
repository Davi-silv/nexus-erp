import { toggleForm, escapeHtml, parseId } from '../../core/utils.js';
import { ROLE_LABELS, normalizeRole, MODULES, ACTIONS, can } from '../../domain/rbac.service.js';
import { getCompanyRole } from '../rbac-guards.js';

function roleLabel(user) {
  const key = normalizeRole(user.companyRole || user.role);
  return ROLE_LABELS[key] || escapeHtml(String(user.role || '—'));
}

export function initUsersModule(store, auth) {
  const usersBody = document.getElementById('users-body');
  const openAddUser = document.getElementById('open-add-user');
  const userForm = document.getElementById('add-user-form');
  const cancelAddUser = document.getElementById('cancel-add-user');

  function canManageUsers() {
    return can(getCompanyRole(store), MODULES.USERS, ACTIONS.CREATE);
  }

  function renderUsers() {
    if (!usersBody) return;

    if (store.isCloudMode()) {
      openAddUser?.classList.toggle('hidden', true);
      usersBody.innerHTML = store.users.map(u => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${roleLabel(u)}</td>
          <td><span class="text-muted">Membro da empresa</span></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-row">Nenhum membro encontrado.</td></tr>';
      return;
    }

    openAddUser?.classList.toggle('hidden', !canManageUsers());
    usersBody.innerHTML = store.users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleLabel(u)}</td>
        <td>${can(getCompanyRole(store), MODULES.USERS, ACTIONS.DELETE)
          ? `<button type="button" data-id="${u.id}" class="user-del">Remover</button>`
          : '<span class="text-muted">—</span>'}</td>
      </tr>
    `).join('');
  }

  openAddUser?.addEventListener('click', () => {
    if (store.isCloudMode()) {
      alert('Convite de membros com cargo estará disponível em breve.');
      return;
    }
    if (!canManageUsers()) {
      alert('Seu cargo não permite cadastrar usuários.');
      return;
    }
    toggleForm(userForm, openAddUser, true);
  });

  cancelAddUser?.addEventListener('click', () => {
    userForm?.reset();
    toggleForm(userForm, openAddUser, false);
  });

  userForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (store.isCloudMode()) {
      alert('Cadastro de usuários locais não está disponível no modo cloud.');
      return;
    }
    if (!canManageUsers()) {
      alert('Permissão negada.');
      return;
    }
    const f = new FormData(userForm);
    const pass = Math.random().toString(36).slice(-8);
    const r = await store.register(f.get('name'), f.get('email'), pass, { role: f.get('role') });
    if (!r.ok) alert(r.msg);
    else {
      alert('Usuário criado. Senha temporária: ' + pass);
      renderUsers();
      userForm.reset();
      toggleForm(userForm, openAddUser, false);
    }
  });

  usersBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('user-del')) return;
    if (!can(getCompanyRole(store), MODULES.USERS, ACTIONS.DELETE)) {
      alert('Permissão negada.');
      return;
    }
    store.deleteUser(parseId(e.target.dataset.id));
    renderUsers();
  });

  return { renderUsers };
}
