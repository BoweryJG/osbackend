import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getRepXTier(userId) {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return 'repx0'; // Default to free tier
    }

    return data.subscription_tier || 'repx0';
  } catch (error) {
    console.error('Error getting RepX tier:', error);
    return 'repx0';
  }
}

export const REPX_FEATURES = {
  repx0: {
    emailAccess: false,
    emailLimit: 0,
    phoneAccess: false,
    gmailIntegration: false,
    whiteLabel: false,
    agentTimeLimit: 30 // seconds
  },
  repx1: {
    emailAccess: true,
    emailLimit: 100, // per month
    phoneAccess: false,
    gmailIntegration: false,
    whiteLabel: false,
    agentTimeLimit: 60 // seconds
  },
  repx2: {
    emailAccess: true,
    emailLimit: 500, // per month via SendGrid
    phoneAccess: true,
    gmailIntegration: false,
    whiteLabel: false,
    agentTimeLimit: 300 // 5 minutes
  },
  repx3: {
    emailAccess: true,
    emailLimit: 2000, // per month via SendGrid
    phoneAccess: true,
    phoneAutoProvisioning: true,
    gmailIntegration: false,
    whiteLabel: false,
    agentTimeLimit: 900 // 15 minutes
  },
  repx4: {
    emailAccess: true,
    emailLimit: null, // Unlimited via Vultr SMTP
    phoneAccess: true,
    phoneAutoProvisioning: true,
    gmailIntegration: true,
    whiteLabel: false,
    agentTimeLimit: 1800 // 30 minutes
  },
  repx5: {
    emailAccess: true,
    emailLimit: null, // Unlimited via Vultr SMTP
    phoneAccess: true,
    phoneAutoProvisioning: true,
    gmailIntegration: true,
    whiteLabel: true,
    agentTimeLimit: -1 // Unlimited
  }
};

export async function checkFeatureAccess(userId, feature) {
  const tier = await getRepXTier(userId);
  const tierFeatures = REPX_FEATURES[tier] || REPX_FEATURES.repx0;
  
  return !!tierFeatures[feature];
}

export function getTierName(tier) {
  const names = {
    repx0: 'RepX0 Free',
    repx1: 'RepX1 Explorer',
    repx2: 'RepX2 Professional', 
    repx3: 'RepX3 Business',
    repx4: 'RepX4 Enterprise',
    repx5: 'RepX5 Elite'
  };
  
  return names[tier] || 'RepX0 Free';
}