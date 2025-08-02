import EventEmitter from 'events';
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
    const analysisId = `analysis-${Date.now()}`;
    
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
      "don't need",
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
export default realtimeCallAnalyzer;