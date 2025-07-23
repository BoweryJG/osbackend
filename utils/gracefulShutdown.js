import logger from './logger.js';

/**
 * Graceful shutdown handler for production deployment
 * Handles SIGTERM, SIGINT, and uncaught exceptions
 */
class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this.cleanupTasks = new Map();
    this.server = null;
    this.shutdownTimeout = 30000; // 30 seconds default
  }

  /**
   * Initialize graceful shutdown with server instance
   * @param {import('http').Server} server - HTTP server instance
   * @param {number} timeout - Shutdown timeout in milliseconds
   */
  init(server, timeout = 30000) {
    this.server = server;
    this.shutdownTimeout = timeout;

    // Register signal handlers
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, starting graceful shutdown...');
      this.shutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal, starting graceful shutdown...');
      this.shutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception, shutting down gracefully...', { error });
      this.shutdown('UNCAUGHT_EXCEPTION', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection, shutting down gracefully...', { 
        reason, 
        promise: promise.toString() 
      });
      this.shutdown('UNHANDLED_REJECTION', 1);
    });

    logger.info('Graceful shutdown handler initialized');
  }

  /**
   * Register a cleanup task
   * @param {string} name - Task name for logging
   * @param {Function} task - Async cleanup function
   * @param {number} priority - Priority (lower number = higher priority)
   */
  registerCleanupTask(name, task, priority = 10) {
    this.cleanupTasks.set(name, { task, priority });
    logger.debug(`Registered cleanup task: ${name} (priority: ${priority})`);
  }

  /**
   * Start graceful shutdown process
   * @param {string} signal - Signal that triggered shutdown
   * @param {number} exitCode - Exit code to use
   */
  async shutdown(signal, exitCode = 0) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    logger.info(`Starting graceful shutdown due to ${signal}...`);

    // Set a hard timeout to prevent hanging
    const forceExitTimer = setTimeout(() => {
      logger.error(`Force exit after ${this.shutdownTimeout}ms timeout`);
      process.exit(1);
    }, this.shutdownTimeout);

    this.shutdownPromise = this._performShutdown(signal, exitCode);
    
    try {
      await this.shutdownPromise;
      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown completed successfully');
      process.exit(exitCode);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Error during graceful shutdown', { error });
      process.exit(1);
    }
  }

  /**
   * Perform the actual shutdown sequence
   * @private
   */
  async _performShutdown(signal, exitCode) {
    const shutdownStart = Date.now();

    try {
      // Step 1: Stop accepting new connections
      if (this.server) {
        logger.info('Stopping server from accepting new connections...');
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('Server stopped accepting new connections');
      }

      // Step 2: Execute cleanup tasks in priority order
      const sortedTasks = Array.from(this.cleanupTasks.entries())
        .sort(([, a], [, b]) => a.priority - b.priority);

      for (const [name, { task }] of sortedTasks) {
        logger.info(`Executing cleanup task: ${name}...`);
        try {
          await Promise.race([
            task(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 5000)
            )
          ]);
          logger.info(`Cleanup task completed: ${name}`);
        } catch (error) {
          logger.error(`Cleanup task failed: ${name}`, { error });
        }
      }

      // Step 3: Close database connections (handled by cleanup tasks)
      // Step 4: Flush logs
      await this._flushLogs();

      const shutdownDuration = Date.now() - shutdownStart;
      logger.info(`Graceful shutdown completed in ${shutdownDuration}ms`);

    } catch (error) {
      logger.error('Error during shutdown process', { error });
      throw error;
    }
  }

  /**
   * Flush all log transports
   * @private
   */
  async _flushLogs() {
    return new Promise((resolve) => {
      logger.winston.end(() => {
        resolve();
      });
    });
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDownNow() {
    return this.isShuttingDown;
  }

  /**
   * Middleware to reject new requests during shutdown
   */
  middleware() {
    return (req, res, next) => {
      if (this.isShuttingDown) {
        res.status(503).json({
          success: false,
          error: {
            message: 'Server is shutting down',
            code: 'SERVICE_UNAVAILABLE'
          }
        });
        return;
      }
      next();
    };
  }
}

// Create singleton instance
const gracefulShutdown = new GracefulShutdown();

export default gracefulShutdown;