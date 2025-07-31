import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

import { provisionTwilioForUser } from '../twilio_auto_provisioning.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Price ID to tier mapping (July 30, 2025)
const PRICE_TO_TIER = {
  // Rep¹ - Monthly & Annual
  'price_1RqhStGRiAPUZqWutwNBJlnr': 'repx1',
  'price_1RqhStGRiAPUZqWu8eRYprp6': 'repx1',
  // Rep² - Monthly & Annual
  'price_1RqhSuGRiAPUZqWu29dIsVGz': 'repx2',
  'price_1RqhSuGRiAPUZqWu0nHKxkmp': 'repx2',
  // Rep³ - Monthly & Annual
  'price_1RqhSvGRiAPUZqWuygjxykuG': 'repx3',
  'price_1RqhSvGRiAPUZqWuuvRB2q20': 'repx3',
  // Rep⁴ - Monthly & Annual
  'price_1RqhSvGRiAPUZqWu6YlhyKE2': 'repx4',
  'price_1RqhSwGRiAPUZqWuJmTnpUXw': 'repx4',
  // Rep⁵ - Monthly & Annual
  'price_1RqhSwGRiAPUZqWuAJzj4tw5': 'repx5',
  'price_1RqhSwGRiAPUZqWump7raV5n': 'repx5'
};

/**
 * Get tier from price ID
 */
function getTierFromPriceId(priceId) {
  return PRICE_TO_TIER[priceId] || null;
}

// Stripe webhook endpoint
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    logger.error('❌ Stripe webhook secret not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error(`❌ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`📨 Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error(`❌ Error processing webhook: ${error.message}`);
    res.status(500).send(`Webhook handler error: ${error.message}`);
  }
});

/**
 * Handle checkout session completed
 */
