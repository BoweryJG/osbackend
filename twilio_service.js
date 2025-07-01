import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import transcriptionService from './transcription_service.js';
const { processAudioFile, transcribeAudio, analyzeTranscription } = transcriptionService;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize Twilio client
let twilioClient;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('Twilio client initialized successfully');
} else {
  console.warn('Twilio credentials not found. Twilio features will be disabled.');
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Twilio webhook URL base (will be set dynamically based on environment)
const getWebhookBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://osbackend-zl1h.onrender.com';
  }
  return process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
};

/**
 * Validate Twilio webhook signature
 * @param {string} signature - The X-Twilio-Signature header
 * @param {string} url - The full URL of the webhook
 * @param {object} params - The request body parameters
 * @returns {boolean} - Whether the signature is valid
 */
export function validateTwilioSignature(signature, url, params) {
  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('Twilio auth token not configured, skipping signature validation');
    return true; // Skip validation in development if not configured
  }
  
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );
}

/**
 * Generate TwiML response for voice calls
 * @param {string} message - The message to speak
 * @param {object} options - Additional options for the response
 * @returns {string} - TwiML XML response
 */
export function generateVoiceResponse(message, options = {}) {
  const response = new twilio.twiml.VoiceResponse();
  
  if (options.record) {
    response.say({
      voice: options.voice || 'alice',
      language: options.language || 'en-US'
    }, message);
    
    response.record({
      action: `${getWebhookBaseUrl()}/api/twilio/recording`,
      method: 'POST',
      maxLength: options.maxLength || 3600, // 1 hour max
      timeout: options.timeout || 10,
      transcribe: false, // We'll use our own transcription service
      recordingStatusCallback: `${getWebhookBaseUrl()}/api/twilio/recording-status`,
      recordingStatusCallbackMethod: 'POST'
    });
  } else {
    response.say({
      voice: options.voice || 'alice',
      language: options.language || 'en-US'
    }, message);
  }
  
  if (options.hangup !== false) {
    response.hangup();
  }
  
  return response.toString();
}

/**
 * Generate TwiML response for SMS
 * @param {string} message - The message to send
 * @returns {string} - TwiML XML response
 */
export function generateSmsResponse(message) {
  const response = new twilio.twiml.MessagingResponse();
  response.message(message);
  return response.toString();
}

/**
 * Make an outbound call
 * @param {string} to - The phone number to call
 * @param {string} message - The message to speak
 * @param {object} options - Additional options
 * @returns {Promise<object>} - The call object
 */
export async function makeCall(to, message, options = {}) {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized');
  }
  
  try {
    const callOptions = {
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: generateVoiceResponse(message, options),
      record: options.record || false
    };
    
    // Only add callbacks in production
    if (process.env.NODE_ENV === 'production') {
      callOptions.statusCallback = `${getWebhookBaseUrl()}/api/twilio/status`;
      callOptions.statusCallbackMethod = 'POST';
      callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
      if (options.record) {
        callOptions.recordingStatusCallback = `${getWebhookBaseUrl()}/api/twilio/recording-status`;
        callOptions.recordingStatusCallbackMethod = 'POST';
      }
    }
    
    const call = await twilioClient.calls.create(callOptions);
    
    // Save call record to database
    await saveCallRecord({
      call_sid: call.sid,
      phone_number_sid: process.env.TWILIO_PHONE_NUMBER_SID,
      from_number: call.from,
      to_number: call.to,
      direction: 'outbound',
      status: call.status,
      metadata: options.metadata || {}
    });
    
    return call;
  } catch (error) {
    console.error('Error making call:', error);
    throw error;
  }
}

/**
 * Send an SMS message
 * @param {string} to - The phone number to send to
 * @param {string} body - The message body
 * @param {object} options - Additional options
 * @returns {Promise<object>} - The message object
 */
