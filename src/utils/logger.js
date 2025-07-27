const winston = require('winston');

const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(logColors);

// Create log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    if (info.stack) {
      return `${info.timestamp} ${info.level}: ${info.message}\n${info.stack}`;
    }
    return `${info.timestamp} ${info.level}: ${info.message}`;
  })
);

// Create JSON format for file logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: logFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    format: jsonFormat,
    level: 'info'
  }),
  
  // File transport for error logs only
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    format: jsonFormat,
    level: 'error'
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  transports,
  exitOnError: false,
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/rejections.log') })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/exceptions.log') })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add structured logging methods
logger.logRequest = (req, message = 'Request received') => {
  logger.info(message, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
};

logger.logResponse = (req, res, duration, message = 'Request completed') => {
  logger.info(message, {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
};

logger.logError = (error, context = {}) => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
    timestamp: new Date().toISOString()
  });
};

logger.logService = (service, action, data = {}) => {
  logger.info(`${service} - ${action}`, {
    service,
    action,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logDatabase = (operation, table, data = {}) => {
  logger.info(`Database ${operation}`, {
    operation,
    table,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logAuth = (action, userId, data = {}) => {
  logger.info(`Auth - ${action}`, {
    action,
    userId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logWebSocket = (event, sessionId, data = {}) => {
  logger.info(`WebSocket - ${event}`, {
    event,
    sessionId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logAPI = (service, endpoint, data = {}) => {
  logger.info(`API Call - ${service}`, {
    service,
    endpoint,
    ...data,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;