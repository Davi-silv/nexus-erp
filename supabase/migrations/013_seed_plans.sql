-- Nexus 3.0 — Seed de planos e features

INSERT INTO public.plans (name, slug, description, price_monthly, active)
VALUES
  ('Nexus Personal', 'personal', 'Finanças pessoais', NULL, TRUE),
  ('Nexus Start', 'start', 'Autônomos e MEI', NULL, TRUE),
  ('Nexus Pro', 'pro', 'Pequenas empresas', NULL, TRUE),
  ('Nexus Business', 'business', 'Empresas em crescimento', NULL, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Features: personal
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 1),
  ('financial_accounts', TRUE, 3),
  ('ai', TRUE, 10),
  ('dre', FALSE, NULL),
  ('advanced_reports', FALSE, NULL),
  ('cost_centers', FALSE, NULL),
  ('cash_projection', FALSE, NULL),
  ('multi_company', FALSE, NULL),
  ('audit_logs', FALSE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'personal'
ON CONFLICT (plan_id, feature) DO NOTHING;

-- start
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 1),
  ('financial_accounts', TRUE, 2),
  ('ai', TRUE, 10),
  ('dre', FALSE, NULL),
  ('advanced_reports', FALSE, NULL),
  ('cost_centers', FALSE, NULL),
  ('cash_projection', FALSE, NULL),
  ('multi_company', FALSE, NULL),
  ('audit_logs', FALSE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'start'
ON CONFLICT (plan_id, feature) DO NOTHING;

-- pro
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 5),
  ('financial_accounts', TRUE, 10),
  ('ai', TRUE, 100),
  ('dre', TRUE, NULL),
  ('advanced_reports', TRUE, NULL),
  ('cost_centers', TRUE, NULL),
  ('cash_projection', TRUE, NULL),
  ('multi_company', FALSE, NULL),
  ('audit_logs', FALSE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'pro'
ON CONFLICT (plan_id, feature) DO NOTHING;

-- business
INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value
FROM public.plans p
CROSS JOIN (VALUES
  ('users', TRUE, 20),
  ('financial_accounts', TRUE, 50),
  ('ai', TRUE, 500),
  ('dre', TRUE, NULL),
  ('advanced_reports', TRUE, NULL),
  ('cost_centers', TRUE, NULL),
  ('cash_projection', TRUE, NULL),
  ('multi_company', TRUE, NULL),
  ('audit_logs', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'business'
ON CONFLICT (plan_id, feature) DO NOTHING;
