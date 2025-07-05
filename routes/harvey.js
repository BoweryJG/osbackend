import express from 'express';
import { authenticateUser } from '../auth.js';

const router = express.Router();

// In-memory storage for Harvey metrics (in production, use database)
const userMetrics = new Map();
const dailyVerdicts = new Map();

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
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching Harvey metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Harvey daily verdict endpoint
router.get('/verdict', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const today = new Date().toDateString();
    const key = `${userId}-${today}`;
    
    // Check if verdict already exists for today
    let verdict = dailyVerdicts.get(key);
    if (!verdict) {
      // Generate new verdict
      const verdictOptions = [
        {
          verdict: "You're showing promise, but promise doesn't close deals. Step up your game or step aside.",
          tone: 'challenging',
          advice: "Focus on objection handling. Winners don't accept 'maybe' as an answer."
        },
        {
          verdict: "Not bad for someone who thinks 'good enough' is acceptable. I don't do mediocre.",
          tone: 'critical',
          advice: "Your follow-up game is weak. Fortune favors the persistent."
        },
        {
          verdict: "You're playing checkers while your competition plays chess. Time to level up.",
          tone: 'motivational',
          advice: "Master the art of the assumptive close. Confidence closes deals."
        },
        {
          verdict: "I've seen better performances from first-year associates. But I've also seen worse.",
          tone: 'balanced',
          advice: "Your opening needs work. First impressions are everything in this game."
        },
        {
          verdict: "You're closer to being a closer. Keep pushing, or I'll find someone who will.",
          tone: 'encouraging',
          advice: "Good momentum today. Now triple it. Success compounds."
        }
      ];
      
      verdict = verdictOptions[Math.floor(Math.random() * verdictOptions.length)];
      verdict.date = new Date().toISOString();
      verdict.userId = userId;
      
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
    
    // Add some fake competitors if not enough real users
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
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Submit voice command
router.post('/voice-command', async (req, res) => {
  try {
    const { command, userId } = req.body;
    
    // Simple command processing
    const responses = {
      'status': 'Your current status is displayed on the main dashboard. Keep pushing to reach the next level.',
      'help': 'Available commands: status, metrics, leaderboard, battle mode, coaching on, coaching off',
      'metrics': 'Check the metrics panel for your detailed performance data.',
      'leaderboard': 'You can see your ranking on the leaderboard. Time to climb higher.',
      'battle mode': 'Battle mode activated. Find an opponent and show them what closing really means.',
      'coaching on': 'Real-time coaching enabled. I\'ll be in your ear during calls.',
      'coaching off': 'Flying solo now. Don\'t disappoint me.'
    };
    
    const response = responses[command.toLowerCase()] || 
      "I don't have time for unclear commands. Speak with purpose or don't speak at all.";
    
    res.json({ 
      response,
      command,
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

export default router;