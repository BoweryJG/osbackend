import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize OpenAI client
const openAiApiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
let openai = null;

if (!openAiApiKey) {
  console.warn('No OpenAI or OpenRouter API key configured. Call transcription will be disabled.');
} else {
  const openAiOptions = { apiKey: openAiApiKey };
  
  // If using OpenRouter for Whisper, set the base URL and required headers
  if (!process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY) {
    openAiOptions.baseURL = 'https://openrouter.ai/api/v1';
    openAiOptions.defaultHeaders = {
      'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
      'X-Title': 'Call Transcription Service'
    };
  }
  
  openai = new OpenAI(openAiOptions);
}

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

class CallTranscriptionService {
  constructor(io) {
    console.log('[CallTranscriptionService] Initializing with Socket.IO instance');
    this.io = io;
    this.activeTranscriptions = new Map(); // Map of callSid to transcription session
    this.twilioStreams = new Map(); // Map of streamSid to WebSocket connection
    
    // Set up the namespace for call transcription
    console.log('[CallTranscriptionService] Creating namespace: /call-transcription-ws');
    this.namespace = this.io.of('/call-transcription-ws');
    console.log('[CallTranscriptionService] Namespace created:', !!this.namespace);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.namespace.on('connection', (socket) => {
      console.log(`Client connected to call transcription: ${socket.id}`);
      
      // Handle client subscribing to a specific call
      socket.on('subscribe:call', async (callSid) => {
        try {
          socket.join(`call:${callSid}`);
          
          // Send current transcription if exists
          const session = this.activeTranscriptions.get(callSid);
          if (session) {
            socket.emit('transcription:current', {
              callSid,
              transcription: session.transcription,
              status: session.status,
              startTime: session.startTime
            });
          }
        } catch (error) {
          console.error('Error subscribing to call:', error);
          socket.emit('error', {
            message: 'Failed to subscribe to call',
            code: 'SUBSCRIBE_ERROR'
          });
        }
      });
      
      socket.on('unsubscribe:call', (callSid) => {
        socket.leave(`call:${callSid}`);
      });
      
      socket.on('disconnect', () => {
        console.log(`Client disconnected from call transcription: ${socket.id}`);
      });
    });
  }

