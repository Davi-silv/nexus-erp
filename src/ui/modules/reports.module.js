import { fmtMoney, escapeHtml, downloadCsv } from '../../core/utils.js';
import { parseStatementCSV, reconcileStatement } from '../../domain/reconciliation.service.js';
import { buildTransactionsCsv, buildAccountsCsv } from '../../domain/export.service.js';

export function initReconcileModule(store, auth) {
  const reconcileBtn = document.getElementById('run-reconcile');
  const reconcileFileInput = document.getElementById('reconcile-file');

  function showReconcileResult(matches) {
    const out = document.getElementById('reconcile-result');
    if (!out) return;
    if (!matches.length) {
      out.innerHTML = '<h4>Resultado</h4><div>Nenhuma linha encontrada no extrato.</div>';
      return;
    }
    out.innerHTML = '<h4>Resultado</h4>' + matches.map(m => `
      <div>${escapeHtml(m.stmt.date)} ${fmtMoney(m.stmt.amount)} —
        ${m.tx ? ('Conciliado com: ' + escapeHtml(m.tx.desc)) : '<b>Não encontrado</b>'}
      </div>
    `).join('');
  }

  function reconcile(text) {
    if (!auth.requireAuth()) return;
    const parsed = parseStatementCSV(text);
    const matches = reconcileStatement(parsed, store.currentUserData.txs);
    showReconcileResult(matches);
  }

  reconcileBtn?.addEventListener('click', () => {
    const txt = document.getElementById('statement-paste')?.value.trim();
    if (!txt) return alert('Cole o CSV do extrato ou carregue um arquivo.');
    reconcile(txt);
  });

  reconcileFileInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      const textarea = document.getElementById('statement-paste');
      if (textarea) textarea.value = content;
      reconcile(content);
    };
    reader.readAsText(file, 'UTF-8');
  });
}

export function initReportsModule(store, auth) {
  document.getElementById('export-csv')?.addEventListener('click', () => {
    if (!auth.requireAuth()) return;
    const from = document.getElementById('rep-from')?.value;
    const to = document.getElementById('rep-to')?.value;
    const rows = buildTransactionsCsv(store.currentUserData.txs, store.currentUserData.accounts, { from, to });
    downloadCsv('nexus_lancamentos.csv', rows);
  });

  document.getElementById('export-accounts-csv')?.addEventListener('click', () => {
    if (!auth.requireAuth()) return;
    const rows = buildAccountsCsv(store.currentUserData.accounts);
    downloadCsv('nexus_contas.csv', rows);
  });
}
