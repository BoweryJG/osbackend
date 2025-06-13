import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for auth verification
const supabaseAuth = createClient(
  process.env.SUPABASE_URL || 'https://cbopynuvhcymbumjnvay.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

/**
 * Middleware to verify Supabase JWT tokens
 */
export async function authenticateUser(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    req.userEmail = user.email;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Optional authentication - continues even if no auth provided
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      
      if (user) {
        req.user = user;
        req.userId = user.id;
        req.userEmail = user.email;
      }
    }
  } catch (error) {
    // Silent fail for optional auth
    console.warn('Optional auth check failed:', error.message);
  }
  
  next();
}