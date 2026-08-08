import { toggleForm, escapeHtml } from '../../core/utils.js';

export function initUsersModule(store, auth) {
  const usersBody = document.getElementById('users-body');

  function renderUsers() {
    if (!usersBody) return;
    usersBody.innerHTML = store.users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td><button type="button" data-id="${u.id}" class="user-del">Remover</button></td>
      </tr>
    `).join('');
  }

  const openAddUser = document.getElementById('open-add-user');
  const userForm = document.getElementById('add-user-form');
  const cancelAddUser = document.getElementById('cancel-add-user');

  openAddUser?.addEventListener('click', () => toggleForm(userForm, openAddUser, true));
  cancelAddUser?.addEventListener('click', () => {
    userForm?.reset();
    toggleForm(userForm, openAddUser, false);
  });

  userForm?.addEventListener('submit', async e => {
    e.preventDefault();
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
    store.deleteUser(Number(e.target.dataset.id));
    renderUsers();
  });

  return { renderUsers };
}
