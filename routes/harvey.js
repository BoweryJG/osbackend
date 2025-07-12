import express from 'express';
import { authenticateUser } from '../auth.js';
import HarveyVoiceService from '../services/harveyVoiceService.js';

const router = express.Router();
const harveyVoice = new HarveyVoiceService();

// In-memory storage for Harvey metrics (in production, use database)
const userMetrics = new Map();
const dailyVerdicts = new Map();

// Helper function to get leaderboard data
async function getLeaderboardData() {
  const leaderboard = Array.from(userMetrics.entries())
    .map(([userId, metrics]) => ({
      userId,
      name: userId === 'demo-user' ? 'Demo User' : `User ${userId.slice(-4)}`,
      reputationPoints: metrics.reputationPoints,
      closingRate: metrics.closingRate,
      currentStreak: metrics.currentStreak,
      status: metrics.status,
      totalCalls: metrics.totalCalls
    }))
    .sort((a, b) => b.reputationPoints - a.reputationPoints)
    .slice(0, 10);
  
  // Add fake competitors if not enough real users
  if (leaderboard.length < 5) {
    const fakeCompetitors = [
      { userId: 'harvey-1', name: 'Mike Ross', reputationPoints: 4500, closingRate: 82, currentStreak: 12, status: 'partner', totalCalls: 342 },
      { userId: 'harvey-2', name: 'Rachel Zane', reputationPoints: 3800, closingRate: 78, currentStreak: 8, status: 'closer', totalCalls: 256 },
      { userId: 'harvey-3', name: 'Donna Paulsen', reputationPoints: 5200, closingRate: 89, currentStreak: 18, status: 'legend', totalCalls: 489 },
      { userId: 'harvey-4', name: 'Louis Litt', reputationPoints: 3200, closingRate: 71, currentStreak: 5, status: 'closer', totalCalls: 198 },
      { userId: 'harvey-5', name: 'Jessica Pearson', reputationPoints: 6000, closingRate: 92, currentStreak: 25, status: 'legend', totalCalls: 612 }
    ];
    
    leaderboard.push(...fakeCompetitors.slice(0, 5 - leaderboard.length));
    leaderboard.sort((a, b) => b.reputationPoints - a.reputationPoints);
  }
  
  // Map reputationPoints to points and add rank
  return leaderboard.map((entry, index) => ({
    ...entry,
    points: entry.reputationPoints, // Add points field
    rank: index + 1, // Add rank based on position
    id: entry.userId // Add id field for React key
  }));
}

// Harvey metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    // Get or create user metrics
    let metrics = userMetrics.get(userId);
    if (!metrics) {
      metrics = {
        reputationPoints: 1000,
        currentStreak: 0,
        bestStreak: 0,
        totalCalls: 0,
        successfulCalls: 0,
        closingRate: 0,
        status: 'rookie',
        joinDate: new Date().toISOString(),
        lastCallDate: null,
        achievements: [],
        monthlyStats: {
          calls: 0,
          conversions: 0,
          revenue: 0
        }
      };
      userMetrics.set(userId, metrics);
    }
    
    // Get leaderboard data
    const leaderboard = await getLeaderboardData();
    
    res.json({
      metrics: {
        ...metrics,
        harveyStatus: metrics.status, // Ensure harveyStatus is set
        dailyVerdict: null // Will be fetched separately
      },
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching Harvey metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Harvey daily verdict endpoint with voice
router.get('/verdict', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const today = new Date().toDateString();
    const key = `${userId}-${today}`;
    
    // Check if verdict already exists for today
    let verdict = dailyVerdicts.get(key);
    if (!verdict) {
      // Get user metrics to generate contextual verdict
      const metrics = userMetrics.get(userId) || {
        closingRate: 50,
        currentStreak: 0,
        totalCalls: 0,
        userName: 'Rookie'
      };
      
      // Generate verdict with voice
      verdict = await harveyVoice.generateVerdict(metrics);
      verdict.date = new Date().toISOString();
      verdict.userId = userId;
      
      // Add advice based on performance
      if (metrics.closingRate < 60) {
        verdict.advice = "Focus on objection handling. Winners don't accept 'maybe' as an answer.";
        verdict.tone = 'critical';
      } else if (metrics.closingRate < 80) {
        verdict.advice = "Your follow-up game needs work. Persistence separates closers from order-takers.";
        verdict.tone = 'challenging';
      } else {
        verdict.advice = "You're performing well. Now raise your targets. Complacency kills careers.";
        verdict.tone = 'motivational';
      }
      
      dailyVerdicts.set(key, verdict);
    }
    
    res.json(verdict);
  } catch (error) {
    console.error('Error getting Harvey verdict:', error);
    res.status(500).json({ error: 'Failed to get verdict' });
  }
});

