import { uid, toggleForm, fmtMoney, escapeHtml } from '../../core/utils.js';
import { formatCNPJ, calculateDRE, isBusiness } from '../../domain/profile.service.js';
import { buildDRECsv } from '../../domain/export.service.js';
import { downloadCsv } from '../../core/utils.js';

export function initCompanyModule(store, auth) {
  const form = document.getElementById('company-form');
  const costCentersBody = document.getElementById('cost-centers-body');
  const dreContainer = document.getElementById('dre-summary');
  const exportDreBtn = document.getElementById('export-dre');

  function renderCompanyForm() {
    if (!form) return;
    const u = store.currentUser();
    if (!u || !isBusiness(u)) return;

    const c = u.company || {};
    form.querySelector('[name="legalName"]').value = c.legalName || '';
    form.querySelector('[name="tradeName"]').value = c.tradeName || '';
    form.querySelector('[name="cnpj"]').value = c.cnpj || '';
    form.querySelector('[name="taxRegime"]').value = c.taxRegime || 'simples';
  }

  function renderCostCenters() {
    if (!costCentersBody || !store.currentUserData) return;
    const centers = store.currentUserData.costCenters || [];
    costCentersBody.innerHTML = centers.map(cc => `
      <tr>
        <td>${escapeHtml(cc.code)}</td>
        <td>${escapeHtml(cc.name)}</td>
        <td>${cc.budget ? fmtMoney(cc.budget) : '—'}</td>
        <td><button type="button" class="cc-del" data-id="${cc.id}">Remover</button></td>
      </tr>
    `).join('');
  }

  function renderDRE() {
    const u = store.currentUser();
    if (!isBusiness(u) || !store.currentUserData) return;

    const dre = calculateDRE(store.currentUserData.txs, store.currentUserData.categories);
    const html = `
      <div class="dre-grid">
        <div class="dre-row dre-row--header"><span>Demonstrativo de Resultado (simplificado)</span></div>
        <div class="dre-row"><span>(+) Receita bruta</span><strong class="credit">${fmtMoney(dre.revenue)}</strong></div>
        <div class="dre-row"><span>(−) Despesas operacionais</span><strong class="debit">${fmtMoney(dre.expenses)}</strong></div>
        <div class="dre-row dre-row--total"><span>(=) Resultado líquido</span><strong class="${dre.net >= 0 ? 'credit' : 'debit'}">${fmtMoney(dre.net)}</strong></div>
        <div class="dre-row"><span>Margem líquida</span><strong>${dre.margin}%</strong></div>
      </div>
      ${dre.byCategory.length ? `
        <h4 class="dre-subtitle">Despesas por conta</h4>
        <div class="dre-categories">
          ${dre.byCategory.map(([name, val]) => `
            <div class="dre-cat-row"><span>${escapeHtml(name)}</span><span>${fmtMoney(val)}</span></div>
          `).join('')}
        </div>
      ` : ''}
    `;

    const dash = document.getElementById('dre-summary');
    const company = document.getElementById('dre-summary-company');
    if (dash) dash.innerHTML = html;
    if (company) company.innerHTML = html;
  }

  form?.addEventListener('submit', e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
    const f = new FormData(form);
    store.updateUserProfile({
      company: {
        legalName: f.get('legalName'),
        tradeName: f.get('tradeName'),
        cnpj: formatCNPJ(f.get('cnpj')),
        taxRegime: f.get('taxRegime')
      }
    });
    alert('Dados da empresa salvos.');
  });

  form?.querySelector('[name="cnpj"]')?.addEventListener('input', e => {
    e.target.value = formatCNPJ(e.target.value);
  });

  const openAddCC = document.getElementById('open-add-cost-center');
  const ccForm = document.getElementById('add-cost-center-form');
  const cancelCC = document.getElementById('cancel-add-cost-center');

  openAddCC?.addEventListener('click', () => toggleForm(ccForm, openAddCC, true));
  cancelCC?.addEventListener('click', () => {
    ccForm?.reset();
    toggleForm(ccForm, openAddCC, false);
  });

  ccForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(ccForm);
    store.mutate(data => {
      if (!data.costCenters) data.costCenters = [];
      data.costCenters.push({
        id: uid(),
        code: f.get('code'),
        name: f.get('name'),
        budget: parseFloat(f.get('budget')) || null
      });
    });
    renderCostCenters();
    ccForm.reset();
    toggleForm(ccForm, openAddCC, false);
  });

  costCentersBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('cc-del')) return;
    store.mutate(data => {
      data.costCenters = (data.costCenters || []).filter(c => c.id !== Number(e.target.dataset.id));
    });
    renderCostCenters();
  });

  const exportDre = () => {
    if (!auth.requireAuth() || !store.currentUserData) return;
    const dre = calculateDRE(store.currentUserData.txs, store.currentUserData.categories);
    downloadCsv('nexus_dre.csv', buildDRECsv(dre));
  };

  exportDreBtn?.addEventListener('click', exportDre);
  document.getElementById('export-dre-company')?.addEventListener('click', exportDre);

  function refresh() {
    renderCompanyForm();
    renderCostCenters();
    renderDRE();
  }

  return { refresh, renderDRE };
}

export function populateCostCenterSelect(select, costCenters) {
  if (!select) return;
  select.innerHTML = '<option value="">Sem centro de custo</option>' +
    (costCenters || []).map(c => `<option value="${c.id}">${escapeHtml(c.code)} — ${escapeHtml(c.name)}</option>`).join('');
}
