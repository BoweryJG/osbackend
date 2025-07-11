import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';
import { EventEmitter } from 'events';
import cron from 'node-cron';
import websocketManager, { emitMetricUpdate } from './websocketManager.js';

/**
 * MetricsAggregator Service
 * 
 * Collects and aggregates metrics from all system components:
 * - Harvey AI performance metrics
 * - Voice service call logs
 * - Email campaign statistics
 * - Canvas AI agent conversations
 * 
 * Provides real-time streaming and time-based aggregations
 */
class MetricsAggregator extends EventEmitter {
  constructor() {
    super();
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      logger.error('MetricsAggregator: Missing Supabase credentials');
      throw new Error('Supabase credentials not configured');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    
    // Initialize cache for performance (TTL: 5 minutes)
    this.cache = new NodeCache({ 
      stdTTL: 300,
      checkperiod: 60,
      useClones: false
    });
    
    // Use centralized WebSocket manager
    this.websocketManager = websocketManager;
    
    // Metric collection intervals
    this.intervals = new Map();
    
    // API usage rates for cost calculation
    this.apiRates = {
      openai: {
        gpt4: { input: 0.01, output: 0.03 }, // per 1K tokens
        gpt35: { input: 0.0005, output: 0.0015 }, // per 1K tokens
        tts: 0.015, // per 1K characters
        whisper: 0.006 // per minute
      },
      elevenlabs: {
        standard: 0.30, // per 1K characters
        turbo: 0.18 // per 1K characters
      },
      twilio: {
        call: 0.0140, // per minute
        sms: 0.0079, // per message
        recording: 0.0025, // per minute stored
        transcription: 0.05 // per minute
      },
      sendgrid: {
        email: 0.0001 // per email
      }
    };
    
    // Initialize metric types
    this.metricTypes = {
      HARVEY_PERFORMANCE: 'harvey_performance',
      VOICE_CALL: 'voice_call',
      EMAIL_CAMPAIGN: 'email_campaign',
      AGENT_INTERACTION: 'agent_interaction',
      API_USAGE: 'api_usage',
      SYSTEM_HEALTH: 'system_health'
    };
    
    // Start background tasks
    this.startMetricCollection();
    this.setupRealtimeSubscriptions();
    this.initializeWebSocketIntegration();
  }
  
  /**
   * Initialize WebSocket integration
   */
  initializeWebSocketIntegration() {
    // Listen for custom messages from WebSocket manager
    this.websocketManager.on('customMessage', async ({ clientId, type, payload }) => {
      if (type.startsWith('metrics:')) {
        await this.handleMetricsWebSocketMessage(clientId, type, payload);
      }
    });
    
    // Auto-join metrics clients to dashboard room
    this.websocketManager.on('clientConnected', ({ clientId }) => {
      // Clients can manually join the dashboard:overview room
    });
    
    logger.info('MetricsAggregator: WebSocket integration initialized');
  }
  
  /**
   * Handle metrics-specific WebSocket messages
   */
  async handleMetricsWebSocketMessage(clientId, type, payload) {
    switch (type) {
      case 'metrics:subscribe':
        // Client wants to subscribe to specific metric types
        const { metrics } = payload;
        // Store subscription preferences (could be in client metadata)
        logger.info(`Client ${clientId} subscribed to metrics: ${metrics.join(', ')}`);
        break;
        
      case 'metrics:get':
        // Get specific metrics with optional filters
        const metricsData = await this.getMetrics(payload);
        this.websocketManager.sendToClient(clientId, {
          type: 'metrics:data',
          data: metricsData
        });
        break;
        
      case 'metrics:aggregation':
        // Get aggregated metrics
        const aggregation = await this.getAggregatedMetrics(
          payload.period || 'hour',
          payload.startDate,
          payload.endDate,
          payload.metricType
        );
        this.websocketManager.sendToClient(clientId, {
          type: 'metrics:aggregation',
          data: aggregation
        });
        break;
        
      case 'metrics:dashboard':
        // Get dashboard summary
        const summary = await this.getDashboardSummary();
        this.websocketManager.sendToClient(clientId, {
          type: 'metrics:dashboard',
          data: summary
        });
        break;
    }
  }
  
