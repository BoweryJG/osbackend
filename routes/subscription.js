import express from 'express';
import { createClient } from '@supabase/supabase-js';

import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../utils/logger.js';
import { provisionTwilioForUser, getUserTwilioConfig } from '../twilio_auto_provisioning.js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Feature limits by tier
const TIER_LIMITS = {
  free: { calls: 0, emails: 0, canvas_scans: 0, ai_queries: 10, transcriptions: 5 },
  repx1: { calls: 100, emails: 0, canvas_scans: 0, ai_queries: 50, transcriptions: 100 },
  repx2: { calls: 200, emails: 50, canvas_scans: 10, ai_queries: 100, transcriptions: 200 },
  repx3: { calls: 400, emails: 100, canvas_scans: 25, ai_queries: 500, transcriptions: 400 },
  repx4: { calls: 800, emails: 200, canvas_scans: 50, ai_queries: 1000, transcriptions: 800 },
  repx5: { calls: -1, emails: -1, canvas_scans: -1, ai_queries: -1, transcriptions: -1 } // -1 means unlimited
};

// Cache for subscription data (5 minutes)
const subscriptionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached subscription or fetch from database
 */
async function getCachedSubscription(userId) {
  const cacheKey = `sub_${userId}`;
  const cached = subscriptionCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  // Fetch from database
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!error && data) {
    subscriptionCache.set(cacheKey, {
      data,
      expires: Date.now() + CACHE_TTL
    });
  }
  
  return data;
}

/**
 * Validate user access to features based on subscription tier
 * POST /api/subscription/validate-access
 */
router.post('/validate-access', async (req, res) => {
  try {
    const { userId, email, feature, requestedQuantity = 1 } = req.body;
    
    if (!userId && !email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userId or email is required', null, 400));
    }
    
    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'feature is required', null, 400));
    }
    
    logger.info('🔍 Validating access:', { userId, email, feature, requestedQuantity });
    
    // Get user subscription
    let subscription;
    if (userId) {
      subscription = await getCachedSubscription(userId);
    } else {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('email', email)
        .single();
      subscription = data;
    }
    
    const tier = subscription?.plan_id || 'free';
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const limit = limits[feature];
    
    if (limit === undefined) {
      return res.status(400).json(errorResponse('INVALID_FEATURE', `Invalid feature: ${feature}`, null, 400));
    }
    
    // Check if unlimited
    if (limit === -1) {
      return res.json(successResponse('Access validated', {
        allowed: true,
        tier,
        feature,
        limit: 'unlimited',
        currentUsage: 0,
        remaining: 'unlimited'
      }));
    }
    
    // Check if feature not available in tier
    if (limit === 0) {
      return res.json(successResponse('Access validated', {
        allowed: false,
        tier,
        feature,
        limit: 0,
        currentUsage: 0,
        remaining: 0,
        message: `${feature} not available in ${tier} tier`
      }));
    }
    
    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: usageData } = await supabase
      .from('usage_tracking')
      .select('quantity')
      .eq('user_id', subscription?.user_id || userId)
      .eq('feature_type', feature)
      .gte('timestamp', startOfMonth.toISOString());
    
    const currentUsage = usageData?.reduce((sum, record) => sum + record.quantity, 0) || 0;
    const wouldExceed = currentUsage + requestedQuantity > limit;
    
    const response = {
      allowed: !wouldExceed,
      tier,
      feature,
      limit,
      currentUsage,
      remaining: Math.max(0, limit - currentUsage),
      requestedQuantity
    };
    
    if (wouldExceed) {
      response.message = `Would exceed monthly limit. Current: ${currentUsage}, Limit: ${limit}`;
      response.overage = (currentUsage + requestedQuantity) - limit;
    }
    
    console.log('✅ Access validation result:', response);
    
    return res.json(successResponse('Access validated', response));
    
  } catch (error) {
    logger.error('❌ Error validating access:', error);
    return res.status(500).json(errorResponse('VALIDATION_ERROR', 'Failed to validate access', error.message, 500));
  }
});

/**
 * Check subscription limits for a user
 * POST /api/subscription/check-limits
 */
