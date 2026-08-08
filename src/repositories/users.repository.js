import { STORAGE_KEYS } from '../core/constants.js';
import { localStore } from '../infrastructure/storage.js';

export class UsersRepository {
  load() {
    return localStore.get(STORAGE_KEYS.USERS, []);
  }

  save(users) {
    localStore.set(STORAGE_KEYS.USERS, users);
  }

  findByEmail(email, users) {
    return users.find(u => u.email === email);
  }

  findById(id, users) {
    return users.find(u => u.id === id);
  }
}

export const usersRepo = new UsersRepository();
