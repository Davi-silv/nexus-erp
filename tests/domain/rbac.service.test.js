import { describe, it, expect } from 'vitest';
import {
  ROLES,
  MODULES,
  ACTIONS,
  can,
  canAccessView,
  normalizeRole
} from '../../src/domain/rbac.service.js';

describe('rbac.service', () => {
  it('OWNER tem acesso total', () => {
    expect(can(ROLES.OWNER, MODULES.USERS, ACTIONS.DELETE)).toBe(true);
  });

  it('VENDEDOR acessa CRM e clientes mas não financeiro', () => {
    expect(can(ROLES.VENDEDOR, MODULES.CRM, ACTIONS.CREATE)).toBe(true);
    expect(can(ROLES.VENDEDOR, MODULES.CUSTOMERS, ACTIONS.CREATE)).toBe(true);
    expect(can(ROLES.VENDEDOR, MODULES.FINANCIAL, ACTIONS.VIEW)).toBe(false);
    expect(can(ROLES.VENDEDOR, MODULES.SETTINGS, ACTIONS.VIEW)).toBe(false);
  });

  it('CONTADOR vê relatórios e fiscal sem editar CRM', () => {
    expect(can(ROLES.CONTADOR, MODULES.REPORTS, ACTIONS.VIEW)).toBe(true);
    expect(can(ROLES.CONTADOR, MODULES.FISCAL, ACTIONS.VIEW)).toBe(true);
    expect(can(ROLES.CONTADOR, MODULES.CRM, ACTIONS.EDIT)).toBe(false);
    expect(can(ROLES.CONTADOR, MODULES.CRM, ACTIONS.VIEW)).toBe(true);
  });

  it('canAccessView bloqueia config fiscal para vendedor', () => {
    expect(canAccessView(ROLES.VENDEDOR, 'crm')).toBe(true);
    expect(canAccessView(ROLES.VENDEDOR, 'config-fiscal')).toBe(false);
    expect(canAccessView(ROLES.VENDEDOR, 'lancamentos')).toBe(false);
  });

  it('normalizeRole mapeia legado manager → commercial', () => {
    expect(normalizeRole('manager')).toBe(ROLES.COMERCIAL);
  });
});
