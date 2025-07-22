import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { 
  generateCSRFToken, 
  storeCSRFToken,
  requireAuth 
} from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse, commonErrors } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-origin in production
  maxAge: 30 * 60 * 1000, // 30 minutes
  path: '/',
  domain: process.env.NODE_ENV === 'production' ? '.repspheres.com' : undefined // Allow subdomain sharing
};

// Exchange Supabase token for httpOnly cookies
router.post('/login', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json(errorResponse('MISSING_TOKEN', 'Access token required', null, 400));
    }

    // Verify the Supabase token
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      logger.error('Invalid Supabase token:', error);
      return res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid or expired token', null, 401));
    }

    // Generate CSRF token
    const csrfToken = generateCSRFToken();
    storeCSRFToken(access_token, csrfToken);

    // Set cookies
    res.cookie('session_token', access_token, COOKIE_OPTIONS);
    res.cookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false // Client needs to read this
    });
    res.cookie('last_activity', Date.now().toString(), {
      ...COOKIE_OPTIONS,
      httpOnly: false
    });

    logger.info('User logged in:', user.id);

    res.json(successResponse({
      user: { 
        id: user.id, 
        email: user.email,
        user_metadata: user.user_metadata 
      },
      csrfToken 
    }, 'Login successful'));
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('session_token');
  res.clearCookie('csrf_token');
  res.clearCookie('last_activity');
  
  logger.info('User logged out:', req.user?.id);
  
  res.json(successResponse(null, 'Logout successful'));
});

// Refresh session
router.post('/refresh', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json(errorResponse('NO_SESSION', 'No session token found', null, 401));
    }

    // Verify current token
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json(errorResponse('INVALID_SESSION', 'Session expired or invalid', null, 401));
    }

    // Refresh cookies
    res.cookie('session_token', sessionToken, COOKIE_OPTIONS);
    res.cookie('last_activity', Date.now().toString(), {
      ...COOKIE_OPTIONS,
      httpOnly: false
    });

    res.json(successResponse(null, 'Session refreshed successfully'));
  } catch (error) {
    logger.error('Session refresh error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json(errorResponse('NOT_AUTHENTICATED', 'Authentication required', null, 401));
    }

    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json(errorResponse('INVALID_SESSION', 'Session expired or invalid', null, 401));
    }
    
    res.json(successResponse({
      user: { 
        id: user.id, 
        email: user.email,
        user_metadata: user.user_metadata
      } 
    }));
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

// Get new CSRF token
router.get('/csrf', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json(errorResponse('NOT_AUTHENTICATED', 'Authentication required', null, 401));
    }

    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json(errorResponse('INVALID_SESSION', 'Session expired or invalid', null, 401));
    }
    
    const csrfToken = generateCSRFToken();
    storeCSRFToken(sessionToken, csrfToken);

    res.cookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false
    });

    res.json(successResponse({ csrfToken }, 'CSRF token generated'));
  } catch (error) {
    logger.error('CSRF token error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

export default router;