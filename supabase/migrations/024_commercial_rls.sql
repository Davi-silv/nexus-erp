-- Nexus 3.0 — RLS módulo comercial (serviços, orçamentos, fiscal, PIX)

CREATE OR REPLACE FUNCTION public.can_write_fiscal(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_workspace_role(
    p_workspace_id,
    ARRAY['owner', 'admin', 'financial', 'accountant']
  );
$$;

-- services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY services_write ON public.services FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- quotes
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id) AND deleted_at IS NULL);
CREATE POLICY quotes_write ON public.quotes FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_items_select ON public.quote_items FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY quote_items_write ON public.quote_items FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

-- fiscal_settings
ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_settings_select ON public.fiscal_settings FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY fiscal_settings_write ON public.fiscal_settings FOR ALL TO authenticated
  USING (public.can_write_fiscal(workspace_id))
  WITH CHECK (public.can_write_fiscal(workspace_id));

-- fiscal_invoices
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_invoices_select ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY fiscal_invoices_write ON public.fiscal_invoices FOR ALL TO authenticated
  USING (public.can_write_fiscal(workspace_id))
  WITH CHECK (public.can_write_fiscal(workspace_id));

-- fiscal_invoice_events
ALTER TABLE public.fiscal_invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_invoice_events_select ON public.fiscal_invoice_events FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY fiscal_invoice_events_insert ON public.fiscal_invoice_events FOR INSERT TO authenticated
  WITH CHECK (public.can_write_fiscal(workspace_id));

-- payment_charges
ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_charges_select ON public.payment_charges FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY payment_charges_write ON public.payment_charges FOR ALL TO authenticated
  USING (public.can_write_financial(workspace_id))
  WITH CHECK (public.can_write_financial(workspace_id));

GRANT EXECUTE ON FUNCTION public.can_write_fiscal(UUID) TO authenticated;
