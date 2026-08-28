import { describe, it, expect } from 'vitest';
import { SubscriptionService } from '../../src/services/subscription.service.js';
import { TRIAL_DAYS, TRIAL_PLAN_SLUG } from '../../src/domain/features.js';

describe('SubscriptionService — modo local (dev/E2E)', () => {
  const svc = new SubscriptionService();

  it('modo local simula trial Pro ativo', async () => {
    const snap = await svc.load(null);
    expect(snap.is_active).toBe(true);
    expect(snap.is_trialing).toBe(true);
    expect(snap.effective_plan.slug).toBe(TRIAL_PLAN_SLUG);
  });

  it('canWrite habilitado sem Supabase', () => {
    expect(svc.isCloudEnforced()).toBe(false);
    expect(svc.canWrite()).toBe(true);
  });

  it('statusLabel indica teste grátis', async () => {
    await svc.load(null);
    expect(svc.statusLabel()).toContain('Teste grátis');
  });

  it('trialDays usa constante de 30 dias no snapshot local', async () => {
    const snap = await svc.load(null);
    expect(snap.trial_days_remaining).toBe(TRIAL_DAYS);
  });
});
