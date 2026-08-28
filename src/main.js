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
import { initBillingModule } from './ui/modules/billing.module.js';
import {
  initCustomersModule,
  initServicesModule,
  initQuotesModule,
  initReceivablesModule,
  initFiscalModule
} from './ui/modules/commercial.module.js';
import { initTrialBanner, initExpiredModal } from './ui/subscription-ui.js';
import { subscriptionService } from './services/subscription.service.js';
import { applyProfileUI, bindProfileTypeToggle } from './ui/profile-ui.js';
import { initPwaInstall } from './ui/pwa-install.js';
import { initPwaUpdate } from './ui/pwa-update.js';
import { initMobileNav } from './ui/mobile-nav.js';

import { APP_CONFIG } from './config/app.config.js';

async function bootstrap() {
  try {
    const { registerSW } = await import('virtual:pwa-register');
    initPwaUpdate(registerSW);
  } catch {
    /* PWA indisponível — ambiente de teste ou servidor estático */
  }
  initPwaInstall();
  initMobileNav();

  const bus = new EventBus();
  const store = new AppStore(bus);
  const router = new Router();
  const charts = new ChartRegistry();

  await store.init();
  store.bindCloudAuthListener();
  router.init();

  const auth = initAuthModule(store, router);
  const accounts = initAccountsModule(store, auth, router, subscriptionService);
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
  const billing = initBillingModule(store, router, subscriptionService);
  const customers = initCustomersModule(store, auth, router, subscriptionService);
  const services = initServicesModule(store, auth, router, subscriptionService);
  const quotes = initQuotesModule(store, auth, router, subscriptionService);
  const receivables = initReceivablesModule(store, auth, router, subscriptionService);
  const fiscal = initFiscalModule(store, auth, router, subscriptionService);
  router.onNavigate = async (viewId) => {
    if (viewId === 'planos' || viewId === 'assinatura') await billing.refresh();
    if (['clientes', 'servicos', 'orcamentos', 'contas-receber', 'notas-fiscais', 'config-fiscal'].includes(viewId)) {
      await customers.refresh();
      await services.refresh();
      await quotes.refresh();
      await receivables.refresh();
      await fiscal.refresh();
    }
  };
  const trialBanner = initTrialBanner(store, router, subscriptionService);
  const expiredModal = initExpiredModal(store, router, subscriptionService);

  bindProfileTypeToggle();

  /** Render seletivo por domínio — substitui o mega-render() monolítico */
  async function refreshAll() {
    if (!store.isAuthenticated()) return;
    if (!store.currentUserData) await store.loadUserData();

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
    trialBanner.refresh();
    expiredModal.refresh();
    await billing.refresh();
    customers.refresh();
    services.refresh();
    quotes.refresh();
    receivables.refresh();
    fiscal.refresh();
    if (store.currentUser()?.profileType === 'pj') {
      company.refresh();
      banking.refresh();
    }

    if (store.currentUserData) {
      charts.updateDashboard(store.currentUserData.txs);
    }
  }

  bus.on(Events.AUTH_CHANGED, async ({ user }) => {
    auth.refreshAuthUI();
    if (user) {
      await store.loadUserData();
      await refreshAll();
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

  await billing.refresh();
  if (store.isAuthenticated()) await refreshAll();

  document.title = APP_CONFIG.name;
  const footer = document.querySelector('.sidebar__footer strong');
  if (footer) footer.textContent = `${APP_CONFIG.name} v${APP_CONFIG.version}`;

  window.__NEXUS_READY__ = true;
}

document.addEventListener('DOMContentLoaded', bootstrap);
