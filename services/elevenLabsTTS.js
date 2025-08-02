import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

/**
 * ElevenLabs Text-to-Speech Service
 * Handles real-time voice synthesis
 */
export class ElevenLabsTTS extends EventEmitter {
  constructor() {
    super();
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
    this.streamCache = new Map();
  }

  /**
   * Check if service is available
   * @returns {boolean} Service availability
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Generate speech from text
   * @param {string} text - Text to synthesize
   * @param {object} options - Synthesis options
   * @returns {Promise<Buffer>} Audio buffer
   */
  async synthesize(text, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = options.voiceId || this.defaultVoiceId;
    const modelId = options.modelId || 'eleven_monolingual_v1';
    
    try {
      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarityBoost || 0.75,
            style: options.style || 0.0,
            use_speaker_boost: options.useSpeakerBoost || true
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
      }

      const audioBuffer = await response.buffer();
      
      this.emit('synthesis:complete', {
        text,
        voiceId,
        audioLength: audioBuffer.length
      });

      return audioBuffer;
    } catch (error) {
      console.error('ElevenLabs synthesis error:', error);
      this.emit('synthesis:error', { error, text, voiceId });
      throw error;
    }
  }

  /**
   * Create a streaming synthesis session
   * @param {string} sessionId - Unique session identifier
   * @param {object} options - Voice options
   * @returns {object} Stream session
   */
  async createStreamSession(sessionId, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = options.voiceId || this.defaultVoiceId;
    const modelId = options.modelId || 'eleven_monolingual_v1';

    const streamSession = {
      sessionId,
      voiceId,
      modelId,
      voiceSettings: {
        stability: options.stability || 0.5,
        similarity_boost: options.similarityBoost || 0.75,
        style: options.style || 0.0,
        use_speaker_boost: options.useSpeakerBoost || true
      },
      queue: [],
      processing: false
    };

    this.streamCache.set(sessionId, streamSession);
    
    return streamSession;
  }

  /**
   * Stream text to speech
   * @param {string} sessionId - Session identifier
   * @param {string} text - Text to synthesize
   * @returns {Promise<Readable>} Audio stream
   */
  async streamSynthesize(sessionId, text) {
    const session = this.streamCache.get(sessionId);
    if (!session) {
      throw new Error(`No stream session found for ${sessionId}`);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${session.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify({
            text,
            model_id: session.modelId,
            voice_settings: session.voiceSettings,
            optimize_streaming_latency: 3
          })
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs streaming error: ${response.status}`);
      }

      // Convert response body to readable stream
      const audioStream = Readable.from(response.body);
      
      this.emit('stream:chunk', {
        sessionId,
        text,
        timestamp: new Date().toISOString()
      });

      return audioStream;
    } catch (error) {
      console.error('ElevenLabs streaming error:', error);
      this.emit('stream:error', { sessionId, error });
      throw error;
    }
  }

  /**
   * Test ElevenLabs connection
   * @param {string} testText - Text to test with
   * @returns {object} Test results
   */
  async testElevenLabs(testText) {
    if (!this.isAvailable()) {
      return {
        connected: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    try {
      // Test with a simple synthesis
      const audioBuffer = await this.synthesize(testText, {
        voiceId: this.defaultVoiceId
      });

      return {
        connected: true,
        audioLength: audioBuffer.length,
        audioGenerated: audioBuffer.length > 0
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        audioGenerated: false
      };
    }
  }

  /**
   * Get available voices
   * @returns {Promise<Array>} List of voices
   */
  async getVoices() {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error);
      return [];
    }
  }

  /**
   * Close stream session
   * @param {string} sessionId - Session identifier
   */
  closeStreamSession(sessionId) {
    this.streamCache.delete(sessionId);
    this.emit('stream:close', { sessionId });
  }

  /**
   * Get active sessions count
   * @returns {number} Number of active sessions
   */
  getActiveSessions() {
    return this.streamCache.size;
  }

  /**
   * Clean up all sessions
   */
  cleanup() {
    this.streamCache.clear();
  }
}

export default ElevenLabsTTS;