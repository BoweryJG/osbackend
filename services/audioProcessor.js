import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { createWriteStream, createReadStream } from 'fs';
import wav from 'wav';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdtemp = promisify(fs.mkdtemp);

/**
 * Convert μ-law 8kHz audio to PCM 16kHz WAV format
 * This is required for OpenAI Whisper API
 */
export class AudioProcessor {
  constructor() {
    this.tempDir = null;
  }

  async initialize() {
    // Create a temporary directory for audio files
    const tmpDir = process.env.TMPDIR || '/tmp';
    this.tempDir = await mkdtemp(path.join(tmpDir, 'audio-'));
    console.log('[AudioProcessor] Initialized with temp dir:', this.tempDir);
  }

  /**
   * Convert μ-law buffer to PCM WAV file suitable for Whisper
   * @param {Buffer} mulawBuffer - The μ-law encoded audio buffer
   * @param {string} sessionId - Unique identifier for this audio session
   * @returns {Promise<string>} - Path to the converted WAV file
   */
  async convertMulawToWav(mulawBuffer, sessionId) {
    if (!this.tempDir) {
      await this.initialize();
    }

    const inputPath = path.join(this.tempDir, `${sessionId}_input.raw`);
    const outputPath = path.join(this.tempDir, `${sessionId}_output.wav`);

    try {
      // Write the μ-law buffer to a temporary file
      await writeFile(inputPath, mulawBuffer);

      // Convert using ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .inputOptions([
            '-f mulaw',     // Input format is μ-law
            '-ar 8000',     // Sample rate 8kHz (Twilio default)
            '-ac 1'         // Mono channel
          ])
          .outputOptions([
            '-ar 16000',    // Output sample rate 16kHz (Whisper optimal)
            '-ac 1',        // Mono channel
            '-c:a pcm_s16le' // PCM 16-bit little-endian
          ])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      return outputPath;
    } catch (error) {
      // Clean up on error
      await this.cleanup(inputPath, outputPath);
      throw error;
    }
  }

  /**
   * Convert μ-law buffer to PCM buffer (without file I/O)
   * @param {Buffer} mulawBuffer - The μ-law encoded audio buffer
   * @returns {Buffer} - PCM encoded audio buffer
   */
  convertMulawToPCMBuffer(mulawBuffer) {
    const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulaw = mulawBuffer[i];
      const pcm = this.mulawToPCM(mulaw);
      pcmBuffer.writeInt16LE(pcm, i * 2);
    }
    
    return pcmBuffer;
  }

  /**
   * Convert a single μ-law sample to PCM
   * @param {number} mulaw - μ-law encoded sample
   * @returns {number} - PCM sample
   */
  mulawToPCM(mulaw) {
    const BIAS = 0x84;
    const CLIP = 32635;
    
    // Invert bits
    mulaw = ~mulaw;
    
    // Extract sign, exponent, and mantissa
    const sign = mulaw & 0x80;
    const exponent = (mulaw & 0x70) >> 4;
    const mantissa = mulaw & 0x0F;
    
    // Compute sample
    let sample = ((mantissa << 3) + BIAS) << (exponent + 2);
    
    // Handle sign
    if (sign === 0) {
      sample = -sample;
    }
    
    // Clip to valid range
    if (sample > CLIP) sample = CLIP;
    if (sample < -CLIP) sample = -CLIP;
    
    return sample;
  }

  /**
   * Create a WAV file from PCM buffer
   * @param {Buffer} pcmBuffer - PCM audio buffer
   * @param {string} outputPath - Path to save the WAV file
   * @param {number} sampleRate - Sample rate (default: 16000)
   * @returns {Promise<string>} - Path to the WAV file
   */
  async createWavFile(pcmBuffer, outputPath, sampleRate = 16000) {
    return new Promise((resolve, reject) => {
      const writer = new wav.FileWriter(outputPath, {
        channels: 1,
        sampleRate: sampleRate,
        bitDepth: 16
      });

      writer.on('error', reject);
      writer.on('finish', () => resolve(outputPath));

      // Write PCM data
      writer.write(pcmBuffer);
      writer.end();
    });
  }

  /**
   * Clean up temporary files
   * @param {...string} filePaths - Paths to files to delete
   */
  async cleanup(...filePaths) {
    for (const filePath of filePaths) {
      try {
        if (filePath && fs.existsSync(filePath)) {
          await unlink(filePath);
        }
      } catch (error) {
        console.error(`[AudioProcessor] Failed to delete ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Clean up all temporary files and directory
   */
  async cleanupAll() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          await unlink(path.join(this.tempDir, file));
        }
        fs.rmdirSync(this.tempDir);
        console.log('[AudioProcessor] Cleaned up temp directory');
      } catch (error) {
        console.error('[AudioProcessor] Failed to cleanup temp directory:', error.message);
      }
    }
  }
}

// Export singleton instance
export const audioProcessor = new AudioProcessor();