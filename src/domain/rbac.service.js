/** RBAC — cargos e permissões por módulo (fonte única no frontend) */

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  FINANCEIRO: 'financial',
  COMERCIAL: 'commercial',
  VENDEDOR: 'seller',
  CONTADOR: 'accountant',
  VISUALIZADOR: 'viewer'
};

export const MODULES = {
  DASHBOARD: 'dashboard',
  FINANCIAL: 'financial',
  CRM: 'crm',
  CUSTOMERS: 'customers',
  QUOTES: 'quotes',
  FISCAL: 'fiscal',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  USERS: 'users'
};

export const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete'
};

export const ROLE_LABELS = {
  [ROLES.OWNER]: 'Owner',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.FINANCEIRO]: 'Financeiro',
  [ROLES.COMERCIAL]: 'Comercial',
  [ROLES.VENDEDOR]: 'Vendedor',
  [ROLES.CONTADOR]: 'Contador',
  [ROLES.VISUALIZADOR]: 'Visualizador'
};

const ALL = { view: true, create: true, edit: true, delete: true };
const VIEW = { view: true, create: false, edit: false, delete: false };
const NONE = { view: false, create: false, edit: false, delete: false };

function m(view, create = false, edit = false, del = false) {
  return { view, create, edit, delete: del };
}

/** Matriz de permissões por cargo */
export const PERMISSION_MATRIX = {
  [ROLES.OWNER]: Object.fromEntries(Object.values(MODULES).map(mod => [mod, { ...ALL }])),

  [ROLES.ADMIN]: {
    [MODULES.DASHBOARD]: ALL,
    [MODULES.FINANCIAL]: ALL,
    [MODULES.CRM]: ALL,
    [MODULES.CUSTOMERS]: ALL,
    [MODULES.QUOTES]: ALL,
    [MODULES.FISCAL]: ALL,
    [MODULES.REPORTS]: ALL,
    [MODULES.SETTINGS]: ALL,
    [MODULES.USERS]: m(true, true, true, false)
  },

  [ROLES.FINANCEIRO]: {
    [MODULES.DASHBOARD]: VIEW,
    [MODULES.FINANCIAL]: ALL,
    [MODULES.CRM]: VIEW,
    [MODULES.CUSTOMERS]: m(true, true, true, false),
    [MODULES.QUOTES]: m(true, true, true, false),
    [MODULES.FISCAL]: m(true, false, false, false),
    [MODULES.REPORTS]: m(true, true, true, false),
    [MODULES.SETTINGS]: m(true, false, false, false),
    [MODULES.USERS]: NONE
  },

  [ROLES.COMERCIAL]: {
    [MODULES.DASHBOARD]: VIEW,
    [MODULES.FINANCIAL]: m(true, false, false, false),
    [MODULES.CRM]: ALL,
    [MODULES.CUSTOMERS]: ALL,
    [MODULES.QUOTES]: ALL,
    [MODULES.FISCAL]: VIEW,
    [MODULES.REPORTS]: m(true, false, false, false),
    [MODULES.SETTINGS]: NONE,
    [MODULES.USERS]: NONE
  },

  [ROLES.VENDEDOR]: {
    [MODULES.DASHBOARD]: VIEW,
    [MODULES.FINANCIAL]: NONE,
    [MODULES.CRM]: m(true, true, true, false),
    [MODULES.CUSTOMERS]: m(true, true, true, false),
    [MODULES.QUOTES]: m(true, true, true, false),
    [MODULES.FISCAL]: NONE,
    [MODULES.REPORTS]: NONE,
    [MODULES.SETTINGS]: NONE,
    [MODULES.USERS]: NONE
  },

  [ROLES.CONTADOR]: {
    [MODULES.DASHBOARD]: VIEW,
    [MODULES.FINANCIAL]: m(true, false, false, false),
    [MODULES.CRM]: VIEW,
    [MODULES.CUSTOMERS]: VIEW,
    [MODULES.QUOTES]: VIEW,
    [MODULES.FISCAL]: m(true, true, true, false),
    [MODULES.REPORTS]: m(true, true, false, false),
    [MODULES.SETTINGS]: NONE,
    [MODULES.USERS]: NONE
  },

  [ROLES.VISUALIZADOR]: Object.fromEntries(
    Object.values(MODULES).map(mod => [mod, { ...VIEW }])
  )
};

