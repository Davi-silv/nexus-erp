/**
 * Serviço de Análise IA — camada de aplicação (OpenAI-compatible APIs).
 * Separado da UI para testabilidade e reuso.
 */
import { fmtMoney, currentMonthKey } from '../core/utils.js';
import { STORAGE_KEYS } from '../core/constants.js';
import { localStore } from '../infrastructure/storage.js';

const DEFAULT_CONFIG = {
  apiKey: '',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  enabled: false
};

export function getConfig() {
  return { ...DEFAULT_CONFIG, ...localStore.get(STORAGE_KEYS.AI_CONFIG, {}) };
}

export function saveConfig(config) {
  localStore.set(STORAGE_KEYS.AI_CONFIG, { ...getConfig(), ...config });
}

export function getAnalysisHistory(userId) {
  return localStore.get(`${STORAGE_KEYS.userPrefix(userId)}aiHistory`, []);
}

export function saveAnalysisHistory(userId, entry) {
  const history = getAnalysisHistory(userId);
  history.unshift(entry);
  localStore.set(`${STORAGE_KEYS.userPrefix(userId)}aiHistory`, history.slice(0, 10));
}

function txsThisMonth(txs) {
  const month = currentMonthKey();
  return txs.filter(t => t.date?.startsWith(month));
}

export function buildContext(userData, healthMetrics, user = null) {
  if (!userData) return null;

  const profileType = user?.profileType === 'pj' ? 'pj' : 'pf';

  const monthTxs = txsThisMonth(userData.txs);
  const credits = monthTxs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const debits = monthTxs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const allCredits = userData.txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const allDebits = userData.txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

  const categoryBreakdown = userData.categories.map(cat => {
    const spent = userData.txs.filter(t => t.type === 'debit' && t.categoryId === cat.id).reduce((s, t) => s + Number(t.amount), 0);
    const goal = userData.goals.find(g => g.categoryId === cat.id);
    return { name: cat.name, spent, goal: goal?.limit ?? null, overBudget: goal ? spent > goal.limit : false };
  }).filter(c => c.spent > 0);

  const monthlyTrend = {};
  userData.txs.forEach(t => {
    const key = t.date?.slice(0, 7) ?? 'unknown';
    if (!monthlyTrend[key]) monthlyTrend[key] = { credit: 0, debit: 0 };
    if (t.type === 'credit') monthlyTrend[key].credit += Number(t.amount);
    else monthlyTrend[key].debit += Number(t.amount);
  });

  const cardCharges = userData.charges.reduce((acc, c) => {
    const card = userData.cards.find(ca => ca.id === c.cardId);
    const name = card ? card.name : 'Desconhecido';
    acc[name] = (acc[name] || 0) + Number(c.amount);
    return acc;
  }, {});

  const recurringTotal = userData.recurring
    .filter(r => r.active !== false)
    .reduce((s, r) => s + (r.type === 'debit' ? Number(r.amount) : 0), 0);

  return {
    period: currentMonthKey(),
    health: healthMetrics || { score: 0, savingsRate: 0, expenseRatio: 0 },
    month: { credits, debits, balance: credits - debits },
    totals: { credits: allCredits, debits: allDebits, balance: allCredits - allDebits },
    accounts: userData.accounts.map(a => ({ name: a.name, bank: a.bank, balance: a.balance })),
    transactionCount: userData.txs.length,
    recentTransactions: userData.txs.slice(-10).reverse().map(t => ({ date: t.date, desc: t.desc, type: t.type, amount: Number(t.amount) })),
    categories: categoryBreakdown,
    goals: userData.goals.map(g => {
      const cat = userData.categories.find(c => c.id === g.categoryId);
      const spent = userData.txs.filter(t => t.type === 'debit' && t.categoryId === g.categoryId).reduce((s, t) => s + Number(t.amount), 0);
      return { category: cat?.name ?? '?', limit: g.limit, spent, pct: Math.round((spent / g.limit) * 100) };
    }),
    monthlyTrend: Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b)).slice(-6),
    creditCards: { count: userData.cards.length, chargesByCard: cardCharges },
    recurringExpenses: recurringTotal,
    recurringCount: userData.recurring.length,
    profileType,
    company: user?.company || null,
    costCenters: (userData.costCenters || []).map(c => ({ code: c.code, name: c.name }))
  };
}

