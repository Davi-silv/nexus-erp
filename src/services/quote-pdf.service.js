/**
 * Gera PDF/HTML imprimível do orçamento (client-side — sem mock de dados fiscais).
 */
import { fmtMoney, escapeHtml } from '../core/utils.js';

export function openQuotePdf({ quote, customer, workspace, items = [] }) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert('Permita pop-ups para gerar o PDF do orçamento.');
    return;
  }

  const rows = items.map(it => `
    <tr>
      <td>${escapeHtml(it.description)}</td>
      <td style="text-align:center">${Number(it.quantity)}</td>
      <td style="text-align:right">${fmtMoney(it.unit_price)}</td>
      <td style="text-align:right">${fmtMoney(it.total)}</td>
    </tr>
  `).join('');

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Orçamento ${escapeHtml(quote.number)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
  h1 { margin: 0 0 8px; font-size: 1.4rem; }
  .meta { color: #555; font-size: 0.9rem; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
  .total { font-size: 1.2rem; font-weight: 700; text-align: right; margin-top: 16px; }
  .notes { margin-top: 24px; font-size: 0.85rem; color: #444; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <h1>${escapeHtml(workspace?.tradeName || workspace?.name || 'Nexus ERP')}</h1>
  <div class="meta">${escapeHtml(workspace?.document || '')}</div>
  <h2>Orçamento ${escapeHtml(quote.number)}</h2>
  <div class="meta">
    Cliente: ${escapeHtml(customer?.name || '—')}<br>
    Data: ${quote.issue_date || '—'} · Validade: ${quote.valid_until || '—'}<br>
    Status: ${escapeHtml(quote.status)}
  </div>
  <table>
    <thead><tr><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total: ${fmtMoney(quote.total)}</div>
  ${quote.notes ? `<div class="notes"><strong>Observações:</strong><br>${escapeHtml(quote.notes)}</div>` : ''}
  <div class="notes">Condições comerciais sujeitas à aprovação. Validade conforme indicado acima.</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
  w.document.close();
}