export async function sendSms(to, body, options = {}) {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized');
  }
  
  try {
    const messageOptions = {
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body
    };
    
    // Only add statusCallback in production
    if (process.env.NODE_ENV === 'production') {
      messageOptions.statusCallback = `${getWebhookBaseUrl()}/api/twilio/sms-status`;
      messageOptions.statusCallbackMethod = 'POST';
    }
    
    const message = await twilioClient.messages.create(messageOptions);
    
    // Save SMS record to database
    await saveSmsRecord({
      message_sid: message.sid,
      from_number: message.from,
      to_number: message.to,
      body: message.body,
      direction: 'outbound',
      status: message.status,
      num_segments: message.numSegments,
      metadata: options.metadata || {}
    });
    
    return message;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

/**
 * Save call record to database
 * @param {object} callData - The call data to save
 * @returns {Promise<object>} - The saved record
 */
export async function saveCallRecord(callData) {
  try {
    const { data, error } = await supabase
      .from('twilio_calls')
      .upsert([callData], { onConflict: 'call_sid' })
      .select();
    
    if (error) {
      console.error('Error saving call record:', error);
      throw error;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error saving call record:', error);
    throw error;
  }
}

/**
 * Save SMS record to database
 * @param {object} smsData - The SMS data to save
 * @returns {Promise<object>} - The saved record
 */
export async function saveSmsRecord(smsData) {
  try {
    const { data, error } = await supabase
      .from('twilio_sms')
      .upsert([smsData], { onConflict: 'message_sid' })
      .select();
    
    if (error) {
      console.error('Error saving SMS record:', error);
      throw error;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error saving SMS record:', error);
    throw error;
  }
}

/**
 * Save recording record to database
 * @param {object} recordingData - The recording data to save
 * @returns {Promise<object>} - The saved record
 */
export async function saveRecordingRecord(recordingData) {
  try {
    const { data, error } = await supabase
      .from('twilio_recordings')
      .upsert([recordingData], { onConflict: 'recording_sid' })
      .select();
    
    if (error) {
      console.error('Error saving recording record:', error);
      throw error;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error saving recording record:', error);
    throw error;
  }
}

/**
 * Process a recording: download, transcribe, and analyze
 * @param {string} recordingSid - The recording SID
 * @param {string} recordingUrl - The recording URL
 * @param {string} callSid - The associated call SID
 * @returns {Promise<object>} - The processing result
 */
export async function processRecording(recordingSid, recordingUrl, callSid) {
  try {
    console.log(`Processing recording ${recordingSid} for call ${callSid}`);
    
    // Update recording status to processing
    await supabase
      .from('twilio_recordings')
      .update({ status: 'processing' })
      .eq('recording_sid', recordingSid);
    
    // Download the recording
    const recordingResponse = await axios.get(recordingUrl + '.mp3', {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    });
    
    // Create a temporary file object
    const tempFile = {
      buffer: Buffer.from(recordingResponse.data),
      originalname: `${recordingSid}.mp3`,
      mimetype: 'audio/mpeg'
    };
    
    // Transcribe the recording
    const transcriptionResult = await transcribeAudio(recordingUrl + '.mp3');
    
    // Analyze the transcription
    const analysisResult = await analyzeTranscription(transcriptionResult.text);
    
    // Get the call record to find the user
    const { data: callRecord } = await supabase
      .from('twilio_calls')
      .select('user_id')
      .eq('call_sid', callSid)
      .single();
    
    // Save the transcription
    const { data: transcriptionRecord, error: transcriptionError } = await supabase
      .from('transcriptions')
      .insert([{
        user_id: callRecord?.user_id,
        filename: `twilio_recording_${recordingSid}.mp3`,
        file_url: recordingUrl + '.mp3',
        transcription: transcriptionResult.text,
        duration_seconds: Math.ceil(transcriptionResult.duration || 0),
        analysis: analysisResult,
        status: 'completed',
        metadata: {
          source: 'twilio',
          call_sid: callSid,
          recording_sid: recordingSid
        }
      }])
      .select();
    
    if (transcriptionError) {
      throw transcriptionError;
    }
    
    // Update the recording record with transcription ID
    await supabase
      .from('twilio_recordings')
      .update({
        transcription_id: transcriptionRecord[0].id,
        status: 'completed'
      })
      .eq('recording_sid', recordingSid);
    
    // Update the call record with transcription ID
    await supabase
      .from('twilio_calls')
      .update({
        transcription_id: transcriptionRecord[0].id
      })
      .eq('call_sid', callSid);
    
    return {
      success: true,
      transcription: transcriptionRecord[0]
    };
  } catch (error) {
    console.error('Error processing recording:', error);
    
    // Update recording status to failed
    await supabase
      .from('twilio_recordings')
      .update({
        status: 'failed',
        metadata: { error: error.message }
      })
      .eq('recording_sid', recordingSid);
    
    throw error;
  }
}

/**
 * Get call history for a phone number
 * @param {string} phoneNumber - The phone number to get history for
 * @param {object} options - Query options
 * @returns {Promise<Array>} - The call history
 */
export async function getCallHistory(phoneNumber, options = {}) {
  try {
    let query = supabase
      .from('twilio_calls')
      .select('*')
      .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
      .order('created_at', { ascending: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error getting call history:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting call history:', error);
    throw error;
  }
}

/**
 * Get SMS history for a phone number
 * @param {string} phoneNumber - The phone number to get history for
 * @param {object} options - Query options
 * @returns {Promise<Array>} - The SMS history
 */
export async function getSmsHistory(phoneNumber, options = {}) {
  try {
    let query = supabase
      .from('twilio_sms')
      .select('*')
      .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
      .order('created_at', { ascending: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error getting SMS history:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting SMS history:', error);
    throw error;
  }
}

export default {
  validateTwilioSignature,
  generateVoiceResponse,
  generateSmsResponse,
  makeCall,
  sendSms,
  saveCallRecord,
  saveSmsRecord,
  saveRecordingRecord,
  processRecording,
  getCallHistory,
  getSmsHistory
};
