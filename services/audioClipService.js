import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import express from 'express';
import NodeCache from 'node-cache';

import logger from '../utils/logger.js';
import twilioService from '../twilio_service.js';

import { ElevenLabsTTS } from './elevenLabsTTS.js';
import { emitClipPlayed } from './websocketManager.js';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Audio Clip Service
 * Handles generation, storage, and sharing of short audio clips
 */
export class AudioClipService {
  constructor(options = {}) {
    // Initialize ElevenLabs TTS
    this.tts = new ElevenLabsTTS({
      voiceId: options.voiceId || 'nicole', // Friendly voice for clips
      modelId: 'eleven_turbo_v2', // Fast generation
      stability: 0.6,
      similarityBoost: 0.8,
      style: 0.3
    });
    
    // Initialize Twilio
    this.twilioService = twilioService;
    
    // Initialize Supabase
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_KEY;
    
    if (process.env.SUPABASE_URL && supabaseKey) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        supabaseKey
      );
    }
    
    // Configuration
    this.config = {
      maxDuration: options.maxDuration || 30, // seconds
      tempDir: options.tempDir || path.join(__dirname, '../../temp/audio-clips'),
      publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
      clipExpiryHours: options.clipExpiryHours || 24,
      supportedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
      optimizationProfiles: {
        mobile: {
          codec: 'aac',
          bitrate: '64k',
          sampleRate: 22050,
          channels: 1
        },
        web: {
          codec: 'mp3',
          bitrate: '128k',
          sampleRate: 44100,
          channels: 2
        },
        sms: {
          codec: 'mp3',
          bitrate: '32k',
          sampleRate: 16000,
          channels: 1
        }
      }
    };
    
    // In-memory cache for clips (with TTL)
    this.clipCache = new NodeCache({ 
      stdTTL: this.config.clipExpiryHours * 3600,
      checkperiod: 3600 // Check for expired keys every hour
    });
    
    // Analytics storage
    this.analytics = new Map();
    
    // Ensure temp directory exists
    this.initTempDirectory();
    
    // Set up cleanup interval
    this.startCleanupInterval();
  }
  
  /**
   * Initialize temporary directory
   */
  async initTempDirectory() {
    try {
      await fs.mkdir(this.config.tempDir, { recursive: true });
      logger.info('Audio clip temp directory initialized:', this.config.tempDir);
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
    }
  }
  
  /**
   * Generate a short audio clip from text
   */
  async generateClip(text, options = {}) {
    try {
      // Validate text length (approximate duration check)
      const estimatedDuration = this.estimateAudioDuration(text);
      if (estimatedDuration > this.config.maxDuration) {
        throw new Error(`Text too long. Estimated duration: ${estimatedDuration}s, max allowed: ${this.config.maxDuration}s`);
      }
      
      // Generate unique clip ID
      const clipId = uuidv4();
      
      // Generate audio using ElevenLabs
      logger.info(`Generating audio clip ${clipId} for text: "${text.substring(0, 50)}..."`);
      
      const audioBuffer = await this.tts.textToSpeech(text, {
        voiceId: options.voiceId,
        voiceSettings: options.voiceSettings
      });
      
      // Save raw audio temporarily
      const rawPath = path.join(this.config.tempDir, `${clipId}_raw.mp3`);
      await fs.writeFile(rawPath, audioBuffer);
      
      // Optimize for different formats
      const formats = await this.optimizeAudioFormats(clipId, rawPath, options.targetDevice);
      
      // Create clip metadata
      const clipData = {
        id: clipId,
        text: text,
        voice: options.voiceId || 'nicole',
        formats: formats,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.config.clipExpiryHours * 3600 * 1000).toISOString(),
        shareUrl: `${this.config.publicUrl}/audio-clips/${clipId}`,
        analytics: {
          plays: 0,
          uniqueListeners: new Set(),
          devices: {},
          locations: {}
        }
      };
      
      // Store in cache
      this.clipCache.set(clipId, clipData);
      
      // Store in database if available
      if (this.supabase) {
        await this.storeClipInDatabase(clipData);
      }
      
      // Clean up raw file
      await fs.unlink(rawPath).catch(() => {});
      
      logger.info(`Audio clip generated successfully: ${clipId}`);
      
      return {
        clipId,
        shareUrl: clipData.shareUrl,
        formats: Object.keys(formats),
        expiresAt: clipData.expiresAt
      };
      
    } catch (error) {
      logger.error('Failed to generate audio clip:', error);
      throw error;
    }
  }
  
  /**
   * Optimize audio for different devices
   */
  async optimizeAudioFormats(clipId, inputPath, targetDevice = 'all') {
    const formats = {};
    const profiles = targetDevice === 'all' 
      ? Object.entries(this.config.optimizationProfiles)
      : [[targetDevice, this.config.optimizationProfiles[targetDevice] || this.config.optimizationProfiles.web]];
    
    for (const [profileName, profile] of profiles) {
      try {
        const outputPath = path.join(this.config.tempDir, `${clipId}_${profileName}.mp3`);
        
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .audioCodec(profile.codec)
            .audioBitrate(profile.bitrate)
            .audioFrequency(profile.sampleRate)
            .audioChannels(profile.channels)
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
        });
        
        formats[profileName] = {
          path: outputPath,
          codec: profile.codec,
          bitrate: profile.bitrate,
          sampleRate: profile.sampleRate,
          size: (await fs.stat(outputPath)).size
        };
        
      } catch (error) {
        logger.error(`Failed to optimize audio for ${profileName}:`, error);
      }
    }
    
    return formats;
  }
  
  /**
   * Send audio clip via SMS
   */
  async sendClipViaSMS(clipId, phoneNumber, message = '') {
    try {
      const clip = this.clipCache.get(clipId);
      if (!clip) {
        throw new Error('Clip not found or expired');
      }
      
      // Prepare SMS body
      const smsBody = message 
        ? `${message}\n\nListen to audio message: ${clip.shareUrl}`
        : `You have a new audio message: ${clip.shareUrl}`;
      
      // Send SMS using Twilio
      const result = await this.twilioService.sendSms(
        phoneNumber,
        smsBody,
        { from: process.env.TWILIO_PHONE_NUMBER }
      );
      
      // Track SMS delivery
      if (clip.analytics) {
        clip.analytics.smsDeliveries = (clip.analytics.smsDeliveries || 0) + 1;
      }
      
      logger.info(`Audio clip ${clipId} sent via SMS to ${phoneNumber}`);
      
      return {
        success: true,
        messageSid: result.sid,
        shareUrl: clip.shareUrl
      };
      
    } catch (error) {
      logger.error('Failed to send audio clip via SMS:', error);
      throw error;
    }
  }
  
  /**
   * Create HTML5 audio player page
   */
  createAudioPlayerHTML(clip) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio Message</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .player-container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 24px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .audio-player {
            width: 100%;
            margin: 30px 0;
            outline: none;
        }
        
        .play-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 15px 40px;
            font-size: 18px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin: 20px 0;
        }
        
        .play-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }
        
        .play-button:active {
            transform: translateY(0);
        }
        
        .text-content {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            font-style: italic;
            color: #555;
            line-height: 1.6;
        }
        
        .metadata {
            font-size: 12px;
            color: #999;
            margin-top: 20px;
        }
        
        .expires {
            color: #e74c3c;
            font-weight: bold;
        }
        
        @media (max-width: 600px) {
            .player-container {
                padding: 30px 20px;
            }
            
            h1 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="player-container">
        <h1>🎵 Audio Message</h1>
        <p class="subtitle">Click play to listen to your message</p>
        
        <audio id="audioPlayer" class="audio-player" controls preload="metadata">
            <source src="/audio-clips/${clip.id}/audio" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
        
        <button class="play-button" onclick="playAudio()">
            ▶️ Play Message
        </button>
        
        ${clip.text ? `
        <div class="text-content">
            <strong>Message:</strong><br>
            "${clip.text}"
        </div>
        ` : ''}
        
        <div class="metadata">
            <p>Created: ${new Date(clip.createdAt).toLocaleString()}</p>
            <p class="expires">Expires: ${new Date(clip.expiresAt).toLocaleString()}</p>
        </div>
    </div>
    
    <script>
        const audio = document.getElementById('audioPlayer');
        let hasPlayed = false;
        
        function playAudio() {
            audio.play();
            if (!hasPlayed) {
                hasPlayed = true;
                trackPlay();
            }
        }
        
        audio.addEventListener('play', () => {
            if (!hasPlayed) {
                hasPlayed = true;
                trackPlay();
            }
        });
        
        function trackPlay() {
            // Track analytics
            fetch('/audio-clips/${clip.id}/analytics', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event: 'play',
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                })
            }).catch(console.error);
        }
        
        // Auto-detect device capabilities
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Audio Message',
                artist: 'RepSpheres',
                album: 'Voice Messages'
            });
        }
    </script>
