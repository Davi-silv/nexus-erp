import { STORAGE_KEYS, EMPTY_USER_DATA } from '../core/constants.js';
import { localStore } from '../infrastructure/storage.js';

const ENTITY_KEYS = ['accounts', 'txs', 'cards', 'charges', 'categories', 'goals', 'recurring', 'healthHistory', 'costCenters'];

export class UserDataRepository {
  #prefix(uid) {
    return STORAGE_KEYS.userPrefix(uid);
  }

  load(uid) {
    const prefix = this.#prefix(uid);
    const data = {};
    for (const key of ENTITY_KEYS) {
      data[key] = localStore.get(`${prefix}${key}`, []);
    }
    return data;
  }

  save(uid, data) {
    const prefix = this.#prefix(uid);
    for (const key of ENTITY_KEYS) {
      localStore.set(`${prefix}${key}`, data[key] ?? []);
    }
  }

  createEmpty(uid) {
    const data = EMPTY_USER_DATA();
    this.save(uid, data);
    return data;
  }
}

export const userDataRepo = new UserDataRepository();
