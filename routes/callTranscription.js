import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { authenticateUser } from '../auth.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

const router = express.Router();

// Store reference to the call transcription service (will be set from index.js)
let callTranscriptionService = null;

export function setCallTranscriptionService(service) {
  callTranscriptionService = service;
}

// Start transcription for a call
router.post('/calls/:callSid/transcription/start', authenticateUser, async (req, res) => {
  try {
    const { callSid } = req.params;
    const { metadata } = req.body;
    
    if (!callTranscriptionService) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Call transcription service not available', null, 503));
    }
    
    // Check if transcription is already active
    const activeTranscription = callTranscriptionService.getActiveTranscription(callSid);
    if (activeTranscription) {
      return res.json(successResponse({
        transcription: {
          callSid,
          status: activeTranscription.status,
          startTime: activeTranscription.startTime,
          currentLength: activeTranscription.transcription.length
        }
      }, 'Transcription already active'));
    }
    
    // Verify the call exists and belongs to the user
    if (supabase) {
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('*')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Call not found', null, 404));
      }
      
      // Check if user has permission (owns the call or is admin)
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(errorResponse('UNAUTHORIZED', 'Unauthorized to access this call', null, 403));
      }
    }
    
    // Start the transcription session
    await callTranscriptionService.startTranscriptionSession(callSid, {
      ...metadata,
      userId: req.user.id,
      initiatedBy: 'api'
    });
    
    res.json(successResponse({
      transcription: {
        callSid,
        status: 'active',
        startTime: new Date()
      }
    }, 'Transcription started'));
    
  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json(errorResponse('TRANSCRIPTION_START_ERROR', 'Failed to start transcription', error.message, 500));
  }
});

// Get current transcription for a call
router.get('/calls/:callSid/transcription', authenticateUser, async (req, res) => {
  try {
    const { callSid } = req.params;
    const { includePartial = false } = req.query;
    
    // First check active transcriptions
    if (callTranscriptionService) {
      const activeTranscription = callTranscriptionService.getActiveTranscription(callSid);
      if (activeTranscription) {
        return res.json(successResponse({
          transcription: {
            callSid,
            status: activeTranscription.status,
            text: activeTranscription.transcription,
            startTime: activeTranscription.startTime,
            partialTranscriptions: includePartial === 'true' ? activeTranscription.partialTranscriptions : undefined,
            isLive: true
          }
        }));
      }
    }
    
    // If not active, check database
    if (supabase) {
      const { data, error } = await supabase
        .from('call_transcriptions')
        .select('*')
        .eq('call_sid', callSid)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'No transcription found for this call', null, 404));
      }
      
      const transcription = data[0];
      
      // Verify user has permission
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('user_id')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Call not found', null, 404));
      }
      
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(errorResponse('UNAUTHORIZED', 'Unauthorized to access this transcription', null, 403));
      }
      
      res.json(successResponse({
        transcription: {
          id: transcription.id,
          callSid: transcription.call_sid,
          status: transcription.status,
          text: transcription.transcription,
          startTime: transcription.started_at,
          endTime: transcription.ended_at,
          duration: transcription.duration_seconds,
          partialTranscriptions: includePartial === 'true' ? transcription.partial_transcriptions : undefined,
          isLive: false
        }
      }));
    } else {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database not available', null, 503));
    }
    
  } catch (error) {
    console.error('Error getting transcription:', error);
    res.status(500).json(errorResponse('TRANSCRIPTION_GET_ERROR', 'Failed to get transcription', error.message, 500));
  }
});

// Stop transcription for a call
router.post('/calls/:callSid/transcription/stop', authenticateUser, async (req, res) => {
  try {
    const { callSid } = req.params;
    
    if (!callTranscriptionService) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Call transcription service not available', null, 503));
    }
    
    // Check if transcription is active
    const activeTranscription = callTranscriptionService.getActiveTranscription(callSid);
    if (!activeTranscription) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'No active transcription found for this call', null, 404));
    }
    
    // Verify user has permission
    if (supabase) {
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('user_id')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Call not found', null, 404));
      }
      
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(errorResponse('UNAUTHORIZED', 'Unauthorized to stop this transcription', null, 403));
      }
    }
    
    // Stop the transcription
    await callTranscriptionService.stopTranscriptionSession(callSid);
    
    res.json(successResponse({
      transcription: {
        callSid,
        status: 'completed',
        endTime: new Date()
      }
    }, 'Transcription stopped'));
    
  } catch (error) {
    console.error('Error stopping transcription:', error);
    res.status(500).json(errorResponse('TRANSCRIPTION_STOP_ERROR', 'Failed to stop transcription', error.message, 500));
  }
});

// Get all active transcriptions (admin only)
router.get('/transcriptions/active', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json(errorResponse('UNAUTHORIZED', 'Admin access required', null, 403));
    }
    
    if (!callTranscriptionService) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Call transcription service not available', null, 503));
    }
    
    const activeTranscriptions = callTranscriptionService.getAllActiveTranscriptions();
    
    res.json(successResponse({
      transcriptions: activeTranscriptions,
      count: activeTranscriptions.length
    }));
    
  } catch (error) {
    console.error('Error getting active transcriptions:', error);
    res.status(500).json(errorResponse('TRANSCRIPTIONS_GET_ERROR', 'Failed to get active transcriptions', error.message, 500));
  }
});

// Get transcription history for a user
router.get('/transcriptions', authenticateUser, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;
    
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database not available', null, 503));
    }
    
    // Build query
    let query = supabase
      .from('call_transcriptions')
      .select(`
        *,
        twilio_calls!inner(
          call_sid,
          from_number,
          to_number,
          direction,
          user_id
        )
      `)
      .eq('twilio_calls.user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    res.json(successResponse({
      transcriptions: data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      }
    }));
    
  } catch (error) {
    console.error('Error getting transcription history:', error);
    res.status(500).json(errorResponse('TRANSCRIPTION_HISTORY_ERROR', 'Failed to get transcription history', error.message, 500));
  }
});

export default router;