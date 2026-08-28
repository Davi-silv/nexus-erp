-- Nexus 3.0 — Features comerciais nos planos (serviços, orçamentos, NFS-e, PIX)

INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value::INTEGER
FROM public.plans p
CROSS JOIN (VALUES
  ('services', FALSE, NULL),
  ('quotes', FALSE, NULL),
  ('nfse', FALSE, NULL),
  ('pix_charges', FALSE, NULL),
  ('fiscal_reports', FALSE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'personal'
ON CONFLICT (plan_id, feature) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_value = EXCLUDED.limit_value;

INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value::INTEGER
FROM public.plans p
CROSS JOIN (VALUES
  ('services', TRUE, NULL),
  ('quotes', TRUE, NULL),
  ('nfse', TRUE, 5),
  ('pix_charges', TRUE, NULL),
  ('fiscal_reports', FALSE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'start'
ON CONFLICT (plan_id, feature) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_value = EXCLUDED.limit_value;

INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value::INTEGER
FROM public.plans p
CROSS JOIN (VALUES
  ('services', TRUE, NULL),
  ('quotes', TRUE, NULL),
  ('nfse', TRUE, 50),
  ('pix_charges', TRUE, NULL),
  ('fiscal_reports', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'pro'
ON CONFLICT (plan_id, feature) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_value = EXCLUDED.limit_value;

INSERT INTO public.plan_features (plan_id, feature, enabled, limit_value)
SELECT p.id, f.feature, f.enabled, f.limit_value::INTEGER
FROM public.plans p
CROSS JOIN (VALUES
  ('services', TRUE, NULL),
  ('quotes', TRUE, NULL),
  ('nfse', TRUE, 200),
  ('pix_charges', TRUE, NULL),
  ('fiscal_reports', TRUE, NULL)
) AS f(feature, enabled, limit_value)
WHERE p.slug = 'business'
ON CONFLICT (plan_id, feature) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_value = EXCLUDED.limit_value;
