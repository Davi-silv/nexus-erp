import {
  ACTIONS,
  can,
  canAccessView,
  moduleForView,
  normalizeRole,
  ROLE_LABELS
} from '../domain/rbac.service.js';

export function getCompanyRole(store) {
  if (!store?.isCloudMode?.()) {
    return normalizeRole(store?.currentUser?.()?.role === 'admin' ? 'owner' : 'viewer');
  }
  return normalizeRole(store.companyRole || store._sessionUser?.companyRole || 'viewer');
}

export function guardViewAccess(store, viewId, router) {
  const role = getCompanyRole(store);
  if (canAccessView(role, viewId)) return true;
  const mod = moduleForView(viewId);
  alert(`Seu cargo (${ROLE_LABELS[role] || role}) não permite acessar este módulo.`);
  router.navigate('dashboard');
  return false;
}

export function guardModuleAction(store, module, action, router) {
  const role = getCompanyRole(store);
  if (can(role, module, action)) return true;
  alert(`Permissão negada: ${action} em ${module} não permitido para ${ROLE_LABELS[role] || role}.`);
  if (router) router.navigate('dashboard');
  return false;
}

export function guardViewMutation(store, viewId, action, router) {
  const mod = moduleForView(viewId);
  if (!mod) return true;
  return guardModuleAction(store, mod, action, router);
}

export function applyNavVisibility(store) {
  const role = getCompanyRole(store);
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    const viewId = btn.dataset.view;
    const allowed = canAccessView(role, viewId);
    btn.closest('li')?.classList.toggle('hidden', !allowed);
  });
}

export { ACTIONS, can, moduleForView };
