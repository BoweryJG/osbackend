import express from 'express';
import Stripe from 'stripe';

import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Initialize Stripe if configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
}

// RepX Enhancement Levels Pricing Configuration
// Updated July 30, 2025 with new unified pricing structure
const repxPricing = {
  repx1: {
    monthly: {
      amount: 9700, // $97.00 in cents
      priceId: process.env.STRIPE_REPX1_MONTHLY_PRICE_ID || 'price_1RqhStGRiAPUZqWutwNBJlnr'
    },
    annual: {
      amount: 97000, // $970.00 in cents
      priceId: process.env.STRIPE_REPX1_ANNUAL_PRICE_ID || 'price_1RqhStGRiAPUZqWu8eRYprp6'
    }
  },
  repx2: {
    monthly: {
      amount: 19700, // $197.00 in cents
      priceId: process.env.STRIPE_REPX2_MONTHLY_PRICE_ID || 'price_1RqhSuGRiAPUZqWu29dIsVGz'
    },
    annual: {
      amount: 197000, // $1,970.00 in cents
      priceId: process.env.STRIPE_REPX2_ANNUAL_PRICE_ID || 'price_1RqhSuGRiAPUZqWu0nHKxkmp'
    }
  },
  repx3: {
    monthly: {
      amount: 29700, // $297.00 in cents
      priceId: process.env.STRIPE_REPX3_MONTHLY_PRICE_ID || 'price_1RqhSvGRiAPUZqWuygjxykuG'
    },
    annual: {
      amount: 297000, // $2,970.00 in cents
      priceId: process.env.STRIPE_REPX3_ANNUAL_PRICE_ID || 'price_1RqhSvGRiAPUZqWuuvRB2q20'
    }
  },
  repx4: {
    monthly: {
      amount: 49700, // $497.00 in cents
      priceId: process.env.STRIPE_REPX4_MONTHLY_PRICE_ID || 'price_1RqhSvGRiAPUZqWu6YlhyKE2'
    },
    annual: {
      amount: 497000, // $4,970.00 in cents
      priceId: process.env.STRIPE_REPX4_ANNUAL_PRICE_ID || 'price_1RqhSwGRiAPUZqWuJmTnpUXw'
    }
  },
  repx5: {
    monthly: {
      amount: 99700, // $997.00 in cents
      priceId: process.env.STRIPE_REPX5_MONTHLY_PRICE_ID || 'price_1RqhSwGRiAPUZqWuAJzj4tw5'
    },
    annual: {
      amount: 997000, // $9,970.00 in cents
      priceId: process.env.STRIPE_REPX5_ANNUAL_PRICE_ID || 'price_1RqhSwGRiAPUZqWump7raV5n'
    }
  }
};

/**
 * Get RepX pricing plans - used by all frontends
 * GET /api/stripe/repx/plans
 */
