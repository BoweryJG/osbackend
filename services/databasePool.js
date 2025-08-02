import { createClient } from '@supabase/supabase-js';

import logger from '../utils/logger.js';

/**
 * Database Connection Pool Manager for Supabase
 * Manages connection pooling, query optimization, and connection health
 */
class DatabasePool {
  constructor() {
    this.pools = new Map(); // Map of pool_name -> pool_config
    this.connections = new Map(); // Map of connection_id -> connection_info
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      connectionErrors: 0,
      queryCount: 0,
      avgQueryTime: 0,
      slowQueries: 0,
      lastHealthCheck: null
    };
    
    // Pool configuration
    this.config = {
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
      minConnections: parseInt(process.env.DB_MIN_CONNECTIONS) || 2,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000, // 30 seconds
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 300000, // 5 minutes
      healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 60000, // 1 minute
      slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000, // 1 second
      retryAttempts: 3,
      retryDelay: 1000
    };
    
    // Connection quality tracking
    this.connectionHealth = {
      lastCheck: null,
      healthy: true,
      errors: [],
      avgResponseTime: 0,
      failedChecks: 0
    };
    
    // Query cache for prepared statements
    this.queryCache = new Map();
    this.maxCacheSize = 100;
    
    // Performance tracking
    this.queryTimes = [];
    this.maxQueryTimeSamples = 1000;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    
    // Initialize main pool
    this.initializeMainPool();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start metrics collection
    this.startMetricsCollection();
  }
  
  /**
   * Initialize the main Supabase connection pool
   */
  async initializeMainPool() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                         process.env.SUPABASE_SERVICE_ROLE_KEY || 
                         process.env.SUPABASE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
      }
      
      // Create optimized Supabase client with connection pooling
      const supabaseConfig = {
        auth: {
          persistSession: false, // Don't store sessions in server environment
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-connection-pool': 'main',
            'x-client-info': 'osbackend-pool'
          }
        },
        // PostgreSQL connection configuration (for PostgREST)
        rest: {
          timeout: this.config.connectionTimeout
        }
      };
      
      // Create multiple client instances for connection pooling
      const poolConnections = [];
      for (let i = 0; i < this.config.minConnections; i++) {
        const client = createClient(supabaseUrl, supabaseKey, supabaseConfig);
        const connectionId = `main_${i}_${Date.now()}`;
        
        poolConnections.push({
          id: connectionId,
          client,
          inUse: false,
          createdAt: new Date(),
          lastUsed: new Date(),
          queryCount: 0,
          errorCount: 0,
          avgQueryTime: 0
        });
        
        this.connections.set(connectionId, poolConnections[i]);
      }
      
      this.pools.set('main', {
        name: 'main',
        connections: poolConnections,
        config: supabaseConfig,
        supabaseUrl,
        supabaseKey,
        stats: {
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          avgQueryTime: 0,
          createdAt: new Date()
        }
      });
      
      this.metrics.totalConnections = poolConnections.length;
      
      logger.info(`DatabasePool: Initialized main pool with ${poolConnections.length} connections`);
      
      // Test initial connection
      // DISABLED FOR DEPLOYMENT FIX
      // await this.healthCheck();
      
    } catch (error) {
      logger.error('DatabasePool: Failed to initialize main pool:', error);
      throw error;
    }
  }
  
  /**
   * Get an available connection from the pool
   */
  async getConnection(poolName = 'main', timeout = null) {
    const startTime = Date.now();
    const timeoutMs = timeout || this.config.connectionTimeout;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      const attemptConnection = () => {
        const pool = this.pools.get(poolName);
        if (!pool) {
          clearTimeout(timeoutId);
          return reject(new Error(`Pool '${poolName}' not found`));
        }
        
        // Find available connection
        const availableConnection = pool.connections.find(conn => !conn.inUse);
        
        if (availableConnection) {
          availableConnection.inUse = true;
          availableConnection.lastUsed = new Date();
          this.metrics.activeConnections++;
          
          clearTimeout(timeoutId);
          resolve({
            ...availableConnection,
            release: () => this.releaseConnection(availableConnection.id),
            pool: poolName,
            acquiredAt: Date.now(),
            waitTime: Date.now() - startTime
          });
        } else if (pool.connections.length < this.config.maxConnections) {
          // Create new connection
          this.createConnection(poolName)
            .then(() => attemptConnection())
            .catch(reject);
        } else {
          // Wait and retry
          setTimeout(attemptConnection, 100);
        }
      };
      
      attemptConnection();
    });
  }
  
  /**
   * Release a connection back to the pool
   */
  releaseConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = new Date();
      this.metrics.activeConnections--;
      
      logger.debug(`DatabasePool: Released connection ${connectionId}`);
    }
  }
  
  /**
   * Create a new connection in the pool
   */
  async createConnection(poolName = 'main') {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Pool '${poolName}' not found`);
    }
    
    if (pool.connections.length >= this.config.maxConnections) {
      throw new Error(`Maximum connections reached for pool '${poolName}'`);
    }
    
    try {
      const client = createClient(pool.supabaseUrl, pool.supabaseKey, pool.config);
      const connectionId = `${poolName}_${pool.connections.length}_${Date.now()}`;
      
      const connection = {
        id: connectionId,
        client,
        inUse: false,
        createdAt: new Date(),
        lastUsed: new Date(),
        queryCount: 0,
        errorCount: 0,
        avgQueryTime: 0
      };
      
      pool.connections.push(connection);
      this.connections.set(connectionId, connection);
      this.metrics.totalConnections++;
      
      logger.info(`DatabasePool: Created new connection ${connectionId} in pool ${poolName}`);
      
      return connection;
    } catch (error) {
      this.metrics.connectionErrors++;
      logger.error(`DatabasePool: Failed to create connection in pool ${poolName}:`, error);
      throw error;
    }
  }
  
  /**
   * Execute query with automatic connection management
   */
  async query(queryName, queryFn, options = {}) {
    const startTime = Date.now();
    const poolName = options.pool || 'main';
    let connection = null;
    
    try {
      // Get connection from pool
      connection = await this.getConnection(poolName, options.timeout);
      
      // Execute query
      const result = await queryFn(connection.client);
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryMetrics(connection, queryTime, true);
      
      if (queryTime > this.config.slowQueryThreshold) {
        this.metrics.slowQueries++;
        logger.warn(`DatabasePool: Slow query '${queryName}' took ${queryTime}ms`, {
          queryName,
          queryTime,
          connectionId: connection.id,
          waitTime: connection.waitTime
        });
      }
      
      return result;
      
    } catch (error) {
      const queryTime = Date.now() - startTime;
      
      if (connection) {
        this.updateQueryMetrics(connection, queryTime, false);
      }
      
      this.metrics.connectionErrors++;
      
      logger.error(`DatabasePool: Query '${queryName}' failed:`, {
        error: error.message,
        queryTime,
        connectionId: connection?.id,
        waitTime: connection?.waitTime
      });
      
      // Retry logic for transient errors
      if (options.retry !== false && this.isRetryableError(error)) {
        return this.retryQuery(queryName, queryFn, options);
      }
      
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
  
  /**
   * Update query metrics for a connection
   */
  updateQueryMetrics(connection, queryTime, success) {
    connection.queryCount++;
    
    if (success) {
      // Update rolling average
      connection.avgQueryTime = 
        (connection.avgQueryTime * (connection.queryCount - 1) + queryTime) / connection.queryCount;
    } else {
      connection.errorCount++;
    }
    
    this.metrics.queryCount++;
    
    // Track query times for performance monitoring
    this.queryTimes.push(queryTime);
    if (this.queryTimes.length > this.maxQueryTimeSamples) {
      this.queryTimes.shift(); // Remove oldest
    }
    this.metrics.avgQueryTime = 
      (this.metrics.avgQueryTime * (this.metrics.queryCount - 1) + queryTime) / this.metrics.queryCount;
  }
  
  /**
   * Retry query with exponential backoff
   */
  async retryQuery(queryName, queryFn, options, attempt = 1) {
    if (attempt > this.config.retryAttempts) {
      throw new Error(`Query '${queryName}' failed after ${this.config.retryAttempts} attempts`);
    }
    
    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
    
    logger.info(`DatabasePool: Retrying query '${queryName}' (attempt ${attempt}/${this.config.retryAttempts}) after ${delay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      return await this.query(queryName, queryFn, { ...options, retry: false });
    } catch (error) {
      return this.retryQuery(queryName, queryFn, options, attempt + 1);
    }
  }
  
  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'connection',
      'timeout'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  }
  
  /**
   * Health check for all pools
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      const healthChecks = [];
      
      for (const [poolName, pool] of this.pools) {
        healthChecks.push(this.checkPoolHealth(poolName, pool));
      }
      
      const results = await Promise.allSettled(healthChecks);
      
      const healthyPools = results.filter(r => r.status === 'fulfilled').length;
      const totalPools = results.length;
      
      this.connectionHealth.lastCheck = new Date();
      this.connectionHealth.healthy = healthyPools === totalPools;
      this.connectionHealth.avgResponseTime = Date.now() - startTime;
      
      if (!this.connectionHealth.healthy) {
        this.connectionHealth.failedChecks++;
        const failedResults = results.filter(r => r.status === 'rejected');
        this.connectionHealth.errors = failedResults.map(r => r.reason.message);
        
        logger.error(`DatabasePool: Health check failed for ${totalPools - healthyPools}/${totalPools} pools`, {
          errors: this.connectionHealth.errors
        });
      } else {
        this.connectionHealth.failedChecks = 0;
        this.connectionHealth.errors = [];
        
        logger.debug(`DatabasePool: Health check passed for all ${totalPools} pools in ${this.connectionHealth.avgResponseTime}ms`);
      }
      
      this.metrics.lastHealthCheck = new Date();
      
      return this.connectionHealth;
      
    } catch (error) {
      this.connectionHealth.healthy = false;
      this.connectionHealth.failedChecks++;
      this.connectionHealth.errors = [error.message];
      
      logger.error('DatabasePool: Health check failed:', error);
      throw error;
    }
  }
  
  /**
   * Check health of individual pool
   */
  async checkPoolHealth(poolName, pool) {
    const connection = await this.getConnection(poolName, 5000);
    
    try {
      // Simple health check query
      const { error } = await connection.client
        .from('user_subscriptions')
        .select('id')
        .limit(1);
      
      if (error) {
        throw error;
      }
      
      return { poolName, healthy: true };
    } finally {
      connection.release();
    }
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.healthCheck();
        
        // Clean up idle connections
        await this.cleanupIdleConnections();
        
      } catch (error) {
        logger.error('DatabasePool: Health monitoring error:', error);
      }
    }, this.config.healthCheckInterval);
    
    logger.info(`DatabasePool: Health monitoring started (interval: ${this.config.healthCheckInterval}ms)`);
  }
  
  /**
   * Cleanup idle connections
   */
  async cleanupIdleConnections() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [poolName, pool] of this.pools) {
      const idleConnections = pool.connections.filter(conn => 
        !conn.inUse && 
        (now - conn.lastUsed.getTime()) > this.config.idleTimeout &&
        pool.connections.length > this.config.minConnections
      );
      
      for (const conn of idleConnections) {
        // Remove from pool
        const index = pool.connections.indexOf(conn);
        if (index > -1) {
          pool.connections.splice(index, 1);
          this.connections.delete(conn.id);
          this.metrics.totalConnections--;
          cleanedCount++;
          
          logger.debug(`DatabasePool: Cleaned up idle connection ${conn.id} from pool ${poolName}`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`DatabasePool: Cleaned up ${cleanedCount} idle connections`);
    }
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      const metrics = this.getDetailedMetrics();
      
      // Log metrics if in debug mode
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('DatabasePool: Metrics update', metrics);
      }
      
      // Emit metrics event for monitoring systems
      this.emit('metrics', metrics);
      
    }, 30000); // Every 30 seconds
    
    logger.info('DatabasePool: Metrics collection started');
  }
  
  /**
   * Get detailed metrics
   */
  getDetailedMetrics() {
    const poolMetrics = {};
    
    for (const [poolName, pool] of this.pools) {
      const connections = pool.connections;
      const activeConnections = connections.filter(c => c.inUse).length;
      const idleConnections = connections.length - activeConnections;
      
      poolMetrics[poolName] = {
        totalConnections: connections.length,
        activeConnections,
        idleConnections,
        totalQueries: pool.stats.totalQueries,
        successfulQueries: pool.stats.successfulQueries,
        failedQueries: pool.stats.failedQueries,
        avgQueryTime: pool.stats.avgQueryTime,
        createdAt: pool.stats.createdAt
      };
    }
    
    // Calculate performance metrics
    const performanceMetrics = {
      averageQueryTime: this.calculateAverageQueryTime(),
      slowQueries: this.queryTimes.filter(t => t > this.config.slowQueryThreshold).length,
      cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      queryTimePercentiles: this.calculatePercentiles(this.queryTimes)
    };
    
    return {
      ...this.metrics,
      connectionHealth: this.connectionHealth,
      performance: performanceMetrics,
      pools: poolMetrics,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Get pool statistics
   */
  getStats() {
    return {
      metrics: this.metrics,
      connectionHealth: this.connectionHealth,
      pools: Array.from(this.pools.keys()).map(poolName => {
        const pool = this.pools.get(poolName);
        return {
          name: poolName,
          connections: pool.connections.length,
          activeConnections: pool.connections.filter(c => c.inUse).length,
          stats: pool.stats
        };
      })
    };
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
   * Calculate percentiles for query times
   */
  calculatePercentiles(times) {
    if (times.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...times].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    return {
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0
    };
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('DatabasePool: Starting graceful shutdown...');
    
    // Wait for active connections to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.metrics.activeConnections > 0 && (Date.now() - startTime) < shutdownTimeout) {
      logger.info(`DatabasePool: Waiting for ${this.metrics.activeConnections} active connections to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Force close remaining connections
    for (const [connectionId, connection] of this.connections) {
      if (connection.inUse) {
        logger.warn(`DatabasePool: Force closing active connection ${connectionId}`);
      }
    }
    
    // Clear all pools
    this.pools.clear();
    this.connections.clear();
    
    logger.info('DatabasePool: Shutdown completed');
  }
}

// Add EventEmitter functionality
import { EventEmitter } from 'events';

Object.setPrototypeOf(DatabasePool.prototype, EventEmitter.prototype);

// Create singleton instance
const databasePool = new DatabasePool();

// Export singleton and helper functions
export default databasePool;

// Convenience exports
export const getConnection = (poolName, timeout) => databasePool.getConnection(poolName, timeout);
export const query = (queryName, queryFn, options) => databasePool.query(queryName, queryFn, options);
export const healthCheck = () => databasePool.healthCheck();
export const getStats = () => databasePool.getStats();
export const shutdown = () => databasePool.shutdown();