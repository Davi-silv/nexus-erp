/** Chaves de persistência — contrato estável para migrações futuras */
export { PROFILE } from '../domain/profile.service.js';

export const STORAGE_KEYS = {
  USERS: 'nexus:users',
  SESSION: 'nexus:currentUser',
  WORKSPACE: 'nexus:currentWorkspace',
  AI_CONFIG: 'nexus:ai-config',
  userPrefix: (uid) => `nexus:user:${uid}:`
};

export const DEFAULT_ADMIN = {
  id: 1,
  name: 'Admin',
  email: 'admin@nexus.local',
  role: 'admin',
  password: 'admin'
};

export const EMPTY_USER_DATA = () => ({
  accounts: [],
  txs: [],
  cards: [],
  charges: [],
  categories: [],
  goals: [],
  recurring: [],
  healthHistory: [],
  costCenters: []
});

export const VIEWS = {
  AUTH: 'auth',
  DASHBOARD: 'dashboard',
  ACCOUNTS: 'contas',
  TRANSACTIONS: 'lancamentos',
  CARDS: 'cartoes',
  CATEGORIES: 'categorias',
  RECURRING: 'recorrentes',
  HEALTH: 'saude',
  AI: 'ia-analise',
  RECONCILE: 'conciliacao',
  REPORTS: 'relatorios',
  USERS: 'usuarios',
  COMPANY: 'empresa',
  BANKING: 'bancos',
  PLANS: 'planos',
  BILLING: 'assinatura'
};

export const CHARGE_TYPES = {
  annual_fee: 'Taxa Anual',
  interest: 'Juros',
  annuity: 'Anuidade',
  insurance: 'Seguro',
  other: 'Outro'
};
