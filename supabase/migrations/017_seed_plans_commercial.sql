-- Nexus 3.0 — Seed comercial v2: preços, features completas, Pro recomendado

UPDATE public.plans SET
  name = 'Nexus Pessoal',
  description = 'Controle financeiro pessoal completo',
  price_monthly = 19.90,
  currency = 'BRL',
  recommended = FALSE,
  sort_order = 1
WHERE slug = 'personal';

UPDATE public.plans SET
  name = 'Nexus Start',
  description = 'Autônomos e MEIs — fluxo de caixa e operacional',
  price_monthly = 49.90,
  currency = 'BRL',
  recommended = FALSE,
  sort_order = 2
WHERE slug = 'start';

UPDATE public.plans SET
  name = 'Nexus Pro',
  description = 'MEIs e pequenas empresas — gestão financeira completa',
  price_monthly = 99.90,
  currency = 'BRL',
  recommended = TRUE,
  sort_order = 3
WHERE slug = 'pro';

UPDATE public.plans SET
  name = 'Nexus Business',
  description = 'Empresas em crescimento — escala e auditoria',
  price_monthly = 179.90,
  currency = 'BRL',
  recommended = FALSE,
  sort_order = 4
WHERE slug = 'business';

-- Remover features antigas (slug ai) e recriar padronizado
DELETE FROM public.plan_features
WHERE plan_id IN (SELECT id FROM public.plans WHERE slug IN ('personal', 'start', 'pro', 'business'));

-- personal
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 1),
  ('financial_accounts', TRUE, 3),
  ('ai_requests', TRUE, 10),
  ('accounts_payable', FALSE, NULL),
  ('accounts_receivable', FALSE, NULL),
  ('customers', FALSE, NULL),
  ('suppliers', FALSE, NULL),
  ('dre', FALSE, NULL),
  ('cost_centers', FALSE, NULL),
  ('advanced_reports', FALSE, NULL),
  ('cash_projection', FALSE, NULL),
  ('financial_score', TRUE, NULL),
  ('bank_reconciliation', FALSE, NULL),
  ('audit_logs', FALSE, NULL),
  ('advanced_permissions', FALSE, NULL),
  ('exports_pdf', FALSE, NULL),
  ('exports_xlsx', FALSE, NULL),
  ('exports_csv', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'personal';

-- start
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 1),
  ('financial_accounts', TRUE, 2),
  ('ai_requests', TRUE, 10),
  ('accounts_payable', TRUE, NULL),
  ('accounts_receivable', TRUE, NULL),
  ('customers', TRUE, NULL),
  ('suppliers', TRUE, NULL),
  ('dre', FALSE, NULL),
  ('cost_centers', FALSE, NULL),
  ('advanced_reports', FALSE, NULL),
  ('cash_projection', FALSE, NULL),
  ('financial_score', TRUE, NULL),
  ('bank_reconciliation', TRUE, NULL),
  ('audit_logs', FALSE, NULL),
  ('advanced_permissions', FALSE, NULL),
  ('exports_pdf', FALSE, NULL),
  ('exports_xlsx', FALSE, NULL),
  ('exports_csv', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'start';

-- pro
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 5),
  ('financial_accounts', TRUE, 10),
  ('ai_requests', TRUE, 100),
  ('accounts_payable', TRUE, NULL),
  ('accounts_receivable', TRUE, NULL),
  ('customers', TRUE, NULL),
  ('suppliers', TRUE, NULL),
  ('dre', TRUE, NULL),
  ('cost_centers', TRUE, NULL),
  ('advanced_reports', TRUE, NULL),
  ('cash_projection', TRUE, NULL),
  ('financial_score', TRUE, NULL),
  ('bank_reconciliation', TRUE, NULL),
  ('audit_logs', FALSE, NULL),
  ('advanced_permissions', TRUE, NULL),
  ('exports_pdf', TRUE, NULL),
  ('exports_xlsx', TRUE, NULL),
  ('exports_csv', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'pro';

-- business
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 20),
  ('financial_accounts', TRUE, 50),
  ('ai_requests', TRUE, 500),
  ('accounts_payable', TRUE, NULL),
  ('accounts_receivable', TRUE, NULL),
  ('customers', TRUE, NULL),
  ('suppliers', TRUE, NULL),
  ('dre', TRUE, NULL),
  ('cost_centers', TRUE, NULL),
  ('advanced_reports', TRUE, NULL),
  ('cash_projection', TRUE, NULL),
  ('financial_score', TRUE, NULL),
  ('bank_reconciliation', TRUE, NULL),
  ('audit_logs', TRUE, NULL),
  ('advanced_permissions', TRUE, NULL),
  ('exports_pdf', TRUE, NULL),
  ('exports_xlsx', TRUE, NULL),
  ('exports_csv', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'business';
