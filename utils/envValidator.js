/**
 * Environment Variable Validation Utility
 * Ensures required environment variables are present and valid
 */

import logger from './logger.js';

/**
 * Validate required environment variables
 * @param {Object} config - Configuration object with variable definitions
 * @returns {Object} - Validated environment variables
 */
export const validateEnvironment = (config) => {
  const errors = [];
  const validated = {};

  for (const [key, definition] of Object.entries(config)) {
    const value = process.env[key];
    
    // Check if required variable is missing
    if (definition.required && (!value || value.trim() === '')) {
      errors.push(`Required environment variable ${key} is missing or empty`);
      continue;
    }
    
    // Use default value if provided and variable is missing
    if (!value && definition.default !== undefined) {
      validated[key] = definition.default;
      continue;
    }
    
    // Validate value if present
    if (value) {
      if (definition.type === 'number') {
        const numValue = parseInt(value);
        if (isNaN(numValue)) {
          errors.push(`Environment variable ${key} must be a valid number`);
          continue;
        }
        validated[key] = numValue;
      } else if (definition.type === 'url') {
        try {
          new URL(value);
          validated[key] = value;
        } catch (e) {
          errors.push(`Environment variable ${key} must be a valid URL`);
          continue;
        }
      } else if (definition.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push(`Environment variable ${key} must be a valid email address`);
          continue;
        }
        validated[key] = value;
      } else if (definition.pattern) {
        if (!definition.pattern.test(value)) {
          errors.push(`Environment variable ${key} does not match required pattern`);
          continue;
        }
        validated[key] = value;
      } else {
        validated[key] = value;
      }
    }
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:', errors);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  return validated;
};

/**
 * Get required environment variable without fallback
 * @param {string} name - Environment variable name
 * @param {string} description - Description for error message
 * @returns {string} - Environment variable value
 */
export const getRequiredEnv = (name, description = null) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    const errorMsg = `Required environment variable ${name} is missing${description ? `: ${description}` : ''}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  return value.trim();
};

/**
 * Get optional environment variable with proper default handling
 * @param {string} name - Environment variable name
 * @param {any} defaultValue - Default value if not set
 * @param {Object} options - Validation options
 * @returns {any} - Environment variable value or default
 */
export const getOptionalEnv = (name, defaultValue, options = {}) => {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const trimmedValue = value.trim();
  
  if (options.type === 'number') {
    const numValue = parseInt(trimmedValue);
    if (isNaN(numValue)) {
      logger.warn(`Environment variable ${name} is not a valid number, using default: ${defaultValue}`);
      return defaultValue;
    }
    return numValue;
  }
  
  if (options.type === 'boolean') {
    return trimmedValue.toLowerCase() === 'true';
  }
  
  return trimmedValue;
};

/**
 * Common environment variable configurations
 */
export const commonEnvConfig = {
  // Security
  JWT_SECRET: { 
    required: true, 
    description: 'JWT signing secret' 
  },
  
  // Database
  SUPABASE_URL: { 
    required: true, 
    type: 'url',
    description: 'Supabase project URL' 
  },
  SUPABASE_SERVICE_KEY: { 
    required: false,
    description: 'Supabase service role key' 
  },
  SUPABASE_SERVICE_ROLE_KEY: { 
    required: false,
    description: 'Supabase service role key (alternative name)' 
  },
  SUPABASE_KEY: { 
    required: false,
    description: 'Supabase key (legacy name)' 
  },
  
  // External Services
  STRIPE_SECRET_KEY: { 
    required: false,
    description: 'Stripe secret key for payments' 
  },
  TWILIO_ACCOUNT_SID: { 
    required: false,
    description: 'Twilio account SID' 
  },
  TWILIO_AUTH_TOKEN: { 
    required: false,
    description: 'Twilio auth token' 
  },
  
  // Application
  NODE_ENV: { 
    required: false, 
    default: 'development',
    pattern: /^(development|production|test)$/
  },
  PORT: { 
    required: false, 
    type: 'number', 
    default: 3000 
  },
  FRONTEND_URL: { 
    required: false, 
    type: 'url',
    default: 'http://localhost:3000' 
  }
};

/**
 * Validate common environment variables at application startup
 */
export const validateCommonEnvironment = () => {
  const validated = validateEnvironment(commonEnvConfig);
  
  // Custom validation: Ensure at least one Supabase key is present
  if (!process.env.SUPABASE_SERVICE_KEY && 
      !process.env.SUPABASE_SERVICE_ROLE_KEY && 
      !process.env.SUPABASE_KEY) {
    throw new Error('At least one of SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_KEY must be set');
  }
  
  return validated;
};