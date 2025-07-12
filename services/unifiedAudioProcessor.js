import { Transform } from 'stream';
import { EventEmitter } from 'events';

class UnifiedAudioProcessor extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> session data
    this.activeStreams = new Map(); // streamId -> stream data
  }

  // Create a new audio processing session
  createSession(sessionId, config = {}) {
    const session = {
      id: sessionId,
      source: config.source || 'unknown', // 'webrtc' or 'twilio'
      agentId: config.agentId,
      userId: config.userId,
      sampleRate: config.sampleRate || 16000,
      channels: config.channels || 1,
      // Processing pipeline components
      sttService: config.sttService || null,
      aiService: config.aiService || null,
      ttsService: config.ttsService || null,
      // Stream management
      inputStream: null,
      outputStream: null,
      // Metrics
      startTime: Date.now(),
      bytesProcessed: 0,
      latency: {
        stt: 0,
        ai: 0,
        tts: 0,
        total: 0
      }
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  // Process audio from WebRTC (RTP packets)
  processWebRTCAudio(sessionId, rtpStream) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      return;
    }
    
    session.source = 'webrtc';
    session.inputStream = rtpStream;
    
    // Create transform stream to convert RTP to raw PCM
    const rtpToPcm = new Transform({
      transform: (chunk, encoding, callback) => {
        // Extract audio payload from RTP packet
        // RTP header is typically 12 bytes
        const payload = chunk.slice(12);
        callback(null, payload);
      }
    });
    
    // Pipe through the transform
    rtpStream.pipe(rtpToPcm);
    
    // Start processing pipeline
    this.startProcessingPipeline(sessionId, rtpToPcm);
  }

  // Process audio from Twilio Media Streams
  processTwilioAudio(sessionId, twilioStream) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      return;
    }
    
    session.source = 'twilio';
    session.inputStream = twilioStream;
    
    // Create transform stream to convert Twilio's base64 mulaw to PCM
    const mulawToPcm = new Transform({
      transform: (chunk, encoding, callback) => {
        try {
          // Twilio sends base64 encoded mulaw audio
          const audioBuffer = Buffer.from(chunk.toString(), 'base64');
          
          // Convert mulaw to PCM16
          const pcmBuffer = this.mulawToPCM16(audioBuffer);
          callback(null, pcmBuffer);
        } catch (error) {
          console.error('Error converting Twilio audio:', error);
          callback(error);
        }
      }
    });
    
    // Pipe through the transform
    twilioStream.pipe(mulawToPcm);
    
    // Start processing pipeline
    this.startProcessingPipeline(sessionId, mulawToPcm);
  }

  // Main audio processing pipeline
  async startProcessingPipeline(sessionId, audioStream) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Create processing stages
    const stages = {
      // Stage 1: Voice Activity Detection
      vad: this.createVADStream(session),
      
      // Stage 2: Audio chunking for STT
      chunker: this.createChunkerStream(session),
      
      // Stage 3: Speech-to-Text
      stt: await this.createSTTStream(session),
      
      // Stage 4: AI Processing
      ai: await this.createAIStream(session),
      
      // Stage 5: Text-to-Speech
      tts: await this.createTTSStream(session)
    };
    
    // Connect the pipeline
    audioStream
      .pipe(stages.vad)
      .pipe(stages.chunker);
    
    // STT outputs text, not audio
    stages.chunker.on('chunk', async (audioChunk) => {
      if (session.sttService) {
        const startTime = Date.now();
        const text = await session.sttService.transcribe(audioChunk);
        session.latency.stt = Date.now() - startTime;
        
        if (text) {
          this.emit('transcription', { sessionId, text });
          stages.ai.write(text);
        }
      }
    });
    
    // AI outputs text response
    stages.ai.on('response', async (aiResponse) => {
      if (session.ttsService) {
        const startTime = Date.now();
        const audioResponse = await session.ttsService.synthesize(aiResponse);
        session.latency.tts = Date.now() - startTime;
        
        this.emit('audio-response', { sessionId, audio: audioResponse });
        
        // Send back to appropriate output
        this.sendAudioResponse(session, audioResponse);
      }
    });
    
    // Track total latency
    this.startLatencyTracking(session);
  }

  // Create Voice Activity Detection stream
  createVADStream(session) {
    const vadThreshold = -50; // dB
    const vadDebounce = 300; // ms
    let isSpeaking = false;
    let silenceTimer = null;
    
    return new Transform({
      transform: (chunk, encoding, callback) => {
        // Calculate audio level
        const level = this.calculateAudioLevel(chunk);
        
        if (level > vadThreshold) {
          if (!isSpeaking) {
            isSpeaking = true;
            this.emit('speech-start', { sessionId: session.id });
          }
          clearTimeout(silenceTimer);
          callback(null, chunk);
        } else {
          if (isSpeaking && !silenceTimer) {
            silenceTimer = setTimeout(() => {
              isSpeaking = false;
              this.emit('speech-end', { sessionId: session.id });
            }, vadDebounce);
          }
          // Still pass through audio during debounce period
          callback(null, chunk);
        }
      }
    });
  }

  // Create audio chunker for optimal STT processing
  createChunkerStream(session) {
    const chunkSize = session.sampleRate * 0.1; // 100ms chunks
    let buffer = Buffer.alloc(0);
    
    const stream = new Transform({
      transform: (chunk, encoding, callback) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        while (buffer.length >= chunkSize) {
          const audioChunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize);
          stream.emit('chunk', audioChunk);
        }
        
        callback();
      },
      flush: (callback) => {
        if (buffer.length > 0) {
          stream.emit('chunk', buffer);
        }
        callback();
      }
    });
    
    return stream;
  }

  // Placeholder for STT stream
  async createSTTStream(session) {
    // This would connect to Deepgram or other STT service
    return new Transform({
      transform: (chunk, encoding, callback) => {
        // STT processing would happen here
        callback();
      }
    });
  }

  // Placeholder for AI stream
  async createAIStream(session) {
    const stream = new Transform({
      transform: (text, encoding, callback) => {
        // AI processing would happen here
        setTimeout(() => {
          stream.emit('response', `AI response to: ${text}`);
        }, 100);
        callback();
      }
    });
    return stream;
  }

  // Placeholder for TTS stream
  async createTTSStream(session) {
    // This would connect to ElevenLabs or other TTS service
    return new Transform({
      transform: (text, encoding, callback) => {
        // TTS processing would happen here
        callback();
      }
    });
  }

  // Send audio response back to source
  sendAudioResponse(session, audioData) {
    if (session.source === 'webrtc') {
      // Send via WebRTC
      this.emit('webrtc-audio', { sessionId: session.id, audio: audioData });
    } else if (session.source === 'twilio') {
      // Send via Twilio Media Stream
      this.emit('twilio-audio', { sessionId: session.id, audio: audioData });
    }
  }

  // Utility: Convert mulaw to PCM16
  mulawToPCM16(mulawBuffer) {
    const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulaw = mulawBuffer[i];
      const pcm = this.mulawDecode(mulaw);
      pcmBuffer.writeInt16LE(pcm, i * 2);
    }
    
    return pcmBuffer;
  }

  // Mulaw decoding
  mulawDecode(mulaw) {
    const BIAS = 0x84;
    const table = [
      -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
      -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
      -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
      -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
      -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
      -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
      -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
      -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
      -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
      -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
      -876, -844, -812, -780, -748, -716, -684, -652,
      -620, -588, -556, -524, -492, -460, -428, -396,
      -372, -356, -340, -324, -308, -292, -276, -260,
      -244, -228, -212, -196, -180, -164, -148, -132,
      -120, -112, -104, -96, -88, -80, -72, -64,
      -56, -48, -40, -32, -24, -16, -8, -1,
      32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
      23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
      15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
      11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
      7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
      5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
      3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
      2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
      1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
      1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
      876, 844, 812, 780, 748, 716, 684, 652,
      620, 588, 556, 524, 492, 460, 428, 396,
      372, 356, 340, 324, 308, 292, 276, 260,
      244, 228, 212, 196, 180, 164, 148, 132,
      120, 112, 104, 96, 88, 80, 72, 64,
      56, 48, 40, 32, 24, 16, 8, 0
    ];
    
    return table[mulaw & 0xFF];
  }

  // Calculate audio level in dB
  calculateAudioLevel(buffer) {
    let sum = 0;
    const samples = buffer.length / 2; // 16-bit samples
    
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / samples);
    const db = 20 * Math.log10(rms / 32768); // Convert to dB
    
    return db;
  }

  // Track end-to-end latency
  startLatencyTracking(session) {
    const trackingInterval = setInterval(() => {
      if (!this.sessions.has(session.id)) {
        clearInterval(trackingInterval);
        return;
      }
      
      session.latency.total = session.latency.stt + session.latency.ai + session.latency.tts;
      
      this.emit('latency-update', {
        sessionId: session.id,
        latency: session.latency
      });
    }, 1000);
  }

  // Clean up session
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Close streams
    if (session.inputStream) session.inputStream.destroy();
    if (session.outputStream) session.outputStream.destroy();
    
    this.sessions.delete(sessionId);
    this.emit('session-ended', { sessionId });
  }
}

export default UnifiedAudioProcessor;