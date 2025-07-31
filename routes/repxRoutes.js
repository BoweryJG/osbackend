import express from 'express';
import { createClient } from '@supabase/supabase-js';

import { requireAuth } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
);

// RepX tier feature mapping
const REPX_FEATURES = {
  repx0: {
    tier: 0,
    name: 'Rep⁰ - Free',
    features: {
      login: true,
      email: false,
      phone: false,
      gmail: false,
      agentMinutes: 0.5, // 30 seconds
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: 0,
      phoneLimit: 0,
      canvasScans: 3,
      smtpProvider: null,
      twilioProvisioning: false,
      whiteLabel: false
    }
  },
  repx1: {
    tier: 1,
    name: 'Rep¹ - Login',
    features: {
      login: true,
      email: false,
      phone: false,
      gmail: false,
      agentMinutes: 1,
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: 0,
      phoneLimit: 0,
      canvasScans: 10,
      smtpProvider: null,
      twilioProvisioning: false,
      whiteLabel: false
    }
  },
  repx2: {
    tier: 2,
    name: 'Rep² - Login + Email',
    features: {
      login: true,
      email: true,
      phone: false,
      gmail: false,
      agentMinutes: 5,
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: -1, // unlimited
      phoneLimit: 0,
      canvasScans: 25,
      smtpProvider: 'vultr',
      twilioProvisioning: false,
      whiteLabel: false
    }
  },
  repx3: {
    tier: 3,
    name: 'Rep³ - Login + Email + Phone',
    features: {
      login: true,
      email: true,
      phone: true,
      gmail: false,
      agentMinutes: 15,
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: -1,
      phoneLimit: -1, // unlimited
      canvasScans: 50,
      smtpProvider: 'vultr',
      twilioProvisioning: true,
      whiteLabel: false,
      territoryIntelligence: true
    }
  },
  repx4: {
    tier: 4,
    name: 'Rep⁴ - Login + Email + Phone + Gmail',
    features: {
      login: true,
      email: true,
      phone: true,
      gmail: true,
      agentMinutes: 30,
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: -1,
      phoneLimit: -1,
      canvasScans: 100,
      smtpProvider: 'vultr',
      twilioProvisioning: true,
      gmailScopes: ['readonly', 'send', 'compose', 'modify'],
      whiteLabel: false,
      territoryIntelligence: true,
      advancedAnalytics: true
    }
  },
  repx5: {
    tier: 5,
    name: 'Rep⁵ - Everything + Custom',
    features: {
      login: true,
      email: true,
      phone: true,
      gmail: true,
      agentMinutes: -1, // unlimited
      apps: ['crm', 'canvas', 'market-data', 'repconnect', 'global'],
      emailLimit: -1,
      phoneLimit: -1,
      canvasScans: -1, // unlimited
      smtpProvider: 'vultr',
      twilioProvisioning: true,
      gmailScopes: ['readonly', 'send', 'compose', 'modify'],
      whiteLabel: true,
      territoryIntelligence: true,
      advancedAnalytics: true,
      customIntegrations: true,
      dedicatedSupport: true,
      apiAccess: true
    }
  }
};

/**
 * Get user's RepX subscription tier and features
 * GET /api/repx/validate-access
 */
