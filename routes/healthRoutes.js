import express from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

import { monitoringService } from '../services/monitoring.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../utils/logger.js';
import gracefulShutdown from '../utils/gracefulShutdown.js';
import { SystemMetrics, getPrometheusMetrics, trackExternalService } from '../config/monitoring.js';


const router = express.Router();

// Initialize Supabase client for health checks only if credentials exist
let supabase = null;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (process.env.SUPABASE_URL && supabaseKey) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey
  );
}

/**
 * Basic health check endpoint
 */
router.get('/health', (req, res) => {
  // Return unhealthy if shutting down
  if (gracefulShutdown.isShuttingDownNow()) {
    return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Server shutting down', {
      status: 'shutting_down',
      timestamp: new Date().toISOString()
    }, 503));
  }

  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'RepSpheres OS Backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime())
  }));
});

/**
 * Detailed health check endpoint
 */
router.get('/api/health', async (req, res) => {
  try {
    // Run all health checks
    const healthStatus = await monitoringService.performHealthCheck();
    
    // Determine HTTP status code
    let statusCode = 200;
    if (healthStatus.status === 'critical') {
      statusCode = 503; // Service Unavailable
    } else if (healthStatus.status === 'degraded') {
      statusCode = 200; // Still return 200 for degraded to not trigger alarms
    }
    
    res.status(statusCode).json(successResponse(healthStatus));
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json(errorResponse('HEALTH_CHECK_FAILED', 'Failed to perform health check', error.message, 503));
  }
});

/**
 * Liveness probe - checks if the service is alive
 */
router.get('/health/live', (req, res) => {
  res.json(successResponse({
    status: 'alive',
    timestamp: new Date().toISOString()
  }));
});

/**
 * Readiness probe - checks if the service is ready to accept traffic
 */
