import express from 'express';
import { monitoringService } from '../services/monitoring.js';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../utils/logger.js';

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
  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'RepConnect Backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
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
    const { SystemMetrics } = await import('../config/monitoring.js');
    const { performanceMonitor } = await import('../middleware/responseTime.js');
    
    const metrics = {
      system: SystemMetrics.getMetrics(),
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
 * Dependencies health check
 */
router.get('/health/dependencies', async (req, res) => {
  const dependencies = {
    supabase: { status: 'unknown', responseTime: null },
    deepgram: { status: 'unknown', responseTime: null },
    twilio: { status: 'unknown', responseTime: null },
    openai: { status: 'unknown', responseTime: null }
  };
  
  // Check Supabase
  if (supabase) {
    try {
      const start = Date.now();
      const { error } = await supabase.from('users').select('count').limit(1);
      dependencies.supabase = {
        status: error ? 'unhealthy' : 'healthy',
        responseTime: `${Date.now() - start}ms`,
        error: error?.message
      };
    } catch (error) {
      dependencies.supabase = {
        status: 'unhealthy',
        error: error.message
      };
    }
  } else {
    dependencies.supabase = {
      status: 'not_configured',
      error: 'Supabase credentials not provided'
    };
  }
  
  // Add checks for other dependencies as needed
  // This is a placeholder - implement actual checks based on your dependencies
  
  const allHealthy = Object.values(dependencies).every(
    dep => dep.status === 'healthy' || dep.status === 'unknown'
  );
  
  const statusCode = allHealthy ? 200 : 503;
  const responseData = {
    status: allHealthy ? 'healthy' : 'degraded',
    dependencies,
    timestamp: new Date().toISOString()
  };
  
  if (allHealthy) {
    res.status(statusCode).json(successResponse(responseData));
  } else {
    res.status(statusCode).json(errorResponse('DEPENDENCIES_DEGRADED', 'Some dependencies are unhealthy', responseData, statusCode));
  }
});

export default router;