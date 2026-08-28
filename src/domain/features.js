/** Features comerciais — contrato único para gating (não hardcodar planos na UI) */
export const FEATURES = {
  USERS: 'users',
  FINANCIAL_ACCOUNTS: 'financial_accounts',
  AI_REQUESTS: 'ai_requests',
  ACCOUNTS_PAYABLE: 'accounts_payable',
  ACCOUNTS_RECEIVABLE: 'accounts_receivable',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  DRE: 'dre',
  COST_CENTERS: 'cost_centers',
  ADVANCED_REPORTS: 'advanced_reports',
  CASH_PROJECTION: 'cash_projection',
  FINANCIAL_SCORE: 'financial_score',
  BANK_RECONCILIATION: 'bank_reconciliation',
  AUDIT_LOGS: 'audit_logs',
  ADVANCED_PERMISSIONS: 'advanced_permissions',
  EXPORTS_PDF: 'exports_pdf',
  EXPORTS_XLSX: 'exports_xlsx',
  EXPORTS_CSV: 'exports_csv'
};

/** Mapeamento view → feature principal */
export const VIEW_FEATURES = {
  empresa: FEATURES.DRE,
  bancos: FEATURES.FINANCIAL_ACCOUNTS,
  contas: FEATURES.FINANCIAL_ACCOUNTS,
  'ia-analise': FEATURES.AI_REQUESTS,
  conciliacao: FEATURES.BANK_RECONCILIATION,
  relatorios: FEATURES.ADVANCED_REPORTS,
  usuarios: FEATURES.USERS
};

export const FEATURE_LABELS = {
  [FEATURES.DRE]: 'DRE empresarial',
  [FEATURES.COST_CENTERS]: 'Centros de custo',
  [FEATURES.ADVANCED_REPORTS]: 'Relatórios avançados',
  [FEATURES.AI_REQUESTS]: 'Nexus IA',
  [FEATURES.BANK_RECONCILIATION]: 'Conciliação bancária',
  [FEATURES.FINANCIAL_ACCOUNTS]: 'Contas financeiras',
  [FEATURES.USERS]: 'Usuários'
};

export const UPSELL_PLAN = {
  [FEATURES.DRE]: 'pro',
  [FEATURES.COST_CENTERS]: 'pro',
  [FEATURES.ADVANCED_REPORTS]: 'pro',
  [FEATURES.AI_REQUESTS]: 'pro',
  [FEATURES.BANK_RECONCILIATION]: 'start',
  [FEATURES.AUDIT_LOGS]: 'business'
};

export const TRIAL_DAYS = 30;
export const TRIAL_PLAN_SLUG = 'pro';
