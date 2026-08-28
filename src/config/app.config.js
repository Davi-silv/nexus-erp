/**
 * Configuração central do produto — ponto único para branding e feature flags.
 */
import { isSupabaseEnabled } from './supabase.config.js';

export const APP_CONFIG = {
  name: 'Nexus ERP',
  shortName: 'Nexus',
  tagline: 'Finance ERP',
  version: '2.0.0',
  locale: 'pt-BR',
  currency: 'BRL',
  supportEmail: 'suporte@nexus.local', // substituir antes do lançamento
  website: 'https://nexus.local',        // substituir antes do lançamento

  /** Feature flags — habilitar conforme plano/backend estiver pronto */
  features: {
    aiAnalysis: true,
    bankReconciliation: true,
    pwaInstall: true,
    multiUser: true,
    exportCsv: true,
    /** Supabase ativo quando VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY estão definidos */
    cloudSync: isSupabaseEnabled,
    billing: false,
    openBanking: false,
    nfIntegration: false,
    accountantPortal: false
  },

  /** Limites do plano gratuito (MVP local) — enforce no backend futuramente */
  limits: {
    maxAccounts: 10,
    maxTransactions: 5000,
    maxCards: 20,
    maxUsers: 5
  }
};
