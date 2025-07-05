import { Router } from 'express';
import { PhoneNumberController } from '../controllers/PhoneNumberController';
import { authenticate, authorize, authorizeClientAccess } from '../middleware/auth';
import { UserRole } from '../entities/User';

const router = Router();
const phoneNumberController = new PhoneNumberController();

// All routes require authentication
router.use(authenticate);

// Search available numbers
router.get(
  '/available',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  phoneNumberController.searchAvailableNumbers
);

// Provision new number
router.post(
  '/provision',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  phoneNumberController.provisionNumber
);

// List client's phone numbers
router.get(
  '/client/:clientId',
  authorizeClientAccess,
  phoneNumberController.listClientNumbers
);

// Get specific phone number
router.get(
  '/:id',
  phoneNumberController.getPhoneNumber
);

// Update phone number configuration
router.put(
  '/:id/configuration',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  phoneNumberController.updateConfiguration
);

// Release phone number
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  phoneNumberController.releaseNumber
);

export { router as phoneNumberRoutes };