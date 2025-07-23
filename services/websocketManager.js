import { EventEmitter } from 'events';

import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

import logger from '../utils/logger.js';

/**
 * WebSocket Manager
 * Centralized WebSocket logic with rooms/channels support
 */
class WebSocketManager extends EventEmitter {
  constructor() {
    super();
    
    this.wss = null;
    this.port = process.env.WS_PORT || 8082;
    this.clients = new Map(); // Map of clientId -> { ws, userId, rooms, metadata }
    this.rooms = new Map(); // Map of roomName -> Set of clientIds
    this.heartbeatInterval = 30000; // 30 seconds
    this.reconnectGracePeriod = 5000; // 5 seconds
    
    // Initialize Supabase client for auth verification
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } else {
      logger.warn('WebSocketManager: Supabase credentials not configured');
      this.supabase = null;
    }
    
    // Event types
    this.eventTypes = {
      METRIC_UPDATE: 'metric_update',
      AGENT_STATUS_CHANGE: 'agent_status_change',
      VOICE_CLONE_PROGRESS: 'voice_clone_progress',
      TRAINING_MILESTONE: 'training_milestone',
      CLIP_PLAYED: 'clip_played',
      CONNECTION_ESTABLISHED: 'connection_established',
      ROOM_JOINED: 'room_joined',
      ROOM_LEFT: 'room_left',
      ERROR: 'error',
      HEARTBEAT: 'heartbeat',
      RECONNECTED: 'reconnected'
    };
    
    // Room types
    this.roomTypes = {
      DASHBOARD_OVERVIEW: 'dashboard:overview',
      AGENT: 'agent:', // agent:{id}
      VOICE_TRAINING: 'voice:training',
      CLIPS_ANALYTICS: 'clips:analytics',
      USER: 'user:', // user:{id}
      ADMIN: 'admin:broadcast'
    };
    