function buildSystemPrompt() {
  return `Você é um consultor financeiro especializado em finanças pessoais e empresariais no Brasil.
Analise os dados financeiros fornecidos e produza um relatório claro, prático e acionável em português brasileiro.

Estruture sua resposta EXATAMENTE nestas seções (use os títulos markdown):

## Resumo Executivo
## Pontos Positivos
## Riscos e Alertas
## Oportunidades de Economia
## Recomendações Prioritárias
## Projeção

Seja direto, use valores em R$ quando relevante. Não invente dados.`;
}

function buildUserPrompt(context) {
  return `Analise estes dados financeiros do Nexus ERP:

**Período:** ${context.period} | **Score:** ${context.health.score}/100
**Mês:** receitas ${fmtMoney(context.month.credits)}, despesas ${fmtMoney(context.month.debits)}
**Totais:** receitas ${fmtMoney(context.totals.credits)}, despesas ${fmtMoney(context.totals.debits)}
**Contas:** ${context.accounts.map(a => `${a.name}: ${fmtMoney(a.balance)}`).join(', ') || 'nenhuma'}
**Categorias:** ${context.categories.map(c => `${c.name}: ${fmtMoney(c.spent)}`).join(', ') || 'nenhuma'}
**Cartões:** ${context.creditCards.count} | **Recorrentes:** ${fmtMoney(context.recurringExpenses)}/mês`;
}

export async function analyzeWithAI(context, config = getConfig()) {
  if (!config.apiKey) throw new Error('Configure sua chave de API para usar a análise com IA.');

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(context) }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Resposta vazia da IA.');
  return content;
}

export async function chatWithAI(context, question, config = getConfig()) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'Você é um consultor financeiro brasileiro. Responda de forma concisa em português.' },
        { role: 'user', content: `Contexto:\n${JSON.stringify(context, null, 2)}\n\nPergunta: ${question}` }
      ],
      temperature: 0.7,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Sem resposta.';
}

export function analyzeLocal(context) {
  const h = context.health;
  const lines = ['## Resumo Executivo\n'];

  if (context.transactionCount === 0) {
    lines.push('Registre receitas e despesas para obter análise completa.\n');
  } else if (h.score >= 80) {
    lines.push(`Saúde financeira **excelente** (${h.score}/100).\n`);
  } else if (h.score >= 50) {
    lines.push(`Situação **moderada** (${h.score}/100). Saldo: ${fmtMoney(context.month.balance)}.\n`);
  } else {
    lines.push(`Atenção necessária (${h.score}/100). Despesas: ${h.expenseRatio}% das receitas.\n`);
  }

  lines.push('## Pontos Positivos\n');
  if (h.savingsRate >= 20) lines.push(`- Taxa de poupança: ${h.savingsRate}%`);
  if (context.month.balance > 0) lines.push(`- Saldo positivo: ${fmtMoney(context.month.balance)}`);
  if (context.goals.length) lines.push(`- ${context.goals.length} meta(s) definida(s)`);
  lines.push('');

  lines.push('## Riscos e Alertas\n');
  if (h.savingsRate < 10) lines.push('- Poupança abaixo de 10%');
  if (h.expenseRatio > 80) lines.push(`- Despesas em ${h.expenseRatio}%`);
  context.categories.filter(c => c.overBudget).forEach(c => lines.push(`- "${c.name}" acima da meta`));
  lines.push('');

  lines.push('## Recomendações Prioritárias\n');
  lines.push('1. Revise lançamentos semanalmente');
  if (!context.goals.length) lines.push('2. Defina metas por categoria');
  lines.push('\n---\n*Análise local. Configure API para análise com IA.*');

  return lines.join('\n');
}

export function renderMarkdown(text) {
  return text
    .replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="ai-rec"><span class="ai-rec-num">$1</span><span>$2</span></div>')
    .replace(/^- (.+)$/gm, '<div class="ai-bullet">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
