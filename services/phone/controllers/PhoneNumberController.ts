import { Request, Response, NextFunction } from 'express';
import { PhoneNumberService } from '../services/PhoneNumberService';
import { ValidationError } from '../utils/errors';

const phoneNumberService = new PhoneNumberService();

export class PhoneNumberController {
  async searchAvailableNumbers(req: Request, res: Response, next: NextFunction) {
    try {
      const { areaCode, contains, country, type, limit = 20 } = req.query;

      const numbers = await phoneNumberService.searchAvailableNumbers({
        areaCode: areaCode as string,
        contains: contains as string,
        country: country as string,
        type: type as any,
        limit: parseInt(limit as string),
      });

      res.json({
        numbers,
        total: numbers.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async provisionNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId, phoneNumber, displayName, description, configuration } = req.body;

      if (!clientId || !phoneNumber) {
        throw new ValidationError('Client ID and phone number are required');
      }

      const provisionedNumber = await phoneNumberService.provisionNumber({
        clientId,
        phoneNumber,
        displayName,
        description,
        configuration,
      });

      res.status(201).json({
        message: 'Phone number provisioned successfully',
        phoneNumber: provisionedNumber,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateConfiguration(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const configuration = req.body;

      const updated = await phoneNumberService.updateConfiguration(id, configuration);

      res.json({
        message: 'Configuration updated successfully',
        phoneNumber: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async releaseNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await phoneNumberService.releaseNumber(id);

      res.json({
        message: 'Phone number released successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async listClientNumbers(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;

      const numbers = await phoneNumberService.listClientNumbers(clientId);

      res.json({
        phoneNumbers: numbers,
        total: numbers.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPhoneNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const phoneNumber = await phoneNumberService.getPhoneNumber(id);

      res.json({
        phoneNumber,
      });
    } catch (error) {
      next(error);
    }
  }
}