import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  async createCustomer(data: {
    name: string;
    email?: string;
    phone?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      metadata: data.metadata,
    });
  }

  async updateCustomer(
    customerId: string,
    data: Partial<Stripe.CustomerUpdateParams>
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, data);
  }

  async createPaymentMethod(data: {
    type: 'card';
    card: {
      number: string;
      exp_month: number;
      exp_year: number;
      cvc: string;
    };
  }): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.create(data);
  }

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  async createPaymentIntent(data: {
    amount: number; // in cents
    currency?: string;
    customerId?: string;
    paymentMethodId?: string;
    confirm?: boolean;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: data.amount,
      currency: data.currency || 'usd',
      customer: data.customerId,
      payment_method: data.paymentMethodId,
      confirm: data.confirm,
      metadata: data.metadata,
    });
  }

  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  async createInvoice(data: {
    customerId: string;
    description?: string;
    metadata?: Record<string, string>;
    autoAdvance?: boolean;
  }): Promise<Stripe.Invoice> {
    return this.stripe.invoices.create({
      customer: data.customerId,
      description: data.description,
      metadata: data.metadata,
      auto_advance: data.autoAdvance ?? true,
    });
  }

  async createInvoiceItem(data: {
    customerId: string;
    invoiceId?: string;
    amount: number; // in cents
    currency?: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.InvoiceItem> {
    return this.stripe.invoiceItems.create({
      customer: data.customerId,
      invoice: data.invoiceId,
      amount: data.amount,
      currency: data.currency || 'usd',
      description: data.description,
      metadata: data.metadata,
    });
  }

  async finalizeInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.finalizeInvoice(invoiceId);
  }

  async sendInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.sendInvoice(invoiceId);
  }

  async payInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.pay(invoiceId);
  }

  async createSubscription(data: {
    customerId: string;
    priceId: string;
    quantity?: number;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: data.customerId,
      items: [
        {
          price: data.priceId,
          quantity: data.quantity || 1,
        },
      ],
      trial_period_days: data.trialPeriodDays,
      metadata: data.metadata,
    });
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately?: boolean
  ): Promise<Stripe.Subscription> {
    if (immediately) {
      return this.stripe.subscriptions.cancel(subscriptionId);
    } else {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  async createPrice(data: {
    productId: string;
    unitAmount: number; // in cents
    currency?: string;
    recurring?: {
      interval: 'day' | 'week' | 'month' | 'year';
      intervalCount?: number;
    };
    metadata?: Record<string, string>;
  }): Promise<Stripe.Price> {
    return this.stripe.prices.create({
      product: data.productId,
      unit_amount: data.unitAmount,
      currency: data.currency || 'usd',
      recurring: data.recurring,
      metadata: data.metadata,
    });
  }

  async createProduct(data: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Product> {
    return this.stripe.products.create({
      name: data.name,
      description: data.description,
      metadata: data.metadata,
    });
  }

  async createCheckoutSession(data: {
    customerId?: string;
    lineItems: Array<{
      price: string;
      quantity: number;
    }>;
    mode: 'payment' | 'subscription';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      customer: data.customerId,
      line_items: data.lineItems,
      mode: data.mode,
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      metadata: data.metadata,
    });
  }

  async constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    endpointSecret: string
  ): Promise<Stripe.Event> {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      endpointSecret
    );
  }
}