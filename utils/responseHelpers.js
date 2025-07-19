/**
 * Standardized API Response Helpers
 * Ensures consistent response format across all endpoints
 */

/**
 * Create a standardized success response
 * @param {any} data - The response data
 * @param {string} message - Optional success message  
 * @param {object} meta - Optional metadata (pagination, etc.)
 * @returns {object} Standardized success response
 */
export const successResponse = (data, message = null, meta = null) => {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  if (message) response.message = message;
  if (meta) response.meta = meta;

  return response;
};

/**
 * Create a standardized error response
 * @param {string} code - Error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
 * @param {string} message - Human readable error message
 * @param {any} details - Optional additional error details
 * @param {number} statusCode - HTTP status code (default: 500)
 * @returns {object} Standardized error response
 */
export const errorResponse = (code, message, details = null, statusCode = 500) => {
  const response = {
    success: false,
    error: {
      code,
      message,
      statusCode
    },
    timestamp: new Date().toISOString()
  };

  if (details) response.error.details = details;

  return response;
};

/**
 * Common error responses for reuse
 */
export const commonErrors = {
  notAuthenticated: () => errorResponse('NOT_AUTHENTICATED', 'Authentication required', null, 401),
  notAuthorized: () => errorResponse('NOT_AUTHORIZED', 'Insufficient permissions', null, 403),
  notFound: (resource = 'Resource') => errorResponse('NOT_FOUND', `${resource} not found`, null, 404),
  validation: (details) => errorResponse('VALIDATION_ERROR', 'Validation failed', details, 400),
  serverError: (message = 'Internal server error') => errorResponse('SERVER_ERROR', message, null, 500),
  badRequest: (message) => errorResponse('BAD_REQUEST', message, null, 400)
};

/**
 * Express middleware to send standardized responses
 */
export const responseMiddleware = (req, res, next) => {
  res.success = (data, message, meta) => {
    return res.json(successResponse(data, message, meta));
  };

  res.error = (code, message, details, statusCode = 500) => {
    return res.status(statusCode).json(errorResponse(code, message, details, statusCode));
  };

  res.commonError = (errorType, ...args) => {
    const error = commonErrors[errorType](...args);
    return res.status(error.error.statusCode).json(error);
  };

  next();
};

export default {
  successResponse,
  errorResponse,
  commonErrors,
  responseMiddleware
};