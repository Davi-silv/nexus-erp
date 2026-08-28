-- Nexus 3.0 — Clientes e fornecedores
-- v2: counterparty em txs PJ — agora entidades dedicadas

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  person_type TEXT,
  document TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_person_type_check CHECK (
    person_type IS NULL OR person_type IN ('individual', 'company')
  )
);

CREATE INDEX idx_customers_workspace_id ON public.customers (workspace_id);
CREATE INDEX idx_customers_name ON public.customers (workspace_id, name);
CREATE INDEX idx_customers_document ON public.customers (workspace_id, document);
CREATE UNIQUE INDEX idx_customers_workspace_document_unique
  ON public.customers (workspace_id, document)
  WHERE document IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  category TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_workspace_id ON public.suppliers (workspace_id);
CREATE INDEX idx_suppliers_name ON public.suppliers (workspace_id, name);
CREATE INDEX idx_suppliers_document ON public.suppliers (workspace_id, document);
CREATE UNIQUE INDEX idx_suppliers_workspace_document_unique
  ON public.suppliers (workspace_id, document)
  WHERE document IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FKs adiadas em transactions (criadas após customers/suppliers)
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE SET NULL,
  ADD CONSTRAINT transactions_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE SET NULL;
