import { Buffer } from 'buffer';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Conversation Context Manager
class ConversationContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.messages = [];
    this.patientInfo = {};
    this.currentStage = 'initial';
    this.lastActivity = Date.now();
    this.metadata = {
      startTime: Date.now(),
      totalMessages: 0,
      intents: []
    };
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    this.metadata.totalMessages++;
    this.lastActivity = Date.now();
    
    // Keep only last 10 messages for context
    if (this.messages.length > 10) {
      this.messages = this.messages.slice(-10);
    }
  }

  updatePatientInfo(info) {
    this.patientInfo = { ...this.patientInfo, ...info };
  }

  getSystemPrompt() {
    return `You are Julie, a friendly and professional AI assistant for Dr. Pedro's dental practice. 
    
    You help patients with:
    - Scheduling appointments
    - Answering questions about services
    - Providing practice information
    - Handling emergencies appropriately
    - Taking callback requests
    
    Current patient info: ${JSON.stringify(this.patientInfo)}
    
    Keep responses conversational, helpful, and under 150 words. Always sound professional but warm.`;
  }

  getContext() {
    return {
      sessionId: this.sessionId,
      messages: this.messages,
      patientInfo: this.patientInfo,
      currentStage: this.currentStage,
      metadata: this.metadata
    };
  }
}

// Patient Information Extractor
class PatientInfoExtractor {
  static extractPatientInfo(text) {
    const info = {};
    
    // Extract name patterns
    const namePatterns = [
      /my name is ([a-zA-Z\s]+)/i,
      /i'm ([a-zA-Z\s]+)/i,
      /this is ([a-zA-Z\s]+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        info.name = match[1].trim();
        break;
      }
    }
    
    // Extract phone number
    const phoneMatch = text.match(/(\d{3}[-.]?\d{3}[-.]?\d{4})/);
    if (phoneMatch) {
      info.phone = phoneMatch[1];
    }
    
    // Extract date preferences
    const datePatterns = [
      /tomorrow/i,
      /today/i,
      /next week/i,
      /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i
    ];
    
    for (const pattern of datePatterns) {
      if (pattern.test(text)) {
        info.preferredDate = text.match(pattern)[0];
        break;
      }
    }
    
    return info;
  }
}

// Database Logger
class DatabaseLogger {
  static async logCall(sessionId, type, data) {
    try {
      const { error } = await supabase
        .from('call_logs')
        .insert({
          session_id: sessionId,
          call_type: type,
          data,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('Database logging error:', error);
      }
    } catch (error) {
      console.error('Database logging error:', error);
    }
  }
}

// Simple AI Assistant Service
class AIAssistantService {
  constructor() {
    this.connections = new Map();
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    // Initialize OpenAI client
    this.openai = this.openaiKey ? new OpenAI({ apiKey: this.openaiKey }) : null;
  }

  async processTranscript(sessionId, transcript) {
    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    console.log(`Patient: ${transcript}`);
    
    // Get or create connection context
    let connection = this.connections.get(sessionId);
    if (!connection) {
      connection = {
        sessionId,
        context: new ConversationContext(sessionId),
        state: 'ready',
        lastActivity: Date.now()
      };
      this.connections.set(sessionId, connection);
    }
    
    // Update context
    connection.context.addMessage('user', transcript);
    connection.lastActivity = Date.now();

    // Determine response type
    const intent = this.determineIntent(transcript);
    let response = '';

    switch (intent) {
      case 'greeting':
        response = await this.handleGreeting(connection);
        break;
      case 'appointment':
        response = await this.handleAppointment(connection, transcript);
        break;
      case 'information':
        response = await this.handleInformation(connection, transcript);
        break;
      case 'emergency':
        response = await this.handleEmergency(connection);
        break;
      case 'callback':
        response = await this.handleCallback(connection, transcript);
        break;
      case 'inquiry':
        response = await this.handleInquiry(connection, transcript);
        break;
      default:
        response = await this.handleGeneral(connection, transcript);
    }

    return response;
  }

  determineIntent(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('good morning') || lower.includes('good afternoon')) {
      return 'greeting';
    }
    
    if (lower.includes('appointment') || lower.includes('schedule') || lower.includes('book')) {
      return 'appointment';
    }
    
    if (lower.includes('emergency') || lower.includes('urgent') || lower.includes('pain')) {
      return 'emergency';
    }
    
