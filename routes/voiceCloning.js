import express from 'express';
import { VoiceCloningService } from '../services/voiceCloningService.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();
const voiceCloningService = new VoiceCloningService();

// Configure multer for file uploads
const upload = multer({
  dest: 'temp/uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

/**
 * Clone voice from URL
 * POST /api/voice-cloning/clone-from-url
 */
router.post('/clone-from-url', authenticateToken, async (req, res) => {
  try {
    const { url, name, description, labels } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Clone voice
    const result = await voiceCloningService.cloneVoiceFromUrl(url, name, {
      description,
      labels,
      userId: req.user.id
    });
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        details: result.details 
      });
    }
    
    res.json({
      success: true,
      voice: result.voice,
      metadata: result.metadata
    });
    
  } catch (error) {
    console.error('Voice cloning error:', error);
    res.status(500).json({ 
      error: 'Failed to clone voice',
      message: error.message 
    });
  }
});

/**
 * Clone voice from uploaded files
 * POST /api/voice-cloning/clone-from-files
 */
router.post('/clone-from-files', authenticateToken, upload.array('audioFiles', 5), async (req, res) => {
  const uploadedFiles = req.files || [];
  
  try {
    const { name, description, labels } = req.body;
    
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: 'No audio files provided' });
    }
    
    if (!name) {
      return res.status(400).json({ error: 'Voice name is required' });
    }
    
    // Process uploaded files
    const processedFiles = [];
    
    for (const file of uploadedFiles) {
      const processed = await voiceCloningService.processAudioFile(file.path);
      processedFiles.push(processed.processedPath);
    }
    
    // Create voice profile
    const voice = await voiceCloningService.createVoiceProfile(
      name,
      description,
      processedFiles,
      {
        labels: labels ? JSON.parse(labels) : {},
        userId: req.user.id
      }
    );
    
    res.json({
      success: true,
      voice: voice
    });
    
  } catch (error) {
    console.error('Voice cloning error:', error);
    res.status(500).json({ 
      error: 'Failed to clone voice',
      message: error.message 
    });
    
  } finally {
    // Cleanup uploaded files
    for (const file of uploadedFiles) {
      try {
        await fs.unlink(file.path);
      } catch (e) {
        console.error('Error deleting uploaded file:', e);
      }
    }
  }
});

/**
 * Get voice profile
 * GET /api/voice-cloning/voices/:voiceId
 */
router.get('/voices/:voiceId', authenticateToken, async (req, res) => {
  try {
    const { voiceId } = req.params;
    
    const voice = await voiceCloningService.getVoiceProfile(voiceId);
    
    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }
    
    res.json(voice);
    
  } catch (error) {
    console.error('Error getting voice:', error);
    res.status(500).json({ 
      error: 'Failed to get voice profile',
      message: error.message 
    });
  }
});

/**
 * List voice profiles
 * GET /api/voice-cloning/voices
 */
router.get('/voices', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const voices = await voiceCloningService.listVoiceProfiles({
      limit: parseInt(limit),
      offset: parseInt(offset),
      userId: req.user.id
    });
    
    res.json({
      voices: voices,
      total: voices.length
    });
    
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json({ 
      error: 'Failed to list voices',
      message: error.message 
    });
  }
});

/**
 * Update voice settings
 * PUT /api/voice-cloning/voices/:voiceId/settings
 */
router.put('/voices/:voiceId/settings', authenticateToken, async (req, res) => {
  try {
    const { voiceId } = req.params;
    const { settings } = req.body;
    
    if (!settings) {
      return res.status(400).json({ error: 'Settings are required' });
    }
    
    const updated = await voiceCloningService.updateVoiceSettings(voiceId, settings);
    
    res.json({
      success: true,
      voice: updated
    });
    
  } catch (error) {
    console.error('Error updating voice settings:', error);
    res.status(500).json({ 
      error: 'Failed to update voice settings',
      message: error.message 
    });
  }
});

/**
 * Delete voice profile
 * DELETE /api/voice-cloning/voices/:voiceId
 */
router.delete('/voices/:voiceId', authenticateToken, async (req, res) => {
  try {
    const { voiceId } = req.params;
    
    const result = await voiceCloningService.deleteVoiceProfile(voiceId);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error deleting voice:', error);
    res.status(500).json({ 
      error: 'Failed to delete voice',
      message: error.message 
    });
  }
});

/**
 * Extract audio from URL (preview)
 * POST /api/voice-cloning/extract-audio
 */
router.post('/extract-audio', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const audioInfo = await voiceCloningService.extractAudioFromUrl(url);
    
    res.json({
      success: true,
      info: {
        title: audioInfo.title,
        duration: audioInfo.duration,
        uploader: audioInfo.uploader,
        fileSize: audioInfo.fileSize
      }
    });
    
    // Cleanup the extracted file
    try {
      await fs.unlink(audioInfo.filePath);
    } catch (e) {
      console.error('Error deleting temp file:', e);
    }
    
  } catch (error) {
    console.error('Error extracting audio:', error);
    res.status(500).json({ 
      error: 'Failed to extract audio',
      message: error.message 
    });
  }
});

export default router;