router.get('/repx/plans', async (req, res) => {
  try {
    // Add feature details for each tier
    // Updated July 30, 2025 - Unified authentication system
    const plansWithFeatures = {
      repx1: {
        ...repxPricing.repx1,
        name: 'Rep¹ - Login',
        description: 'Basic RepSpheres access with authentication across all apps',
        features: {
          login: true,
          email: false,
          phone: false,
          gmail: false,
          agentMinutes: 1,
          basic: [
            'Cross-app SSO authentication',
            'Access to ALL 5 RepSpheres apps',
            'CRM, Canvas, Market Data, RepConnect, Global',
            '1-minute AI agent conversations',
            'Basic profile and settings',
            'Core feature access'
          ]
        }
      },
      repx2: {
        ...repxPricing.repx2,
        name: 'Rep² - Login + Email',
        description: 'Email capabilities with Vultr SMTP for unlimited sending',
        features: {
          login: true,
          email: true,
          phone: false,
          gmail: false,
          agentMinutes: 5,
          basic: [
            'Everything in Rep¹, plus:',
            'Unlimited email sending via Vultr SMTP',
            'Professional email templates',
            'Email tracking and analytics',
            '5-minute AI agent conversations',
            'Email launcher from any app',
            'Cross-app email integration'
          ]
        }
      },
      repx3: {
        ...repxPricing.repx3,
        name: 'Rep³ - Login + Email + Phone',
        description: 'Twilio phone provisioning with dedicated number',
        features: {
          login: true,
          email: true,
          phone: true,
          gmail: false,
          agentMinutes: 15,
          basic: [
            'Everything in Rep², plus:',
            'Automatic Twilio phone provisioning',
            'Dedicated business phone number',
            'Click-to-call from any app',
            'Call recording and transcription',
            '15-minute AI agent conversations',
            'Phone + Email enrichment in Market Data',
            'Advanced territory intelligence'
          ]
        }
      },
      repx4: {
        ...repxPricing.repx4,
        name: 'Rep⁴ - Login + Email + Phone + Gmail',
        description: 'Full integration suite with Gmail sync',
        features: {
          login: true,
          email: true,
          phone: true,
          gmail: true,
          agentMinutes: 30,
          basic: [
            'Everything in Rep³, plus:',
            'Gmail OAuth integration',
            'Read, send, compose, modify emails',
            'Gmail sync across all apps',
            '30-minute AI agent conversations',
            'Advanced analytics and reporting',
            'Priority support',
            'Full RepSpheres ecosystem access'
          ]
        }
      },
      repx5: {
        ...repxPricing.repx5,
        name: 'Rep⁵ - Everything + Custom',
        description: 'Enterprise tier with white label options',
        features: {
          login: true,
          email: true,
          phone: true,
          gmail: true,
          agentMinutes: 'unlimited',
          basic: [
            'Everything in Rep⁴, plus:',
            'Unlimited AI agent conversations',
            'White label options',
            'Custom integrations',
            'Dedicated success manager',
            'Priority feature development',
            'Enterprise SLA',
            'Custom training and onboarding'
          ],
          premium: [
            'Your brand, your domain',
            'Custom AI agent personalities',
            'API access for integrations',
            'Bulk user management',
            'Advanced security features'
          ]
        }
      }
    };

    res.json(successResponse('RepX plans retrieved successfully', plansWithFeatures));
  } catch (error) {
    logger.error('Error fetching RepX plans:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to fetch RepX plans', error.message, 500));
  }
});

/**
 * Create Stripe checkout session for RepX subscription tiers
 * POST /api/stripe/create-checkout-session
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { tier, billingCycle, priceId, customerEmail, successUrl, cancelUrl } = req.body;

    logger.info('🔥 Creating RepX checkout session:', { tier, billingCycle, priceId, customerEmail });

    // Validate Stripe configuration
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    // Validate required parameters
    if (!tier || !billingCycle) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Tier and billing cycle are required', null, 400));
    }

    // Validate tier
    if (!repxPricing[tier]) {
      return res.status(400).json(errorResponse('INVALID_TIER', `Invalid tier: ${tier}. Must be one of: ${Object.keys(repxPricing).join(', ')}`, null, 400));
    }

    // Validate billing cycle
    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json(errorResponse('INVALID_BILLING_CYCLE', 'Billing cycle must be monthly or annual', null, 400));
    }

    // Get pricing information
    const pricingInfo = repxPricing[tier][billingCycle];
    const finalPriceId = priceId || pricingInfo.priceId;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        }
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'https://crm.repspheres.com'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://crm.repspheres.com'}/subscription/cancel`,
      metadata: {
        tier,
        billingCycle,
        amount: pricingInfo.amount.toString(),
        repx_tier: tier,
        billing_cycle: billingCycle,
        system: 'repx_enhancement_levels'
      },
      subscription_data: {
        metadata: {
          tier,
          billingCycle,
          repx_tier: tier,
          billing_cycle: billingCycle,
          system: 'repx_enhancement_levels'
        }
      }
    });

    console.log('✅ RepX checkout session created:', {
      sessionId: session.id,
      tier,
      billingCycle,
      amount: pricingInfo.amount,
      priceId: finalPriceId
    });

    return res.json(successResponse({
      sessionId: session.id,
      url: session.url,
      tier,
      billingCycle,
      amount: pricingInfo.amount,
      priceId: finalPriceId
    }));

  } catch (error) {
    logger.error('❌ Error creating RepX checkout session:', error);
    return res.status(500).json(errorResponse('CHECKOUT_ERROR', 'Failed to create checkout session', error.message, 500));
  }
});

/**
 * Get subscription information by customer email
 * POST /api/stripe/subscription
 */