router.post('/check-limits', async (req, res) => {
  try {
    const { userId, email } = req.body;
    
    if (!userId && !email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userId or email is required', null, 400));
    }
    
    logger.info('📊 Checking subscription limits:', { userId, email });
    
    // Get user subscription
    let subscription;
    if (userId) {
      subscription = await getCachedSubscription(userId);
    } else {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('email', email)
        .single();
      subscription = data;
    }
    
    const tier = subscription?.plan_id || 'free';
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    
    // Get current month usage for all features
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: usageData } = await supabase
      .from('usage_tracking')
      .select('feature_type, quantity')
      .eq('user_id', subscription?.user_id || userId)
      .gte('timestamp', startOfMonth.toISOString());
    
    // Aggregate usage by feature
    const usage = {};
    usageData?.forEach(record => {
      usage[record.feature_type] = (usage[record.feature_type] || 0) + record.quantity;
    });
    
    // Calculate remaining for each feature
    const limitsWithUsage = {};
    Object.keys(limits).forEach(feature => {
      const limit = limits[feature];
      const used = usage[feature] || 0;
      
      limitsWithUsage[feature] = {
        limit: limit === -1 ? 'unlimited' : limit,
        used,
        remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - used),
        percentage: limit === -1 || limit === 0 ? 0 : Math.round((used / limit) * 100)
      };
    });
    
    const response = {
      tier,
      subscription: {
        id: subscription?.stripe_subscription_id,
        status: subscription?.status || 'free',
        current_period_end: subscription?.current_period_end
      },
      limits: limitsWithUsage,
      resetDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1).toISOString()
    };
    
    console.log('✅ Limits check result:', { tier, features: Object.keys(limitsWithUsage) });
    
    return res.json(successResponse('Limits retrieved successfully', response));
    
  } catch (error) {
    logger.error('❌ Error checking limits:', error);
    return res.status(500).json(errorResponse('LIMITS_ERROR', 'Failed to check limits', error.message, 500));
  }
});

/**
 * Track feature usage
 * POST /api/subscription/track-usage
 */
router.post('/track-usage', async (req, res) => {
  try {
    const { userId, email, feature, quantity = 1, appName, metadata = {} } = req.body;
    
    if (!userId && !email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userId or email is required', null, 400));
    }
    
    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'feature is required', null, 400));
    }
    
    logger.info('📈 Tracking usage:', { userId, email, feature, quantity, appName });
    
    // Get user subscription to record tier
    let subscription;
    if (userId) {
      subscription = await getCachedSubscription(userId);
    } else {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('email', email)
        .single();
      subscription = data;
    }
    
    const tier = subscription?.plan_id || 'free';
    
    // Record usage
    const { data: usageRecord, error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId || subscription?.user_id,
        email: email || subscription?.email,
        feature_type: feature,
        quantity,
        subscription_tier: tier,
        app_name: appName,
        metadata
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Usage tracked:', { id: usageRecord.id, feature, quantity });
    
    // Check if usage is approaching limits
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const limit = limits[feature];
    
    if (limit && limit !== -1) {
      // Get current month usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { data: totalUsageData } = await supabase
        .from('usage_tracking')
        .select('quantity')
        .eq('user_id', userId || subscription?.user_id)
        .eq('feature_type', feature)
        .gte('timestamp', startOfMonth.toISOString());
      
      const totalUsage = totalUsageData?.reduce((sum, record) => sum + record.quantity, 0) || 0;
      const percentageUsed = (totalUsage / limit) * 100;
      
      // Add warning if approaching limit
      if (percentageUsed >= 80) {
        usageRecord.warning = `Approaching ${feature} limit: ${totalUsage}/${limit} (${Math.round(percentageUsed)}%)`;
      }
    }
    
    return res.json(successResponse('Usage tracked successfully', {
      id: usageRecord.id,
      feature,
      quantity,
      tier,
      timestamp: usageRecord.timestamp,
      warning: usageRecord.warning
    }));
    
  } catch (error) {
    logger.error('❌ Error tracking usage:', error);
    return res.status(500).json(errorResponse('TRACKING_ERROR', 'Failed to track usage', error.message, 500));
  }
});

/**
 * Get usage statistics for a user
 * GET /api/subscription/usage-stats
 */
