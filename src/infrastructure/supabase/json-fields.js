/** Helpers JSON em colunas texto (compat v2 sem alterar schema) */

export function parseJsonField(raw, fallback = {}) {
  if (!raw) return { ...fallback };
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : { ...fallback, _text: raw };
  } catch {
    return { ...fallback, _text: raw };
  }
}

export function stringifyJsonField(obj) {
  return JSON.stringify(obj);
}
