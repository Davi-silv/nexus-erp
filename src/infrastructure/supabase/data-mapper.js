/** Mapeamento bidirecional v2 (frontend) ↔ v3 (PostgreSQL) */

import { parseJsonField, stringifyJsonField } from './json-fields.js';

const ACCOUNT_TYPE_MAP = {
  corrente: 'checking',
  poupanca: 'savings',
  pagamento: 'digital_wallet'
};

const ACCOUNT_TYPE_REVERSE = {
  checking: 'corrente',
  savings: 'poupanca',
  digital_wallet: 'pagamento',
  cash: 'corrente',
  investment: 'corrente',
  other: 'corrente'
};

const FREQ_MAP = {
  diaria: 'daily',
  semanal: 'weekly',
  mensal: 'monthly',
  anual: 'yearly',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly'
};

const FREQ_REVERSE = {
  daily: 'diaria',
  weekly: 'semanal',
  monthly: 'mensal',
  yearly: 'anual'
};

function txTypeToV3(type) {
  return type === 'credit' ? 'income' : 'expense';
}

function txTypeToV2(type) {
  return type === 'income' ? 'credit' : 'debit';
}

function workspaceTypeToProfile(type) {
  return ['business', 'mei'].includes(type) ? 'pj' : 'pf';
}

function profileToWorkspaceType(profileType, company) {
  if (profileType === 'pj') {
    return company?.taxRegime === 'mei' ? 'mei' : 'business';
  }
  return 'personal';
}

export function buildUserFromSession(authUser, profile, workspace, memberRole) {
  const meta = authUser.user_metadata || {};
  const profileType = meta.profile_type || workspaceTypeToProfile(workspace?.type);
  const company = meta.company || (workspace?.type !== 'personal' ? {
    legalName: workspace?.name,
    tradeName: workspace?.name,
    cnpj: workspace?.document,
    taxRegime: workspace?.type === 'mei' ? 'mei' : 'simples'
  } : null);

  return {
    id: authUser.id,
    name: profile?.full_name || meta.full_name || authUser.email?.split('@')[0] || 'Usuário',
    email: authUser.email,
    role: memberRole === 'owner' || memberRole === 'admin' ? 'admin' : 'user',
    profileType,
    company
  };
}

export function workspaceParamsFromRegister(name, profileType, company) {
  const type = profileToWorkspaceType(profileType, company);
  const wsName = profileType === 'pj'
    ? (company?.tradeName || company?.legalName || name)
    : name;
  const document = profileType === 'pj' ? (company?.cnpj || null) : null;
  return { name: wsName, type, document };
}

export function mapAccountFromDb(row) {
  const meta = parseJsonField(row.institution, { bank: row.institution || '' });
  const bank = meta.bank ?? meta._text ?? row.institution ?? '';
  return {
    id: row.id,
    name: row.name,
    bank,
    agency: meta.agency || '',
    accountNumber: meta.accountNumber || '',
    initialBalance: Number(row.initial_balance),
    balance: Number(row.current_balance),
    accountType: ACCOUNT_TYPE_REVERSE[row.type] || 'corrente'
  };
}

export function mapAccountToDb(row, workspaceId, userId) {
  const institution = stringifyJsonField({
    bank: row.bank || '',
    agency: row.agency || '',
    accountNumber: row.accountNumber || ''
  });
  return {
    id: row.id,
    workspace_id: workspaceId,
    name: row.name,
    institution,
    type: ACCOUNT_TYPE_MAP[row.accountType] || 'checking',
    initial_balance: Number(row.initialBalance ?? row.balance ?? 0),
    current_balance: Number(row.balance ?? row.initialBalance ?? 0),
    created_by: userId,
    active: true
  };
}

export function mapTransactionFromDb(row) {
  const notes = parseJsonField(row.notes, {});
  const tx = {
    id: row.id,
    date: row.transaction_date,
    desc: row.description,
    type: txTypeToV2(row.type),
    amount: Number(row.amount),
    accountId: row.financial_account_id
  };
  if (row.category_id) tx.categoryId = row.category_id;
  if (row.cost_center_id) tx.costCenterId = row.cost_center_id;
  if (notes.docNumber || notes._text) tx.docNumber = notes.docNumber || notes._text;
  if (notes.counterparty) tx.counterparty = notes.counterparty;
  return tx;
}

export function mapTransactionToDb(row, workspaceId, userId) {
  const notes = stringifyJsonField({
    docNumber: row.docNumber || null,
    counterparty: row.counterparty || null
  });
  return {
    id: row.id,
    workspace_id: workspaceId,
    financial_account_id: row.accountId,
    category_id: row.categoryId || null,
    cost_center_id: row.costCenterId || null,
    type: txTypeToV3(row.type),
    description: row.desc,
    amount: Number(row.amount),
    transaction_date: row.date,
    status: 'completed',
    notes,
    created_by: userId
  };
}

