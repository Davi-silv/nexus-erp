import { escapeHtml } from '../core/utils.js';
import { FEATURES, FEATURE_LABELS, UPSELL_PLAN } from '../domain/features.js';
import { renderFeatureGate } from './modules/billing.module.js';

export function initTrialBanner(store, router, subscription) {
  const banner = document.getElementById('trial-banner');
  const textEl = document.getElementById('trial-banner-text');
  const btnPlans = document.getElementById('trial-banner-plans');
  const dismiss = document.getElementById('trial-banner-dismiss');

  function refresh() {
    if (!banner || !store.isAuthenticated()) {
      banner?.classList.add('hidden');
      return;
    }

    const snap = subscription.getSnapshot();
    if (!snap?.is_trialing) {
      banner.classList.add('hidden');
      return;
    }

    const days = subscription.trialDaysRemaining();
    banner.classList.remove('hidden');

    if (textEl) {
      const label = days === 1
        ? 'Seu teste grátis termina amanhã.'
        : days <= 7
          ? `Seu teste grátis termina em ${days} dias.`
          : `Você ainda possui ${days} dias de Nexus Pro grátis.`;
      textEl.innerHTML = `<strong>TESTE GRÁTIS — NEXUS PRO</strong><span>${escapeHtml(label)}</span>`;
    }
  }

  btnPlans?.addEventListener('click', () => router.navigate('planos'));
  dismiss?.addEventListener('click', () => banner?.classList.add('hidden'));

  return { refresh };
}

export function initExpiredModal(store, router, subscription) {
  const modal = document.getElementById('subscription-expired-modal');
  const btnPlans = document.getElementById('expired-modal-plans');
  const btnLogout = document.getElementById('expired-modal-logout');
  let shown = false;

  function refresh() {
    if (!modal || !store.isAuthenticated()) {
      modal?.classList.add('hidden');
      shown = false;
      return;
    }

    if (!subscription.isCloudEnforced()) {
      modal.classList.add('hidden');
      return;
    }

    const snap = subscription.getSnapshot();
    const expired = snap && !snap.is_active && snap.status === 'expired';

    if (expired && !shown) {
      modal.classList.remove('hidden');
      shown = true;
    } else if (!expired) {
      modal.classList.add('hidden');
      shown = false;
    }
  }

  btnPlans?.addEventListener('click', () => {
    modal?.classList.add('hidden');
    router.navigate('planos');
  });

  btnLogout?.addEventListener('click', () => store.logout());

  return { refresh };
}

export async function guardViewFeature(subscription, viewId, container, router) {
  const { VIEW_FEATURES } = await import('../domain/features.js');
  const feature = VIEW_FEATURES[viewId];
  if (!feature || !subscription.isCloudEnforced()) return true;
  if (!subscription.isActive()) return false;
  const allowed = await subscription.canUseFeature(feature);
  if (!allowed && container) renderFeatureGate(container, feature, router);
  return allowed;
}

export function showLimitAlert(feature, check, router) {
  const label = FEATURE_LABELS[feature] || 'Este recurso';
  if (check.reason === 'limit_reached') {
    const upsell = UPSELL_PLAN[feature] || 'business';
    const planName = upsell === 'business' ? 'Nexus Business' : 'Nexus Pro';
    if (confirm(`${label}: limite atingido (${check.usage}/${check.limit}).\n\nDeseja conhecer o ${planName}?`)) {
      router.navigate('planos');
    }
    return;
  }
  alert(`${label} não está disponível no seu plano atual.`);
  router.navigate('planos');
}

export { FEATURES };
