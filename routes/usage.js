import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Supabase client with service role for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Get current usage for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    
    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Fetch usage data for current month
    const { data: usageData, error } = await supabase
      .from('usage_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') { // Not found is ok
      throw error;
    }

    // Return usage data or empty object
    const usage = usageData || {
      canvas_briefs: 0,
      ai_prompts: 0,
      call_analyses: 0,
      contacts_generated: 0,
      ripples_sent: 0,
    };

    res.json(successResponse(usage));
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch usage data', error.message, 500));
  }
});

// Increment usage for a specific feature
router.post('/increment', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { feature } = req.body;
    
    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Feature is required', null, 400));
    }

    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get user's subscription tier
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const tier = subscription?.tier || 'free';

    // Check if user has reached limit
    const { data: currentUsage } = await supabase
      .from('usage_metrics')
      .select(feature)
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())
      .single();

    const current = currentUsage?.[feature] || 0;
    const limits = getTierLimits(tier);
    const limit = limits[feature];

    if (limit !== -1 && current >= limit) {
      return res.status(403).json(errorResponse('USAGE_LIMIT_REACHED', 'Usage limit reached', {
        current,
        limit,
        tier
      }, 403));
    }

    // Increment usage
    const { data, error } = await supabase
      .from('usage_metrics')
      .upsert({
        user_id: userId,
        month: monthStart.toISOString(),
        [feature]: current + 1,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,month'
      })
      .select()
      .single();

    if (error) throw error;

    // Log usage event
    await supabase
      .from('usage_events')
      .insert({
        user_id: userId,
        feature,
        tier,
        timestamp: new Date().toISOString(),
      });

    res.json(successResponse({ 
      success: true, 
      usage: data,
      remaining: limit === -1 ? 'unlimited' : limit - (current + 1)
    }, 'Usage incremented successfully'));
  } catch (error) {
    console.error('Error incrementing usage:', error);
    res.status(500).json(errorResponse('INCREMENT_ERROR', 'Failed to increment usage', error.message, 500));
  }
});

// Check if user can use a feature
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { feature } = req.body;
    
    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Feature is required', null, 400));
    }

    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get user's subscription tier
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const tier = subscription?.tier || 'free';

    // Get current usage
    const { data: currentUsage } = await supabase
      .from('usage_metrics')
      .select(feature)
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())
      .single();

    const current = currentUsage?.[feature] || 0;
    const limits = getTierLimits(tier);
    const limit = limits[feature];

    const canUse = limit === -1 || current < limit;
    const percentage = limit === -1 ? 0 : (current / limit) * 100;

    res.json(successResponse({
      canUse,
      current,
      limit,
      remaining: limit === -1 ? 'unlimited' : limit - current,
      percentage,
      tier,
      shouldShowUpgrade: percentage >= 80 && percentage < 100,
    }));
  } catch (error) {
    console.error('Error checking usage:', error);
    res.status(500).json(errorResponse('CHECK_ERROR', 'Failed to check usage', error.message, 500));
  }
});

/**
 * Canvas Subscription Enforcement Routes
 * RepX Tier system: free, repx1, repx2, repx3, repx4, repx5
 */

/**
 * Check if user can perform a scan (validate limits)
 * GET /api/usage/check-limits/:user_id
 */