router.post('/subscription', async (req, res) => {
  try {
    const { customer_email } = req.body;

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    if (!customer_email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Customer email is required', null, 400));
    }

    logger.info('🔍 Looking up subscription for:', customer_email);

    // Find customer by email
    const customers = await stripe.customers.list({
      email: customer_email,
      limit: 1
    });

    if (customers.data.length === 0) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Customer not found', null, 404));
    }

    const customer = customers.data[0];

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'No active subscription found', null, 404));
    }

    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0]?.price?.id;
    const amount = subscription.items.data[0]?.price?.unit_amount || 0;
    const interval = subscription.items.data[0]?.price?.recurring?.interval || 'month';

    // Get latest invoice for transaction ID
    const invoices = await stripe.invoices.list({
      subscription: subscription.id,
      limit: 1
    });

    const latestInvoice = invoices.data[0];

    console.log('✅ Found subscription:', {
      subscriptionId: subscription.id,
      amount,
      interval,
      priceId,
      status: subscription.status
    });

    return res.json(successResponse({
      subscription_id: subscription.id,
      customer_id: customer.id,
      plan_name: subscription.metadata?.tier || 'unknown',
      amount: amount,
      interval: interval,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      latest_invoice_id: latestInvoice?.id,
      tier: subscription.metadata?.tier || subscription.metadata?.repx_tier,
      billing_cycle: subscription.metadata?.billingCycle || subscription.metadata?.billing_cycle,
      price_id: priceId
    }));

  } catch (error) {
    logger.error('❌ Error fetching subscription:', error);
    return res.status(500).json(errorResponse('SUBSCRIPTION_ERROR', 'Failed to fetch subscription', error.message, 500));
  }
});

/**
 * Get RepX pricing configuration
 * GET /api/stripe/pricing
 */
router.get('/pricing', (req, res) => {
  try {
    // Convert pricing from cents to dollars for frontend
    const pricingForFrontend = {};
    
    Object.keys(repxPricing).forEach(tier => {
      pricingForFrontend[tier] = {
        monthly: {
          amount: repxPricing[tier].monthly.amount / 100,
          priceId: repxPricing[tier].monthly.priceId
        },
        annual: {
          amount: repxPricing[tier].annual.amount / 100,
          priceId: repxPricing[tier].annual.priceId
        }
      };
    });

    return res.json(successResponse({
      pricing: pricingForFrontend,
      tiers: Object.keys(repxPricing),
      billingCycles: ['monthly', 'annual']
    }));

  } catch (error) {
    logger.error('❌ Error fetching RepX pricing:', error);
    return res.status(500).json(errorResponse('PRICING_ERROR', 'Failed to fetch pricing', error.message, 500));
  }
});

/**
 * Cancel subscription
 * POST /api/stripe/cancel-subscription
 */
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { subscription_id, customer_email } = req.body;

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    if (!subscription_id && !customer_email) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Subscription ID or customer email is required', null, 400));
    }

    let subscriptionId = subscription_id;

    // If only email provided, find the subscription
    if (!subscriptionId && customer_email) {
      const customers = await stripe.customers.list({
        email: customer_email,
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Customer not found', null, 404));
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'No active subscription found', null, 404));
      }

      subscriptionId = subscriptions.data[0].id;
    }

    // Cancel subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    console.log('✅ Subscription marked for cancellation:', {
      subscriptionId,
      cancelAt: canceledSubscription.cancel_at
    });

    return res.json(successResponse({
      subscription_id: subscriptionId,
      status: canceledSubscription.status,
      cancel_at_period_end: canceledSubscription.cancel_at_period_end,
      cancel_at: canceledSubscription.cancel_at,
      current_period_end: canceledSubscription.current_period_end
    }));

  } catch (error) {
    logger.error('❌ Error canceling subscription:', error);
    return res.status(500).json(errorResponse('CANCELLATION_ERROR', 'Failed to cancel subscription', error.message, 500));
  }
});

