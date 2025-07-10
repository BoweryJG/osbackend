import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { 
  generateCSRFToken, 
  storeCSRFToken,
  requireAuth 
} from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';

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
  sameSite: 'strict',
  maxAge: 30 * 60 * 1000, // 30 minutes
  path: '/'
};

// Exchange Supabase token for httpOnly cookies
router.post('/login', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'Access token required' });
    }

    // Verify the Supabase token
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      logger.error('Invalid Supabase token:', error);
      return res.status(401).json({ error: 'Invalid token' });
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

    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        email: user.email,
        user_metadata: user.user_metadata 
      },
      csrfToken 
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('session_token');
  res.clearCookie('csrf_token');
  res.clearCookie('last_activity');
  
  logger.info('User logged out:', req.user?.id);
  
  res.json({ success: true });
});

// Refresh session
router.post('/refresh', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token' });
    }

    // Verify current token
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Refresh cookies
    res.cookie('session_token', sessionToken, COOKIE_OPTIONS);
    res.cookie('last_activity', Date.now().toString(), {
      ...COOKIE_OPTIONS,
      httpOnly: false
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Session refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email,
        user_metadata: user.user_metadata
      } 
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get new CSRF token
router.get('/csrf', async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const csrfToken = generateCSRFToken();
    storeCSRFToken(sessionToken, csrfToken);

    res.cookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false
    });

    res.json({ csrfToken });
  } catch (error) {
    logger.error('CSRF token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;