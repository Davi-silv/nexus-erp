import { fmtMoney, escapeHtml } from '../../core/utils.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { commercialRepo } from '../../repositories/supabase/commercial.repository.js';
import { FEATURES } from '../../domain/features.js';
import { guardMutation } from '../subscription-guards.js';
import { openQuotePdf } from '../../services/quote-pdf.service.js';

function cloudOnlyMsg() {
  return '<p class="plans-grid__status">Módulo comercial disponível no modo cloud (Supabase).</p>';
}

export function initCustomersModule(store, auth, router, subscription) {
  const body = document.getElementById('customers-body');
  const form = document.getElementById('add-customer-form');
  const openBtn = document.getElementById('open-add-customer');
  const cancelBtn = document.getElementById('cancel-add-customer');

  async function refresh() {
    if (!body) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      body.innerHTML = `<tr><td colspan="5">${cloudOnlyMsg()}</td></tr>`;
      return;
    }
    try {
      const rows = await commercialRepo.listCustomers(store.workspaceId);
      body.innerHTML = rows.length ? rows.map(c => `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.document || '—')}</td>
          <td>${escapeHtml(c.email || '—')}</td>
          <td>${c.active ? 'Ativo' : 'Inativo'}</td>
          <td>${escapeHtml(c.phone || '—')}</td>
        </tr>
      `).join('') : '<tr><td colspan="5">Nenhum cliente cadastrado.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">Erro: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  openBtn?.addEventListener('click', () => form?.classList.remove('hidden'));
  cancelBtn?.addEventListener('click', () => { form?.reset(); form?.classList.add('hidden'); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    if (!(await guardMutation(store, subscription, FEATURES.CUSTOMERS, router))) return;
    const f = new FormData(form);
    await commercialRepo.upsertCustomer({
      workspace_id: store.workspaceId,
      name: f.get('name'),
      person_type: f.get('personType') || 'individual',
      document: f.get('document') || null,
      email: f.get('email') || null,
      phone: f.get('phone') || null,
      active: true
    });
    form.reset();
    form.classList.add('hidden');
    refresh();
  });

  return { refresh };
}

export function initServicesModule(store, auth, router, subscription) {
  const body = document.getElementById('services-body');
  const form = document.getElementById('add-service-form');
  const openBtn = document.getElementById('open-add-service');
  const cancelBtn = document.getElementById('cancel-add-service');

  async function refresh() {
    if (!body) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      body.innerHTML = `<tr><td colspan="5">${cloudOnlyMsg()}</td></tr>`;
      return;
    }
    const rows = await commercialRepo.listServices(store.workspaceId);
    body.innerHTML = rows.length ? rows.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml((s.description || '').slice(0, 60))}</td>
        <td>${s.default_price != null ? fmtMoney(s.default_price) : '—'}</td>
        <td>${escapeHtml(s.service_code || '—')}</td>
        <td>${s.active ? 'Ativo' : 'Inativo'} <button type="button" data-del="${s.id}" class="btn-link">Remover</button></td>
      </tr>
    `).join('') : '<tr><td colspan="5">Nenhum serviço cadastrado.</td></tr>';
  }

  body?.addEventListener('click', async e => {
    const id = e.target.dataset.del;
    if (!id) return;
    if (!confirm('Remover este serviço?')) return;
    await commercialRepo.deleteService(id);
    refresh();
  });

  openBtn?.addEventListener('click', () => form?.classList.remove('hidden'));
  cancelBtn?.addEventListener('click', () => { form?.reset(); form?.classList.add('hidden'); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    if (!(await guardMutation(store, subscription, FEATURES.SERVICES, router))) return;
    const f = new FormData(form);
    await commercialRepo.upsertService({
      workspace_id: store.workspaceId,
      name: f.get('name'),
      description: f.get('description') || null,
      fiscal_description: f.get('fiscalDescription') || null,
      default_price: parseFloat(f.get('defaultPrice')) || null,
      service_code: f.get('serviceCode') || null,
      tax_rate: parseFloat(f.get('taxRate')) || null,
      active: true,
      created_by: store.currentUserId
    });
    form.reset();
    form.classList.add('hidden');
    refresh();
  });

  return { refresh };
}

export function initQuotesModule(store, auth, router, subscription) {
  const body = document.getElementById('quotes-body');
  const summary = document.getElementById('quotes-summary');
  const form = document.getElementById('add-quote-form');
  const openBtn = document.getElementById('open-add-quote');
  const cancelBtn = document.getElementById('cancel-add-quote');
  const itemForm = document.getElementById('add-quote-item-form');
  const serviceSelect = document.getElementById('quote-service-select');
  let editingQuoteId = null;

  async function loadServiceOptions() {
    if (!serviceSelect || !store.workspaceId) return;
    const services = await commercialRepo.listServices(store.workspaceId);
    serviceSelect.innerHTML = '<option value="">— Serviço —</option>' +
      services.map(s => `<option value="${s.id}" data-price="${s.default_price || 0}">${escapeHtml(s.name)}</option>`).join('');
  }

  async function refreshSummary() {
    if (!summary || !store.workspaceId) return;
    const s = await commercialRepo.getCommercialSummary(store.workspaceId);
    summary.innerHTML = `
      <div class="metric-card"><span>Rascunhos</span><strong>${s.quotesDraft}</strong></div>
      <div class="metric-card"><span>Enviados</span><strong>${s.quotesSent}</strong></div>
      <div class="metric-card"><span>Aprovados</span><strong>${s.quotesApproved}</strong></div>
      <div class="metric-card"><span>Aprovado (total)</span><strong>${fmtMoney(s.approvedMonthTotal)}</strong></div>
    `;
  }

  async function refresh() {
    if (!body) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      body.innerHTML = `<tr><td colspan="7">${cloudOnlyMsg()}</td></tr>`;
      return;
    }
    await refreshSummary();
    await loadServiceOptions();
    const customers = await commercialRepo.listCustomers(store.workspaceId);
    const custSelect = form?.querySelector('[name="customerId"]');
    if (custSelect) {
      custSelect.innerHTML = '<option value="">— Cliente —</option>' +
        customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    const rows = await commercialRepo.listQuotes(store.workspaceId);
    body.innerHTML = rows.length ? rows.map(q => `
      <tr>
        <td>${escapeHtml(q.number)}</td>
        <td>${escapeHtml(q.customers?.name || '—')}</td>
        <td>${q.issue_date || '—'}</td>
        <td>${q.valid_until || '—'}</td>
        <td>${fmtMoney(q.total)}</td>
        <td>${escapeHtml(q.status)}</td>
        <td class="table-actions">
          <button type="button" data-edit="${q.id}">Itens</button>
          <button type="button" data-pdf="${q.id}">PDF</button>
          ${q.status === 'draft' ? `<button type="button" data-send="${q.id}">Enviar</button>` : ''}
          ${q.status !== 'approved' ? `<button type="button" data-approve="${q.id}">Aprovar</button>` : ''}
          ${q.status === 'approved' && !q.accounts_receivable_id ? `<button type="button" data-ar="${q.id}">Gerar CR</button>` : ''}
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7">Nenhum orçamento.</td></tr>';
  }

  body?.addEventListener('click', async e => {
    const id = e.target.dataset.edit || e.target.dataset.pdf || e.target.dataset.send
      || e.target.dataset.approve || e.target.dataset.ar;
    if (!id) return;
    if (e.target.dataset.edit) {
      editingQuoteId = id;
      itemForm?.classList.remove('hidden');
      return;
    }
    if (e.target.dataset.pdf) {
      const q = await commercialRepo.getQuote(id);
      openQuotePdf({
        quote: q,
        customer: q.customers,
        workspace: store.currentUser()?.company || { name: store.currentUser()?.name },
        items: q.quote_items || []
      });
      return;
    }
    if (e.target.dataset.send) {
      await commercialRepo.setQuoteStatus(id, 'sent');
      refresh();
      return;
    }
    if (e.target.dataset.approve) {
      await commercialRepo.setQuoteStatus(id, 'approved');
      refresh();
      return;
    }
    if (e.target.dataset.ar) {
      await commercialRepo.generateReceivableFromQuote(id);
      alert('Conta a receber gerada.');
      refresh();
      router.navigate('contas-receber');
    }
  });

  serviceSelect?.addEventListener('change', () => {
    const opt = serviceSelect.selectedOptions[0];
    const price = itemForm?.querySelector('[name="unitPrice"]');
    if (price && opt?.dataset.price) price.value = opt.dataset.price;
  });

  openBtn?.addEventListener('click', () => form?.classList.remove('hidden'));
  cancelBtn?.addEventListener('click', () => { form?.reset(); form?.classList.add('hidden'); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!(await guardMutation(store, subscription, FEATURES.QUOTES, router))) return;
    const f = new FormData(form);
    await commercialRepo.createQuote(store.workspaceId, {
      customer_id: f.get('customerId') || null,
      valid_until: f.get('validUntil') || null,
      notes: f.get('notes') || null,
      discount: parseFloat(f.get('discount')) || 0,
      created_by: store.currentUserId,
      status: 'draft'
    });
    form.reset();
    form.classList.add('hidden');
    refresh();
  });

  itemForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingQuoteId) { alert('Selecione um orçamento (Itens).'); return; }
    const f = new FormData(itemForm);
    const svc = serviceSelect?.selectedOptions[0];
    await commercialRepo.addQuoteItem({
      quote_id: editingQuoteId,
      workspace_id: store.workspaceId,
      service_id: f.get('serviceId') || null,
      description: f.get('description') || svc?.textContent || 'Serviço',
      quantity: parseFloat(f.get('quantity')) || 1,
      unit_price: parseFloat(f.get('unitPrice')) || 0,
      discount: parseFloat(f.get('discount')) || 0
    });
    itemForm.reset();
    refresh();
  });

  return { refresh };
}

