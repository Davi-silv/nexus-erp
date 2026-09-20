import { toggleForm, escapeHtml, parseId } from '../../core/utils.js';
import {
  ROLE_LABELS,
  normalizeRole,
  MODULES,
  ACTIONS,
  can,
  assignableMemberRoles,
  canAssignMemberRole
} from '../../domain/rbac.service.js';
import { getCompanyRole } from '../rbac-guards.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { membersRepo } from '../../repositories/supabase/members.repository.js';
import { guardModuleAction } from '../rbac-guards.js';

function roleLabel(user) {
  const key = normalizeRole(user.companyRole || user.role);
  return ROLE_LABELS[key] || escapeHtml(String(user.role || '—'));
}

function roleOptionsHtml(actorRole, selected) {
  const sel = normalizeRole(selected);
  return assignableMemberRoles(actorRole).map(r => {
    const v = normalizeRole(r);
    return `<option value="${v}"${v === sel ? ' selected' : ''}>${ROLE_LABELS[v]}</option>`;
  }).join('');
}

export function initUsersModule(store, auth, router) {
  const usersBody = document.getElementById('users-body');
  const openAddUser = document.getElementById('open-add-user');
  const userForm = document.getElementById('add-user-form');
  const cancelAddUser = document.getElementById('cancel-add-user');
  const roleSelect = userForm?.querySelector('[name="role"]');

  function actorRole() {
    return getCompanyRole(store);
  }

  function canManageUsers() {
    return can(actorRole(), MODULES.USERS, ACTIONS.CREATE);
  }

  function canEditUsers() {
    return can(actorRole(), MODULES.USERS, ACTIONS.EDIT);
  }

  function canRemoveUsers() {
    return can(actorRole(), MODULES.USERS, ACTIONS.DELETE);
  }

  function syncInviteRoleSelect() {
    const hint = document.getElementById('user-invite-hint');
    if (hint) hint.classList.toggle('hidden', !store.isCloudMode());
    if (!roleSelect || !store.isCloudMode()) {
      if (roleSelect && !store.isCloudMode()) {
        roleSelect.innerHTML = '<option value="admin">Admin</option><option value="user">Usuário</option>';
      }
      return;
    }
    const roles = assignableMemberRoles(actorRole());
    roleSelect.innerHTML = roles.map(r => {
      const v = normalizeRole(r);
      return `<option value="${v}">${ROLE_LABELS[v]}</option>`;
    }).join('');
  }

  async function reloadMembers() {
    if (!store.isCloudMode() || !store.workspaceId) return;
    try {
      store.users = await membersRepo.listMembers(store.workspaceId);
    } catch (e) {
      console.warn('[users]', e.message);
    }
  }

  function renderUsers() {
    if (!usersBody) return;
    syncInviteRoleSelect();

    if (store.isCloudMode()) {
      openAddUser?.classList.toggle('hidden', !canManageUsers());
      if (openAddUser && canManageUsers()) {
        openAddUser.textContent = '+ Adicionar membro';
      }
      usersBody.innerHTML = store.users.map(u => {
        const uid = u.id;
        const isOwner = normalizeRole(u.companyRole) === 'owner';
        const isSelf = uid === store.currentUserId;
        const roleCell = isOwner
          ? escapeHtml(ROLE_LABELS.owner)
          : (canEditUsers()
            ? `<select data-user-role="${uid}" class="user-role-select" aria-label="Cargo">${roleOptionsHtml(actorRole(), u.companyRole)}</select>`
            : roleLabel(u));
        let actions = '<span class="text-muted">—</span>';
        if (!isOwner && !isSelf && canRemoveUsers()) {
          actions = `<button type="button" class="user-del" data-id="${uid}">Remover</button>`;
        }
        return `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${roleCell}</td>
          <td class="table-actions">${actions}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="empty-row">Nenhum membro encontrado.</td></tr>';
      return;
    }

    openAddUser?.classList.toggle('hidden', !canManageUsers());
    if (openAddUser) openAddUser.textContent = '+ Novo usuário';
    usersBody.innerHTML = store.users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleLabel(u)}</td>
        <td>${canRemoveUsers()
          ? `<button type="button" data-id="${u.id}" class="user-del">Remover</button>`
          : '<span class="text-muted">—</span>'}</td>
      </tr>
    `).join('');
  }

  openAddUser?.addEventListener('click', () => {
    if (!canManageUsers()) {
      alert('Seu cargo não permite gerenciar usuários.');
      return;
    }
    if (store.isCloudMode()) {
      const nameInput = userForm?.querySelector('[name="name"]');
      if (nameInput) {
        nameInput.required = false;
        nameInput.classList.add('hidden');
      }
    }
    toggleForm(userForm, openAddUser, true);
  });

  cancelAddUser?.addEventListener('click', () => {
    userForm?.reset();
    const nameInput = userForm?.querySelector('[name="name"]');
    if (nameInput) {
      nameInput.required = true;
      nameInput.classList.remove('hidden');
    }
    toggleForm(userForm, openAddUser, false);
  });

  userForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!canManageUsers()) {
      alert('Permissão negada.');
      return;
    }

    const f = new FormData(userForm);
    const role = f.get('role');

    if (store.isCloudMode()) {
      if (!isSupabaseEnabled || !store.workspaceId) return;
      if (!guardModuleAction(store, MODULES.USERS, ACTIONS.CREATE, router)) return;
      const email = String(f.get('email') || '').trim();
      if (!email) {
        alert('Informe o e-mail.');
        return;
      }
      if (!canAssignMemberRole(actorRole(), role)) {
        alert('Cargo não permitido para seu perfil.');
        return;
      }
      try {
        await membersRepo.addMemberByEmail(store.workspaceId, email, normalizeRole(role));
        await reloadMembers();
        renderUsers();
        userForm.reset();
        toggleForm(userForm, openAddUser, false);
        alert('Membro adicionado. Ele já pode acessar esta empresa com o cargo escolhido.');
      } catch (err) {
        alert(err.message || 'Erro ao adicionar membro.');
      }
      return;
    }

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

  usersBody?.addEventListener('click', async e => {
    if (!e.target.classList.contains('user-del')) return;
    const id = parseId(e.target.dataset.id);
    if (store.isCloudMode()) {
      if (!guardModuleAction(store, MODULES.USERS, ACTIONS.DELETE, router)) return;
      if (!confirm('Remover este membro da empresa?')) return;
      try {
        await membersRepo.removeMember(store.workspaceId, id);
        await reloadMembers();
        renderUsers();
      } catch (err) {
        alert(err.message || 'Erro ao remover.');
      }
      return;
    }
    if (!canRemoveUsers()) {
      alert('Permissão negada.');
      return;
    }
    store.deleteUser(id);
    renderUsers();
  });

  usersBody?.addEventListener('change', async e => {
    const sel = e.target.closest('.user-role-select');
    if (!sel || !store.isCloudMode()) return;
    const userId = sel.dataset.userRole;
    const role = sel.value;
    if (!guardModuleAction(store, MODULES.USERS, ACTIONS.EDIT, router)) {
      renderUsers();
      return;
    }
    if (!canAssignMemberRole(actorRole(), role)) {
      alert('Cargo não permitido.');
      renderUsers();
      return;
    }
    try {
      await membersRepo.setMemberRole(store.workspaceId, userId, role);
      await reloadMembers();
      renderUsers();
    } catch (err) {
      alert(err.message || 'Erro ao alterar cargo.');
      renderUsers();
    }
  });

  return { renderUsers, reloadMembers };
}
