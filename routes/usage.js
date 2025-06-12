import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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

    res.json(usage);
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// Increment usage for a specific feature
router.post('/increment', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { feature } = req.body;
    
    if (!feature) {
      return res.status(400).json({ error: 'Feature is required' });
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
      return res.status(403).json({ 
        error: 'Usage limit reached',
        current,
        limit,
        tier
      });
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

    res.json({ 
      success: true, 
      usage: data,
      remaining: limit === -1 ? 'unlimited' : limit - (current + 1)
    });
  } catch (error) {
    console.error('Error incrementing usage:', error);
    res.status(500).json({ error: 'Failed to increment usage' });
  }
});

// Check if user can use a feature
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { feature } = req.body;
    
    if (!feature) {
      return res.status(400).json({ error: 'Feature is required' });
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

    res.json({
      canUse,
      current,
      limit,
      remaining: limit === -1 ? 'unlimited' : limit - current,
      percentage,
      tier,
      shouldShowUpgrade: percentage >= 80 && percentage < 100,
    });
  } catch (error) {
    console.error('Error checking usage:', error);
    res.status(500).json({ error: 'Failed to check usage' });
  }
});

// Helper function to get tier limits
function getTierLimits(tier) {
  const limits = {
    free: {
      canvas_briefs: 3,
      ai_prompts: 2,
      call_analyses: 1,
      market_procedures: 20,
      contacts_generated: 5,
      ripples_sent: 3,
    },
    explorer: {
      canvas_briefs: 25,
      ai_prompts: 5,
      call_analyses: 5,
      market_procedures: 100,
      contacts_generated: 10,
      ripples_sent: 25,
    },
    professional: {
      canvas_briefs: 50,
      ai_prompts: 50,
      call_analyses: 10,
      market_procedures: 500,
      contacts_generated: 25,
      ripples_sent: 50,
    },
    growth: {
      canvas_briefs: 100,
      ai_prompts: -1, // unlimited
      call_analyses: 50,
      market_procedures: -1,
      contacts_generated: 50,
      ripples_sent: 100,
    },
    enterprise: {
      canvas_briefs: -1,
      ai_prompts: -1,
      call_analyses: -1,
      market_procedures: -1,
      contacts_generated: 100,
      ripples_sent: -1,
    },
    elite: {
      canvas_briefs: -1,
      ai_prompts: -1,
      call_analyses: -1,
      market_procedures: -1,
      contacts_generated: -1,
      ripples_sent: -1,
    },
  };

  return limits[tier] || limits.free;
}

export default router;