import logger from '../utils/logger.js';
import { performanceMonitor } from '../middleware/responseTime.js';
import * as Sentry from '@sentry/node';
import os from 'os';

// Stub function for captureMetric until Sentry is properly configured
const captureMetric = (name, value, unit, tags) => {
  // Log metrics for now
  logger.debug('Metric captured:', { name, value, unit, tags });
};

/**
 * Monitoring configuration and utilities
 */
export const monitoringConfig = {
  // Health check intervals
  healthCheckInterval: 60000, // 1 minute
  metricsReportInterval: 300000, // 5 minutes
  
  // Thresholds
  cpuThreshold: 80, // 80% CPU usage
  memoryThreshold: 85, // 85% memory usage
  responseTimeThreshold: 2000, // 2 seconds
  errorRateThreshold: 5, // 5% error rate
  
  // Alerts
  alertWebhook: process.env.MONITORING_WEBHOOK_URL,
  alertEmail: process.env.MONITORING_ALERT_EMAIL,
  
  // Features
  enablePerformanceMonitoring: true,
  enableHealthChecks: true,
  enableMetricsReporting: true,
  enableAlerts: true
};

/**
 * System metrics collector
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
    
    return {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        pid: process.pid
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: memUsagePercent,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss
      },
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model,
        usage: cpuUsage,
        loadAverage: os.loadavg()
      }
    };
  }
}

/**
 * Health check manager
 */
export class HealthCheckManager {
  constructor() {
    this.checks = new Map();
    this.results = new Map();
  }

  /**
   * Register a health check
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      timeout: options.timeout || 5000,
      critical: options.critical || false
    });
  }

  /**
   * Run all health checks
   */
  async runChecks() {
    const results = {};
    const promises = [];
    
    for (const [name, check] of this.checks.entries()) {
      const promise = this.runCheck(name, check);
      promises.push(promise);
    }
    
    await Promise.all(promises);
    
    // Compile results
    for (const [name, result] of this.results.entries()) {
      results[name] = result;
    }
    
    return {
      status: this.getOverallStatus(),
      timestamp: new Date().toISOString(),
      checks: results,
      metrics: SystemMetrics.getMetrics()
    };
  }

  /**
   * Run a single health check
   */
  async runCheck(name, check) {
    const start = Date.now();
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
      });
      
      const result = await Promise.race([check.fn(), timeoutPromise]);
      
      this.results.set(name, {
        status: 'healthy',
        responseTime: Date.now() - start,
        ...result
      });
    } catch (error) {
      logger.error(`Health check failed: ${name}`, error);
      
      this.results.set(name, {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        critical: check.critical
      });
    }
  }

  /**
   * Get overall health status
   */
  getOverallStatus() {
    let hasUnhealthy = false;
    let hasCriticalFailure = false;
    
    for (const [_, result] of this.results.entries()) {
      if (result.status === 'unhealthy') {
        hasUnhealthy = true;
        if (result.critical) {
          hasCriticalFailure = true;
        }
      }
    }
    
    if (hasCriticalFailure) return 'critical';
    if (hasUnhealthy) return 'degraded';
    return 'healthy';
  }
}

/**
 * Monitoring service
 */
export class MonitoringService {
  constructor() {
    this.healthCheckManager = new HealthCheckManager();
    this.intervals = [];
    this.isRunning = false;
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isRunning) return;
    
    logger.info('Starting monitoring service...');
    this.isRunning = true;
    
    // Register default health checks
    this.registerDefaultHealthChecks();
    
    // Start health checks
    if (monitoringConfig.enableHealthChecks) {
      const healthInterval = setInterval(async () => {
        await this.performHealthCheck();
      }, monitoringConfig.healthCheckInterval);
      
      this.intervals.push(healthInterval);
    }
    
    // Start metrics reporting
    if (monitoringConfig.enableMetricsReporting) {
      const metricsInterval = setInterval(async () => {
        await this.reportMetrics();
      }, monitoringConfig.metricsReportInterval);
      
      this.intervals.push(metricsInterval);
    }
    
