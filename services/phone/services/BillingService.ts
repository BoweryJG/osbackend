import { Between, IsNull } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Payment, PaymentStatus, PaymentMethod } from '../entities/Payment';
import { Client } from '../entities/Client';
import { UsageRecord } from '../entities/UsageRecord';
import { PhoneNumber } from '../entities/PhoneNumber';
import { ActivityLog, ActivityType } from '../entities/ActivityLog';
import { UsageService } from './UsageService';
import { StripeService } from './StripeService';
import { NotFoundError } from '../utils/errors';

export class BillingService {
  private invoiceRepo = AppDataSource.getRepository(Invoice);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private clientRepo = AppDataSource.getRepository(Client);
  private phoneRepo = AppDataSource.getRepository(PhoneNumber);
  private activityRepo = AppDataSource.getRepository(ActivityLog);
  private usageService = new UsageService();
  private stripeService = new StripeService();

  async generateInvoice(
    clientId: string,
    billingPeriodStart: Date,
    billingPeriodEnd: Date
  ): Promise<Invoice> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    // Get usage stats
    const usageStats = await this.usageService.getClientUsageStats(
      clientId,
      billingPeriodStart,
      billingPeriodEnd
    );

    // Get active phone numbers
    const phoneNumbers = await this.phoneRepo.find({
      where: { clientId, status: 'active' },
    });

    // Calculate line items
    const lineItems = [];
    let subtotal = 0;

    // Phone number rentals
    for (const phone of phoneNumbers) {
      const monthlyFee = Number(phone.monthlyFee);
      lineItems.push({
        description: `Phone number rental: ${phone.phoneNumber}`,
        quantity: 1,
        unitPrice: monthlyFee,
        amount: monthlyFee,
        category: 'phone_rental',
      });
      subtotal += monthlyFee;
    }

    // Usage charges
    if (usageStats.totalCost > 0) {
      lineItems.push({
        description: `Usage charges (${usageStats.totalCalls} calls, ${usageStats.totalSms} SMS)`,
        quantity: 1,
        unitPrice: usageStats.totalCost,
        amount: usageStats.totalCost,
        category: 'usage',
      });
      subtotal += usageStats.totalCost;
    }

