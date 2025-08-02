#!/usr/bin/env node

import io from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RealtimeAnalysisAgent {
  constructor() {
    this.agentId = 'analysis';
    this.socket = null;
    this.progress = 0;
  }
  
  async connect() {
    this.socket = io(`http://localhost:${process.env.ORCHESTRATOR_PORT || 9090}`);
    
    this.socket.on('connect', () => {
      console.log('Connected to orchestrator');
      this.socket.emit('agent:register', {
        agentId: this.agentId,
        type: 'analysis',
        capabilities: ['call-analysis', 'coaching-triggers', 'real-time-monitoring']
      });
    });
    
    this.socket.on('shutdown', () => {
      process.exit(0);
    });
  }
  
  reportProgress(task, progress, eta) {
    this.socket.emit('progress', {
      agentId: this.agentId,
      task,
      progress,
      eta
    });
  }
  
  async execute() {
    await this.connect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create real-time call analyzer
    await this.createRealtimeCallAnalyzer();
    
    // Create coaching trigger engine
    await this.createCoachingTriggerEngine();
    
    console.log('✅ Real-Time Analysis Agent: All tasks completed');
  }
  
  async createRealtimeCallAnalyzer() {
    console.log('📝 Creating real-time call analyzer...');
    this.reportProgress('realtime-call-analyzer', 10, '25 minutes');
    
    const analyzerContent = `import EventEmitter from 'events';
import { createClient } from '@supabase/supabase-js';
import natural from 'natural';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Real-time Call Analyzer
 * Analyzes conversations in real-time and triggers coaching interventions
 */
class RealtimeCallAnalyzer extends EventEmitter {
  constructor() {
    super();
    this.activeSessions = new Map();
    this.sentimentAnalyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    this.triggerEngine = null; // Will be set by coaching trigger engine
  }
  
  async startAnalysis(config) {
    const { conferenceId, coachId, repPhone } = config;
    const analysisId = \`analysis-\${Date.now()}\`;
    
    const session = {
      id: analysisId,
      conferenceId,
      coachId,
      repPhone,
      startTime: Date.now(),
      
      // Metrics
      talkRatio: { rep: 0, client: 0 },
      sentiment: { overall: 0, trend: [] },
      keyPhrases: new Map(),
      objectionCount: 0,
      questionCount: 0,
      
      // Triggers
      triggersActivated: [],
      coachingDelivered: 0
    };
    
    this.activeSessions.set(analysisId, session);
    
    // Start monitoring
    this.monitorConversation(session);
    
    return { id: analysisId };
  }
  
  async analyzeTranscript(sessionId, speaker, text) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    // Update talk ratio
    const words = text.split(' ').length;
    if (speaker === 'rep') {
      session.talkRatio.rep += words;
    } else {
      session.talkRatio.client += words;
    }
    
    // Sentiment analysis
    const sentiment = this.sentimentAnalyzer.getSentiment(text.split(' '));
    session.sentiment.trend.push({ 
      speaker, 
      sentiment, 
      timestamp: Date.now() 
    });
    session.sentiment.overall = this.calculateOverallSentiment(session.sentiment.trend);
    
    // Detect key phrases
    this.detectKeyPhrases(text, session);
    
    // Detect objections
    if (this.isObjection(text)) {
      session.objectionCount++;
      this.emit('objection-detected', {
        sessionId,
        text,
        count: session.objectionCount
      });
    }
    
    // Detect questions
    if (text.includes('?')) {
      session.questionCount++;
    }
    
    // Check for coaching triggers
    await this.checkTriggers(session, speaker, text);
    
    // Save analysis
    await this.saveAnalysis(session);
  }
  
  detectKeyPhrases(text, session) {
    const keywords = [
      'price', 'cost', 'expensive', 'budget',
      'competitor', 'alternative', 'other options',
      'think about it', 'not sure', 'maybe later',
      'decision maker', 'approval', 'committee'
    ];
    
    keywords.forEach(keyword => {
      if (text.toLowerCase().includes(keyword)) {
        const count = session.keyPhrases.get(keyword) || 0;
        session.keyPhrases.set(keyword, count + 1);
      }
    });
  }
  
  isObjection(text) {
    const objectionPatterns = [
      'too expensive',
      'not in our budget',
      'need to think',
      'not the right time',
      'already have',
      'don\'t need',
      'maybe later',
      'not interested'
    ];
    
    const lowerText = text.toLowerCase();
    return objectionPatterns.some(pattern => lowerText.includes(pattern));
  }
  
  async checkTriggers(session, speaker, text) {
    if (!this.triggerEngine) return;
    
    const context = {
      talkRatio: this.calculateTalkRatioBalance(session.talkRatio),
      sentiment: session.sentiment.overall,
      objectionCount: session.objectionCount,
      currentText: text,
      speaker,
      duration: Math.floor((Date.now() - session.startTime) / 1000)
    };
    
    const triggers = await this.triggerEngine.evaluateTriggers(context);
    
    triggers.forEach(trigger => {
      if (!session.triggersActivated.includes(trigger.id)) {
        session.triggersActivated.push(trigger.id);
        
        this.emit('coaching-trigger', {
          sessionId: session.id,
          trigger,
          context
        });
      }
    });
  }
  
  calculateTalkRatioBalance(talkRatio) {
    const total = talkRatio.rep + talkRatio.client;
    if (total === 0) return 0.5;
    return talkRatio.rep / total;
  }
  
  calculateOverallSentiment(trend) {
    if (trend.length === 0) return 0;
    
    // Weight recent sentiment more heavily
    let weightedSum = 0;
    let weightTotal = 0;
    
    trend.slice(-10).forEach((item, index) => {
      const weight = (index + 1) / 10;
      weightedSum += item.sentiment * weight;
      weightTotal += weight;
    });
    
    return weightedSum / weightTotal;
  }
  
  async saveAnalysis(session) {
    try {
      await supabase.from('call_analysis').upsert({
        id: session.id,
        conference_id: session.conferenceId,
        talk_ratio: session.talkRatio,
        sentiment_score: session.sentiment.overall,
        objection_count: session.objectionCount,
        question_count: session.questionCount,
        key_phrases: Object.fromEntries(session.keyPhrases),
        triggers_activated: session.triggersActivated,
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error saving analysis:', error);
    }
  }
  
  monitorConversation(session) {
    // Set up periodic analysis
    const interval = setInterval(() => {
      if (!this.activeSessions.has(session.id)) {
        clearInterval(interval);
        return;
      }
      
      // Check conversation health
      this.checkConversationHealth(session);
      
    }, 10000); // Every 10 seconds
  }
  
  checkConversationHealth(session) {
    const talkBalance = this.calculateTalkRatioBalance(session.talkRatio);
    
    // Rep talking too much
    if (talkBalance > 0.7) {
      this.emit('conversation-imbalance', {
        sessionId: session.id,
        issue: 'rep-dominant',
        balance: talkBalance
      });
    }
    
    // Rep not talking enough
    if (talkBalance < 0.3) {
      this.emit('conversation-imbalance', {
        sessionId: session.id,
        issue: 'rep-passive',
        balance: talkBalance
      });
    }
    
    // Sentiment declining
    if (session.sentiment.overall < -0.5) {
      this.emit('sentiment-alert', {
        sessionId: session.id,
        sentiment: session.sentiment.overall,
        trend: 'negative'
      });
    }
  }
  
  endAnalysis(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    // Final analysis
    const summary = {
      duration: Math.floor((Date.now() - session.startTime) / 1000),
      talkBalance: this.calculateTalkRatioBalance(session.talkRatio),
      finalSentiment: session.sentiment.overall,
      totalObjections: session.objectionCount,
      totalQuestions: session.questionCount,
      topKeyPhrases: Array.from(session.keyPhrases.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      coachingDelivered: session.coachingDelivered
    };
    
    this.activeSessions.delete(sessionId);
    
    return summary;
  }
  
  setTriggerEngine(engine) {
    this.triggerEngine = engine;
  }
}

// Export singleton
const realtimeCallAnalyzer = new RealtimeCallAnalyzer();
export default realtimeCallAnalyzer;`;
    
    await fs.writeFile(
      path.join(__dirname, '../services/realtimeCallAnalyzer.js'),
      analyzerContent
    );
    
    this.reportProgress('realtime-call-analyzer', 100, '0 minutes');
    this.socket.emit('task:complete', {
      agentId: this.agentId,
      taskId: 'realtime-call-analyzer'
    });
  }
  
  async createCoachingTriggerEngine() {
    console.log('📝 Creating coaching trigger engine...');
    this.reportProgress('coaching-trigger-engine', 10, '20 minutes');
    
    const engineContent = `import { createClient } from '@supabase/supabase-js';
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
          console.error(\`Error loading trigger \${trigger.id}:\`, error);
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
export default coachingTriggerEngine;`;
    
    await fs.writeFile(
      path.join(__dirname, '../services/coachingTriggerEngine.js'),
      engineContent
    );
    
    this.reportProgress('coaching-trigger-engine', 100, '0 minutes');
    this.socket.emit('task:complete', {
      agentId: this.agentId,
      taskId: 'coaching-trigger-engine'
    });
  }
}

// Run the agent
const agent = new RealtimeAnalysisAgent();
agent.execute().catch(console.error);