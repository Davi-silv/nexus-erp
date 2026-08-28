/**
 * Migra dados localStorage v2 → Supabase na primeira sessão cloud.
 */
import { STORAGE_KEYS } from '../core/constants.js';
import { localStore } from '../infrastructure/storage.js';
import { getSupabaseClient } from '../infrastructure/supabase.client.js';
import {
  workspaceParamsFromRegister,
  mapAccountToDb,
  mapTransactionToDb,
  mapCategoryToDb,
  mapGoalToDb,
  mapCostCenterToDb,
  mapCardToDb,
  mapChargeToDb,
  mapRecurringToDb
} from '../infrastructure/supabase/data-mapper.js';
import { uid } from '../core/utils.js';

const ENTITY_KEYS = ['accounts', 'txs', 'cards', 'charges', 'categories', 'goals', 'recurring', 'healthHistory', 'costCenters'];
const MIGRATION_FLAG = 'nexus:cloud-migrated';

export function hasLocalDataToMigrate() {
  const users = localStore.get(STORAGE_KEYS.USERS, []);
  if (!users.length) return false;
  if (localStore.get(MIGRATION_FLAG, false)) return false;
  return users.some(u => {
    const prefix = STORAGE_KEYS.userPrefix(u.id);
    return ENTITY_KEYS.some(k => {
      const data = localStore.get(`${prefix}${k}`, []);
      return Array.isArray(data) && data.length > 0;
    });
  });
}

async function recordLegacyMap(client, workspaceId, idMap) {
  const rows = Object.entries(idMap).map(([key, newId]) => {
    const sep = key.indexOf(':');
    const entityType = key.slice(0, sep);
    const legacyId = key.slice(sep + 1);
    return {
      workspace_id: workspaceId,
      entity_type: entityType,
      legacy_id: String(legacyId),
      new_id: newId
    };
  });
  if (!rows.length) return;
  const { error } = await client
    .from('legacy_migration_map')
    .upsert(rows, { onConflict: 'workspace_id,entity_type,legacy_id' });
  if (error) console.warn('[nexus] legacy_migration_map:', error.message);
}

export async function migrateLocalStorageToSupabase(user, workspaceId) {
  const client = getSupabaseClient();
  if (!client || !workspaceId) return { ok: false, msg: 'Supabase indisponível' };
  if (localStore.get(MIGRATION_FLAG, false)) return { ok: true, skipped: true };

  const localUser = localStore.get(STORAGE_KEYS.USERS, []).find(u => u.email === user.email);
  if (!localUser) {
    return { ok: true, skipped: true, reason: 'no_matching_local_user' };
  }

  const prefix = STORAGE_KEYS.userPrefix(localUser.id);
  const data = {};
  for (const key of ENTITY_KEYS) {
    data[key] = localStore.get(`${prefix}${key}`, []);
  }

  const idMap = {};
  const mapId = (legacyId, entityType) => {
    const key = `${entityType}:${legacyId}`;
    if (!idMap[key]) idMap[key] = uid();
    return idMap[key];
  };

  const remapIds = (arr, entityType, fields = []) => {
    return (arr || []).map(item => {
      const next = { ...item, id: mapId(item.id, entityType) };
      for (const f of fields) {
        if (next[f] != null) next[f] = mapId(next[f], f.replace('Id', ''));
      }
      return next;
    });
  };

  data.accounts = remapIds(data.accounts, 'account');
  data.categories = remapIds(data.categories, 'category');
  data.costCenters = remapIds(data.costCenters, 'costCenter');
  data.cards = remapIds(data.cards, 'card');
  data.goals = remapIds(data.goals, 'goal', ['categoryId']);
  data.txs = remapIds(data.txs, 'tx', ['accountId', 'categoryId', 'costCenterId']);
  data.charges = remapIds(data.charges, 'charge', ['cardId']);
  data.recurring = remapIds(data.recurring, 'recurring', ['accountId']);

  const userId = user.id;

  try {
    if (data.accounts?.length) {
      await client.from('financial_accounts').upsert(
        data.accounts.map(a => mapAccountToDb(a, workspaceId, userId))
      );
    }
    if (data.categories?.length) {
      await client.from('categories').upsert(
        data.categories.map(c => mapCategoryToDb(c, workspaceId))
      );
    }
    if (data.costCenters?.length) {
      await client.from('cost_centers').upsert(
        data.costCenters.map(c => mapCostCenterToDb(c, workspaceId))
      );
    }
    if (data.cards?.length) {
      await client.from('credit_cards').upsert(
        data.cards.map(c => mapCardToDb(c, workspaceId, userId))
      );
    }
    if (data.goals?.length) {
      await client.from('category_budgets').upsert(
        data.goals.map(g => mapGoalToDb(g, workspaceId))
      );
    }
    if (data.txs?.length) {
      await client.from('transactions').upsert(
        data.txs.map(t => mapTransactionToDb(t, workspaceId, userId))
      );
    }
    if (data.charges?.length) {
      await client.from('credit_card_transactions').upsert(
        data.charges.map(c => mapChargeToDb(c, workspaceId, userId))
      );
    }
    if (data.recurring?.length) {
      await client.from('recurring_transactions').upsert(
        data.recurring.map(r => mapRecurringToDb(r, workspaceId, userId))
      );
    }

    for (const acc of data.accounts || []) {
      await client.rpc('recalculate_account_balance', { p_account_id: acc.id });
    }

    await recordLegacyMap(client, workspaceId, idMap);
    localStore.set(MIGRATION_FLAG, true);
    return { ok: true, migrated: true };
  } catch (err) {
    return { ok: false, msg: err.message || 'Falha na migração' };
  }
}

export { workspaceParamsFromRegister };
