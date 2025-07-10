import WebSocket from 'ws';
import axios from 'axios';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Audio conversion utilities
const pcmToInt16 = (pcmData) => {
  const output = new Int16Array(pcmData.length / 2);
  for (let i = 0; i < output.length; i++) {
    output[i] = (pcmData[i * 2] | (pcmData[i * 2 + 1] << 8));
  }
  return output;
};

const int16ToPcm = (int16Data) => {
  const buffer = new Uint8Array(int16Data.length * 2);
  for (let i = 0; i < int16Data.length; i++) {
    buffer[i * 2] = int16Data[i] & 0xFF;
    buffer[i * 2 + 1] = (int16Data[i] >> 8) & 0xFF;
  }
  return buffer;
};

// Conversation Context Manager
class ConversationContext {
  constructor() {
    this.messages = [];
    this.patientInfo = {};
    this.appointmentDetails = null;
    this.conversationStage = 'greeting';
    this.emergencyDetected = false;
  }

  addMessage(role, content) {
    this.messages.push({ 
      role, 
      content, 
      timestamp: new Date().toISOString() 
    });
    
    // Keep conversation context manageable
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-15);
    }
  }

  detectIntent(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Emergency detection
    if (lowerTranscript.match(/\b(emergency|severe pain|bleeding|swelling|urgent|unbearable)\b/)) {
      this.emergencyDetected = true;
      this.conversationStage = 'emergency';
      return 'emergency';
    }
    
    // Appointment booking intent
    if (lowerTranscript.match(/\b(appointment|book|schedule|available|opening)\b/)) {
      this.conversationStage = 'appointment_booking';
      return 'appointment';
    }
    
    // Question about services
    if (lowerTranscript.match(/\b(cost|price|insurance|payment|service|treatment|procedure)\b/)) {
      return 'inquiry';
    }
    
    // Request for human
    if (lowerTranscript.match(/\b(speak to|talk to|human|person|doctor|dr pedro|someone|staff)\b/)) {
      return 'human_request';
    }
    
    return 'general';
  }

  extractPatientInfo(transcript) {
    const info = {};
    
    // Extract name
    const namePatterns = [
      /(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:calling|speaking)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        info.name = match[1].trim();
        break;
      }
    }
    
    // Extract phone number
    const phoneMatch = transcript.match(/\b(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
    if (phoneMatch) {
      info.phone = phoneMatch[0].replace(/[^\d]/g, '');
    }
    
    // Extract email
    const emailMatch = transcript.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      info.email = emailMatch[0].toLowerCase();
    }
    
    // Extract date/time preferences
    const timePreferences = {
      morning: /\b(morning|am|before noon)\b/i,
      afternoon: /\b(afternoon|pm|after lunch)\b/i,
      evening: /\b(evening|after work|late)\b/i
    };
    
    for (const [pref, pattern] of Object.entries(timePreferences)) {
      if (pattern.test(transcript)) {
        info.timePreference = pref;
        break;
      }
    }
    
    // Extract day preferences
    const dayMatch = transcript.match(/\b(monday|tuesday|wednesday|thursday|friday|tomorrow|today|next week)\b/i);
    if (dayMatch) {
      info.dayPreference = dayMatch[0].toLowerCase();
    }
    
    // Extract dental concern
    const concernPatterns = [
      /(?:for|about|regarding|have|need|problem with|issue with)\s+(?:a\s+)?(.+?)(?:\.|,|$)/i,
      /(?:experiencing|suffering from)\s+(.+?)(?:\.|,|$)/i
    ];
    
    for (const pattern of concernPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        info.concern = match[1].trim();
        break;
      }
    }
    
    // Update stored patient info
    Object.assign(this.patientInfo, info);
    return info;
  }

  getSystemPrompt() {
    return `You are Julie, Dr. Pedro's warm and professional AI dental assistant handling real-time voice conversations.

VOICE CONVERSATION GUIDELINES:
- Keep responses VERY concise (1-2 sentences max)
- Use natural, conversational language
- Include verbal acknowledgments ("I see", "Got it", "Mm-hmm")
- Ask one question at a time
- Pause naturally between thoughts
- Use simple, clear language

CURRENT CONTEXT:
Stage: ${this.conversationStage}
Emergency Detected: ${this.emergencyDetected}
Patient Info Collected: ${JSON.stringify(this.patientInfo, null, 2)}

YOUR CAPABILITIES:
1. Emergency Routing - Immediately assess severity and offer ER referral if needed
2. Appointment Booking - Collect name, phone, concern, and preferred time
3. Answer Questions - Services, pricing, insurance, office hours
4. Human Handoff - Connect to staff when requested

CONVERSATION FLOW:
${this.conversationStage === 'greeting' ? '- Warm greeting, ask how you can help' : ''}
${this.conversationStage === 'emergency' ? '- Express concern, assess severity, offer immediate help' : ''}
${this.conversationStage === 'appointment_booking' ? '- Collect missing info: ' + this.getMissingInfo().join(', ') : ''}

IMPORTANT BEHAVIORS:
- If emergency: "I understand you're in pain. Is this a severe emergency that needs immediate attention?"
- If booking: Offer specific slots like "I have tomorrow at 2 PM or Thursday at 10 AM"
- If human requested: "I'll connect you with our team right away. What's the best number to reach you?"
- Always confirm important details back to the patient

Remember: You're having a real-time voice conversation. Be natural, brief, and helpful.`;
  }

  getMissingInfo() {
    const required = ['name', 'phone', 'concern'];
    const missing = [];
    
    if (!this.patientInfo.name) missing.push('name');
    if (!this.patientInfo.phone) missing.push('phone number');
    if (!this.patientInfo.concern) missing.push('reason for visit');
    if (!this.patientInfo.timePreference && !this.patientInfo.dayPreference) {
      missing.push('preferred time');
    }
    
    return missing;
  }

  isAppointmentReady() {
    return this.patientInfo.name && 
           this.patientInfo.phone && 
           this.patientInfo.concern &&
           (this.patientInfo.timePreference || this.patientInfo.dayPreference);
  }
}

