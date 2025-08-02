import { createClient } from '@supabase/supabase-js';
import realtimeCallAnalyzer from './realtimeCallAnalyzer.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Coaching Trigger Engine
 * Determines when to deliver coaching interventions
 */
class CoachingTriggerEngine {
  constructor() {
    this.triggers = this.loadTriggers();
    this.cooldowns = new Map(); // Prevent trigger spam
    
    // Connect to analyzer
    realtimeCallAnalyzer.setTriggerEngine(this);
  }
  
  loadTriggers() {
    return [
      {
        id: 'talk-too-much',
        name: 'Rep Talking Too Much',
        condition: (context) => context.talkRatio > 0.7,
        message: 'You're doing 70% of the talking. Ask a question and let them speak.',
        severity: 'medium',
        cooldown: 60 // seconds
      },
      {
        id: 'multiple-objections',
        name: 'Multiple Objections',
        condition: (context) => context.objectionCount >= 3,
        message: 'Three objections already. Stop pitching and start diagnosing the real concern.',
        severity: 'high',
        cooldown: 120
      },
      {
        id: 'negative-sentiment',
        name: 'Conversation Going South',
        condition: (context) => context.sentiment < -0.5,
        message: 'They're losing interest. Change direction. Ask about their biggest challenge.',
        severity: 'high',
        cooldown: 90
      },
      {
        id: 'price-objection',
        name: 'Price Objection Detected',
        condition: (context) => context.currentText.toLowerCase().includes('expensive') || 
                                context.currentText.toLowerCase().includes('cost'),
        message: 'Price objection. Redirect to value. "Let's talk about ROI..."',
        severity: 'medium',
        cooldown: 180
      },
      {
        id: 'long-monologue',
        name: 'Monologuing',
        condition: (context) => context.speaker === 'rep' && context.currentText.length > 500,
        message: 'You're monologuing. Wrap it up with a question.',
        severity: 'low',
        cooldown: 60
      },
      {
        id: 'no-questions',
        name: 'Not Asking Questions',
        condition: (context) => context.duration > 180 && context.questionCount === 0,
        message: 'Three minutes and no questions? You're presenting, not selling.',
        severity: 'high',
        cooldown: 300
      }
    ];
  }
  
  async evaluateTriggers(context) {
    const activeTriggers = [];
    const now = Date.now();
    
    for (const trigger of this.triggers) {
      // Check cooldown
      const lastTriggered = this.cooldowns.get(trigger.id) || 0;
      if (now - lastTriggered < trigger.cooldown * 1000) {
        continue;
      }
      
      // Evaluate condition
      if (trigger.condition(context)) {
        activeTriggers.push(trigger);
        this.cooldowns.set(trigger.id, now);
        
        // Log trigger activation
        await this.logTrigger(trigger, context);
      }
    }
    
    return activeTriggers;
  }
  
  async logTrigger(trigger, context) {
    try {
      await supabase.from('coaching_triggers_log').insert({
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        context,
        activated_at: new Date()
      });
    } catch (error) {
      console.error('Error logging trigger:', error);
    }
  }
  
  // Dynamic trigger management
  async addCustomTrigger(trigger) {
    // Validate trigger
    if (!trigger.id || !trigger.condition || !trigger.message) {
      throw new Error('Invalid trigger format');
    }
    
    this.triggers.push(trigger);
    
    // Save to database
    await supabase.from('custom_coaching_triggers').insert({
      id: trigger.id,
      name: trigger.name,
      condition_code: trigger.condition.toString(),
      message: trigger.message,
      severity: trigger.severity,
      cooldown: trigger.cooldown
    });
  }
  
  async loadCustomTriggers() {
    try {
      const { data: customTriggers } = await supabase
        .from('custom_coaching_triggers')
        .select('*')
        .eq('is_active', true);
      
      customTriggers?.forEach(trigger => {
        // Safely evaluate condition function
        try {
          const condition = new Function('context', trigger.condition_code);
          this.triggers.push({
            ...trigger,
            condition
          });
        } catch (error) {
          console.error(`Error loading trigger ${trigger.id}:`, error);
        }
      });
    } catch (error) {
      console.error('Error loading custom triggers:', error);
    }
  }
  
  // Get trigger statistics
  async getTriggerStats(timeframe = '24h') {
    const since = new Date();
    if (timeframe === '24h') {
      since.setHours(since.getHours() - 24);
    } else if (timeframe === '7d') {
      since.setDate(since.getDate() - 7);
    }
    
    const { data: stats } = await supabase
      .from('coaching_triggers_log')
      .select('trigger_id, trigger_name')
      .gte('activated_at', since.toISOString())
      .order('activated_at', { ascending: false });
    
    // Count by trigger
    const counts = {};
    stats?.forEach(log => {
      counts[log.trigger_name] = (counts[log.trigger_name] || 0) + 1;
    });
    
    return {
      timeframe,
      totalTriggers: stats?.length || 0,
      byTrigger: counts,
      mostCommon: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    };
  }
}

// Export singleton
const coachingTriggerEngine = new CoachingTriggerEngine();
export default coachingTriggerEngine;