import { fmtMoney, escapeHtml } from '../../core/utils.js';
import { FEATURE_LABELS, UPSELL_PLAN } from '../../domain/features.js';

const PLAN_HIGHLIGHTS = {
  personal: [
    'Até 3 contas financeiras',
    'Receitas e despesas',
    'Cartões e categorias',
    'Metas e recorrências',
    'Saúde financeira',
    '10 consultas IA/mês'
  ],
  start: [
    'Até 2 contas financeiras',
    'Contas a pagar e receber',
    'Clientes e fornecedores',
    'Fluxo de caixa',
    'Conciliação básica',
    '10 consultas IA/mês'
  ],
  pro: [
    'Até 5 usuários',
    'Até 10 contas',
    'DRE e centros de custo',
    'Nexus IA e Nexus CFO',
    'Projeção de caixa',
    '100 consultas IA/mês',
    'Exportação PDF/XLSX/CSV'
  ],
  business: [
    'Até 20 usuários',
    'Até 50 contas',
    '500 consultas IA/mês',
    'Log de auditoria',
    'Permissões avançadas',
    'Suporte prioritário'
  ]
};

const FEATURE_DISPLAY = {
  users: (limit) => limit ? `Até ${limit} usuários` : 'Multi-usuário',
  financial_accounts: (limit) => limit ? `Até ${limit} contas financeiras` : 'Contas financeiras',
  ai_requests: (limit) => limit ? `${limit} consultas IA/mês` : 'Nexus IA',
  accounts_payable: () => 'Contas a pagar',
  accounts_receivable: () => 'Contas a receber',
  customers: () => 'Cadastro de clientes',
  suppliers: () => 'Cadastro de fornecedores',
  dre: () => 'DRE empresarial',
  cost_centers: () => 'Centros de custo',
  advanced_reports: () => 'Relatórios avançados',
  cash_projection: () => 'Projeção de caixa',
  financial_score: () => 'Saúde financeira',
  bank_reconciliation: () => 'Conciliação bancária',
  audit_logs: () => 'Log de auditoria',
  advanced_permissions: () => 'Permissões avançadas',
  exports_pdf: () => 'Exportação PDF',
  exports_xlsx: () => 'Exportação XLSX',
  exports_csv: () => 'Exportação CSV'
};

function planFeatureLines(plan) {
  if (Array.isArray(plan.features) && plan.features.length) {
    const lines = plan.features
      .filter(f => f.enabled)
      .map(f => {
        const labelFn = FEATURE_DISPLAY[f.feature];
        if (labelFn) return labelFn(f.limit_value);
        const label = FEATURE_LABELS[f.feature] || f.feature;
        return f.limit_value != null ? `${label} (até ${f.limit_value})` : label;
      });
    if (lines.length) return lines.slice(0, 8);
  }
  return PLAN_HIGHLIGHTS[plan.slug] || [];
}

