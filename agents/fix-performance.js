#!/usr/bin/env node

/**
 * Agent 6: Performance & Monitoring
 * Mission: Add metrics and optimize
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';

class PerformanceFixAgent {
  constructor() {
    this.fixes = [];
    this.errors = [];
    this.metrics = {
      poolConnections: 0,
      wsConnections: 0,
      queryPerformance: [],
      healthChecks: []
    };
  }
  
  async run() {
    console.log(chalk.blue('🔧 Agent 6: Performance & Monitoring starting...'));
    
    try {
      // Step 1: Enable pool metrics collection
      await this.enablePoolMetrics();
      
      // Step 2: Add WebSocket connection tracking
      await this.addWebSocketTracking();
      
      // Step 3: Implement query performance logging
      await this.addQueryPerformanceLogging();
      
      // Step 4: Set up health check endpoints
      await this.setupHealthCheckEndpoints();
      
      // Step 5: Create metrics dashboard
      await this.createMetricsDashboard();
      
      console.log(chalk.green('✅ Performance & Monitoring completed successfully!'));
      console.log(chalk.gray(`Fixed ${this.fixes.length} issues`));
      
      return {
        success: true,
        fixes: this.fixes,
        errors: this.errors,
        metrics: this.metrics
      };
      
    } catch (error) {
      console.error(chalk.red('❌ Performance & Monitoring failed:'), error);
      return {
        success: false,
        fixes: this.fixes,
        errors: [...this.errors, error.message]
      };
    }
  }
  
  async enablePoolMetrics() {
    console.log('📝 Enabling database pool metrics collection...');
    
    const poolPath = join(process.cwd(), 'services/databasePool.js');
    let content = await readFile(poolPath, 'utf8');
    
    // Add metrics collection
    const metricsCode = `
  
  /**
   * Collect pool metrics
   */
  collectMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      activeConnections: this.activeQueries.size,
      totalQueries: this.queryCount,
      cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      averageQueryTime: this.calculateAverageQueryTime(),
      poolStats: this.getPoolStats()
    };
    
    // Emit metrics for monitoring
    if (global.websocketManager) {
      global.websocketManager.emitMetricUpdate('database', metrics);
    }
    
    return metrics;
  }
  
  /**
   * Calculate average query time
   */
  calculateAverageQueryTime() {
    if (this.queryTimes.length === 0) return 0;
    
    const sum = this.queryTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.queryTimes.length);
  }
  
  /**
   * Start metrics collection interval
   */
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds
  }`;
    
    // Insert before the closing brace
    const classEndIndex = content.lastIndexOf('}');
    if (!content.includes('collectMetrics()')) {
      content = content.slice(0, classEndIndex) + metricsCode + '\n' + content.slice(classEndIndex);
      
      // Add metrics properties to constructor
      const constructorIndex = content.indexOf('constructor(');
      const constructorEndIndex = content.indexOf('}', constructorIndex);
      const metricsProps = `
    this.queryTimes = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.startMetricsCollection();`;
      
      content = content.slice(0, constructorEndIndex) + metricsProps + '\n  ' + content.slice(constructorEndIndex);
      
      await writeFile(poolPath, content);
      this.fixes.push('Added database pool metrics collection');
      console.log(chalk.green('✓ Pool metrics enabled'));
    } else {
      console.log(chalk.yellow('⚠️  Pool metrics already enabled'));
    }
  }
  
  async addWebSocketTracking() {
    console.log('📝 Adding WebSocket connection tracking...');
    
    const wsPath = join(process.cwd(), 'services/websocketManager.js');
    let content = await readFile(wsPath, 'utf8');
    
    // Add connection tracking
    if (!content.includes('connectionMetrics')) {
      const trackingCode = `
  
  /**
   * Track connection metrics
   */
  trackConnectionMetrics() {
    const metrics = {
      totalConnections: this.clients.size,
      authenticatedConnections: Array.from(this.clients.values()).filter(c => c.authenticated).length,
      roomDistribution: this.getRoomDistribution(),
      connectionDuration: this.getAverageConnectionDuration(),
      messagesPerSecond: this.calculateMessageRate()
    };
    
    // Store for dashboard
    this.connectionMetrics = metrics;
    
    // Emit update
    this.emit('metrics:update', metrics);
    
    return metrics;
  }
  
  /**
   * Get room distribution
   */
  getRoomDistribution() {
    const distribution = {};
    this.rooms.forEach((clients, room) => {
      distribution[room] = clients.size;
    });
    return distribution;
  }
  
  /**
   * Calculate average connection duration
   */
  getAverageConnectionDuration() {
    const durations = [];
    const now = Date.now();
    
    this.clients.forEach(client => {
      if (client.metadata.connectedAt) {
        durations.push(now - client.metadata.connectedAt.getTime());
      }
    });
    
    if (durations.length === 0) return 0;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000); // in seconds
  }
  
  /**
   * Calculate message rate
   */
  calculateMessageRate() {
    // Implementation for tracking messages per second
    return this.messageCount || 0;
  }
  
  /**
   * Start connection tracking
   */
  startConnectionTracking() {
    this.trackingInterval = setInterval(() => {
      this.trackConnectionMetrics();
    }, 10000); // Every 10 seconds
  }`;
      
      // Insert before cleanup method
      const cleanupIndex = content.indexOf('cleanup() {');
      content = content.slice(0, cleanupIndex) + trackingCode + '\n  \n  ' + content.slice(cleanupIndex);
      
      // Add to constructor
      const constructorEnd = content.indexOf('this.startHeartbeatChecker();');
      content = content.slice(0, constructorEnd) + 
        'this.startHeartbeatChecker();\n    this.startConnectionTracking();' +
        content.slice(constructorEnd + 'this.startHeartbeatChecker();'.length);
      
      await writeFile(wsPath, content);
      this.fixes.push('Added WebSocket connection tracking');
      console.log(chalk.green('✓ WebSocket tracking enabled'));
    } else {
      console.log(chalk.yellow('⚠️  WebSocket tracking already exists'));
    }
  }
  
  async addQueryPerformanceLogging() {
    console.log('📝 Implementing query performance logging...');
    
    const queryLoggerCode = `/**
 * Query Performance Logger
 */