    // Calculate tax (example: 8.875% for NYC)
    const taxRate = 8.875;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Create invoice
    const invoice = this.invoiceRepo.create({
      clientId,
      invoiceNumber,
      status: InvoiceStatus.PENDING,
      billingPeriodStart,
      billingPeriodEnd,
      dueDate: new Date(billingPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      lineItems,
      usageSummary: {
        totalCalls: usageStats.totalCalls,
        totalCallMinutes: usageStats.totalMinutes,
        totalSms: usageStats.totalSms,
        totalMms: usageStats.totalMms,
        byPhoneNumber: usageStats.byPhoneNumber,
      },
    });

    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Create Stripe invoice if client has Stripe customer ID
    if (client.stripeCustomerId) {
      try {
        const stripeInvoice = await this.stripeService.createInvoice({
          customerId: client.stripeCustomerId,
          description: `Invoice ${invoiceNumber}`,
          metadata: {
            invoiceId: savedInvoice.id,
            clientCode: client.clientCode,
          },
        });

        // Add line items to Stripe invoice
        for (const item of lineItems) {
          await this.stripeService.createInvoiceItem({
            customerId: client.stripeCustomerId,
            invoiceId: stripeInvoice.id,
            amount: Math.round(item.amount * 100), // Convert to cents
            description: item.description,
          });
        }

        // Finalize Stripe invoice
        const finalizedInvoice = await this.stripeService.finalizeInvoice(
          stripeInvoice.id
        );

        savedInvoice.stripeInvoiceId = finalizedInvoice.id;
        await this.invoiceRepo.save(savedInvoice);
      } catch (error) {
        console.error('Error creating Stripe invoice:', error);
      }
    }

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.INVOICE_CREATED,
      description: `Invoice ${invoiceNumber} created for $${totalAmount.toFixed(2)}`,
      clientId,
      metadata: {
        invoiceId: savedInvoice.id,
        invoiceNumber,
        amount: totalAmount,
      },
    });

    return savedInvoice;
  }

  async recordPayment(data: {
    clientId: string;
    invoiceId?: string;
    amount: number;
    method: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    stripePaymentIntentId?: string;
  }): Promise<Payment> {
    const paymentNumber = await this.generatePaymentNumber();

    const payment = this.paymentRepo.create({
      ...data,
      paymentNumber,
      status: PaymentStatus.COMPLETED,
      processedAt: new Date(),
    });

    const savedPayment = await this.paymentRepo.save(payment);

    // Update client balance
    await this.clientRepo.update(
      { id: data.clientId },
      { currentBalance: () => `current_balance + ${data.amount}` }
    );

    // Update invoice if specified
    if (data.invoiceId) {
      const invoice = await this.invoiceRepo.findOne({
        where: { id: data.invoiceId },
      });

      if (invoice) {
        invoice.paidAmount = Number(invoice.paidAmount) + data.amount;
        if (invoice.paidAmount >= invoice.totalAmount) {
          invoice.status = InvoiceStatus.PAID;
          invoice.paidAt = new Date();
        }
        await this.invoiceRepo.save(invoice);
      }
    }

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.PAYMENT_RECEIVED,
      description: `Payment ${paymentNumber} received: $${data.amount.toFixed(2)}`,
      clientId: data.clientId,
      metadata: {
        paymentId: savedPayment.id,
        paymentNumber,
        amount: data.amount,
        method: data.method,
      },
    });

    return savedPayment;
  }

  async getInvoice(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['client', 'payments'],
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    return invoice;
  }

  async listInvoices(options: {
    clientId?: string;
    status?: InvoiceStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ invoices: Invoice[]; total: number }> {
    const query = this.invoiceRepo.createQueryBuilder('invoice');

    if (options.clientId) {
      query.andWhere('invoice.clientId = :clientId', {
        clientId: options.clientId,
      });
    }

    if (options.status) {
      query.andWhere('invoice.status = :status', { status: options.status });
    }

    if (options.startDate && options.endDate) {
      query.andWhere('invoice.createdAt BETWEEN :startDate AND :endDate', {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    }

    const [invoices, total] = await query
      .skip(options.offset || 0)
      .take(options.limit || 20)
      .orderBy('invoice.createdAt', 'DESC')
      .getManyAndCount();

    return { invoices, total };
  }

  async checkOverdueInvoices(): Promise<void> {
    const overdueInvoices = await this.invoiceRepo.find({
      where: {
        status: InvoiceStatus.PENDING,
        dueDate: Between(new Date(0), new Date()),
      },
      relations: ['client'],
    });

    for (const invoice of overdueInvoices) {
      invoice.status = InvoiceStatus.OVERDUE;
      await this.invoiceRepo.save(invoice);

      // Consider suspending client if multiple overdue invoices
      const overdueCount = await this.invoiceRepo.count({
        where: {
          clientId: invoice.clientId,
          status: InvoiceStatus.OVERDUE,
        },
      });

      if (overdueCount >= 2) {
        await this.clientRepo.update(
          { id: invoice.clientId },
          { status: 'suspended' }
        );

        await this.activityRepo.save({
          type: ActivityType.CLIENT_SUSPENDED,
          description: 'Client suspended due to overdue invoices',
          clientId: invoice.clientId,
          metadata: { overdueCount },
        });
      }
    }
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastInvoice = await this.invoiceRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber.startsWith(`INV-${year}`)) {
      const lastSequence = parseInt(
        lastInvoice.invoiceNumber.split('-')[2],
        10
      );
      sequence = lastSequence + 1;
    }

    return `INV-${year}-${sequence.toString().padStart(4, '0')}`;
  }

  private async generatePaymentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastPayment = await this.paymentRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    let sequence = 1;
    if (lastPayment && lastPayment.paymentNumber.startsWith(`PAY-${year}`)) {
      const lastSequence = parseInt(
        lastPayment.paymentNumber.split('-')[2],
        10
      );
      sequence = lastSequence + 1;
    }

    return `PAY-${year}-${sequence.toString().padStart(4, '0')}`;
  }
}