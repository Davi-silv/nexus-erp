/** CRM — pipeline e métricas (lógica pura) */

export const STAGE_DEFAULT_PROBABILITY = {
  new_lead: 10,
  contact_made: 20,
  qualified: 40,
  meeting: 50,
  proposal_sent: 60,
  negotiation: 80,
  closed_won: 100,
  closed_lost: 0
};

export const LEAD_SOURCES = [
  { value: 'website', label: 'Site' },
  { value: 'referral', label: 'Indicação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'event', label: 'Evento' },
  { value: 'cold_call', label: 'Prospecção ativa' },
  { value: 'other', label: 'Outro' }
];

export const ACTIVITY_TYPES = [
  { value: 'call', label: 'Ligação' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'note', label: 'Observação' }
];

export function probabilityForStage(stage) {
  if (!stage) return 10;
  if (stage.is_closed_won) return 100;
  if (stage.is_closed_lost) return 0;
  return STAGE_DEFAULT_PROBABILITY[stage.slug] ?? 10;
}

export function stageById(stages, id) {
  return stages.find(s => s.id === id) || null;
}

export function isOpenOpportunity(opp, stages) {
  const stage = stageById(stages, opp.stage_id);
  return stage && !stage.is_closed_won && !stage.is_closed_lost;
}

export function calculateCrmMetrics(opportunities, stages) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));
  let pipelineTotal = 0;
  let negotiationTotal = 0;
  let closedWonTotal = 0;
  let closedWonCount = 0;
  let lostCount = 0;
  let lostTotal = 0;
  const sources = {};

  opportunities.forEach(opp => {
    const stage = stageMap[opp.stage_id];
    if (!stage) return;
    const value = Number(opp.estimated_value || 0);
    const source = opp.lead_source || 'other';
    sources[source] = (sources[source] || 0) + 1;

    if (stage.is_closed_won) {
      closedWonTotal += value;
      closedWonCount++;
      return;
    }
    if (stage.is_closed_lost) {
      lostCount++;
      lostTotal += value;
      return;
    }
    pipelineTotal += value;
    if (stage.slug === 'negotiation') negotiationTotal += value;
  });

  const closedTotal = closedWonCount + lostCount;
  const conversionRate = closedTotal > 0 ? Math.round((closedWonCount / closedTotal) * 100) : 0;
  const avgTicket = closedWonCount > 0 ? closedWonTotal / closedWonCount : 0;

  const topSources = Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ source: key, count }));

  return {
    pipelineTotal,
    negotiationTotal,
    closedWonTotal,
    closedWonCount,
    conversionRate,
    avgTicket,
    lostCount,
    lostTotal,
    topSources
  };
}

export function findMatchingCustomer(customers, { email, phone, whatsapp }) {
  if (!customers?.length) return null;
  const norm = v => String(v || '').replace(/\D/g, '');
  return customers.find(c => {
    if (email && c.email && c.email.toLowerCase() === email.toLowerCase()) return true;
    const cPhone = norm(c.phone);
    const cWa = norm(c.whatsapp);
    const p = norm(phone);
    const w = norm(whatsapp);
    if (p && (cPhone === p || cWa === p)) return true;
    if (w && (cPhone === w || cWa === w)) return true;
    return false;
  }) || null;
}

export function activityIcon(type) {
  const icons = {
    stage_change: '↔',
    call: '📞',
    meeting: '📅',
    whatsapp: '💬',
    email: '✉',
    note: '📝'
  };
  return icons[type] || '•';
}
