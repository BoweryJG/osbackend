import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { clientRoutes } from './client.routes';
import { phoneNumberRoutes } from './phoneNumber.routes';
import { billingRoutes } from './billing.routes';
import { usageRoutes } from './usage.routes';
import { webhookRoutes } from './webhook.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/phone-numbers', phoneNumberRoutes);
router.use('/billing', billingRoutes);
router.use('/usage', usageRoutes);
router.use('/webhooks', webhookRoutes);

export default router;