import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../auth.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
      return res.status(503).json({
        success: false,
        error: 'Call transcription service not available'
      });
    }
    
    // Check if transcription is already active
    const activeTranscription = callTranscriptionService.getActiveTranscription(callSid);
    if (activeTranscription) {
      return res.json({
        success: true,
        message: 'Transcription already active',
        transcription: {
          callSid,
          status: activeTranscription.status,
          startTime: activeTranscription.startTime,
          currentLength: activeTranscription.transcription.length
        }
      });
    }
    
    // Verify the call exists and belongs to the user
    if (supabase) {
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('*')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      
      // Check if user has permission (owns the call or is admin)
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to access this call'
        });
      }
    }
    
    // Start the transcription session
    await callTranscriptionService.startTranscriptionSession(callSid, {
      ...metadata,
      userId: req.user.id,
      initiatedBy: 'api'
    });
    
    res.json({
      success: true,
      message: 'Transcription started',
      transcription: {
        callSid,
        status: 'active',
        startTime: new Date()
      }
    });
    
  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start transcription',
      details: error.message
    });
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
        return res.json({
          success: true,
          transcription: {
            callSid,
            status: activeTranscription.status,
            text: activeTranscription.transcription,
            startTime: activeTranscription.startTime,
            partialTranscriptions: includePartial === 'true' ? activeTranscription.partialTranscriptions : undefined,
            isLive: true
          }
        });
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
        return res.status(404).json({
          success: false,
          error: 'No transcription found for this call'
        });
      }
      
      const transcription = data[0];
      
      // Verify user has permission
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('user_id')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to access this transcription'
        });
      }
      
      res.json({
        success: true,
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
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
  } catch (error) {
    console.error('Error getting transcription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transcription',
      details: error.message
    });
  }
});

// Stop transcription for a call
router.post('/calls/:callSid/transcription/stop', authenticateUser, async (req, res) => {
  try {
    const { callSid } = req.params;
    
    if (!callTranscriptionService) {
      return res.status(503).json({
        success: false,
        error: 'Call transcription service not available'
      });
    }
    
    // Check if transcription is active
    const activeTranscription = callTranscriptionService.getActiveTranscription(callSid);
    if (!activeTranscription) {
      return res.status(404).json({
        success: false,
        error: 'No active transcription found for this call'
      });
    }
    
    // Verify user has permission
    if (supabase) {
      const { data: callData, error: callError } = await supabase
        .from('twilio_calls')
        .select('user_id')
        .eq('call_sid', callSid)
        .single();
      
      if (callError || !callData) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      
      if (callData.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to stop this transcription'
        });
      }
    }
    
    // Stop the transcription
    await callTranscriptionService.stopTranscriptionSession(callSid);
    
    res.json({
      success: true,
      message: 'Transcription stopped',
      transcription: {
        callSid,
        status: 'completed',
        endTime: new Date()
      }
    });
    
  } catch (error) {
    console.error('Error stopping transcription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop transcription',
      details: error.message
    });
  }
});

// Get all active transcriptions (admin only)
router.get('/transcriptions/active', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    if (!callTranscriptionService) {
      return res.status(503).json({
        success: false,
        error: 'Call transcription service not available'
      });
    }
    
    const activeTranscriptions = callTranscriptionService.getAllActiveTranscriptions();
    
    res.json({
      success: true,
      transcriptions: activeTranscriptions,
      count: activeTranscriptions.length
    });
    
  } catch (error) {
    console.error('Error getting active transcriptions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active transcriptions',
      details: error.message
    });
  }
});

// Get transcription history for a user
router.get('/transcriptions', authenticateUser, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;
    
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
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
    
    res.json({
      success: true,
      transcriptions: data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      }
    });
    
  } catch (error) {
    console.error('Error getting transcription history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transcription history',
      details: error.message
    });
  }
});

export default router;