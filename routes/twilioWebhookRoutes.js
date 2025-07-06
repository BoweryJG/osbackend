import express from 'express';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Twilio webhook validation (optional but recommended for security)
const validateTwilioRequest = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      req.body
    );
    
    if (!isValid) {
      return res.status(403).send('Forbidden');
    }
  }
  next();
};

// POST /api/twilio/incoming-call
router.post('/api/twilio/incoming-call', validateTwilioRequest, async (req, res) => {
  console.log('Incoming call webhook:', req.body);
  
  const { CallSid, From, To, CallStatus } = req.body;
  const forwardTo = process.env.FORWARD_TO_PHONE;
  
  if (!forwardTo) {
    console.error('FORWARD_TO_PHONE not configured');
    return res.status(500).send('Configuration error');
  }
  
  try {
    // Log the incoming call to database
    await supabase
      .from('calls')
      .insert({
        sid: CallSid,
        from_number: From,
        to_number: To,
        status: CallStatus,
        direction: 'inbound',
        created_at: new Date().toISOString()
      });
    
    // Create TwiML response to forward the call
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Optional greeting before forwarding
    twiml.say({
      voice: 'alice'
    }, 'Thank you for calling RepConnect. Connecting you now. This call may be recorded for quality purposes.');
    
    // Forward the call with recording
    twiml.dial({
      record: 'record-from-answer-dual',
      recordingStatusCallback: `${process.env.BACKEND_URL}/api/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed']
    }, forwardTo);
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    // Return TwiML even on error to handle the call gracefully
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we are experiencing technical difficulties. Please try again later.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// POST /api/twilio/call-status
router.post('/api/twilio/call-status', validateTwilioRequest, async (req, res) => {
  console.log('Call status webhook:', req.body);
  
  const { 
    CallSid, 
    CallStatus, 
    CallDuration,
    RecordingUrl,
    RecordingSid 
  } = req.body;
  
  try {
    // Update call record with final status
    await supabase
      .from('calls')
      .update({
        status: CallStatus,
        duration: parseInt(CallDuration) || 0,
        recording_url: RecordingUrl,
        recording_sid: RecordingSid,
        ended_at: new Date().toISOString()
      })
      .eq('sid', CallSid);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error updating call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// POST /api/twilio/recording-status
router.post('/api/twilio/recording-status', validateTwilioRequest, async (req, res) => {
  console.log('Recording status webhook:', req.body);
  
  const {
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    CallSid
  } = req.body;
  
  if (RecordingStatus !== 'completed') {
    return res.status(200).send('OK');
  }
  
  try {
    // Save recording information
    await supabase
      .from('call_recordings')
      .insert({
        recording_sid: RecordingSid,
        call_sid: CallSid,
        url: RecordingUrl,
        duration: parseInt(RecordingDuration) || 0,
        status: RecordingStatus,
        created_at: new Date().toISOString()
      });
    
    // Update call record with recording info
    await supabase
      .from('calls')
      .update({
        recording_url: RecordingUrl,
        recording_sid: RecordingSid,
        has_recording: true
      })
      .eq('sid', CallSid);
    
    // TODO: Trigger transcription service here if needed
    // Example: await transcriptionService.startTranscription(RecordingSid, RecordingUrl);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing recording:', error);
    res.status(500).send('Error processing recording');
  }
});

export default router;