router.get('/check-limits/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    if (!user_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'User ID is required', null, 400));
    }

    // Call the PostgreSQL function to check limits
    const { data, error } = await supabase.rpc('check_repx_scan_limit', {
      p_user_id: user_id
    });

    if (error) {
      console.error('Database error checking scan limits:', error);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to check scan limits', error.message, 500));
    }

    res.json(successResponse({
      status: data,
      canScan: data.allowed,
      message: data.message
    }, 'Scan limits checked successfully'));

  } catch (error) {
    console.error('Error checking scan limits:', error);
    res.status(500).json(errorResponse('CHECK_LIMITS_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Record scan usage after successful scan
 * POST /api/usage/record-scan
 */
router.post('/record-scan', async (req, res) => {
  try {
    const { user_id, scan_type = 'canvas' } = req.body;
    
    if (!user_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'User ID is required', null, 400));
    }

    // Call the PostgreSQL function to increment usage
    const { data, error } = await supabase.rpc('increment_daily_usage', {
      p_user_id: user_id,
      p_scan_type: scan_type,
      p_increment: 1
    });

    if (error) {
      console.error('Database error recording scan usage:', error);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to record scan usage', error.message, 500));
    }

    res.json(successResponse({
      newUsageCount: data
    }, 'Scan usage recorded successfully'));

  } catch (error) {
    console.error('Error recording scan usage:', error);
    res.status(500).json(errorResponse('RECORD_SCAN_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Validate scan request (comprehensive check)
 * POST /api/usage/validate-scan
 */
router.post('/validate-scan', async (req, res) => {
  try {
    const { user_id, scan_type = 'canvas' } = req.body;
    
    if (!user_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'User ID is required', null, 400));
    }

    // Check current limits
    const { data: limitCheck, error: limitError } = await supabase.rpc('check_repx_scan_limit', {
      p_user_id: user_id
    });

    if (limitError) {
      console.error('Database error validating scan:', limitError);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to validate scan request', limitError.message, 500));
    }

    res.json(successResponse({
      allowed: limitCheck.allowed,
      status: limitCheck,
      errorMessage: limitCheck.allowed ? null : limitCheck.message,
      userTier: limitCheck.tier,
      scansRemaining: limitCheck.remaining,
      dailyLimit: limitCheck.daily_limit,
      currentUsage: limitCheck.current_usage
    }, limitCheck.allowed ? 'Scan validated successfully' : 'Scan request denied'));

  } catch (error) {
    console.error('Error validating scan request:', error);
    res.status(500).json(errorResponse('VALIDATE_SCAN_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Get daily usage stats for a user
 * GET /api/usage/daily/:user_id
 */
router.get('/daily/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { date } = req.query; // Optional date parameter
    
    if (!user_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'User ID is required', null, 400));
    }

    // Get daily usage
    const { data: dailyUsage, error: usageError } = await supabase.rpc('get_daily_usage', {
      p_user_id: user_id,
      p_date: date || new Date().toISOString().split('T')[0]
    });

    if (usageError) {
      console.error('Database error fetching daily usage:', usageError);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to fetch daily usage', usageError.message, 500));
    }

    // Get subscription limits
    const { data: limitCheck, error: limitError } = await supabase.rpc('check_repx_scan_limit', {
      p_user_id: user_id
    });

    if (limitError) {
      console.error('Database error checking limits:', limitError);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to check limits', limitError.message, 500));
    }

    res.json(successResponse({
      date: date || new Date().toISOString().split('T')[0],
      scansUsed: dailyUsage || 0,
      scansRemaining: limitCheck.remaining,
      dailyLimit: limitCheck.daily_limit,
      tier: limitCheck.tier,
      canScan: limitCheck.allowed,
      upgradeAvailable: limitCheck.tier !== 'repx5' && limitCheck.daily_limit < 999999
    }, 'Daily usage fetched successfully'));

  } catch (error) {
    console.error('Error fetching daily usage:', error);
    res.status(500).json(errorResponse('DAILY_USAGE_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Get usage summary for display components
 * GET /api/usage/summary/:user_id
 */
router.get('/summary/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    if (!user_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'User ID is required', null, 400));
    }

    // Get comprehensive usage and limit information
    const [dailyUsageResult, limitCheckResult] = await Promise.all([
      supabase.rpc('get_daily_usage', { p_user_id: user_id }),
      supabase.rpc('check_repx_scan_limit', { p_user_id: user_id })
    ]);

    if (dailyUsageResult.error) {
      console.error('Error fetching daily usage:', dailyUsageResult.error);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to fetch usage data', dailyUsageResult.error.message, 500));
    }

    if (limitCheckResult.error) {
      console.error('Error checking limits:', limitCheckResult.error);
      return res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to check limits', limitCheckResult.error.message, 500));
    }

    const limitData = limitCheckResult.data;
    const usageCount = dailyUsageResult.data || 0;

    res.json(successResponse({
      tier: limitData.tier,
      scansUsed: usageCount,
      scansRemaining: limitData.remaining,
      dailyLimit: limitData.daily_limit,
      upgradeAvailable: limitData.tier !== 'repx5' && limitData.daily_limit < 999999,
      canScan: limitData.allowed,
      message: limitData.message
    }, 'Usage summary fetched successfully'));

  } catch (error) {
    console.error('Error fetching usage summary:', error);
    res.status(500).json(errorResponse('SUMMARY_ERROR', 'Internal server error', error.message, 500));
  }
});

// Helper function to get RepX tier limits (for reference)
function getRepXTierLimits(tier) {
  const limits = {
    free: {
      canvas_scans: 3,
      daily_limit: 3
    },
    repx1: {
      canvas_scans: 0, // Phone-only tier
      daily_limit: 0
    },
    repx2: {
      canvas_scans: 10,
      daily_limit: 10
    },
    repx3: {
      canvas_scans: 25,
      daily_limit: 25
    },
    repx4: {
      canvas_scans: 50,
      daily_limit: 50
    },
    repx5: {
      canvas_scans: -1, // Unlimited
      daily_limit: 999999
    }
  };

  return limits[tier] || limits.free;
}

export default router;