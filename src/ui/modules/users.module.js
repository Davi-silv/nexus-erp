import { toggleForm, escapeHtml, parseId } from '../../core/utils.js';

export function initUsersModule(store, auth) {
  const usersBody = document.getElementById('users-body');
  const openAddUser = document.getElementById('open-add-user');
  const userForm = document.getElementById('add-user-form');
  const cancelAddUser = document.getElementById('cancel-add-user');

  function renderUsers() {
    if (!usersBody) return;

    if (store.isCloudMode()) {
      openAddUser?.classList.add('hidden');
      usersBody.innerHTML = store.users.map(u => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${escapeHtml(u.role)}</td>
          <td><span class="text-muted">Membro do workspace</span></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-row">Nenhum membro encontrado.</td></tr>';
      return;
    }

    openAddUser?.classList.remove('hidden');
    usersBody.innerHTML = store.users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td><button type="button" data-id="${u.id}" class="user-del">Remover</button></td>
      </tr>
    `).join('');
  }

  openAddUser?.addEventListener('click', () => {
    if (store.isCloudMode()) {
      alert('Convite de membros ao workspace estará disponível em breve. No modo cloud, cada cadastro cria um workspace próprio.');
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
    store.deleteUser(parseId(e.target.dataset.id));
    renderUsers();
  });

  return { renderUsers };
}