    // Perform initial checks
    this.performHealthCheck();
    this.reportMetrics();
  }

  /**
   * Stop monitoring
   */
  stop() {
    logger.info('Stopping monitoring service...');
    this.isRunning = false;
    
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      const results = await this.healthCheckManager.runChecks();
      
      // Check thresholds
      const metrics = results.metrics;
      const alerts = [];
      
      if (metrics.cpu.usage > monitoringConfig.cpuThreshold) {
        alerts.push({
          type: 'cpu',
          message: `High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`,
          severity: 'warning'
        });
      }
      
      if (metrics.memory.usagePercent > monitoringConfig.memoryThreshold) {
        alerts.push({
          type: 'memory',
          message: `High memory usage: ${metrics.memory.usagePercent.toFixed(2)}%`,
          severity: 'warning'
        });
      }
      
      // Send alerts if needed
      if (alerts.length > 0 && monitoringConfig.enableAlerts) {
        await this.sendAlerts(alerts);
      }
      
      // Log health status
      if (results.status !== 'healthy') {
        logger.warn('Health check issues detected:', results);
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to perform health check:', error);
    }
  }

  /**
   * Report metrics
   */
  async reportMetrics() {
    try {
      const metrics = SystemMetrics.getMetrics();
      const performanceSummary = performanceMonitor.getSummary();
      
      // Send to Sentry
      captureMetric('system.cpu.usage', metrics.cpu.usage, 'percent');
      captureMetric('system.memory.usage', metrics.memory.usagePercent, 'percent');
      captureMetric('system.memory.heap', metrics.memory.heapUsed, 'byte');
      captureMetric('system.uptime', metrics.system.uptime, 'second');
      
      // Log performance summary
      logger.info('Performance summary:', performanceSummary);
      
      // Check for performance issues
      const alerts = [];
      
      for (const [route, stats] of Object.entries(performanceSummary)) {
        if (stats.avgResponseTime > monitoringConfig.responseTimeThreshold) {
          alerts.push({
            type: 'performance',
            message: `Slow route detected: ${route} (avg: ${stats.avgResponseTime.toFixed(2)}ms)`,
            severity: 'warning'
          });
        }
        
        if (stats.errorRate > monitoringConfig.errorRateThreshold) {
          alerts.push({
            type: 'error_rate',
            message: `High error rate: ${route} (${stats.errorRate.toFixed(2)}%)`,
            severity: 'error'
          });
        }
      }
      
      if (alerts.length > 0 && monitoringConfig.enableAlerts) {
        await this.sendAlerts(alerts);
      }
      
      // Reset performance metrics after reporting
      performanceMonitor.reset();
    } catch (error) {
      logger.error('Failed to report metrics:', error);
    }
  }

  /**
   * Send alerts
   */
  async sendAlerts(alerts) {
    try {
      // Log alerts
      alerts.forEach(alert => {
        if (alert.severity === 'error') {
          logger.error(`ALERT: ${alert.message}`);
        } else {
          logger.warn(`ALERT: ${alert.message}`);
        }
      });
      
      // Send to Sentry
      Sentry.captureMessage(`Monitoring alerts: ${alerts.length} issues detected`, 'warning');
      
      // Send webhook if configured
      if (monitoringConfig.alertWebhook) {
        // Implementation for webhook alerts
        // await sendWebhook(monitoringConfig.alertWebhook, alerts);
      }
    } catch (error) {
      logger.error('Failed to send alerts:', error);
    }
  }

  /**
   * Register default health checks
   */
  registerDefaultHealthChecks() {
    // Database health check
    this.healthCheckManager.register('database', async () => {
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      
      if (!process.env.SUPABASE_URL || !supabaseKey) {
        return {
          responseTime: 0,
          message: 'Database not configured',
          status: 'not_configured'
        };
      }
      
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        supabaseKey
      );
      
      const start = Date.now();
      const { error } = await supabase.from('users').select('count').limit(1);
      
      if (error) throw error;
      
      return {
        responseTime: Date.now() - start,
        message: 'Database connection successful'
      };
    }, { critical: false, timeout: 5000 });

    // Memory health check
    this.healthCheckManager.register('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (heapUsedPercent > 90) {
        throw new Error(`High memory usage: ${heapUsedPercent.toFixed(2)}%`);
      }
      
      return {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        message: 'Memory usage within limits'
      };
    }, { critical: false });

    // CPU health check
    this.healthCheckManager.register('cpu', async () => {
      const metrics = SystemMetrics.getMetrics();
      
      if (metrics.cpu.usage > 90) {
        throw new Error(`High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`);
      }
      
      return {
        cpuUsage: metrics.cpu.usage.toFixed(2),
        loadAverage: metrics.cpu.loadAverage,
        message: 'CPU usage within limits'
      };
    }, { critical: false });

    // Process health check
    this.healthCheckManager.register('process', async () => {
      return {
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
        message: 'Process running normally'
      };
    }, { critical: false });
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();

export default {
  monitoringConfig,
  SystemMetrics,
  HealthCheckManager,
  MonitoringService,
  monitoringService
};