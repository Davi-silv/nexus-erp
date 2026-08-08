/**
 * Event Bus — padrão Observer para desacoplar módulos.
 * Evita o anti-pattern de render() global que atualiza tudo.
 */
export class EventBus {
  #listeners = new Map();

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.#listeners.get(event)?.forEach(fn => fn(payload));
  }
}

export const Events = {
  AUTH_CHANGED: 'auth:changed',
  DATA_CHANGED: 'data:changed',
  VIEW_CHANGED: 'view:changed',
  ACCOUNTS_CHANGED: 'accounts:changed',
  TXS_CHANGED: 'txs:changed',
  CARDS_CHANGED: 'cards:changed',
  CATEGORIES_CHANGED: 'categories:changed',
  RECURRING_CHANGED: 'recurring:changed',
  HEALTH_CHANGED: 'health:changed'
};
