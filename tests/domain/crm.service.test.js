import { describe, it, expect } from 'vitest';
import {
  calculateCrmMetrics,
  findMatchingCustomer,
  probabilityForStage
} from '../../src/domain/crm.service.js';

const stages = [
  { id: 's1', slug: 'new_lead', is_closed_won: false, is_closed_lost: false },
  { id: 's2', slug: 'negotiation', is_closed_won: false, is_closed_lost: false },
  { id: 's3', slug: 'closed_won', is_closed_won: true, is_closed_lost: false },
  { id: 's4', slug: 'closed_lost', is_closed_won: false, is_closed_lost: true }
];

describe('crm.service', () => {
  it('calcula métricas do pipeline', () => {
    const opps = [
      { stage_id: 's1', estimated_value: 1000, lead_source: 'website' },
      { stage_id: 's2', estimated_value: 5000, lead_source: 'referral' },
      { stage_id: 's3', estimated_value: 8000, lead_source: 'website' },
      { stage_id: 's4', estimated_value: 2000, lead_source: 'google' }
    ];
    const m = calculateCrmMetrics(opps, stages);
    expect(m.pipelineTotal).toBe(6000);
    expect(m.negotiationTotal).toBe(5000);
    expect(m.closedWonTotal).toBe(8000);
    expect(m.conversionRate).toBe(50);
    expect(m.avgTicket).toBe(8000);
    expect(m.lostCount).toBe(1);
  });

  it('probabilityForStage retorna valores corretos', () => {
    expect(probabilityForStage({ slug: 'negotiation', is_closed_won: false, is_closed_lost: false })).toBe(80);
    expect(probabilityForStage({ is_closed_won: true, is_closed_lost: false })).toBe(100);
  });

  it('findMatchingCustomer evita duplicidade por e-mail', () => {
    const customers = [{ id: 'c1', email: 'a@test.com', phone: null, whatsapp: null }];
    const match = findMatchingCustomer(customers, { email: 'a@test.com', phone: null, whatsapp: null });
    expect(match?.id).toBe('c1');
  });
});