</body>
</html>
    `;
    
    return html;
  }
  
  /**
   * Track analytics for clip
   */
  async trackAnalytics(clipId, eventData) {
    try {
      const clip = this.clipCache.get(clipId);
      if (!clip) return;
      
      const analytics = clip.analytics;
      
      // Track event type
      switch (eventData.event) {
        case 'play':
          analytics.plays++;
          
          // Track unique listeners (by IP or session)
          if (eventData.sessionId) {
            analytics.uniqueListeners.add(eventData.sessionId);
          }
          
          // Track device types
          const deviceType = this.detectDeviceType(eventData.userAgent);
          analytics.devices[deviceType] = (analytics.devices[deviceType] || 0) + 1;
          
          // Track location if available
          if (eventData.location) {
            const country = eventData.location.country || 'Unknown';
            analytics.locations[country] = (analytics.locations[country] || 0) + 1;
          }
          
          // Emit WebSocket event for real-time analytics
          emitClipPlayed(clipId, {
            event: 'play',
            plays: analytics.plays,
            uniqueListeners: analytics.uniqueListeners.size,
            deviceType,
            location: eventData.location,
            userAgent: eventData.userAgent,
            timestamp: new Date().toISOString()
          });
          break;
          
        case 'download':
          analytics.downloads = (analytics.downloads || 0) + 1;
          break;
          
        case 'share':
          analytics.shares = (analytics.shares || 0) + 1;
          break;
      }
      
      // Update cache
      this.clipCache.set(clipId, clip);
      
      // Update database if available
      if (this.supabase) {
        await this.updateAnalyticsInDatabase(clipId, analytics);
      }
      
      // Store detailed analytics
      const analyticsKey = `analytics_${clipId}_${Date.now()}`;
      this.analytics.set(analyticsKey, {
        clipId,
        ...eventData,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to track analytics:', error);
    }
  }
  
  /**
   * Get analytics summary for a clip
   */
  async getAnalytics(clipId) {
    const clip = this.clipCache.get(clipId);
    if (!clip) {
      throw new Error('Clip not found or expired');
    }
    
    return {
      clipId,
      plays: clip.analytics.plays,
      uniqueListeners: clip.analytics.uniqueListeners.size,
      devices: clip.analytics.devices,
      locations: clip.analytics.locations,
      downloads: clip.analytics.downloads || 0,
      shares: clip.analytics.shares || 0,
      smsDeliveries: clip.analytics.smsDeliveries || 0,
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt
    };
  }
  
  /**
   * Set up Express routes for audio clips
   */
  setupRoutes(app) {
    const router = express.Router();
    
    // Serve audio player page
    router.get('/audio-clips/:clipId', async (req, res) => {
      try {
        const clip = this.clipCache.get(req.params.clipId);
        if (!clip) {
          return res.status(404).send('Audio clip not found or expired');
        }
        
        // Track page view
        await this.trackAnalytics(req.params.clipId, {
          event: 'view',
          userAgent: req.headers['user-agent'],
          sessionId: req.sessionID || req.ip,
          location: req.location // If using location middleware
        });
        
        res.send(this.createAudioPlayerHTML(clip));
      } catch (error) {
        logger.error('Error serving audio player:', error);
        res.status(500).send('Internal server error');
      }
    });
    
    // Serve audio file
    router.get('/audio-clips/:clipId/audio', async (req, res) => {
      try {
        const clip = this.clipCache.get(req.params.clipId);
        if (!clip) {
          return res.status(404).send('Audio clip not found or expired');
        }
        
        // Detect device type and serve appropriate format
        const userAgent = req.headers['user-agent'] || '';
        const deviceType = this.detectDeviceType(userAgent);
        const format = clip.formats[deviceType] || clip.formats.web || Object.values(clip.formats)[0];
        
        if (!format) {
          return res.status(404).send('Audio format not available');
        }
        
        // Set appropriate headers
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': format.size,
          'Cache-Control': 'public, max-age=3600',
          'Accept-Ranges': 'bytes'
        });
        
        // Stream audio file
        const audioStream = await fs.readFile(format.path);
        res.send(audioStream);
        
      } catch (error) {
        logger.error('Error serving audio file:', error);
        res.status(500).send('Internal server error');
      }
    });
    
    // Analytics endpoint
    router.post('/audio-clips/:clipId/analytics', async (req, res) => {
      try {
        await this.trackAnalytics(req.params.clipId, {
          ...req.body,
          ip: req.ip,
          sessionId: req.sessionID || req.ip
        });
        
        res.json({ success: true });
      } catch (error) {
        logger.error('Error tracking analytics:', error);
        res.status(500).json({ error: 'Failed to track analytics' });
      }
    });
    
    // Get analytics summary
    router.get('/audio-clips/:clipId/analytics', async (req, res) => {
      try {
        const analytics = await this.getAnalytics(req.params.clipId);
        res.json(analytics);
      } catch (error) {
        logger.error('Error fetching analytics:', error);
        res.status(404).json({ error: error.message });
      }
    });
    
    app.use(router);
  }
  
  /**
   * Estimate audio duration from text
   */
  estimateAudioDuration(text) {
    // Average speaking rate: 150-160 words per minute
    const wordsPerMinute = 155;
    const wordCount = text.split(/\s+/).length;
    const durationMinutes = wordCount / wordsPerMinute;
    return Math.ceil(durationMinutes * 60); // Return in seconds
  }
  
  /**
   * Detect device type from user agent
   */
  detectDeviceType(userAgent) {
    const ua = userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
      return 'mobile';
    } else if (/ipad|tablet|kindle/i.test(ua)) {
      return 'tablet';
    } else {
      return 'web';
    }
  }
  
  /**
   * Store clip in database
   */
  async storeClipInDatabase(clipData) {
    try {
      const { error } = await this.supabase
        .from('audio_clips')
        .insert({
          id: clipData.id,
          text: clipData.text,
          voice: clipData.voice,
          formats: clipData.formats,
          share_url: clipData.shareUrl,
          expires_at: clipData.expiresAt,
          analytics: {
            plays: 0,
            unique_listeners: 0,
            devices: {},
            locations: {}
          }
        });
      
      if (error) {
        logger.error('Failed to store clip in database:', error);
      }
    } catch (error) {
      logger.error('Database storage error:', error);
    }
  }
  
  /**
   * Update analytics in database
   */
  async updateAnalyticsInDatabase(clipId, analytics) {
    try {
      const { error } = await this.supabase
        .from('audio_clips')
        .update({
          analytics: {
            plays: analytics.plays,
            unique_listeners: analytics.uniqueListeners.size,
            devices: analytics.devices,
            locations: analytics.locations,
            downloads: analytics.downloads || 0,
            shares: analytics.shares || 0,
            sms_deliveries: analytics.smsDeliveries || 0
          }
        })
        .eq('id', clipId);
      
      if (error) {
        logger.error('Failed to update analytics in database:', error);
      }
    } catch (error) {
      logger.error('Database analytics update error:', error);
    }
  }
  
  /**
   * Clean up expired clips
   */
  async cleanupExpiredClips() {
    try {
      logger.info('Starting audio clip cleanup...');
      
      // Get all clips from cache
      const keys = this.clipCache.keys();
      let cleanedCount = 0;
      
      for (const key of keys) {
        const clip = this.clipCache.get(key);
        if (!clip) continue;
        
        // Check if expired
        if (new Date(clip.expiresAt) < new Date()) {
          // Delete audio files
          for (const format of Object.values(clip.formats)) {
            try {
              await fs.unlink(format.path);
            } catch (error) {
              // File might already be deleted
            }
          }
          
          // Remove from cache
          this.clipCache.del(key);
          cleanedCount++;
        }
      }
      
      // Clean up analytics older than 7 days
      const analyticsExpiry = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const [key, data] of this.analytics.entries()) {
        if (new Date(data.timestamp).getTime() < analyticsExpiry) {
          this.analytics.delete(key);
        }
      }
      
      logger.info(`Audio clip cleanup completed. Removed ${cleanedCount} expired clips.`);
      
    } catch (error) {
      logger.error('Error during clip cleanup:', error);
    }
  }
  
  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupExpiredClips();
    }, 60 * 60 * 1000);
    
    // Run initial cleanup
    this.cleanupExpiredClips();
  }
  
  /**
   * Generate shareable link with custom parameters
   */
  generateShareableLink(clipId, options = {}) {
    const baseUrl = `${this.config.publicUrl}/audio-clips/${clipId}`;
    const params = new URLSearchParams();
    
    if (options.autoplay) params.append('autoplay', '1');
    if (options.loop) params.append('loop', '1');
    if (options.embed) params.append('embed', '1');
    if (options.theme) params.append('theme', options.theme);
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
  
  /**
   * Get embeddable iframe code
   */
  getEmbedCode(clipId, options = {}) {
    const url = this.generateShareableLink(clipId, { ...options, embed: true });
    const width = options.width || 400;
    const height = options.height || 200;
    
    return `<iframe src="${url}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
  }
}

// Export singleton instance with lazy initialization
let _audioClipService = null;

export function getAudioClipService() {
  if (!_audioClipService) {
    _audioClipService = new AudioClipService();
  }
  return _audioClipService;
}

// For backward compatibility, export a proxy that creates the instance on first access
export const audioClipService = new Proxy({}, {
  get(target, prop) {
    return getAudioClipService()[prop];
  },
  set(target, prop, value) {
    getAudioClipService()[prop] = value;
    return true;
  }
});

export default AudioClipService;