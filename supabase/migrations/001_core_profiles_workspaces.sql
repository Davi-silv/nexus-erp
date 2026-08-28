-- Nexus 3.0 — Core: profiles, workspaces, workspace_members
-- Análise v2: dados em localStorage (nexus:users, nexus:user:{id}:*)
-- Nenhuma tabela PostgreSQL pré-existente neste repositório.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  'Atualiza updated_at automaticamente em UPDATE.';

-- ---------------------------------------------------------------------------
-- profiles (espelha auth.users do Supabase Auth)
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_onboarding_step_positive CHECK (onboarding_step >= 1)
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.profiles IS
  'Perfil público do usuário autenticado. Senhas ficam apenas em auth.users.';

-- Auto-criar profile ao registrar usuário no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- workspaces (tenant principal — substitui user/company isolado do v2)
-- ---------------------------------------------------------------------------

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  document TEXT,
  business_segment TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspaces_type_check CHECK (
    type IN ('personal', 'freelancer', 'mei', 'business')
  ),
  CONSTRAINT workspaces_currency_len CHECK (char_length(currency) = 3)
);

CREATE INDEX idx_workspaces_owner_id ON public.workspaces (owner_id);
CREATE INDEX idx_workspaces_type ON public.workspaces (type);
CREATE INDEX idx_workspaces_active ON public.workspaces (active) WHERE active = TRUE;

CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.workspaces IS
  'Tenant multi-empresa. v2 profileType pf→personal, pj→business/mei.';

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_members_role_check CHECK (
    role IN ('owner', 'admin', 'financial', 'manager', 'accountant', 'viewer')
  ),
  CONSTRAINT workspace_members_unique_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members (workspace_id);
CREATE INDEX idx_workspace_members_user_id ON public.workspace_members (user_id);
CREATE INDEX idx_workspace_members_workspace_user ON public.workspace_members (workspace_id, user_id);
CREATE INDEX idx_workspace_members_role ON public.workspace_members (workspace_id, role);

COMMENT ON TABLE public.workspace_members IS
  'v2 role admin/user mapeia para owner/admin/financial conforme contexto.';

-- ---------------------------------------------------------------------------
-- Mapeamento de migração localStorage v2 → UUID (preservação de dados)
-- ---------------------------------------------------------------------------

CREATE TABLE public.legacy_migration_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  new_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT legacy_migration_map_unique UNIQUE (workspace_id, entity_type, legacy_id)
);

CREATE INDEX idx_legacy_migration_map_workspace ON public.legacy_migration_map (workspace_id);
CREATE INDEX idx_legacy_migration_map_lookup ON public.legacy_migration_map (workspace_id, entity_type, legacy_id);

COMMENT ON TABLE public.legacy_migration_map IS
  'Rastreia IDs numéricos/string do localStorage v2 para UUIDs do Nexus 3.0.';