export function initReceivablesModule(store, auth, router, subscription) {
  const body = document.getElementById('receivables-body');
  const pixPanel = document.getElementById('pix-charge-panel');

  async function refresh() {
    if (!body) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      body.innerHTML = `<tr><td colspan="6">${cloudOnlyMsg()}</td></tr>`;
      return;
    }
    const rows = await commercialRepo.listReceivables(store.workspaceId);
    body.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(r.description)}</td>
        <td>${escapeHtml(r.customers?.name || '—')}</td>
        <td>${r.due_date}</td>
        <td>${fmtMoney(r.amount)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>
          ${r.status === 'pending' ? `<button type="button" data-pix="${r.id}">Gerar PIX</button>` : ''}
          ${r.status === 'received' ? `<button type="button" data-nfse="${r.id}">Emitir NFS-e</button>` : ''}
        </td>
      </tr>
    `).join('') : '<tr><td colspan="6">Nenhuma conta a receber.</td></tr>';
  }

  body?.addEventListener('click', async e => {
    const pixId = e.target.dataset.pix;
    const nfseId = e.target.dataset.nfse;
    if (pixId) {
      if (!(await guardMutation(store, subscription, FEATURES.PIX_CHARGES, router))) return;
      const charge = await commercialRepo.createPixCharge(pixId);
      if (pixPanel) {
        pixPanel.classList.remove('hidden');
        pixPanel.innerHTML = `
          <h3>Cobrança PIX — ${fmtMoney(charge.amount)}</h3>
          <p><strong>Status:</strong> Aguardando pagamento</p>
          <label>Código Pix Copia e Cola</label>
          <textarea readonly rows="3">${escapeHtml(charge.pix_copy_paste || '')}</textarea>
          <button type="button" id="copy-pix-code" class="btn-secondary">Copiar código PIX</button>
        `;
        pixPanel.querySelector('#copy-pix-code')?.addEventListener('click', () => {
          navigator.clipboard?.writeText(charge.pix_copy_paste || '');
          alert('Código copiado.');
        });
      }
    }
    if (nfseId) {
      if (!(await guardMutation(store, subscription, FEATURES.NFSE, router))) return;
      const inv = await commercialRepo.requestFiscalInvoice(store.workspaceId, nfseId);
      alert(`NFS-e em processamento (${inv.status}). Acompanhe em Fiscal > Notas fiscais.`);
      router.navigate('notas-fiscais');
    }
  });

  return { refresh };
}

export function initFiscalModule(store, auth, router, subscription) {
  const settingsForm = document.getElementById('fiscal-settings-form');
  const invoicesBody = document.getElementById('fiscal-invoices-body');
  const fiscalSummary = document.getElementById('fiscal-summary');

  async function refreshSettings() {
    if (!settingsForm || !store.workspaceId) return;
    const s = await commercialRepo.getFiscalSettings(store.workspaceId);
    if (!s) return;
    for (const [k, v] of Object.entries(s)) {
      const el = settingsForm.querySelector(`[name="${k}"]`);
      if (el) el.value = v ?? '';
    }
    const activeEl = settingsForm.querySelector('[name="active"]');
    if (activeEl) activeEl.checked = Boolean(s.active);
  }

  async function refreshInvoices() {
    if (!invoicesBody || !store.workspaceId) return;
    const s = await commercialRepo.getCommercialSummary(store.workspaceId);
    if (fiscalSummary) {
      fiscalSummary.innerHTML = `
        <div class="metric-card"><span>Emitidas (mês)</span><strong>${s.invoicesMonth}</strong></div>
        <div class="metric-card"><span>Faturado</span><strong>${fmtMoney(s.invoicedMonth)}</strong></div>
        <div class="metric-card"><span>Processando</span><strong>${s.invoicesProcessing}</strong></div>
        <div class="metric-card"><span>Rejeitadas</span><strong>${s.invoicesRejected}</strong></div>
      `;
    }
    const rows = await commercialRepo.listFiscalInvoices(store.workspaceId);
    invoicesBody.innerHTML = rows.length ? rows.map(i => `
      <tr>
        <td>${escapeHtml(i.number || '—')}</td>
        <td>${escapeHtml(i.customers?.name || '—')}</td>
        <td>${i.issued_at ? new Date(i.issued_at).toLocaleDateString('pt-BR') : '—'}</td>
        <td>${i.gross_amount != null ? fmtMoney(i.gross_amount) : '—'}</td>
        <td>${escapeHtml(i.status)}</td>
        <td>—</td>
      </tr>
    `).join('') : '<tr><td colspan="6">Nenhuma nota fiscal.</td></tr>';
  }

  async function refresh() {
    if (!isSupabaseEnabled || !store.workspaceId) return;
    await refreshSettings();
    await refreshInvoices();
  }

  settingsForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!(await guardMutation(store, subscription, FEATURES.NFSE, router))) return;
    const f = new FormData(settingsForm);
    await commercialRepo.upsertFiscalSettings({
      workspace_id: store.workspaceId,
      legal_name: f.get('legal_name') || null,
      trade_name: f.get('trade_name') || null,
      document: f.get('document') || null,
      municipal_registration: f.get('municipal_registration') || null,
      tax_regime: f.get('tax_regime') || null,
      city_name: f.get('city_name') || null,
      state: f.get('state') || null,
      fiscal_email: f.get('fiscal_email') || null,
      provider: f.get('provider') || 'stub',
      active: f.get('active') === 'on'
    });
    alert('Configurações fiscais salvas.');
    refresh();
  });

  return { refresh, refreshInvoices, refreshSettings };
}
