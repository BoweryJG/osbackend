import { Router } from 'express';
import { BillingController } from '../controllers/BillingController';
import { authenticate, authorize, authorizeClientAccess } from '../middleware/auth';
import { UserRole } from '../entities/User';

const router = Router();
const billingController = new BillingController();

// All routes require authentication
router.use(authenticate);

// Generate invoice (admin/manager only)
router.post(
  '/invoices/generate',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  billingController.generateInvoice
);

// Record payment (admin/manager only)
router.post(
  '/payments',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  billingController.recordPayment
);

// List invoices
router.get(
  '/invoices',
  billingController.listInvoices
);

// Get specific invoice
router.get(
  '/invoices/:id',
  billingController.getInvoice
);

export { router as billingRoutes };