export function initBillingModule(store, router, subscription) {
  const plansGrid = document.getElementById('plans-grid');
  const billingPanel = document.getElementById('billing-current-panel');
  const billingActions = document.getElementById('billing-actions');

  async function refresh() {
    if (plansGrid) {
      plansGrid.innerHTML = '<p class="plans-grid__status">Carregando planos...</p>';
    }
    try {
      await subscription.loadPlans();
      renderPlansPage();
    } catch (err) {
      console.error('[nexus] Erro ao carregar planos:', err);
      renderPlansError(err?.message || 'Não foi possível carregar os planos.');
    }
    renderBillingSettings();
  }

  function renderPlansError(message) {
    if (!plansGrid) return;
    plansGrid.innerHTML = `
      <div class="plans-grid__status plans-grid__status--error">
        <p>${escapeHtml(message)}</p>
        <button type="button" class="btn-secondary" id="plans-retry">Tentar novamente</button>
      </div>
    `;
    plansGrid.querySelector('#plans-retry')?.addEventListener('click', () => refresh());
  }

  function renderPlansPage() {
    if (!plansGrid) return;
    const snap = subscription.getSnapshot();
    const plans = [...subscription.getPlans()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    if (!plans.length) {
      renderPlansError('Nenhum plano disponível no momento.');
      return;
    }

    plansGrid.innerHTML = plans.map(plan => {
      const price = plan.price_monthly != null
        ? fmtMoney(Number(plan.price_monthly)).replace('R$ ', 'R$') + '/mês'
        : '—';
      const highlights = planFeatureLines(plan);
      const isCurrent = snap?.effective_plan?.slug === plan.slug && snap?.is_active;
      const badge = plan.recommended
        ? '<span class="plan-card__badge plan-card__badge--recommended">MAIS ESCOLHIDO</span>'
        : '';
      const trialNote = !snap?.is_active || snap?.is_trialing
        ? '<p class="plan-card__trial-note">30 dias grátis · sem cartão no cadastro</p>'
        : '';

      return `
        <article class="plan-card ${plan.recommended ? 'plan-card--recommended' : ''}">
          ${badge}
          <h3>${escapeHtml(plan.name)}</h3>
          <p class="plan-card__price">${price}</p>
          <p class="plan-card__desc">${escapeHtml(plan.description || '')}</p>
          ${trialNote}
          <ul class="plan-card__features">
            ${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
          </ul>
          <button type="button" class="plan-card__cta ${isCurrent ? 'plan-card__cta--current' : ''}"
            data-plan="${plan.slug}" ${isCurrent ? 'disabled' : ''}>
            ${isCurrent ? 'Plano atual' : `Assinar ${escapeHtml(plan.name.replace('Nexus ', ''))}`}
          </button>
        </article>
      `;
    }).join('');
  }

  function renderBillingSettings() {
    if (!billingPanel) return;
    const snap = subscription.getSnapshot();
    if (!snap) {
      billingPanel.innerHTML = '<p>Carregue sua assinatura após o login.</p>';
      return;
    }

    const planName = snap.is_trialing
      ? `${snap.effective_plan?.name || 'Nexus Pro'} — Teste grátis`
      : (snap.effective_plan?.name || '—');

    billingPanel.innerHTML = `
      <div class="billing-summary">
        <div><span>Plano atual</span><strong>${escapeHtml(planName)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(subscription.statusLabel())}</strong></div>
        ${snap.is_trialing ? `
          <div><span>Restam</span><strong>${subscription.trialDaysRemaining()} dias</strong></div>
          <div><span>Data final</span><strong>${subscription.formatTrialEndDate()}</strong></div>
        ` : ''}
        ${snap.effective_plan?.price_monthly && !snap.is_trialing ? `
          <div><span>Valor</span><strong>${fmtMoney(Number(snap.effective_plan.price_monthly))}/mês</strong></div>
        ` : ''}
        ${snap.current_period_end ? `
          <div><span>Próxima cobrança</span><strong>${new Date(snap.current_period_end).toLocaleDateString('pt-BR')}</strong></div>
        ` : ''}
        ${snap.cancel_at_period_end ? `
          <p class="billing-warning">Sua assinatura será encerrada ao fim do período atual.</p>
        ` : ''}
      </div>
    `;

    if (billingActions) {
      billingActions.innerHTML = `
        <button type="button" id="billing-go-plans" class="btn-secondary">Alterar plano</button>
        ${snap.status === 'active' && !snap.cancel_at_period_end ? `
          <button type="button" id="billing-cancel" class="btn-secondary">Cancelar assinatura</button>
        ` : ''}
        ${snap.cancel_at_period_end ? `
          <button type="button" id="billing-reactivate" class="btn-secondary">Reativar assinatura</button>
        ` : ''}
      `;
    }
  }

  plansGrid?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-plan]');
    if (!btn || btn.disabled) return;
    if (!store.isAuthenticated()) {
      router.navigate('auth');
      return;
    }
    const slug = btn.dataset.plan;
    try {
      await subscription.selectPlan(slug);
      await subscription.load(store.workspaceId);
      alert('Plano selecionado. A integração de pagamento confirmará a assinatura via webhook seguro.');
      refresh();
      router.navigate('assinatura');
    } catch (err) {
      alert(err.message || 'Não foi possível selecionar o plano.');
    }
  });

  billingActions?.addEventListener('click', async e => {
    if (e.target.id === 'billing-go-plans') router.navigate('planos');
    if (e.target.id === 'billing-cancel') {
      if (!confirm('Deseja cancelar ao fim do período atual?')) return;
      await subscription.requestCancel();
      await subscription.load(store.workspaceId);
      refresh();
    }
    if (e.target.id === 'billing-reactivate') {
      await subscription.reactivate();
      await subscription.load(store.workspaceId);
      refresh();
    }
  });

  return { refresh, renderPlansPage, renderBillingSettings };
}

export function renderFeatureGate(container, feature, router) {
  if (!container) return;
  const label = FEATURE_LABELS[feature] || feature;
  const upsell = UPSELL_PLAN[feature] || 'pro';
  const planName = upsell === 'business' ? 'Nexus Business' : upsell === 'start' ? 'Nexus Start' : 'Nexus Pro';

  container.innerHTML = `
    <div class="feature-gate">
      <div class="feature-gate__icon">🔒</div>
      <h3>${escapeHtml(label)} está disponível no ${escapeHtml(planName)}</h3>
      <p>Faça upgrade para desbloquear este recurso e evoluir sua gestão financeira.</p>
      <button type="button" class="feature-gate__cta" data-go-plans>Conhecer ${escapeHtml(planName)}</button>
    </div>
  `;
  container.querySelector('[data-go-plans]')?.addEventListener('click', () => router.navigate('planos'));
}
