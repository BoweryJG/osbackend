import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import voiceConversationPipeline from '../services/voiceConversationPipeline.js';
import twilioConferenceService from '../services/twilioConferenceService.js';
import realtimeCallAnalyzer from '../services/realtimeCallAnalyzer.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get voice session status
router.get('/sessions/:sessionId/status', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    
    const session = await supabase
      .from('agent_voice_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();
    
    if (!session.data) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get pipeline status
    const pipelineStatus = await voiceConversationPipeline.getSessionStatus(sessionId);
    
    res.json({
      session: session.data,
      pipeline: pipelineStatus,
      metrics: {
        duration: session.data.duration_seconds,
        transcriptionAccuracy: session.data.transcription_accuracy,
        agentResponseTime: session.data.avg_response_time_ms
      }
    });
    
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Get session transcript
router.get('/sessions/:sessionId/transcript', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const session = await supabase
      .from('agent_voice_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();
    
    if (!session.data) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get transcript
    const transcript = await supabase
      .from('voice_transcripts')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    
    res.json({ 
      sessionId,
      transcript: transcript.data || [],
      totalTurns: transcript.data?.length || 0
    });
    
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// Test microphone and audio setup
router.post('/test-audio', authenticateToken, async (req, res) => {
  try {
    const { audioData } = req.body; // Base64 encoded audio
    
    // Test Deepgram connection
    const deepgramTest = await voiceConversationPipeline.testDeepgramConnection(audioData);
    
    // Test ElevenLabs
    const testText = "Testing audio connection. Can you hear me clearly?";
    const elevenLabsTest = await voiceConversationPipeline.testElevenLabs(testText);
    
    res.json({
      deepgram: {
        connected: deepgramTest.connected,
        transcript: deepgramTest.transcript,
        confidence: deepgramTest.confidence
      },
      elevenLabs: {
        connected: elevenLabsTest.connected,
        audioGenerated: elevenLabsTest.audioLength > 0
      },
      webrtc: {
        stunServers: ['stun:stun.l.google.com:19302'],
        turnServers: process.env.TURN_SERVER ? ['turn:turn.example.com'] : []
      }
    });
    
  } catch (error) {
    console.error('Error testing audio:', error);
    res.status(500).json({ error: 'Audio test failed' });
  }
});

// Get available agents with voice capabilities
router.get('/agents/voice-enabled', authenticateToken, async (req, res) => {
  try {
    const agents = await supabase
      .from('unified_agents')
      .select(`
        *,
        agent_voice_profiles!inner(*)
      `)
      .eq('is_active', true)
      .not('agent_voice_profiles.elevenlabs_voice_id', 'is', null);
    
    res.json({ 
      agents: agents.data || [],
      total: agents.data?.length || 0
    });
    
  } catch (error) {
    console.error('Error getting voice agents:', error);
    res.status(500).json({ error: 'Failed to get voice agents' });
  }
});

// Voice coaching session (for whisper feature)
router.post('/coaching/start', authenticateToken, async (req, res) => {
  try {
    const { repPhone, clientPhone } = req.body;
    const coachId = req.user.id;
    
    // Create Twilio conference with whisper
    const conference = await twilioConferenceService.createCoachingConference(
      repPhone,
      clientPhone,
      coachId
    );
    
    // Start real-time analysis
    const analyzer = await realtimeCallAnalyzer.startAnalysis({
      conferenceId: conference.sid,
      coachId,
      repPhone
    });
    
    res.json({
      conferenceId: conference.sid,
      conferenceName: conference.friendlyName,
      coachingChannel: conference.coachingChannel,
      analysisId: analyzer.id,
      dialInNumber: conference.dialInNumber,
      instructions: 'Dial the number to join as coach. You can whisper to the rep without the client hearing.'
    });
    
  } catch (error) {
    console.error('Error starting coaching session:', error);
    res.status(500).json({ error: 'Failed to start coaching session' });
  }
});

export default router;