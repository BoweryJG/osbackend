/**
 * Metrics Integration Examples
 * 
 * This file demonstrates how to integrate the MetricsAggregator
 * with existing services in the OS Backend system
 */

import logger from '../utils/logger.js';

import { collectHarveyMetrics } from './metricsAggregator.js';

/**
 * Example 1: Integrate with Harvey Voice Service
 * 
 * Add this to harveyVoiceService.js in the relevant methods
 */
export const harveyMetricsIntegration = {
  // Track Harvey conversation performance
  async trackConversation(conversationId, startTime, tokensUsed, model = 'gpt-4') {
    try {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      await collectHarveyMetrics(conversationId, {
        responseTime,
        tokensUsed: {
          input: tokensUsed.prompt_tokens,
          output: tokensUsed.completion_tokens
        },
        model,
        success: true,
        coachingScore: Math.random() * 100, // Replace with actual coaching score
        sentiment: 'positive' // Replace with actual sentiment analysis
      });
    } catch (error) {
      logger.error('Failed to track Harvey metrics:', error);
    }
  },
  
  // Track Harvey errors
  async trackError(conversationId, error, tokensUsed = {}) {
    try {
      await collectHarveyMetrics(conversationId, {
        responseTime: 0,
        tokensUsed,
        success: false,
        error: error.message
      });
    } catch (err) {
      logger.error('Failed to track Harvey error metrics:', err);
    }
  }
};

/**
 * Example 2: Integrate with Voice Service (callTranscriptionService.js)
 * 
 * Add metrics tracking to call handling
 */
export const voiceServiceMetricsIntegration = {
  // Track call metrics - add to handleCallStatus or similar method
  async trackCall(callData) {
    try {
      // The metrics aggregator will automatically capture call logs
      // through real-time subscriptions, but you can add custom metrics
      
      // Example: Track transcription quality
      if (callData.transcription) {
        const transcriptionQuality = calculateTranscriptionQuality(callData.transcription);
        
        // Store as API usage metric
        await storeApiUsageMetric({
          service: 'twilio',
          endpoint: 'transcription',
          duration_seconds: callData.duration,
          total_cost: (callData.duration / 60) * 0.05, // $0.05 per minute
          metadata: {
            quality_score: transcriptionQuality,
            call_sid: callData.call_sid
          }
        });
      }
    } catch (error) {
      logger.error('Failed to track voice metrics:', error);
    }
  }
};

/**
 * Example 3: Integrate with Email Service
 * 
 * Add to emailService.js for campaign tracking
 */
export const emailServiceMetricsIntegration = {
  // Track email send metrics
  async trackEmailSend(emailData, campaignId) {
    try {
      // The aggregator captures email logs automatically
      // Add custom tracking for batch sends
      
      if (campaignId && emailData.batchSize > 1) {
        await storeApiUsageMetric({
          service: 'sendgrid',
          endpoint: 'send_batch',
          request_count: emailData.batchSize,
          total_cost: emailData.batchSize * 0.0001,
          metadata: {
            campaign_id: campaignId,
            template_used: emailData.templateId
          }
        });
      }
    } catch (error) {
      logger.error('Failed to track email metrics:', error);
    }
  }
};

/**
 * Example 4: Integrate with Canvas AI Agents
 * 
 * Add to agent conversation handlers
 */
export const canvasAgentMetricsIntegration = {
  // Track agent interaction
  async trackAgentInteraction(conversationId, agentId, messageData) {
    try {
      // The aggregator captures interaction logs automatically
      // Add performance metrics
      
      const performanceMetrics = {
        response_time: messageData.responseTime,
        tokens_used: messageData.tokensUsed,
        model: messageData.model || 'gpt-3.5-turbo',
        context_length: messageData.contextLength,
        user_satisfaction: messageData.userSatisfaction // From feedback
      };
      
      // Store in agent_interaction_logs with metrics
      await updateAgentInteractionMetrics(conversationId, performanceMetrics);
    } catch (error) {
      logger.error('Failed to track agent metrics:', error);
    }
  }
};

/**
 * Example 5: Dashboard Integration
 * 
 * Use in your dashboard API endpoints
 */