router.get('/validate-access', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    logger.info(`Validating RepX access for user ${userId}`);

    // Get user's current subscription from Supabase
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('subscription_tier, stripe_subscription_id, status, current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      // No active subscription - return free tier
      logger.info(`User ${userId} has no active subscription, returning free tier`);
      return res.json(successResponse({
        tier: 'repx0',
        features: REPX_FEATURES.repx0.features,
        subscription: null
      }, 'Free tier access'));
    }

    // Validate subscription is still active
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < now) {
      logger.info(`User ${userId} subscription expired, returning free tier`);
      return res.json(successResponse({
        tier: 'repx0',
        features: REPX_FEATURES.repx0.features,
        subscription: {
          ...subscription,
          expired: true
        }
      }, 'Subscription expired - free tier access'));
    }

    // Get the tier features
    const tierKey = subscription.subscription_tier || 'repx0';
    const tierFeatures = REPX_FEATURES[tierKey] || REPX_FEATURES.repx0;

    // Check for any feature overrides in user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('feature_overrides')
      .eq('id', userId)
      .single();

    let features = { ...tierFeatures.features };
    
    // Apply any feature overrides
    if (userProfile?.feature_overrides) {
      features = { ...features, ...userProfile.feature_overrides };
    }

    // Check if user has connected Gmail
    const { data: gmailTokens } = await supabase
      .from('user_gmail_tokens')
      .select('email')
      .eq('user_id', userId);

    // Check if user has provisioned Twilio phone
    const { data: twilioConfig } = await supabase
      .from('user_twilio_config')
      .select('phone_number, subaccount_sid')
      .eq('user_id', userId)
      .single();

    return res.json(successResponse({
      tier: tierKey,
      tierName: tierFeatures.name,
      features,
      subscription: {
        ...subscription,
        validUntil: periodEnd
      },
      connections: {
        gmail: gmailTokens && gmailTokens.length > 0 ? gmailTokens.map(t => t.email) : [],
        twilio: twilioConfig?.phone_number || null
      }
    }, 'Access validated successfully'));

  } catch (error) {
    logger.error('Error validating RepX access:', error);
    res.status(500).json(errorResponse('VALIDATION_ERROR', 'Failed to validate access', null, 500));
  }
});

/**
 * Check if user has access to specific feature
 * POST /api/repx/check-feature
 */
router.post('/check-feature', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { feature, app } = req.body;

    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Feature parameter is required', null, 400));
    }

    // Get user's tier
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('subscription_tier')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const tierKey = subscription?.subscription_tier || 'repx0';
    const tierFeatures = REPX_FEATURES[tierKey] || REPX_FEATURES.repx0;

    // Check if feature is available
    let hasAccess = false;
    let reason = '';

    switch (feature) {
      case 'email':
        hasAccess = tierFeatures.features.email === true;
        reason = hasAccess ? 'Email features available' : 'Upgrade to Rep² or higher for email access';
        break;
      
      case 'phone':
        hasAccess = tierFeatures.features.phone === true;
        reason = hasAccess ? 'Phone features available' : 'Upgrade to Rep³ or higher for phone access';
        break;
      
      case 'gmail':
        hasAccess = tierFeatures.features.gmail === true;
        reason = hasAccess ? 'Gmail integration available' : 'Upgrade to Rep⁴ or higher for Gmail sync';
        break;
      
      case 'whiteLabel':
        hasAccess = tierFeatures.features.whiteLabel === true;
        reason = hasAccess ? 'White label features available' : 'Upgrade to Rep⁵ for white label options';
        break;
      
      default:
        // Check if it's an app access request
        if (app && tierFeatures.features.apps) {
          hasAccess = tierFeatures.features.apps.includes(app);
          reason = hasAccess ? `Access to ${app} granted` : `No access to ${app} app`;
        } else {
          reason = 'Unknown feature';
        }
    }

    return res.json(successResponse({
      feature,
      hasAccess,
      reason,
      currentTier: tierKey,
      tierName: tierFeatures.name
    }, 'Feature check complete'));

  } catch (error) {
    logger.error('Error checking feature access:', error);
    res.status(500).json(errorResponse('CHECK_ERROR', 'Failed to check feature access', null, 500));
  }
});

/**
 * Get agent conversation time limit for user's tier
 * GET /api/repx/agent-time-limit
 */
router.get('/agent-time-limit', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's tier
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('subscription_tier')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const tierKey = subscription?.subscription_tier || 'repx0';
    const tierFeatures = REPX_FEATURES[tierKey] || REPX_FEATURES.repx0;
    const agentMinutes = tierFeatures.features.agentMinutes;

    return res.json(successResponse({
      tier: tierKey,
      tierName: tierFeatures.name,
      agentMinutes,
      agentSeconds: agentMinutes === -1 ? -1 : agentMinutes * 60,
      unlimited: agentMinutes === -1
    }, 'Agent time limit retrieved'));

  } catch (error) {
    logger.error('Error getting agent time limit:', error);
    res.status(500).json(errorResponse('LIMIT_ERROR', 'Failed to get agent time limit', null, 500));
  }
});

export default router;