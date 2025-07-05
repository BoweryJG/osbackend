import { Router } from 'express';
import { ClientController } from '../controllers/ClientController';
import { authenticate, authorize, authorizeClientAccess } from '../middleware/auth';
import { UserRole } from '../entities/User';

const router = Router();
const clientController = new ClientController();

// All routes require authentication
router.use(authenticate);

// List all clients (admin/manager only)
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  clientController.listClients
);

// Create new client (admin/manager only)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  clientController.createClient
);

// Get client by code
router.get(
  '/code/:code',
  authorizeClientAccess,
  clientController.getClientByCode
);

// Get specific client
router.get(
  '/:id',
  authorizeClientAccess,
  clientController.getClient
);

// Update client (admin/manager only)
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  clientController.updateClient
);

export { router as clientRoutes };