export const dashboardIntegration = {
  // Get real-time dashboard data
  async getDashboardData(req, res) {
    try {
      const { 
        getDashboardSummary,
        getSuccessRates,
        getAggregatedMetrics 
      } = await import('./metricsAggregator.js');
      
      // Get summary
      const summary = await getDashboardSummary();
      
      // Get success rates for different services
      const voiceSuccess = await getSuccessRates('voice_call', 'day');
      const emailSuccess = await getSuccessRates('email_campaign', 'day');
      const harveySuccess = await getSuccessRates('harvey_performance', 'day');
      
      // Get hourly metrics for the last 24 hours
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);
      
      const hourlyMetrics = await getAggregatedMetrics(
        'hour',
        last24Hours.toISOString(),
        new Date().toISOString()
      );
      
      res.json({
        summary,
        successRates: {
          voice: voiceSuccess,
          email: emailSuccess,
          harvey: harveySuccess
        },
        hourlyMetrics
      });
    } catch (error) {
      logger.error('Dashboard data error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }
};

/**
 * Example 6: WebSocket Client for Real-time Updates
 * 
 * Use in your frontend or monitoring services
 */
export const websocketClientExample = () => {
  const WebSocket = require('ws');
  const ws = new WebSocket('ws://localhost:8081');
  
  ws.on('open', () => {
    console.log('Connected to metrics WebSocket');
    
    // Subscribe to specific metrics
    ws.send(JSON.stringify({
      type: 'subscribe',
      params: {
        metrics: ['harvey_performance', 'voice_call', 'email_campaign']
      }
    }));
    
    // Request initial metrics
    ws.send(JSON.stringify({
      type: 'getMetrics',
      params: {
        limit: 10
      }
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'metricUpdate':
        console.log('Metric update:', message.metricType, message.data);
        // Update your UI or trigger actions
        break;
        
      case 'initial':
        console.log('Initial dashboard data:', message.data);
        // Initialize your dashboard
        break;
        
      case 'metrics':
        console.log('Requested metrics:', message.data);
        // Process requested metrics
        break;
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  // Request aggregated data
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'getAggregation',
      params: {
        period: 'hour',
        metricType: 'voice_call'
      }
    }));
  }, 5000);
};

/**
 * Example 7: Cost Analysis Integration
 * 
 * Use for billing and cost tracking
 */
export const costAnalysisIntegration = {
  async getUserCosts(userId, startDate, endDate) {
    try {
      const { getMetrics, getAggregatedMetrics } = await import('./metricsAggregator.js');
      
      // Get all metrics for user
      const userMetrics = await getMetrics({
        userId,
        startDate,
        endDate
      });
      
      // Calculate total costs by service
      const costsByService = {};
      let totalCost = 0;
      
      userMetrics.forEach(metric => {
        const service = metric.type;
        if (!costsByService[service]) {
          costsByService[service] = {
            count: 0,
            totalCost: 0
          };
        }
        
        costsByService[service].count++;
        costsByService[service].totalCost += metric.cost || 0;
        totalCost += metric.cost || 0;
      });
      
      // Get daily breakdown
      const dailyCosts = await getAggregatedMetrics(
        'day',
        startDate,
        endDate
      );
      
      return {
        totalCost,
        costsByService,
        dailyBreakdown: dailyCosts,
        period: { startDate, endDate }
      };
    } catch (error) {
      logger.error('Cost analysis error:', error);
      throw error;
    }
  }
};

/**
 * Example 8: Alert Integration
 * 
 * Set up alerts for metric thresholds
 */
export const alertIntegration = {
  setupAlerts() {
    const metricsAggregator = require('./metricsAggregator.js').default;
    
    // Listen for alerts
    metricsAggregator.on('alert', async (alert) => {
      logger.warn('Metric alert triggered:', alert);
      
      // Send notifications
      if (alert.type === 'high_cpu' && alert.value > 90) {
        await sendSlackNotification({
          channel: '#alerts',
          text: `🚨 High CPU Usage: ${alert.value}%`
        });
      }
      
      if (alert.type === 'high_memory' && alert.value > 90) {
        await sendEmailAlert({
          to: process.env.ADMIN_EMAIL,
          subject: 'High Memory Usage Alert',
          body: `Memory usage has reached ${alert.value}%`
        });
      }
    });
    
    // Listen for aggregation completion
    metricsAggregator.on('aggregationComplete', async (data) => {
      logger.info('Metrics aggregation completed:', data.timestamp);
      // Trigger any post-aggregation tasks
    });
  }
};

/**
 * Example 9: Performance Monitoring Integration
 * 
 * Track API endpoint performance
 */
export const performanceMonitoringIntegration = {
  // Middleware to track API performance
  trackApiPerformance() {
    return async (req, res, next) => {
      const start = Date.now();
      const originalSend = res.send;
      
      res.send = function(data) {
        const duration = Date.now() - start;
        
        // Track API performance metric
        storeApiPerformanceMetric({
          endpoint: req.path,
          method: req.method,
          duration,
          statusCode: res.statusCode,
          userId: req.user?.id
        }).catch(err => {
          logger.error('Failed to track API performance:', err);
        });
        
        originalSend.call(this, data);
      };
      
      next();
    };
  }
};

// Helper functions
function calculateTranscriptionQuality(transcription) {
  // Implement quality calculation logic
  return Math.random() * 100; // Placeholder
}

async function storeApiUsageMetric(data) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  const { error } = await supabase
    .from('api_usage_logs')
    .insert(data);
    
  if (error) throw error;
}

async function updateAgentInteractionMetrics(conversationId, metrics) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  const { error } = await supabase
    .from('agent_interaction_logs')
    .update({ metrics })
    .eq('conversation_id', conversationId);
    
  if (error) throw error;
}

async function storeApiPerformanceMetric(data) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  const { error } = await supabase
    .from('metrics')
    .insert({
      type: 'api_usage',
      metrics: data,
      user_id: data.userId,
      timestamp: new Date().toISOString()
    });
    
  if (error) throw error;
}

async function sendSlackNotification(data) {
  // Implement Slack notification
  logger.info('Slack notification:', data);
}

async function sendEmailAlert(data) {
  // Implement email alert
  logger.info('Email alert:', data);
}

export default {
  harveyMetricsIntegration,
  voiceServiceMetricsIntegration,
  emailServiceMetricsIntegration,
  canvasAgentMetricsIntegration,
  dashboardIntegration,
  websocketClientExample,
  costAnalysisIntegration,
  alertIntegration,
  performanceMonitoringIntegration
};