import WebSocket from 'ws';
import axios from 'axios';
import FormData from 'form-data';
import { Buffer } from 'buffer';
import { ElevenLabsTTS } from './elevenLabsTTS.js';
import OpenAI from 'openai';

// Audio conversion utilities
const mulawToLinear16 = (mulaw) => {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;
  const pcm16 = new Int16Array(mulaw.length);
  
  for (let i = 0; i < mulaw.length; i++) {
    let byte = ~mulaw[i];
    let sign = byte & 0x80;
    let exponent = (byte & 0x70) >> 4;
    let mantissa = byte & 0x0F;
    let sample = mantissa << (exponent + 3);
    sample += MULAW_BIAS << (exponent + 2);
    if (sign === 0) sample = -sample;
    pcm16[i] = sample;
  }
  
  return pcm16;
};

const linear16ToMulaw = (pcm16) => {
  const MULAW_BIAS = 0x84;
  const MULAW_MAX = 32635;
  const mulaw = new Uint8Array(pcm16.length);
  
  for (let i = 0; i < pcm16.length; i++) {
    let sample = pcm16[i];
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample += MULAW_BIAS;
    let exponent = Math.floor(Math.log2(sample) - 7);
    let mantissa = (sample >> (exponent + 3)) & 0x0F;
    let byte = sign | (exponent << 4) | mantissa;
    mulaw[i] = ~byte;
  }
  
  return mulaw;
};

// Voice Activity Detection
class VAD {
  constructor(threshold = 0.01, silenceDuration = 1000) {
    this.threshold = threshold;
    this.silenceDuration = silenceDuration;
    this.lastSpeechTime = Date.now();
    this.isSpeaking = false;
  }

  detect(audioBuffer) {
    const rms = Math.sqrt(audioBuffer.reduce((sum, val) => sum + val * val, 0) / audioBuffer.length) / 32768;
    const now = Date.now();
    
    if (rms > this.threshold) {
      this.lastSpeechTime = now;
      this.isSpeaking = true;
      return { isSpeaking: true, endOfSpeech: false };
    }
    
    const silenceTime = now - this.lastSpeechTime;
    if (this.isSpeaking && silenceTime > this.silenceDuration) {
      this.isSpeaking = false;
      return { isSpeaking: false, endOfSpeech: true };
    }
    
    return { isSpeaking: false, endOfSpeech: false };
  }
}

// Conversation State Manager
class ConversationManager {
  constructor() {
    this.state = {
      context: [],
      patientInfo: {},
      appointmentDetails: null,
      stage: 'greeting' // greeting, info_gathering, appointment_booking, closing
    };
  }

  addMessage(role, content) {
    this.state.context.push({ role, content });
    // Keep last 10 messages for context
    if (this.state.context.length > 10) {
      this.state.context = this.state.context.slice(-10);
    }
  }

  updatePatientInfo(info) {
    this.state.patientInfo = { ...this.state.patientInfo, ...info };
  }

  getSystemPrompt() {
    const basePrompt = `You are Julie, Dr. Pedro's warm and professional dental office AI assistant handling phone calls. 
You speak naturally and conversationally, as if you're a real person on the phone.
Keep responses concise and natural for phone conversation.

Current conversation stage: ${this.state.stage}

Patient information collected so far:
${JSON.stringify(this.state.patientInfo, null, 2)}

Your capabilities:
- Answer questions about dental services and pricing
- Book new appointments or reschedule existing ones
- Collect patient information (name, phone, insurance, concern)
- Provide emergency guidance
- Connect patients with live team members when they request it

Important: If a patient asks to speak with a human, doctor, or live person, say:
"I'd be happy to connect you with our team right away. Dr. Pedro or one of our specialists will call you back within 5 minutes. What's the best number to reach you?"

Always:
- Be warm, empathetic, and professional
- Keep responses brief and conversational (2-3 sentences max)
- Ask one question at a time
- Confirm important details
- Use natural speech patterns and fillers like "um" or "let me check" occasionally
- If emergency, immediately ask if they need to go to ER

For appointment booking:
- Collect: name, phone number, preferred date/time, dental concern
- Offer available slots like: "I have openings tomorrow at 10 AM or 2 PM, or Thursday at 3 PM"
- Once you have all details, say: "Perfect! Let me confirm: [appointment details]. Shall I book this for you?"
- After patient confirms, say: "Wonderful! I've booked your appointment. You'll receive a text confirmation shortly."
- Mark appointmentDetails.confirmed = true when patient confirms`;

    return basePrompt;
  }

