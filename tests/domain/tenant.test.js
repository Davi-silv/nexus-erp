import { describe, it, expect } from 'vitest';
import { stripTenantFields, withCompanyId, assertSameCompany, TENANT_FK } from '../../src/domain/tenant.js';

describe('tenant', () => {
  const store = { workspaceId: 'aaa-bbb' };

  it('stripTenantFields remove company_id e workspace_id', () => {
    const row = stripTenantFields({ name: 'X', company_id: 'evil', workspace_id: 'evil2' });
    expect(row).toEqual({ name: 'X' });
  });

  it('withCompanyId força id da sessão', () => {
    const row = withCompanyId(store, { company_id: 'evil', amount: 10 });
    expect(row[TENANT_FK]).toBe('aaa-bbb');
    expect(row.amount).toBe(10);
  });

  it('assertSameCompany rejeita outro tenant', () => {
    expect(() => assertSameCompany(store, 'other')).toThrow(/outra empresa/);
    expect(() => assertSameCompany(store, 'aaa-bbb')).not.toThrow();
  });
});
