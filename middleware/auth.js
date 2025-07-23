import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

import logger from '../utils/logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Middleware to check subscription tier (updated for RepX system)
const requireTier = (minTier) => {
  const tierHierarchy = {
    free: 0,
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

// Middleware to validate Canvas scan limits
const validateCanvasAccess = async (req, res, next) => {
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

// Middleware specifically for RepX1 tier (phone-only) validation
const requireCanvasAccess = async (req, res, next) => {
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

export {
  authenticateToken,
  requireTier,
  validateCanvasAccess,
  requireCanvasAccess
};