    // Start heartbeat checker
    this.startHeartbeatChecker();
  }
  
  /**
   * Start the WebSocket server
   */
  start() {
    this.wss = new WebSocketServer({ 
      port: this.port,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      }
    });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
    
    logger.info(`WebSocketManager: Server started on port ${this.port}`);
    
    // Setup cleanup on server close
    this.wss.on('close', () => {
      this.cleanup();
    });
  }
  
  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const reconnectToken = req.headers['x-reconnect-token'];
    
    // Check for reconnection
    if (reconnectToken) {
      const existingClient = this.findClientByReconnectToken(reconnectToken);
      if (existingClient) {
        return this.handleReconnection(existingClient.clientId, ws);
      }
    }
    
    // Initialize client data
    const clientData = {
      ws,
      userId: null,
      rooms: new Set(),
      metadata: {
        connectedAt: new Date(),
        lastActivity: new Date(),
        userAgent: req.headers['user-agent'],
        ip: req.socket.remoteAddress,
        reconnectToken: this.generateReconnectToken()
      },
      authenticated: false,
      heartbeatTimeout: null
    };
    
    this.clients.set(clientId, clientData);
    
    // Send connection established event with reconnect token
    this.sendToClient(clientId, {
      type: this.eventTypes.CONNECTION_ESTABLISHED,
      data: {
        clientId,
        reconnectToken: clientData.metadata.reconnectToken,
        timestamp: new Date().toISOString()
      }
    });
    
    // Setup event handlers
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await this.handleMessage(clientId, data);
      } catch (error) {
        logger.error(`WebSocketManager: Message parse error for ${clientId}:`, error);
        this.sendError(clientId, 'Invalid message format');
      }
    });
    
    ws.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });
    
    ws.on('error', (error) => {
      logger.error(`WebSocketManager: WebSocket error for ${clientId}:`, error);
      this.handleDisconnection(clientId, 1006, 'WebSocket error');
    });
    
    ws.on('pong', () => {
      this.handleHeartbeatResponse(clientId);
    });
    
    // Start heartbeat for this client
    this.startClientHeartbeat(clientId);
    
    logger.info(`WebSocketManager: Client connected: ${clientId}`);
  }
  
  /**
   * Handle client reconnection
   */
  handleReconnection(oldClientId, newWs) {
    const oldClient = this.clients.get(oldClientId);
    if (!oldClient) return;
    
    logger.info(`WebSocketManager: Client reconnecting: ${oldClientId}`);
    
    // Update WebSocket instance
    oldClient.ws = newWs;
    oldClient.metadata.lastReconnect = new Date();
    
    // Clear disconnect timeout if exists
    if (oldClient.disconnectTimeout) {
      clearTimeout(oldClient.disconnectTimeout);
      delete oldClient.disconnectTimeout;
    }
    
    // Send reconnection confirmation
    this.sendToClient(oldClientId, {
      type: this.eventTypes.RECONNECTED,
      data: {
        clientId: oldClientId,
        rooms: Array.from(oldClient.rooms),
        timestamp: new Date().toISOString()
      }
    });
    
    // Restart heartbeat
    this.startClientHeartbeat(oldClientId);
  }
  
  /**
   * Handle incoming WebSocket message
   */
  async handleMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Update last activity
    client.metadata.lastActivity = new Date();
    
    const { type, payload } = data;
    
    switch (type) {
      case 'auth':
        await this.handleAuth(clientId, payload);
        break;
        
      case 'join':
        this.joinRoom(clientId, payload.room);
        break;
        
      case 'leave':
        this.leaveRoom(clientId, payload.room);
        break;
        
      case 'message':
        this.handleRoomMessage(clientId, payload);
        break;
        
      case 'heartbeat':
        this.handleHeartbeatResponse(clientId);
        break;
        
      default:
        // Emit custom event for external handlers
        this.emit('customMessage', { clientId, type, payload });
    }
  }
  
  /**
   * Handle authentication
   */
  async handleAuth(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    try {
      const { token } = payload;
      
      if (!token) {
        throw new Error('No authentication token provided');
      }
      
      let userId;
      
      // If Supabase is configured, verify with Supabase
      if (this.supabase) {
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (error || !user) {
          throw new Error('Invalid authentication token');
        }
        userId = user.id;
        client.metadata.userEmail = user.email;
      } else {
        // Fallback to JWT verification
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId || decoded.sub;
      }
      
      // Update client data
      client.userId = userId;
      client.authenticated = true;
      
      // Auto-join user-specific room
      this.joinRoom(clientId, `${this.roomTypes.USER}${userId}`);
      
      // Send auth success
      this.sendToClient(clientId, {
        type: 'auth:success',
        data: {
          userId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.info(`WebSocketManager: Client ${clientId} authenticated as user ${userId}`);
      
    } catch (error) {
      logger.error(`WebSocketManager: Auth failed for ${clientId}:`, error);
      this.sendError(clientId, 'Authentication failed', 'AUTH_FAILED');
    }
  }
  
  /**
   * Join a room/channel
   */
  joinRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Check authentication for protected rooms
    if (this.isProtectedRoom(roomName) && !client.authenticated) {
      this.sendError(clientId, 'Authentication required to join this room', 'AUTH_REQUIRED');
      return;
    }
    
    // Add client to room
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    
    this.rooms.get(roomName).add(clientId);
    client.rooms.add(roomName);
    
    // Send room joined confirmation
    this.sendToClient(clientId, {
      type: this.eventTypes.ROOM_JOINED,
      data: {
        room: roomName,
        timestamp: new Date().toISOString()
      }
    });
    
    // Emit event for room join
    this.emit('roomJoined', { clientId, roomName, userId: client.userId });
    
    logger.info(`WebSocketManager: Client ${clientId} joined room ${roomName}`);
  }
  
  /**
   * Leave a room/channel
   */
  leaveRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }
    
    client.rooms.delete(roomName);
    
    // Send room left confirmation
    this.sendToClient(clientId, {
      type: this.eventTypes.ROOM_LEFT,
      data: {
        room: roomName,
        timestamp: new Date().toISOString()
      }
    });
    
    // Emit event for room leave
    this.emit('roomLeft', { clientId, roomName, userId: client.userId });
    
    logger.info(`WebSocketManager: Client ${clientId} left room ${roomName}`);
  }
  
  /**
   * Handle room message
   */
  handleRoomMessage(clientId, payload) {
    const { room, data } = payload;
    const client = this.clients.get(clientId);
    
    if (!client || !client.rooms.has(room)) {
      this.sendError(clientId, 'You are not in this room', 'NOT_IN_ROOM');
      return;
    }
    
    // Broadcast to all clients in the room except sender
    this.broadcastToRoom(room, {
      type: 'room:message',
      data: {
        room,
        senderId: clientId,
        userId: client.userId,
        message: data,
        timestamp: new Date().toISOString()
      }
    }, clientId);
  }
  
  /**
   * Broadcast message to a specific room
   */
  broadcastToRoom(roomName, message, excludeClientId = null) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    
    const messageStr = JSON.stringify(message);
    
    room.forEach(clientId => {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message, messageStr);
      }
    });
  }
  
  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(message, excludeClientId = null) {
    const messageStr = JSON.stringify(message);
    
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.ws.readyState === 1) {
        this.sendToClient(clientId, message, messageStr);
      }
    });
  }
  
  /**
   * Send message to specific client
   */
  sendToClient(clientId, message, messageStr = null) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== 1) return;
    
    try {
      client.ws.send(messageStr || JSON.stringify(message));
    } catch (error) {
      logger.error(`WebSocketManager: Failed to send to ${clientId}:`, error);
    }
  }
  
  /**
   * Send message to specific user (all their connections)
   */
  sendToUser(userId, message) {
    const messageStr = JSON.stringify(message);
    
    this.clients.forEach((client, clientId) => {
      if (client.userId === userId && client.ws.readyState === 1) {
        this.sendToClient(clientId, message, messageStr);
      }
    });
  }
  
  /**
   * Send error message to client
   */
  sendError(clientId, message, code = 'ERROR') {
    this.sendToClient(clientId, {
      type: this.eventTypes.ERROR,
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Handle client disconnection
   */
  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    logger.info(`WebSocketManager: Client disconnecting: ${clientId}, code: ${code}, reason: ${reason}`);
    
    // Clear heartbeat timeout
    if (client.heartbeatTimeout) {
      clearTimeout(client.heartbeatTimeout);
    }
    
    // Set a grace period for reconnection
    client.disconnectTimeout = setTimeout(() => {
      // Remove from all rooms
      client.rooms.forEach(roomName => {
        const room = this.rooms.get(roomName);
        if (room) {
          room.delete(clientId);
          if (room.size === 0) {
            this.rooms.delete(roomName);
          }
        }
      });
      
      // Remove client
      this.clients.delete(clientId);
      
      // Emit disconnection event
      this.emit('clientDisconnected', { clientId, userId: client.userId });
      
      logger.info(`WebSocketManager: Client removed: ${clientId}`);
    }, this.reconnectGracePeriod);
  }
  
  /**
   * Start heartbeat checker
   */
  startHeartbeatChecker() {
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === 1) {
          client.ws.ping();
        }
      });
    }, this.heartbeatInterval);
  }
  
  /**
   * Start heartbeat for specific client
   */
  startClientHeartbeat(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Clear existing timeout
    if (client.heartbeatTimeout) {
      clearTimeout(client.heartbeatTimeout);
    }
    
    // Set new timeout
    client.heartbeatTimeout = setTimeout(() => {
      logger.warn(`WebSocketManager: Client ${clientId} heartbeat timeout`);
      client.ws.terminate();
    }, this.heartbeatInterval * 2);
  }
  
  /**
   * Handle heartbeat response
   */
  handleHeartbeatResponse(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Reset heartbeat timeout
    this.startClientHeartbeat(clientId);
  }
  
  /**
   * Check if room requires authentication
   */
  isProtectedRoom(roomName) {
    // Public rooms that don't require auth
    const publicRooms = [
      this.roomTypes.DASHBOARD_OVERVIEW,
      this.roomTypes.CLIPS_ANALYTICS
    ];
    
    return !publicRooms.includes(roomName) && 
           !roomName.startsWith('public:');
  }
  
  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Generate reconnect token
   */
  generateReconnectToken() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 20)}`;
  }
  
  /**
   * Find client by reconnect token
   */
  findClientByReconnectToken(token) {
    for (const [clientId, client] of this.clients) {
      if (client.metadata.reconnectToken === token) {
        return { clientId, client };
      }
    }
    return null;
  }
  
  /**
   * Get room statistics
   */
  getRoomStats() {
    const stats = {};
    
    this.rooms.forEach((clients, roomName) => {
      stats[roomName] = {
        clientCount: clients.size,
        clients: Array.from(clients)
      };
    });
    
    return stats;
  }
  
  /**
   * Get client statistics
   */
  getClientStats() {
    return {
      totalClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.authenticated).length,
      rooms: this.getRoomStats()
    };
  }
  
  /**
   * Emit metric update event
   */
  emitMetricUpdate(metricType, data) {
    this.broadcastToRoom(this.roomTypes.DASHBOARD_OVERVIEW, {
      type: this.eventTypes.METRIC_UPDATE,
      data: {
        metricType,
        metrics: data,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Emit agent status change
   */
  emitAgentStatusChange(agentId, status) {
    const roomName = `${this.roomTypes.AGENT}${agentId}`;
    
    this.broadcastToRoom(roomName, {
      type: this.eventTypes.AGENT_STATUS_CHANGE,
      data: {
        agentId,
        status,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Emit voice clone progress
   */
  emitVoiceCloneProgress(userId, progress) {
    // Send to user's room
    this.sendToUser(userId, {
      type: this.eventTypes.VOICE_CLONE_PROGRESS,
      data: {
        progress,
        timestamp: new Date().toISOString()
      }
    });
    
    // Also broadcast to voice training room
    this.broadcastToRoom(this.roomTypes.VOICE_TRAINING, {
      type: this.eventTypes.VOICE_CLONE_PROGRESS,
      data: {
        userId,
        progress,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Emit training milestone
   */
  emitTrainingMilestone(data) {
    this.broadcastToRoom(this.roomTypes.VOICE_TRAINING, {
      type: this.eventTypes.TRAINING_MILESTONE,
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Emit clip played event
   */
  emitClipPlayed(clipId, metadata) {
    this.broadcastToRoom(this.roomTypes.CLIPS_ANALYTICS, {
      type: this.eventTypes.CLIP_PLAYED,
      data: {
        clipId,
        metadata,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Clear all timeouts
    this.clients.forEach((client) => {
      if (client.heartbeatTimeout) {
        clearTimeout(client.heartbeatTimeout);
      }
      if (client.disconnectTimeout) {
        clearTimeout(client.disconnectTimeout);
      }
    });
    
    // Clear maps
    this.clients.clear();
    this.rooms.clear();
    
    logger.info('WebSocketManager: Cleanup completed');
  }
  
  /**
   * Stop the WebSocket server
   */
  stop() {
    if (this.wss) {
      // Close all client connections
      this.clients.forEach((client, clientId) => {
        client.ws.close(1000, 'Server shutting down');
      });
      
      // Close server
      this.wss.close(() => {
        logger.info('WebSocketManager: Server stopped');
      });
    }
    
    this.cleanup();
  }
}

// Create singleton instance
const websocketManager = new WebSocketManager();

// Export instance and methods
export default websocketManager;

// Convenience exports
export const startWebSocketServer = () => websocketManager.start();
export const broadcastToRoom = (room, message) => websocketManager.broadcastToRoom(room, message);
export const broadcastToAll = (message) => websocketManager.broadcastToAll(message);
export const sendToUser = (userId, message) => websocketManager.sendToUser(userId, message);
export const emitMetricUpdate = (metricType, data) => websocketManager.emitMetricUpdate(metricType, data);
export const emitAgentStatusChange = (agentId, status) => websocketManager.emitAgentStatusChange(agentId, status);
export const emitVoiceCloneProgress = (userId, progress) => websocketManager.emitVoiceCloneProgress(userId, progress);
export const emitTrainingMilestone = (data) => websocketManager.emitTrainingMilestone(data);
export const emitClipPlayed = (clipId, metadata) => websocketManager.emitClipPlayed(clipId, metadata);
export const getWebSocketStats = () => websocketManager.getClientStats();