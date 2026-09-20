import { fmtMoney, escapeHtml } from '../../core/utils.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { crmRepo } from '../../repositories/supabase/crm.repository.js';
import { commercialRepo } from '../../repositories/supabase/commercial.repository.js';
import { FEATURES } from '../../domain/features.js';
import { guardMutation } from '../subscription-guards.js';
import { MODULES, ACTIONS } from '../../domain/rbac.service.js';
import {
  calculateCrmMetrics,
  probabilityForStage,
  LEAD_SOURCES,
  ACTIVITY_TYPES,
  activityIcon,
  findMatchingCustomer
} from '../../domain/crm.service.js';

function cloudOnlyMsg() {
  return '<p class="plans-grid__status">CRM disponível no modo cloud (Supabase).</p>';
}

function sourceLabel(value) {
  return LEAD_SOURCES.find(s => s.value === value)?.label || value || '—';
}

export function initCrmModule(store, auth, router, subscription) {
  const board = document.getElementById('crm-kanban');
  const summaryEl = document.getElementById('crm-summary');
  const sourcesEl = document.getElementById('crm-sources');
  const oppForm = document.getElementById('crm-opportunity-form');
  const activityForm = document.getElementById('crm-activity-form');
  const detailPanel = document.getElementById('crm-detail-panel');
  const closedModal = document.getElementById('crm-closed-modal');
  const historyEl = document.getElementById('crm-history');

  let stages = [];
  let opportunities = [];
  let customers = [];
  let editingId = null;
  let pendingClosedOpp = null;
  let dragOppId = null;

  async function loadAll() {
    if (!store.workspaceId) return { stages: [], opportunities: [], customers: [] };
    await crmRepo.ensureStages(store.workspaceId);
    stages = await crmRepo.listStages(store.workspaceId);
    opportunities = await crmRepo.listOpportunities(store.workspaceId);
    customers = await commercialRepo.listCustomers(store.workspaceId);
    return { stages, opportunities, customers };
  }

  function renderSummary() {
    if (!summaryEl) return;
    const m = calculateCrmMetrics(opportunities, stages);
    summaryEl.innerHTML = `
      <div class="metric-card"><span>Pipeline total</span><strong>${fmtMoney(m.pipelineTotal)}</strong></div>
      <div class="metric-card"><span>Em negociação</span><strong>${fmtMoney(m.negotiationTotal)}</strong></div>
      <div class="metric-card metric-card--income"><span>Vendas fechadas</span><strong>${fmtMoney(m.closedWonTotal)}</strong></div>
      <div class="metric-card"><span>Taxa de conversão</span><strong>${m.conversionRate}%</strong></div>
      <div class="metric-card"><span>Ticket médio</span><strong>${fmtMoney(m.avgTicket)}</strong></div>
      <div class="metric-card metric-card--expense"><span>Negócios perdidos</span><strong>${m.lostCount} · ${fmtMoney(m.lostTotal)}</strong></div>
    `;
    if (sourcesEl) {
      sourcesEl.innerHTML = m.topSources.length
        ? m.topSources.map(s => `<span class="crm-source-chip">${sourceLabel(s.source)} (${s.count})</span>`).join('')
        : '<span class="crm-source-chip">Sem origens registradas</span>';
    }
  }

  function renderCard(opp) {
    const stage = opp.crm_pipeline_stages;
    return `
      <article class="crm-card" draggable="true" data-opp-id="${opp.id}" data-stage-id="${opp.stage_id}">
        <header class="crm-card__header">
          <strong>${escapeHtml(opp.title)}</strong>
          <span class="crm-card__prob">${opp.probability}%</span>
        </header>
        ${opp.company_name ? `<p class="crm-card__company">${escapeHtml(opp.company_name)}</p>` : ''}
        <p class="crm-card__value">${fmtMoney(opp.estimated_value)}</p>
        ${opp.owner_name ? `<p class="crm-card__owner">${escapeHtml(opp.owner_name)}</p>` : ''}
        ${opp.expected_close_date ? `<p class="crm-card__date">Prev. ${opp.expected_close_date}</p>` : ''}
        ${opp.next_activity ? `<p class="crm-card__next">→ ${escapeHtml(opp.next_activity)}</p>` : ''}
      </article>
    `;
  }

  function renderBoard() {
    if (!board) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      board.innerHTML = cloudOnlyMsg();
      return;
    }
    board.innerHTML = stages.map(stage => {
      const colOpps = opportunities.filter(o => o.stage_id === stage.id);
      const total = colOpps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
      return `
        <div class="crm-column" data-stage-id="${stage.id}" data-closed-won="${stage.is_closed_won}" data-closed-lost="${stage.is_closed_lost}">
          <header class="crm-column__header" style="--crm-color:${stage.color || '#6366f1'}">
            <span>${escapeHtml(stage.name)}</span>
            <small>${colOpps.length} · ${fmtMoney(total)}</small>
          </header>
          <div class="crm-column__body" data-drop-zone="${stage.id}">
            ${colOpps.map(renderCard).join('') || '<p class="crm-column__empty">Arraste oportunidades aqui</p>'}
          </div>
        </div>
      `;
    }).join('');
  }

  async function openDetail(id) {
    editingId = id;
    const opp = opportunities.find(o => o.id === id) || await crmRepo.getOpportunity(id);
    if (!opp || !oppForm) return;

    populateOppForm(opp);
    detailPanel?.classList.remove('hidden');

    const activities = await crmRepo.listActivities(id);
    if (historyEl) {
      historyEl.innerHTML = activities.length
        ? activities.map(a => `
          <div class="crm-history-item">
            <span class="crm-history-item__icon">${activityIcon(a.activity_type)}</span>
            <div>
              <strong>${escapeHtml(a.title)}</strong>
              ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
              <time>${new Date(a.created_at).toLocaleString('pt-BR')}</time>
            </div>
          </div>
        `).join('')
        : '<p class="crm-history-empty">Nenhuma atividade registrada.</p>';
    }
    activityForm?.reset();
    activityForm?.querySelector('[name="opportunityId"]') && (activityForm.querySelector('[name="opportunityId"]').value = id);
  }

  function populateOppForm(opp) {
    if (!oppForm) return;
    const custSel = oppForm.querySelector('[name="customerId"]');
    if (custSel) {
      custSel.innerHTML = '<option value="">— Cliente —</option>' +
        customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    for (const [k, v] of Object.entries({
      title: opp.title,
      companyName: opp.company_name,
      customerId: opp.customer_id,
      phone: opp.phone,
      whatsapp: opp.whatsapp,
      email: opp.email,
      ownerName: opp.owner_name,
      estimatedValue: opp.estimated_value,
      leadSource: opp.lead_source,
      probability: opp.probability,
      expectedCloseDate: opp.expected_close_date,
      notes: opp.notes,
      nextActivity: opp.next_activity,
      nextActivityAt: opp.next_activity_at
    })) {
      const el = oppForm.querySelector(`[name="${k}"]`);
      if (el) el.value = v ?? '';
    }
  }

  function populateNewOppForm() {
    editingId = null;
    oppForm?.reset();
    const firstStage = stages.find(s => s.slug === 'new_lead') || stages[0];
    const prob = oppForm?.querySelector('[name="probability"]');
    if (prob && firstStage) prob.value = probabilityForStage(firstStage);
    const owner = oppForm?.querySelector('[name="ownerName"]');
    if (owner) owner.value = store.currentUser()?.name || '';
    populateOppForm({ customer_id: null });
  }

  async function handleStageMove(oppId, stageId) {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    if (!(await guardMutation(store, subscription, FEATURES.CRM, router, { module: MODULES.CRM, action: ACTIONS.EDIT }))) return;

    await crmRepo.moveStage(oppId, stageId);

    if (stage.is_closed_won) {
      pendingClosedOpp = await crmRepo.getOpportunity(oppId);
      showClosedModal(pendingClosedOpp);
    }
    await refresh();
  }

  function showClosedModal(opp) {
    if (!closedModal) return;
    const hasCustomer = Boolean(opp.customer_id);
    const hasQuote = Boolean(opp.quote_id);
    const hasAr = Boolean(opp.accounts_receivable_id);

    const customerCb = document.getElementById('crm-closed-customer');
    const quoteCb = document.getElementById('crm-closed-quote');
    const arCb = document.getElementById('crm-closed-receivable');
    if (customerCb) { customerCb.disabled = hasCustomer; customerCb.checked = !hasCustomer; }
    if (quoteCb) { quoteCb.disabled = hasQuote; quoteCb.checked = !hasQuote; }
    if (arCb) { arCb.disabled = hasAr; arCb.checked = !hasAr; }

    const hint = document.getElementById('crm-closed-hint');
    if (hint) {
      hint.textContent = hasCustomer
        ? 'Cliente já vinculado — não será duplicado.'
        : 'Se já existir cliente com mesmo e-mail/telefone, será vinculado automaticamente.';
    }
    closedModal.classList.remove('hidden');
  }

  async function processClosedActions() {
    if (!pendingClosedOpp) return;
    const opp = pendingClosedOpp;
    const createCustomer = document.getElementById('crm-closed-customer')?.checked && !opp.customer_id;
    const createQuote = document.getElementById('crm-closed-quote')?.checked && !opp.quote_id;
    const createAr = document.getElementById('crm-closed-receivable')?.checked && !opp.accounts_receivable_id;

    let customerId = opp.customer_id;

    if (createCustomer) {
      const existing = findMatchingCustomer(customers, opp);
      if (existing) {
        customerId = existing.id;
      } else {
        const created = await commercialRepo.upsertCustomer(store.companyId, {
          name: opp.company_name || opp.title,
          person_type: 'company',
          email: opp.email || null,
          phone: opp.phone || null,
          whatsapp: opp.whatsapp || null,
          notes: opp.notes || null,
          active: true
        });
        customerId = created.id;
      }
      await crmRepo.updateOpportunity(opp.id, { customer_id: customerId });
    }

    let quoteId = opp.quote_id;
    if (createQuote) {
      const quote = await commercialRepo.createQuote(store.workspaceId, {
        customer_id: customerId,
        notes: `Gerado do CRM: ${opp.title}`,
        discount: 0,
        created_by: store.currentUserId,
        status: 'draft',
        crm_opportunity_id: opp.id
      });
      quoteId = quote.id;
      await crmRepo.updateOpportunity(opp.id, { quote_id: quoteId });
    }

    if (createAr) {
      const due = opp.expected_close_date || new Date().toISOString().slice(0, 10);
      const ar = await commercialRepo.createReceivable(store.companyId, {
        customer_id: customerId,
        description: `CRM: ${opp.title}`,
        amount: Number(opp.estimated_value) || 0,
        due_date: due,
        issue_date: new Date().toISOString().slice(0, 10),
        notes: opp.notes || null,
        created_by: store.currentUserId
      });
      await crmRepo.updateOpportunity(opp.id, { accounts_receivable_id: ar.id });
    }

    pendingClosedOpp = null;
    closedModal?.classList.add('hidden');
    await refresh();
  }

  async function refresh() {
    if (!board) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      board.innerHTML = cloudOnlyMsg();
      return;
    }
    await loadAll();
    renderSummary();
    renderBoard();
  }

  document.getElementById('open-crm-opportunity')?.addEventListener('click', () => {
    populateNewOppForm();
    detailPanel?.classList.remove('hidden');
    historyEl && (historyEl.innerHTML = '');
  });

  document.getElementById('close-crm-detail')?.addEventListener('click', () => {
    editingId = null;
    detailPanel?.classList.add('hidden');
  });

  document.getElementById('crm-closed-skip')?.addEventListener('click', () => {
    pendingClosedOpp = null;
    closedModal?.classList.add('hidden');
  });

  document.getElementById('crm-closed-confirm')?.addEventListener('click', () => processClosedActions());

  oppForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const oppAction = editingId ? ACTIONS.EDIT : ACTIONS.CREATE;
    if (!(await guardMutation(store, subscription, FEATURES.CRM, router, { module: MODULES.CRM, action: oppAction }))) return;
    const f = new FormData(oppForm);
    const payload = {
      title: f.get('title'),
      company_name: f.get('companyName') || null,
      customer_id: f.get('customerId') || null,
      phone: f.get('phone') || null,
      whatsapp: f.get('whatsapp') || null,
      email: f.get('email') || null,
      owner_name: f.get('ownerName') || null,
      estimated_value: parseFloat(f.get('estimatedValue')) || 0,
      lead_source: f.get('leadSource') || null,
      probability: parseInt(f.get('probability'), 10) || 10,
      expected_close_date: f.get('expectedCloseDate') || null,
      notes: f.get('notes') || null,
      next_activity: f.get('nextActivity') || null,
      next_activity_at: f.get('nextActivityAt') || null,
      created_by: store.currentUserId
    };

    if (editingId) {
      await crmRepo.updateOpportunity(editingId, payload);
    } else {
      const firstStage = stages.find(s => s.slug === 'new_lead') || stages[0];
      await crmRepo.createOpportunity(store.companyId, { ...payload, stage_id: firstStage?.id });
    }
    detailPanel?.classList.add('hidden');
    editingId = null;
    refresh();
  });

  activityForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(activityForm);
    const oppId = f.get('opportunityId') || editingId;
    if (!oppId) return;
    if (!(await guardMutation(store, subscription, FEATURES.CRM, router, { module: MODULES.CRM, action: ACTIONS.CREATE }))) return;
    const type = f.get('activityType');
    const title = ACTIVITY_TYPES.find(t => t.value === type)?.label || 'Atividade';
    await crmRepo.addActivity(store.companyId, {
      opportunity_id: oppId,
      activity_type: type,
      title,
      description: f.get('description') || null,
      created_by: store.currentUserId
    });
    activityForm.reset();
    openDetail(oppId);
  });

  board?.addEventListener('dragstart', e => {
    const card = e.target.closest('.crm-card');
    if (!card) return;
    dragOppId = card.dataset.oppId;
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('crm-card--dragging');
  });

  board?.addEventListener('dragend', e => {
    e.target.closest('.crm-card')?.classList.remove('crm-card--dragging');
    dragOppId = null;
  });

  board?.addEventListener('dragover', e => {
    if (e.target.closest('[data-drop-zone]')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });

  board?.addEventListener('drop', async e => {
    const zone = e.target.closest('[data-drop-zone]');
    if (!zone || !dragOppId) return;
    e.preventDefault();
    const stageId = zone.dataset.dropZone;
    const opp = opportunities.find(o => o.id === dragOppId);
    if (!opp || opp.stage_id === stageId) return;
    await handleStageMove(dragOppId, stageId);
  });

  board?.addEventListener('click', e => {
    const card = e.target.closest('.crm-card');
    if (card?.dataset.oppId) openDetail(card.dataset.oppId);
  });

  return { refresh };
}
