import express from 'express';
import { requireAuth } from '../src/middleware/authMiddleware.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../src/utils/logger.js';

const router = express.Router();

/**
 * Example of a protected route with the new auth system
 * This shows how to migrate existing routes to use cookie-based auth
 */

// Public route - no authentication required
router.get('/public-data', async (req, res) => {
  try {
    res.json(successResponse({
      message: 'This is public data',
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    logger.error('Public route error:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500));
  }
});

// Protected route - requires authentication and CSRF token
router.get('/protected-data', requireAuth, async (req, res) => {
  try {
    // req.user is available from the auth middleware
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    res.json(successResponse({
      message: 'This is protected data',
      user: {
        id: userId,
        email: userEmail
      },
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    logger.error('Protected route error:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500));
  }
});

// Protected POST route - requires auth and CSRF validation
router.post('/create-resource', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    
    // Validate input
    if (!name || !description) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Name and description are required', null, 400));
    }
    
    // Create resource (example)
    const resource = {
      id: `resource_${Date.now()}`,
      name,
      description,
      userId,
      createdAt: new Date().toISOString()
    };
    
    res.json(successResponse({
      resource
    }, 'Resource created successfully'));
  } catch (error) {
    logger.error('Create resource error:', error);
    res.status(500).json(errorResponse('RESOURCE_CREATE_ERROR', 'Internal server error', error.message, 500));
  }
});

// Example of applying auth to multiple routes
const protectedRouter = express.Router();
protectedRouter.use(requireAuth); // Apply to all routes below

protectedRouter.get('/user-profile', async (req, res) => {
  try {
    // All routes here are protected
    res.json(successResponse({ userId: req.user.id }));
  } catch (error) {
    logger.error('User profile error:', error);
    res.status(500).json(errorResponse('PROFILE_ERROR', 'Internal server error', error.message, 500));
  }
});

protectedRouter.put('/user-settings', async (req, res) => {
  try {
    // This is also protected
    res.json(successResponse({}, 'Settings updated'));
  } catch (error) {
    logger.error('User settings error:', error);
    res.status(500).json(errorResponse('SETTINGS_ERROR', 'Internal server error', error.message, 500));
  }
});

// Mount the protected router
router.use('/account', protectedRouter);

export default router;