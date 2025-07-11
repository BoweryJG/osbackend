import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import websocketManager from '../services/websocketManager.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * WebSocket route handler
 * Provides HTTP endpoints for WebSocket management and proxies WebSocket connections
 */

// Get WebSocket server status
router.get('/ws/status', (req, res) => {
  try {
    const stats = websocketManager.getClientStats();
    res.json({
      status: 'active',
      stats,
      port: process.env.WS_PORT || 8082
    });
  } catch (error) {
    logger.error('Error getting WebSocket status:', error);
    res.status(500).json({ error: 'Failed to get WebSocket status' });
  }
});

// Get room information
router.get('/ws/rooms', (req, res) => {
  try {
    const rooms = websocketManager.getRoomStats();
    res.json({ rooms });
  } catch (error) {
    logger.error('Error getting room stats:', error);
    res.status(500).json({ error: 'Failed to get room stats' });
  }
});

// Send message to a specific room (admin only)
router.post('/ws/broadcast', async (req, res) => {
  try {
    // Check admin permissions
    const user = req.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { room, message } = req.body;
    
    if (!room || !message) {
      return res.status(400).json({ error: 'Room and message are required' });
    }

    websocketManager.broadcastToRoom(room, message);
    
    res.json({ success: true, message: 'Message broadcasted' });
  } catch (error) {
    logger.error('Error broadcasting message:', error);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

// Proxy WebSocket connections
export const websocketProxy = createProxyMiddleware('/ws', {
  target: `ws://localhost:${process.env.WS_PORT || 8082}`,
  ws: true,
  changeOrigin: true,
  pathRewrite: {
    '^/ws': ''
  },
  onError: (err, req, res) => {
    logger.error('WebSocket proxy error:', err);
  },
  onProxyReqWs: (proxyReq, req, socket, options, head) => {
    // Add authentication headers if available
    const token = req.headers.authorization || req.query.token;
    if (token) {
      proxyReq.setHeader('Authorization', token);
    }
    
    // Add reconnect token if available
    const reconnectToken = req.headers['x-reconnect-token'] || req.query.reconnectToken;
    if (reconnectToken) {
      proxyReq.setHeader('X-Reconnect-Token', reconnectToken);
    }
  },
  logLevel: 'warn'
});

export default router;