  // Handle Twilio Media Stream WebSocket connection
  async handleTwilioMediaStream(ws, request) {
    let streamSid = null;
    let callSid = null;
    let audioBuffer = Buffer.alloc(0);
    let lastProcessTime = Date.now();
    const PROCESS_INTERVAL = 5000; // Process audio every 5 seconds
    
    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        
        switch (msg.event) {
          case 'connected':
            console.log('Twilio Media Stream connected');
            break;
            
          case 'start':
            streamSid = msg.start.streamSid;
            callSid = msg.start.callSid;
            
            // Store the WebSocket connection
            this.twilioStreams.set(streamSid, ws);
            
            // Initialize transcription session
            this.startTranscriptionSession(callSid, {
              streamSid,
              accountSid: msg.start.accountSid,
              tracks: msg.start.tracks
            });
            
            console.log(`Started media stream for call ${callSid}`);
            break;
            
          case 'media':
            // Accumulate audio data
            if (msg.media.payload) {
              const chunk = Buffer.from(msg.media.payload, 'base64');
              audioBuffer = Buffer.concat([audioBuffer, chunk]);
              
              // Process audio periodically
              const now = Date.now();
              if (now - lastProcessTime >= PROCESS_INTERVAL && audioBuffer.length > 0) {
                await this.processAudioChunk(callSid, audioBuffer);
                audioBuffer = Buffer.alloc(0); // Reset buffer
                lastProcessTime = now;
              }
            }
            break;
            
          case 'stop':
            // Process any remaining audio
            if (audioBuffer.length > 0) {
              await this.processAudioChunk(callSid, audioBuffer);
            }
            
            // Clean up
            this.twilioStreams.delete(streamSid);
            await this.stopTranscriptionSession(callSid);
            
            console.log(`Stopped media stream for call ${callSid}`);
            break;
        }
      } catch (error) {
        console.error('Error handling Twilio media stream:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Twilio Media Stream disconnected');
      if (streamSid) {
        this.twilioStreams.delete(streamSid);
      }
      if (callSid) {
        this.stopTranscriptionSession(callSid);
      }
    });
    
    ws.on('error', (error) => {
      console.error('Twilio Media Stream error:', error);
    });
  }

  async startTranscriptionSession(callSid, metadata) {
    try {
      // Create transcription session
      const session = {
        callSid,
        streamSid: metadata.streamSid,
        transcription: '',
        partialTranscriptions: [],
        status: 'active',
        startTime: new Date(),
        metadata
      };
      
      this.activeTranscriptions.set(callSid, session);
      
      // Create initial database record
      if (supabase) {
        const { data, error } = await supabase
          .from('call_transcriptions')
          .insert([{
            call_sid: callSid,
            status: 'active',
            transcription: '',
            metadata,
            started_at: new Date()
          }])
          .select();
        
        if (error) {
          console.error('Error creating transcription record:', error);
        } else if (data && data[0]) {
          session.dbId = data[0].id;
        }
      }
      
      // Notify connected clients
      this.namespace.to(`call:${callSid}`).emit('transcription:started', {
        callSid,
        startTime: session.startTime,
        status: 'active'
      });
      
    } catch (error) {
      console.error('Error starting transcription session:', error);
      throw error;
    }
  }

  async processAudioChunk(callSid, audioBuffer) {
    try {
      const session = this.activeTranscriptions.get(callSid);
      if (!session || !openai) return;
      
      // Convert audio buffer to format suitable for Whisper
      // Note: Twilio streams audio as mulaw 8000Hz, we need to convert it
      const audioData = this.convertMulawToPCM(audioBuffer);
      
      // Create a temporary file or use streaming API
      // For now, we'll use a simplified approach
      const transcriptionResult = await this.transcribeAudioBuffer(audioData);
      
      if (transcriptionResult && transcriptionResult.text) {
        // Add to partial transcriptions
        session.partialTranscriptions.push({
          text: transcriptionResult.text,
          timestamp: new Date(),
          duration: transcriptionResult.duration
        });
        
        // Update full transcription
        session.transcription = session.partialTranscriptions
          .map(p => p.text)
          .join(' ');
        
        // Update database
        if (supabase && session.dbId) {
          await supabase
            .from('call_transcriptions')
            .update({
              transcription: session.transcription,
              partial_transcriptions: session.partialTranscriptions,
              updated_at: new Date()
            })
            .eq('id', session.dbId);
        }
        
        // Broadcast update to connected clients
        this.namespace.to(`call:${callSid}`).emit('transcription:update', {
          callSid,
          transcription: session.transcription,
          latest: transcriptionResult.text,
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      
      // Notify clients of error
      this.namespace.to(`call:${callSid}`).emit('transcription:error', {
        callSid,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  async transcribeAudioBuffer(audioBuffer) {
    try {
      // Convert buffer to a format OpenAI can process
      // This is a simplified version - in production, you'd need proper audio processing
      
      // For now, return a mock result if OpenAI is not configured
      if (!openai) {
        return {
          text: '[Transcription unavailable - OpenAI not configured]',
          duration: 5
        };
      }
      
      // In a real implementation, you would:
      // 1. Convert the audio buffer to a file format Whisper accepts (mp3, wav, etc.)
      // 2. Send it to the Whisper API
      // 3. Return the transcription
      
      // Mock implementation for now
      return {
        text: `[Audio chunk transcribed at ${new Date().toISOString()}]`,
        duration: 5
      };
      
    } catch (error) {
      console.error('Error transcribing audio buffer:', error);
      throw error;
    }
  }

  convertMulawToPCM(mulawBuffer) {
    // Convert μ-law to PCM
    // This is a simplified implementation
    const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulaw = mulawBuffer[i];
      // μ-law to PCM conversion algorithm
      let sign = (mulaw & 0x80) >> 7;
      let exponent = (mulaw & 0x70) >> 4;
      let mantissa = mulaw & 0x0F;
      let sample = (mantissa << (exponent + 3)) + (1 << (exponent + 2));
      
      if (sign === 0) {
        sample = -sample;
      }
      
      // Write 16-bit PCM sample
      pcmBuffer.writeInt16LE(sample, i * 2);
    }
    
    return pcmBuffer;
  }

  async stopTranscriptionSession(callSid) {
    try {
      const session = this.activeTranscriptions.get(callSid);
      if (!session) return;
      
      session.status = 'completed';
      session.endTime = new Date();
      
      // Final database update
      if (supabase && session.dbId) {
        await supabase
          .from('call_transcriptions')
          .update({
            status: 'completed',
            ended_at: session.endTime,
            duration_seconds: Math.floor((session.endTime - session.startTime) / 1000)
          })
          .eq('id', session.dbId);
      }
      
      // Notify clients
      this.namespace.to(`call:${callSid}`).emit('transcription:completed', {
        callSid,
        transcription: session.transcription,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: Math.floor((session.endTime - session.startTime) / 1000)
      });
      
      // Clean up
      this.activeTranscriptions.delete(callSid);
      
    } catch (error) {
      console.error('Error stopping transcription session:', error);
    }
  }

  // Get active transcription for a call
  getActiveTranscription(callSid) {
    return this.activeTranscriptions.get(callSid);
  }

  // Get all active transcriptions
  getAllActiveTranscriptions() {
    return Array.from(this.activeTranscriptions.entries()).map(([callSid, session]) => ({
      callSid,
      status: session.status,
      startTime: session.startTime,
      transcriptionLength: session.transcription.length
    }));
  }
}

export default CallTranscriptionService;