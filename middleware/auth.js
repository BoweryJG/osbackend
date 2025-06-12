import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Middleware to check subscription tier
const requireTier = (minTier) => {
  const tierHierarchy = {
    free: 0,
    explorer: 1,
    professional: 2,
    growth: 3,
    enterprise: 4,
    elite: 5,
  };

  return async (req, res, next) => {
    try {
      const userId = req.user.sub || req.user.id;
      
      // Get user's subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('tier')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      const userTier = subscription?.tier || 'free';
      const userTierLevel = tierHierarchy[userTier] || 0;
      const requiredTierLevel = tierHierarchy[minTier] || 0;

      if (userTierLevel < requiredTierLevel) {
        return res.status(403).json({ 
          error: 'Insufficient subscription tier',
          required: minTier,
          current: userTier
        });
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      console.error('Tier check error:', error);
      return res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
};

export {
  authenticateToken,
  requireTier
};