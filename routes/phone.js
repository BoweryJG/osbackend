import express from 'express';
import { createClient } from '@supabase/supabase-js';

import { authenticateUser } from '../auth.js';
import julieAI from '../services/julieAI.js';
import WebRTCVoiceService from '../services/webrtcVoiceService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize WebRTC Voice Service
const webrtcService = new WebRTCVoiceService();

// Initialize Supabase client - lazy loading to avoid initialization errors
let supabase = null;

const getSupabase = () => {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
};

// Health check route
router.get('/health', (req, res) => {
  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const hasVoipms = !!(process.env.VOIPMS_USERNAME && process.env.VOIPMS_API_PASSWORD);
  
  res.json(successResponse({
    status: 'ok',
    phone_system: 'available',
    default_method: 'webrtc',
    providers: {
      supabase: hasSupabase,
      twilio: hasTwilio,
      voipms: hasVoipms,
      webrtc: true
    }
  }));
});

// Middleware to check phone system configuration
const checkPhoneSystemConfig = (req, res, next) => {
  const sb = getSupabase();
  if (!sb) {
    return res.status(503).json(errorResponse(
      'SERVICE_UNAVAILABLE', 
      'Phone system not configured - Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables',
      null,
      503
    ));
  }
  next();
};

// Import phone services (these will be properly integrated later)
// For now, we'll implement basic functionality directly

// Phone Number Management
router.get('/phone-numbers', authenticateUser, checkPhoneSystemConfig, async (req, res) => {
  try {
    const { clientId } = req.query;
    const numbers = await phoneNumberService.getPhoneNumbers(clientId);
    res.json(successResponse(numbers));
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch phone numbers', error.message, 500));
  }
});

router.post('/phone-numbers/search', authenticateUser, checkPhoneSystemConfig, async (req, res) => {
  try {
    const { areaCode, numberType, pattern } = req.body;
    const availableNumbers = await phoneNumberService.searchAvailableNumbers({
      areaCode,
      numberType,
      pattern
    });
    res.json(successResponse(availableNumbers));
  } catch (error) {
    console.error('Error searching numbers:', error);
    res.status(500).json(errorResponse('SEARCH_ERROR', 'Failed to search numbers', error.message, 500));
  }
});

router.post('/phone-numbers/provision', authenticateUser, checkPhoneSystemConfig, async (req, res) => {
  try {
    const { clientId, phoneNumber, capabilities } = req.body;
    const provisionedNumber = await phoneNumberService.provisionNumber(
      clientId,
      phoneNumber,
      capabilities
    );
    res.json(successResponse(provisionedNumber, 'Phone number provisioned successfully'));
  } catch (error) {
    console.error('Error provisioning number:', error);
    res.status(500).json(errorResponse('PROVISION_ERROR', 'Failed to provision number', error.message, 500));
  }
});

// Call Management
router.post('/calls/initiate', authenticateUser, checkPhoneSystemConfig, async (req, res) => {
  try {
    const { from, to, recordCall } = req.body;
    const call = await twilioService.makeCall(from, to, { record: recordCall });
    
    // Log in database
    await getSupabase().from('call_logs').insert({
      call_sid: call.sid,
      from_number: from,
      to_number: to,
      direction: 'outbound',
      status: call.status,
      user_id: req.user.id
    });
    
    res.json(successResponse(call, 'Call initiated successfully'));
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json(errorResponse('CALL_ERROR', 'Failed to initiate call', error.message, 500));
  }
});

router.get('/calls/:callId', authenticateUser, async (req, res) => {
  try {
    const { callId } = req.params;
    const call = await twilioService.getCallDetails(callId);
    res.json(successResponse(call));
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch call details', error.message, 500));
  }
});

router.get('/calls/:callId/recording', authenticateUser, async (req, res) => {
  try {
    const { callId } = req.params;
    const recordings = await twilioService.getCallRecordings(callId);
    res.json(successResponse(recordings));
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch recording', error.message, 500));
  }
});

// SMS Management
router.post('/sms/send', authenticateUser, async (req, res) => {
  try {
    const { from, to, body } = req.body;
    const message = await twilioService.sendSMS(from, to, body);
    
    // Log in database
    await getSupabase().from('sms_messages').insert({
      message_sid: message.sid,
      from_number: from,
      to_number: to,
      body: body,
      direction: 'outbound',
      status: message.status,
      user_id: req.user.id
    });
    
    res.json(successResponse(message, 'SMS sent successfully'));
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json(errorResponse('SMS_ERROR', 'Failed to send SMS', error.message, 500));
  }
});

router.get('/sms/conversations', authenticateUser, async (req, res) => {
  try {
    const { phoneNumber } = req.query;
    
    const { data: conversations, error } = await getSupabase()
      .from('sms_conversations')
      .select(`
        *,
        messages:sms_messages(*)
      `)
      .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
      .order('last_message_at', { ascending: false });
      
    if (error) throw error;
    res.json(successResponse(conversations));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch conversations', error.message, 500));
  }
});

// Usage Tracking
router.get('/usage/summary', authenticateUser, async (req, res) => {
  try {
    const { clientId, startDate, endDate } = req.query;
    const summary = await usageService.getUsageSummary(clientId, startDate, endDate);
    res.json(successResponse(summary));
  } catch (error) {
    console.error('Error fetching usage summary:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch usage summary', error.message, 500));
  }
});

router.get('/usage/details', authenticateUser, async (req, res) => {
  try {
    const { clientId, type, startDate, endDate } = req.query;
    const details = await usageService.getUsageDetails(clientId, {
      type,
      startDate,
      endDate
    });
    res.json(successResponse(details));
  } catch (error) {
    console.error('Error fetching usage details:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch usage details', error.message, 500));
  }
});

