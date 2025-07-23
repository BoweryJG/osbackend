import { Transform } from 'stream';

import axios from 'axios';
import WebSocket from 'ws';

/**
 * ElevenLabs Text-to-Speech Service
 * Provides high-quality, low-latency voice synthesis for Julie AI
 */
export class ElevenLabsTTS {
  constructor(options = {}) {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }
    
    // Voice configuration
    this.voiceId = options.voiceId || 'rachel'; // Professional female voice
    this.modelId = options.modelId || 'eleven_turbo_v2'; // Low-latency model
    
    // Voice settings for natural conversation
    this.voiceSettings = {
      stability: options.stability || 0.5,
      similarity_boost: options.similarityBoost || 0.75,
      style: options.style || 0.0,
      use_speaker_boost: true
    };
    
    // Available voices mapping
    this.voices = {
      'rachel': '21m00Tcm4TlvDq8ikWAM', // Rachel - Professional female
      'domi': 'AZnzlk1XvdvUeBnXmlld', // Domi - Warm female
      'bella': 'EXAVITQu4vr4xnSDxMaL', // Bella - Natural female
      'antoni': 'ErXwobaYiN019PkySvjV', // Antoni - Professional male
      'elli': 'MF3mGyEYCl7XYWbV9V6O', // Elli - Clear female
      'nicole': 'piTKgcLEGmPE4e6mEKli' // Nicole - Friendly female
    };
    
    // Set the actual voice ID
    this.voiceId = this.voices[this.voiceId] || this.voiceId;
    
    // WebSocket for streaming (optional)
    this.wsUrl = 'wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={model_id}';
    this.ws = null;
    
    // Audio format settings
    this.outputFormat = options.outputFormat || 'pcm_16000'; // 16kHz PCM for compatibility
    
