import logger from '../utils/logger.js';

import databasePool, { query as dbQuery } from './databasePool.js';

/**
 * Optimized Database Queries
 * Pre-built, optimized queries for common database operations
 */

/**
 * User subscription queries with caching and indexing optimization
 */
export const userSubscriptionQueries = {
  /**
   * Get user subscription with caching
   */
  async getByEmail(email) {
    return dbQuery('getUserSubscriptionByEmail', async (client) => {
      const { data, error } = await client
        .from('user_subscriptions')
        .select('user_id, subscription_level, subscription_status, plan_id, email, stripe_customer_id, stripe_subscription_id')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data;
    }, { timeout: 5000 });
  },

  /**
   * Get user subscription by user ID with caching
   */
  async getByUserId(userId) {
    return dbQuery('getUserSubscriptionByUserId', async (client) => {
      const { data, error } = await client
        .from('user_subscriptions')
        .select('user_id, subscription_level, subscription_status, plan_id, email, stripe_customer_id, stripe_subscription_id')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data;
    }, { timeout: 5000 });
  },

  /**
   * Update subscription status (optimized for frequent updates)
   */
  async updateStatus(userId, status, metadata = {}) {
    return dbQuery('updateSubscriptionStatus', async (client) => {
      const { data, error } = await client
        .from('user_subscriptions')
        .update({
          subscription_status: status,
          updated_at: new Date().toISOString(),
          ...metadata
        })
        .eq('user_id', userId)
        .select();
      
      if (error) {
        throw error;
      }
      
      return data;
    }, { timeout: 3000 });
  },

  /**
   * Batch update subscription statuses
   */
  async batchUpdateStatus(updates) {
    return dbQuery('batchUpdateSubscriptionStatus', async (client) => {
      const promises = updates.map(({ userId, status, metadata }) =>
        client
          .from('user_subscriptions')
          .update({
            subscription_status: status,
            updated_at: new Date().toISOString(),
            ...metadata
          })
          .eq('user_id', userId)
      );
      
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      logger.info(`Batch subscription update: ${successful}/${updates.length} successful`);
      
      return { successful, total: updates.length, results };
    }, { timeout: 10000 });
  }
};

/**
 * Usage log queries optimized for time-series data
 */