/**
 * Validate RepX feature access based on tier and usage
 * POST /api/repx/validate-access
 */
router.post('/validate-access', async (req, res) => {
  try {
    const { userTier, feature, usage } = req.body;

    logger.info('🔍 Validating RepX access:', { userTier, feature, usage });

    // Validate required parameters
    if (!userTier || !feature || !usage) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'userTier, feature, and usage are required', null, 400));
    }

    // Get tier configuration
    if (!repxPricing[userTier]) {
      return res.status(400).json(errorResponse('INVALID_TIER', `Invalid tier: ${userTier}`, null, 400));
    }

    const tierConfig = repxPricing[userTier];
    
    // Define feature limits for each tier
    const tierLimits = {
      repx1: { calls: 100, emails: 0, canvas_scans: 0 },
      repx2: { calls: 200, emails: 50, canvas_scans: 10 },
      repx3: { calls: 400, emails: 100, canvas_scans: 25 },
      repx4: { calls: 800, emails: 200, canvas_scans: 50 },
      repx5: { calls: 'unlimited', emails: 'unlimited', canvas_scans: 'unlimited' }
    };

    const limits = tierLimits[userTier];
    const currentUsage = usage[feature] || 0;
    const limit = limits[feature];

    let hasAccess = false;
    let remainingUsage = 0;

    if (limit === 'unlimited') {
      hasAccess = true;
      remainingUsage = 'unlimited';
    } else if (typeof limit === 'number') {
      hasAccess = currentUsage < limit;
      remainingUsage = Math.max(0, limit - currentUsage);
    }

    console.log('✅ Access validation result:', { 
      userTier, 
      feature, 
      currentUsage, 
      limit, 
      hasAccess, 
      remainingUsage 
    });

    return res.json(successResponse('Feature access validated successfully', {
      hasAccess,
      userTier,
      feature,
      currentUsage,
      limit,
      remainingUsage,
      tierName: tierConfig.name || `RepX${userTier.slice(-1)} Enhancement Level`
    }));

  } catch (error) {
    logger.error('❌ Error validating RepX access:', error);
    return res.status(500).json(errorResponse('VALIDATION_ERROR', 'Failed to validate feature access', error.message, 500));
  }
});

/**
 * Get subscription status for Market Data app 
 * GET /api/subscription/status - authenticated endpoint
 */
router.get('/status', async (req, res) => {
  try {
    // This would typically use authentication middleware to get user info
    // For now, return a basic subscription structure
    const defaultSubscription = {
      isActive: true,
      planId: 'professional',
      features: {
        aiQueries: 1000,
        users: 5,
        categories: 'unlimited',
        automation: true,
        api: true
      },
      usage: {
        aiQueries: 42,
        users: 1,
        categories: 8,
        automationRuns: 15
      },
      limits: {
        aiQueries: 1000,
        users: 5,
        categories: 'unlimited'
      }
    };

    return res.json(defaultSubscription);
  } catch (error) {
    logger.error('❌ Error getting subscription status:', error);
    return res.status(500).json(errorResponse('SUBSCRIPTION_ERROR', 'Failed to get subscription status', error.message, 500));
  }
});

/**
 * Track usage for Market Data app
 * POST /api/subscription/track-usage
 */