async function handleCheckoutSessionCompleted(session) {
  try {
    logger.info('💳 Processing checkout session:', {
      id: session.id,
      customerEmail: session.customer_email,
      metadata: session.metadata
    });

    // Get the full session with line items
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items', 'subscription']
    });

    const customerEmail = session.customer_email;
    let tier = session.metadata?.repx_tier || session.metadata?.tier;
    const subscriptionId = fullSession.subscription?.id || session.subscription;

    // If tier not in metadata, try to get from price ID
    if (!tier && fullSession.line_items?.data?.length > 0) {
      const priceId = fullSession.line_items.data[0].price?.id;
      if (priceId) {
        tier = getTierFromPriceId(priceId);
        logger.info(`Determined tier ${tier} from price ID ${priceId}`);
      }
    }

    if (!customerEmail || !tier) {
      logger.warn('⚠️ Missing customer email or tier in checkout session');
      return;
    }

    // Find or create user in Supabase
    let user;
    const { data: existingUser } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (existingUser) {
      user = existingUser;
    } else {
      // Create user record if doesn't exist
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: customerEmail,
        email_confirm: true
      });

      if (createError) {
        logger.error('Error creating user:', createError);
        return;
      }
      user = newUser.user;
    }

    // Update user subscription in database
    const { error: subError } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: user.id,
        email: customerEmail,
        subscription_tier: tier,
        subscription_status: 'active',
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: session.customer,
        status: 'active',
        is_active: true,
        current_period_start: fullSession.subscription?.current_period_start ? 
          new Date(fullSession.subscription.current_period_start * 1000).toISOString() : new Date().toISOString(),
        current_period_end: fullSession.subscription?.current_period_end ? 
          new Date(fullSession.subscription.current_period_end * 1000).toISOString() : null
      }, {
        onConflict: 'user_id'
      });

    if (subError) {
      logger.error('Error updating subscription:', subError);
      return;
    }

    // Auto-provision Twilio for RepX3+ subscribers (phone features)
    const twilioEligibleTiers = ['repx3', 'repx4', 'repx5'];
    if (twilioEligibleTiers.includes(tier)) {
      logger.info('📱 Auto-provisioning Twilio for new subscriber');
      
      try {
        await provisionTwilioForUser(user.id, customerEmail, tier);
        logger.info('✅ Twilio provisioned successfully');
      } catch (twilioError) {
        logger.error('❌ Failed to provision Twilio:', twilioError);
        // Don't fail the webhook - user can retry provisioning later
      }
    }

    logger.info('✅ Checkout session processed successfully');
  } catch (error) {
    logger.error('❌ Error handling checkout session:', error);
    throw error;
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription) {
  try {
    logger.info('🔄 Processing subscription update:', {
      id: subscription.id,
      status: subscription.status,
      metadata: subscription.metadata
    });

    // Get customer
    const customer = await stripe.customers.retrieve(subscription.customer);
    const customerEmail = customer.email;
    let tier = subscription.metadata?.repx_tier || subscription.metadata?.tier;

    // If tier not in metadata, try to get from price ID
    if (!tier && subscription.items?.data?.length > 0) {
      const priceId = subscription.items.data[0].price?.id;
      if (priceId) {
        tier = getTierFromPriceId(priceId);
        logger.info(`Determined tier ${tier} from price ID ${priceId}`);
      }
    }

    if (!customerEmail) {
      logger.warn('⚠️ No email found for customer');
      return;
    }

    // Find user
    const { data: user } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (!user) {
      logger.warn('⚠️ User not found for email:', customerEmail);
      return;
    }

    // Update subscription record
    const { error } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: user.id,
        email: customerEmail,
        plan_id: tier || 'unknown',
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      logger.error('Error updating subscription:', error);
    }

    logger.info('✅ Subscription updated successfully');

    // Check if this is an upgrade that needs Twilio provisioning
    if (subscription.status === 'active' && tier) {
      const twilioEligibleTiers = ['repx3', 'repx4', 'repx5'];
      
      // Check if user already has Twilio configured
      const { data: twilioConfig } = await supabase
        .from('user_twilio_config')
        .select('phone_number')
        .eq('user_id', user.id)
        .single();

      // If upgrading to Rep³+ and no phone number yet, provision Twilio
      if (twilioEligibleTiers.includes(tier) && !twilioConfig?.phone_number) {
        logger.info('📱 Auto-provisioning Twilio for upgraded subscriber');
        
        try {
          await provisionTwilioForUser(user.id, customerEmail, tier);
          logger.info('✅ Twilio provisioned successfully for upgrade');
        } catch (twilioError) {
          logger.error('❌ Failed to provision Twilio on upgrade:', twilioError);
          // Don't fail the webhook - user can retry provisioning later
        }
      }
    }
  } catch (error) {
    logger.error('❌ Error handling subscription update:', error);
    throw error;
  }
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription) {
  try {
    logger.info('🗑️ Processing subscription deletion:', {
      id: subscription.id,
      metadata: subscription.metadata
    });

    // Get customer
    const customer = await stripe.customers.retrieve(subscription.customer);
    const customerEmail = customer.email;

    if (!customerEmail) {
      logger.warn('⚠️ No email found for customer');
      return;
    }

    // Find user
    const { data: user } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (!user) {
      logger.warn('⚠️ User not found for email:', customerEmail);
      return;
    }

    // Update subscription to cancelled/free
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        plan_id: 'free',
        status: 'cancelled',
        stripe_subscription_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (error) {
      logger.error('Error updating cancelled subscription:', error);
    }

    // Suspend Twilio service
    const { suspendUserTwilioService } = await import('../twilio_auto_provisioning.js');
    try {
      await suspendUserTwilioService(user.id);
      logger.info('✅ Twilio service suspended');
    } catch (twilioError) {
      logger.error('❌ Failed to suspend Twilio service:', twilioError);
    }

    logger.info('✅ Subscription cancelled successfully');
  } catch (error) {
    logger.error('❌ Error handling subscription deletion:', error);
    throw error;
  }
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaymentSucceeded(invoice) {
  try {
    logger.info('💰 Processing successful payment:', {
      id: invoice.id,
      amount: invoice.amount_paid,
      customerEmail: invoice.customer_email
    });

    // Log payment for tracking
    if (invoice.customer_email) {
      const { data: user } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', invoice.customer_email)
        .single();

      if (user) {
        await supabase.from('usage_tracking').insert({
          user_id: user.id,
          email: invoice.customer_email,
          feature_type: 'subscription_payment',
          quantity: invoice.amount_paid,
          subscription_tier: invoice.lines?.data?.[0]?.metadata?.tier || 'unknown',
          app_name: 'repconnect',
          metadata: {
            invoice_id: invoice.id,
            currency: invoice.currency,
            payment_intent: invoice.payment_intent
          }
        });
      }
    }

    logger.info('✅ Payment recorded successfully');
  } catch (error) {
    logger.error('❌ Error handling invoice payment:', error);
    // Don't throw - this is not critical
  }
}

export default router;