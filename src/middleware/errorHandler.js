const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log the error with context
  logger.logError(err, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Determine error status and message
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Don't leak error details in production
  const response = {
    error: {
      message,
      status: statusCode
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
    response.error.details = err;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;