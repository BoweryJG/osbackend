import { Request, Response, NextFunction } from 'express';
import { ClientService } from '../services/ClientService';
import { ValidationError } from '../utils/errors';

const clientService = new ClientService();

export class ClientController {
  async createClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, businessName, contactEmail, contactPhone, address, billingCycle, creditLimit } = req.body;

      if (!name || !businessName) {
        throw new ValidationError('Name and business name are required');
      }

      const client = await clientService.createClient({
        name,
        businessName,
        contactEmail,
        contactPhone,
        address,
        billingCycle,
        creditLimit,
      });

      res.status(201).json({
        message: 'Client created successfully',
        client,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const client = await clientService.updateClient(id, updates);

      res.json({
        message: 'Client updated successfully',
        client,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const client = await clientService.getClient(id);

      res.json({
        client,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClientByCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      const client = await clientService.getClientByCode(code);

      res.json({
        client,
      });
    } catch (error) {
      next(error);
    }
  }

  async listClients(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search, limit = 20, offset = 0 } = req.query;

      const result = await clientService.listClients({
        status: status as any,
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        clients: result.clients,
        total: result.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error) {
      next(error);
    }
  }
}