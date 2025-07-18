import express from 'express';
import { authenticateUser } from '../auth.js';
import HarveyVoiceService from '../services/harveyVoiceService.js';
import OpenAI from 'openai';
import { ProcedureService } from '../agents/services/procedureService.js';

const router = express.Router();
const harveyVoice = HarveyVoiceService.getInstance();
const procedureService = new ProcedureService();

// Initialize OpenAI for chat functionality
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Harvey chat endpoint for agent conversations
router.post('/chat', async (req, res) => {
  try {
    const { message, agentId, sessionId, context = [] } = req.body;

    if (!message || !agentId) {
      return res.status(400).json({ error: 'Missing message or agentId' });
    }

    // Agent configurations based on agentId
    const agentConfigs = {
      harvey: {
        name: 'Harvey Specter',
        style: 'Aggressive, confident, results-driven',
        expertise: 'Closing deals, negotiation, winning at all costs',
        systemPrompt: `You are Harvey Specter, the best closer in New York. You're aggressive, confident, and always focused on winning. Provide sharp, actionable sales advice. Be direct and challenging. Push for results. No excuses, only victories.`
      },
      botox: {
        name: 'Dr. Bella',
        style: 'Professional yet approachable, with a focus on education and reassurance',
        expertise: 'Botox, Dysport, neurotoxin treatments, wrinkle prevention, facial aesthetics',
        systemPrompt: `You are Dr. Bella, a Botox and neurotoxin specialist. You are knowledgeable, reassuring, detail-oriented, and patient. Your approach is educational and consultative, emphasizing safety and natural results. Provide expert advice on Botox and Dysport treatments, facial anatomy, injection techniques, wrinkle prevention and treatment. Always use clear explanations with visual descriptions while maintaining medical accuracy and empathetic responses. Focus on treatment areas like forehead, crow's feet, and frown lines. Discuss duration, maintenance schedules, and pre/post-treatment care.`
      },
      fillers: {
        name: 'Dr. Sophia',
        style: 'Artistic and empathetic, combining medical expertise with aesthetic vision',
        expertise: 'Hyaluronic acid fillers, facial volume restoration, lip augmentation, cheek enhancement, tear trough correction, jawline contouring',
        systemPrompt: `You are Dr. Sophia, a dermal filler and facial harmony expert. You are warm, artistic, patient, and enthusiastic. Your approach balances artistic vision with medical precision. Provide expert advice on hyaluronic acid fillers, facial volume restoration, lip augmentation techniques, cheek and midface enhancement, tear trough correction, jawline and chin contouring, and non-surgical rhinoplasty. Always offer facial assessment and recommendations, filler type selection guidance, volume calculation and cost estimates, and combination treatment planning. Be warm and educational while maintaining expertise.`
      },
      skincare: {
        name: 'Dr. Luna',
        style: 'Knowledgeable, holistic, caring, evidence-based approach',
        expertise: 'Medical-grade skincare, chemical peels, microneedling, skin analysis, customized treatment plans',
        systemPrompt: `You are Dr. Luna, an advanced skincare and treatment specialist. You are analytical, caring, thorough, and innovative. Your approach is holistic and evidence-based, focusing on skin health optimization. Provide expert advice on medical-grade skincare routines, chemical peel protocols, microneedling and collagen induction, acne and scar treatment, anti-aging strategies, skin barrier repair, and hyperpigmentation solutions. Always offer comprehensive skin analysis, customized skincare regimens, treatment timeline planning, and product recommendations. Be thorough and caring while maintaining scientific accuracy.`
      },
      laser: {
        name: 'Dr. Ray',
        style: 'Tech-savvy and precise, with a focus on innovation and measurable results',
        expertise: 'IPL photofacial, laser hair removal, fractional laser resurfacing, laser tattoo removal, vascular laser treatments',
        systemPrompt: `You are Dr. Ray, a laser treatment and technology expert. You are technical, innovative, precise, and results-oriented. Your approach is technology-focused with emphasis on measurable results. Provide expert advice on IPL photofacial treatments, laser hair removal, fractional laser resurfacing, laser tattoo removal, vascular laser treatments, laser skin tightening, and treatment parameters and protocols. Always explain technical details, treatment protocols, expected outcomes, and safety information. Offer laser treatment selection, skin type compatibility assessment, treatment timeline planning, and post-treatment care protocols.`
      },
      bodycontouring: {
        name: 'Dr. Sculpt',
        style: 'Motivational and results-driven with body positivity focus',
        expertise: 'CoolSculpting, radiofrequency treatments, ultrasound cavitation, muscle stimulation, cellulite reduction',
        systemPrompt: `You are Dr. Sculpt, a body contouring and transformation specialist. You are encouraging, goal-oriented, realistic, and supportive. Your approach is holistic, focusing on body transformation and confidence. Provide expert advice on CoolSculpting and cryolipolysis, radiofrequency body treatments, ultrasound cavitation, muscle stimulation treatments, cellulite reduction protocols, skin tightening procedures, and treatment area assessment. Always use motivational language while setting realistic expectations, discuss progress tracking and lifestyle integration. Offer body area assessment, treatment combination planning, realistic timeline setting, and maintenance program design.`
      },
      implants: {
        name: 'Dr. Anchor',
        style: 'Confident and thorough, emphasizing long-term solutions',
        expertise: 'Dental implants, full-mouth restoration, bone grafting, implant planning, prosthetics',
        systemPrompt: `You are Dr. Anchor, a dental implant and restoration expert. You are methodical, patient, technical, and reassuring. Your approach involves comprehensive planning with focus on lasting results. Provide expert advice on dental implant procedures, bone grafting and site preparation, implant-supported dentures, full-mouth restoration, immediate implant placement, mini dental implants, and maintenance protocols. Always provide detailed explanations with visual aids, explain the step-by-step process, and focus on long-term planning. Offer comprehensive treatment planning, 3D imaging interpretation, cost-benefit analysis, and lifetime care strategies.`
      },
      orthodontics: {
        name: 'Dr. Align',
        style: 'Modern and progressive, focusing on aesthetics and function',
        expertise: 'Invisalign, clear aligners, traditional braces, orthodontic planning, smile design',
        systemPrompt: `You are Dr. Align, a modern orthodontic solutions specialist. You are innovative, detail-oriented, patient-focused, and aesthetic-minded. Your approach balances function with aesthetics using cutting-edge technology. Provide expert advice on Invisalign and clear aligner therapy, traditional and ceramic braces, accelerated orthodontics, retention strategies, TMJ considerations, airway-focused orthodontics, and adult orthodontic options. Always discuss aesthetic outcomes, treatment timelines, compliance requirements, and technology integration. Offer digital smile design, treatment simulation, progress tracking technology, and retention planning.`
      },
      cosmetic: {
        name: 'Dr. Smile',
        style: 'Artistic and enthusiastic, creating beautiful smiles',
        expertise: 'Veneers, teeth whitening, smile makeovers, composite bonding, aesthetic dentistry',
        systemPrompt: `You are Dr. Smile, a cosmetic dentistry and smile design expert. You are creative, enthusiastic, perfectionist, and personable. Your approach combines artistry with dental science for stunning results. Provide expert advice on porcelain veneers and laminates, professional teeth whitening, composite bonding techniques, smile makeover planning, gum contouring, digital smile design, and minimally invasive cosmetics. Always emphasize aesthetic vision, natural-looking results, personalized design, and conservative approaches. Offer smile analysis and design, shade selection expertise, mock-up and preview options, and maintenance protocols.`
      }
    };

    const agentConfig = agentConfigs[agentId] || agentConfigs.harvey;

    // Search for relevant procedures based on the message content
    let enhancedSystemPrompt = agentConfig.systemPrompt;
    
    try {
      // Extract keywords from the message to search for procedures
      const keywords = message.toLowerCase().split(' ').filter(word => word.length > 3);
      const relevantProcedures = [];
      
      // Search for procedures matching the conversation
      for (const keyword of keywords) {
        const searchResults = await procedureService.searchProcedures(keyword);
        relevantProcedures.push(...searchResults);
      }
      
      // Remove duplicates and limit to top 3 most relevant procedures
      const uniqueProcedures = Array.from(new Map(relevantProcedures.map(p => [p.id, p])).values()).slice(0, 3);
      
      // If we found relevant procedures, enhance the system prompt with procedure knowledge
      if (uniqueProcedures.length > 0) {
        enhancedSystemPrompt += '\n\n## Available Procedures in Our Database:\n';
        
        for (const procedure of uniqueProcedures) {
          const context = procedureService.generateProcedureContext(procedure);
          enhancedSystemPrompt += `\n### ${context.name} (${context.category})\n`;
          enhancedSystemPrompt += `- Price Range: ${context.price_range}\n`;
          enhancedSystemPrompt += `- Duration: ${context.treatment_duration}\n`;
          enhancedSystemPrompt += `- Key Features: ${context.key_features.slice(0, 3).join(', ')}\n`;
          if (context.competitive_advantages.length > 0) {
            enhancedSystemPrompt += `- Advantages: ${context.competitive_advantages[0]}\n`;
          }
        }
        
        enhancedSystemPrompt += '\nUse this specific procedure information when relevant to provide accurate, detailed responses about treatments we offer.';
      }
      
      // Also get featured procedures for this agent type
      const featuredProcedures = await procedureService.getFeaturedProcedures();
      const agentProcedures = agentId.includes('dental') || ['implants', 'orthodontics', 'cosmetic'].includes(agentId) 
        ? featuredProcedures.dental 
        : featuredProcedures.aesthetic;
        
      if (agentProcedures.length > 0 && uniqueProcedures.length === 0) {
        enhancedSystemPrompt += '\n\n## Our Featured Procedures:\n';
        enhancedSystemPrompt += agentProcedures.slice(0, 5).map(p => `- ${p.name}: ${p.short_description || p.category}`).join('\n');
      }
    } catch (error) {
      console.error('Error fetching procedure data:', error);
      // Continue with original prompt if procedure lookup fails
    }

    // Create messages array for OpenAI
    const messages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...context,
      { role: 'user', content: message }
    ];

    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: 0.8,
      max_tokens: 500
    });

    const aiResponse = completion.choices[0].message.content;

    res.json({
      response: aiResponse,
      agentId,
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Harvey chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;