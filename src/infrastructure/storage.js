/**
 * Adapter de Storage — abstrai localStorage/sessionStorage.
 * Permite injetar mock em testes unitários.
 */
export class StorageAdapter {
  constructor(storage = localStorage) {
    this.storage = storage;
  }

  get(key, fallback = null) {
    try {
      const raw = this.storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    this.storage.setItem(key, JSON.stringify(value));
  }

  getString(key, fallback = '') {
    return this.storage.getItem(key) ?? fallback;
  }

  setString(key, value) {
    this.storage.setItem(key, value);
  }

  remove(key) {
    this.storage.removeItem(key);
  }
}

export const localStore = new StorageAdapter(localStorage);
export const sessionStore = new StorageAdapter(sessionStorage);
