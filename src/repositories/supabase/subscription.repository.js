import { getSupabaseClient } from '../../infrastructure/supabase.client.js';

export class SupabaseSubscriptionRepository {
  #client = getSupabaseClient();

  async getSnapshot(workspaceId) {
    const { data, error } = await this.#client.rpc('get_subscription_snapshot', {
      p_workspace_id: workspaceId
    });
    if (error) throw error;
    return data;
  }

  async listPlans() {
    const { data, error } = await this.#client.rpc('list_plans_with_features');
    if (error) throw error;
    return data || [];
  }

  async canUseFeature(workspaceId, feature) {
    const { data, error } = await this.#client.rpc('can_use_feature', {
      p_workspace_id: workspaceId,
      p_feature: feature
    });
    if (error) throw error;
    return Boolean(data);
  }

  async getFeatureLimit(workspaceId, feature) {
    const { data, error } = await this.#client.rpc('get_feature_limit', {
      p_workspace_id: workspaceId,
      p_feature: feature
    });
    if (error) throw error;
    return data;
  }

  async getFeatureUsage(workspaceId, feature) {
    const { data, error } = await this.#client.rpc('get_feature_usage', {
      p_workspace_id: workspaceId,
      p_feature: feature
    });
    if (error) throw error;
    return data ?? 0;
  }

  async selectPlan(workspaceId, planSlug) {
    const { data, error } = await this.#client.rpc('select_subscription_plan', {
      p_workspace_id: workspaceId,
      p_plan_slug: planSlug
    });
    if (error) throw error;
    return data;
  }

  async requestCancel(workspaceId) {
    const { data, error } = await this.#client.rpc('request_subscription_cancel', {
      p_workspace_id: workspaceId
    });
    if (error) throw error;
    return data;
  }

  async reactivate(workspaceId) {
    const { data, error } = await this.#client.rpc('reactivate_subscription', {
      p_workspace_id: workspaceId
    });
    if (error) throw error;
    return data;
  }
}

export const supabaseSubscriptionRepo = new SupabaseSubscriptionRepository();
