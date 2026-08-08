/**
 * Módulo de análise financeira com IA para o Nexus ERP.
 * Suporta APIs compatíveis com OpenAI (OpenAI, Groq, Together, etc.)
 */
window.NexusAI = (() => {
  const CONFIG_KEY = 'nexus:ai-config';
  const HISTORY_KEY_PREFIX = 'nexus:user:';

  const DEFAULT_CONFIG = {
    apiKey: '',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    enabled: false
  };

  function getConfig() {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...getConfig(), ...config }));
  }

  function getAnalysisHistory(userId) {
    return JSON.parse(localStorage.getItem(`${HISTORY_KEY_PREFIX}${userId}:aiHistory`) || '[]');
  }

  function saveAnalysisHistory(userId, entry) {
    const history = getAnalysisHistory(userId);
    history.unshift(entry);
    localStorage.setItem(`${HISTORY_KEY_PREFIX}${userId}:aiHistory`, JSON.stringify(history.slice(0, 10)));
  }

  function fmtMoney(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function txsThisMonth(txs) {
    const month = currentMonthKey();
    return txs.filter(t => t.date && t.date.startsWith(month));
  }

  function buildContext(userData, healthMetrics) {
    if (!userData) return null;

    const monthTxs = txsThisMonth(userData.txs);
    const credits = monthTxs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const debits = monthTxs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

    const allCredits = userData.txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const allDebits = userData.txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);

    const categoryBreakdown = userData.categories.map(cat => {
      const spent = userData.txs
        .filter(t => t.type === 'debit' && t.categoryId === cat.id)
        .reduce((s, t) => s + Number(t.amount), 0);
      const goal = userData.goals.find(g => g.categoryId === cat.id);
      return {
        name: cat.name,
        spent,
        goal: goal ? goal.limit : null,
        overBudget: goal ? spent > goal.limit : false
      };
    }).filter(c => c.spent > 0);

    const monthlyTrend = {};
    userData.txs.forEach(t => {
      const key = t.date ? t.date.slice(0, 7) : 'unknown';
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
      recentTransactions: userData.txs.slice(-10).reverse().map(t => ({
        date: t.date,
        desc: t.desc,
        type: t.type,
        amount: Number(t.amount)
      })),
      categories: categoryBreakdown,
      goals: userData.goals.map(g => {
        const cat = userData.categories.find(c => c.id === g.categoryId);
        const spent = userData.txs
          .filter(t => t.type === 'debit' && t.categoryId === g.categoryId)
          .reduce((s, t) => s + Number(t.amount), 0);
        return { category: cat ? cat.name : '?', limit: g.limit, spent, pct: Math.round((spent / g.limit) * 100) };
      }),
      monthlyTrend: Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b)).slice(-6),
      creditCards: { count: userData.cards.length, chargesByCard: cardCharges },
      recurringExpenses: recurringTotal,
      recurringCount: userData.recurring.length
    };
  }

  function buildSystemPrompt() {
    return `Você é um consultor financeiro especializado em finanças pessoais e empresariais no Brasil.
Analise os dados financeiros fornecidos e produza um relatório claro, prático e acionável em português brasileiro.

Estruture sua resposta EXATAMENTE nestas seções (use os títulos markdown):

## Resumo Executivo
(2-3 frases sobre a situação geral)

## Pontos Positivos
(lista com bullet points)

## Riscos e Alertas
(lista com bullet points)

## Oportunidades de Economia
(lista com bullet points e valores estimados quando possível)

## Recomendações Prioritárias
(lista numerada com ações concretas para os próximos 30 dias)

## Projeção
(breve outlook para o próximo mês baseado nas tendências)

Seja direto, use valores em R$ quando relevante, e adapte o tom ao score de saúde financeira.
Não invente dados que não foram fornecidos.`;
  }

  function buildUserPrompt(context) {
    return `Analise estes dados financeiros do Nexus ERP:

**Período de referência:** ${context.period}
**Score de saúde financeira:** ${context.health.score}/100
**Taxa de poupança:** ${context.health.savingsRate}%
**Índice de despesa:** ${context.health.expenseRatio}%

**Mês atual:**
- Receitas: ${fmtMoney(context.month.credits)}
- Despesas: ${fmtMoney(context.month.debits)}
- Saldo: ${fmtMoney(context.month.balance)}

**Totais acumulados:**
- Receitas: ${fmtMoney(context.totals.credits)}
- Despesas: ${fmtMoney(context.totals.debits)}
- Saldo: ${fmtMoney(context.totals.balance)}

**Contas (${context.accounts.length}):**
${context.accounts.map(a => `- ${a.name} (${a.bank}): ${fmtMoney(a.balance)}`).join('\n') || '- Nenhuma conta cadastrada'}

**Lançamentos:** ${context.transactionCount} total

**Gastos por categoria:**
${context.categories.map(c => `- ${c.name}: ${fmtMoney(c.spent)}${c.goal ? ` (meta: ${fmtMoney(c.goal)}${c.overBudget ? ' — ACIMA DA META' : ''})` : ''}`).join('\n') || '- Sem categorias com gastos'}

**Metas orçamentárias:**
${context.goals.map(g => `- ${g.category}: ${fmtMoney(g.spent)} / ${fmtMoney(g.limit)} (${g.pct}%)`).join('\n') || '- Nenhuma meta definida'}

**Tendência mensal (últimos meses):**
${context.monthlyTrend.map(([m, d]) => `- ${m}: receitas ${fmtMoney(d.credit)}, despesas ${fmtMoney(d.debit)}`).join('\n') || '- Sem histórico'}

**Cartões de crédito:** ${context.creditCards.count} cadastrados
${Object.entries(context.creditCards.chargesByCard).map(([k, v]) => `- ${k}: ${fmtMoney(v)} em encargos`).join('\n') || '- Sem encargos registrados'}

**Despesas recorrentes:** ${fmtMoney(context.recurringExpenses)}/mês (${context.recurringCount} recorrências)

**Últimas movimentações:**
${context.recentTransactions.map(t => `- ${t.date}: ${t.desc} (${t.type === 'credit' ? '+' : '-'}${fmtMoney(t.amount)})`).join('\n') || '- Sem movimentações'}`;
  }

  async function analyzeWithAI(context, config) {
    if (!config.apiKey) {
      throw new Error('Configure sua chave de API para usar a análise com IA.');
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
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
      const msg = err.error?.message || `Erro HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da IA.');
    return content;
  }

  function analyzeLocal(context) {
    const lines = [];
    const h = context.health;

    lines.push('## Resumo Executivo\n');
    if (context.transactionCount === 0) {
      lines.push('Você ainda não possui lançamentos registrados. Comece registrando receitas e despesas para obter uma análise completa.\n');
    } else if (h.score >= 80) {
      lines.push(`Sua saúde financeira está **excelente** (score ${h.score}/100). Receitas de ${fmtMoney(context.month.credits)} e despesas de ${fmtMoney(context.month.debits)} no mês atual.\n`);
    } else if (h.score >= 50) {
      lines.push(`Situação **moderada** (score ${h.score}/100). Há espaço para otimização. Saldo mensal: ${fmtMoney(context.month.balance)}.\n`);
    } else {
      lines.push(`Atenção necessária (score ${h.score}/100). Despesas representam ${h.expenseRatio}% das receitas.\n`);
    }

    lines.push('## Pontos Positivos\n');
    const positives = [];
    if (h.savingsRate >= 20) positives.push(`Taxa de poupança saudável de ${h.savingsRate}%`);
    if (context.month.balance > 0) positives.push(`Saldo positivo no mês: ${fmtMoney(context.month.balance)}`);
    if (context.goals.length > 0) positives.push(`${context.goals.length} meta(s) orçamentária(s) definida(s)`);
    if (context.accounts.length > 1) positives.push('Diversificação entre múltiplas contas');
    if (positives.length === 0) positives.push('Você está usando o sistema para organizar suas finanças');
    positives.forEach(p => lines.push(`- ${p}`));
    lines.push('');

    lines.push('## Riscos e Alertas\n');
    const risks = [];
    if (h.savingsRate < 10) risks.push('Taxa de poupança abaixo do recomendado (10%)');
    if (h.expenseRatio > 80) risks.push(`Despesas consomem ${h.expenseRatio}% das receitas`);
    context.categories.filter(c => c.overBudget).forEach(c => {
      risks.push(`Categoria "${c.name}" acima da meta (${fmtMoney(c.spent)})`);
    });
    if (context.month.balance < 0) risks.push(`Saldo negativo no mês: ${fmtMoney(context.month.balance)}`);
    if (Object.keys(context.creditCards.chargesByCard).length > 0) {
      const totalCharges = Object.values(context.creditCards.chargesByCard).reduce((s, v) => s + v, 0);
      risks.push(`Encargos de cartão acumulados: ${fmtMoney(totalCharges)}`);
    }
    if (risks.length === 0) risks.push('Nenhum risco crítico identificado no momento');
    risks.forEach(r => lines.push(`- ${r}`));
    lines.push('');

    lines.push('## Oportunidades de Economia\n');
    const savings = [];
    const topCategory = [...context.categories].sort((a, b) => b.spent - a.spent)[0];
    if (topCategory) savings.push(`Maior gasto em "${topCategory.name}" (${fmtMoney(topCategory.spent)}) — revise esta categoria`);
    if (context.recurringExpenses > 0) savings.push(`Despesas recorrentes de ${fmtMoney(context.recurringExpenses)}/mês — avalie cancelamentos`);
    Object.entries(context.creditCards.chargesByCard).forEach(([card, amount]) => {
      if (amount > 50) savings.push(`Cartão ${card}: ${fmtMoney(amount)} em encargos — considere negociar ou trocar`);
    });
    if (savings.length === 0) savings.push('Mantenha o registro detalhado para identificar oportunidades');
    savings.forEach(s => lines.push(`- ${s}`));
    lines.push('');

    lines.push('## Recomendações Prioritárias\n');
    const recs = [];
    if (context.transactionCount < 5) recs.push('Registre pelo menos 2 semanas de lançamentos para análise precisa');
    if (context.goals.length === 0) recs.push('Defina metas por categoria em "Categorias & Metas"');
    if (h.savingsRate < 15) recs.push('Estabeleça meta de poupar 15% das receitas mensais');
    if (context.categories.length === 0) recs.push('Categorize seus lançamentos para visibilidade dos gastos');
    recs.push('Revise lançamentos semanalmente e ajuste metas conforme necessário');
    recs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');

    lines.push('## Projeção\n');
    if (context.monthlyTrend.length >= 2) {
      const last = context.monthlyTrend[context.monthlyTrend.length - 1][1];
      const prev = context.monthlyTrend[context.monthlyTrend.length - 2][1];
      const debitTrend = last.debit - prev.debit;
      if (debitTrend > 0) {
        lines.push(`Tendência de **aumento** nas despesas (+${fmtMoney(debitTrend)} vs mês anterior). Monitore de perto.\n`);
      } else {
        lines.push(`Tendência de **redução** nas despesas (${fmtMoney(Math.abs(debitTrend))} a menos vs mês anterior). Continue assim.\n`);
      }
    } else {
      lines.push('Dados insuficientes para projeção. Continue registrando por mais 1-2 meses.\n');
    }

    lines.push('\n---\n*Análise gerada localmente. Configure uma chave de API OpenAI para análise aprofundada com IA.*');

    return lines.join('\n');
  }

  function renderMarkdown(text) {
    return text
      .replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
      .replace(/^(\d+)\. (.+)$/gm, '<div class="ai-rec"><span class="ai-rec-num">$1</span><span>$2</span></div>')
      .replace(/^- (.+)$/gm, '<div class="ai-bullet">$1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  return {
    getConfig,
    saveConfig,
    buildContext,
    analyzeWithAI,
    analyzeLocal,
    renderMarkdown,
    getAnalysisHistory,
    saveAnalysisHistory
  };
})();