// Moshi Voice Integration
class MoshiVoiceInterface {
  constructor() {
    this.moshiUrl = process.env.MOSHI_API_URL || 'wss://moshi.kyutai.org/api/v1/stream';
    this.moshiApiKey = process.env.MOSHI_API_KEY;
    this.connections = new Map();
    this.openRouterKey = process.env.OPENROUTER_API_KEY;
  }

  async connect(sessionId) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.moshiUrl, {
        headers: {
          'Authorization': `Bearer ${this.moshiApiKey}`,
          'X-Session-ID': sessionId
        }
      });

      const connection = {
        ws,
        sessionId,
        context: new ConversationContext(),
        audioQueue: [],
        isProcessing: false,
        streamConfig: {
          sampleRate: 16000,
          channels: 1,
          encoding: 'pcm16'
        }
      };

      ws.on('open', () => {
        console.log(`Moshi connection established for session ${sessionId}`);
        
        // Send initial configuration
        ws.send(JSON.stringify({
          type: 'config',
          config: {
            sampleRate: connection.streamConfig.sampleRate,
            channels: connection.streamConfig.channels,
            encoding: connection.streamConfig.encoding,
            language: 'en-US',
            mode: 'conversation'
          }
        }));

        this.connections.set(sessionId, connection);
        resolve(connection);
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          await this.handleMoshiMessage(connection, message);
        } catch (error) {
          console.error('Error handling Moshi message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error(`Moshi WebSocket error for session ${sessionId}:`, error);
        reject(error);
      });

      ws.on('close', () => {
        console.log(`Moshi connection closed for session ${sessionId}`);
        this.connections.delete(sessionId);
      });
    });
  }

  async handleMoshiMessage(connection, message) {
    switch (message.type) {
      case 'transcript':
        // Handle real-time transcript
        if (message.isFinal) {
          await this.processTranscript(connection, message.text);
        }
        break;
        
      case 'audio':
        // Handle incoming audio from Moshi (if needed for echo cancellation)
        break;
        
      case 'ready':
        // Moshi is ready to receive audio
        await this.sendGreeting(connection);
        break;
        
      case 'error':
        console.error('Moshi error:', message.error);
        break;
    }
  }

  async processTranscript(connection, transcript) {
    console.log(`Patient: ${transcript}`);
    
    // Extract patient information
    connection.context.extractPatientInfo(transcript);
    
    // Detect intent
    const intent = connection.context.detectIntent(transcript);
    
    // Add to conversation history
    connection.context.addMessage('user', transcript);
    
    // Generate response based on intent
    let response;
    
    switch (intent) {
      case 'emergency':
        response = await this.handleEmergency(connection);
        break;
        
      case 'appointment':
        response = await this.handleAppointmentBooking(connection);
        break;
        
      case 'human_request':
        response = await this.handleHumanRequest(connection);
        break;
        
      case 'inquiry':
        response = await this.handleInquiry(connection, transcript);
        break;
        
      default:
        response = await this.generateAIResponse(connection, transcript);
    }
    
    // Send response
    await this.sendResponse(connection, response);
  }

  async handleEmergency(connection) {
    // Log emergency call
    await this.logEmergencyCall(connection);
    
    return "I understand you're experiencing a dental emergency. Are you in severe pain right now? " +
           "If this is life-threatening, please call 911 immediately. Otherwise, I can connect you " +
           "with Dr. Pedro's emergency line right away.";
  }

  async handleAppointmentBooking(connection) {
    const missingInfo = connection.context.getMissingInfo();
    
    if (missingInfo.length > 0) {
      // Ask for the first missing piece of information
      const questions = {
        'name': "I'd be happy to book an appointment. May I have your name please?",
        'phone number': "Great! And what's the best phone number to reach you?",
        'reason for visit': "What brings you in to see Dr. Pedro?",
        'preferred time': "When works best for you? We have openings tomorrow afternoon or Thursday morning."
      };
      
      return questions[missingInfo[0]] || "Let me get a few details for your appointment.";
    }
    
    // All info collected, confirm appointment
    if (connection.context.isAppointmentReady()) {
      const slots = await this.getAvailableSlots();
      return `Perfect! I have you down for ${connection.context.patientInfo.concern}. ` +
             `I can offer ${slots[0]} or ${slots[1]}. Which works better?`;
    }
  }

  async handleHumanRequest(connection) {
    // Log request for callback
    await this.logCallbackRequest(connection);
    
    return "Of course! I'll have someone from our team call you right back. " +
           "We typically return calls within 5 minutes during business hours. " +
           "Is " + (connection.context.patientInfo.phone || "the number you're calling from") + " the best number?";
  }

  async handleInquiry(connection, transcript) {
    // Use AI to answer specific questions about services, pricing, etc.
    return await this.generateAIResponse(connection, transcript);
  }

  async generateAIResponse(connection, transcript) {
    try {
      const messages = [
        { role: 'system', content: connection.context.getSystemPrompt() },
        ...connection.context.messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }))
      ];

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'anthropic/claude-3-haiku-20240307',
          messages,
          temperature: 0.7,
          max_tokens: 100, // Keep responses very short for voice
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://gregpedromd.com',
            'X-Title': 'Julie AI Voice Assistant'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      connection.context.addMessage('assistant', aiResponse);
      
      return aiResponse;
    } catch (error) {
      console.error('AI Response Error:', error);
      return "I'm having a bit of trouble. Could you repeat that please?";
    }
  }

  async sendResponse(connection, text) {
    console.log(`Julie: ${text}`);
    
    // Send text to Moshi for TTS
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({
        type: 'speak',
        text: text,
        voice: {
          style: 'professional',
          speed: 0.95,
          pitch: 1.05
        }
      }));
    }
  }

  async sendGreeting(connection) {
    const greeting = "Thank you for calling Dr. Pedro's office. This is Julie. How can I help you today?";
    await this.sendResponse(connection, greeting);
  }

  async sendAudio(connection, audioData) {
    if (connection.ws.readyState === WebSocket.OPEN) {
      // Convert audio to base64
      const base64Audio = Buffer.from(audioData).toString('base64');
      
      connection.ws.send(JSON.stringify({
        type: 'audio',
        audio: base64Audio,
        encoding: 'pcm16',
        sampleRate: 16000
      }));
    }
  }

  // Database operations
  async logEmergencyCall(connection) {
    try {
      await supabase.from('emergency_calls').insert({
        patient_name: connection.context.patientInfo.name,
        phone_number: connection.context.patientInfo.phone,
        concern: connection.context.patientInfo.concern,
        transcript: connection.context.messages,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging emergency call:', error);
    }
  }

  async logCallbackRequest(connection) {
    try {
      await supabase.from('callback_requests').insert({
        patient_name: connection.context.patientInfo.name,
        phone_number: connection.context.patientInfo.phone,
        reason: connection.context.patientInfo.concern,
        requested_at: new Date().toISOString(),
        status: 'pending'
      });
    } catch (error) {
      console.error('Error logging callback request:', error);
    }
  }

  async getAvailableSlots() {
    // In production, this would query the actual appointment system
    const slots = [
      "tomorrow at 2:00 PM",
      "Thursday at 10:00 AM",
      "Friday at 3:30 PM"
    ];
    
    return slots;
  }

  async bookAppointment(connection) {
    try {
      const appointment = {
        patient_name: connection.context.patientInfo.name,
        patient_phone: connection.context.patientInfo.phone,
        patient_email: connection.context.patientInfo.email || null,
        service_type: this.mapConcernToService(connection.context.patientInfo.concern),
        appointment_date: this.calculateAppointmentDate(connection.context.patientInfo),
        status: 'confirmed',
        notes: connection.context.patientInfo.concern,
        booked_via: 'julie_ai_voice',
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('appointments')
        .insert(appointment)
        .select()
        .single();
        
      if (error) throw error;
      
      // Send confirmation SMS
      await this.sendAppointmentConfirmation(data);
      
      return data;
    } catch (error) {
      console.error('Error booking appointment:', error);
      throw error;
    }
  }

  mapConcernToService(concern) {
    const concernLower = concern.toLowerCase();
    
    if (concernLower.includes('cleaning') || concernLower.includes('checkup')) {
      return 'cleaning';
    } else if (concernLower.includes('implant')) {
      return 'implant';
    } else if (concernLower.includes('tmj') || concernLower.includes('jaw')) {
      return 'tmj';
    } else if (concernLower.includes('botox') || concernLower.includes('filler')) {
      return 'cosmetic';
    } else if (concernLower.includes('whitening')) {
      return 'whitening';
    } else if (concernLower.includes('emergency') || concernLower.includes('pain')) {
      return 'emergency';
    }
    
    return 'consultation';
  }

  calculateAppointmentDate(patientInfo) {
    const now = new Date();
    const dayMap = {
      'tomorrow': 1,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5
    };
    
    // Simple date calculation - in production would check actual availability
    if (patientInfo.dayPreference === 'tomorrow') {
      now.setDate(now.getDate() + 1);
    } else if (patientInfo.dayPreference === 'today') {
      // Keep current date
    } else if (dayMap[patientInfo.dayPreference]) {
      // Calculate next occurrence of the specified day
      const targetDay = dayMap[patientInfo.dayPreference];
      const currentDay = now.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      now.setDate(now.getDate() + daysUntilTarget);
    } else {
      // Default to next business day
      now.setDate(now.getDate() + 1);
    }
    
    // Set time based on preference
    if (patientInfo.timePreference === 'morning') {
      now.setHours(10, 0, 0, 0);
    } else if (patientInfo.timePreference === 'afternoon') {
      now.setHours(14, 0, 0, 0);
    } else if (patientInfo.timePreference === 'evening') {
      now.setHours(17, 0, 0, 0);
    } else {
      now.setHours(14, 0, 0, 0); // Default to 2 PM
    }
    
    return now.toISOString();
  }

  async sendAppointmentConfirmation(appointment) {
    // This would integrate with the SMS service
    console.log('Sending appointment confirmation:', appointment);
  }

  disconnect(sessionId) {
    const connection = this.connections.get(sessionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
    }
    this.connections.delete(sessionId);
  }
}

// Julie AI Service Manager
class JulieAIService {
  constructor() {
    this.moshiInterface = new MoshiVoiceInterface();
    this.activeSessions = new Map();
  }

  async startSession(callSid, phoneNumber) {
    try {
      console.log(`Starting Julie AI session for call ${callSid}`);
      
      // Create Moshi connection
      const connection = await this.moshiInterface.connect(callSid);
      
      // Store session info
      this.activeSessions.set(callSid, {
        phoneNumber,
        startTime: new Date(),
        connection
      });
      
      // Log call start
      await this.logCallStart(callSid, phoneNumber);
      
      return connection;
    } catch (error) {
      console.error('Error starting Julie AI session:', error);
      throw error;
    }
  }

  async endSession(callSid) {
    try {
      const session = this.activeSessions.get(callSid);
      if (session) {
        // Log call end
        await this.logCallEnd(callSid, session);
        
        // Disconnect Moshi
        this.moshiInterface.disconnect(callSid);
        
        // Clean up
        this.activeSessions.delete(callSid);
      }
    } catch (error) {
      console.error('Error ending Julie AI session:', error);
    }
  }

  async handleIncomingAudio(callSid, audioData) {
    const session = this.activeSessions.get(callSid);
    if (session && session.connection) {
      await this.moshiInterface.sendAudio(session.connection, audioData);
    }
  }

  async logCallStart(callSid, phoneNumber) {
    try {
      await supabase.from('voice_calls').insert({
        call_sid: callSid,
        phone_number: phoneNumber,
        status: 'in_progress',
        ai_system: 'julie_moshi',
        started_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging call start:', error);
    }
  }

  async logCallEnd(callSid, session) {
    try {
      const duration = Math.floor((new Date() - session.startTime) / 1000);
      
      await supabase
        .from('voice_calls')
        .update({
          status: 'completed',
          duration_seconds: duration,
          ended_at: new Date().toISOString(),
          transcript: session.connection.context.messages,
          patient_info: session.connection.context.patientInfo
        })
        .eq('call_sid', callSid);
    } catch (error) {
      console.error('Error logging call end:', error);
    }
  }

  // Get active session info
  getSession(callSid) {
    return this.activeSessions.get(callSid);
  }

  // Get all active sessions
  getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([callSid, session]) => ({
      callSid,
      phoneNumber: session.phoneNumber,
      duration: Math.floor((new Date() - session.startTime) / 1000),
      stage: session.connection.context.conversationStage
    }));
  }
}

// Export singleton instance
const julieAI = new JulieAIService();
export default julieAI;