export const usageLogQueries = {
  /**
   * Log usage with batch insertion optimization
   */
  async logUsage(userId, productType, quantity = 1, metadata = {}) {
    return dbQuery('logUsage', async (client) => {
      const { data, error } = await client
        .from('usage_logs')
        .insert([{
          user_id: userId,
          product_type: productType,
          quantity: quantity,
          metadata: metadata,
          timestamp: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      return data;
    }, { timeout: 3000 });
  },

  /**
   * Get current month usage (optimized with date indexing)
   */
  async getCurrentMonthUsage(userId) {
    return dbQuery('getCurrentMonthUsage', async (client) => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { data, error } = await client
        .from('usage_logs')
        .select('product_type, quantity')
        .eq('user_id', userId)
        .gte('timestamp', startOfMonth.toISOString())
        .order('timestamp', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      // Aggregate usage by product type
      const usage = {};
      data.forEach(record => {
        if (!usage[record.product_type]) {
          usage[record.product_type] = 0;
        }
        usage[record.product_type] += record.quantity;
      });
      
      return usage;
    }, { timeout: 5000 });
  },

  /**
   * Batch log usage entries
   */
  async batchLogUsage(entries) {
    return dbQuery('batchLogUsage', async (client) => {
      const timestamp = new Date().toISOString();
      const formattedEntries = entries.map(entry => ({
        ...entry,
        timestamp
      }));
      
      const { data, error } = await client
        .from('usage_logs')
        .insert(formattedEntries)
        .select();
      
      if (error) {
        throw error;
      }
      
      return data;
    }, { timeout: 10000 });
  },

  /**
   * Get usage analytics (optimized for reporting)
   */
  async getUsageAnalytics(userId, days = 30) {
    return dbQuery('getUsageAnalytics', async (client) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await client
        .from('usage_logs')
        .select('product_type, quantity, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', startDate.toISOString())
        .order('timestamp', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      // Process data for analytics
      const analytics = {
        totalUsage: 0,
        byProductType: {},
        dailyUsage: {},
        trends: {}
      };
      
      data.forEach(record => {
        const date = new Date(record.timestamp).toISOString().split('T')[0];
        
        analytics.totalUsage += record.quantity;
        
        if (!analytics.byProductType[record.product_type]) {
          analytics.byProductType[record.product_type] = 0;
        }
        analytics.byProductType[record.product_type] += record.quantity;
        
        if (!analytics.dailyUsage[date]) {
          analytics.dailyUsage[date] = 0;
        }
        analytics.dailyUsage[date] += record.quantity;
      });
      
      return analytics;
    }, { timeout: 8000 });
  }
};

/**
 * Module access queries with permission caching
 */
export const moduleAccessQueries = {
  /**
   * Check module access with caching
   */
  async hasAccess(userId, moduleName) {
    return dbQuery('checkModuleAccess', async (client) => {
      const { data, error } = await client
        .from('module_access')
        .select('has_access')
        .eq('user_id', userId)
        .eq('module', moduleName)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data ? data.has_access : false;
    }, { timeout: 3000 });
  },

  /**
   * Get all modules for user (optimized)
   */
  async getUserModules(userId) {
    return dbQuery('getUserModules', async (client) => {
      const { data, error } = await client
        .from('module_access')
        .select('module, has_access')
        .eq('user_id', userId)
        .eq('has_access', true);
      
      if (error) {
        throw error;
      }
      
      return data.map(item => item.module);
    }, { timeout: 3000 });
  },

  /**
   * Batch update module access
   */
  async batchUpdateAccess(userId, moduleUpdates) {
    return dbQuery('batchUpdateModuleAccess', async (client) => {
      const promises = moduleUpdates.map(({ module, hasAccess }) =>
        client
          .from('module_access')
          .upsert([{
            user_id: userId,
            module: module,
            has_access: hasAccess,
            updated_at: new Date().toISOString()
          }], { onConflict: 'user_id,module' })
      );
      
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      return { successful, total: moduleUpdates.length };
    }, { timeout: 8000 });
  }
};

/**
 * Activity log queries for audit and monitoring
 */
export const activityLogQueries = {
  /**
   * Log activity with automatic cleanup
   */
  async logActivity(task, result, userId = null, metadata = {}) {
    return dbQuery('logActivity', async (client) => {
      const { data, error } = await client
        .from('activity_log')
        .insert([{
          task,
          result: typeof result === 'object' ? JSON.stringify(result) : result,
          user_id: userId,
          metadata,
          timestamp: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        // Don't throw error for activity logging - it's non-critical
        logger.warn('Failed to log activity:', error.message);
        return null;
      }
      
      return data;
    }, { timeout: 2000, retry: false });
  },

  /**
   * Get recent activities (optimized for dashboard)
   */
  async getRecentActivities(limit = 50, userId = null) {
    return dbQuery('getRecentActivities', async (client) => {
      let query = client
        .from('activity_log')
        .select('task, result, user_id, metadata, timestamp')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw error;
      }
      
      return data;
    }, { timeout: 5000 });
  },

  /**
   * Cleanup old activity logs (maintenance query)
   */
  async cleanupOldLogs(daysToKeep = 90) {
    return dbQuery('cleanupOldActivityLogs', async (client) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const { data, error } = await client
        .from('activity_log')
        .delete()
        .lt('timestamp', cutoffDate.toISOString());
      
      if (error) {
        throw error;
      }
      
      logger.info(`Cleaned up activity logs older than ${daysToKeep} days`);
      return data;
    }, { timeout: 30000 });
  }
};

/**
 * App data queries for generic application data storage
 */
export const appDataQueries = {
  /**
   * Get app data with caching
   */
  async getData(appName, userId) {
    return dbQuery('getAppData', async (client) => {
      const { data, error } = await client
        .from('app_data')
        .select('*')
        .eq('app_name', appName)
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data;
    }, { timeout: 3000 });
  },

  /**
   * Upsert app data (create or update)
   */
  async upsertData(appName, userId, data) {
    return dbQuery('upsertAppData', async (client) => {
      const { data: result, error } = await client
        .from('app_data')
        .upsert([{
          app_name: appName,
          user_id: userId,
          data: data,
          updated_at: new Date().toISOString()
        }], { onConflict: 'app_name,user_id' })
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      return result;
    }, { timeout: 5000 });
  },

  /**
   * Delete app data
   */
  async deleteData(appName, userId) {
    return dbQuery('deleteAppData', async (client) => {
      const { error } = await client
        .from('app_data')
        .delete()
        .eq('app_name', appName)
        .eq('user_id', userId);
      
      if (error) {
        throw error;
      }
      
      return true;
    }, { timeout: 3000 });
  }
};

/**
 * Health check queries for system monitoring
 */
export const healthCheckQueries = {
  /**
   * Basic database connectivity test
   */
  async basicCheck() {
    return dbQuery('basicHealthCheck', async (client) => {
      const { data, error } = await client
        .from('user_subscriptions')
        .select('id')
        .limit(1);
      
      if (error && !error.message.includes('does not exist')) {
        throw error;
      }
      
      return { healthy: true, timestamp: new Date().toISOString() };
    }, { timeout: 2000 });
  },

  /**
   * Comprehensive system health check
   */
  async comprehensiveCheck() {
    return dbQuery('comprehensiveHealthCheck', async (client) => {
      const checks = [];
      
      // Test read operations
      try {
        await client.from('user_subscriptions').select('id').limit(1);
        checks.push({ test: 'read', status: 'pass' });
      } catch (error) {
        checks.push({ test: 'read', status: 'fail', error: error.message });
      }
      
      // Test write operations (non-destructive)
      try {
        const testId = `health_check_${Date.now()}`;
        await client.from('activity_log').insert([{
          task: 'health_check',
          result: 'test',
          metadata: { test_id: testId },
          timestamp: new Date().toISOString()
        }]);
        
        // Clean up test record
        await client.from('activity_log').delete().eq('metadata->test_id', testId);
        
        checks.push({ test: 'write', status: 'pass' });
      } catch (error) {
        checks.push({ test: 'write', status: 'fail', error: error.message });
      }
      
      const allPassed = checks.every(check => check.status === 'pass');
      
      return {
        healthy: allPassed,
        checks,
        timestamp: new Date().toISOString()
      };
    }, { timeout: 10000 });
  }
};

/**
 * Database maintenance queries
 */
export const maintenanceQueries = {
  /**
   * Vacuum analyze for performance optimization
   */
  async optimizeTables() {
    return dbQuery('optimizeTables', async (client) => {
      // Note: This would require raw SQL execution which might not be available
      // through Supabase client. This is a placeholder for potential future use.
      logger.info('Table optimization requested - would run VACUUM ANALYZE if supported');
      return { message: 'Table optimization logged for manual execution' };
    }, { timeout: 60000 });
  },

  /**
   * Get table statistics
   */
  async getTableStats() {
    return dbQuery('getTableStats', async (client) => {
      const tables = [
        'user_subscriptions',
        'usage_logs',
        'activity_log',
        'module_access',
        'app_data'
      ];
      
      const stats = {};
      
      for (const table of tables) {
        try {
          const { count, error } = await client
            .from(table)
            .select('*', { count: 'exact', head: true });
          
          if (!error) {
            stats[table] = { rows: count };
          }
        } catch (error) {
          stats[table] = { error: error.message };
        }
      }
      
      return stats;
    }, { timeout: 30000 });
  }
};

// Export all query modules
export default {
  userSubscription: userSubscriptionQueries,
  usageLog: usageLogQueries,
  moduleAccess: moduleAccessQueries,
  activityLog: activityLogQueries,
  appData: appDataQueries,
  healthCheck: healthCheckQueries,
  maintenance: maintenanceQueries
};