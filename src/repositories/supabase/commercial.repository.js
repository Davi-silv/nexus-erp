import { getSupabaseClient } from '../../infrastructure/supabase.client.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';

export class CommercialRepository {
  #client = isSupabaseEnabled ? getSupabaseClient() : null;

  #requireClient() {
    if (!this.#client) throw new Error('Módulo comercial requer Supabase (modo cloud).');
    return this.#client;
  }

  async listCustomers(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('customers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async upsertCustomer(row) {
    const { data, error } = await this.#requireClient()
      .from('customers')
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listServices(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('services')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async upsertService(row) {
    const { data, error } = await this.#requireClient()
      .from('services')
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteService(id) {
    const { error } = await this.#requireClient()
      .from('services')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('id', id);
    if (error) throw error;
  }

  async listQuotes(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('quotes')
      .select('*, customers(name, document)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getQuote(quoteId) {
    const { data, error } = await this.#requireClient()
      .from('quotes')
      .select('*, customers(*), quote_items(*)')
      .eq('id', quoteId)
      .single();
    if (error) throw error;
    return data;
  }

  async createQuote(workspaceId, payload) {
    const { data: number } = await this.#requireClient().rpc('next_quote_number', {
      p_workspace_id: workspaceId
    });
    const { data, error } = await this.#requireClient()
      .from('quotes')
      .insert({ ...payload, workspace_id: workspaceId, number: number })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async addQuoteItem(item) {
    const { data, error } = await this.#requireClient()
      .from('quote_items')
      .insert(item)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async setQuoteStatus(quoteId, status) {
    const { data, error } = await this.#requireClient().rpc('set_quote_status', {
      p_quote_id: quoteId,
      p_status: status
    });
    if (error) throw error;
    return data;
  }

  async generateReceivableFromQuote(quoteId) {
    const { data, error } = await this.#requireClient().rpc('generate_receivable_from_quote', {
      p_quote_id: quoteId
    });
    if (error) throw error;
    return data;
  }

  async listReceivables(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('accounts_receivable')
      .select('*, customers(name, document, email)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('due_date');
    if (error) throw error;
    return data || [];
  }

  async createPixCharge(receivableId, idempotencyKey) {
    const { data, error } = await this.#requireClient().rpc('create_pix_charge', {
      p_receivable_id: receivableId,
      p_idempotency_key: idempotencyKey || null
    });
    if (error) throw error;
    return data;
  }

  async getFiscalSettings(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('fiscal_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsertFiscalSettings(row) {
    const { data, error } = await this.#requireClient()
      .from('fiscal_settings')
      .upsert(row, { onConflict: 'workspace_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listFiscalInvoices(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('fiscal_invoices')
      .select('*, customers(name, document)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async requestFiscalInvoice(workspaceId, receivableId, description) {
    const { data, error } = await this.#requireClient().rpc('request_fiscal_invoice', {
      p_workspace_id: workspaceId,
      p_receivable_id: receivableId,
      p_service_description: description || null,
      p_idempotency_key: null
    });
    if (error) throw error;
    return data;
  }

  async getCommercialSummary(workspaceId) {
    const client = this.#requireClient();
    const [quotes, receivables, invoices] = await Promise.all([
      client.from('quotes').select('status, total').eq('workspace_id', workspaceId).is('deleted_at', null),
      client.from('accounts_receivable').select('status, amount, received_amount').eq('workspace_id', workspaceId).is('deleted_at', null),
      client.from('fiscal_invoices').select('status, gross_amount, issued_at').eq('workspace_id', workspaceId)
    ]);
    if (quotes.error) throw quotes.error;
    if (receivables.error) throw receivables.error;
    if (invoices.error) throw invoices.error;

    const q = quotes.data || [];
    const r = receivables.data || [];
    const inv = invoices.data || [];
    const monthStart = new Date();
    monthStart.setDate(1);

    return {
      quotesDraft: q.filter(x => x.status === 'draft').length,
      quotesSent: q.filter(x => x.status === 'sent').length,
      quotesApproved: q.filter(x => x.status === 'approved').length,
      approvedMonthTotal: q.filter(x => x.status === 'approved').reduce((s, x) => s + Number(x.total || 0), 0),
      receivablePending: r.filter(x => x.status === 'pending').reduce((s, x) => s + Number(x.amount) - Number(x.received_amount), 0),
      invoicesMonth: inv.filter(x => x.issued_at && new Date(x.issued_at) >= monthStart).length,
      invoicedMonth: inv.filter(x => x.status === 'authorized' && x.issued_at && new Date(x.issued_at) >= monthStart)
        .reduce((s, x) => s + Number(x.gross_amount || 0), 0),
      invoicesProcessing: inv.filter(x => x.status === 'processing').length,
      invoicesRejected: inv.filter(x => x.status === 'rejected').length
    };
  }
}

export const commercialRepo = new CommercialRepository();