    if (lower.includes('call me back') || lower.includes('callback') || lower.includes('return call')) {
      return 'callback';
    }
    
    if (lower.includes('hours') || lower.includes('location') || lower.includes('address') || lower.includes('insurance')) {
      return 'information';
    }
    
    if (lower.includes('?') || lower.includes('how') || lower.includes('what') || lower.includes('when')) {
      return 'inquiry';
    }
    
    return 'general';
  }

  async handleGreeting(connection) {
    const responses = [
      "Hello! Thank you for calling Dr. Pedro's office. I'm Julie, your AI assistant. How can I help you today?",
      "Good morning! This is Julie from Dr. Pedro's dental practice. How may I assist you?",
      "Hi there! I'm Julie, Dr. Pedro's AI assistant. What can I do for you today?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async handleAppointment(connection, transcript) {
    // Extract patient information
    const patientInfo = PatientInfoExtractor.extractPatientInfo(transcript);
    connection.context.updatePatientInfo(patientInfo);
    
    // Log appointment request
    await DatabaseLogger.logCall(connection.sessionId, 'appointment_request', {
      transcript,
      patientInfo
    });
    
    return "I'd be happy to help you schedule an appointment with Dr. Pedro. " +
           "Let me check our availability. Can you please provide your full name and preferred date?";
  }

  async handleEmergency(connection) {
    // Log emergency call
    await DatabaseLogger.logCall(connection.sessionId, 'emergency', {
      timestamp: Date.now(),
      priority: 'high'
    });
    
    return "I understand this is urgent. For dental emergencies, please call our emergency line at " +
           "555-EMERGENCY, or if this is a medical emergency, please call 911 immediately. " +
           "I can also have Dr. Pedro call you back as soon as possible.";
  }

  async handleInformation(connection, transcript) {
    const lower = transcript.toLowerCase();
    
    if (lower.includes('hours')) {
      return "Our office hours are Monday through Friday, 8 AM to 6 PM, and Saturday 9 AM to 3 PM. " +
             "We're closed on Sundays.";
    }
    
    if (lower.includes('location') || lower.includes('address')) {
      return "We're located at 123 Main Street, Suite 200, New York, NY 10001. " +
             "We're easily accessible by subway and have parking available.";
    }
    
    if (lower.includes('insurance')) {
      return "We accept most major insurance plans including Delta Dental, MetLife, and Cigna. " +
             "Please bring your insurance card to your appointment so we can verify your benefits.";
    }
    
    return "I can provide information about our services, hours, location, and insurance. " +
           "What specific information would you like to know?";
  }

  async handleCallback(connection, transcript) {
    // Extract phone number if provided
    const phoneMatch = transcript.match(/(\d{3}[-.]?\d{3}[-.]?\d{4})/);
    if (phoneMatch) {
      connection.context.updatePatientInfo({ phone: phoneMatch[1] });
    }
    
    // Log callback request
    await DatabaseLogger.logCall(connection.sessionId, 'callback_request', {
      transcript,
      patientInfo: connection.context.patientInfo
    });
    
    return "Of course! I'll have someone from our team call you right back. " +
           "We typically return calls within 5 minutes during business hours. " +
           "Is " + (connection.context.patientInfo.phone || "the number you're calling from") + " the best number?";
  }

  async handleInquiry(connection, transcript) {
    // Use AI to answer specific questions about services, pricing, etc.
    return await this.generateAIResponse(connection, transcript);
  }

  async handleGeneral(connection, transcript) {
    // Default to AI response for general queries
    return await this.generateAIResponse(connection, transcript);
  }

  async generateAIResponse(connection, transcript) {
    try {
      if (!this.openai) {
        throw new Error('OpenAI API key not configured');
      }
      
      const messages = [
        { role: 'system', content: connection.context.getSystemPrompt() },
        ...connection.context.messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }))
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 100, // Keep responses very short for voice
        stream: false
      });

      const aiResponse = response.choices[0].message.content;
      connection.context.addMessage('assistant', aiResponse);
      
      return aiResponse;
    } catch (error) {
      console.error('AI Response Error:', error);
      return "I'm having a bit of trouble. Could you repeat that please?";
    }
  }

  // Cleanup inactive connections
  cleanup() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, connection] of this.connections) {
      if (now - connection.lastActivity > timeout) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.connections.delete(sessionId);
      }
    }
  }
}

// Export the service
export default new AIAssistantService();