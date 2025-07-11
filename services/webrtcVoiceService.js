import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import VoiceService from './voiceService.js';
import twilio from 'twilio';

// WebRTC Voice Service - No phone numbers needed!
class WebRTCVoiceService extends VoiceService {
  constructor() {
    super();
    this.webrtcConnections = new Map();
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || 'https://tsmtaarwgodklafqlbhm.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } else {
      console.warn('Supabase credentials not found - transcripts will not be saved');
    }
    
    // Initialize Twilio client for SMS
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '+19292424535';
    
    if (twilioAccountSid && twilioAuthToken) {
      this.twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    } else {
      console.warn('Twilio credentials not found - SMS confirmations will not be sent');
    }
  }

  // Handle WebRTC signaling
  handleSignaling(ws, message) {
    const data = JSON.parse(message);
    const { type, sessionId, signal } = data;

    switch (type) {
      case 'start-call':
        this.startCall(ws, sessionId);
        break;
      
      case 'signal':
        this.handleWebRTCSignal(ws, sessionId, signal);
        break;
        
      case 'audio-data':
        this.processAudioData(sessionId, data.audio);
        break;
        
      case 'end-call':
        this.endCall(sessionId);
        break;
    }
  }

  // Start a new WebRTC call session
  async startCall(ws, sessionId) {
    const connection = {
      ws,
      sessionId: sessionId || uuidv4(),
      audioBuffer: [],
      vad: new this.VAD(),
      conversationManager: new this.ConversationManager(),
      isProcessing: false,
      startTime: Date.now(),
      transcript: [],
      dbRecordId: null
    };
    
    this.webrtcConnections.set(connection.sessionId, connection);
    
    // Create database record
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('voice_calls')
          .insert({
            session_id: connection.sessionId,
            call_type: 'webrtc',
            transcript: []
          })
          .select()
          .single();
          
        if (data) {
          connection.dbRecordId = data.id;
        }
        if (error) console.error('Error creating voice call record:', error);
      } catch (err) {
        console.error('Supabase error:', err);
      }
    }
    
    // Send session ready
    ws.send(JSON.stringify({
      type: 'session-ready',
      sessionId: connection.sessionId
    }));
    
    // Send initial greeting after short delay
    setTimeout(async () => {
      const greeting = "Thank you for calling Dr. Pedro's office. This is Julie. How can I help you today?";
      await this.sendTextResponse(connection, greeting);
      await this.sendAudioResponse(connection, greeting);
    }, 500);
    
    console.log(`WebRTC voice session started: ${connection.sessionId}`);
  }

  // Process incoming audio data from browser
  async processAudioData(sessionId, audioDataBase64) {
    const connection = this.webrtcConnections.get(sessionId);
    if (!connection || connection.isProcessing) return;
    
    try {
      // Decode base64 audio data
      const audioBuffer = Buffer.from(audioDataBase64, 'base64');
      
      // Convert from browser's PCM format to our processing format
      const pcm16 = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      
      // Add to buffer
      connection.audioBuffer.push(...pcm16);
      
      // Check VAD
      const vadResult = connection.vad.detect(pcm16);
      
      if (vadResult.endOfSpeech && connection.audioBuffer.length > 8000) {
        await this.processAudioBuffer(connection);
      }
      
      // Prevent buffer overflow
      if (connection.audioBuffer.length > 160000) {
        connection.audioBuffer = connection.audioBuffer.slice(-80000);
      }
    } catch (error) {
      console.error('Audio processing error:', error);
    }
  }

  // Process accumulated audio buffer (reuse from parent class)
  async processAudioBuffer(connection) {
    if (connection.isProcessing || connection.audioBuffer.length < 8000) return;
    
    connection.isProcessing = true;
    
    try {
      // Convert buffer to proper format
      const audioData = new Int16Array(connection.audioBuffer);
      
      // Clear buffer
      connection.audioBuffer = [];
      
      // Speech to text
      const transcript = await this.speechToText(audioData);
      console.log('Transcript:', transcript);
      
      if (transcript && transcript.trim().length > 0) {
        // Send transcript to frontend for display
        this.sendTextResponse(connection, transcript, 'user');
        
        // Extract appointment info if in booking stage
        if (connection.conversationManager.state.stage === 'appointment_booking') {
          const appointmentInfo = connection.conversationManager.extractAppointmentInfo(transcript);
          connection.conversationManager.updatePatientInfo(appointmentInfo);
          connection.conversationManager.updateAppointmentDetails(appointmentInfo);
        }
        
        // Generate response
        const response = await this.generateResponse(
          connection.conversationManager,
          transcript
        );
        
        // Check if appointment was confirmed
        if (response.toLowerCase().includes('booked your appointment') || 
            response.toLowerCase().includes('confirmed your appointment')) {
          await this.bookAppointment(connection);
        }
        
        // Send text response for display
        await this.sendTextResponse(connection, response, 'assistant');
        
        // Send audio response
        await this.sendAudioResponse(connection, response);
      }
    } catch (error) {
      console.error('Processing error:', error);
    } finally {
      connection.isProcessing = false;
    }
  }

  // Send text response to frontend and save to database
  async sendTextResponse(connection, text, role = 'assistant') {
    const timestamp = Date.now();
    
    // Add to connection transcript
    connection.transcript.push({ role, text, timestamp });
    
    // Send to frontend
    if (connection.ws.readyState === 1) { // WebSocket.OPEN
      connection.ws.send(JSON.stringify({
        type: 'transcript',
        role,
        text,
        timestamp
      }));
    }
    
    // Update database
    if (this.supabase && connection.dbRecordId) {
      try {
        await this.supabase
          .from('voice_calls')
          .update({
            transcript: connection.transcript,
            patient_info: connection.conversationManager.state.patientInfo
          })
          .eq('id', connection.dbRecordId);
      } catch (err) {
        console.error('Error updating transcript:', err);
      }
    }
  }

  // Send audio response to browser
  async sendAudioResponse(connection, text) {
    try {
      // Convert text to speech
      const audioData = await this.textToSpeech(text);
      
      // Convert mulaw to PCM for browser playback
      const pcm16 = this.mulawToLinear16(audioData);
      
      // Convert to base64 for transmission
      const audioBase64 = Buffer.from(pcm16.buffer).toString('base64');
      
      // Send audio data to browser
      if (connection.ws.readyState === 1) {
        connection.ws.send(JSON.stringify({
          type: 'audio-response',
          audio: audioBase64,
          sampleRate: 8000
        }));
      }
    } catch (error) {
      console.error('Send audio error:', error);
    }
  }

  // End call and cleanup
  async endCall(sessionId) {
    const connection = this.webrtcConnections.get(sessionId);
    if (connection) {
      const duration = Math.floor((Date.now() - connection.startTime) / 1000);
      console.log(`Call ended. Session: ${sessionId}, Duration: ${duration}s`);
      
      // Update database with final info
      if (this.supabase && connection.dbRecordId) {
        try {
          // Generate summary
          const summary = this.generateCallSummary(connection);
          
          await this.supabase
            .from('voice_calls')
            .update({
              ended_at: new Date().toISOString(),
              duration_seconds: duration,
              transcript: connection.transcript,
              patient_info: connection.conversationManager.state.patientInfo,
              summary,
              appointment_booked: connection.conversationManager.state.appointmentDetails?.confirmed || false,
              appointment_details: connection.conversationManager.state.appointmentDetails
            })
            .eq('id', connection.dbRecordId);
        } catch (err) {
          console.error('Error updating final call record:', err);
        }
      }
      
      // Send call ended confirmation
      if (connection.ws.readyState === 1) {
        connection.ws.send(JSON.stringify({
          type: 'call-ended',
          duration
        }));
      }
      
      this.webrtcConnections.delete(sessionId);
    }
  }
  
  // Generate call summary
  generateCallSummary(connection) {
    const { patientInfo, appointmentDetails, stage } = connection.conversationManager.state;
    let summary = `Call duration: ${Math.floor((Date.now() - connection.startTime) / 1000)}s. `;
    
    if (patientInfo.name) {
      summary += `Patient: ${patientInfo.name}. `;
    }
    
    if (appointmentDetails) {
      summary += `Appointment booked for ${appointmentDetails.date} at ${appointmentDetails.time}. `;
    }
    
    if (stage === 'emergency') {
      summary += `Emergency call - patient was advised appropriately. `;
    }
    
    summary += `Total messages: ${connection.transcript.length}.`;
    
    return summary;
  }

  // Inherit VAD and ConversationManager from parent
  get VAD() {
    // Return the VAD class from parent
    return class VAD {
      constructor(threshold = 0.01, silenceDuration = 1000) {
        this.threshold = threshold;
        this.silenceDuration = silenceDuration;
        this.lastSpeechTime = Date.now();
        this.isSpeaking = false;
      }

      detect(audioBuffer) {
        const rms = Math.sqrt(audioBuffer.reduce((sum, val) => sum + val * val, 0) / audioBuffer.length) / 32768;
        const now = Date.now();
        
        if (rms > this.threshold) {
          this.lastSpeechTime = now;
          this.isSpeaking = true;
          return { isSpeaking: true, endOfSpeech: false };
        }
        
        const silenceTime = now - this.lastSpeechTime;
        if (this.isSpeaking && silenceTime > this.silenceDuration) {
          this.isSpeaking = false;
          return { isSpeaking: false, endOfSpeech: true };
        }
        
        return { isSpeaking: false, endOfSpeech: false };
      }
    };
  }

  get ConversationManager() {
    // Return the ConversationManager class from parent
    return class ConversationManager {
      constructor() {
        this.state = {
          context: [],
          patientInfo: {},
          appointmentDetails: null,
          stage: 'greeting'
        };
      }

      addMessage(role, content) {
        this.state.context.push({ role, content });
        if (this.state.context.length > 10) {
          this.state.context = this.state.context.slice(-10);
        }
      }

      updatePatientInfo(info) {
        this.state.patientInfo = { ...this.state.patientInfo, ...info };
      }

      getSystemPrompt() {
        return `You are Julie, Dr. Pedro's warm and professional dental office AI assistant handling voice conversations. 
You speak naturally and conversationally.
Keep responses concise and natural for voice conversation.

Current conversation stage: ${this.state.stage}

Patient information collected so far:
${JSON.stringify(this.state.patientInfo, null, 2)}

${this.state.appointmentDetails ? `Appointment being booked:
${JSON.stringify(this.state.appointmentDetails, null, 2)}
` : ''}

Your capabilities:
- Answer questions about dental services and pricing
- Book new appointments or reschedule existing ones
- Collect patient information (name, phone, insurance, concern)
- Provide emergency guidance
- Connect patients with live team members when they request it

Important: If a patient asks to speak with a human, doctor, or live person, say:
"I'd be happy to connect you with our team right away. Dr. Pedro or one of our specialists will call you back within 5 minutes. What's the best number to reach you?"

Always:
- Be warm, empathetic, and professional
- Keep responses brief and conversational (2-3 sentences max)
- Ask one question at a time
- Confirm important details
- Use natural speech patterns
- If emergency, immediately ask if they need to go to ER

For appointment booking:
- Collect: name, phone number, preferred date/time, dental concern
- Offer available slots like: "I have openings tomorrow at 10 AM or 2 PM, or Thursday at 3 PM"
- Once you have all details, say: "Perfect! Let me confirm: [appointment details]. Shall I book this for you?"
- After patient confirms, say: "Wonderful! I've booked your appointment. You'll receive a text confirmation shortly."
- Mark appointmentDetails.confirmed = true when patient confirms`;
      }

      determineStage(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        if (lowerTranscript.includes('emergency') || lowerTranscript.includes('pain') || lowerTranscript.includes('bleeding')) {
          this.state.stage = 'emergency';
        } else if (lowerTranscript.includes('appointment') || lowerTranscript.includes('book') || lowerTranscript.includes('schedule')) {
          this.state.stage = 'appointment_booking';
        } else if (this.state.context.length > 8) {
          this.state.stage = 'closing';
        }
      }
      
      extractAppointmentInfo(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        const info = {};
        
        // Extract name
        const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (nameMatch) {
          info.name = nameMatch[1];
        }
        
        // Extract phone
        const phoneMatch = transcript.match(/\b(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
        if (phoneMatch) {
          info.phone = phoneMatch[0].replace(/[^\d]/g, '');
        }
        
        // Extract time preferences
        const timeMatch = lowerTranscript.match(/\b(\d{1,2})(?:\s*(?:am|pm))|morning|afternoon|evening/);
        if (timeMatch) {
          info.timePreference = timeMatch[0];
        }
        
        // Extract date preferences
        const dateMatch = lowerTranscript.match(/tomorrow|today|monday|tuesday|wednesday|thursday|friday|next week/);
        if (dateMatch) {
          info.datePreference = dateMatch[0];
        }
        
        // Extract dental concern
        const concernMatch = lowerTranscript.match(/(?:for|about|regarding|have|need)\s+(?:a\s+)?([\w\s]+?)(?:\.|,|$)/);
        if (concernMatch) {
          info.concern = concernMatch[1].trim();
        }
        
        return info;
      }
      
      updateAppointmentDetails(info) {
        if (!this.state.appointmentDetails) {
          this.state.appointmentDetails = {
            patientName: null,
            phoneNumber: null,
            date: null,
            time: null,
            concern: null,
            confirmed: false
          };
        }
        
        if (info.name) this.state.appointmentDetails.patientName = info.name;
        if (info.phone) this.state.appointmentDetails.phoneNumber = info.phone;
        if (info.timePreference) this.state.appointmentDetails.time = info.timePreference;
        if (info.datePreference) this.state.appointmentDetails.date = info.datePreference;
        if (info.concern) this.state.appointmentDetails.concern = info.concern;
      }
    };
  }

  // Convert mulaw to PCM16
  mulawToLinear16(mulaw) {
    const MULAW_BIAS = 33;
    const pcm16 = new Int16Array(mulaw.length);
    
    for (let i = 0; i < mulaw.length; i++) {
      let byte = ~mulaw[i];
      let sign = byte & 0x80;
      let exponent = (byte & 0x70) >> 4;
      let mantissa = byte & 0x0F;
      let sample = mantissa << (exponent + 3);
      sample += MULAW_BIAS << (exponent + 2);
      if (sign === 0) sample = -sample;
      pcm16[i] = sample;
    }
    
    return pcm16;
  }
  
  // Book appointment in database and send SMS
  async bookAppointment(connection) {
    const details = connection.conversationManager.state.appointmentDetails;
    if (!details || !details.patientName || !details.phoneNumber) {
      console.error('Missing appointment details');
      return;
    }
    
    try {
      // Parse date and time into proper format
      const appointmentDate = this.parseDate(details.date);
      const appointmentTime = this.parseTime(details.time);
      
      // First, find or create patient record
      let patientId;
      const { data: existingPatient } = await this.supabase
        .from('patients')
        .select('id')
        .eq('phone', details.phoneNumber)
        .single();
      
      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        // Create new patient (minimal info for now)
        const nameParts = details.patientName.split(' ');
        const { data: newPatient, error: patientError } = await this.supabase
          .from('patients')
          .insert({
            first_name: nameParts[0] || details.patientName,
            last_name: nameParts[1] || '',
            email: `patient_${Date.now()}@temporary.com`, // Placeholder
            phone: details.phoneNumber,
            auth_user_id: 'a0000000-0000-0000-0000-000000000000' // System user
          })
          .select()
          .single();
        
        if (patientError) {
          console.error('Error creating patient:', patientError);
          return;
        }
        patientId = newPatient.id;
      }
      
      // Get general checkup service ID
      const { data: service } = await this.supabase
        .from('services')
        .select('id')
        .eq('name', 'General Checkup')
        .single();
      
      const serviceId = service?.id || 'a0000000-0000-0000-0000-000000000001'; // Fallback
      
      // Create appointment
      const { data: appointment, error: appointmentError } = await this.supabase
        .from('appointments')
        .insert({
          patient_id: patientId,
          service_id: serviceId,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: 'scheduled',
          notes: `Concern: ${details.concern || 'General checkup'}. Booked via AI voice assistant.`
        })
        .select()
        .single();
      
      if (appointmentError) {
        console.error('Error creating appointment:', appointmentError);
        return;
      }
      
      // Update connection record
      connection.conversationManager.state.appointmentDetails.confirmed = true;
      connection.conversationManager.state.appointmentDetails.appointmentId = appointment.id;
      
      // Send SMS confirmation
      await this.sendSMSConfirmation(details, appointmentDate, appointmentTime);
      
      console.log(`Appointment booked: ${appointment.id}`);
    } catch (error) {
      console.error('Error booking appointment:', error);
    }
  }
  
  // Send SMS confirmation
  async sendSMSConfirmation(details, date, time) {
    if (!this.twilioClient) {
      console.warn('Twilio not configured - SMS not sent');
      return;
    }
    
    try {
      const message = `Hi ${details.patientName}, this is Dr. Pedro's office confirming your appointment on ${date} at ${time}. ` +
                      `Reply YES to confirm or call ${process.env.PRACTICE_PHONE || '(929) 242-4535'} to reschedule. Thank you!`;
      
      await this.twilioClient.messages.create({
        body: message,
        from: this.twilioPhoneNumber,
        to: `+1${details.phoneNumber}`
      });
      
      console.log(`SMS confirmation sent to ${details.phoneNumber}`);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }
  
  // Parse natural language date
  parseDate(dateStr) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateStrLower = dateStr.toLowerCase();
    
    if (dateStrLower.includes('today')) {
      return today.toISOString().split('T')[0];
    } else if (dateStrLower.includes('tomorrow')) {
      return tomorrow.toISOString().split('T')[0];
    } else if (dateStrLower.includes('monday')) {
      return this.getNextWeekday(1).toISOString().split('T')[0];
    } else if (dateStrLower.includes('tuesday')) {
      return this.getNextWeekday(2).toISOString().split('T')[0];
    } else if (dateStrLower.includes('wednesday')) {
      return this.getNextWeekday(3).toISOString().split('T')[0];
    } else if (dateStrLower.includes('thursday')) {
      return this.getNextWeekday(4).toISOString().split('T')[0];
    } else if (dateStrLower.includes('friday')) {
      return this.getNextWeekday(5).toISOString().split('T')[0];
    }
    
    // Default to tomorrow if unclear
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Parse natural language time
  parseTime(timeStr) {
    const timeStrLower = timeStr.toLowerCase();
    
    // Extract specific times
    const timeMatch = timeStrLower.match(/(\d{1,2})(?:\s*(?:am|pm))/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      if (timeStrLower.includes('pm') && hour < 12) hour += 12;
      if (timeStrLower.includes('am') && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:00:00`;
    }
    
    // Default times based on preference
    if (timeStrLower.includes('morning')) return '10:00:00';
    if (timeStrLower.includes('afternoon')) return '14:00:00';
    if (timeStrLower.includes('evening')) return '17:00:00';
    
    // Default to 2 PM
    return '14:00:00';
  }
  
  // Get next occurrence of a weekday
  getNextWeekday(dayOfWeek) {
    const today = new Date();
    const todayDay = today.getDay();
    const daysUntilNext = (dayOfWeek - todayDay + 7) % 7 || 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilNext);
    return nextDate;
  }
}

export default WebRTCVoiceService;