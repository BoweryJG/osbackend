/**
 * Security Middleware Bundle
 * Comprehensive security middleware for the application
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import logger from '../utils/logger.js';
import { getOptionalEnv } from '../utils/envValidator.js';

/**
 * Rate limiting configurations
 */
export const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000) || 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.path}`);
      res.status(429).json(defaultOptions.message);
    },
    keyGenerator: (req) => {
      // Use forwarded IP if behind proxy, otherwise use connection IP
      return req.ip || req.connection?.remoteAddress || 'unknown';
    },
    ...options
  };
  
  return rateLimit(defaultOptions);
};

/**
 * Strict rate limiter for sensitive endpoints
 */
export const strictRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // only 5 requests per 15 minutes
  message: {
    error: 'STRICT_RATE_LIMIT_EXCEEDED',
    message: 'Too many requests to this sensitive endpoint. Please try again later.',
    retryAfter: 900
  }
});

/**
 * API rate limiter for general API endpoints
 */
export const apiRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: {
    error: 'API_RATE_LIMIT_EXCEEDED',
    message: 'API rate limit exceeded. Please slow down your requests.',
    retryAfter: 900
  }
});

/**
 * Auth endpoints rate limiter
 */
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  message: {
    error: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again later.',
    retryAfter: 900
  }
});

/**
 * Configure security headers with helmet
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for some inline scripts (can be tightened)
        "https://js.stripe.com",
        "https://checkout.stripe.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles (can be tightened)
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:"
      ],
      connectSrc: [
        "'self'",
        "https://api.stripe.com",
        "wss:",
        "ws:"
      ],
      frameSrc: [
        "https://js.stripe.com",
        "https://hooks.stripe.com"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection (legacy but still useful)
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // Permissions Policy (formerly Feature Policy)
  permittedCrossDomainPolicies: false,
  
  // Cross Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Set to true if you need it
  
  // Cross Origin Opener Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin-allow-popups'
  },
  
  // Cross Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: 'cross-origin'
  }
});

/**
 * IP address validation and normalization
 */
export const normalizeIP = (req, res, next) => {
  try {
    // Handle forwarded IPs from proxies
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first (original client)
      req.clientIP = forwardedFor.split(',')[0].trim();
    } else if (realIP) {
      req.clientIP = realIP;
    } else {
      req.clientIP = req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
    }
    
    // Log suspicious patterns
    const suspiciousPatterns = [
      /(\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b.*[<>\"']/,
      /[<>\"']/,
      /(?:javascript|vbscript|onload|onerror):/i
    ];
    
    const headers = JSON.stringify(req.headers);
    if (suspiciousPatterns.some(pattern => pattern.test(headers))) {
      logger.warn(`Suspicious request headers detected from IP: ${req.clientIP}`, {
        ip: req.clientIP,
        userAgent: req.headers['user-agent'],
        path: req.path,
        method: req.method
      });
    }
    
    next();
  } catch (error) {
    logger.error('IP normalization error:', error);
    next();
  }
};

/**
 * Request size limiting
 */
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxBytes = typeof maxSize === 'string' ? 
      parseInt(maxSize) * (maxSize.includes('mb') ? 1024 * 1024 : maxSize.includes('kb') ? 1024 : 1) :
      maxSize;
    
    if (contentLength > maxBytes) {
      logger.warn(`Request size limit exceeded: ${contentLength} bytes from IP: ${req.clientIP}`);
      return res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request entity too large',
        maxSize: maxSize
      });
    }
    
    next();
  };
};

/**
 * Security event logger
 */
export const logSecurityEvent = (eventType, details, req) => {
  logger.warn('Security Event', {
    type: eventType,
    ip: req.clientIP || req.ip,
    userAgent: req.headers['user-agent'],
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    details
  });
};

/**
 * Comprehensive security middleware stack
 */
export const securityMiddleware = [
  normalizeIP,
  securityHeaders,
  requestSizeLimit('10mb'),
  apiRateLimit
];

/**
 * Security middleware for sensitive endpoints
 */
export const sensitiveEndpointSecurity = [
  normalizeIP,
  securityHeaders,
  requestSizeLimit('1mb'),
  strictRateLimit
];

/**
 * Auth endpoint security
 */
export const authEndpointSecurity = [
  normalizeIP,
  securityHeaders,
  requestSizeLimit('1mb'),
  authRateLimit
];