  determineStage(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('emergency') || lowerTranscript.includes('pain') || lowerTranscript.includes('bleeding')) {
      this.state.stage = 'emergency';
    } else if (lowerTranscript.includes('appointment') || lowerTranscript.includes('book') || lowerTranscript.includes('schedule')) {
      this.state.stage = 'appointment_booking';
    } else if (this.state.context.length > 8) {
      this.state.stage = 'closing';
    }
  }
  
  extractAppointmentInfo(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    const info = {};
    
    // Extract name
    const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      info.name = nameMatch[1];
    }
    
    // Extract phone
    const phoneMatch = transcript.match(/\b(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
    if (phoneMatch) {
      info.phone = phoneMatch[0].replace(/[^\d]/g, '');
    }
    
    // Extract time preferences
    const timeMatch = lowerTranscript.match(/\b(\d{1,2})(?:\s*(?:am|pm))|morning|afternoon|evening/);
    if (timeMatch) {
      info.timePreference = timeMatch[0];
    }
    
    // Extract date preferences
    const dateMatch = lowerTranscript.match(/tomorrow|today|monday|tuesday|wednesday|thursday|friday|next week/);
    if (dateMatch) {
      info.datePreference = dateMatch[0];
    }
    
    // Extract dental concern
    const concernMatch = lowerTranscript.match(/(?:for|about|regarding|have|need)\s+(?:a\s+)?([\w\s]+?)(?:\.|,|$)/);
    if (concernMatch) {
      info.concern = concernMatch[1].trim();
    }
    
    return info;
  }
  
  updateAppointmentDetails(info) {
    if (!this.state.appointmentDetails) {
      this.state.appointmentDetails = {
        patientName: null,
        phoneNumber: null,
        date: null,
        time: null,
        concern: null,
        confirmed: false
      };
    }
    
    if (info.name) this.state.appointmentDetails.patientName = info.name;
    if (info.phone) this.state.appointmentDetails.phoneNumber = info.phone;
    if (info.timePreference) this.state.appointmentDetails.time = info.timePreference;
    if (info.datePreference) this.state.appointmentDetails.date = info.datePreference;
    if (info.concern) this.state.appointmentDetails.concern = info.concern;
  }
}

// Voice Service Handler
class VoiceService {
  constructor() {
    this.connections = new Map();
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.ttsService = null;
    
    // Initialize OpenAI client
    this.openai = this.openaiKey ? new OpenAI({ apiKey: this.openaiKey }) : null;
    
    // Initialize ElevenLabs TTS
    try {
      this.ttsService = new ElevenLabsTTS({
        voiceId: 'nicole', // Friendly female voice
        modelId: 'eleven_turbo_v2', // Low-latency model
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        outputFormat: 'pcm_16000'
      });
      console.log('ElevenLabs TTS initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ElevenLabs TTS:', error);
      console.warn('Falling back to Coqui TTS');
    }
    
    if (!this.openaiKey) {
      console.warn('Voice service: Missing OpenAI API key. Please set OPENAI_API_KEY environment variable.');
    }
  }

