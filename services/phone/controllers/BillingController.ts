import { Request, Response, NextFunction } from 'express';
import { BillingService } from '../services/BillingService';
import { ValidationError } from '../utils/errors';

const billingService = new BillingService();

export class BillingController {
  async generateInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId, billingPeriodStart, billingPeriodEnd } = req.body;

      if (!clientId || !billingPeriodStart || !billingPeriodEnd) {
        throw new ValidationError('Client ID and billing period are required');
      }

      const invoice = await billingService.generateInvoice(
        clientId,
        new Date(billingPeriodStart),
        new Date(billingPeriodEnd)
      );

      res.status(201).json({
        message: 'Invoice generated successfully',
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId, invoiceId, amount, method, referenceNumber, notes } = req.body;

      if (!clientId || !amount || !method) {
        throw new ValidationError('Client ID, amount, and payment method are required');
      }

      const payment = await billingService.recordPayment({
        clientId,
        invoiceId,
        amount,
        method,
        referenceNumber,
        notes,
      });

      res.status(201).json({
        message: 'Payment recorded successfully',
        payment,
      });
    } catch (error) {
      next(error);
    }
  }

  async getInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const invoice = await billingService.getInvoice(id);

      res.json({
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async listInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId, status, startDate, endDate, limit = 20, offset = 0 } = req.query;

      const result = await billingService.listInvoices({
        clientId: clientId as string,
        status: status as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        invoices: result.invoices,
        total: result.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error) {
      next(error);
    }
  }
}