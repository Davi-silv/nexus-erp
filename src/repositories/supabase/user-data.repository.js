import { getSupabaseClient } from '../../infrastructure/supabase.client.js';
import { EMPTY_USER_DATA } from '../../core/constants.js';
import {
  mapDbToUserData,
  mapAccountToDb,
  mapTransactionToDb,
  mapCategoryToDb,
  mapGoalToDb,
  mapCostCenterToDb,
  mapCardToDb,
  mapChargeToDb,
  mapRecurringToDb,
  mapHealthToDb
} from '../../infrastructure/supabase/data-mapper.js';

const SOFT_DELETE_TABLES = new Set([
  'financial_accounts',
  'categories',
  'cost_centers',
  'credit_cards',
  'recurring_transactions'
]);

export class SupabaseUserDataRepository {
  #client = getSupabaseClient();

  async load(workspaceId) {
    if (!workspaceId) return EMPTY_USER_DATA();

    const [
      accountsRes,
      txsRes,
      categoriesRes,
      goalsRes,
      costCentersRes,
      cardsRes,
      chargesRes,
      recurringRes,
      healthRes
    ] = await Promise.all([
      this.#client.from('financial_accounts').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('categories').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('category_budgets').select('*').eq('workspace_id', workspaceId).eq('active', true),
      this.#client.from('cost_centers').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('credit_cards').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('credit_card_transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('recurring_transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
      this.#client.from('financial_health_scores').select('*').eq('workspace_id', workspaceId).order('calculated_at', { ascending: true })
    ]);

    for (const res of [accountsRes, txsRes, categoriesRes, goalsRes, costCentersRes, cardsRes, chargesRes, recurringRes, healthRes]) {
      if (res.error) throw res.error;
    }

    return mapDbToUserData({
      accounts: accountsRes.data,
      transactions: txsRes.data,
      categories: categoriesRes.data,
      goals: goalsRes.data,
      costCenters: costCentersRes.data,
      cards: cardsRes.data,
      charges: chargesRes.data,
      recurring: recurringRes.data,
      healthScores: healthRes.data
    });
  }

  async save(workspaceId, data, userId) {
    if (!workspaceId) {
      throw new Error('workspaceId ausente — impossível salvar dados no cloud');
    }

    await Promise.all([
      this.#syncTable('financial_accounts', workspaceId, data.accounts, r => mapAccountToDb(r, workspaceId, userId)),
      this.#syncTable('categories', workspaceId, data.categories, r => mapCategoryToDb(r, workspaceId)),
      this.#syncTable('cost_centers', workspaceId, data.costCenters, r => mapCostCenterToDb(r, workspaceId)),
      this.#syncTable('credit_cards', workspaceId, data.cards, r => mapCardToDb(r, workspaceId, userId)),
      this.#syncTable('category_budgets', workspaceId, data.goals, r => mapGoalToDb(r, workspaceId)),
      this.#syncTable('recurring_transactions', workspaceId, data.recurring, r => mapRecurringToDb(r, workspaceId, userId)),
      this.#syncTransactions(workspaceId, data.txs, userId),
      this.#syncCharges(workspaceId, data.charges, userId),
      this.#syncHealthScores(workspaceId, data.healthHistory)
    ]);
  }

  async #syncTable(table, workspaceId, rows, mapper) {
    const list = rows ?? [];
    const ids = list.map(r => r.id).filter(Boolean);

    if (list.length) {
      const { error } = await this.#client.from(table).upsert(list.map(mapper), { onConflict: 'id' });
      if (error) throw error;
    }

    let query = this.#client.from(table).select('id').eq('workspace_id', workspaceId);
    if (SOFT_DELETE_TABLES.has(table)) {
      query = query.is('deleted_at', null);
    } else if (table === 'category_budgets') {
      query = query.eq('active', true);
    }

    const { data: existing, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const toRemove = (existing || [])
      .map(r => r.id)
      .filter(id => !ids.includes(id));

    if (toRemove.length) {
      const patch = table === 'category_budgets'
        ? { active: false }
        : { deleted_at: new Date().toISOString() };
      const { error } = await this.#client.from(table).update(patch).in('id', toRemove);
      if (error) throw error;
    }
  }

  async #syncTransactions(workspaceId, txs, userId) {
    const list = txs ?? [];
    const ids = list.map(t => t.id).filter(Boolean);

    if (list.length) {
      const rows = list.map(t => mapTransactionToDb(t, workspaceId, userId));
      const { error } = await this.#client.from('transactions').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }

    const { data: existing, error: fetchError } = await this.#client
      .from('transactions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);
    if (fetchError) throw fetchError;

    const toRemove = (existing || []).map(r => r.id).filter(id => !ids.includes(id));
    if (toRemove.length) {
      const { error } = await this.#client
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', toRemove);
      if (error) throw error;
    }

    for (const acc of new Set(list.map(t => t.accountId).filter(Boolean))) {
      await this.#client.rpc('recalculate_account_balance', { p_account_id: acc });
    }
  }

  async #syncCharges(workspaceId, charges, userId) {
    const list = charges ?? [];
    const ids = list.map(c => c.id).filter(Boolean);

    if (list.length) {
      const rows = list.map(c => mapChargeToDb(c, workspaceId, userId));
      const { error } = await this.#client.from('credit_card_transactions').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }

    const { data: existing, error: fetchError } = await this.#client
      .from('credit_card_transactions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);
    if (fetchError) throw fetchError;

    const toRemove = (existing || []).map(r => r.id).filter(id => !ids.includes(id));
    if (toRemove.length) {
      const { error } = await this.#client
        .from('credit_card_transactions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', toRemove);
      if (error) throw error;
    }
  }

  async #syncHealthScores(workspaceId, history) {
    const list = history ?? [];
    if (!list.length) return;

    const latest = list[list.length - 1];
    const day = latest.date;

    const { data: existing } = await this.#client
      .from('financial_health_scores')
      .select('id')
      .eq('workspace_id', workspaceId)
      .gte('calculated_at', `${day}T00:00:00.000Z`)
      .lte('calculated_at', `${day}T23:59:59.999Z`)
      .limit(1);

    if (existing?.length) return;

    const row = mapHealthToDb(latest, workspaceId);
    const { error } = await this.#client.from('financial_health_scores').insert(row);
    if (error) throw error;
  }
}

export const supabaseUserDataRepo = new SupabaseUserDataRepository();
