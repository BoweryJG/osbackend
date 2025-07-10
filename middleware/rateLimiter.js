import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';

/**
 * Create rate limiter with custom configuration
 */
export const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // 100 requests per minute
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || defaults.message,
        retryAfter: Math.ceil(options.windowMs / 1000) || 60
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  };

  return rateLimit({ ...defaults, ...options });
};

/**
 * Default rate limiter - 100 requests per minute per IP
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again in a minute.'
});

/**
 * Strict rate limiter for auth endpoints - 5 requests per minute
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * API rate limiter - 300 requests per minute
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: 'API rate limit exceeded.'
});

/**
 * WebSocket rate limiter - 50 connections per minute
 */
export const websocketRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 50,
  message: 'Too many WebSocket connection attempts.'
});

/**
 * File upload rate limiter - 10 uploads per minute
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'Too many file uploads, please try again later.'
});

/**
 * Dynamic rate limiter based on user tier
 */
export const createTierBasedRateLimiter = () => {
  const tierLimits = {
    free: 60,      // 60 requests per minute
    basic: 200,    // 200 requests per minute
    pro: 500,      // 500 requests per minute
    enterprise: 1000 // 1000 requests per minute
  };

  return (req, res, next) => {
    // Get user tier from request (assumes authentication middleware has run)
    const userTier = req.user?.tier || 'free';
    const limit = tierLimits[userTier] || tierLimits.free;

    const limiter = createRateLimiter({
      windowMs: 1 * 60 * 1000,
      max: limit,
      message: `Rate limit exceeded for ${userTier} tier. Upgrade for higher limits.`,
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise use IP
        return req.user?.id || req.ip;
      }
    });

    limiter(req, res, next);
  };
};

export default {
  createRateLimiter,
  defaultRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  websocketRateLimiter,
  uploadRateLimiter,
  createTierBasedRateLimiter
};