export function mapCategoryFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#94a3b8',
    type: row.type
  };
}

export function mapCategoryToDb(row, workspaceId) {
  return {
    id: row.id,
    workspace_id: workspaceId,
    name: row.name,
    color: row.color || '#94a3b8',
    type: row.type || (row.name?.toLowerCase().includes('receita') || row.name?.toLowerCase().includes('vendas') ? 'income' : 'expense'),
    active: true
  };
}

export function mapGoalFromDb(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    limit: Number(row.monthly_limit)
  };
}

export function mapGoalToDb(row, workspaceId) {
  return {
    id: row.id,
    workspace_id: workspaceId,
    category_id: row.categoryId,
    monthly_limit: Number(row.limit),
    active: true
  };
}

export function mapCostCenterFromDb(row) {
  const meta = parseJsonField(row.description, {});
  return {
    id: row.id,
    code: meta.code || '',
    name: row.name,
    budget: meta.budget != null ? Number(meta.budget) : null,
    description: meta.text || meta._text || ''
  };
}

export function mapCostCenterToDb(row, workspaceId) {
  const description = stringifyJsonField({
    code: row.code || '',
    budget: row.budget ?? null,
    text: row.description || ''
  });
  return {
    id: row.id,
    workspace_id: workspaceId,
    name: row.name,
    description,
    active: true
  };
}

export function mapCardFromDb(row) {
  const meta = parseJsonField(row.institution, {});
  return {
    id: row.id,
    name: row.name,
    holder: meta.holder || '',
    last4: meta.last4 || '',
    anniversary: meta.anniversary || ''
  };
}

export function mapCardToDb(row, workspaceId, userId) {
  return {
    id: row.id,
    workspace_id: workspaceId,
    name: row.name,
    institution: stringifyJsonField({ holder: row.holder, last4: row.last4, anniversary: row.anniversary }),
    limit_amount: 0,
    created_by: userId,
    active: true
  };
}

export function mapChargeFromDb(row) {
  const meta = parseChargeMeta(row);
  return {
    id: row.id,
    cardId: row.credit_card_id,
    date: row.purchase_date,
    type: meta.type || 'other',
    desc: meta.desc || row.description,
    amount: Number(row.amount)
  };
}

function parseChargeMeta(row) {
  const parts = String(row.description || '').split('::');
  if (parts.length >= 2) {
    return { type: parts[0], desc: parts.slice(1).join('::') };
  }
  return { type: 'other', desc: row.description };
}

export function mapChargeToDb(row, workspaceId, userId) {
  return {
    id: row.id,
    workspace_id: workspaceId,
    credit_card_id: row.cardId,
    description: `${row.type}::${row.desc}`,
    amount: Number(row.amount),
    purchase_date: row.date,
    created_by: userId
  };
}

export function mapRecurringFromDb(row) {
  return {
    id: row.id,
    desc: row.description,
    type: txTypeToV2(row.type),
    amount: Number(row.amount),
    frequency: FREQ_REVERSE[row.frequency] || row.frequency,
    accountId: row.financial_account_id,
    startDate: row.start_date,
    nextOccurrence: row.next_execution || row.start_date,
    active: row.active
  };
}

export function mapRecurringToDb(row, workspaceId, userId) {
  return {
    id: row.id,
    workspace_id: workspaceId,
    financial_account_id: row.accountId,
    type: txTypeToV3(row.type),
    description: row.desc,
    amount: Number(row.amount),
    frequency: FREQ_MAP[row.frequency] || 'monthly',
    start_date: row.startDate,
    next_execution: row.nextOccurrence || row.startDate,
    active: row.active !== false,
    created_by: userId
  };
}

export function mapHealthFromDb(row) {
  return {
    date: row.calculated_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    score: row.score
  };
}

export function mapHealthToDb(row, workspaceId) {
  return {
    workspace_id: workspaceId,
    score: row.score,
    calculated_at: `${row.date}T12:00:00.000Z`
  };
}

export function mapDbToUserData({
  accounts = [],
  transactions = [],
  categories = [],
  goals = [],
  costCenters = [],
  cards = [],
  charges = [],
  recurring = [],
  healthScores = []
}) {
  return {
    accounts: accounts.map(mapAccountFromDb),
    txs: transactions.map(mapTransactionFromDb),
    categories: categories.map(mapCategoryFromDb),
    goals: goals.map(mapGoalFromDb),
    costCenters: costCenters.map(mapCostCenterFromDb),
    cards: cards.map(mapCardFromDb),
    charges: charges.map(mapChargeFromDb),
    recurring: recurring.map(mapRecurringFromDb),
    healthHistory: healthScores.map(mapHealthFromDb)
  };
}
