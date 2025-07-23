/**
 * Input Validation Middleware
 * Provides comprehensive input validation and sanitization
 */

import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

import logger from '../utils/logger.js';

/**
 * Validation schema types
 */
export const ValidationTypes = {
  EMAIL: 'email',
  URL: 'url',
  UUID: 'uuid',
  PHONE: 'phone',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  DATE: 'date',
  ENUM: 'enum'
};

/**
 * Sanitize input to prevent XSS attacks
 * @param {any} input - Input to sanitize
 * @returns {any} - Sanitized input
 */
export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove potential XSS vectors
    const sanitized = DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
    
    // Additional sanitization for common injection patterns
    return sanitized
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
};

/**
 * Validate single field based on validation rules
 * @param {any} value - Value to validate
 * @param {Object} rules - Validation rules
 * @param {string} fieldName - Field name for error messages
 * @returns {Object} - Validation result
 */
export const validateField = (value, rules, fieldName) => {
  const errors = [];
  
  // Check required
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldName} is required`);
    return { isValid: false, errors, sanitizedValue: value };
  }
  
  // Skip validation if field is optional and empty
  if (!rules.required && (value === undefined || value === null || value === '')) {
    return { isValid: true, errors: [], sanitizedValue: value };
  }
  
  let sanitizedValue = sanitizeInput(value);
  
  // Type validation
  switch (rules.type) {
    case ValidationTypes.EMAIL:
      if (!validator.isEmail(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a valid email address`);
      }
      break;
      
    case ValidationTypes.URL:
      if (!validator.isURL(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a valid URL`);
      }
      break;
      
    case ValidationTypes.UUID:
      if (!validator.isUUID(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a valid UUID`);
      }
      break;
      
    case ValidationTypes.PHONE:
      if (!validator.isMobilePhone(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a valid phone number`);
      }
      break;
      
    case ValidationTypes.STRING:
      if (typeof sanitizedValue !== 'string') {
        errors.push(`${fieldName} must be a string`);
      }
      break;
      
    case ValidationTypes.NUMBER:
      if (!validator.isNumeric(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a number`);
      } else {
        sanitizedValue = parseFloat(sanitizedValue);
      }
      break;
      
    case ValidationTypes.BOOLEAN:
      if (typeof sanitizedValue !== 'boolean' && !validator.isBoolean(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a boolean`);
      } else if (typeof sanitizedValue !== 'boolean') {
        sanitizedValue = validator.toBoolean(String(sanitizedValue));
      }
      break;
      
    case ValidationTypes.ARRAY:
      if (!Array.isArray(sanitizedValue)) {
        errors.push(`${fieldName} must be an array`);
      }
      break;
      
    case ValidationTypes.OBJECT:
      if (typeof sanitizedValue !== 'object' || Array.isArray(sanitizedValue)) {
        errors.push(`${fieldName} must be an object`);
      }
      break;
      
    case ValidationTypes.DATE:
      if (!validator.isISO8601(String(sanitizedValue))) {
        errors.push(`${fieldName} must be a valid ISO8601 date`);
      }
      break;
      
    case ValidationTypes.ENUM:
      if (!rules.values || !rules.values.includes(sanitizedValue)) {
        errors.push(`${fieldName} must be one of: ${rules.values?.join(', ')}`);
      }
      break;
  }
  
  // Length validation for strings
  if (rules.minLength && typeof sanitizedValue === 'string' && sanitizedValue.length < rules.minLength) {
    errors.push(`${fieldName} must be at least ${rules.minLength} characters long`);
  }
  
  if (rules.maxLength && typeof sanitizedValue === 'string' && sanitizedValue.length > rules.maxLength) {
    errors.push(`${fieldName} must be no more than ${rules.maxLength} characters long`);
  }
  
  // Numeric range validation
  if (rules.min !== undefined && typeof sanitizedValue === 'number' && sanitizedValue < rules.min) {
    errors.push(`${fieldName} must be at least ${rules.min}`);
  }
  
  if (rules.max !== undefined && typeof sanitizedValue === 'number' && sanitizedValue > rules.max) {
    errors.push(`${fieldName} must be no more than ${rules.max}`);
  }
  
  // Custom pattern validation
  if (rules.pattern && typeof sanitizedValue === 'string' && !rules.pattern.test(sanitizedValue)) {
    errors.push(`${fieldName} format is invalid`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue
  };
};

/**
 * Validate request data against schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} - Validation result
 */
export const validateData = (data, schema) => {
  const errors = [];
  const sanitizedData = {};
  
  // Validate each field in schema
  for (const [fieldName, rules] of Object.entries(schema)) {
    const fieldValue = data[fieldName];
    const validation = validateField(fieldValue, rules, fieldName);
    
    if (!validation.isValid) {
      errors.push(...validation.errors);
    } else {
      sanitizedData[fieldName] = validation.sanitizedValue;
    }
  }
  
  // Check for unexpected fields
  const allowedFields = Object.keys(schema);
  const providedFields = Object.keys(data || {});
  const unexpectedFields = providedFields.filter(field => !allowedFields.includes(field));
  
  if (unexpectedFields.length > 0) {
    logger.warn(`Unexpected fields in request: ${unexpectedFields.join(', ')}`);
    // Don't add to errors, but log for security monitoring
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData
  };
};

/**
 * Express middleware for input validation
 * @param {Object} schema - Validation schema
 * @param {string} source - Source of data to validate ('body', 'query', 'params')
 * @returns {Function} - Express middleware function
 */
export const validateInput = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validation = validateData(data, schema);
      
      if (!validation.isValid) {
        logger.warn(`Input validation failed for ${req.method} ${req.path}:`, validation.errors);
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: validation.errors
        });
      }
      
      // Replace original data with sanitized version
      req[source] = validation.sanitizedData;
      next();
    } catch (error) {
      logger.error('Input validation middleware error:', error);
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Input validation error'
      });
    }
  };
};

/**
 * Middleware for sanitizing all request data
 */
export const sanitizeRequest = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeInput(req.body);
    }
    if (req.query) {
      req.query = sanitizeInput(req.query);
    }
    if (req.params) {
      req.params = sanitizeInput(req.params);
    }
    next();
  } catch (error) {
    logger.error('Request sanitization error:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Request processing error'
    });
  }
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  email: {
    email: {
      type: ValidationTypes.EMAIL,
      required: true
    }
  },
  
  pagination: {
    page: {
      type: ValidationTypes.NUMBER,
      required: false,
      min: 1,
      default: 1
    },
    limit: {
      type: ValidationTypes.NUMBER,
      required: false,
      min: 1,
      max: 100,
      default: 20
    }
  },
  
  userCreate: {
    email: {
      type: ValidationTypes.EMAIL,
      required: true
    },
    password: {
      type: ValidationTypes.STRING,
      required: true,
      minLength: 8,
      maxLength: 128
    },
    firstName: {
      type: ValidationTypes.STRING,
      required: true,
      minLength: 1,
      maxLength: 50
    },
    lastName: {
      type: ValidationTypes.STRING,
      required: true,
      minLength: 1,
      maxLength: 50
    }
  },
  
  agentId: {
    agentId: {
      type: ValidationTypes.UUID,
      required: true
    }
  }
};