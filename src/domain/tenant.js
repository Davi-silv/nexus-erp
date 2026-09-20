/** Multi-tenant — company_id é definido apenas pelo contexto autenticado (AppStore). */

export const TENANT_FK = 'company_id';

/** @deprecated alias interno — mesmo UUID que company_id */
export const LEGACY_TENANT_FK = 'workspace_id';

export function getCompanyId(store) {
  return store?.companyId ?? store?.workspaceId ?? null;
}

/** Remove campos de tenant enviados pelo cliente (evita spoofing). */
export function stripTenantFields(row = {}) {
  if (!row || typeof row !== 'object') return {};
  const copy = { ...row };
  delete copy[TENANT_FK];
  delete copy[LEGACY_TENANT_FK];
  return copy;
}

/** Anexa company_id autorizado; ignora valor vindo do payload. */
export function withCompanyId(store, row = {}) {
  const companyId = getCompanyId(store);
  if (!companyId) throw new Error('Empresa (tenant) não selecionada na sessão.');
  return scopedRow(companyId, row);
}

export function scopedRow(companyId, row = {}) {
  if (!companyId) throw new Error('company_id obrigatório.');
  return { ...stripTenantFields(row), [TENANT_FK]: companyId };
}

export function assertSameCompany(store, companyId) {
  const expected = getCompanyId(store);
  if (!expected || !companyId || String(expected) !== String(companyId)) {
    throw new Error('Operação negada: registro pertence a outra empresa.');
  }
}
