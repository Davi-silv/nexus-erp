import { fmtMoney, escapeHtml } from '../../core/utils.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';
import { commercialRepo } from '../../repositories/supabase/commercial.repository.js';
import { FEATURES } from '../../domain/features.js';
import { guardMutation } from '../subscription-guards.js';
import { MODULES, ACTIONS } from '../../domain/rbac.service.js';

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  partial: 'Parcial',
  cancelled: 'Cancelado'
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'card', label: 'Cartão' },
  { value: 'debit', label: 'Débito automático' },
  { value: 'other', label: 'Outro' }
];

function cloudOnlyMsg() {
  return '<p class="plans-grid__status">Contas a pagar disponível no modo cloud (Supabase).</p>';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function effectivePayableStatus(row) {
  if (row.status === 'paid' || row.status === 'cancelled') return row.status;
  const paid = Number(row.paid_amount || 0);
  const amount = Number(row.amount || 0);
  if (paid > 0 && paid < amount) return 'partial';
  if (row.due_date && row.due_date < todayISO() && paid < amount) return 'overdue';
  return row.status || 'pending';
}

function statusBadge(status) {
  const cls = `status-chip status-chip--${status}`;
  return `<span class="${cls}">${STATUS_LABELS[status] || status}</span>`;
}

export function initPayablesModule(store, auth, router, subscription) {
  const summaryEl = document.getElementById('payables-summary');
  const body = document.getElementById('payables-body');
  const form = document.getElementById('add-payable-form');
  const editForm = document.getElementById('edit-payable-form');
  const payModal = document.getElementById('pay-payable-modal');
  const openBtn = document.getElementById('open-add-payable');
  const cancelBtn = document.getElementById('cancel-add-payable');
  const openSupplierBtn = document.getElementById('open-add-supplier-payable');
  const supplierForm = document.getElementById('add-supplier-payable-form');
  const paginationEl = document.getElementById('payables-pagination');

  let allRows = [];
  let filteredRows = [];
  let currentPage = 0;
  let payingId = null;
  let editingId = null;

  const filters = {
    dateFrom: '',
    dateTo: '',
    status: '',
    categoryId: '',
    supplierId: '',
    costCenterId: ''
  };

  function getAccounts() {
    return store.currentUserData?.accounts?.filter(a => a.active !== false) ?? [];
  }

  function getCategories() {
    return store.currentUserData?.categories ?? [];
  }

  function getCostCenters() {
    return store.currentUserData?.costCenters ?? [];
  }

  function populateSelects(targetForm) {
    if (!targetForm) return;
    const catSel = targetForm.querySelector('[name="categoryId"]');
    const ccSel = targetForm.querySelector('[name="costCenterId"]');
    const accSel = targetForm.querySelector('[name="financialAccountId"]');
    const supSel = targetForm.querySelector('[name="supplierId"]');

    if (catSel) {
      catSel.innerHTML = '<option value="">— Categoria —</option>' +
        getCategories().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (ccSel) {
      ccSel.innerHTML = '<option value="">— Centro de custo —</option>' +
        getCostCenters().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (accSel) {
      accSel.innerHTML = '<option value="">— Conta bancária —</option>' +
        getAccounts().map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    }
  }

  async function populateSupplierSelects() {
    if (!store.workspaceId) return;
    const suppliers = await commercialRepo.listSuppliers(store.workspaceId);
    const html = '<option value="">— Fornecedor —</option>' +
      suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    form?.querySelector('[name="supplierId"]') && (form.querySelector('[name="supplierId"]').innerHTML = html);
    editForm?.querySelector('[name="supplierId"]') && (editForm.querySelector('[name="supplierId"]').innerHTML = html);
    const filterSup = document.getElementById('filter-payable-supplier');
    if (filterSup) {
      filterSup.innerHTML = '<option value="">Todos fornecedores</option>' +
        suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    }
  }

  function populateFilterSelects() {
    const catFilter = document.getElementById('filter-payable-category');
    const ccFilter = document.getElementById('filter-payable-cost-center');
    if (catFilter) {
      catFilter.innerHTML = '<option value="">Todas categorias</option>' +
        getCategories().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (ccFilter) {
      ccFilter.innerHTML = '<option value="">Todos centros</option>' +
        getCostCenters().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
  }

  function applyFilters() {
    filteredRows = allRows.filter(row => {
      const eff = effectivePayableStatus(row);
      if (filters.status && eff !== filters.status) return false;
      if (filters.categoryId && row.category_id !== filters.categoryId) return false;
      if (filters.supplierId && row.supplier_id !== filters.supplierId) return false;
      if (filters.costCenterId && row.cost_center_id !== filters.costCenterId) return false;
      if (filters.dateFrom && row.due_date < filters.dateFrom) return false;
      if (filters.dateTo && row.due_date > filters.dateTo) return false;
      return true;
    });
    currentPage = 0;
  }

  function renderSummary() {
    if (!summaryEl) return;
    const open = allRows.filter(r => r.status !== 'cancelled' && r.status !== 'paid');
    const totalOpen = open.reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount || 0), 0);
    const overdue = allRows.filter(r => effectivePayableStatus(r) === 'overdue');
    const overdueTotal = overdue.reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount || 0), 0);

    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const in7iso = in7.toISOString().slice(0, 10);
    const dueSoon = allRows.filter(r => {
      const eff = effectivePayableStatus(r);
      return ['pending', 'partial', 'overdue'].includes(eff)
        && r.due_date >= todayISO() && r.due_date <= in7iso;
    });
    const dueSoonTotal = dueSoon.reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount || 0), 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);
    const paidMonth = allRows.filter(r =>
      r.status === 'paid' && r.payment_date && r.payment_date >= ms
    );
    const paidMonthTotal = paidMonth.reduce((s, r) => s + Number(r.paid_amount || r.amount || 0), 0);

    summaryEl.innerHTML = `
      <div class="metric-card"><span>Total a pagar</span><strong>${fmtMoney(totalOpen)}</strong></div>
      <div class="metric-card metric-card--expense"><span>Total vencido</span><strong>${fmtMoney(overdueTotal)}</strong></div>
      <div class="metric-card"><span>Vencendo em 7 dias</span><strong>${fmtMoney(dueSoonTotal)}</strong></div>
      <div class="metric-card metric-card--income"><span>Pago no mês</span><strong>${fmtMoney(paidMonthTotal)}</strong></div>
    `;
  }

  function renderTable() {
    if (!body) return;
    const start = currentPage * PAGE_SIZE;
    const pageRows = filteredRows.slice(start, start + PAGE_SIZE);

    body.innerHTML = pageRows.length ? pageRows.map(row => {
      const eff = effectivePayableStatus(row);
      const remaining = Number(row.amount) - Number(row.paid_amount || 0);
      const canPay = ['pending', 'partial', 'overdue'].includes(eff);
      const canEdit = row.status !== 'paid' && row.status !== 'cancelled';
      const canDelete = canEdit && Number(row.paid_amount || 0) === 0;
      return `
        <tr>
          <td>${escapeHtml(row.description)}</td>
          <td>${escapeHtml(row.suppliers?.name || '—')}</td>
          <td>${row.due_date || '—'}</td>
          <td>${fmtMoney(row.amount)}</td>
          <td>${fmtMoney(remaining)}</td>
          <td>${statusBadge(eff)}</td>
          <td class="table-actions">
            ${canPay ? `<button type="button" data-pay="${row.id}" data-remaining="${remaining}">Pagar</button>` : ''}
            ${canEdit ? `<button type="button" data-edit="${row.id}">Editar</button>` : ''}
            ${row.status !== 'paid' ? `<button type="button" data-cancel="${row.id}">Cancelar</button>` : ''}
            ${row.attachment_path ? `<button type="button" data-attach="${row.id}">Comprovante</button>` : ''}
            ${canDelete ? `<button type="button" data-del="${row.id}">Excluir</button>` : ''}
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="7">Nenhuma conta a pagar encontrada.</td></tr>';

    if (paginationEl) {
      const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
      paginationEl.innerHTML = filteredRows.length > PAGE_SIZE ? `
        <button type="button" id="payables-prev" ${currentPage === 0 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${currentPage + 1} de ${totalPages} (${filteredRows.length} itens)</span>
        <button type="button" id="payables-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Próxima</button>
      ` : `<span>${filteredRows.length} conta(s)</span>`;
    }
  }

  async function refresh() {
    if (!body) return;
    if (!isSupabaseEnabled || !store.workspaceId) {
      body.innerHTML = `<tr><td colspan="7">${cloudOnlyMsg()}</td></tr>`;
      return;
    }
    await store.loadUserData();
    populateSelects(form);
    populateSelects(editForm);
    populateFilterSelects();
    await populateSupplierSelects();

    const { rows } = await commercialRepo.listPayables(store.workspaceId);
    allRows = rows;
    applyFilters();
    renderSummary();
    renderTable();
  }

  openBtn?.addEventListener('click', () => {
    populateSelects(form);
    form?.classList.remove('hidden');
  });
  cancelBtn?.addEventListener('click', () => { form?.reset(); form?.classList.add('hidden'); });

  openSupplierBtn?.addEventListener('click', () => supplierForm?.classList.remove('hidden'));
  document.getElementById('cancel-add-supplier-payable')?.addEventListener('click', () => {
    supplierForm?.reset();
    supplierForm?.classList.add('hidden');
  });

  supplierForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!(await guardMutation(store, subscription, FEATURES.SUPPLIERS, router, { module: MODULES.FINANCIAL, action: ACTIONS.CREATE }))) return;
    const f = new FormData(supplierForm);
    await commercialRepo.upsertSupplier(store.companyId, {
      name: f.get('name'),
      document: f.get('document') || null,
      email: f.get('email') || null,
      phone: f.get('phone') || null,
      active: true
    });
    supplierForm.reset();
    supplierForm.classList.add('hidden');
    await populateSupplierSelects();
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    if (!(await guardMutation(store, subscription, FEATURES.ACCOUNTS_PAYABLE, router, { module: MODULES.FINANCIAL, action: ACTIONS.CREATE }))) return;
    const f = new FormData(form);
    const created = await commercialRepo.createPayable(store.companyId, {
      supplier_id: f.get('supplierId') || null,
      category_id: f.get('categoryId') || null,
      cost_center_id: f.get('costCenterId') || null,
      financial_account_id: f.get('financialAccountId') || null,
      description: f.get('description'),
      amount: parseFloat(f.get('amount')) || 0,
      issue_date: f.get('issueDate') || null,
      due_date: f.get('dueDate'),
      payment_method: f.get('paymentMethod') || null,
      notes: f.get('notes') || null,
      is_recurring: f.get('isRecurring') === 'on',
      recurrence_frequency: f.get('isRecurring') === 'on' ? (f.get('recurrenceFrequency') || 'monthly') : null,
      created_by: store.currentUserId
    });
    const file = f.get('attachment');
    if (file instanceof File && file.size > 0) {
      await commercialRepo.uploadPayableAttachment(store.workspaceId, created.id, file);
    }
    form.reset();
    form.classList.add('hidden');
    await store.loadUserData();
    refresh();
  });

  editForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingId) return;
    if (!(await guardMutation(store, subscription, FEATURES.ACCOUNTS_PAYABLE, router, { module: MODULES.FINANCIAL, action: ACTIONS.CREATE }))) return;
    const f = new FormData(editForm);
    await commercialRepo.updatePayable(editingId, {
      supplier_id: f.get('supplierId') || null,
      category_id: f.get('categoryId') || null,
      cost_center_id: f.get('costCenterId') || null,
      financial_account_id: f.get('financialAccountId') || null,
      description: f.get('description'),
      amount: parseFloat(f.get('amount')) || 0,
      issue_date: f.get('issueDate') || null,
      due_date: f.get('dueDate'),
      payment_method: f.get('paymentMethod') || null,
      notes: f.get('notes') || null,
      is_recurring: f.get('isRecurring') === 'on',
      recurrence_frequency: f.get('isRecurring') === 'on' ? (f.get('recurrenceFrequency') || 'monthly') : null
    });
    const file = f.get('attachment');
    if (file instanceof File && file.size > 0) {
      await commercialRepo.uploadPayableAttachment(store.workspaceId, editingId, file);
    }
    editingId = null;
    editForm.classList.add('hidden');
    refresh();
  });

  document.getElementById('cancel-edit-payable')?.addEventListener('click', () => {
    editingId = null;
    editForm?.reset();
    editForm?.classList.add('hidden');
  });

  body?.addEventListener('click', async e => {
    const payId = e.target.dataset.pay;
    const editId = e.target.dataset.edit;
    const cancelId = e.target.dataset.cancel;
    const delId = e.target.dataset.del;
    const attachId = e.target.dataset.attach;

    if (payId) {
      payingId = payId;
      const remaining = parseFloat(e.target.dataset.remaining) || 0;
      const payForm = document.getElementById('pay-payable-form');
      payForm?.reset();
      const amountInput = payForm?.querySelector('[name="amount"]');
      if (amountInput) amountInput.value = remaining.toFixed(2);
      const accSel = payForm?.querySelector('[name="financialAccountId"]');
      if (accSel) {
        accSel.innerHTML = '<option value="">— Conta bancária —</option>' +
          getAccounts().map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      }
      payModal?.classList.remove('hidden');
      return;
    }

    if (editId) {
      const row = allRows.find(r => r.id === editId);
      if (!row || row.status === 'paid') return;
      editingId = editId;
      populateSelects(editForm);
      await populateSupplierSelects();
      for (const [k, v] of Object.entries({
        description: row.description,
        amount: row.amount,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        notes: row.notes,
        paymentMethod: row.payment_method,
        supplierId: row.supplier_id,
        categoryId: row.category_id,
        costCenterId: row.cost_center_id,
        financialAccountId: row.financial_account_id
      })) {
        const el = editForm.querySelector(`[name="${k}"]`);
        if (el) el.value = v ?? '';
      }
      const recCheck = editForm.querySelector('[name="isRecurring"]');
      if (recCheck) recCheck.checked = Boolean(row.is_recurring);
      const recFreq = editForm.querySelector('[name="recurrenceFrequency"]');
      if (recFreq) recFreq.value = row.recurrence_frequency || 'monthly';
      editForm.classList.remove('hidden');
      return;
    }

    if (cancelId) {
      if (!confirm('Cancelar esta conta a pagar?')) return;
      await commercialRepo.cancelPayable(cancelId);
      refresh();
      return;
    }

    if (delId) {
      if (!confirm('Excluir esta conta a pagar? Esta ação não pode ser desfeita.')) return;
      try {
        await commercialRepo.softDeletePayable(delId);
        refresh();
      } catch (err) {
        alert(err.message || 'Erro ao excluir conta a pagar.');
      }
      return;
    }

    if (attachId) {
      const row = allRows.find(r => r.id === attachId);
      if (!row?.attachment_path) return;
      const url = await commercialRepo.getPayableAttachmentUrl(row.attachment_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  });

  document.getElementById('pay-payable-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!payingId) return;
    if (!(await guardMutation(store, subscription, FEATURES.ACCOUNTS_PAYABLE, router, { module: MODULES.FINANCIAL, action: ACTIONS.EDIT }))) return;
    const f = new FormData(e.target);
    try {
      await commercialRepo.markPayablePaid(
        payingId,
        parseFloat(f.get('amount')) || 0,
        f.get('financialAccountId'),
        f.get('paymentDate') || todayISO()
      );
      payingId = null;
      payModal?.classList.add('hidden');
      await store.loadUserData();
      refresh();
    } catch (err) {
      alert(err.message || 'Erro ao registrar pagamento.');
    }
  });

  document.getElementById('pay-payable-modal-close')?.addEventListener('click', () => {
    payingId = null;
    payModal?.classList.add('hidden');
  });

  payModal?.addEventListener('click', e => {
    if (e.target === payModal) {
      payingId = null;
      payModal.classList.add('hidden');
    }
  });

  document.getElementById('apply-payable-filters')?.addEventListener('click', () => {
    filters.dateFrom = document.getElementById('filter-payable-from')?.value || '';
    filters.dateTo = document.getElementById('filter-payable-to')?.value || '';
    filters.status = document.getElementById('filter-payable-status')?.value || '';
    filters.categoryId = document.getElementById('filter-payable-category')?.value || '';
    filters.supplierId = document.getElementById('filter-payable-supplier')?.value || '';
    filters.costCenterId = document.getElementById('filter-payable-cost-center')?.value || '';
    applyFilters();
    renderTable();
  });

  document.getElementById('clear-payable-filters')?.addEventListener('click', () => {
    Object.keys(filters).forEach(k => { filters[k] = ''; });
    ['filter-payable-from', 'filter-payable-to', 'filter-payable-status',
      'filter-payable-category', 'filter-payable-supplier', 'filter-payable-cost-center']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    applyFilters();
    renderTable();
  });

  paginationEl?.addEventListener('click', e => {
    if (e.target.id === 'payables-prev' && currentPage > 0) {
      currentPage--;
      renderTable();
    }
    if (e.target.id === 'payables-next') {
      const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderTable();
      }
    }
  });

  return { refresh };
}

export { PAYMENT_METHODS, STATUS_LABELS, effectivePayableStatus };