// Webhooks
router.post('/webhooks/twilio/voice', async (req, res) => {
  try {
    const { CallSid, From, To, CallStatus, Duration, RecordingUrl } = req.body;
    
    // Update call log
    await getSupabase()
      .from('call_logs')
      .update({
        status: CallStatus,
        duration: Duration,
        recording_url: RecordingUrl
      })
      .eq('call_sid', CallSid);
      
    res.sendStatus(200);
  } catch (error) {
    console.error('Voice webhook error:', error);
    res.sendStatus(500);
  }
});

router.post('/webhooks/twilio/sms', async (req, res) => {
  try {
    const { MessageSid, From, To, Body, MessageStatus } = req.body;
    
    // Handle incoming SMS
    if (MessageStatus === 'received') {
      await getSupabase().from('sms_messages').insert({
        message_sid: MessageSid,
        from_number: From,
        to_number: To,
        body: Body,
        direction: 'inbound',
        status: MessageStatus
      });
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('SMS webhook error:', error);
    res.sendStatus(500);
  }
});

// VoIP.ms webhooks (if using VoIP.ms instead of Twilio)
router.post('/webhooks/voipms/sms', async (req, res) => {
  try {
    const { from, to, message, id } = req.body;
    
    await getSupabase().from('sms_messages').insert({
      message_sid: `voipms_${id}`,
      from_number: from,
      to_number: to,
      body: message,
      direction: 'inbound',
      status: 'received'
    });
    
    res.sendStatus(200);
  } catch (error) {
    console.error('VoIP.ms webhook error:', error);
    res.sendStatus(500);
  }
});

// Julie AI Voice Assistant Routes
router.post('/julie/start-session', async (req, res) => {
  try {
    const { callSid, phoneNumber } = req.body;
    const connection = await julieAI.startSession(callSid, phoneNumber);
    res.json(successResponse({ 
      sessionId: callSid,
      status: 'started' 
    }, 'Julie AI session started successfully'));
  } catch (error) {
    console.error('Error starting Julie AI session:', error);
    res.status(500).json(errorResponse('SESSION_START_ERROR', 'Failed to start AI session', error.message, 500));
  }
});

router.post('/julie/end-session', async (req, res) => {
  try {
    const { callSid } = req.body;
    await julieAI.endSession(callSid);
    res.json(successResponse({ status: 'ended' }, 'Julie AI session ended successfully'));
  } catch (error) {
    console.error('Error ending Julie AI session:', error);
    res.status(500).json(errorResponse('SESSION_END_ERROR', 'Failed to end AI session', error.message, 500));
  }
});

router.post('/julie/audio', async (req, res) => {
  try {
    const { callSid, audioData } = req.body;
    await julieAI.handleIncomingAudio(callSid, audioData);
    res.json(successResponse({ status: 'processed' }, 'Audio processed successfully'));
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json(errorResponse('AUDIO_PROCESSING_ERROR', 'Failed to process audio', error.message, 500));
  }
});

router.get('/julie/sessions', authenticateUser, async (req, res) => {
  try {
    const sessions = julieAI.getActiveSessions();
    res.json(successResponse({ sessions }));
  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to get sessions', error.message, 500));
  }
});

router.get('/julie/session/:callSid', authenticateUser, async (req, res) => {
  try {
    const { callSid } = req.params;
    const session = julieAI.getSession(callSid);
    
    if (!session) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Session not found', null, 404));
    }
    
    res.json(successResponse({ 
      callSid,
      phoneNumber: session.phoneNumber,
      duration: Math.floor((new Date() - session.startTime) / 1000),
      stage: session.connection.context.conversationStage,
      patientInfo: session.connection.context.patientInfo
    }));
  } catch (error) {
    console.error('Error getting session details:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to get session details', error.message, 500));
  }
});

// Twilio webhook for Julie AI integration
router.post('/webhooks/julie/incoming-call', async (req, res) => {
  try {
    const { CallSid, From, To } = req.body;
    
    // Start Julie AI session for incoming call
    await julieAI.startSession(CallSid, From);
    
    // Generate TwiML response that starts Julie AI
    const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Thank you for calling Dr. Pedro's office. This is Julie. How can I help you today?</Say>
    <Start>
        <Stream url="wss://${req.get('host')}/api/julie/stream/${CallSid}" />
    </Start>
    <Pause length="30"/>
</Response>`;
    
    res.type('text/xml').send(response);
  } catch (error) {
    console.error('Julie incoming call webhook error:', error);
    res.status(500).send('Error');
  }
});

// WebRTC Voice Call Routes
router.post('/webrtc/start-session', async (req, res) => {
  try {
    const { sessionId, clientInfo } = req.body;
    const session = await webrtcService.createSession(sessionId, clientInfo);
    res.json(successResponse({ 
      sessionId: session.sessionId,
      status: 'ready' 
    }, 'WebRTC session started successfully'));
  } catch (error) {
    console.error('Error starting WebRTC session:', error);
    res.status(500).json(errorResponse('WEBRTC_START_ERROR', 'Failed to start WebRTC session', error.message, 500));
  }
});

router.post('/webrtc/end-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    await webrtcService.endSession(sessionId);
    res.json(successResponse({ status: 'ended' }, 'WebRTC session ended successfully'));
  } catch (error) {
    console.error('Error ending WebRTC session:', error);
    res.status(500).json(errorResponse('WEBRTC_END_ERROR', 'Failed to end WebRTC session', error.message, 500));
  }
});

router.get('/webrtc/sessions', authenticateUser, async (req, res) => {
  try {
    const sessions = webrtcService.getActiveSessions();
    res.json(successResponse({ sessions }));
  } catch (error) {
    console.error('Error getting WebRTC sessions:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to get sessions', error.message, 500));
  }
});

export default router;