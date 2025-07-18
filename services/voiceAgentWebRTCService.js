import { getMediasoupService } from './mediasoupService.js';
import HarveyVoiceService from './harveyVoiceService.js';
import CallTranscriptionService from './callTranscriptionService.js';

class VoiceAgentWebRTCService {
  constructor(io) {
    this.io = io;
    this.mediasoup = getMediasoupService();
    this.harveyVoice = HarveyVoiceService.getInstance();
    this.sessions = new Map(); // sessionId -> session data
    this.transcriptionService = null; // Will be set later
    
    // Initialize namespace
    this.namespace = io.of('/voice-agents');
    this.setupEventHandlers();
  }

  setTranscriptionService(service) {
    this.transcriptionService = service;
  }

  setupEventHandlers() {
    this.namespace.on('connection', (socket) => {
      console.log('Voice agent WebRTC connection:', socket.id);
      
      socket.on('join-room', async (data) => {
        await this.handleJoinRoom(socket, data);
      });
      
      socket.on('create-transport', async (data, callback) => {
        await this.handleCreateTransport(socket, data, callback);
      });
      
      socket.on('connect-transport', async (data, callback) => {
        await this.handleConnectTransport(socket, data, callback);
      });
      
      socket.on('produce', async (data, callback) => {
        await this.handleProduce(socket, data, callback);
      });
      
      socket.on('consume', async (data, callback) => {
        await this.handleConsume(socket, data, callback);
      });
      
      socket.on('get-router-rtp-capabilities', async (data, callback) => {
        await this.handleGetRouterRtpCapabilities(socket, data, callback);
      });
      
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  async handleJoinRoom(socket, { roomId, agentId, userId }) {
    try {
      // Create or join room
      if (!this.mediasoup.rooms.has(roomId)) {
        await this.mediasoup.createRoom(roomId);
      }
      
      // Store session data
      const sessionId = `${userId}-${agentId}-${Date.now()}`;
      const session = {
        id: sessionId,
        socketId: socket.id,
        roomId,
        agentId,
        userId,
        peerId: socket.id,
        audioProcessor: null,
        transcriptionActive: false
      };
      
      this.sessions.set(sessionId, session);
      socket.data.sessionId = sessionId;
      socket.data.roomId = roomId;
      socket.data.peerId = socket.id;
      
      socket.join(roomId);
      socket.emit('room-joined', { 
        roomId, 
        sessionId,
        peerId: socket.id 
      });
      
      console.log(`User ${userId} joined room ${roomId} with agent ${agentId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleCreateTransport(socket, { direction }, callback) {
    try {
      const { roomId, peerId } = socket.data;
      
      const transportData = await this.mediasoup.createWebRtcTransport(
        roomId, 
        peerId, 
        direction
      );
      
      callback({ transportData });
    } catch (error) {
      console.error('Error creating transport:', error);
      callback({ error: error.message });
    }
  }

  async handleConnectTransport(socket, { transportId, dtlsParameters }, callback) {
    try {
      await this.mediasoup.connectTransport(transportId, dtlsParameters);
      callback({ success: true });
    } catch (error) {
      console.error('Error connecting transport:', error);
      callback({ error: error.message });
    }
  }

  async handleProduce(socket, { transportId, kind, rtpParameters, appData }, callback) {
    try {
      const producer = await this.mediasoup.createProducer(
        transportId,
        rtpParameters,
        kind,
        appData
      );
      
      // If audio producer, set up audio processing
      if (kind === 'audio') {
        const session = this.sessions.get(socket.data.sessionId);
        if (session) {
          await this.setupAudioProcessing(session, producer.id);
        }
      }
      
      callback({ id: producer.id });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ error: error.message });
    }
  }

  async handleConsume(socket, { producerId, rtpCapabilities }, callback) {
    try {
      const { roomId, peerId } = socket.data;
      
      const consumer = await this.mediasoup.createConsumer(
        roomId,
        peerId,
        producerId,
        rtpCapabilities
      );
      
      callback(consumer);
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ error: error.message });
    }
  }

  async handleGetRouterRtpCapabilities(socket, data, callback) {
    try {
      const { roomId } = socket.data;
      const router = this.mediasoup.routers.get(roomId);
      
      if (!router) {
        throw new Error('Router not found');
      }
      
      callback({ rtpCapabilities: router.rtpCapabilities });
    } catch (error) {
      console.error('Error getting RTP capabilities:', error);
      callback({ error: error.message });
    }
  }

  async setupAudioProcessing(session, producerId) {
    try {
      // Create plain transport for extracting audio
      const plainTransport = await this.mediasoup.createPlainTransport(session.roomId);
      
      // Create consumer for the audio producer
      const router = this.mediasoup.routers.get(session.roomId);
      const consumer = await plainTransport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false
      });
      
      // Set up RTP stream processing
      // This is where we'll connect to Deepgram/Whisper
      session.audioProcessor = {
        plainTransport,
        consumer,
        rtpPort: plainTransport.port,
        rtcpPort: plainTransport.rtcpPort
      };
      
      // Start transcription if service is available
      if (this.transcriptionService) {
        session.transcriptionActive = true;
        // Connect to transcription service
        // The actual RTP -> Deepgram connection would go here
      }
      
      console.log(`Audio processing setup for session ${session.id}`);
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
  }

  handleDisconnect(socket) {
    const sessionId = socket.data.sessionId;
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Clean up audio processing
      if (session.audioProcessor) {
        session.audioProcessor.consumer.close();
        session.audioProcessor.plainTransport.close();
      }
      
      // Remove from mediasoup room
      const { roomId, peerId } = socket.data;
      const room = this.mediasoup.rooms.get(roomId);
      if (room && room.peers.has(peerId)) {
        room.peers.delete(peerId);
        
        // Close room if empty
        if (room.peers.size === 0) {
          this.mediasoup.closeRoom(roomId);
        }
      }
      
      this.sessions.delete(sessionId);
      console.log(`Session ${sessionId} disconnected`);
    }
  }
}

export default VoiceAgentWebRTCService;