import logger from './logger.js';

class QueryPerformanceLogger {
  constructor() {
    this.queries = [];
    this.slowQueryThreshold = 1000; // 1 second
    this.maxLogSize = 1000;
  }
  
  logQuery(queryName, duration, success, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      queryName,
      duration,
      success,
      slow: duration > this.slowQueryThreshold,
      ...metadata
    };
    
    this.queries.push(entry);
    
    // Keep log size manageable
    if (this.queries.length > this.maxLogSize) {
      this.queries = this.queries.slice(-this.maxLogSize);
    }
    
    // Log slow queries
    if (entry.slow) {
      logger.warn('Slow query detected:', {
        query: queryName,
        duration: \`\${duration}ms\`,
        ...metadata
      });
    }
    
    return entry;
  }
  
  getPerformanceStats() {
    if (this.queries.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        successRate: 0
      };
    }
    
    const totalDuration = this.queries.reduce((sum, q) => sum + q.duration, 0);
    const successfulQueries = this.queries.filter(q => q.success).length;
    const slowQueries = this.queries.filter(q => q.slow).length;
    
    return {
      totalQueries: this.queries.length,
      averageDuration: Math.round(totalDuration / this.queries.length),
      slowQueries,
      successRate: (successfulQueries / this.queries.length * 100).toFixed(2),
      recentQueries: this.queries.slice(-10)
    };
  }
  
  getSlowQueries(limit = 10) {
    return this.queries
      .filter(q => q.slow)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
  
  reset() {
    this.queries = [];
  }
}

export default new QueryPerformanceLogger();`;
    
    const perfLogPath = join(process.cwd(), 'utils/queryPerformanceLogger.js');
    await writeFile(perfLogPath, queryLoggerCode);
    
    this.fixes.push('Created query performance logger');
    console.log(chalk.green('✓ Query performance logging added'));
  }
  
  async setupHealthCheckEndpoints() {
    console.log('📝 Setting up comprehensive health check endpoints...');
    
    const healthRoutesCode = `/**
 * Comprehensive Health Check Routes
 */
import express from 'express';
import databasePool from '../services/databasePool.js';
import websocketManager from '../services/websocketManager.js';
import queryPerformanceLogger from '../utils/queryPerformanceLogger.js';

const router = express.Router();

/**
 * Basic health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Detailed health check
 */
router.get('/health/detailed', async (req, res) => {
  try {
    const checks = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: await checkDatabase(),
      websocket: checkWebSocket(),
      queryPerformance: queryPerformanceLogger.getPerformanceStats(),
      services: await checkServices()
    };
    
    const allHealthy = Object.values(checks).every(check => 
      typeof check === 'object' && check.healthy !== false
    );
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      checks
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Metrics endpoint
 */
router.get('/health/metrics', async (req, res) => {
  try {
    const metrics = {
      database: databasePool.collectMetrics ? databasePool.collectMetrics() : {},
      websocket: websocketManager.getClientStats(),
      queryPerformance: queryPerformanceLogger.getPerformanceStats(),
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime()
      }
    };
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message
    });
  }
});

async function checkDatabase() {
  try {
    const start = Date.now();
    const result = await databasePool.healthCheck();
    const duration = Date.now() - start;
    
    return {
      healthy: true,
      responseTime: duration,
      ...result
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

function checkWebSocket() {
  const stats = websocketManager.getClientStats();
  return {
    healthy: true,
    connections: stats.totalClients,
    authenticated: stats.authenticatedClients,
    rooms: Object.keys(stats.rooms).length
  };
}

async function checkServices() {
  const services = {
    elevenlabs: { healthy: !!process.env.ELEVENLABS_API_KEY },
    openai: { healthy: !!process.env.OPENAI_API_KEY },
    anthropic: { healthy: !!process.env.ANTHROPIC_API_KEY },
    twilio: { healthy: !!process.env.TWILIO_ACCOUNT_SID },
    stripe: { healthy: !!process.env.STRIPE_SECRET_KEY }
  };
  
  return services;
}

export default router;`;
    
    const healthRoutesPath = join(process.cwd(), 'routes/healthRoutesEnhanced.js');
    await writeFile(healthRoutesPath, healthRoutesCode);
    
    this.fixes.push('Created enhanced health check endpoints');
    console.log(chalk.green('✓ Health endpoints configured'));
  }
  
  async createMetricsDashboard() {
    console.log('📝 Creating metrics dashboard...');
    
    const dashboardCode = `<!DOCTYPE html>
<html>
<head>
  <title>osbackend Metrics Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #0a0a0a;
      color: #e0e0e0;
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .metric-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
    }
    
    .metric-title {
      font-size: 14px;
      color: #888;
      margin-bottom: 10px;
    }
    
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      color: #4CAF50;
    }
    
    .metric-status {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 5px;
    }
    
    .status-healthy { background: #4CAF50; }
    .status-warning { background: #FF9800; }
    .status-error { background: #F44336; }
    
    .progress-bar {
      width: 100%;
      height: 20px;
      background: #333;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
    }
    
    .progress-fill {
      height: 100%;
      background: #4CAF50;
      transition: width 0.3s ease;
    }
  </style>
</head>
<body>
  <h1>osbackend Metrics Dashboard</h1>
  
  <div class="dashboard">
    <div class="metric-card">
      <div class="metric-title">Database Connections</div>
      <div class="metric-value" id="db-connections">0/20</div>
      <div class="progress-bar">
        <div class="progress-fill" id="db-progress" style="width: 0%"></div>
      </div>
    </div>
    
    <div class="metric-card">
      <div class="metric-title">WebSocket Clients</div>
      <div class="metric-value" id="ws-clients">0</div>
      <div id="ws-rooms"></div>
    </div>
    
    <div class="metric-card">
      <div class="metric-title">API Response Time</div>
      <div class="metric-value" id="api-response">0ms</div>
      <canvas id="response-chart" width="300" height="100"></canvas>
    </div>
    
    <div class="metric-card">
      <div class="metric-title">Query Performance</div>
      <div class="metric-value" id="query-perf">0ms</div>
      <div id="slow-queries"></div>
    </div>
    
    <div class="metric-card">
      <div class="metric-title">System Health</div>
      <div id="system-health"></div>
    </div>
    
    <div class="metric-card">
      <div class="metric-title">Service Status</div>
      <div id="service-status"></div>
    </div>
  </div>
  
  <script>
    async function updateMetrics() {
      try {
        const response = await fetch('/health/metrics');
        const metrics = await response.json();
        
        // Update UI with metrics
        updateDatabaseMetrics(metrics.database);
        updateWebSocketMetrics(metrics.websocket);
        updateQueryMetrics(metrics.queryPerformance);
        updateSystemHealth(metrics.system);
        
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    }
    
    function updateDatabaseMetrics(data) {
      if (!data) return;
      
      const connections = data.activeConnections || 0;
      const maxConnections = 20;
      const percentage = (connections / maxConnections) * 100;
      
      document.getElementById('db-connections').textContent = \`\${connections}/\${maxConnections}\`;
      document.getElementById('db-progress').style.width = \`\${percentage}%\`;
    }
    
    function updateWebSocketMetrics(data) {
      if (!data) return;
      
      document.getElementById('ws-clients').textContent = data.totalClients || 0;
      
      const roomsHtml = Object.entries(data.rooms || {})
        .map(([room, count]) => \`<div>\${room}: \${count}</div>\`)
        .join('');
      document.getElementById('ws-rooms').innerHTML = roomsHtml;
    }
    
    function updateQueryMetrics(data) {
      if (!data) return;
      
      document.getElementById('query-perf').textContent = \`\${data.averageDuration || 0}ms\`;
      
      if (data.slowQueries > 0) {
        document.getElementById('slow-queries').innerHTML = 
          \`<div style="color: #FF9800">⚠️ \${data.slowQueries} slow queries</div>\`;
      }
    }
    
    function updateSystemHealth(data) {
      if (!data) return;
      
      const memoryUsage = Math.round(data.memory.heapUsed / 1024 / 1024);
      const uptime = Math.round(data.uptime / 60);
      
      document.getElementById('system-health').innerHTML = \`
        <div>Memory: \${memoryUsage}MB</div>
        <div>Uptime: \${uptime} minutes</div>
      \`;
    }
    
    // Update every 5 seconds
    setInterval(updateMetrics, 5000);
    updateMetrics();
  </script>
</body>
</html>`;
    
    const dashboardPath = join(process.cwd(), 'public/metrics-dashboard.html');
    await writeFile(dashboardPath, dashboardCode);
    
    this.fixes.push('Created metrics dashboard');
    console.log(chalk.green('✓ Metrics dashboard created at /public/metrics-dashboard.html'));
  }
}

// Execute agent
const agent = new PerformanceFixAgent();
agent.run().then(result => {
  process.exit(result.success ? 0 : 1);
});