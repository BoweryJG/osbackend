import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import io from 'socket.io-client';
import app from '../index.js';
import voiceConversationPipeline from '../services/voiceConversationPipeline.js';

describe('Voice Integration Tests', () => {
  let server;
  let socket;
  let authToken;
  
  beforeAll(async () => {
    // Start server
    server = app.listen(0);
    const port = server.address().port;
    
    // Get auth token
    const authResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@repconnect.com',
        password: 'testpassword'
      });
    
    authToken = authResponse.body.token;
  });
  
  afterAll(async () => {
    if (socket) socket.close();
    if (server) server.close();
  });
  
  describe('Voice Session API', () => {
    it('should start a voice session', async () => {
      const response = await request(app)
        .post('/api/repconnect/agents/test-agent/start-voice-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('rtcTokens');
      expect(response.body).toHaveProperty('websocketUrl');
      expect(response.body.rtcTokens).toHaveProperty('iceServers');
    });
    
    it('should end a voice session', async () => {
      // First start a session
      const startResponse = await request(app)
        .post('/api/repconnect/agents/test-agent/start-voice-session')
        .set('Authorization', `Bearer ${authToken}`);
      
      const { sessionId } = startResponse.body;
      
      // Then end it
      const endResponse = await request(app)
        .post('/api/repconnect/agents/test-agent/end-voice-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId })
        .expect(200);
      
      expect(endResponse.body).toHaveProperty('duration');
    });
    
    it('should test audio setup', async () => {
      const response = await request(app)
        .post('/api/voice/test-audio')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ audioData: 'base64_audio_sample' })
        .expect(200);
      
      expect(response.body).toHaveProperty('deepgram');
      expect(response.body).toHaveProperty('elevenLabs');
      expect(response.body).toHaveProperty('webrtc');
    });
  });
  
  describe('WebSocket Voice Connection', () => {
    it('should connect to voice-agents namespace', (done) => {
      const port = server.address().port;
      socket = io(`http://localhost:${port}/voice-agents`, {
        auth: { token: authToken }
      });
      
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        done();
      });
    });
    
    it('should join voice room', (done) => {
      socket.emit('join-room', {
        roomId: 'test-room',
        agentId: 'test-agent',
        userId: 'test-user'
      });
      
      socket.on('room-joined', (data) => {
        expect(data).toHaveProperty('roomId');
        expect(data).toHaveProperty('sessionId');
        expect(data).toHaveProperty('peerId');
        done();
      });
    });
    
    it('should create WebRTC transport', (done) => {
      socket.emit('create-transport', { direction: 'recv' }, (response) => {
        expect(response).toHaveProperty('transportData');
        expect(response.transportData).toHaveProperty('id');
        expect(response.transportData).toHaveProperty('iceParameters');
        expect(response.transportData).toHaveProperty('iceCandidates');
        expect(response.transportData).toHaveProperty('dtlsParameters');
        done();
      });
    });
  });
  
  describe('Voice Pipeline', () => {
    it('should create voice session in pipeline', async () => {
      const session = await voiceConversationPipeline.createSession({
        sessionId: 'test-session',
        userId: 'test-user',
        agentId: 'test-agent',
        voiceSettings: {},
        deepgramConfig: { model: 'nova-2', language: 'en-US' },
        elevenLabsVoiceId: 'test-voice'
      });
      
      expect(session).toHaveProperty('id');
      expect(session.isActive).toBe(true);
      expect(session.transcriptionStream).toBeDefined();
      
      // Clean up
      await voiceConversationPipeline.endSession(session.id);
    });
    
    it('should handle audio stream connection', async () => {
      const session = await voiceConversationPipeline.createSession({
        sessionId: 'test-stream',
        userId: 'test-user',
        agentId: 'test-agent',
        voiceSettings: {},
        deepgramConfig: { model: 'nova-2', language: 'en-US' },
        elevenLabsVoiceId: 'test-voice'
      });
      
      // Mock streams
      const mockInputStream = { pipe: jest.fn() };
      const mockOutputStream = { write: jest.fn() };
      
      await voiceConversationPipeline.connectAudioStreams(
        session.id,
        mockInputStream,
        mockOutputStream
      );
      
      expect(mockInputStream.pipe).toHaveBeenCalled();
      
      await voiceConversationPipeline.endSession(session.id);
    });
  });
  
  describe('Twilio Conference', () => {
    it('should create coaching conference', async () => {
      const response = await request(app)
        .post('/api/voice/coaching/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          repPhone: '+1234567890',
          clientPhone: '+0987654321'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('conferenceId');
      expect(response.body).toHaveProperty('coachingChannel');
      expect(response.body).toHaveProperty('dialInNumber');
      expect(response.body).toHaveProperty('instructions');
    });
  });
});