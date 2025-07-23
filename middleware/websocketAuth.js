import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

import logger from '../utils/logger.js';

/**
 * WebSocket Authentication Middleware
 * Provides authentication methods for WebSocket connections
 */
class WebSocketAuthMiddleware {
  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } else {
      logger.warn('WebSocketAuthMiddleware: Supabase credentials not configured');
      this.supabase = null;
    }
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.jwtSecret = process.env.JWT_SECRET;
  }
  
  /**
   * Verify authentication token
   * @param {string} token - Authentication token (JWT or Supabase)
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async verifyToken(token) {
    if (!token) {
      return { success: false, error: 'No token provided' };
    }
    
    try {
      // Try Supabase authentication first
      if (this.supabase) {
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (user && !error) {
          return {
            success: true,
            user: {
              id: user.id,
              email: user.email,
              metadata: user.user_metadata
            }
          };
        }
      }
      
      // Fallback to JWT verification
      try {
        const decoded = jwt.verify(token, this.jwtSecret);
        return {
          success: true,
          user: {
            id: decoded.userId || decoded.sub || decoded.id,
            email: decoded.email,
            metadata: decoded.metadata || {}
          }
        };
      } catch (jwtError) {
        // If both methods fail, return error
        return {
          success: false,
          error: 'Invalid token'
        };
      }
    } catch (error) {
      logger.error('WebSocketAuthMiddleware: Token verification error:', error);
      return {
        success: false,
        error: 'Token verification failed'
      };
    }
  }
  
  /**
   * Generate a JWT token for WebSocket authentication
   * @param {object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        metadata: user.metadata || {}
      },
      this.jwtSecret,
      { expiresIn: '24h' }
    );
  }
  
  /**
   * Extract token from WebSocket connection request
   * @param {object} req - WebSocket connection request
   * @returns {string|null} Token
   */
  extractToken(req) {
    // Check authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Check query parameter
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      return queryToken;
    }
    
    // Check custom header
    const customToken = req.headers['x-auth-token'];
    if (customToken) {
      return customToken;
    }
    
    return null;
  }
  
  /**
   * Middleware function for WebSocket authentication
   * @param {object} req - WebSocket connection request
   * @param {function} callback - Callback function(error, user)
   */
  async authenticate(req, callback) {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        return callback(new Error('Authentication required'), null);
      }
      
      const { success, user, error } = await this.verifyToken(token);
      
      if (!success) {
        return callback(new Error(error || 'Authentication failed'), null);
      }
      
      // Success - pass user to callback
      callback(null, user);
    } catch (error) {
      logger.error('WebSocketAuthMiddleware: Authentication error:', error);
      callback(new Error('Authentication error'), null);
    }
  }
  
  /**
   * Check if user has permission for a specific room
   * @param {object} user - User object
   * @param {string} roomName - Room name
   * @returns {boolean} Has permission
   */
  hasRoomPermission(user, roomName) {
    // Admin users can access all rooms
    if (user.metadata?.role === 'admin') {
      return true;
    }
    
    // User-specific rooms
    if (roomName.startsWith('user:') && roomName === `user:${user.id}`) {
      return true;
    }
    
    // Agent-specific rooms - check if user owns the agent
    if (roomName.startsWith('agent:')) {
      // This would require checking agent ownership in database
      // For now, allow authenticated users to access agent rooms
      return true;
    }
    
    // Public rooms
    const publicRooms = [
      'dashboard:overview',
      'clips:analytics',
      'public:'
    ];
    
    return publicRooms.some(prefix => roomName.startsWith(prefix));
  }
  
  /**
   * Validate WebSocket message permissions
   * @param {object} user - User object
   * @param {string} messageType - Type of message
   * @param {object} payload - Message payload
   * @returns {boolean} Is allowed
   */
  validateMessagePermission(user, messageType, payload) {
    // Admin users can send any message
    if (user.metadata?.role === 'admin') {
      return true;
    }
    
    // Define message type permissions
    const publicMessageTypes = [
      'heartbeat',
      'join',
      'leave',
      'message'
    ];
    
    const authenticatedMessageTypes = [
      'metrics:get',
      'metrics:subscribe',
      'agent:status',
      'voice:progress'
    ];
    
    const adminMessageTypes = [
      'broadcast',
      'system:update',
      'user:manage'
    ];
    
    // Check public message types
    if (publicMessageTypes.includes(messageType)) {
      return true;
    }
    
    // Check authenticated message types
    if (authenticatedMessageTypes.includes(messageType) && user) {
      return true;
    }
    
    // Check admin message types
    if (adminMessageTypes.includes(messageType) && user.metadata?.role === 'admin') {
      return true;
    }
    
    return false;
  }
}

// Create and export singleton instance
const websocketAuthMiddleware = new WebSocketAuthMiddleware();

export default websocketAuthMiddleware;

// Convenience exports
export const verifyToken = (token) => websocketAuthMiddleware.verifyToken(token);
export const generateToken = (user) => websocketAuthMiddleware.generateToken(user);
export const authenticate = (req, callback) => websocketAuthMiddleware.authenticate(req, callback);
export const hasRoomPermission = (user, room) => websocketAuthMiddleware.hasRoomPermission(user, room);
export const validateMessagePermission = (user, type, payload) => 
  websocketAuthMiddleware.validateMessagePermission(user, type, payload);