import { Transform, pipeline } from 'stream';
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
    
    console.log(`Creating voice session: ${sessionId}`);
    
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
        console.log(`User said: "${transcript}"`);
        
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
    
    console.log(`Audio streams connected for session ${sessionId}`);
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
    
    console.log(`Ending voice session: ${sessionId}`);
    
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
export default voiceConversationPipeline;