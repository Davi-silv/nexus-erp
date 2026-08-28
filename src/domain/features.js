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
  EXPORTS_CSV: 'exports_csv',
  SERVICES: 'services',
  QUOTES: 'quotes',
  NFSE: 'nfse',
  PIX_CHARGES: 'pix_charges',
  FISCAL_REPORTS: 'fiscal_reports'
};

/** Mapeamento view → feature principal */
export const VIEW_FEATURES = {
  empresa: FEATURES.DRE,
  bancos: FEATURES.FINANCIAL_ACCOUNTS,
  contas: FEATURES.FINANCIAL_ACCOUNTS,
  'ia-analise': FEATURES.AI_REQUESTS,
  conciliacao: FEATURES.BANK_RECONCILIATION,
  relatorios: FEATURES.ADVANCED_REPORTS,
  usuarios: FEATURES.USERS,
  clientes: FEATURES.CUSTOMERS,
  servicos: FEATURES.SERVICES,
  orcamentos: FEATURES.QUOTES,
  'contas-receber': FEATURES.ACCOUNTS_RECEIVABLE,
  'config-fiscal': FEATURES.NFSE,
  nfse: FEATURES.NFSE,
  'notas-fiscais': FEATURES.NFSE
};

export const FEATURE_LABELS = {
  [FEATURES.DRE]: 'DRE empresarial',
  [FEATURES.COST_CENTERS]: 'Centros de custo',
  [FEATURES.ADVANCED_REPORTS]: 'Relatórios avançados',
  [FEATURES.AI_REQUESTS]: 'Nexus IA',
  [FEATURES.BANK_RECONCILIATION]: 'Conciliação bancária',
  [FEATURES.FINANCIAL_ACCOUNTS]: 'Contas financeiras',
  [FEATURES.USERS]: 'Usuários',
  [FEATURES.SERVICES]: 'Serviços',
  [FEATURES.QUOTES]: 'Orçamentos',
  [FEATURES.NFSE]: 'NFS-e',
  [FEATURES.PIX_CHARGES]: 'Cobrança PIX',
  [FEATURES.CUSTOMERS]: 'Clientes',
  [FEATURES.ACCOUNTS_RECEIVABLE]: 'Contas a receber'
};

export const UPSELL_PLAN = {
  [FEATURES.DRE]: 'pro',
  [FEATURES.COST_CENTERS]: 'pro',
  [FEATURES.ADVANCED_REPORTS]: 'pro',
  [FEATURES.AI_REQUESTS]: 'pro',
  [FEATURES.BANK_RECONCILIATION]: 'start',
  [FEATURES.AUDIT_LOGS]: 'business',
  [FEATURES.SERVICES]: 'start',
  [FEATURES.QUOTES]: 'start',
  [FEATURES.NFSE]: 'start',
  [FEATURES.PIX_CHARGES]: 'start',
  [FEATURES.CUSTOMERS]: 'start',
  [FEATURES.ACCOUNTS_RECEIVABLE]: 'start'
};

export const TRIAL_DAYS = 30;
export const TRIAL_PLAN_SLUG = 'pro';