    // Caching for repeated phrases
    this.audioCache = new Map();
    this.maxCacheSize = 100;
  }
  
  /**
   * Get available voices from ElevenLabs
   */
  async getVoices() {
    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.apiKey
        }
      });
      
      return response.data.voices.map(voice => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
        description: voice.description,
        preview_url: voice.preview_url,
        labels: voice.labels
      }));
    } catch (error) {
      console.error('Error fetching voices:', error);
      throw error;
    }
  }
  
  /**
   * Convert text to speech using REST API (standard latency)
   */
  async textToSpeech(text, options = {}) {
    // Check cache first
    const cacheKey = `${text}_${this.voiceId}_${this.modelId}`;
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey);
    }
    
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          text: text,
          model_id: options.modelId || this.modelId,
          voice_settings: options.voiceSettings || this.voiceSettings
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      
      const audioData = Buffer.from(response.data);
      
      // Cache the result
      this.cacheAudio(cacheKey, audioData);
      
      return audioData;
    } catch (error) {
      console.error('ElevenLabs TTS Error:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Convert text to speech with streaming (ultra-low latency)
   */
  async textToSpeechStream(text, options = {}) {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          text: text,
          model_id: options.modelId || this.modelId,
          voice_settings: options.voiceSettings || this.voiceSettings,
          optimize_streaming_latency: options.optimizeLatency || 3, // 0-4, higher = lower latency
          output_format: this.outputFormat
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('ElevenLabs Streaming TTS Error:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Initialize WebSocket connection for real-time streaming
   */
  async initializeWebSocketStream(onAudioData, onError) {
    const wsUrl = this.wsUrl
      .replace('{voice_id}', this.voiceId)
      .replace('{model_id}', this.modelId);
    
    this.ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': this.apiKey
      }
    });
    
    this.ws.on('open', () => {
      console.log('ElevenLabs WebSocket connected');
      
      // Send initial configuration
      this.ws.send(JSON.stringify({
        text: ' ',
        voice_settings: this.voiceSettings,
        generation_config: {
          chunk_length_schedule: [50] // Generate audio in 50ms chunks
        }
      }));
    });
    
    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      if (message.audio) {
        // Decode base64 audio chunk
        const audioChunk = Buffer.from(message.audio, 'base64');
        onAudioData(audioChunk);
      }
      
      if (message.isFinal) {
        console.log('Audio generation complete');
      }
    });
    
    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      onError(error);
    });
    
    this.ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  }
  
  /**
   * Send text to WebSocket stream
   */
  sendTextToStream(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        text: text,
        flush: true
      }));
    }
  }
  
  /**
   * Close WebSocket connection
   */
  closeStream() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  /**
   * Convert audio format for compatibility
   */
  async convertAudioFormat(audioData, fromFormat, toFormat) {
    // For Twilio, we need 8kHz mulaw
    if (toFormat === 'mulaw_8000') {
      return this.convertToMulaw8k(audioData);
    }
    
    // For WebRTC, we might want 48kHz PCM
    if (toFormat === 'pcm_48000') {
      return this.resampleAudio(audioData, 16000, 48000);
    }
    
    return audioData;
  }
  
  /**
   * Convert PCM to mulaw format for Twilio
   */
  convertToMulaw8k(pcmData) {
    // First resample to 8kHz if needed
    const pcm8k = this.resampleAudio(pcmData, 16000, 8000);
    
    // Convert to mulaw
    const MULAW_BIAS = 0x84;
    const MULAW_MAX = 32635;
    const mulaw = new Uint8Array(pcm8k.length / 2);
    
    const pcm16 = new Int16Array(pcm8k.buffer);
    
    for (let i = 0; i < pcm16.length; i++) {
      let sample = pcm16[i];
      const sign = (sample >> 8) & 0x80;
      if (sign !== 0) sample = -sample;
      if (sample > MULAW_MAX) sample = MULAW_MAX;
      sample += MULAW_BIAS;
      const exponent = Math.floor(Math.log2(sample) - 7);
      const mantissa = (sample >> (exponent + 3)) & 0x0F;
      const byte = sign | (exponent << 4) | mantissa;
      mulaw[i] = ~byte;
    }
    
    return mulaw;
  }
  
  /**
   * Simple audio resampling
   */
  resampleAudio(inputData, inputRate, outputRate) {
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const output = new Buffer(outputLength);
    
    for (let i = 0; i < outputLength; i += 2) {
      const inputIndex = Math.floor((i / 2) * ratio) * 2;
      output[i] = inputData[inputIndex];
      output[i + 1] = inputData[inputIndex + 1];
    }
    
    return output;
  }
  
  /**
   * Cache audio data
   */
  cacheAudio(key, data) {
    // Implement LRU cache
    if (this.audioCache.size >= this.maxCacheSize) {
      const firstKey = this.audioCache.keys().next().value;
      this.audioCache.delete(firstKey);
    }
    this.audioCache.set(key, data);
  }
  
  /**
   * Create a Transform stream for pipeline integration
   */
  createTransformStream() {
    const tts = this;
    
    return new Transform({
      objectMode: true,
      async transform(chunk, encoding, callback) {
        if (chunk.type === 'llm_response' && chunk.text) {
          try {
            // Use streaming for real-time response
            const audioStream = await tts.textToSpeechStream(chunk.text, {
              optimizeLatency: 4 // Maximum latency optimization
            });
            
            audioStream.on('data', (audioChunk) => {
              this.push({
                type: 'audio',
                data: audioChunk,
                format: 'pcm_16000',
                timestamp: Date.now()
              });
            });
            
            audioStream.on('end', () => {
              callback();
            });
            
            audioStream.on('error', (error) => {
              callback(error);
            });
          } catch (error) {
            callback(error);
          }
        } else {
          callback();
        }
      }
    });
  }
  
  /**
   * Get voice presets for Julie AI
   */
  static getJulieVoicePresets() {
    return {
      professional: {
        voiceId: 'rachel',
        modelId: 'eleven_turbo_v2',
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      warm: {
        voiceId: 'domi',
        modelId: 'eleven_turbo_v2',
        voiceSettings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true
        }
      },
      friendly: {
        voiceId: 'nicole',
        modelId: 'eleven_turbo_v2',
        voiceSettings: {
          stability: 0.55,
          similarity_boost: 0.7,
          style: 0.3,
          use_speaker_boost: true
        }
      },
      clear: {
        voiceId: 'elli',
        modelId: 'eleven_turbo_v2',
        voiceSettings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.0,
          use_speaker_boost: true
        }
      }
    };
  }
}

export default ElevenLabsTTS;