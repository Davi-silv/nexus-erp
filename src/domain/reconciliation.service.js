/** Serviço de conciliação bancária — lógica pura */

export function parseStatementCSV(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/,|;/).map(part => part.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) return null;
    const date = parts[0];
    const amount = parseFloat(parts[1].replace(',', '.')) || 0;
    const desc = parts.slice(2).join(' ');
    return { date, amount, desc };
  }).filter(Boolean);
}

export function reconcileStatement(parsed, txs) {
  return parsed.map(stmt => {
    const found = txs.find(tx =>
      Math.abs(tx.amount - stmt.amount) < 0.001 && tx.date === stmt.date
    );
    return { stmt, tx: found || null };
  });
}