  /**
   * Broadcast metric update using centralized WebSocket manager
   */
  broadcastMetricUpdate(metricType, data) {
    // Use the centralized WebSocket manager to emit metric updates
    emitMetricUpdate(metricType, data);
  }
  
  /**
   * Start background metric collection tasks
   */
  startMetricCollection() {
    // Collect system health metrics every minute
    this.intervals.set('systemHealth', setInterval(() => {
      this.collectSystemHealthMetrics();
    }, 60000));
    
    // Aggregate metrics every 5 minutes
    this.intervals.set('aggregation', setInterval(() => {
      this.performMetricAggregation();
    }, 300000));
    
    // Clean up old metrics daily at 2 AM
    cron.schedule('0 2 * * *', () => {
      this.cleanupOldMetrics();
    });
    
    logger.info('MetricsAggregator: Background tasks started');
  }
  
  /**
   * Setup real-time subscriptions to database changes
   */
  setupRealtimeSubscriptions() {
    // Subscribe to call logs
    this.supabase
      .channel('call_logs_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'call_logs'
      }, (payload) => {
        this.handleCallLogInsert(payload.new);
      })
      .subscribe();
    
    // Subscribe to email logs
    this.supabase
      .channel('email_logs_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'email_logs'
      }, (payload) => {
        this.handleEmailLogChange(payload);
      })
      .subscribe();
    
    // Subscribe to agent interactions
    this.supabase
      .channel('agent_interactions_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_interaction_logs'
      }, (payload) => {
        this.handleAgentInteractionInsert(payload.new);
      })
      .subscribe();
    
    logger.info('MetricsAggregator: Real-time subscriptions established');
  }
  
  /**
   * Collect Harvey AI performance metrics
   */
  async collectHarveyMetrics(conversationId, metrics) {
    try {
      const harveyMetric = {
        type: this.metricTypes.HARVEY_PERFORMANCE,
        conversation_id: conversationId,
        metrics: {
          response_time: metrics.responseTime,
          tokens_used: metrics.tokensUsed,
          model: metrics.model || 'gpt-4',
          success: metrics.success,
          error: metrics.error || null,
          coaching_score: metrics.coachingScore,
          sentiment: metrics.sentiment
        },
        cost: this.calculateOpenAICost(metrics.tokensUsed, metrics.model),
        timestamp: new Date().toISOString()
      };
      
      // Store in database
      const { error } = await this.supabase
        .from('metrics')
        .insert(harveyMetric);
      
      if (error) throw error;
      
      // Update cache
      this.updateCache('harvey_metrics', harveyMetric);
      
      // Broadcast update
      this.broadcastMetricUpdate(this.metricTypes.HARVEY_PERFORMANCE, harveyMetric);
      
      return harveyMetric;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to collect Harvey metrics:', error);
      throw error;
    }
  }
  
  /**
   * Handle new call log entries
   */
  async handleCallLogInsert(callLog) {
    try {
      const metric = {
        type: this.metricTypes.VOICE_CALL,
        call_id: callLog.id,
        metrics: {
          duration: callLog.duration,
          direction: callLog.direction,
          status: callLog.status,
          from_number: callLog.from_number,
          to_number: callLog.to_number,
          recording_available: !!callLog.recording_url,
          transcription_available: !!callLog.transcription
        },
        cost: this.calculateCallCost(callLog),
        timestamp: callLog.created_at
      };
      
      // Store aggregated metric
      await this.storeMetric(metric);
      
      // Update real-time statistics
      this.updateRealtimeStats('calls', metric);
      
      // Broadcast update
      this.broadcastMetricUpdate(this.metricTypes.VOICE_CALL, metric);
    } catch (error) {
      logger.error('MetricsAggregator: Failed to handle call log:', error);
    }
  }
  
  /**
   * Handle email log changes
   */
  async handleEmailLogChange(payload) {
    try {
      const emailLog = payload.new;
      const metric = {
        type: this.metricTypes.EMAIL_CAMPAIGN,
        email_id: emailLog.id,
        campaign_id: emailLog.campaign_id,
        metrics: {
          status: emailLog.status,
          recipient: emailLog.to_email,
          subject: emailLog.subject,
          opened: emailLog.status === 'opened',
          clicked: emailLog.status === 'clicked',
          bounced: emailLog.status === 'bounced',
          failed: emailLog.status === 'failed'
        },
        cost: this.apiRates.sendgrid.email,
        timestamp: emailLog.created_at
      };
      
      // Store metric
      await this.storeMetric(metric);
      
      // Update campaign statistics
      if (emailLog.campaign_id) {
        await this.updateCampaignStats(emailLog.campaign_id);
      }
      
      // Broadcast update
      this.broadcastMetricUpdate(this.metricTypes.EMAIL_CAMPAIGN, metric);
    } catch (error) {
      logger.error('MetricsAggregator: Failed to handle email log:', error);
    }
  }
  
  /**
   * Handle agent interaction logs
   */
  async handleAgentInteractionInsert(interaction) {
    try {
      const metric = {
        type: this.metricTypes.AGENT_INTERACTION,
        conversation_id: interaction.conversation_id,
        user_id: interaction.user_id,
        metrics: interaction.metrics || {},
        timestamp: interaction.timestamp
      };
      
      // Calculate cost if API usage is tracked
      if (interaction.metrics?.tokens_used) {
        metric.cost = this.calculateOpenAICost(
          interaction.metrics.tokens_used,
          interaction.metrics.model || 'gpt-3.5-turbo'
        );
      }
      
      // Store metric
      await this.storeMetric(metric);
      
      // Update agent performance stats
      await this.updateAgentPerformance(interaction.conversation_id);
      
      // Broadcast update
      this.broadcastMetricUpdate(this.metricTypes.AGENT_INTERACTION, metric);
    } catch (error) {
      logger.error('MetricsAggregator: Failed to handle agent interaction:', error);
    }
  }
  
  /**
   * Store metric in database
   */
  async storeMetric(metric) {
    try {
      const { error } = await this.supabase
        .from('metrics')
        .insert(metric);
      
      if (error) throw error;
      
      // Emit event for other services
      this.emit('metricStored', metric);
    } catch (error) {
      logger.error('MetricsAggregator: Failed to store metric:', error);
      throw error;
    }
  }
  
  /**
   * Get metrics with optional filters
   */
  async getMetrics(filters = {}) {
    const cacheKey = `metrics_${JSON.stringify(filters)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      let query = this.supabase
        .from('metrics')
        .select('*');
      
      // Apply filters
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      
      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }
      
      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }
      
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      
      // Order by timestamp descending
      query = query.order('timestamp', { ascending: false });
      
      // Apply limit
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Cache results
      this.cache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to get metrics:', error);
      throw error;
    }
  }
  
  /**
   * Get aggregated metrics by time period
   */
  async getAggregatedMetrics(period = 'hour', startDate, endDate, metricType) {
    const cacheKey = `aggregated_${period}_${startDate}_${endDate}_${metricType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      // Build aggregation query based on period
      let timeFormat;
      switch (period) {
        case 'hour':
          timeFormat = "date_trunc('hour', timestamp)";
          break;
        case 'day':
          timeFormat = "date_trunc('day', timestamp)";
          break;
        case 'week':
          timeFormat = "date_trunc('week', timestamp)";
          break;
        case 'month':
          timeFormat = "date_trunc('month', timestamp)";
          break;
        default:
          timeFormat = "date_trunc('hour', timestamp)";
      }
      
      let query = `
        SELECT 
          ${timeFormat} as period,
          type,
          COUNT(*) as count,
          SUM(cost) as total_cost,
          AVG(cost) as avg_cost,
          jsonb_agg(metrics) as all_metrics
        FROM metrics
        WHERE 1=1
      `;
      
      const params = [];
      
      if (startDate) {
        query += ` AND timestamp >= $${params.length + 1}`;
        params.push(startDate);
      }
      
      if (endDate) {
        query += ` AND timestamp <= $${params.length + 1}`;
        params.push(endDate);
      }
      
      if (metricType) {
        query += ` AND type = $${params.length + 1}`;
        params.push(metricType);
      }
      
      query += `
        GROUP BY period, type
        ORDER BY period DESC
      `;
      
      const { data, error } = await this.supabase.rpc('execute_sql', {
        query,
        params
      });
      
      if (error) throw error;
      
      // Process aggregated metrics
      const processed = this.processAggregatedMetrics(data);
      
      // Cache results
      this.cache.set(cacheKey, processed, 600); // Cache for 10 minutes
      
      return processed;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to get aggregated metrics:', error);
      throw error;
    }
  }
  
  /**
   * Process aggregated metrics for better structure
   */
  processAggregatedMetrics(data) {
    const result = {};
    
    data.forEach((row) => {
      const period = row.period;
      if (!result[period]) {
        result[period] = {
          period,
          metrics: {},
          totalCost: 0,
          totalCount: 0
        };
      }
      
      result[period].metrics[row.type] = {
        count: row.count,
        totalCost: row.total_cost,
        avgCost: row.avg_cost,
        details: this.extractMetricDetails(row.all_metrics, row.type)
      };
      
      result[period].totalCost += row.total_cost || 0;
      result[period].totalCount += row.count || 0;
    });
    
    return Object.values(result);
  }
  
  /**
   * Extract relevant details from aggregated metrics
   */
  extractMetricDetails(metrics, type) {
    if (!metrics || !Array.isArray(metrics)) return {};
    
    switch (type) {
      case this.metricTypes.VOICE_CALL:
        return {
          totalDuration: metrics.reduce((sum, m) => sum + (m.duration || 0), 0),
          avgDuration: metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length,
          inboundCount: metrics.filter(m => m.direction === 'inbound').length,
          outboundCount: metrics.filter(m => m.direction === 'outbound').length,
          successRate: metrics.filter(m => m.status === 'completed').length / metrics.length
        };
        
      case this.metricTypes.EMAIL_CAMPAIGN:
        return {
          sent: metrics.filter(m => m.status === 'sent').length,
          opened: metrics.filter(m => m.opened).length,
          clicked: metrics.filter(m => m.clicked).length,
          bounced: metrics.filter(m => m.bounced).length,
          failed: metrics.filter(m => m.failed).length,
          openRate: metrics.filter(m => m.opened).length / metrics.length,
          clickRate: metrics.filter(m => m.clicked).length / metrics.length
        };
        
      case this.metricTypes.HARVEY_PERFORMANCE:
        return {
          avgResponseTime: metrics.reduce((sum, m) => sum + (m.response_time || 0), 0) / metrics.length,
          totalTokens: metrics.reduce((sum, m) => sum + (m.tokens_used || 0), 0),
          successRate: metrics.filter(m => m.success).length / metrics.length,
          avgCoachingScore: metrics.reduce((sum, m) => sum + (m.coaching_score || 0), 0) / metrics.length
        };
        
      default:
        return {};
    }
  }
  
  /**
   * Get per-agent performance tracking
   */
  async getAgentPerformance(agentId, startDate, endDate) {
    try {
      let query = this.supabase
        .from('agent_conversations')
        .select(`
          *,
          agent_interaction_logs(metrics),
          agent_feedback(rating, outcome)
        `)
        .eq('agent_id', agentId);
      
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Calculate performance metrics
      const performance = {
        agentId,
        totalConversations: data.length,
        avgRating: this.calculateAvgRating(data),
        responseMetrics: this.calculateResponseMetrics(data),
        outcomeAnalysis: this.analyzeOutcomes(data),
        costAnalysis: this.calculateAgentCosts(data)
      };
      
      return performance;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to get agent performance:', error);
      throw error;
    }
  }
  
  /**
   * Calculate API usage costs
   */
  calculateOpenAICost(tokens, model = 'gpt-4') {
    const rates = this.apiRates.openai[model] || this.apiRates.openai.gpt4;
    const inputTokens = tokens.input || 0;
    const outputTokens = tokens.output || 0;
    
    return (inputTokens / 1000 * rates.input) + (outputTokens / 1000 * rates.output);
  }
  
  calculateCallCost(callLog) {
    let cost = 0;
    
    // Call duration cost
    if (callLog.duration) {
      cost += (callLog.duration / 60) * this.apiRates.twilio.call;
    }
    
    // Recording storage cost
    if (callLog.recording_url) {
      cost += (callLog.duration / 60) * this.apiRates.twilio.recording;
    }
    
    // Transcription cost
    if (callLog.transcription) {
      cost += (callLog.duration / 60) * this.apiRates.twilio.transcription;
    }
    
    return cost;
  }
  
  /**
   * Calculate success rates
   */
  async getSuccessRates(metricType, period = 'day') {
    try {
      const metrics = await this.getAggregatedMetrics(period, null, null, metricType);
      
      const successRates = metrics.map((periodData) => {
        const details = periodData.metrics[metricType]?.details || {};
        let successRate = 0;
        
        switch (metricType) {
          case this.metricTypes.VOICE_CALL:
            successRate = details.successRate || 0;
            break;
          case this.metricTypes.EMAIL_CAMPAIGN:
            successRate = details.openRate || 0;
            break;
          case this.metricTypes.HARVEY_PERFORMANCE:
            successRate = details.successRate || 0;
            break;
        }
        
        return {
          period: periodData.period,
          successRate,
          count: periodData.metrics[metricType]?.count || 0
        };
      });
      
      return successRates;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to calculate success rates:', error);
      throw error;
    }
  }
  
  /**
   * Get dashboard summary with cached data
   */
  async getDashboardSummary() {
    const cacheKey = 'dashboard_summary';
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));
      const weekStart = new Date(now.setDate(now.getDate() - 7));
      
      // Get today's metrics
      const todayMetrics = await this.getMetrics({
        startDate: todayStart.toISOString()
      });
      
      // Get week's aggregated metrics
      const weekMetrics = await this.getAggregatedMetrics(
        'day',
        weekStart.toISOString()
      );
      
      // Calculate summary statistics
      const summary = {
        today: {
          totalCost: todayMetrics.reduce((sum, m) => sum + (m.cost || 0), 0),
          callCount: todayMetrics.filter(m => m.type === this.metricTypes.VOICE_CALL).length,
          emailCount: todayMetrics.filter(m => m.type === this.metricTypes.EMAIL_CAMPAIGN).length,
          aiInteractions: todayMetrics.filter(m => m.type === this.metricTypes.HARVEY_PERFORMANCE).length
        },
        week: {
          totalCost: weekMetrics.reduce((sum, p) => sum + p.totalCost, 0),
          byDay: weekMetrics,
          topMetricType: this.getTopMetricType(weekMetrics)
        },
        realtimeStats: {
          activeConnections: this.websocketManager.getClientStats().totalClients || 0,
          lastUpdate: new Date().toISOString()
        }
      };
      
      // Cache for 1 minute
      this.cache.set(cacheKey, summary, 60);
      
      return summary;
    } catch (error) {
      logger.error('MetricsAggregator: Failed to get dashboard summary:', error);
      throw error;
    }
  }
  
  /**
   * Perform periodic metric aggregation
   */
  async performMetricAggregation() {
    try {
      logger.info('MetricsAggregator: Starting periodic aggregation');
      
      // Aggregate hourly metrics
      await this.aggregateHourlyMetrics();
      
      // Update cached summaries
      await this.updateCachedSummaries();
      
      // Emit aggregation complete event
      this.emit('aggregationComplete', {
        timestamp: new Date().toISOString()
      });
      
      logger.info('MetricsAggregator: Periodic aggregation completed');
    } catch (error) {
      logger.error('MetricsAggregator: Aggregation failed:', error);
    }
  }
  
  /**
   * Aggregate hourly metrics for performance
   */
  async aggregateHourlyMetrics() {
    const oneHourAgo = new Date(Date.now() - 3600000);
    
    try {
      // Get raw metrics from the last hour
      const recentMetrics = await this.getMetrics({
        startDate: oneHourAgo.toISOString()
      });
      
      // Group by type and calculate aggregates
      const aggregates = {};
      
      recentMetrics.forEach((metric) => {
        if (!aggregates[metric.type]) {
          aggregates[metric.type] = {
            count: 0,
            totalCost: 0,
            metrics: []
          };
        }
        
        aggregates[metric.type].count++;
        aggregates[metric.type].totalCost += metric.cost || 0;
        aggregates[metric.type].metrics.push(metric.metrics);
      });
      
      // Store hourly aggregates
      for (const [type, data] of Object.entries(aggregates)) {
        await this.supabase
          .from('metric_aggregates')
          .insert({
            period: 'hour',
            period_start: oneHourAgo,
            type,
            count: data.count,
            total_cost: data.totalCost,
            aggregated_metrics: data.metrics,
            created_at: new Date().toISOString()
          });
      }
    } catch (error) {
      logger.error('MetricsAggregator: Failed to aggregate hourly metrics:', error);
    }
  }
  
  /**
   * Update cached summaries
   */
  async updateCachedSummaries() {
    // Clear relevant cache entries
    this.cache.flushAll();
    
    // Pre-populate important caches
    await this.getDashboardSummary();
    await this.getSuccessRates(this.metricTypes.VOICE_CALL);
    await this.getSuccessRates(this.metricTypes.EMAIL_CAMPAIGN);
  }
  
  /**
   * Clean up old metrics (retention: 90 days)
   */
  async cleanupOldMetrics() {
    const retentionDays = 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    try {
      logger.info(`MetricsAggregator: Cleaning up metrics older than ${cutoffDate.toISOString()}`);
      
      // Delete old raw metrics
      const { error: metricsError } = await this.supabase
        .from('metrics')
        .delete()
        .lt('timestamp', cutoffDate.toISOString());
      
      if (metricsError) throw metricsError;
      
      // Delete old aggregates
      const { error: aggregatesError } = await this.supabase
        .from('metric_aggregates')
        .delete()
        .lt('period_start', cutoffDate.toISOString());
      
      if (aggregatesError) throw aggregatesError;
      
      logger.info('MetricsAggregator: Cleanup completed successfully');
    } catch (error) {
      logger.error('MetricsAggregator: Cleanup failed:', error);
    }
  }
  
  /**
   * Collect system health metrics
   */
  async collectSystemHealthMetrics() {
    try {
      const { SystemMetrics } = await import('./monitoring.js');
      const systemMetrics = SystemMetrics.getMetrics();
      
      const healthMetric = {
        type: this.metricTypes.SYSTEM_HEALTH,
        metrics: {
          cpu: systemMetrics.cpu,
          memory: systemMetrics.memory,
          uptime: systemMetrics.system.uptime,
          activeWebSockets: this.websocketManager.getClientStats().totalClients || 0
        },
        timestamp: new Date().toISOString()
      };
      
      await this.storeMetric(healthMetric);
      
      // Check for alerts
      if (systemMetrics.cpu.usage > 80) {
        this.emit('alert', {
          type: 'high_cpu',
          value: systemMetrics.cpu.usage,
          threshold: 80
        });
      }
      
      if (systemMetrics.memory.usagePercent > 85) {
        this.emit('alert', {
          type: 'high_memory',
          value: systemMetrics.memory.usagePercent,
          threshold: 85
        });
      }
    } catch (error) {
      logger.error('MetricsAggregator: Failed to collect system health metrics:', error);
    }
  }
  
  /**
   * Update real-time statistics
   */
  updateRealtimeStats(type, metric) {
    const stats = this.cache.get('realtime_stats') || {};
    
    if (!stats[type]) {
      stats[type] = {
        count: 0,
        lastUpdate: null
      };
    }
    
    stats[type].count++;
    stats[type].lastUpdate = new Date().toISOString();
    
    this.cache.set('realtime_stats', stats);
    
    // Broadcast realtime update
    this.broadcastMetricUpdate('realtime_stats', stats);
  }
  
  /**
   * Helper methods
   */
  calculateAvgRating(conversations) {
    const ratings = conversations
      .flatMap(c => c.agent_feedback || [])
      .map(f => f.rating)
      .filter(r => r != null);
    
    if (ratings.length === 0) return 0;
    
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }
  
  calculateResponseMetrics(conversations) {
    const metrics = conversations
      .flatMap(c => c.agent_interaction_logs || [])
      .map(l => l.metrics)
      .filter(m => m != null);
    
    if (metrics.length === 0) return {};
    
    return {
      avgResponseTime: metrics.reduce((sum, m) => sum + (m.response_time || 0), 0) / metrics.length,
      totalInteractions: metrics.length
    };
  }
  
  analyzeOutcomes(conversations) {
    const outcomes = conversations
      .flatMap(c => c.agent_feedback || [])
      .map(f => f.outcome)
      .filter(o => o != null);
    
    // Group outcomes by type
    const analysis = {};
    outcomes.forEach((outcome) => {
      Object.entries(outcome).forEach(([key, value]) => {
        if (!analysis[key]) {
          analysis[key] = {};
        }
        analysis[key][value] = (analysis[key][value] || 0) + 1;
      });
    });
    
    return analysis;
  }
  
  calculateAgentCosts(conversations) {
    let totalCost = 0;
    
    conversations.forEach((conv) => {
      const logs = conv.agent_interaction_logs || [];
      logs.forEach((log) => {
        if (log.metrics?.tokens_used) {
          totalCost += this.calculateOpenAICost(
            log.metrics.tokens_used,
            log.metrics.model || 'gpt-3.5-turbo'
          );
        }
      });
    });
    
    return totalCost;
  }
  
  getTopMetricType(aggregatedMetrics) {
    const typeCounts = {};
    
    aggregatedMetrics.forEach((period) => {
      Object.entries(period.metrics).forEach(([type, data]) => {
        typeCounts[type] = (typeCounts[type] || 0) + data.count;
      });
    });
    
    return Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));
  }
  
  /**
   * Update cache with new metric
   */
  updateCache(key, metric) {
    const existing = this.cache.get(key) || [];
    existing.push(metric);
    
    // Keep only last 100 entries
    if (existing.length > 100) {
      existing.shift();
    }
    
    this.cache.set(key, existing);
  }
  
  /**
   * Update campaign statistics
   */
  async updateCampaignStats(campaignId) {
    try {
      const { data: logs, error } = await this.supabase
        .from('email_logs')
        .select('status')
        .eq('campaign_id', campaignId);
      
      if (error) throw error;
      
      const stats = {
        sent: logs.filter(l => l.status === 'sent').length,
        opened: logs.filter(l => l.status === 'opened').length,
        clicked: logs.filter(l => l.status === 'clicked').length,
        bounced: logs.filter(l => l.status === 'bounced').length,
        failed: logs.filter(l => l.status === 'failed').length
      };
      
      await this.supabase
        .from('email_campaigns')
        .update({ stats })
        .eq('id', campaignId);
    } catch (error) {
      logger.error('MetricsAggregator: Failed to update campaign stats:', error);
    }
  }
  
  /**
   * Update agent performance cache
   */
  async updateAgentPerformance(conversationId) {
    try {
      const { data: conversation, error } = await this.supabase
        .from('agent_conversations')
        .select('agent_id')
        .eq('id', conversationId)
        .single();
      
      if (error) throw error;
      
      if (conversation?.agent_id) {
        // Clear agent performance cache
        this.cache.del(`agent_performance_${conversation.agent_id}`);
      }
    } catch (error) {
      logger.error('MetricsAggregator: Failed to update agent performance:', error);
    }
  }
  
  /**
   * Stop the metrics aggregator
   */
  stop() {
    // Clear intervals
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
    
    // Clear cache
    this.cache.flushAll();
    this.cache.close();
    
    logger.info('MetricsAggregator: Service stopped');
  }
}

// Create and export singleton instance
const metricsAggregator = new MetricsAggregator();

// Export methods for external use
export const collectHarveyMetrics = (conversationId, metrics) => 
  metricsAggregator.collectHarveyMetrics(conversationId, metrics);

export const getMetrics = (filters) => 
  metricsAggregator.getMetrics(filters);

export const getAggregatedMetrics = (period, startDate, endDate, metricType) => 
  metricsAggregator.getAggregatedMetrics(period, startDate, endDate, metricType);

export const getAgentPerformance = (agentId, startDate, endDate) => 
  metricsAggregator.getAgentPerformance(agentId, startDate, endDate);

export const getSuccessRates = (metricType, period) => 
  metricsAggregator.getSuccessRates(metricType, period);

export const getDashboardSummary = () => 
  metricsAggregator.getDashboardSummary();

export default metricsAggregator;