#!/usr/bin/env node

import io from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BackendAPIAgent {
  constructor() {
    this.agentId = 'backend-api';
    this.socket = null;
    this.progress = 0;
    this.currentTask = null;
  }
  
  async connect() {
    this.socket = io(`http://localhost:${process.env.ORCHESTRATOR_PORT || 9090}`);
    
    this.socket.on('connect', () => {
      console.log('Connected to orchestrator');
      this.socket.emit('agent:register', {
        agentId: this.agentId,
        type: 'backend-api',
        capabilities: ['api-routes', 'voice-endpoints', 'typescript-generation']
      });
    });
    
    this.socket.on('task-reassign', async (data) => {
      if (data.task === 'generate-typescript-types') {
        await this.generateTypeScriptTypes();
      }
    });
    
    this.socket.on('shutdown', () => {
      console.log('Shutdown signal received');
      process.exit(0);
    });
  }
  
  reportProgress(task, progress, eta) {
    this.currentTask = task;
    this.progress = progress;
    this.socket.emit('progress', {
      agentId: this.agentId,
      task,
      progress,
      eta
    });
  }
  
  async completeVoiceSessionEndpoint() {
    console.log('📝 Implementing voice session endpoint...');
    this.reportProgress('voice-session-endpoint', 10, '30 minutes');
    
    const routesPath = path.join(__dirname, '../routes/repconnectRoutes.js');
    const routesContent = await fs.readFile(routesPath, 'utf8');
    
    // Find the placeholder comment and add implementation
    const voiceEndpointCode = `
// Complete voice session initialization
router.post('/agents/:agentId/start-voice-session', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    
    // Get agent details
    const agent = await agentCore.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Initialize Deepgram connection
    const deepgramConfig = {
      apiKey: process.env.DEEPGRAM_API_KEY,
      model: 'nova-2',
      language: 'en-US',
      punctuate: true,
      diarize: true,
      utterances: true
    };
    
    // Create WebRTC session tokens
    const sessionId = \`voice-\${userId}-\${agentId}-\${Date.now()}\`;
    const rtcTokens = {
      sessionId,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      userId,
      agentId
    };
    
    // Setup agent voice profile
    const voiceProfile = await supabase
      .from('agent_voice_profiles')
      .select('*')
      .eq('agent_id', agentId)
      .single();
    
    if (!voiceProfile.data) {
      return res.status(404).json({ error: 'Agent voice profile not found' });
    }
    
    // Initialize voice conversation pipeline
    const pipeline = await voiceConversationPipeline.createSession({
      sessionId,
      userId,
      agentId,
      voiceSettings: voiceProfile.data.voice_settings,
      deepgramConfig,
      elevenLabsVoiceId: voiceProfile.data.elevenlabs_voice_id
    });
    
    // Store session in database
    await supabase.from('agent_voice_sessions').insert({
      id: sessionId,
      agent_id: agentId,
      user_id: userId,
      status: 'active',
      webrtc_tokens: rtcTokens,
      voice_settings: voiceProfile.data.voice_settings,
      started_at: new Date()
    });
    
    res.json({
      sessionId,
      rtcTokens,
      deepgramConfig: {
        model: deepgramConfig.model,
        language: deepgramConfig.language
      },
      voiceProfile: {
        voice_id: voiceProfile.data.elevenlabs_voice_id,
        voice_name: voiceProfile.data.voice_name,
        settings: voiceProfile.data.voice_settings
      },
      websocketUrl: \`\${process.env.SITE_URL}/voice-agents\`
    });
    
  } catch (error) {
    console.error('Error starting voice session:', error);
    res.status(500).json({ error: 'Failed to start voice session' });
  }
});

// End voice session
router.post('/agents/:agentId/end-voice-session', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;
    
    // Verify ownership
    const session = await supabase
      .from('agent_voice_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();
    
    if (!session.data) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // End the voice pipeline
    await voiceConversationPipeline.endSession(sessionId);
    
    // Update session status
    await supabase
      .from('agent_voice_sessions')
      .update({
        status: 'ended',
        ended_at: new Date(),
        duration_seconds: Math.floor((Date.now() - new Date(session.data.started_at).getTime()) / 1000)
      })
      .eq('id', sessionId);
    
    res.json({ 
      message: 'Voice session ended',
      sessionId,
      duration: Math.floor((Date.now() - new Date(session.data.started_at).getTime()) / 1000)
    });
    
  } catch (error) {
    console.error('Error ending voice session:', error);
    res.status(500).json({ error: 'Failed to end voice session' });
  }
});`;
    
    // Insert after the existing placeholder
    const updatedRoutes = routesContent.replace(
      '// Voice session endpoint (placeholder)',
      voiceEndpointCode
    );
    
    await fs.writeFile(routesPath, updatedRoutes);
    this.reportProgress('voice-session-endpoint', 50, '15 minutes');
    
    // Create voice-specific routes file
    await this.createVoiceRoutes();
    
    this.reportProgress('voice-session-endpoint', 100, '0 minutes');
    this.socket.emit('task:complete', {
      agentId: this.agentId,
      taskId: 'voice-session-endpoint'
    });
  }
  
  async createVoiceRoutes() {
    console.log('📝 Creating dedicated voice routes...');
    this.reportProgress('voice-routes', 10, '20 minutes');
    
    const voiceRoutesContent = `import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
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
      .select(\`
        *,
        agent_voice_profiles!inner(*)
      \`)
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

export default router;`;
    
    await fs.writeFile(
      path.join(__dirname, '../routes/voiceRoutes.js'),
      voiceRoutesContent
    );
    
    this.reportProgress('voice-routes', 100, '0 minutes');
    this.socket.emit('task:complete', {
      agentId: this.agentId,
      taskId: 'voice-routes'
    });
  }
  
  async generateTypeScriptTypes() {
    console.log('📝 Generating TypeScript types for frontend...');
    
    const typesContent = `// Voice Session Types
export interface VoiceSession {
  sessionId: string;
  agentId: string;
  userId: string;
  status: 'active' | 'ended' | 'error';
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
}

export interface RTCTokens {
  sessionId: string;
  iceServers: RTCIceServer[];
  userId: string;
  agentId: string;
}

export interface VoiceProfile {
  voice_id: string;
  voice_name: string;
  settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

export interface DeepgramConfig {
  model: string;
  language: string;
  punctuate?: boolean;
  diarize?: boolean;
  utterances?: boolean;
}

export interface StartVoiceSessionResponse {
  sessionId: string;
  rtcTokens: RTCTokens;
  deepgramConfig: DeepgramConfig;
  voiceProfile: VoiceProfile;
  websocketUrl: string;
}

export interface AudioTestResponse {
  deepgram: {
    connected: boolean;
    transcript?: string;
    confidence?: number;
  };
  elevenLabs: {
    connected: boolean;
    audioGenerated: boolean;
  };
  webrtc: {
    stunServers: string[];
    turnServers: string[];
  };
}

export interface CoachingSession {
  conferenceId: string;
  conferenceName: string;
  coachingChannel: string;
  analysisId: string;
  dialInNumber: string;
  instructions: string;
}`;
    
    // Save to shared location
    await fs.writeFile(
      path.join(__dirname, '../shared/voice-types.ts'),
      typesContent
    );
    
    // Notify frontend agent
    this.socket.emit('types-generated', {
      location: '../shared/voice-types.ts'
    });
  }
  
  async execute() {
    await this.connect();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start main tasks
    await this.completeVoiceSessionEndpoint();
    
    // Continue working on other tasks
    console.log('✅ Backend API Agent: All tasks completed');
  }
}

// Run the agent
const agent = new BackendAPIAgent();
agent.execute().catch(console.error);