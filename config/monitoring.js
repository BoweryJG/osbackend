import os from 'os';

import client from 'prom-client';
import * as Sentry from '@sentry/node';

import logger from '../utils/logger.js';


// Create a Registry to register the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'osbackend',
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

/**
 * Custom Prometheus Metrics
 */
export const metrics = {
  // HTTP Request metrics
  httpRequests: new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'status_code', 'route'],
    registers: [register]
  }),

  httpRequestDuration: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'status_code', 'route'],
    buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
    registers: [register]
  }),

  // Database metrics
  databaseConnections: new client.Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections',
    registers: [register]
  }),

  databaseQueryDuration: new client.Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [register]
  }),

  databaseErrors: new client.Counter({
    name: 'database_errors_total',
    help: 'Total number of database errors',
    labelNames: ['operation', 'error_type'],
    registers: [register]
  }),

  // Business logic metrics
  userSessions: new client.Gauge({
    name: 'user_sessions_active',
    help: 'Number of active user sessions',
    registers: [register]
  }),

  apiUsage: new client.Counter({
    name: 'api_usage_total',
    help: 'Total API usage by endpoint and user',
    labelNames: ['endpoint', 'user_type'],
    registers: [register]
  }),

  // External service metrics
  externalServiceRequests: new client.Counter({
    name: 'external_service_requests_total',
    help: 'Total requests to external services',
    labelNames: ['service', 'status'],
    registers: [register]
  }),

  externalServiceDuration: new client.Histogram({
    name: 'external_service_duration_seconds',
    help: 'Duration of external service requests',
    labelNames: ['service'],
    buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 30],
    registers: [register]
  }),

  // Cache metrics
  cacheHits: new client.Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_type'],
    registers: [register]
  }),

  cacheMisses: new client.Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_type'],
    registers: [register]
  }),

  // Queue metrics
  queueSize: new client.Gauge({
    name: 'queue_size',
    help: 'Current queue size',
    labelNames: ['queue_name'],
    registers: [register]
  }),

  queueProcessingTime: new client.Histogram({
    name: 'queue_processing_time_seconds',
    help: 'Time taken to process queue items',
    labelNames: ['queue_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
  }),

  // Error tracking
  applicationErrors: new client.Counter({
    name: 'application_errors_total',
    help: 'Total application errors',
    labelNames: ['error_type', 'severity'],
    registers: [register]
  }),

  // Resource utilization
  memoryUsage: new client.Gauge({
    name: 'nodejs_memory_usage_bytes',
    help: 'Node.js memory usage in bytes',
    labelNames: ['type'],
    registers: [register]
  }),

  cpuUsage: new client.Gauge({
    name: 'system_cpu_usage_percent',
    help: 'System CPU usage percentage',
    registers: [register]
  })
};

/**
 * System Metrics Collector with enhanced capabilities
 */
export class SystemMetrics {
  static getMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;
    
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    const processMemory = process.memoryUsage();
    
    // Update Prometheus metrics
    metrics.memoryUsage.set({ type: 'rss' }, processMemory.rss);
    metrics.memoryUsage.set({ type: 'heapUsed' }, processMemory.heapUsed);
    metrics.memoryUsage.set({ type: 'heapTotal' }, processMemory.heapTotal);
    metrics.memoryUsage.set({ type: 'external' }, processMemory.external);
    metrics.cpuUsage.set(cpuUsage);
    
    return {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        pid: process.pid,
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        networkInterfaces: Object.keys(os.networkInterfaces())
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: memUsagePercent,
        heapUsed: processMemory.heapUsed,
        heapTotal: processMemory.heapTotal,
        external: processMemory.external,
        rss: processMemory.rss,
        arrayBuffers: processMemory.arrayBuffers || 0
      },
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model,
        speed: cpus[0]?.speed,
        usage: cpuUsage,
        loadAverage: os.loadavg(),
        perCoreUsage: cpus.map(cpu => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          const idle = cpu.times.idle;
          return ((total - idle) / total) * 100;
        })
      },
      disk: {
        // Add disk usage metrics if needed
      },
      network: {
        interfaces: os.networkInterfaces()
      }
    };
  }

  static async getEnhancedMetrics() {
    const basicMetrics = this.getMetrics();
    
    try {
      // Add enhanced metrics with external checks
      const enhancedMetrics = {
        ...basicMetrics,
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: process.env.NODE_ENV,
          version: process.env.npm_package_version || '1.0.0',
          deployment: process.env.DEPLOYMENT_ID || 'local'
        },
        performance: {
          eventLoopDelay: process.hrtime(),
          eventLoopUtilization: process.cpuUsage ? process.cpuUsage() : null
        }
      };

      return enhancedMetrics;
    } catch (error) {
      logger.error('Failed to collect enhanced metrics:', error);
      return basicMetrics;
    }
  }
}

/**
 * Metrics collection middleware
 */
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();
    
    // Record HTTP metrics
    metrics.httpRequests.inc({ method, status_code: statusCode, route });
    metrics.httpRequestDuration.observe({ method, status_code: statusCode, route }, duration);
    
    // Track API usage
    const userType = req.user?.subscription_status || 'anonymous';
    metrics.apiUsage.inc({ endpoint: route, user_type: userType });
  });
  
  next();
};

/**
 * Database query metrics wrapper
 */
export const trackDatabaseQuery = async (operation, table, queryFn) => {
  const start = Date.now();
  
  try {
    const result = await queryFn();
    const duration = (Date.now() - start) / 1000;
    
    metrics.databaseQueryDuration.observe({ operation, table }, duration);
    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    
    metrics.databaseQueryDuration.observe({ operation, table }, duration);
    metrics.databaseErrors.inc({ operation, error_type: error.name || 'unknown' });
    
    throw error;
  }
};

/**
 * External service call tracker
 */
export const trackExternalService = async (serviceName, requestFn) => {
  const start = Date.now();
  
  try {
    const result = await requestFn();
    const duration = (Date.now() - start) / 1000;
    
    metrics.externalServiceRequests.inc({ service: serviceName, status: 'success' });
    metrics.externalServiceDuration.observe({ service: serviceName }, duration);
    
    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    
    metrics.externalServiceRequests.inc({ service: serviceName, status: 'error' });
    metrics.externalServiceDuration.observe({ service: serviceName }, duration);
    
    throw error;
  }
};

/**
 * Cache metrics tracker
 */
export const trackCacheOperation = (cacheType, hit) => {
  if (hit) {
    metrics.cacheHits.inc({ cache_type: cacheType });
  } else {
    metrics.cacheMisses.inc({ cache_type: cacheType });
  }
};

/**
 * Error tracking with Sentry integration
 */
export const trackError = (error, context = {}) => {
  // Increment error counter
  metrics.applicationErrors.inc({
    error_type: error.name || 'unknown',
    severity: error.severity || 'error'
  });
  
  // Send to Sentry with enhanced context
  Sentry.withScope((scope) => {
    scope.setContext('error_context', context);
    scope.setLevel(error.severity || 'error');
    Sentry.captureException(error);
  });
  
  logger.error('Application error tracked:', {
    error: error.message,
    stack: error.stack,
    context
  });
};

/**
 * Get Prometheus metrics
 */
export const getPrometheusMetrics = async () => {
  return await register.metrics();
};

/**
 * Reset all metrics (useful for testing)
 */
export const resetMetrics = () => {
  register.resetMetrics();
};

export { register };
export default {
  metrics,
  SystemMetrics,
  metricsMiddleware,
  trackDatabaseQuery,
  trackExternalService,
  trackCacheOperation,
  trackError,
  getPrometheusMetrics,
  resetMetrics,
  register
};