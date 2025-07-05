import { Router, Request, Response, NextFunction } from 'express';
import { UsageService } from '../services/UsageService';
import { authenticate, authorizeClientAccess } from '../middleware/auth';
import { ValidationError } from '../utils/errors';

const router = Router();
const usageService = new UsageService();

// All routes require authentication
router.use(authenticate);

// Get client usage stats
router.get('/stats/:clientId', authorizeClientAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required');
    }

    const stats = await usageService.getClientUsageStats(
      clientId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      stats,
    });
  } catch (error) {
    next(error);
  }
});

// Get phone number usage
router.get('/phone-number/:phoneNumberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumberId } = req.params;
    const { startDate, endDate, type, limit = 100, offset = 0 } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required');
    }

    const result = await usageService.getPhoneNumberUsage(
      phoneNumberId,
      new Date(startDate as string),
      new Date(endDate as string),
      {
        type: type as any,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      }
    );

    res.json({
      records: result.records,
      total: result.total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    next(error);
  }
});

export { router as usageRoutes };