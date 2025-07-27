import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ timestamp, level, message, service, userId, requestId, error, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}]`;
  
  if (service) log += ` [${service}]`;
  if (requestId) log += ` [${requestId}]`;
  if (userId) log += ` [User:${userId}]`;
  
  log += `: ${message}`;
  
  // Add error stack if available
  if (error && error.stack) {
    log += `\n${error.stack}`;
  }
  
  // Add additional metadata
  const metaKeys = Object.keys(meta);
  if (metaKeys.length > 0) {
    log += `\n  Meta: ${JSON.stringify(meta, null, 2)}`;
  }
  
  return log;
});

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

// Create the logger instance
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // Capture error stack traces
    json()
  ),
  defaultMeta: { 
    service: 'osbackend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport with colorized output for development
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        consoleFormat
      ),
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
    }),
    
    // Error logs - daily rotation
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      )
    }),
    
    // Combined logs - daily rotation
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      )
    })
  ],
  
  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      )
    })
  ],
  
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
      )
    })
  ]
});

// Create logs directory if it doesn't exist

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  mkdirSync(`${__dirname}/../logs`, { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Enhanced logger with additional methods
class Logger {
  constructor(baseLogger) {
    this.winston = baseLogger;
  }

  // Core logging methods
  error(message, meta = {}) {
    return this.winston.error(message, this._formatMeta(meta));
  }

  warn(message, meta = {}) {
    return this.winston.warn(message, this._formatMeta(meta));
  }

  info(message, meta = {}) {
    return this.winston.info(message, this._formatMeta(meta));
  }

  debug(message, meta = {}) {
    return this.winston.debug(message, this._formatMeta(meta));
  }

  trace(message, meta = {}) {
    return this.winston.log('trace', message, this._formatMeta(meta));
  }

  // Specialized logging methods
  request(req, message = 'Request received', meta = {}) {
    return this.info(message, {
      ...meta,
      requestId: req.id || req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection?.remoteAddress,
      userId: req.user?.id || req.session?.userId
    });
  }

  response(req, res, message = 'Response sent', meta = {}) {
    return this.info(message, {
      ...meta,
      requestId: req.id || req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: res.get('X-Response-Time'),
      userId: req.user?.id || req.session?.userId
    });
  }

  database(operation, table, meta = {}) {
    return this.debug(`Database ${operation}`, {
      ...meta,
      operation,
      table,
      component: 'database'
    });
  }

  auth(action, userId, meta = {}) {
    return this.info(`Auth ${action}`, {
      ...meta,
      action,
      userId,
      component: 'auth'
    });
  }

  api(service, action, meta = {}) {
    return this.debug(`API ${service} ${action}`, {
      ...meta,
      service,
      action,
      component: 'api'
    });
  }

  // Performance logging
  performance(operation, duration, meta = {}) {
    const level = duration > 1000 ? 'warn' : 'info';
    return this.winston[level](`Performance: ${operation} took ${duration}ms`, {
      ...meta,
      operation,
      duration,
      component: 'performance'
    });
  }

  // Security logging
  security(event, meta = {}) {
    return this.warn(`Security event: ${event}`, {
      ...meta,
      event,
      component: 'security'
    });
  }

  // Child logger for specific services/modules
  child(service, meta = {}) {
    return new Logger(this.winston.child({ 
      service: `${this.winston.defaultMeta.service}.${service}`,
      ...meta 
    }));
  }

  // Format metadata consistently
  _formatMeta(meta) {
    if (meta instanceof Error) {
      return { error: meta };
    }
    return meta;
  }

  // Stream interface for Morgan HTTP logging
  stream = {
    write: (message) => {
      this.info(message.trim(), { component: 'http' });
    }
  };
}

// Create singleton instance
const loggerInstance = new Logger(logger);

// Export both the logger instance and the class for testing
export default loggerInstance;
export { Logger };

// Graceful shutdown handler
process.on('SIGINT', () => {
  logger.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.end();
  process.exit(0);
});