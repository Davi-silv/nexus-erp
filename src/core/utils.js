/** Utilitários puros — testáveis sem DOM */

export async function hashPassword(pass) {
  const enc = new TextEncoder().encode(pass);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fmtMoney(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

/** ID único — UUID quando disponível (Supabase), numérico como fallback */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/** Converte valor de form/data-id para id (number ou UUID string) */
export function parseId(value) {
  if (value == null || value === '') return null;
  const str = String(value);
  const n = Number(str);
  if (!Number.isNaN(n) && String(n) === str) return n;
  return str;
}

export function sameId(a, b) {
  return String(a) === String(b);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function $(id) {
  return document.getElementById(id);
}

export function toggleForm(formEl, openBtn, visible) {
  if (!formEl || !openBtn) return;
  formEl.classList.toggle('hidden', !visible);
  openBtn.style.display = visible ? 'none' : '';
}

export function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
