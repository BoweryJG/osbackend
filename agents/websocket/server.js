import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

import { AgentCore } from '../core/agentCore.js';
import { ConversationManager } from '../core/conversationManager.js';

class AgentWebSocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          'https://repconnect1.netlify.app',
          'http://localhost:3000',
          'http://localhost:5173',
          process.env.FRONTEND_URL
        ].filter(Boolean),
        credentials: true
      },
      path: '/agents-ws'
    });

    // Only initialize Supabase if credentials are available
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (process.env.SUPABASE_URL && supabaseKey) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        supabaseKey
      );
    } else {
      console.warn('WebSocket Server: Supabase credentials not found');
      this.supabase = null;
    }

    // Store AgentCore instances per app (lazy initialization)
    this.agentCores = new Map();
    this.conversationManager = new ConversationManager(this.supabase);
    
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        // Get appName from handshake, default to 'canvas'
        const appName = socket.handshake.auth.appName || 'canvas';
        socket.appName = appName;
        
        console.log(`WebSocket connection attempt for app: ${appName}`);

        // Skip auth if Supabase is not configured
        if (!this.supabase) {
          console.warn('WebSocket: Authentication skipped - Supabase not configured');
          socket.userId = 'demo-user';
          socket.userEmail = 'demo@example.com';
          return next();
        }

        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (error || !user) {
          return next(new Error('Invalid authentication token'));
        }

        socket.userId = user.id;
        socket.userEmail = user.email;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  // Get or create AgentCore for a specific app
  getAgentCore(appName) {
    if (!this.agentCores.has(appName)) {
      console.log(`Creating new AgentCore instance for app: ${appName}`);
      this.agentCores.set(appName, new AgentCore(appName));
    }
    return this.agentCores.get(appName);
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected to agent chat for app: ${socket.appName}`);

      // Join user-specific room
      socket.join(`user:${socket.userId}`);

      // Handle chat messages
      socket.on('message', async (data) => {
        try {
          await this.handleMessage(socket, data);
        } catch (error) {
          console.error('Message handling error:', error);
          socket.emit('error', {
            message: 'Failed to process message',
            code: 'MESSAGE_ERROR'
          });
        }
      });

      // Handle conversation management
      socket.on('conversation:list', async () => {
        try {
          const conversations = await this.conversationManager.listConversations(socket.userId);
          socket.emit('conversation:list', conversations);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to list conversations',
            code: 'LIST_ERROR'
          });
        }
      });

      socket.on('conversation:load', async (conversationId) => {
        try {
          const conversation = await this.conversationManager.loadConversation(
            conversationId,
            socket.userId
          );
          socket.emit('conversation:loaded', conversation);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to load conversation',
            code: 'LOAD_ERROR'
          });
        }
      });

      socket.on('conversation:new', async (data) => {
        try {
          const conversation = await this.conversationManager.createConversation(
            socket.userId,
            data.agentId,
            data.title
          );
          socket.emit('conversation:created', conversation);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to create conversation',
            code: 'CREATE_ERROR'
          });
        }
      });

      // Handle agent listing
      socket.on('agent:list', async () => {
        try {
          const agentCore = this.getAgentCore(socket.appName);
          const agents = await agentCore.listAgents();
          socket.emit('agent:list', agents);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to list agents',
            code: 'AGENT_LIST_ERROR'
          });
        }
      });

      // Handle agent selection
      socket.on('agent:select', async (agentId) => {
        try {
          const agentCore = this.getAgentCore(socket.appName);
          const agent = await agentCore.getAgent(agentId);
          socket.emit('agent:selected', agent);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to select agent',
            code: 'AGENT_ERROR'
          });
        }
      });

      // Handle typing indicators
      socket.on('typing:start', (conversationId) => {
        socket.to(`conversation:${conversationId}`).emit('user:typing', {
          userId: socket.userId,
          isTyping: true
        });
      });

      socket.on('typing:stop', (conversationId) => {
        socket.to(`conversation:${conversationId}`).emit('user:typing', {
          userId: socket.userId,
          isTyping: false
        });
      });

      // Handle voice messages
      socket.on('voice:message', async (data) => {
        try {
          // Process voice message
          const transcription = await this.processVoiceMessage(data.audio);
          await this.handleMessage(socket, {
            ...data,
            message: transcription,
            isVoice: true
          });
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to process voice message',
            code: 'VOICE_ERROR'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected from agent chat (app: ${socket.appName})`);
      });
    });
  }

  async handleMessage(socket, data) {
    const { conversationId, message, agentId, metadata } = data;

    try {
      // Save user message
      await this.conversationManager.addMessage(conversationId, {
        role: 'user',
        content: message,
        userId: socket.userId,
        metadata
      });

      // Emit that agent is typing
      socket.emit('agent:typing', { isTyping: true });

      // Get conversation context
      const context = await this.conversationManager.getConversationContext(
        conversationId,
        socket.userId
      );

      // Get app-specific agent core and stream response
      const agentCore = this.getAgentCore(socket.appName);
      const stream = await agentCore.streamResponse(
        agentId,
        message,
        context,
        socket.userId
      );

      let fullResponse = '';
      let chunkCount = 0;

      for await (const chunk of stream) {
        if (chunk.type === 'text_delta') {
          fullResponse += chunk.text;
          socket.emit('agent:message:chunk', {
            conversationId,
            chunk: chunk.text,
            chunkId: chunkCount++
          });
        } else if (chunk.type === 'tool_use') {
          socket.emit('agent:tool:use', {
            conversationId,
            tool: chunk.tool,
            status: chunk.status
          });
        }
      }

      // Save agent response
      await this.conversationManager.addMessage(conversationId, {
        role: 'assistant',
        content: fullResponse,
        agentId,
        metadata: { streaming: true }
      });

      // Emit completion
      socket.emit('agent:message:complete', {
        conversationId,
        messageId: Date.now().toString()
      });

      // Stop typing indicator
      socket.emit('agent:typing', { isTyping: false });

      // Check for proactive insights using app-specific agent core
      const insights = await agentCore.checkProactiveInsights(
        conversationId,
        socket.userId
      );
      
      if (insights.length > 0) {
        socket.emit('agent:insights', {
          conversationId,
          insights
        });
      }

    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('agent:typing', { isTyping: false });
      throw error;
    }
  }

  async processVoiceMessage(audioBuffer) {
    // Implement voice transcription using existing transcription service
    // This would integrate with your existing transcription_service.js
    return 'Transcribed message placeholder';
  }

  // Broadcast to all users (for admin notifications)
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Send to specific user
  sendToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Clean up
  close() {
    // Clear all AgentCore instances
    this.agentCores.clear();
    this.io.close();
  }
}

export default AgentWebSocketServer;