router.post('/track-usage', async (req, res) => {
  try {
    const { feature, quantity = 1 } = req.body;
    
    if (!feature) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Feature is required', null, 400));
    }

    logger.info('📊 Tracking usage:', { feature, quantity });
    
    // TODO: Implement actual usage tracking in database
    // For now, just return success
    return res.json(successResponse({ 
      message: 'Usage tracked successfully',
      feature,
      quantity 
    }));
  } catch (error) {
    logger.error('❌ Error tracking usage:', error);
    return res.status(500).json(errorResponse('TRACKING_ERROR', 'Failed to track usage', error.message, 500));
  }
});

/**
 * Purchase add-on for Market Data app
 * POST /api/subscription/purchase-addon
 */
router.post('/purchase-addon', async (req, res) => {
  try {
    const { addon, quantity = 1 } = req.body;
    
    if (!addon) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Addon is required', null, 400));
    }

    logger.info('💳 Processing addon purchase:', { addon, quantity });
    
    // TODO: Implement actual addon purchase logic
    return res.json(successResponse({ 
      message: 'Addon purchased successfully',
      addon,
      quantity,
      transactionId: `txn_${Date.now()}`
    }));
  } catch (error) {
    logger.error('❌ Error purchasing addon:', error);
    return res.status(500).json(errorResponse('PURCHASE_ERROR', 'Failed to purchase addon', error.message, 500));
  }
});

/**
 * Get subscription usage statistics
 * GET /api/subscription/usage
 */
router.get('/usage', async (req, res) => {
  try {
    const usageStats = {
      aiQueries: 42,
      users: 1,
      categories: 8,
      automationRuns: 15,
      apiCalls: 128,
      period: 'current_month',
      resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
    };

    return res.json(usageStats);
  } catch (error) {
    logger.error('❌ Error getting usage:', error);
    return res.status(500).json(errorResponse('USAGE_ERROR', 'Failed to get usage statistics', error.message, 500));
  }
});

/**
 * Get billing history
 * GET /api/subscription/billing-history
 */
router.get('/billing-history', async (req, res) => {
  try {
    const billingHistory = [
      {
        id: 'inv_1',
        date: new Date(2025, 0, 15).toISOString(),
        amount: 299,
        status: 'paid',
        description: 'Professional Plan - January 2025',
        invoiceUrl: '#'
      },
      {
        id: 'inv_2', 
        date: new Date(2024, 11, 15).toISOString(),
        amount: 299,
        status: 'paid',
        description: 'Professional Plan - December 2024',
        invoiceUrl: '#'
      }
    ];

    return res.json(billingHistory);
  } catch (error) {
    logger.error('❌ Error getting billing history:', error);
    return res.status(500).json(errorResponse('BILLING_ERROR', 'Failed to get billing history', error.message, 500));
  }
});

/**
 * Create Stripe checkout session for Market Data
 * POST /api/subscription/create-checkout
 */
router.post('/create-checkout', async (req, res) => {
  try {
    const { planId, successUrl, cancelUrl } = req.body;
    
    if (!planId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Plan ID is required', null, 400));
    }

    if (!stripe) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    // Map Market Data plans to Stripe price IDs
    const planPricing = {
      free: null, // Free plan doesn't need checkout
      starter: process.env.MARKET_DATA_STARTER_PRICE_ID,
      professional: process.env.MARKET_DATA_PROFESSIONAL_PRICE_ID,
      enterprise: process.env.MARKET_DATA_ENTERPRISE_PRICE_ID
    };

    const priceId = planPricing[planId];
    if (!priceId) {
      return res.status(400).json(errorResponse('INVALID_PLAN', `Invalid plan: ${planId}`, null, 400));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'https://marketdata.repspheres.com'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://marketdata.repspheres.com'}/subscription/cancel`,
      metadata: {
        planId,
        system: 'market_data'
      }
    });

    logger.info('✅ Market Data checkout session created:', { sessionId: session.id, planId });

    return res.json(successResponse({ 
      url: session.url,
      sessionId: session.id 
    }));
  } catch (error) {
    logger.error('❌ Error creating checkout session:', error);
    return res.status(500).json(errorResponse('CHECKOUT_ERROR', 'Failed to create checkout session', error.message, 500));
  }
});

