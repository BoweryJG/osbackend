import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import WebSocket from 'ws';


import logger from '../utils/logger.js';

import { audioProcessor } from './audioProcessor.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize OpenAI client for Whisper (OpenRouter doesn't support Whisper)
const openAiApiKey = process.env.OPENAI_API_KEY;
let openai = null;

if (!openAiApiKey) {
  logger.warn('No OpenAI API key configured. Call transcription will be disabled.');
  logger.warn('Note: OpenRouter does not support Whisper API. You need a direct OpenAI API key.');
} else {
  logger.info('[CallTranscriptionService] Initializing OpenAI client for Whisper...');
  openai = new OpenAI({ 
    apiKey: openAiApiKey,
    // Ensure we're using OpenAI directly, not OpenRouter
    baseURL: 'https://api.openai.com/v1'
  });
  logger.info('[CallTranscriptionService] OpenAI client initialized successfully');
}

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

class CallTranscriptionService {
  constructor(io) {
    logger.info('[CallTranscriptionService] Initializing with Socket.IO instance');
    this.io = io;
    this.activeTranscriptions = new Map(); // Map of callSid to transcription session
    this.twilioStreams = new Map(); // Map of streamSid to WebSocket connection
    
    // Set up the namespace for call transcription
    logger.info('[CallTranscriptionService] Creating namespace: /call-transcription-ws');
    this.namespace = this.io.of('/call-transcription-ws');
    logger.info('[CallTranscriptionService] Namespace created:', !!this.namespace);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.namespace.on('connection', (socket) => {
      logger.info(`Client connected to call transcription: ${socket.id}`);
      
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
          logger.error('Error subscribing to call:', error);
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
        logger.info(`Client disconnected from call transcription: ${socket.id}`);
      });
    });
  }

  // Handle Twilio Media Stream WebSocket connection
  async handleTwilioMediaStream(ws, request) {
    let streamSid = null;
    let callSid = null;
    let audioBuffer = Buffer.alloc(0);
    let lastProcessTime = Date.now();
    const PROCESS_INTERVAL = 3000; // Process audio every 3 seconds for better real-time feel
    const MIN_BUFFER_SIZE = 8000 * 2; // At least 2 seconds of audio at 8kHz
    
    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        
        switch (msg.event) {
          case 'connected':
            logger.info('Twilio Media Stream connected');
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
            
            logger.info(`Started media stream for call ${callSid}`);
            break;
            
          case 'media':
            // Accumulate audio data
            if (msg.media.payload) {
              const chunk = Buffer.from(msg.media.payload, 'base64');
              audioBuffer = Buffer.concat([audioBuffer, chunk]);
              
              // Process audio periodically with minimum buffer size
              const now = Date.now();
              if (now - lastProcessTime >= PROCESS_INTERVAL && audioBuffer.length >= MIN_BUFFER_SIZE) {
                // Process the audio chunk asynchronously
                const bufferToProcess = audioBuffer;
                audioBuffer = Buffer.alloc(0); // Reset buffer immediately
                lastProcessTime = now;
                
                // Process in background to not block incoming audio
                this.processAudioChunk(callSid, bufferToProcess).catch(error => {
                  logger.error('Error processing audio chunk:', error);
                });
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
            
            logger.info(`Stopped media stream for call ${callSid}`);
            break;
        }
      } catch (error) {
        logger.error('Error handling Twilio media stream:', error);
      }
    });
    
    ws.on('close', () => {
      logger.info('Twilio Media Stream disconnected');
      if (streamSid) {
        this.twilioStreams.delete(streamSid);
      }
      if (callSid) {
        this.stopTranscriptionSession(callSid);
      }
    });
    
    ws.on('error', (error) => {
      logger.error('Twilio Media Stream error:', error);
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
          logger.error('Error creating transcription record:', error);
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
      logger.error('Error starting transcription session:', error);
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
        
        // Analyze sentiment
        const sentiment = await this.analyzeSentiment(transcriptionResult.text);
        
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
          isFinal: true,
          sentiment: sentiment,
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      logger.error('Error processing audio chunk:', error);
      
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
      // Check if OpenAI is configured
      if (!openai) {
        return {
          text: '[Transcription unavailable - OpenAI not configured]',
          duration: 5
        };
      }
      
      // Generate a unique session ID for this audio chunk
      const sessionId = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Convert μ-law to WAV format
      logger.info('[Transcription] Converting audio buffer to WAV...');
      const wavPath = await audioProcessor.convertMulawToWav(audioBuffer, sessionId);
      
      try {
        // Read the WAV file
        const audioFile = fs.createReadStream(wavPath);
        
        // Send to OpenAI Whisper
        logger.info('[Transcription] Sending to OpenAI Whisper...');
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          language: 'en', // You can make this configurable
          response_format: 'json'
        });
        
        logger.info('[Transcription] Received transcription:', transcription.text);
        
        // Clean up the temporary file
        await audioProcessor.cleanup(wavPath);
        
        return {
          text: transcription.text,
          duration: audioBuffer.length / 8000 // Approximate duration based on 8kHz sample rate
        };
        
      } catch (error) {
        // Clean up on error
        await audioProcessor.cleanup(wavPath);
        throw error;
      }
      
    } catch (error) {
      logger.error('Error transcribing audio buffer:', error);
      
      // Return a fallback message
      return {
        text: `[Transcription error: ${error.message}]`,
        duration: 5
      };
    }
  }

  convertMulawToPCM(mulawBuffer) {
    // Convert μ-law to PCM
    // This is a simplified implementation
    const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulaw = mulawBuffer[i];
      // μ-law to PCM conversion algorithm
      const sign = (mulaw & 0x80) >> 7;
      const exponent = (mulaw & 0x70) >> 4;
      const mantissa = mulaw & 0x0F;
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
      logger.error('Error stopping transcription session:', error);
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

  // Analyze sentiment of transcribed text
  async analyzeSentiment(text) {
    try {
      if (!text || text.trim().length === 0) {
        return 'neutral';
      }

      // Simple keyword-based sentiment analysis
      const positiveWords = [
        'great', 'excellent', 'good', 'happy', 'pleased', 'satisfied',
        'thank', 'appreciate', 'wonderful', 'perfect', 'love', 'awesome',
        'fantastic', 'amazing', 'best', 'helpful', 'excited'
      ];
      
      const negativeWords = [
        'bad', 'poor', 'unhappy', 'disappointed', 'frustrated', 'angry',
        'problem', 'issue', 'terrible', 'awful', 'worst', 'hate', 'annoyed',
        'unacceptable', 'difficult', 'confused', 'upset'
      ];
      
      const lowerText = text.toLowerCase();
      const words = lowerText.split(/\s+/);
      
      let positiveScore = 0;
      let negativeScore = 0;
      
      words.forEach(word => {
        if (positiveWords.some(pw => word.includes(pw))) {
          positiveScore++;
        }
        if (negativeWords.some(nw => word.includes(nw))) {
          negativeScore++;
        }
      });
      
      // You could also use OpenAI for more sophisticated sentiment analysis
      if (openai && process.env.USE_AI_SENTIMENT === 'true') {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a sentiment analyzer. Respond with only one word: positive, negative, or neutral.'
              },
              {
                role: 'user',
                content: `Analyze the sentiment of this text: "${text}"`
              }
            ],
            max_tokens: 10,
            temperature: 0
          });
          
          const aiSentiment = completion.choices[0].message.content.toLowerCase().trim();
          if (['positive', 'negative', 'neutral'].includes(aiSentiment)) {
            return aiSentiment;
          }
        } catch (error) {
          logger.error('AI sentiment analysis failed:', error);
        }
      }
      
      // Determine sentiment based on scores
      if (positiveScore > negativeScore * 1.5) {
        return 'positive';
      } else if (negativeScore > positiveScore * 1.5) {
        return 'negative';
      } else {
        return 'neutral';
      }
      
    } catch (error) {
      logger.error('Error analyzing sentiment:', error);
      return 'neutral';
    }
  }
}

export default CallTranscriptionService;