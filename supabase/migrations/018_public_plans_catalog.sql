-- Catálogo de planos visível sem login (página Planos + landing in-app)
GRANT EXECUTE ON FUNCTION public.list_plans_with_features() TO anon;
