import { getSupabaseClient } from '../../infrastructure/supabase.client.js';
import { isSupabaseEnabled } from '../../config/supabase.config.js';

export class CommercialRepository {
  #client = isSupabaseEnabled ? getSupabaseClient() : null;

  #requireClient() {
    if (!this.#client) throw new Error('Módulo comercial requer Supabase (modo cloud).');
    return this.#client;
  }

  async listSuppliers(workspaceId) {
    const { data, error } = await this.#requireClient()
      .from('suppliers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async upsertSupplier(row) {
    const { data, error } = await this.#requireClient()
      .from('suppliers')
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listPayables(workspaceId, { limit = 500, offset = 0 } = {}) {
    const { data, error, count } = await this.#requireClient()
      .from('accounts_payable')
      .select('*, suppliers(name, document)', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return { rows: data || [], total: count ?? (data?.length || 0) };
  }

  async createPayable(row) {
    const groupId = row.is_recurring ? crypto.randomUUID() : null;
    const { data, error } = await this.#requireClient()
      .from('accounts_payable')
      .insert({
        ...row,
        recurrence_group_id: groupId,
        status: 'pending',
        paid_amount: 0
      })
      .select('*, suppliers(name, document)')
      .single();
    if (error) throw error;
    return data;
  }

  async updatePayable(id, patch) {
    const { data, error } = await this.#requireClient()
      .from('accounts_payable')
      .update(patch)
      .eq('id', id)
      .select('*, suppliers(name, document)')
      .single();
    if (error) throw error;
    return data;
  }

  async softDeletePayable(id) {
    const { error } = await this.#requireClient()
      .from('accounts_payable')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
  }

  async markPayablePaid(payableId, amount, financialAccountId, paymentDate) {
    const { data, error } = await this.#requireClient().rpc('mark_payable_paid', {
      p_payable_id: payableId,
      p_payment_amount: amount,
      p_financial_account_id: financialAccountId,
      p_payment_date: paymentDate || null
    });
    if (error) throw error;
    return data;
  }

  async cancelPayable(payableId) {
    const { error } = await this.#requireClient().rpc('cancel_payable', {
      p_payable_id: payableId
    });
    if (error) throw error;
  }

  async uploadPayableAttachment(workspaceId, payableId, file) {
    const client = this.#requireClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${workspaceId}/${payableId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await client.storage
      .from('payable-attachments')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    await this.updatePayable(payableId, {
      attachment_name: file.name,
      attachment_path: path
    });
    return path;
  }

  async getPayableAttachmentUrl(path) {
    const { data, error } = await this.#requireClient().storage
      .from('payable-attachments')
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl;
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