/**
 * Create Stripe portal session for GlobalRepSpheres
 * POST /api/stripe/create-portal-session
 */
router.post('/create-portal-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    // TODO: Get customer ID from authenticated user
    const customerId = req.body.customerId || 'cus_default'; // This should come from user auth
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL || 'https://repspheres.com'}/account`,
    });

    return res.json(successResponse({ url: session.url }));
  } catch (error) {
    logger.error('❌ Error creating portal session:', error);
    return res.status(500).json(errorResponse('PORTAL_ERROR', 'Failed to create portal session', error.message, 500));
  }
});

/**
 * Create customer portal session for Market Data
 * POST /api/subscription/portal
 */
router.post('/portal', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    // TODO: Get customer ID from authenticated user
    const customerId = req.body.customerId || 'cus_default'; // This should come from user auth
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL || 'https://marketdata.repspheres.com'}/subscription`,
    });

    return res.json(successResponse({ url: session.url }));
  } catch (error) {
    logger.error('❌ Error creating portal session:', error);
    return res.status(500).json(errorResponse('PORTAL_ERROR', 'Failed to create portal session', error.message, 500));
  }
});

/**
 * Get subscription status and details
 * POST /api/stripe/subscription (expects customer email in body)
 */
router.post('/subscription', async (req, res) => {
  try {
    const { customer_email, subscription_id } = req.body;

    logger.info('🔍 Getting subscription status:', { customer_email, subscription_id });

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Stripe not configured', null, 503));
    }

    if (!customer_email && !subscription_id) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'customer_email or subscription_id is required', null, 400));
    }

    let subscriptions = [];

    if (subscription_id) {
      // Get specific subscription by ID
      const subscription = await stripe.subscriptions.retrieve(subscription_id);
      subscriptions = [subscription];
    } else {
      // Find customer by email and get their subscriptions
      const customers = await stripe.customers.list({ email: customer_email, limit: 1 });
      
      if (customers.data.length === 0) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'No customer found with this email', null, 404));
      }

      const customer = customers.data[0];
      const customerSubscriptions = await stripe.subscriptions.list({ 
        customer: customer.id,
        status: 'all',
        limit: 10
      });
      subscriptions = customerSubscriptions.data;
    }

    if (subscriptions.length === 0) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'No subscriptions found', null, 404));
    }

    // Get the most recent subscription
    const subscription = subscriptions[0];
    
    // Extract tier information from metadata or price ID
    let tier = subscription.metadata?.tier || subscription.metadata?.repx_tier;
    
    if (!tier && subscription.items?.data?.[0]?.price?.id) {
      const priceId = subscription.items.data[0].price.id;
      // Match price ID to tier
      for (const [tierKey, pricing] of Object.entries(repxPricing)) {
        if (pricing.monthly.priceId === priceId || pricing.annual.priceId === priceId) {
          tier = tierKey;
          break;
        }
      }
    }

    console.log('✅ Subscription found:', { 
      id: subscription.id, 
      status: subscription.status, 
      tier,
      current_period_end: subscription.current_period_end 
    });

    return res.json(successResponse('Subscription retrieved successfully', {
      subscription_id: subscription.id,
      status: subscription.status,
      tier,
      customer_id: subscription.customer,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at,
      created: subscription.created,
      plan_amount: subscription.items?.data?.[0]?.price?.unit_amount,
      plan_currency: subscription.items?.data?.[0]?.price?.currency,
      plan_interval: subscription.items?.data?.[0]?.price?.recurring?.interval,
      metadata: subscription.metadata
    }));

  } catch (error) {
    logger.error('❌ Error getting subscription:', error);
    return res.status(500).json(errorResponse('SUBSCRIPTION_ERROR', 'Failed to get subscription', error.message, 500));
  }
});

export default router;