router.get('/usage-stats', async (req, res) => {
  try {
    const { userId, email, period = 'current_month' } = req.query;
    
    if (!userId && !email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userId or email is required', null, 400));
    }
    
    logger.info('📊 Getting usage stats:', { userId, email, period });
    
    // Determine date range
    let startDate, endDate;
    const now = new Date();
    
    switch (period) {
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'last_30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
    }
    
    // Build query
    let query = supabase
      .from('usage_tracking')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: false });
    
    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('email', email);
    }
    
    const { data: usageData, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Aggregate by feature
    const aggregated = {};
    const daily = {};
    
    usageData?.forEach(record => {
      // Aggregate totals
      if (!aggregated[record.feature_type]) {
        aggregated[record.feature_type] = {
          total: 0,
          count: 0,
          lastUsed: record.timestamp
        };
      }
      aggregated[record.feature_type].total += record.quantity;
      aggregated[record.feature_type].count += 1;
      
      // Daily breakdown
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      if (!daily[date]) {
        daily[date] = {};
      }
      if (!daily[date][record.feature_type]) {
        daily[date][record.feature_type] = 0;
      }
      daily[date][record.feature_type] += record.quantity;
    });
    
    // Get subscription info
    let subscription;
    if (userId) {
      subscription = await getCachedSubscription(userId);
    } else {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('email', email)
        .single();
      subscription = data;
    }
    
    const tier = subscription?.plan_id || 'free';
    
    const response = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      tier,
      aggregated,
      daily,
      totalRecords: usageData?.length || 0
    };
    
    console.log('✅ Usage stats retrieved:', { 
      period, 
      features: Object.keys(aggregated),
      days: Object.keys(daily).length 
    });
    
    return res.json(successResponse('Usage statistics retrieved', response));
    
  } catch (error) {
    logger.error('❌ Error getting usage stats:', error);
    return res.status(500).json(errorResponse('STATS_ERROR', 'Failed to get usage statistics', error.message, 500));
  }
});

/**
 * Provision Twilio for RepX1+ subscribers
 * POST /api/subscription/provision-twilio
 */
router.post('/provision-twilio', async (req, res) => {
  try {
    const { userId, email, subscriptionTier, areaCode } = req.body;
    
    if (!userId || !email || !subscriptionTier) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userId, email, and subscriptionTier are required', null, 400));
    }
    
    logger.info('📱 Provisioning Twilio:', { userId, email, subscriptionTier, areaCode });
    
    // Check if tier qualifies for Twilio
    const twilioEligibleTiers = ['repx1', 'repx2', 'repx3', 'repx4', 'repx5'];
    if (!twilioEligibleTiers.includes(subscriptionTier)) {
      return res.status(400).json(errorResponse('INVALID_TIER', `Twilio provisioning requires RepX1 or higher. Current tier: ${subscriptionTier}`, null, 400));
    }
    
    // Check if already provisioned
    const existingConfig = await getUserTwilioConfig(userId);
    if (existingConfig && existingConfig.status === 'active') {
      return res.json(successResponse('Twilio already provisioned', {
        phoneNumber: existingConfig.twilio_phone_number,
        status: existingConfig.status,
        provisioned: true
      }));
    }
    
    // Provision Twilio
    const config = await provisionTwilioForUser(userId, email, subscriptionTier, areaCode);
    
    console.log('✅ Twilio provisioned successfully:', { 
      phoneNumber: config.twilio_phone_number,
      status: config.status 
    });
    
    return res.json(successResponse('Twilio provisioned successfully', {
      phoneNumber: config.twilio_phone_number,
      status: config.status,
      webhookUrl: config.webhook_url,
      provisioned: true
    }));
    
  } catch (error) {
    logger.error('❌ Error provisioning Twilio:', error);
    return res.status(500).json(errorResponse('PROVISIONING_ERROR', 'Failed to provision Twilio', error.message, 500));
  }
});

/**
 * Get user's Twilio configuration
 * GET /api/subscription/twilio-config
 */
router.get('/twilio-config', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'userId is required', null, 400));
    }
    
    const config = await getUserTwilioConfig(userId);
    
    if (!config) {
      return res.json(successResponse('No Twilio configuration found', {
        configured: false
      }));
    }
    
    // Don't send auth token to frontend
    const sanitizedConfig = {
      phoneNumber: config.twilio_phone_number,
      status: config.status,
      configured: true,
      webhookUrl: config.webhook_url,
      createdAt: config.created_at
    };
    
    return res.json(successResponse('Twilio configuration retrieved', sanitizedConfig));
    
  } catch (error) {
    logger.error('❌ Error getting Twilio config:', error);
    return res.status(500).json(errorResponse('CONFIG_ERROR', 'Failed to get Twilio configuration', error.message, 500));
  }
});

/**
 * Clear subscription cache (admin endpoint)
 * POST /api/subscription/clear-cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const { adminKey } = req.body;
    
    // Simple admin check - in production use proper auth
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Invalid admin key', null, 403));
    }
    
    subscriptionCache.clear();
    
    logger.info('🧹 Subscription cache cleared');
    
    return res.json(successResponse('Cache cleared successfully', {
      cleared: true,
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    logger.error('❌ Error clearing cache:', error);
    return res.status(500).json(errorResponse('CACHE_ERROR', 'Failed to clear cache', error.message, 500));
  }
});

export default router;