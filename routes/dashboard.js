import express from 'express';
import { authenticateToken, requireTier } from '../middleware/auth.js';
import { apiRateLimiter, createTierBasedRateLimiter } from '../middleware/rateLimiter.js';
import logger from '../utils/logger.js';

// Import services
import metricsAggregator, { 
  getDashboardSummary, 
  getMetrics, 
  getAggregatedMetrics,
  getAgentPerformance,
  getSuccessRates 
} from '../services/metricsAggregator.js';
import VoiceCloningService from '../services/voiceCloningService.js';
import { personalityEngine } from '../services/personalityEngine.js';
import { audioClipService } from '../services/audioClipService.js';

const router = express.Router();
const voiceCloningService = new VoiceCloningService();

// Apply authentication to all dashboard routes
router.use(authenticateToken);

// Apply tier-based rate limiting
router.use(createTierBasedRateLimiter());

/**
 * GET /api/dashboard/overview
 * Get main dashboard metrics overview
 */
router.get('/overview', async (req, res) => {
  try {
    logger.info(`Dashboard overview requested by user: ${req.user.id}`);
    
    // Get dashboard summary from metrics aggregator
    const summary = await getDashboardSummary();
    
    // Get user-specific data
    const userId = req.user.id;
    const userMetrics = await getMetrics({ userId, limit: 10 });
    
    // Get recent activity across all services
    const recentActivity = await getRecentActivity(userId);
    
    // Get system status
    const systemStatus = await getSystemStatus();
    
    res.json({
      success: true,
      data: {
        summary,
        userMetrics,
        recentActivity,
        systemStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard overview:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard overview',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/agents
 * List all agents with performance metrics
 */
router.get('/agents', async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'created_at', order = 'desc' } = req.query;
    
    // Get agents from database
    const { data: agents, error } = await req.app.locals.supabase
      .from('canvas_ai_agents')
      .select('*')
      .order(sortBy, { ascending: order === 'asc' })
      .range((page - 1) * limit, page * limit - 1);
    
    if (error) throw error;
    
    // Enrich agents with performance metrics
    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        try {
          const performance = await getAgentPerformance(
            agent.id,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
            new Date().toISOString()
          );
          
          return {
            ...agent,
            performance
          };
        } catch (err) {
          logger.warn(`Failed to get performance for agent ${agent.id}:`, err);
          return {
            ...agent,
            performance: null
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: {
        agents: enrichedAgents,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: agents.length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching agents:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch agents',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/metrics/:agentId
 * Get detailed metrics for a specific agent
 */
router.get('/metrics/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate, endDate, period = 'day' } = req.query;
    
    // Validate agent exists
    const { data: agent, error: agentError } = await req.app.locals.supabase
      .from('canvas_ai_agents')
      .select('*')
      .eq('id', agentId)
      .single();
    
    if (agentError || !agent) {
      return res.status(404).json({ 
        success: false, 
        error: 'Agent not found' 
      });
    }
    
    // Get detailed performance metrics
    const performance = await getAgentPerformance(agentId, startDate, endDate);
    
    // Get aggregated metrics
    const aggregatedMetrics = await getAggregatedMetrics(
      period,
      startDate,
      endDate,
      'agent_interaction'
    );
    
    // Get success rates
    const successRates = await getSuccessRates('agent_interaction', period);
    
    // Get conversation history
    const { data: conversations } = await req.app.locals.supabase
      .from('agent_conversations')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    res.json({
      success: true,
      data: {
        agent,
        performance,
        aggregatedMetrics,
        successRates,
        recentConversations: conversations || [],
        period
      }
    });
  } catch (error) {
    logger.error('Error fetching agent metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch agent metrics',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/voice-profiles
 * List all voice profiles
 */
router.get('/voice-profiles', async (req, res) => {
  try {
    const { limit = 50, includeInactive = false } = req.query;
    
    // Get voice profiles from voice cloning service
    const profiles = await voiceCloningService.listVoiceProfiles({
      limit: Number(limit)
    });
    
    // Filter based on active status
    const filteredProfiles = includeInactive === 'true' 
      ? profiles 
      : profiles.filter(p => p.is_active);
    
    // Get usage statistics for each profile
    const enrichedProfiles = await Promise.all(
      filteredProfiles.map(async (profile) => {
        try {
          // Get usage count from metrics
          const { data: usageData } = await req.app.locals.supabase
            .from('metrics')
            .select('count')
            .eq('type', 'voice_usage')
            .eq('metadata->voice_id', profile.voice_id)
            .single();
          
          return {
            ...profile,
            usage: {
              totalCalls: usageData?.count || 0,
              lastUsed: profile.updated_at || profile.created_at
            }
          };
        } catch (err) {
          return {
            ...profile,
            usage: {
              totalCalls: 0,
              lastUsed: profile.created_at
            }
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: {
        profiles: enrichedProfiles,
        total: enrichedProfiles.length
      }
    });
  } catch (error) {
    logger.error('Error fetching voice profiles:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch voice profiles',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/personality-templates
 * Get available personality templates
 */
router.get('/personality-templates', async (req, res) => {
  try {
    // Get all personality templates
    const templates = personalityEngine.listTemplates();
    
    // Get custom templates from database
    const { data: customTemplates } = await req.app.locals.supabase
      .from('personality_templates')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });
    
    // Combine default and custom templates
    const allTemplates = [
      ...templates.map(t => ({ ...t, type: 'default' })),
      ...(customTemplates || []).map(t => ({ 
        key: t.id,
        name: t.name,
        traits: t.traits,
        type: 'custom',
        createdBy: t.created_by,
        createdAt: t.created_at
      }))
    ];
    
    res.json({
      success: true,
      data: {
        templates: allTemplates,
        total: allTemplates.length
      }
    });
  } catch (error) {
    logger.error('Error fetching personality templates:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch personality templates',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/quick-clips
 * Get recent audio clips
 */
router.get('/quick-clips', async (req, res) => {
  try {
    const { limit = 20, includeExpired = false } = req.query;
    
    // Get clips from database
    let query = req.app.locals.supabase
      .from('audio_clips')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    
    if (includeExpired !== 'true') {
      query = query.gte('expires_at', new Date().toISOString());
    }
    
    const { data: clips, error } = await query;
    
    if (error) throw error;
    
    // Enrich clips with analytics
    const enrichedClips = await Promise.all(
      (clips || []).map(async (clip) => {
        try {
          const analytics = await audioClipService.getAnalytics(clip.id);
          return {
            ...clip,
            analytics
          };
        } catch (err) {
          return {
            ...clip,
            analytics: null
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: {
        clips: enrichedClips,
        total: enrichedClips.length
      }
    });
  } catch (error) {
    logger.error('Error fetching quick clips:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch quick clips',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/training-status
 * Get agent training progress and status
 */
router.get('/training-status', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = req.app.locals.supabase
      .from('agent_training_sessions')
      .select(`
        *,
        canvas_ai_agents(name, type)
      `)
      .order('created_at', { ascending: false });
    
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    
    const { data: trainingSessions, error } = await query.limit(50);
    
    if (error) throw error;
    
    // Calculate training statistics
    const stats = calculateTrainingStats(trainingSessions || []);
    
    // Get active training sessions
    const activeSessions = (trainingSessions || []).filter(
      session => session.status === 'in_progress'
    );
    
    // Get recent completions
    const recentCompletions = (trainingSessions || [])
      .filter(session => session.status === 'completed')
      .slice(0, 10);
    
    res.json({
      success: true,
      data: {
        stats,
        activeSessions,
        recentCompletions,
        allSessions: trainingSessions || []
      }
    });
  } catch (error) {
    logger.error('Error fetching training status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch training status',
      message: error.message 
    });
  }
});

/**
 * POST /api/dashboard/refresh-metrics
 * Force refresh of dashboard metrics
 */
router.post('/refresh-metrics', requireTier('professional'), async (req, res) => {
  try {
    logger.info(`Metrics refresh requested by user: ${req.user.id}`);
    
    // Trigger metrics aggregation
    await metricsAggregator.performMetricAggregation();
    
    // Get fresh dashboard summary
    const summary = await getDashboardSummary();
    
    res.json({
      success: true,
      data: {
        message: 'Metrics refreshed successfully',
        summary,
        refreshedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error refreshing metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh metrics',
      message: error.message 
    });
  }
});

/**
 * GET /api/dashboard/export
 * Export dashboard data
 */
router.get('/export', requireTier('professional'), async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, dataTypes = 'all' } = req.query;
    
    logger.info(`Dashboard export requested by user: ${req.user.id}`);
    
    // Collect all requested data
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: req.user.email,
      period: { startDate, endDate },
      data: {}
    };
    
    // Get metrics if requested
    if (dataTypes === 'all' || dataTypes.includes('metrics')) {
      exportData.data.metrics = await getMetrics({ 
        userId: req.user.id, 
        startDate, 
        endDate 
      });
    }
    
    // Get agents if requested
    if (dataTypes === 'all' || dataTypes.includes('agents')) {
      const { data: agents } = await req.app.locals.supabase
        .from('canvas_ai_agents')
        .select('*');
      exportData.data.agents = agents;
    }
    
    // Format response based on requested format
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(exportData.data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=dashboard-export.csv');
      res.send(csv);
    } else {
      // Default to JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=dashboard-export.json');
      res.json(exportData);
    }
  } catch (error) {
    logger.error('Error exporting dashboard data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export dashboard data',
      message: error.message 
    });
  }
});

// Helper functions

/**
 * Get recent activity across all services
 */
async function getRecentActivity(userId) {
  try {
    const activities = [];
    
    // Get recent API calls
    const apiCalls = await getMetrics({
      userId,
      limit: 5,
      type: 'api_usage'
    });
    
    activities.push(...apiCalls.map(call => ({
      type: 'api_call',
      timestamp: call.timestamp,
      details: call.metrics
    })));
    
    // Get recent voice calls
    const voiceCalls = await getMetrics({
      userId,
      limit: 5,
      type: 'voice_call'
    });
    
    activities.push(...voiceCalls.map(call => ({
      type: 'voice_call',
      timestamp: call.timestamp,
      details: call.metrics
    })));
    
    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return activities.slice(0, 10);
  } catch (error) {
    logger.error('Error getting recent activity:', error);
    return [];
  }
}

/**
 * Get system status
 */
async function getSystemStatus() {
  try {
    const status = {
      services: {
        metricsAggregator: 'operational',
        voiceCloning: 'operational',
        personalityEngine: 'operational',
        audioClips: 'operational'
      },
      lastUpdated: new Date().toISOString()
    };
    
    // Check if services are responsive
    try {
      await getDashboardSummary();
    } catch (err) {
      status.services.metricsAggregator = 'degraded';
    }
    
    try {
      await voiceCloningService.listVoiceProfiles({ limit: 1 });
    } catch (err) {
      status.services.voiceCloning = 'degraded';
    }
    
    return status;
  } catch (error) {
    logger.error('Error getting system status:', error);
    return { services: {}, error: 'Failed to check system status' };
  }
}

/**
 * Calculate training statistics
 */
function calculateTrainingStats(sessions) {
  const stats = {
    total: sessions.length,
    completed: 0,
    inProgress: 0,
    failed: 0,
    averageDuration: 0,
    successRate: 0
  };
  
  let totalDuration = 0;
  
  sessions.forEach(session => {
    switch (session.status) {
      case 'completed':
        stats.completed++;
        if (session.duration) {
          totalDuration += session.duration;
        }
        break;
      case 'in_progress':
        stats.inProgress++;
        break;
      case 'failed':
        stats.failed++;
        break;
    }
  });
  
  if (stats.completed > 0) {
    stats.averageDuration = totalDuration / stats.completed;
    stats.successRate = (stats.completed / (stats.completed + stats.failed)) * 100;
  }
  
  return stats;
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data) {
  // Simple CSV conversion for metrics
  if (data.metrics && Array.isArray(data.metrics)) {
    const headers = Object.keys(data.metrics[0] || {}).join(',');
    const rows = data.metrics.map(metric => 
      Object.values(metric).map(v => 
        typeof v === 'object' ? JSON.stringify(v) : v
      ).join(',')
    );
    return [headers, ...rows].join('\n');
  }
  
  return 'No data available for CSV export';
}

export default router;