  // Speech to Text using OpenAI Whisper
  async speechToText(audioBuffer) {
    try {
      if (!this.openai) {
        throw new Error('OpenAI API key not configured');
      }

      // Convert audio buffer to WAV format
      const wavBuffer = this.createWavBuffer(audioBuffer, 16000, 1, 16);
      
      // Create a temporary file stream for OpenAI API
      const fs = await import('fs');
      const path = await import('path');
      const tempFilePath = path.join('/tmp', `audio_${Date.now()}.wav`);
      fs.writeFileSync(tempFilePath, wavBuffer);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1'
      });

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      return transcription.text || '';
    } catch (error) {
      console.error('STT Error:', error);
      return '';
    }
  }

  // Generate LLM response using OpenAI
  async generateResponse(conversationManager, transcript) {
    try {
      if (!this.openai) {
        throw new Error('OpenAI API key not configured');
      }
      
      conversationManager.addMessage('user', transcript);
      conversationManager.determineStage(transcript);

      const messages = [
        { role: 'system', content: conversationManager.getSystemPrompt() },
        ...conversationManager.state.context
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 150, // Keep responses short for phone
        stream: false
      });

      const aiResponse = response.choices[0].message.content;
      conversationManager.addMessage('assistant', aiResponse);
      
      return aiResponse;
    } catch (error) {
      console.error('LLM Error:', error);
      return "I'm having trouble understanding. Could you please repeat that?";
    }
  }

  // Text to Speech using ElevenLabs (with Coqui fallback)
  async textToSpeech(text) {
    try {
      // Try ElevenLabs first for best quality
      if (this.ttsService) {
        try {
          // Use streaming for low latency
          const audioStream = await this.ttsService.textToSpeechStream(text, {
            optimizeLatency: 4 // Maximum latency optimization
          });
          
          // Collect audio chunks
          const chunks = [];
          for await (const chunk of audioStream) {
            chunks.push(chunk);
          }
          
          // Combine chunks
          const audioBuffer = Buffer.concat(chunks);
          
          // Convert from PCM 16kHz to mulaw 8kHz for Twilio
          const mulawData = await this.ttsService.convertAudioFormat(
            audioBuffer,
            'pcm_16000',
            'mulaw_8000'
          );
          
          return mulawData;
        } catch (elevenLabsError) {
          console.error('ElevenLabs TTS failed, falling back to Coqui:', elevenLabsError);
        }
      }
      
      // Fallback to OpenAI TTS
      if (this.openai) {
        const response = await this.openai.audio.speech.create({
          model: 'tts-1',
          voice: 'nova',
          input: text,
          response_format: 'pcm'
        });

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const audioData = new Int16Array(audioBuffer.buffer);
        
        // Resample from TTS sample rate to 8kHz for Twilio
        const resampled = this.resample(audioData, 24000, 8000);
        
        // Convert to mulaw
        return linear16ToMulaw(resampled);
      }
      
      // Final fallback - return silence
      return new Uint8Array(160);
    } catch (error) {
      console.error('TTS Error:', error);
      // Return silence on error
      return new Uint8Array(160); // 20ms of silence at 8kHz
    }
  }

  // Create WAV header
  createWavBuffer(pcmData, sampleRate, channels, bitDepth) {
    const dataLength = pcmData.length * (bitDepth / 8);
    const buffer = Buffer.alloc(44 + dataLength);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // fmt chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28); // byte rate
    buffer.writeUInt16LE(channels * (bitDepth / 8), 32); // block align
    buffer.writeUInt16LE(bitDepth, 34);
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    
    // Copy PCM data
    const pcmBuffer = Buffer.from(pcmData.buffer);
    pcmBuffer.copy(buffer, 44);
    
    return buffer;
  }

  // Simple resampling
  resample(inputData, inputRate, outputRate) {
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const output = new Int16Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const inputIndex = Math.floor(i * ratio);
      output[i] = inputData[inputIndex];
    }
    
    return output;
  }

  // Update voice configuration for dynamic voice switching
  updateVoiceConfig(config) {
    if (config.voiceId && this.ttsService) {
      // Update ElevenLabs voice
      this.ttsService.voiceId = this.ttsService.voices[config.voiceId] || config.voiceId;
      
      // Update voice settings if provided
      if (config.stability !== undefined) {
        this.ttsService.voiceSettings.stability = config.stability;
      }
      if (config.similarityBoost !== undefined) {
        this.ttsService.voiceSettings.similarity_boost = config.similarityBoost;
      }
      if (config.style !== undefined) {
        this.ttsService.voiceSettings.style = config.style;
      }
      
      console.log(`Voice config updated to: ${config.voiceId}`);
    }
  }

  // Get available voices
  async getAvailableVoices() {
    if (this.ttsService) {
      return await this.ttsService.getVoices();
    }
    return [];
  }

  // Handle WebSocket connection
  handleConnection(ws, callSid) {
    const connection = {
      ws,
      callSid,
      streamSid: null,
      audioBuffer: [],
      vad: new VAD(),
      conversationManager: new ConversationManager(),
      isProcessing: false
    };
    
    this.connections.set(callSid, connection);
    
    ws.on('message', async (message) => {
      const data = JSON.parse(message);
      
      switch (data.event) {
        case 'start':
          connection.streamSid = data.start.streamSid;
          console.log(`Stream ${connection.streamSid} started for call ${callSid}`);
          
          // Send initial greeting after a short delay
          setTimeout(async () => {
            const greeting = "Thank you for calling Dr. Pedro's office. This is Julie. How can I help you today?";
            await this.sendAudioResponse(connection, greeting);
          }, 500);
          break;
          
        case 'media':
          if (!connection.isProcessing) {
            const audioChunk = Buffer.from(data.media.payload, 'base64');
            const pcm16 = mulawToLinear16(audioChunk);
            
            // Add to buffer
            connection.audioBuffer.push(...pcm16);
            
            // Check VAD
            const vadResult = connection.vad.detect(pcm16);
            
            if (vadResult.endOfSpeech && connection.audioBuffer.length > 8000) { // At least 1 second of audio
              await this.processAudioBuffer(connection);
            }
            
            // Prevent buffer overflow
            if (connection.audioBuffer.length > 160000) { // 20 seconds max
              connection.audioBuffer = connection.audioBuffer.slice(-80000); // Keep last 10 seconds
            }
          }
          break;
          
        case 'stop':
          console.log(`Stream ${connection.streamSid} stopped`);
          this.connections.delete(callSid);
          break;
      }
    });
    
    ws.on('close', () => {
      console.log(`WebSocket closed for call ${callSid}`);
      this.connections.delete(callSid);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket error for call ${callSid}:`, error);
      this.connections.delete(callSid);
    });
  }

  // Process accumulated audio buffer
  async processAudioBuffer(connection) {
    if (connection.isProcessing || connection.audioBuffer.length < 8000) return;
    
    connection.isProcessing = true;
    
    try {
      // Convert buffer to proper format
      const audioData = new Int16Array(connection.audioBuffer);
      
      // Clear buffer
      connection.audioBuffer = [];
      
      // Speech to text
      const transcript = await this.speechToText(audioData);
      console.log('Transcript:', transcript);
      
      if (transcript && transcript.trim().length > 0) {
        // Generate response
        const response = await this.generateResponse(
          connection.conversationManager,
          transcript
        );
        
        // Send audio response
        await this.sendAudioResponse(connection, response);
      }
    } catch (error) {
      console.error('Processing error:', error);
    } finally {
      connection.isProcessing = false;
    }
  }

  // Send audio response to Twilio
  async sendAudioResponse(connection, text) {
    try {
      // Convert text to speech
      const audioData = await this.textToSpeech(text);
      
      // Send audio in chunks (20ms chunks for Twilio)
      const chunkSize = 160; // 20ms at 8kHz
      
      for (let i = 0; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, i + chunkSize);
        const base64Chunk = Buffer.from(chunk).toString('base64');
        
        const message = {
          event: 'media',
          streamSid: connection.streamSid,
          media: {
            payload: base64Chunk
          }
        };
        
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(JSON.stringify(message));
        }
        
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      // Send mark message to know when audio is done playing
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify({
          event: 'mark',
          streamSid: connection.streamSid,
          mark: {
            name: `audio_end_${Date.now()}`
          }
        }));
      }
    } catch (error) {
      console.error('Send audio error:', error);
    }
  }
}

export default VoiceService;