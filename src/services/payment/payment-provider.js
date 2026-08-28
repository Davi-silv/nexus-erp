/**
 * Abstração de gateway de pagamento — implementações futuras: Asaas, Mercado Pago, Stripe.
 * Nunca armazena dados de cartão no Nexus.
 */

export class PaymentProvider {
  /** @returns {Promise<{ checkoutUrl: string, sessionId: string }>} */
  async createCheckoutSession(_params) {
    throw new Error('PaymentProvider não configurado');
  }

  /** @returns {Promise<object>} */
  async handleWebhook(_payload, _signature) {
    throw new Error('Webhook não implementado');
  }
}

export class StubPaymentProvider extends PaymentProvider {
  async createCheckoutSession({ planSlug, workspaceId }) {
    return {
      checkoutUrl: null,
      sessionId: `stub_${workspaceId}_${planSlug}`,
      message: 'Integração de pagamento pendente — plano registrado como incomplete até confirmação via webhook.'
    };
  }
}

export const paymentProvider = new StubPaymentProvider();
