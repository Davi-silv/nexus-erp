import { getSupabaseClient } from '../../infrastructure/supabase.client.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';

export class CrmRepository {
  #client = isSupabaseEnabled ? getSupabaseClient() : null;

  #requireClient() {
    if (!this.#client) throw new Error('CRM requer Supabase (modo cloud).');
    return this.#client;
  }

  async ensureStages(workspaceId) {
    const { error } = await this.#requireClient().rpc('seed_crm_stages', {
      p_workspace_id: workspaceId
    });
    if (error) throw error;
  }

  async listStages(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('crm_pipeline_stages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  }

  async listOpportunities(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunities')
      .select('*, customers(name, email, phone), crm_pipeline_stages(name, slug, is_closed_won, is_closed_lost, color)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getOpportunity(id) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunities')
      .select('*, customers(name, email, phone, document), crm_pipeline_stages(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async createOpportunity(row) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunities')
      .insert(row)
      .select('*, customers(name), crm_pipeline_stages(name, slug, color)')
      .single();
    if (error) throw error;
    return data;
  }

  async updateOpportunity(id, patch) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunities')
      .update(patch)
      .eq('id', id)
      .select('*, customers(name), crm_pipeline_stages(name, slug, color)')
      .single();
    if (error) throw error;
    return data;
  }

  async softDeleteOpportunity(id) {
    const { error } = await this.#requireClient()
      .from('crm_opportunities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async moveStage(opportunityId, stageId) {
    const { data, error } = await this.#requireClient().rpc('move_crm_opportunity_stage', {
      p_opportunity_id: opportunityId,
      p_stage_id: stageId
    });
    if (error) throw error;
    return data;
  }

  async listActivities(opportunityId) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunity_activities')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async addActivity(row) {
    const { data, error } = await this.#requireClient()
      .from('crm_opportunity_activities')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export const crmRepo = new CrmRepository();
