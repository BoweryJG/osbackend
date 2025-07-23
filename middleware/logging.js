import { v4 as uuidv4 } from 'uuid';

import logger from '../utils/logger.js';

// Request ID middleware - adds unique ID to each request
export const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.set('X-Request-ID', req.id);
  next();
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log incoming request
  logger.request(req, 'Incoming request', {
    body: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' 
      ? JSON.stringify(req.body).substring(0, 1000) // Limit body size in logs
      : undefined,
    query: req.query,
    params: req.params
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    // Log response
    logger.response(req, res, 'Request completed', {
      duration,
      contentLength: res.get('Content-Length')
    });
    
    // Log performance warning for slow requests
    if (duration > 5000) {
      logger.performance('Slow request', duration, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode
      });
    }
    
    originalEnd.apply(this, args);
  };

  next();
};

// Error logging middleware
export const errorLogger = (error, req, res, next) => {
  // Log the error with full context
  logger.error('Request error', {
    error: error,
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id || req.session?.userId,
    body: JSON.stringify(req.body).substring(0, 500),
    stack: error.stack
  });
  
  next(error);
};

// Standardized error response middleware
export const errorHandler = (error, req, res, next) => {
  // Don't log if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = null;

  // Handle different error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = error.details || error.message;
  } else if (error.name === 'UnauthorizedError' || error.status === 401) {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError' || error.status === 403) {
    statusCode = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError' || error.status === 404) {
    statusCode = 404;
    message = 'Not Found';
  } else if (error.status && error.status >= 400 && error.status < 500) {
    statusCode = error.status;
    message = error.message || 'Client Error';
  } else if (error.status && error.status >= 500) {
    statusCode = error.status;
    message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message;
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    }
  };

  // Add details in development or for client errors
  if (process.env.NODE_ENV !== 'production' || statusCode < 500) {
    if (details) {
      errorResponse.error.details = details;
    }
    if (error.code) {
      errorResponse.error.code = error.code;
    }
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

// Security event logger
export const securityLogger = (event, severity = 'medium') => (req, res, next) => {
  logger.security(`${event} - ${severity}`, {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    url: req.url,
    method: req.method,
    userId: req.user?.id || req.session?.userId,
    severity
  });
  next();
};

// Database operation logger
export const dbLogger = (operation, table) => (req, res, next) => {
  logger.database(operation, table, {
    requestId: req.id,
    userId: req.user?.id || req.session?.userId
  });
  next();
};