// Update metrics endpoint
router.post('/metrics', async (req, res) => {
  try {
    const { userId, updates } = req.body;
    const userIdKey = userId || 'demo-user';
    
    let metrics = userMetrics.get(userIdKey) || {
      reputationPoints: 1000,
      currentStreak: 0,
      bestStreak: 0,
      totalCalls: 0,
      successfulCalls: 0,
      closingRate: 0,
      status: 'rookie',
      joinDate: new Date().toISOString(),
      lastCallDate: null,
      achievements: [],
      monthlyStats: {
        calls: 0,
        conversions: 0,
        revenue: 0
      }
    };
    
    // Apply updates
    if (updates.callCompleted) {
      metrics.totalCalls++;
      metrics.monthlyStats.calls++;
      metrics.lastCallDate = new Date().toISOString();
      
      if (updates.successful) {
        metrics.successfulCalls++;
        metrics.monthlyStats.conversions++;
        metrics.currentStreak++;
        metrics.reputationPoints += 50;
        
        if (metrics.currentStreak > metrics.bestStreak) {
          metrics.bestStreak = metrics.currentStreak;
        }
      } else {
        metrics.currentStreak = 0;
        metrics.reputationPoints -= 10;
      }
      
      // Update closing rate
      metrics.closingRate = metrics.totalCalls > 0 
        ? Math.round((metrics.successfulCalls / metrics.totalCalls) * 100)
        : 0;
      
      // Update status based on performance
      if (metrics.reputationPoints >= 5000 && metrics.closingRate >= 85) {
        metrics.status = 'legend';
      } else if (metrics.reputationPoints >= 3000 && metrics.closingRate >= 75) {
        metrics.status = 'partner';
      } else if (metrics.reputationPoints >= 1500 && metrics.closingRate >= 60) {
        metrics.status = 'closer';
      } else {
        metrics.status = 'rookie';
      }
    }
    
    if (updates.revenue) {
      metrics.monthlyStats.revenue += updates.revenue;
    }
    
    userMetrics.set(userIdKey, metrics);
    res.json(metrics);
  } catch (error) {
    console.error('Error updating Harvey metrics:', error);
    res.status(500).json({ error: 'Failed to update metrics' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await getLeaderboardData();
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Submit voice command with audio response
router.post('/voice-command', async (req, res) => {
  try {
    const { command, userId } = req.body;
    const userIdKey = userId || 'demo-user';
    
    // Process command and generate audio response
    let responseType = 'custom';
    let responseText = '';
    let action = null;
    
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('status') || lowerCommand.includes('metrics')) {
      responseType = 'custom';
      responseText = 'Your metrics are displayed on the dashboard. Numbers don\'t lie, even when you do.';
      action = 'show-metrics';
    } else if (lowerCommand.includes('help')) {
      responseType = 'custom';
      responseText = 'Help? Winners figure it out. But fine - say status, battle mode, or coaching.';
      action = 'show-help';
    } else if (lowerCommand.includes('battle')) {
      responseType = 'battle';
      action = 'enter-battle';
    } else if (lowerCommand.includes('coaching on')) {
      responseType = 'custom';
      responseText = 'Coaching activated. I\'ll make sure you don\'t embarrass yourself.';
      action = 'enable-coaching';
    } else if (lowerCommand.includes('coaching off')) {
      responseType = 'custom';
      responseText = 'Going solo? Your funeral. Don\'t come crying when you fail.';
      action = 'disable-coaching';
    } else {
      responseText = "Speak clearly or don't speak at all. I don't have time for mumbling.";
    }
    
    // Generate audio response
    const audioResponse = await harveyVoice.generateHarveyResponse(
      responseType,
      { text: responseText }
    );
    
    // Synthesize voice
    const voice = await harveyVoice.synthesizeVoice(audioResponse.text);
    
    res.json({ 
      response: audioResponse.text,
      audio: voice.audio,
      command,
      action,
      processed: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing voice command:', error);
    res.status(500).json({ error: 'Failed to process command' });
  }
});

// Get coaching status
router.get('/coaching-status', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    // In a real implementation, this would be stored in a database
    res.json({
      enabled: true,
      mode: 'aggressive',
      realTimeEnabled: true,
      publicShamingEnabled: false,
      battleModeEnabled: true
    });
  } catch (error) {
    console.error('Error fetching coaching status:', error);
    res.status(500).json({ error: 'Failed to fetch coaching status' });
  }
});

// Update coaching settings
router.post('/coaching-settings', async (req, res) => {
  try {
    const { userId, settings } = req.body;
    
    // In a real implementation, save to database
    res.json({ 
      success: true, 
      settings,
      message: 'Coaching settings updated. Now get back to work.'
    });
  } catch (error) {
    console.error('Error updating coaching settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Real-time coaching audio endpoint
router.post('/coaching-audio', async (req, res) => {
  try {
    const { voiceAnalysis, userId } = req.body;
    
    // Generate coaching based on voice analysis
    const coachingAudio = await harveyVoice.generateCoachingAudio(voiceAnalysis);
    
    res.json(coachingAudio);
  } catch (error) {
    console.error('Error generating coaching audio:', error);
    res.status(500).json({ error: 'Failed to generate coaching' });
  }
});

// Call analysis endpoint
router.post('/analyze-call', async (req, res) => {
  try {
    const { transcript, phase, userId } = req.body;
    
    // Analyze call segment and generate feedback
    const analysis = await harveyVoice.analyzeCallSegment(transcript, phase);
    
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing call:', error);
    res.status(500).json({ error: 'Failed to analyze call' });
  }
});

// Battle mode audio endpoint
router.post('/battle-audio', async (req, res) => {
  try {
    const { event, participants } = req.body;
    
    // Generate battle mode audio
    const battleAudio = await harveyVoice.generateBattleModeAudio(event, participants);
    
    res.json(battleAudio);
  } catch (error) {
    console.error('Error generating battle audio:', error);
    res.status(500).json({ error: 'Failed to generate battle audio' });
  }
});

// Get Harvey greeting audio
router.get('/greeting', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    // Generate greeting
    const greeting = await harveyVoice.generateHarveyResponse('greeting', {
      userName: userId === 'demo-user' ? 'Rookie' : null
    });
    
    // Synthesize audio
    const audio = await harveyVoice.synthesizeVoice(greeting.text);
    
    res.json({
      ...greeting,
      ...audio
    });
  } catch (error) {
    console.error('Error generating greeting:', error);
    res.status(500).json({ error: 'Failed to generate greeting' });
  }
});

// Coaching session management
const coachingSessions = new Map();

// Start a new coaching session
router.post('/coaching/start-session', async (req, res) => {
  try {
    const { userId, sessionType, metadata } = req.body;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      sessionId,
      userId: userId || 'demo-user',
      sessionType: sessionType || 'standard',
      startTime: new Date().toISOString(),
      status: 'active',
      metrics: {
        callsCompleted: 0,
        successfulCalls: 0,
        totalDuration: 0,
        feedback: []
      },
      metadata: metadata || {}
    };
    
    coachingSessions.set(sessionId, session);
    
    // Generate Harvey's session start message
    const startMessage = await harveyVoice.generateHarveyResponse('coaching', {
      coachingType: 'start'
    });
    const audio = await harveyVoice.synthesizeVoice(startMessage.text);
    
    res.json({
      sessionId,
      session,
      harveyMessage: startMessage.text,
      audio: audio.audio
    });
  } catch (error) {
    console.error('Error starting coaching session:', error);
    res.status(500).json({ error: 'Failed to start coaching session' });
  }
});

// Get active coaching session
router.get('/coaching/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = coachingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Update coaching session
router.put('/coaching/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { updates } = req.body;
    const session = coachingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update session metrics
    if (updates.callCompleted) {
      session.metrics.callsCompleted++;
      if (updates.successful) {
        session.metrics.successfulCalls++;
      }
    }
    
    if (updates.duration) {
      session.metrics.totalDuration += updates.duration;
    }
    
    if (updates.feedback) {
      session.metrics.feedback.push({
        timestamp: new Date().toISOString(),
        feedback: updates.feedback
      });
    }
    
    coachingSessions.set(sessionId, session);
    
    // Generate Harvey's feedback
    const feedback = await harveyVoice.generateHarveyResponse('coaching', {
      coachingType: updates.successful ? 'positive' : 'negative'
    });
    const audio = await harveyVoice.synthesizeVoice(feedback.text);
    
    res.json({
      session,
      harveyFeedback: feedback.text,
      audio: audio.audio
    });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// End coaching session
router.post('/coaching/end-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = coachingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.status = 'completed';
    session.endTime = new Date().toISOString();
    
    // Calculate final metrics
    const successRate = session.metrics.callsCompleted > 0 
      ? Math.round((session.metrics.successfulCalls / session.metrics.callsCompleted) * 100)
      : 0;
    
    // Generate Harvey's final verdict
    const verdict = await harveyVoice.generateVerdict({
      closingRate: successRate,
      totalCalls: session.metrics.callsCompleted,
      userName: session.userId === 'demo-user' ? 'Rookie' : null
    });
    
    // Clean up session after sending response
    setTimeout(() => coachingSessions.delete(sessionId), 300000); // Keep for 5 minutes
    
    res.json({
      session,
      finalMetrics: {
        successRate,
        totalCalls: session.metrics.callsCompleted,
        totalDuration: session.metrics.totalDuration
      },
      harveyVerdict: verdict
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get all active sessions for a user
router.get('/coaching/sessions', async (req, res) => {
  try {
    const { userId } = req.query;
    const userSessions = [];
    
    for (const [sessionId, session] of coachingSessions) {
      if (!userId || session.userId === userId) {
        userSessions.push(session);
      }
    }
    
    res.json({ sessions: userSessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

export default router;