export function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  const map = {
    owner: ROLES.OWNER,
    admin: ROLES.ADMIN,
    financial: ROLES.FINANCEIRO,
    financeiro: ROLES.FINANCEIRO,
    commercial: ROLES.COMERCIAL,
    comercial: ROLES.COMERCIAL,
    manager: ROLES.COMERCIAL,
    seller: ROLES.VENDEDOR,
    vendedor: ROLES.VENDEDOR,
    accountant: ROLES.CONTADOR,
    contador: ROLES.CONTADOR,
    viewer: ROLES.VISUALIZADOR,
    visualizador: ROLES.VISUALIZADOR
  };
  return map[r] || ROLES.VISUALIZADOR;
}

export function can(role, module, action) {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.OWNER) return true;
  const modPerms = PERMISSION_MATRIX[normalized]?.[module];
  if (!modPerms) return false;
  return Boolean(modPerms[action]);
}

export function permissionsForRole(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.OWNER) {
    return Object.fromEntries(
      Object.values(MODULES).map(mod => [mod, { ...ALL }])
    );
  }
  return { ...(PERMISSION_MATRIX[normalized] || {}) };
}

/** Mapeamento view (router) → módulo RBAC */
export const VIEW_MODULE_MAP = {
  dashboard: MODULES.DASHBOARD,
  contas: MODULES.FINANCIAL,
  lancamentos: MODULES.FINANCIAL,
  cartoes: MODULES.FINANCIAL,
  categorias: MODULES.FINANCIAL,
  recorrentes: MODULES.FINANCIAL,
  'fluxo-caixa': MODULES.FINANCIAL,
  'contas-receber': MODULES.FINANCIAL,
  'contas-pagar': MODULES.FINANCIAL,
  bancos: MODULES.FINANCIAL,
  empresa: MODULES.FINANCIAL,
  saude: MODULES.FINANCIAL,
  'ia-analise': MODULES.FINANCIAL,
  crm: MODULES.CRM,
  clientes: MODULES.CUSTOMERS,
  servicos: MODULES.QUOTES,
  orcamentos: MODULES.QUOTES,
  'config-fiscal': MODULES.FISCAL,
  'notas-fiscais': MODULES.FISCAL,
  conciliacao: MODULES.REPORTS,
  relatorios: MODULES.REPORTS,
  usuarios: MODULES.USERS,
  planos: MODULES.SETTINGS,
  assinatura: MODULES.SETTINGS
};

export function moduleForView(viewId) {
  return VIEW_MODULE_MAP[viewId] || null;
}

export function canAccessView(role, viewId) {
  const mod = moduleForView(viewId);
  if (!mod) return true;
  return can(role, mod, ACTIONS.VIEW);
}

/** Cargos que podem ser escolhidos em convite / edição (nunca owner) */
export const ASSIGNABLE_MEMBER_ROLES = [
  ROLES.ADMIN,
  ROLES.FINANCEIRO,
  ROLES.COMERCIAL,
  ROLES.VENDEDOR,
  ROLES.CONTADOR,
  ROLES.VISUALIZADOR
];

export function assignableMemberRoles(actorRole) {
  const actor = normalizeRole(actorRole);
  if (actor === ROLES.OWNER) return [...ASSIGNABLE_MEMBER_ROLES];
  if (actor === ROLES.ADMIN) {
    return ASSIGNABLE_MEMBER_ROLES.filter(r => r !== ROLES.ADMIN);
  }
  return [];
}

export function canAssignMemberRole(actorRole, targetRole) {
  return assignableMemberRoles(actorRole).includes(normalizeRole(targetRole));
}
