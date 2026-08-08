/** Exportação de relatórios CSV */

export function buildTransactionsCsv(txs, accounts, { from, to } = {}) {
  const rows = [['data', 'descricao', 'tipo', 'valor', 'conta']];
  txs.filter(t => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  }).forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    rows.push([t.date, t.desc, t.type, Number(t.amount).toFixed(2), acc ? acc.name : '']);
  });
  return rows;
}

export function buildAccountsCsv(accounts) {
  const rows = [['nome', 'banco', 'saldo']];
  accounts.forEach(acc => {
    rows.push([acc.name, acc.bank, Number(acc.balance).toFixed(2)]);
  });
  return rows;
}

export function buildDRECsv(dre) {
  const rows = [['item', 'valor']];
  rows.push(['Receita bruta', dre.revenue.toFixed(2)]);
  rows.push(['Despesas operacionais', dre.expenses.toFixed(2)]);
  rows.push(['Resultado líquido', dre.net.toFixed(2)]);
  rows.push(['Margem líquida (%)', dre.margin]);
  dre.byCategory.forEach(([name, val]) => rows.push([`Despesa: ${name}`, val.toFixed(2)]));
  return rows;
}
