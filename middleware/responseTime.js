import responseTime from 'response-time';
import logger from '../../utils/logger.js';
import { captureMetric } from '../config/sentry.js';

/**
 * Response time tracking middleware
 */
export const responseTimeMiddleware = responseTime((req, res, time) => {
  const statusCode = res.statusCode;
  const method = req.method;
  const route = req.route?.path || req.path;
  const userAgent = req.get('user-agent') || 'unknown';
  
  // Log response time
  const logData = {
    method,
    path: req.path,
    route,
    statusCode,
    responseTime: `${time.toFixed(2)}ms`,
    ip: req.ip,
    userAgent: userAgent.substring(0, 50) // Truncate long user agents
  };

  // Log based on response time
  if (time > 5000) {
    logger.error('Very slow API response', logData);
  } else if (time > 2000) {
    logger.warn('Slow API response', logData);
  } else if (process.env.NODE_ENV === 'development') {
    logger.debug('API response', logData);
  }

  // Send metrics to Sentry
  try {
    captureMetric('api.response_time', time, 'millisecond', {
      method,
      route,
      status_code: statusCode.toString(),
      status_category: `${Math.floor(statusCode / 100)}xx`
    });

    // Track error rates
    if (statusCode >= 400) {
      captureMetric('api.error_rate', 1, 'none', {
        method,
        route,
        status_code: statusCode.toString(),
        error_type: statusCode >= 500 ? 'server_error' : 'client_error'
      });
    }
  } catch (error) {
    logger.error('Failed to capture response metrics:', error);
  }

  // Add response headers
  res.setHeader('X-Response-Time', `${time.toFixed(2)}ms`);
  res.setHeader('X-Request-ID', req.id || 'unknown');
});

/**
 * Performance monitoring for specific routes
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.slowRequestThreshold = 2000; // 2 seconds
  }

  /**
   * Track route performance
   */
  trackRoute(route, time, statusCode) {
    if (!this.metrics.has(route)) {
      this.metrics.set(route, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0,
        slowRequests: 0
      });
    }

    const metric = this.metrics.get(route);
    metric.count++;
    metric.totalTime += time;
    metric.minTime = Math.min(metric.minTime, time);
    metric.maxTime = Math.max(metric.maxTime, time);
    
    if (statusCode >= 400) {
      metric.errors++;
    }
    
    if (time > this.slowRequestThreshold) {
      metric.slowRequests++;
    }
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const summary = {};
    
    for (const [route, metric] of this.metrics.entries()) {
      summary[route] = {
        requests: metric.count,
        avgResponseTime: metric.count > 0 ? metric.totalTime / metric.count : 0,
        minResponseTime: metric.minTime === Infinity ? 0 : metric.minTime,
        maxResponseTime: metric.maxTime,
        errorRate: metric.count > 0 ? (metric.errors / metric.count) * 100 : 0,
        slowRequestRate: metric.count > 0 ? (metric.slowRequests / metric.count) * 100 : 0
      };
    }
    
    return summary;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics.clear();
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Enhanced response time middleware with performance tracking
 */
export const enhancedResponseTimeMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Capture response finish
  res.on('finish', () => {
    const time = Date.now() - start;
    const route = req.route?.path || req.path;
    
    // Track in performance monitor
    performanceMonitor.trackRoute(route, time, res.statusCode);
  });
  
  next();
};

/**
 * Middleware to add request ID
 */
export const requestIdMiddleware = (req, res, next) => {
  req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

export default {
  responseTimeMiddleware,
  enhancedResponseTimeMiddleware,
  requestIdMiddleware,
  performanceMonitor
};