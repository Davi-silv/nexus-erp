-- Nexus 3.0 — Views financeiras (SECURITY INVOKER — respeitam RLS)

CREATE OR REPLACE VIEW public.monthly_cash_flow
WITH (security_invoker = true)
AS
SELECT
  t.workspace_id,
  date_trunc('month', t.transaction_date)::DATE AS month,
  SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS total_expense,
  SUM(CASE
    WHEN t.type = 'income' THEN t.amount
    WHEN t.type = 'expense' THEN -t.amount
    ELSE 0
  END) AS net_cash_flow
FROM public.transactions t
WHERE t.deleted_at IS NULL
  AND t.status = 'completed'
  AND t.type IN ('income', 'expense')
GROUP BY t.workspace_id, date_trunc('month', t.transaction_date);

CREATE OR REPLACE VIEW public.workspace_balances
WITH (security_invoker = true)
AS
SELECT
  fa.workspace_id,
  fa.id AS financial_account_id,
  fa.name,
  fa.type,
  fa.currency,
  fa.initial_balance,
  fa.current_balance,
  fa.active
FROM public.financial_accounts fa
WHERE fa.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.accounts_payable_summary
WITH (security_invoker = true)
AS
SELECT
  ap.workspace_id,
  public.effective_payable_status(ap.due_date, ap.status, ap.paid_amount, ap.amount) AS effective_status,
  COUNT(*) AS item_count,
  SUM(ap.amount) AS total_amount,
  SUM(ap.paid_amount) AS total_paid,
  SUM(ap.amount - ap.paid_amount) AS total_open
FROM public.accounts_payable ap
WHERE ap.deleted_at IS NULL
  AND ap.status <> 'cancelled'
GROUP BY ap.workspace_id,
  public.effective_payable_status(ap.due_date, ap.status, ap.paid_amount, ap.amount);

CREATE OR REPLACE VIEW public.accounts_receivable_summary
WITH (security_invoker = true)
AS
SELECT
  ar.workspace_id,
  public.effective_receivable_status(ar.due_date, ar.status, ar.received_amount, ar.amount) AS effective_status,
  COUNT(*) AS item_count,
  SUM(ar.amount) AS total_amount,
  SUM(ar.received_amount) AS total_received,
  SUM(ar.amount - ar.received_amount) AS total_open
FROM public.accounts_receivable ar
WHERE ar.deleted_at IS NULL
  AND ar.status <> 'cancelled'
GROUP BY ar.workspace_id,
  public.effective_receivable_status(ar.due_date, ar.status, ar.received_amount, ar.amount);

CREATE OR REPLACE VIEW public.dre_summary
WITH (security_invoker = true)
AS
SELECT
  t.workspace_id,
  date_trunc('month', t.transaction_date)::DATE AS month,
  COALESCE(c.dre_group, 'other') AS dre_group,
  SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS revenue,
  SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS expense
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL
  AND t.status = 'completed'
  AND t.type IN ('income', 'expense')
GROUP BY t.workspace_id, date_trunc('month', t.transaction_date), COALESCE(c.dre_group, 'other');

COMMENT ON VIEW public.dre_summary IS
  'DRE derivada — transferências excluídas por design.';

GRANT SELECT ON public.monthly_cash_flow TO authenticated;
GRANT SELECT ON public.workspace_balances TO authenticated;
GRANT SELECT ON public.accounts_payable_summary TO authenticated;
GRANT SELECT ON public.accounts_receivable_summary TO authenticated;
GRANT SELECT ON public.dre_summary TO authenticated;
