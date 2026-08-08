/**
 * Bootstrap da aplicação — Composition Root (padrão IoC manual).
 * Orquestra camadas: Router → Store → Módulos UI → EventBus
 */
import { EventBus, Events } from './core/event-bus.js';
import { AppStore } from './state/app-store.js';
import { Router } from './router/router.js';
import { ChartRegistry } from './ui/chart-registry.js';
import { initAuthModule } from './ui/modules/auth.module.js';
import { initAccountsModule } from './ui/modules/accounts.module.js';
import { initTransactionsModule } from './ui/modules/transactions.module.js';
import { initCategoriesModule } from './ui/modules/categories.module.js';
import { initRecurringModule } from './ui/modules/recurring.module.js';
import { initHealthModule } from './ui/modules/health.module.js';
import { initCardsModule } from './ui/modules/cards.module.js';
import { initAIModule } from './ui/modules/ai.module.js';
import { initReconcileModule, initReportsModule } from './ui/modules/reports.module.js';
import { initUsersModule } from './ui/modules/users.module.js';
import { initCompanyModule } from './ui/modules/company.module.js';
import { initBankingModule } from './ui/modules/banking.module.js';
import { applyProfileUI, bindProfileTypeToggle } from './ui/profile-ui.js';
import { initPwaInstall } from './ui/pwa-install.js';

import { APP_CONFIG } from './config/app.config.js';

async function bootstrap() {
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch {
    /* PWA indisponível — ambiente de teste ou servidor estático */
  }
  initPwaInstall();

  const bus = new EventBus();
  const store = new AppStore(bus);
  const router = new Router();
  const charts = new ChartRegistry();

  await store.init();
  router.init();

  const auth = initAuthModule(store, router);
  const accounts = initAccountsModule(store, auth);
  const transactions = initTransactionsModule(store, auth, accounts);
  const categories = initCategoriesModule(store, charts);
  const recurring = initRecurringModule(store);
  const health = initHealthModule(store, charts);
  const cards = initCardsModule(store, auth, charts);
  const ai = initAIModule(store, auth, health);
  initReconcileModule(store, auth);
  initReportsModule(store, auth);
  const users = initUsersModule(store, auth);
  const company = initCompanyModule(store, auth);
  const banking = initBankingModule(store, auth, router);

  bindProfileTypeToggle();

  /** Render seletivo por domínio — substitui o mega-render() monolítico */
  function refreshAll() {
    if (!store.isAuthenticated()) return;
    if (!store.currentUserData) store.loadUserData();

    accounts.renderAccounts();
    accounts.renderAccountOptions();
    transactions.refresh();
    users.renderUsers();
    categories.refresh();
    recurring.refresh();
    health.updateHealthMetrics();
    cards.refresh();
    ai.renderAIHistory();
    auth.refreshAuthUI();
    applyProfileUI(store);
    if (store.currentUser()?.profileType === 'pj') {
      company.refresh();
      banking.refresh();
    }

    if (store.currentUserData) {
      charts.updateDashboard(store.currentUserData.txs);
    }
  }

  bus.on(Events.AUTH_CHANGED, ({ user }) => {
    auth.refreshAuthUI();
    if (user) {
      store.loadUserData();
      refreshAll();
      if (user.profileType === 'pj' && store.currentUserData?.accounts.length === 0) {
        router.navigate('bancos');
      } else {
        router.navigate('dashboard');
      }
    } else {
      router.navigate('auth');
    }
  });

  bus.on(Events.DATA_CHANGED, refreshAll);

  charts.initDashboard();
  charts.initCategories();
  charts.initHealth();
  charts.initCards();

  auth.refreshAuthUI();
  router.show(router.getInitialView(store.isAuthenticated()), false);

  if (store.isAuthenticated()) refreshAll();

  document.title = APP_CONFIG.name;
  const footer = document.querySelector('.sidebar__footer strong');
  if (footer) footer.textContent = `${APP_CONFIG.name} v${APP_CONFIG.version}`;

  window.__NEXUS_READY__ = true;
}

document.addEventListener('DOMContentLoaded', bootstrap);
