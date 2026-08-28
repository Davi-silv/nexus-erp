/**
 * Camada central de autorização de planos — fonte de verdade no PostgreSQL (cloud).
 * Modo local (sem Supabase): acesso completo para dev/E2E apenas.
 */
import { isSupabaseEnabled } from '../config/supabase.config.js';
import { supabaseSubscriptionRepo } from '../repositories/supabase/subscription.repository.js';
import { FEATURES, TRIAL_PLAN_SLUG } from '../domain/features.js';

const LOCAL_SNAPSHOT = {
  status: 'trialing',
  is_active: true,
  is_trialing: true,
  trial_days_remaining: 30,
  can_write: true,
  effective_plan: {
    slug: TRIAL_PLAN_SLUG,
    name: 'Nexus Pro',
    price_monthly: 99.9,
    recommended: true
  }
};

export class SubscriptionService {
  #snapshot = null;
  #plans = [];
  #workspaceId = null;

  async load(workspaceId) {
    this.#workspaceId = workspaceId;
    if (!isSupabaseEnabled || !workspaceId) {
      this.#snapshot = { ...LOCAL_SNAPSHOT };
      this.#plans = [];
      return this.#snapshot;
    }
    this.#snapshot = await supabaseSubscriptionRepo.getSnapshot(workspaceId);
    return this.#snapshot;
  }

  async loadPlans() {
    if (!isSupabaseEnabled) {
      this.#plans = getLocalPlansCatalog();
      return this.#plans;
    }
    this.#plans = await supabaseSubscriptionRepo.listPlans();
    return this.#plans;
  }

  getSnapshot() {
    return this.#snapshot;
  }

  getPlans() {
    return this.#plans;
  }

  isCloudEnforced() {
    return isSupabaseEnabled && !!this.#workspaceId;
  }

  isActive() {
    return this.#snapshot?.is_active !== false;
  }

  isTrialing() {
    return Boolean(this.#snapshot?.is_trialing);
  }

  canWrite() {
    if (!this.isCloudEnforced()) return true;
    return Boolean(this.#snapshot?.can_write);
  }

  trialDaysRemaining() {
    return this.#snapshot?.trial_days_remaining ?? 0;
  }

  effectivePlan() {
    return this.#snapshot?.effective_plan || null;
  }

  statusLabel() {
    const s = this.#snapshot;
    if (!s) return '';
    if (s.is_trialing) return 'Teste grátis — Nexus Pro';
    if (s.status === 'active') return 'Ativo';
    if (s.status === 'expired') return 'Teste gratuito encerrado';
    if (s.status === 'past_due') return 'Pagamento pendente';
    if (s.status === 'cancelled') return 'Cancelado';
    if (s.status === 'incomplete') return 'Aguardando pagamento';
    return s.status;
  }

  async canUseFeature(feature) {
    if (!this.isCloudEnforced()) return true;
    if (!this.isActive()) return false;
    return supabaseSubscriptionRepo.canUseFeature(this.#workspaceId, feature);
  }

  async getFeatureLimit(feature) {
    if (!this.isCloudEnforced()) return null;
    return supabaseSubscriptionRepo.getFeatureLimit(this.#workspaceId, feature);
  }

  async getFeatureUsage(feature) {
    if (!this.isCloudEnforced()) return 0;
    return supabaseSubscriptionRepo.getFeatureUsage(this.#workspaceId, feature);
  }

  async checkLimit(feature, options = {}) {
    if (!this.isCloudEnforced()) return { ok: true };
    const enabled = await this.canUseFeature(feature);
    if (!enabled && !options.allowAtLimitCheck) {
      return { ok: false, reason: 'feature_disabled' };
    }
    const limit = await this.getFeatureLimit(feature);
    const usage = await this.getFeatureUsage(feature);
    if (limit != null && usage >= limit) {
      return { ok: false, reason: 'limit_reached', limit, usage };
    }
    return { ok: true, limit, usage };
  }

  async selectPlan(planSlug) {
    if (!this.isCloudEnforced()) {
      return { ...LOCAL_SNAPSHOT, effective_plan: { slug: planSlug } };
    }
    return supabaseSubscriptionRepo.selectPlan(this.#workspaceId, planSlug);
  }

  async requestCancel() {
    if (!this.isCloudEnforced()) return this.#snapshot;
    return supabaseSubscriptionRepo.requestCancel(this.#workspaceId);
  }

  async reactivate() {
    if (!this.isCloudEnforced()) return this.#snapshot;
    return supabaseSubscriptionRepo.reactivate(this.#workspaceId);
  }

  formatTrialEndDate() {
    const raw = this.#snapshot?.trial_ends_at;
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
}

function getLocalPlansCatalog() {
  return [
    { slug: 'personal', name: 'Nexus Pessoal', price_monthly: 19.9, recommended: false, sort_order: 1 },
    { slug: 'start', name: 'Nexus Start', price_monthly: 49.9, recommended: false, sort_order: 2 },
    { slug: 'pro', name: 'Nexus Pro', price_monthly: 99.9, recommended: true, sort_order: 3 },
    { slug: 'business', name: 'Nexus Business', price_monthly: 179.9, recommended: false, sort_order: 4 }
  ];
}

export const subscriptionService = new SubscriptionService();

/** Atalhos reutilizáveis */
export async function canUseFeature(workspaceId, feature) {
  if (!isSupabaseEnabled) return true;
  return supabaseSubscriptionRepo.canUseFeature(workspaceId, feature);
}

export { FEATURES };
