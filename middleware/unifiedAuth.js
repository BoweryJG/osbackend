import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

// Initialize Supabase client for auth verification
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://cbopynuvhcymbumjnvay.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

/**
 * Primary authentication middleware - verifies Supabase JWT tokens
 * This is the main auth method that should be used going forward
 */
export async function authenticateToken(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.error('Token verification failed:', error);
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
    logger.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Legacy alias for authenticateToken to maintain backward compatibility
 * @deprecated Use authenticateToken instead
 */
export async function authenticateUser(req, res, next) {
  return authenticateToken(req, res, next);
}

/**
 * Optional authentication - continues even if no auth provided
 * Useful for routes that work with or without authentication
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        req.user = user;
        req.userId = user.id;
        req.userEmail = user.email;
      }
    }
  } catch (error) {
    // Silent fail for optional auth
    logger.warn('Optional auth check failed:', error.message);
  }
  
  next();
}

/**
 * Middleware to check subscription tier (updated for RepX system)
 * Usage: requireTier('repx2') - requires RepX2 or higher
 */
export const requireTier = (minTier) => {
  const tierHierarchy = {
    free: 0,
    repx0: 0,
    repx1: 1,
    repx2: 2,
    repx3: 3,
    repx4: 4,
    repx5: 5,
    // Legacy tiers for backward compatibility
    explorer: 1,
    professional: 2,
    growth: 3,
    enterprise: 4,
    elite: 5,
  };

  return async (req, res, next) => {
    try {
      const userId = req.user.sub || req.user.id;
      
      // Get user's subscription from user_profiles table
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('subscription')
        .eq('id', userId)
        .single();

      const userTier = profile?.subscription?.tier || 'free';
      const userTierLevel = tierHierarchy[userTier] || 0;
      const requiredTierLevel = tierHierarchy[minTier] || 0;

      if (userTierLevel < requiredTierLevel) {
        return res.status(403).json({ 
          error: 'Insufficient subscription tier',
          required: minTier,
          current: userTier,
          message: `This feature requires ${minTier} or higher. Current tier: ${userTier}`
        });
      }

      req.subscription = profile?.subscription;
      req.userTier = userTier;
      next();
    } catch (error) {
      logger.error('Tier check error:', error);
      return res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
};

/**
 * Middleware to validate Canvas scan limits
 * Checks daily scan limits based on subscription tier
 */
export const validateCanvasAccess = async (req, res, next) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'User ID required',
        message: 'Authentication failed'
      });
    }

    // Check scan limits using the database function
    const { data: limitCheck, error } = await supabase.rpc('check_repx_scan_limit', {
      p_user_id: userId
    });

    if (error) {
      logger.error('Error checking scan limits:', error);
      return res.status(500).json({ 
        error: 'Failed to verify scan limits',
        message: 'Unable to validate subscription limits'
      });
    }

    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: 'Scan limit exceeded',
        message: limitCheck.message,
        tier: limitCheck.tier,
        current_usage: limitCheck.current_usage,
        daily_limit: limitCheck.daily_limit,
        remaining: limitCheck.remaining
      });
    }

    // Attach limit info to request for use in routes
    req.scanLimits = limitCheck;
    req.userTier = limitCheck.tier;
    next();
  } catch (error) {
    logger.error('Canvas access validation error:', error);
    return res.status(500).json({ 
      error: 'Validation failed',
      message: 'Unable to validate Canvas access'
    });
  }
};

/**
 * Middleware specifically for Canvas access validation
 * Blocks RepX1 users (phone-only tier) from Canvas features
 */
export const requireCanvasAccess = async (req, res, next) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'User ID required'
      });
    }

    // Get user tier
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription')
      .eq('id', userId)
      .single();

    const userTier = profile?.subscription?.tier || 'free';

    // RepX1 is phone-only, block Canvas access
    if (userTier === 'repx1') {
      return res.status(403).json({
        error: 'Canvas access not included',
        message: 'RepX1 includes phone services only. Upgrade to RepX2+ for Canvas access.',
        tier: userTier,
        upgradeRequired: true
      });
    }

    req.userTier = userTier;
    next();
  } catch (error) {
    logger.error('Canvas access check error:', error);
    return res.status(500).json({ 
      error: 'Access validation failed'
    });
  }
};

// Default export for convenience
export default authenticateToken;