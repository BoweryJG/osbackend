import express from 'express';
import Stripe from 'stripe';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Stripe if configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
}

// RepX Enhancement Levels Pricing Configuration
const repxPricing = {
  repx1: {
    monthly: {
      amount: 3900, // $39.00 in cents
      priceId: process.env.STRIPE_REPX1_MONTHLY_PRICE_ID || 'price_repx1_monthly_placeholder'
    },
    annual: {
      amount: 39000, // $390.00 in cents
      priceId: process.env.STRIPE_REPX1_ANNUAL_PRICE_ID || 'price_repx1_annual_placeholder'
    }
  },
  repx2: {
    monthly: {
      amount: 9700, // $97.00 in cents
      priceId: process.env.STRIPE_REPX2_MONTHLY_PRICE_ID || 'price_repx2_monthly_placeholder'
    },
    annual: {
      amount: 97000, // $970.00 in cents
      priceId: process.env.STRIPE_REPX2_ANNUAL_PRICE_ID || 'price_repx2_annual_placeholder'
    }
  },
  repx3: {
    monthly: {
      amount: 19700, // $197.00 in cents
      priceId: process.env.STRIPE_REPX3_MONTHLY_PRICE_ID || 'price_repx3_monthly_placeholder'
    },
    annual: {
      amount: 197000, // $1970.00 in cents
      priceId: process.env.STRIPE_REPX3_ANNUAL_PRICE_ID || 'price_repx3_annual_placeholder'
    }
  },
  repx4: {
    monthly: {
      amount: 39700, // $397.00 in cents
      priceId: process.env.STRIPE_REPX4_MONTHLY_PRICE_ID || 'price_repx4_monthly_placeholder'
    },
    annual: {
      amount: 397000, // $3970.00 in cents
      priceId: process.env.STRIPE_REPX4_ANNUAL_PRICE_ID || 'price_repx4_annual_placeholder'
    }
  },
  repx5: {
    monthly: {
      amount: 69700, // $697.00 in cents
      priceId: process.env.STRIPE_REPX5_MONTHLY_PRICE_ID || 'price_repx5_monthly_placeholder'
    },
    annual: {
      amount: 697000, // $6970.00 in cents
      priceId: process.env.STRIPE_REPX5_ANNUAL_PRICE_ID || 'price_repx5_annual_placeholder'
    }
  }
};

/**
 * Create Stripe checkout session for RepX subscription tiers
 * POST /api/stripe/create-checkout-session
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { tier, billingCycle, priceId, customerEmail, successUrl, cancelUrl } = req.body;

    console.log('🔥 Creating RepX checkout session:', { tier, billingCycle, priceId, customerEmail });

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
    console.error('❌ Error creating RepX checkout session:', error);
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

    console.log('🔍 Looking up subscription for:', customer_email);

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
    console.error('❌ Error fetching subscription:', error);
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
    console.error('❌ Error fetching RepX pricing:', error);
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
    console.error('❌ Error canceling subscription:', error);
    return res.status(500).json(errorResponse('CANCELLATION_ERROR', 'Failed to cancel subscription', error.message, 500));
  }
});

export default router;