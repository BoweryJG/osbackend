import path from 'path';
import fs from 'fs/promises';

import express from 'express';
import multer from 'multer';

import { VoiceCloningService } from '../services/voiceCloningService.js';
import { authenticateToken } from '../middleware/unifiedAuth.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

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
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'URL is required', null, 400));
    }
    
    // Clone voice
    const result = await voiceCloningService.cloneVoiceFromUrl(url, name, {
      description,
      labels,
      userId: req.user.id
    });
    
    if (!result.success) {
      return res.status(400).json(errorResponse('CLONE_FAILED', result.error, result.details, 400));
    }
    
    res.json(successResponse({
      voice: result.voice,
      metadata: result.metadata
    }, 'Voice cloned successfully'));
    
  } catch (error) {
    console.error('Voice cloning error:', error);
    res.status(500).json(errorResponse('CLONE_ERROR', 'Failed to clone voice', error.message, 500));
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
      return res.status(400).json(errorResponse('MISSING_FILES', 'No audio files provided', null, 400));
    }
    
    if (!name) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Voice name is required', null, 400));
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
    
    res.json(successResponse({ voice }, 'Voice cloned successfully from uploaded files'));
    
  } catch (error) {
    console.error('Voice cloning error:', error);
    res.status(500).json(errorResponse('CLONE_ERROR', 'Failed to clone voice', error.message, 500));
    
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
      return res.status(404).json(errorResponse('NOT_FOUND', 'Voice not found', null, 404));
    }
    
    res.json(successResponse(voice));
    
  } catch (error) {
    console.error('Error getting voice:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to get voice profile', error.message, 500));
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
    
    res.json(successResponse({
      voices: voices,
      total: voices.length
    }));
    
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to list voices', error.message, 500));
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
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Settings are required', null, 400));
    }
    
    const updated = await voiceCloningService.updateVoiceSettings(voiceId, settings);
    
    res.json(successResponse({ voice: updated }, 'Voice settings updated successfully'));
    
  } catch (error) {
    console.error('Error updating voice settings:', error);
    res.status(500).json(errorResponse('UPDATE_ERROR', 'Failed to update voice settings', error.message, 500));
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
    
    res.json(successResponse(result, 'Voice profile deleted successfully'));
    
  } catch (error) {
    console.error('Error deleting voice:', error);
    res.status(500).json(errorResponse('DELETE_ERROR', 'Failed to delete voice', error.message, 500));
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
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'URL is required', null, 400));
    }
    
    const audioInfo = await voiceCloningService.extractAudioFromUrl(url);
    
    res.json(successResponse({
      info: {
        title: audioInfo.title,
        duration: audioInfo.duration,
        uploader: audioInfo.uploader,
        fileSize: audioInfo.fileSize
      }
    }, 'Audio extracted successfully'));
    
    // Cleanup the extracted file
    try {
      await fs.unlink(audioInfo.filePath);
    } catch (e) {
      console.error('Error deleting temp file:', e);
    }
    
  } catch (error) {
    console.error('Error extracting audio:', error);
    res.status(500).json(errorResponse('EXTRACT_ERROR', 'Failed to extract audio', error.message, 500));
  }
});

export default router;