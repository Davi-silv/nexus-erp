/**
 * Abstração de provedor fiscal (NFS-e) — implementações futuras: Focus NFe, eNotas, NFSe.io.
 * Nunca expor certificados ou API secrets no frontend.
 */

export class FiscalProvider {
  async emitInvoice(_params) {
    throw new Error('FiscalProvider não configurado');
  }

  async cancelInvoice(_externalId) {
    throw new Error('FiscalProvider não configurado');
  }

  async getInvoiceStatus(_externalId) {
    throw new Error('FiscalProvider não configurado');
  }

  async downloadPdf(_externalId) {
    throw new Error('FiscalProvider não configurado');
  }

  async downloadXml(_externalId) {
    throw new Error('FiscalProvider não configurado');
  }
}

export class StubFiscalProvider extends FiscalProvider {
  async emitInvoice({ invoiceId, workspaceId }) {
    return {
      externalId: `stub_nfse_${workspaceId}_${invoiceId}`,
      status: 'processing',
      message: 'Emissão simulada — confirme via webhook/backend quando integrar provedor real.'
    };
  }
}

export const fiscalProvider = new StubFiscalProvider();
