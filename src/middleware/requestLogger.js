const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log incoming request
  logger.logRequest(req);
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    logger.logResponse(req, res, duration);
    originalEnd.apply(this, args);
  };
  
  next();
};

module.exports = requestLogger;