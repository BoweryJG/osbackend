import crypto from 'crypto';

import { createClient } from '@supabase/supabase-js';

import logger from '../utils/logger.js';
import { getRequiredEnv } from '../utils/envValidator.js';

// Initialize Supabase client for server-side use - NO FALLBACKS
let supabaseUrl, supabaseKey;
try {
  supabaseUrl = getRequiredEnv('SUPABASE_URL', 'Supabase project URL');
  
  // Try different environment variable names for the key
  supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                process.env.SUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPABASE_KEY;
  
  if (!supabaseKey) {
    throw new Error('No Supabase key found. Set one of: SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_KEY');
  }
} catch (error) {
  logger.error('Failed to load required Supabase credentials:', error.message);
  throw error;
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// CSRF token storage (in production, use Redis or similar)
const csrfTokens = new Map();

// Session configuration
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: SESSION_TIMEOUT,
  path: '/'
};

// Generate CSRF token
export const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Store CSRF token with session
export const storeCSRFToken = (sessionId, csrfToken) => {
  csrfTokens.set(sessionId, {
    token: csrfToken,
    createdAt: Date.now()
  });
  
  // Clean up old tokens
  cleanupExpiredTokens();
};

// Validate CSRF token
export const validateCSRFToken = (sessionId, token) => {
  const stored = csrfTokens.get(sessionId);
  if (!stored) return false;
  
  // Check if token matches and hasn't expired
  const isValid = stored.token === token && 
    (Date.now() - stored.createdAt) < SESSION_TIMEOUT;
  
  return isValid;
};

// Clean up expired CSRF tokens
const cleanupExpiredTokens = () => {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now - data.createdAt > SESSION_TIMEOUT) {
      csrfTokens.delete(sessionId);
    }
  }
};

// Authentication middleware
export const authMiddleware = async (req, res, next) => {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      logger.warn('Auth middleware called but Supabase is not configured');
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }
    
    const sessionToken = req.cookies?.session_token;
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' });
    }
    
    // Verify session with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
    
    if (error || !user) {
      logger.error('Auth middleware error:', error);
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    // Attach user to request
    req.user = user;
    req.sessionToken = sessionToken;
    
    // Refresh session timeout
    res.cookie('session_token', sessionToken, COOKIE_OPTIONS);
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// CSRF protection middleware
export const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  const sessionToken = req.cookies?.session_token;
  const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
  
  if (!sessionToken || !csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }
  
  if (!validateCSRFToken(sessionToken, csrfToken)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
};

// Session timeout middleware
export const sessionTimeout = (req, res, next) => {
  const lastActivity = req.cookies?.last_activity;
  
  if (lastActivity) {
    const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
    
    if (timeSinceLastActivity > SESSION_TIMEOUT) {
      // Clear cookies
      res.clearCookie('session_token');
      res.clearCookie('last_activity');
      res.clearCookie('csrf_token');
      
      return res.status(401).json({ error: 'Session expired' });
    }
  }
  
  // Update last activity
  res.cookie('last_activity', Date.now().toString(), {
    ...COOKIE_OPTIONS,
    httpOnly: false // Client needs to read this
  });
  
  next();
};

// Combined auth middleware with CSRF and session timeout
export const requireAuth = [
  sessionTimeout,
  authMiddleware,
  csrfProtection
];