router.get('/health/ready', async (req, res) => {
  const checks = {
    server: true,
    database: false,
    memory: false
  };
  
  try {
    // Check database connection
    if (supabase) {
      const { error } = await supabase.from('users').select('count').limit(1);
      checks.database = !error;
    } else {
      checks.database = false;
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    checks.memory = heapUsedPercent < 90; // Less than 90% heap usage
    
    const isReady = Object.values(checks).every(check => check === true);
    
    const statusCode = isReady ? 200 : 503;
    const responseData = {
      ready: isReady,
      timestamp: new Date().toISOString(),
      checks
    };
    
    if (isReady) {
      res.status(statusCode).json(successResponse(responseData));
    } else {
      res.status(statusCode).json(errorResponse('NOT_READY', 'Service not ready', responseData, statusCode));
    }
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json(errorResponse('READINESS_CHECK_FAILED', 'Readiness check failed', {
      ready: false,
      timestamp: new Date().toISOString(),
      checks,
      error: error.message
    }, 503));
  }
});

/**
 * Startup probe - checks if the application has started successfully
 */
router.get('/health/startup', (req, res) => {
  const uptime = process.uptime();
  const started = uptime > 5; // Consider started after 5 seconds
  
  const statusCode = started ? 200 : 503;
  const responseData = {
    started,
    uptime,
    timestamp: new Date().toISOString()
  };
  
  if (started) {
    res.status(statusCode).json(successResponse(responseData));
  } else {
    res.status(statusCode).json(errorResponse('NOT_STARTED', 'Application not started', responseData, statusCode));
  }
});

/**
 * Performance metrics endpoint
 */
router.get('/health/metrics', async (req, res) => {
  try {
    const { performanceMonitor } = await import('../middleware/responseTime.js');
    
    const metrics = {
      system: await SystemMetrics.getEnhancedMetrics(),
      performance: performanceMonitor.getSummary(),
      timestamp: new Date().toISOString()
    };
    
    res.json(successResponse(metrics));
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json(errorResponse('METRICS_ERROR', 'Failed to retrieve metrics', error.message, 500));
  }
});

/**
 * Prometheus metrics endpoint
 */
router.get('/health/prometheus', async (req, res) => {
  try {
    const prometheusMetrics = await getPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(prometheusMetrics);
  } catch (error) {
    logger.error('Failed to get Prometheus metrics:', error);
    res.status(500).json(errorResponse('PROMETHEUS_ERROR', 'Failed to retrieve Prometheus metrics', error.message, 500));
  }
});

/**
 * Database health check
 */
router.get('/health/database', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json(errorResponse('DATABASE_UNAVAILABLE', 'Database connection not configured', {
        status: 'unavailable',
        timestamp: new Date().toISOString()
      }, 503));
    }
    
    const start = Date.now();
    const { data, error } = await supabase.from('user_subscriptions').select('count').limit(1);
    const responseTime = Date.now() - start;
    
    if (error) {
      throw error;
    }
    
    res.json(successResponse({
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json(errorResponse('DATABASE_UNHEALTHY', 'Database health check failed', {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 503));
  }
});

/**
 * Dependencies health check with enhanced external services
 */
router.get('/health/dependencies', async (req, res) => {
  const dependencies = {
    supabase: { status: 'unknown', responseTime: null, details: null },
    anthropic: { status: 'unknown', responseTime: null, details: null },
    stripe: { status: 'unknown', responseTime: null, details: null },
    firecrawl: { status: 'unknown', responseTime: null, details: null },
    brave_search: { status: 'unknown', responseTime: null, details: null }
  };
  
  // Check Supabase
  if (supabase) {
    try {
      const result = await trackExternalService('supabase', async () => {
        const start = Date.now();
        const { data, error } = await supabase.from('users').select('count').limit(1);
        const responseTime = Date.now() - start;
        
        if (error) throw error;
        
        return { responseTime, data };
      });
      
      dependencies.supabase = {
        status: 'healthy',
        responseTime: `${result.responseTime}ms`,
        details: { connected: true, tablesAccessible: true }
      };
    } catch (error) {
      dependencies.supabase = {
        status: 'unhealthy',
        error: error.message,
        details: { connected: false }
      };
    }
  } else {
    dependencies.supabase = {
      status: 'not_configured',
      error: 'Supabase credentials not provided'
    };
  }
  
  // Check Anthropic API
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await trackExternalService('anthropic', async () => {
        const start = Date.now();
        // Simple ping to Anthropic API
        const response = await axios.get('https://api.anthropic.com/', {
          timeout: 5000,
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        });
        const responseTime = Date.now() - start;
        return { responseTime, status: response.status };
      });
      
      dependencies.anthropic = {
        status: 'healthy',
        responseTime: `${result.responseTime}ms`,
        details: { apiKeyValid: true }
      };
    } catch (error) {
      dependencies.anthropic = {
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'unhealthy',
        error: error.message,
        details: { apiKeyValid: false }
      };
    }
  } else {
    dependencies.anthropic = {
      status: 'not_configured',
      error: 'Anthropic API key not provided'
    };
  }
  
  // Check Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const result = await trackExternalService('stripe', async () => {
        const start = Date.now();
        // Simple ping to Stripe API
        const response = await axios.get('https://api.stripe.com/v1/account', {
          timeout: 5000,
          headers: {
            'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
          }
        });
        const responseTime = Date.now() - start;
        return { responseTime, status: response.status };
      });
      
      dependencies.stripe = {
        status: 'healthy',
        responseTime: `${result.responseTime}ms`,
        details: { connected: true }
      };
    } catch (error) {
      dependencies.stripe = {
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'unhealthy',
        error: error.message,
        details: { connected: false }
      };
    }
  } else {
    dependencies.stripe = {
      status: 'not_configured',
      error: 'Stripe credentials not provided'
    };
  }
  
  // Check Firecrawl
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      const result = await trackExternalService('firecrawl', async () => {
        const start = Date.now();
        const response = await axios.get('https://api.firecrawl.dev/v0/status', {
          timeout: 5000,
          headers: {
            'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
          }
        });
        const responseTime = Date.now() - start;
        return { responseTime, status: response.status };
      });
      
      dependencies.firecrawl = {
        status: 'healthy',
        responseTime: `${result.responseTime}ms`,
        details: { apiKeyValid: true }
      };
    } catch (error) {
      dependencies.firecrawl = {
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'unhealthy',
        error: error.message,
        details: { apiKeyValid: false }
      };
    }
  } else {
    dependencies.firecrawl = {
      status: 'not_configured',
      error: 'Firecrawl API key not provided'
    };
  }
  
  // Check Brave Search
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const result = await trackExternalService('brave_search', async () => {
        const start = Date.now();
        const response = await axios.get('https://api.search.brave.com/res/v1/web/search?q=test', {
          timeout: 5000,
          headers: {
            'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY
          }
        });
        const responseTime = Date.now() - start;
        return { responseTime, status: response.status };
      });
      
      dependencies.brave_search = {
        status: 'healthy',
        responseTime: `${result.responseTime}ms`,
        details: { apiKeyValid: true }
      };
    } catch (error) {
      dependencies.brave_search = {
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'unhealthy',
        error: error.message,
        details: { apiKeyValid: false }
      };
    }
  } else {
    dependencies.brave_search = {
      status: 'not_configured',
      error: 'Brave Search API key not provided'
    };
  }
  
  // Calculate overall health
  const healthyCount = Object.values(dependencies).filter(dep => dep.status === 'healthy').length;
  const totalConfigured = Object.values(dependencies).filter(dep => dep.status !== 'not_configured').length;
  const criticalUnhealthy = Object.values(dependencies).filter(dep => dep.status === 'unhealthy').length;
  
  let overallStatus = 'healthy';
  if (criticalUnhealthy > 0) {
    overallStatus = 'degraded';
  }
  if (totalConfigured === 0) {
    overallStatus = 'not_configured';
  }
  
  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  const responseData = {
    status: overallStatus,
    dependencies,
    summary: {
      total: Object.keys(dependencies).length,
      healthy: healthyCount,
      unhealthy: criticalUnhealthy,
      configured: totalConfigured,
      healthRatio: totalConfigured > 0 ? (healthyCount / totalConfigured * 100).toFixed(1) + '%' : '0%'
    },
    timestamp: new Date().toISOString()
  };
  
  if (overallStatus === 'healthy') {
    res.status(statusCode).json(successResponse(responseData));
  } else {
    res.status(statusCode).json(errorResponse('DEPENDENCIES_DEGRADED', 'Some dependencies are unhealthy', responseData, statusCode));
  }
});

// POST /health/test - Test POST functionality
router.post('/health/test', (req, res) => {
  console.log('[Health] POST test endpoint hit');
  console.log('[Health] Request body:', req.body);
  res.json({ 
    success: true, 
    message: 'POST test successful',
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

export default router;