import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import axios from 'axios';
import NodeCache from 'node-cache';
import FormData from 'form-data';
import { createClient } from '@supabase/supabase-js';

import { emitVoiceCloneProgress, emitTrainingMilestone } from './websocketManager.js';

const execAsync = promisify(exec);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Voice Cloning Service
 * Integrates with ElevenLabs API for voice cloning from YouTube/SoundCloud
 */
export class VoiceCloningService {
  constructor(options = {}) {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }
    
    // API endpoints
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    // File paths
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp', 'voice-cloning');
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB max
    
    // Cache configuration
    this.voiceCache = new NodeCache({ 
      stdTTL: 3600, // 1 hour cache
      checkperiod: 600 // Check every 10 minutes
    });
    
    // Supported platforms
    this.supportedPlatforms = {
      'youtube.com': true,
      'youtu.be': true,
      'soundcloud.com': true,
      'm.soundcloud.com': true
    };
    
    // Initialize temp directory
    this.initializeTempDir();
  }
  
  /**
   * Initialize temporary directory for audio processing
   */
  async initializeTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }
  
  /**
   * Extract audio from URL using yt-dlp
   */
  async extractAudioFromUrl(url, options = {}) {
    try {
      // Validate URL
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      
      if (!this.supportedPlatforms[hostname]) {
        throw new Error(`Unsupported platform: ${hostname}. Supported platforms: YouTube, SoundCloud`);
      }
      
      // Generate unique filename
      const fileId = crypto.randomBytes(16).toString('hex');
      const outputPath = path.join(this.tempDir, `${fileId}.mp3`);
      
      // yt-dlp command with audio extraction
      const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 ` +
                     `--max-filesize ${this.maxFileSize} ` +
                     `--no-playlist ` +
                     `--output "${outputPath}" ` +
                     `"${url}"`;
      
      console.log('Extracting audio from URL:', url);
      
      // Execute yt-dlp
      const { stdout, stderr } = await execAsync(command, {
        timeout: options.timeout || 300000 // 5 minute timeout
      });
      
      // Check if file was created
      const stats = await fs.stat(outputPath);
      
      if (stats.size === 0) {
        throw new Error('Failed to extract audio: empty file');
      }
      
      // Get metadata
      const metadataCommand = `yt-dlp --dump-json --no-playlist "${url}"`;
      const { stdout: metadataJson } = await execAsync(metadataCommand);
      const metadata = JSON.parse(metadataJson);
      
      return {
        filePath: outputPath,
        fileSize: stats.size,
        duration: metadata.duration,
        title: metadata.title,
        uploader: metadata.uploader,
        description: metadata.description,
        url: url
      };
      
    } catch (error) {
      console.error('Error extracting audio:', error);
      
      if (error.code === 'ENOENT') {
        throw new Error('yt-dlp not found. Please install yt-dlp: pip install yt-dlp');
      }
      
      throw error;
    }
  }
  
  /**
   * Process audio file for voice cloning
   */
  async processAudioFile(filePath, options = {}) {
    try {
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes. Maximum allowed: ${this.maxFileSize} bytes`);
      }
      
      // Convert to required format for ElevenLabs (MP3, mono, 22kHz)
      const processedPath = filePath.replace('.mp3', '_processed.mp3');
      
      const ffmpegCommand = `ffmpeg -i "${filePath}" ` +
                           `-ac 1 ` + // Convert to mono
                           `-ar 22050 ` + // Sample rate 22kHz
                           `-b:a 128k ` + // Bitrate 128k
                           `-y "${processedPath}"`; // Overwrite output
      
      await execAsync(ffmpegCommand);
      
      // Verify processed file
      const processedStats = await fs.stat(processedPath);
      
      return {
        originalPath: filePath,
        processedPath: processedPath,
        originalSize: stats.size,
        processedSize: processedStats.size
      };
      
    } catch (error) {
      console.error('Error processing audio file:', error);
      throw error;
    }
  }
  
  /**
   * Create voice profile from audio samples
   */
  async createVoiceProfile(name, description, audioFiles, options = {}) {
    try {
      // Create form data for multipart upload
      const form = new FormData();
      form.append('name', name);
      form.append('description', description || `Voice cloned on ${new Date().toISOString()}`);
      
      // Add labels if provided
      if (options.labels) {
        Object.entries(options.labels).forEach(([key, value]) => {
          form.append(`labels[${key}]`, value);
        });
      }
      
      // Add audio files
      for (let i = 0; i < audioFiles.length; i++) {
        const audioBuffer = await fs.readFile(audioFiles[i]);
        form.append('files', audioBuffer, {
          filename: `sample_${i + 1}.mp3`,
          contentType: 'audio/mpeg'
        });
      }
      
      // Make API request to ElevenLabs
      const response = await axios.post(
        `${this.baseUrl}/voices/add`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'xi-api-key': this.apiKey
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );
      
      const voice = response.data;
      
      // Store in database
      await this.storeVoiceProfile({
        voice_id: voice.voice_id,
        name: name,
        description: description,
        labels: options.labels || {},
        preview_url: voice.preview_url,
        created_at: new Date().toISOString()
      });
      
      // Cache the voice profile
      this.voiceCache.set(voice.voice_id, voice);
      
      return voice;
      
    } catch (error) {
      console.error('Error creating voice profile:', error.response?.data || error);
      
      if (error.response?.status === 402) {
        throw new Error('Insufficient credits for voice cloning. Please upgrade your ElevenLabs plan.');
      }
      
      throw error;
    }
  }
  
  /**
   * Clone voice from URL
   */
  async cloneVoiceFromUrl(url, voiceName, options = {}) {
    let audioInfo = null;
    let processedAudio = null;
    const userId = options.userId;
    
    try {
      // Emit progress: Starting
      if (userId) {
        emitVoiceCloneProgress(userId, {
          status: 'starting',
          stage: 'initialization',
          progress: 0,
          message: 'Starting voice cloning process...'
        });
      }
      
      // Extract audio from URL
      if (userId) {
        emitVoiceCloneProgress(userId, {
          status: 'extracting',
          stage: 'download',
          progress: 10,
          message: 'Extracting audio from URL...'
        });
      }
      audioInfo = await this.extractAudioFromUrl(url, options);
      
      // Emit milestone: Audio extracted
      if (userId) {
        emitTrainingMilestone({
          userId,
          milestone: 'audio_extracted',
          details: {
            title: audioInfo.title,
            duration: audioInfo.duration,
            fileSize: audioInfo.fileSize
          }
        });
        
        emitVoiceCloneProgress(userId, {
          status: 'processing',
          stage: 'audio_processing',
          progress: 40,
          message: 'Processing audio file...'
        });
      }
      
      // Process audio file
      processedAudio = await this.processAudioFile(audioInfo.filePath, options);
      
      if (userId) {
        emitVoiceCloneProgress(userId, {
          status: 'creating_profile',
          stage: 'voice_creation',
          progress: 70,
          message: 'Creating voice profile with ElevenLabs...'
        });
      }
      
      // Create voice profile
      const voice = await this.createVoiceProfile(
        voiceName || audioInfo.title || 'Cloned Voice',
        options.description || `Voice cloned from: ${audioInfo.title}`,
        [processedAudio.processedPath],
        {
          labels: {
            source: 'url_clone',
            platform: new URL(url).hostname,
            ...options.labels
          }
        }
      );
      
      // Emit completion
      if (userId) {
        emitVoiceCloneProgress(userId, {
          status: 'completed',
          stage: 'finished',
          progress: 100,
          message: 'Voice cloning completed successfully!',
          voiceId: voice.voice_id,
          voiceName: voice.name
        });
        
        emitTrainingMilestone({
          userId,
          milestone: 'voice_clone_completed',
          details: {
            voiceId: voice.voice_id,
            voiceName: voice.name,
            sourceUrl: url
          }
        });
      }
      
      return {
        success: true,
        voice: voice,
        metadata: {
          sourceUrl: url,
          title: audioInfo.title,
          duration: audioInfo.duration,
          uploader: audioInfo.uploader
        }
      };
      
    } catch (error) {
      console.error('Error cloning voice from URL:', error);
      
      // Emit error
      if (userId) {
        emitVoiceCloneProgress(userId, {
          status: 'error',
          stage: 'error',
          progress: 0,
          message: `Voice cloning failed: ${error.message}`,
          error: error.message
        });
      }
      
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error
      };
      
    } finally {
      // Cleanup temporary files
      if (audioInfo?.filePath) {
        try {
          await fs.unlink(audioInfo.filePath);
        } catch (e) {
          console.error('Error deleting temp file:', e);
        }
      }
      
      if (processedAudio?.processedPath) {
        try {
          await fs.unlink(processedAudio.processedPath);
        } catch (e) {
          console.error('Error deleting processed file:', e);
        }
      }
    }
  }
  
  /**
   * Store voice profile in database
   */
  async storeVoiceProfile(voiceData) {
    try {
      const { data, error } = await supabase
        .from('voices')
        .insert({
          voice_id: voiceData.voice_id,
          name: voiceData.name,
          description: voiceData.description,
          labels: voiceData.labels,
          preview_url: voiceData.preview_url,
          provider: 'elevenlabs',
          settings: voiceData.settings || {},
          metadata: voiceData.metadata || {},
          is_active: true
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error storing voice profile:', error);
        throw error;
      }
      
      return data;
      
    } catch (error) {
      console.error('Database error:', error);
      throw error;
    }
  }
  
  /**
   * Get voice profile from cache or database
   */
  async getVoiceProfile(voiceId) {
    // Check cache first
    const cached = this.voiceCache.get(voiceId);
    if (cached) {
      return cached;
    }
    
    try {
      // Check database
      const { data: dbVoice, error: dbError } = await supabase
        .from('voices')
        .select('*')
        .eq('voice_id', voiceId)
        .single();
      
      if (dbError) {
        throw dbError;
      }
      
      if (dbVoice) {
        // Get latest info from ElevenLabs
        const response = await axios.get(
          `${this.baseUrl}/voices/${voiceId}`,
          {
            headers: {
              'xi-api-key': this.apiKey
            }
          }
        );
        
        const voice = response.data;
        
        // Update cache
        this.voiceCache.set(voiceId, voice);
        
        return voice;
      }
      
      return null;
      
    } catch (error) {
      console.error('Error getting voice profile:', error);
      throw error;
    }
  }
  
  /**
   * List all voice profiles
   */
  async listVoiceProfiles(options = {}) {
    try {
      // Get from database
      let query = supabase
        .from('voices')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const { data: voices, error } = await query;
      
      if (error) {
        throw error;
      }
      
      return voices;
      
    } catch (error) {
      console.error('Error listing voice profiles:', error);
      throw error;
    }
  }
  
  /**
   * Delete voice profile
   */
  async deleteVoiceProfile(voiceId) {
    try {
      // Delete from ElevenLabs
      await axios.delete(
        `${this.baseUrl}/voices/${voiceId}`,
        {
          headers: {
            'xi-api-key': this.apiKey
          }
        }
      );
      
      // Mark as inactive in database
      const { error } = await supabase
        .from('voices')
        .update({ is_active: false })
        .eq('voice_id', voiceId);
      
      if (error) {
        throw error;
      }
      
      // Remove from cache
      this.voiceCache.del(voiceId);
      
      return { success: true };
      
    } catch (error) {
      console.error('Error deleting voice profile:', error);
      throw error;
    }
  }
  
  /**
   * Update voice profile settings
   */
  async updateVoiceSettings(voiceId, settings) {
    try {
      // Update in database
      const { data, error } = await supabase
        .from('voices')
        .update({ 
          settings: settings,
          updated_at: new Date().toISOString()
        })
        .eq('voice_id', voiceId)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      // Clear cache to force refresh
      this.voiceCache.del(voiceId);
      
      return data;
      
    } catch (error) {
      console.error('Error updating voice settings:', error);
      throw error;
    }
  }
  
  /**
   * Clean up old temporary files
   */
  async cleanupTempFiles(olderThanHours = 24) {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = olderThanHours * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Deleted old temp file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
}

export default VoiceCloningService;