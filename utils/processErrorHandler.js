/**
 * Global process error handler to prevent crashes
 */

import logger from './logger.js';

export function setupProcessErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT EXCEPTION - Process will continue:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Don't exit - try to recover
    // In production, we want to keep serving requests if possible
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION - Process will continue:', {
      reason: reason,
      promise: promise,
      timestamp: new Date().toISOString()
    });
    
    // Don't exit - try to recover
  });

  // Handle warning events
  process.on('warning', (warning) => {
    logger.warn('Process warning:', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  // Log when these handlers are set up
  logger.info('Process error handlers configured - service will attempt to recover from errors');
}

export default setupProcessErrorHandlers;