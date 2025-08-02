#!/usr/bin/env node

import io from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebRTCPipelineAgent {
  constructor() {
    this.agentId = 'webrtc-pipeline';
    this.socket = null;
    this.progress = 0;
  }
  
  async connect() {
    this.socket = io(`http://localhost:${process.env.ORCHESTRATOR_PORT || 9090}`);
    
    this.socket.on('connect', () => {
      console.log('Connected to orchestrator');
      this.socket.emit('agent:register', {
        agentId: this.agentId,
        type: 'webrtc-pipeline',
        capabilities: ['audio-pipeline', 'webrtc-integration', 'streaming']
      });
    });
    
    this.socket.on('shutdown', () => {
      console.log('Shutdown signal received');
      process.exit(0);
    });
  }
  
  reportProgress(task, progress, eta) {
    this.progress = progress;
    this.socket.emit('progress', {
      agentId: this.agentId,
      task,
      progress,
      eta
    });
  }
  
  async createVoiceConversationPipeline() {
    console.log('🔧 Creating voice conversation pipeline...');
    this.reportProgress('voice-pipeline', 10, '45 minutes');
    
    const pipelineContent = `import { Transform, pipeline } from 'stream';
import { getMediasoupService } from './mediasoupService.js';
import DeepgramSTT from './deepgramSTT.js';
import { ElevenLabsTTS } from './elevenLabsTTS.js';
import agentCore from '../agents/core/agentCore.js';
import { createClient } from '@supabase/supabase-js';
import EventEmitter from 'events';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Voice Conversation Pipeline
 * Handles the complete audio flow: WebRTC -> Deepgram -> AI -> ElevenLabs -> WebRTC
 */
class VoiceConversationPipeline extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.mediasoup = getMediasoupService();
    this.deepgram = new DeepgramSTT();
    this.elevenLabs = new ElevenLabsTTS();
    this.agentCore = new agentCore('repconnect'); // Voice agents from RepConnect
  }
  
  async createSession(config) {
    const {
      sessionId,
      userId,
      agentId,
      voiceSettings,
      deepgramConfig,
      elevenLabsVoiceId
    } = config;
    
    console.log(\`Creating voice session: \${sessionId}\`);
    
    // Initialize session
    const session = {
      id: sessionId,
      userId,
      agentId,
      agent: await this.agentCore.getAgentById(agentId),
      voiceSettings,
      deepgramConfig,
      elevenLabsVoiceId,
      
      // Streams
      audioInputStream: null,
      audioOutputStream: null,
      transcriptionStream: null,
      ttsStream: null,
      
      // State
      isActive: true,
      conversationHistory: [],
      currentTranscript: '',
      isAgentSpeaking: false,
      
      // Metrics
      startTime: Date.now(),
      totalTurns: 0,
      avgResponseTime: 0,
      transcriptionConfidence: 0
    };
    
    // Set up the pipeline
    await this.setupPipeline(session);
    
    this.sessions.set(sessionId, session);
    return session;
  }
  
  async setupPipeline(session) {
    // 1. Create Deepgram transcription stream
    session.transcriptionStream = await this.deepgram.createLiveTranscriptionStream({
      ...session.deepgramConfig,
      interim_results: true,
      endpointing: 300, // 300ms silence detection
      vad_events: true
    });
    
    // 2. Create agent processing stream
    const agentStream = this.createAgentProcessingStream(session);
    
    // 3. Create TTS stream
    session.ttsStream = this.elevenLabs.createTransformStream();
    
    // 4. Handle transcription events
    session.transcriptionStream.on('transcription', async (data) => {
      if (!session.isActive) return;
      
      const { transcript, is_final, confidence } = data.channel.alternatives[0];
      
      // Update confidence metric
      session.transcriptionConfidence = 
        (session.transcriptionConfidence + confidence) / 2;
      
      if (is_final && transcript.trim()) {
        console.log(\`User said: "\${transcript}"\`);
        
        // Add to conversation history
        session.conversationHistory.push({
          role: 'user',
          content: transcript,
          timestamp: Date.now()
        });
        
        // Save to database
        await this.saveTranscript(session.id, 'user', transcript);
        
        // Process through agent
        agentStream.write({ 
          type: 'user_speech',
          text: transcript,
          confidence 
        });
      }
    });
    
    // 5. Handle VAD (Voice Activity Detection)
    session.transcriptionStream.on('vad_event', (event) => {
      if (event.type === 'speech_started') {
        // User started speaking - pause agent if speaking
        if (session.isAgentSpeaking) {
          this.pauseAgentSpeech(session);
        }
      }
    });
    
    // 6. Handle TTS audio output
    session.ttsStream.on('data', (chunk) => {
      if (chunk.type === 'audio' && session.audioOutputStream) {
        // Send audio back through WebRTC
        session.audioOutputStream.write(chunk.data);
        
        // Track that agent is speaking
        session.isAgentSpeaking = true;
      }
    });
    
    // 7. Error handling
    session.transcriptionStream.on('error', (error) => {
      console.error('Transcription error:', error);
      this.emit('error', { sessionId: session.id, error, service: 'deepgram' });
    });
    
    session.ttsStream.on('error', (error) => {
      console.error('TTS error:', error);
      this.emit('error', { sessionId: session.id, error, service: 'elevenlabs' });
    });
  }
  
  createAgentProcessingStream(session) {
    return new Transform({
      objectMode: true,
      async transform(chunk, encoding, callback) {
        if (chunk.type === 'user_speech') {
          const startTime = Date.now();
          
          try {
            // Get agent response
            const response = await session.agent.processMessage(chunk.text, {
              conversationHistory: session.conversationHistory,
              voiceMode: true
            });
            
            // Track response time
            const responseTime = Date.now() - startTime;
            session.avgResponseTime = session.avgResponseTime
              ? (session.avgResponseTime + responseTime) / 2
              : responseTime;
            
            // Add to conversation history
            session.conversationHistory.push({
              role: 'assistant',
              content: response.text,
              timestamp: Date.now()
            });
            
            // Save agent response
            await this.saveTranscript(session.id, 'agent', response.text);
            
            // Send to TTS
            this.push({
              type: 'llm_response',
              text: response.text,
              agentId: session.agentId
            });
            
            session.totalTurns++;
            
          } catch (error) {
            console.error('Agent processing error:', error);
            callback(error);
            return;
          }
        }
        
        callback();
      }
    }).pipe(session.ttsStream);
  }
  
  // Connect WebRTC audio streams
  async connectAudioStreams(sessionId, inputStream, outputStream) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.audioInputStream = inputStream;
    session.audioOutputStream = outputStream;
    
    // Pipe input audio to Deepgram
    inputStream.pipe(session.transcriptionStream);
    
    console.log(\`Audio streams connected for session \${sessionId}\`);
  }
  
  // Pause agent speech when user interrupts
  pauseAgentSpeech(session) {
    if (session.isAgentSpeaking) {
      // Send pause signal to TTS
      session.ttsStream.write({ type: 'pause' });
      session.isAgentSpeaking = false;
      
      console.log('Agent speech paused due to user interruption');
    }
  }
  
  // Save transcript to database
  async saveTranscript(sessionId, speaker, text) {
    try {
      await supabase.from('voice_transcripts').insert({
        session_id: sessionId,
        speaker,
        text,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  }
  
  // Get session status
  async getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    
    return {
      isActive: session.isActive,
      duration: Math.floor((Date.now() - session.startTime) / 1000),
      totalTurns: session.totalTurns,
      avgResponseTime: Math.round(session.avgResponseTime),
      transcriptionConfidence: session.transcriptionConfidence,
      isAgentSpeaking: session.isAgentSpeaking,
      conversationLength: session.conversationHistory.length
    };
  }
  
  // End session
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    
    console.log(\`Ending voice session: \${sessionId}\`);
    
    session.isActive = false;
    
    // Close all streams
    if (session.transcriptionStream) {
      session.transcriptionStream.finish();
    }
    if (session.ttsStream) {
      session.ttsStream.end();
    }
    if (session.audioInputStream) {
      session.audioInputStream.unpipe();
    }
    
    // Calculate final metrics
    const finalMetrics = {
      duration_seconds: Math.floor((Date.now() - session.startTime) / 1000),
      total_turns: session.totalTurns,
      avg_response_time_ms: Math.round(session.avgResponseTime),
      transcription_accuracy: session.transcriptionConfidence
    };
    
    // Update database
    await supabase
      .from('agent_voice_sessions')
      .update(finalMetrics)
      .eq('id', sessionId);
    
    this.sessions.delete(sessionId);
    
    this.emit('session-ended', { sessionId, metrics: finalMetrics });
  }
  
  // Test Deepgram connection
  async testDeepgramConnection(audioData) {
    try {
      const result = await this.deepgram.transcribeAudio(audioData);
      return {
        connected: true,
        transcript: result.transcript,
        confidence: result.confidence
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  // Test ElevenLabs
  async testElevenLabs(text) {
    try {
      const audioData = await this.elevenLabs.textToSpeech(text);
      return {
        connected: true,
        audioLength: audioData.length
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

// Export singleton
const voiceConversationPipeline = new VoiceConversationPipeline();
export default voiceConversationPipeline;`;
    
    await fs.writeFile(
      path.join(__dirname, '../services/voiceConversationPipeline.js'),
      pipelineContent
    );
    
    this.reportProgress('voice-pipeline', 60, '20 minutes');
    
    // Now enhance the WebRTC service
    await this.enhanceWebRTCService();
    
    this.reportProgress('voice-pipeline', 100, '0 minutes');
    this.socket.emit('task:complete', {
      agentId: this.agentId,
      taskId: 'voice-pipeline'
    });
  }
  
  async enhanceWebRTCService() {
    console.log('🔧 Enhancing WebRTC service...');
    this.reportProgress('enhance-webrtc', 10, '30 minutes');
    
    const webrtcPath = path.join(__dirname, '../services/voiceAgentWebRTCService.js');
    const content = await fs.readFile(webrtcPath, 'utf8');
    
    // Add audio pipeline integration after setupAudioProcessing method
    const enhancement = `
  // Enhanced audio processing with pipeline integration
  async setupAudioProcessingWithPipeline(session, producerId) {
    try {
      const voiceConversationPipeline = (await import('./voiceConversationPipeline.js')).default;
      
      // Create plain transport for extracting audio
      const plainTransport = await this.mediasoup.createPlainTransport(session.roomId);
      
      // Create consumer for the audio producer
      const router = this.mediasoup.routers.get(session.roomId);
      const consumer = await plainTransport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false
      });
      
      // Create RTP to stream converter
      const rtpToStream = new RTPToStreamConverter({
        rtpPort: plainTransport.tuple.localPort,
        rtcpPort: plainTransport.rtcpPort,
        payloadType: 111, // Opus
        sampleRate: 48000,
        channels: 2
      });
      
      // Create stream to RTP converter for output
      const streamToRTP = new StreamToRTPConverter({
        payloadType: 111,
        sampleRate: 48000,
        channels: 2
      });
      
      // Connect to voice pipeline
      await voiceConversationPipeline.connectAudioStreams(
        session.id,
        rtpToStream.getOutputStream(), // Input from user
        streamToRTP.getInputStream()   // Output to user
      );
      
      // Setup return path producer
      const returnTransport = await this.mediasoup.createWebRtcTransport(
        session.roomId,
        session.peerId,
        'send'
      );
      
      const returnProducer = await returnTransport.produce({
        kind: 'audio',
        rtpParameters: {
          codecs: [{
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
            parameters: {
              'sprop-stereo': 1
            }
          }],
          encodings: [{ ssrc: Math.floor(Math.random() * 1000000) }]
        }
      });
      
      // Store enhanced session data
      session.audioProcessor = {
        plainTransport,
        consumer,
        rtpToStream,
        streamToRTP,
        returnTransport,
        returnProducer,
        rtpPort: plainTransport.tuple.localPort,
        rtcpPort: plainTransport.rtcpPort
      };
      
      session.transcriptionActive = true;
      
      // Notify frontend about return audio producer
      const socket = this.namespace.sockets.get(session.socketId);
      if (socket) {
        socket.emit('agent-audio-producer', {
          producerId: returnProducer.id,
          transportId: returnTransport.id
        });
      }
      
      console.log(\`Enhanced audio processing setup for session \${session.id}\`);
    } catch (error) {
      console.error('Error setting up enhanced audio processing:', error);
      throw error;
    }
  }`;
    
    // Insert the enhancement
    const updatedContent = content.replace(
      '  async setupAudioProcessing(session, producerId) {',
      enhancement + '\n\n  async setupAudioProcessing(session, producerId) {'
    );
    
    await fs.writeFile(webrtcPath, updatedContent);
    
    // Create RTP converter utilities
    await this.createRTPConverters();
    
    this.reportProgress('enhance-webrtc', 100, '0 minutes');
  }
  
  async createRTPConverters() {
    console.log('🔧 Creating RTP converter utilities...');
    
    const rtpConverterContent = `import { Transform } from 'stream';
import dgram from 'dgram';

/**
 * Converts RTP packets to audio stream
 */
export class RTPToStreamConverter extends Transform {
  constructor(options) {
    super();
    this.rtpPort = options.rtpPort;
    this.rtcpPort = options.rtcpPort;
    this.payloadType = options.payloadType;
    this.sampleRate = options.sampleRate;
    this.channels = options.channels;
    
    this.socket = dgram.createSocket('udp4');
    this.setupSocket();
    
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  
  setupSocket() {
    this.socket.on('message', (msg) => {
      // Parse RTP header
      const version = (msg[0] >> 6) & 0x03;
      const padding = (msg[0] >> 5) & 0x01;
      const extension = (msg[0] >> 4) & 0x01;
      const cc = msg[0] & 0x0F;
      const marker = (msg[1] >> 7) & 0x01;
      const pt = msg[1] & 0x7F;
      const seq = msg.readUInt16BE(2);
      const timestamp = msg.readUInt32BE(4);
      const ssrc = msg.readUInt32BE(8);
      
      // Skip to payload
      let offset = 12 + (cc * 4);
      if (extension) {
        const extLength = msg.readUInt16BE(offset + 2) * 4;
        offset += 4 + extLength;
      }
      
      // Extract audio payload
      const payload = msg.slice(offset);
      
      // Emit as stream
      this.push(payload);
    });
    
    this.socket.bind(this.rtpPort);
  }
  
  getOutputStream() {
    return this;
  }
}

/**
 * Converts audio stream to RTP packets
 */
export class StreamToRTPConverter extends Transform {
  constructor(options) {
    super();
    this.payloadType = options.payloadType;
    this.sampleRate = options.sampleRate;
    this.channels = options.channels;
    
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
    
    this.targetSocket = null;
    this.targetPort = null;
    this.targetAddress = null;
  }
  
  setTarget(address, port) {
    this.targetAddress = address;
    this.targetPort = port;
    this.targetSocket = dgram.createSocket('udp4');
  }
  
  _transform(chunk, encoding, callback) {
    // Create RTP packet
    const header = Buffer.allocUnsafe(12);
    
    // V=2, P=0, X=0, CC=0, M=0, PT=payloadType
    header[0] = 0x80;
    header[1] = this.payloadType;
    
    // Sequence number
    header.writeUInt16BE(this.sequenceNumber++, 2);
    
    // Timestamp
    header.writeUInt32BE(this.timestamp, 4);
    this.timestamp += chunk.length / (this.channels * 2); // 16-bit samples
    
    // SSRC
    header.writeUInt32BE(this.ssrc, 8);
    
    // Combine header and payload
    const packet = Buffer.concat([header, chunk]);
    
    // Send if we have a target
    if (this.targetSocket && this.targetAddress && this.targetPort) {
      this.targetSocket.send(packet, this.targetPort, this.targetAddress);
    }
    
    callback();
  }
  
  getInputStream() {
    return this;
  }
}`;
    
    await fs.writeFile(
      path.join(__dirname, '../services/rtpConverters.js'),
      rtpConverterContent
    );
  }
  
  async execute() {
    await this.connect();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create voice conversation pipeline
    await this.createVoiceConversationPipeline();
    
    console.log('✅ WebRTC Pipeline Agent: All tasks completed');
  }
}

// Run the agent
const agent = new WebRTCPipelineAgent();
agent.execute().catch(console.error);