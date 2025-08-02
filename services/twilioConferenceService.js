import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import EventEmitter from 'events';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Twilio Conference Service for 3-way calls with whisper coaching
 */
class TwilioConferenceService extends EventEmitter {
  constructor() {
    super();
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.conferences = new Map();
    this.baseUrl = process.env.SITE_URL || 'https://osbackend-zl1h.onrender.com';
  }
  
  async createCoachingConference(repPhone, clientPhone, coachId) {
    const conferenceName = `coaching-${Date.now()}`;
    const conferenceId = `conf-${conferenceName}`;
    
    console.log(`Creating coaching conference: ${conferenceName}`);
    
    // Create conference record
    const conferenceData = {
      id: conferenceId,
      name: conferenceName,
      coachId,
      repPhone,
      clientPhone,
      status: 'initializing',
      createdAt: new Date()
    };
    
    this.conferences.set(conferenceId, conferenceData);
    
    // Save to database
    await supabase.from('coaching_conferences').insert({
      id: conferenceId,
      conference_name: conferenceName,
      coach_id: coachId,
      rep_phone: repPhone,
      client_phone: clientPhone,
      status: 'initializing'
    });
    
    // Create TwiML for each participant
    const repTwiml = this.createParticipantTwiml(conferenceName, 'rep');
    const clientTwiml = this.createParticipantTwiml(conferenceName, 'client');
    const coachTwiml = this.createCoachTwiml(conferenceName);
    
    // Store TwiML endpoints
    await this.storeTwimlEndpoints(conferenceId, {
      rep: repTwiml,
      client: clientTwiml,
      coach: coachTwiml
    });
    
    // Initiate calls to rep and client
    const repCall = await this.initiateCall(repPhone, repTwiml.url, 'rep', conferenceId);
    const clientCall = await this.initiateCall(clientPhone, clientTwiml.url, 'client', conferenceId);
    
    // Update conference data
    conferenceData.repCallSid = repCall.sid;
    conferenceData.clientCallSid = clientCall.sid;
    conferenceData.status = 'connecting';
    conferenceData.coachingChannel = `coach-whisper-${conferenceName}`;
    conferenceData.dialInNumber = process.env.TWILIO_PHONE_NUMBER;
    
    // Generate coach dial-in instructions
    const coachAccessCode = this.generateAccessCode();
    conferenceData.coachAccessCode = coachAccessCode;
    
    return {
      sid: conferenceId,
      friendlyName: conferenceName,
      coachingChannel: conferenceData.coachingChannel,
      dialInNumber: conferenceData.dialInNumber,
      accessCode: coachAccessCode,
      status: 'connecting',
      participants: {
        rep: { phone: repPhone, callSid: repCall.sid },
        client: { phone: clientPhone, callSid: clientCall.sid },
        coach: { id: coachId, status: 'pending' }
      }
    };
  }
  
  createParticipantTwiml(conferenceName, role) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'alice'
    }, `Connecting you to the call. You are joining as ${role}.`);
    
    const dial = twiml.dial();
    dial.conference({
      beep: role === 'client' ? 'false' : 'true',
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
      statusCallback: `${this.baseUrl}/api/voice/conference-status`,
      statusCallbackEvent: 'start end join leave mute hold speaker'
    }, conferenceName);
    
    return {
      twiml: twiml.toString(),
      url: `${this.baseUrl}/api/voice/twiml/${conferenceName}/${role}`
    };
  }
  
  createCoachTwiml(conferenceName) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Coach enters with special whisper mode
    twiml.say({
      voice: 'alice'
    }, 'Welcome coach. You are joining in whisper mode. Press 1 to speak to everyone, press 2 to whisper to the rep only.');
    
    const dial = twiml.dial();
    const conference = dial.conference({
      beep: false,
      startConferenceOnEnter: false,
      endConferenceOnExit: false,
      muted: true, // Start muted
      coach: true, // Special coach participant
      statusCallback: `${this.baseUrl}/api/voice/conference-status`,
      statusCallbackEvent: 'start end join leave mute hold speaker'
    }, conferenceName);
    
    // Coach controls
    conference.on('keypress', (digit) => {
      if (digit === '1') {
        // Unmute to speak to everyone
        this.toggleCoachMode(conferenceName, 'broadcast');
      } else if (digit === '2') {
        // Whisper mode - only rep can hear
        this.toggleCoachMode(conferenceName, 'whisper');
      } else if (digit === '0') {
        // Mute
        this.toggleCoachMode(conferenceName, 'mute');
      }
    });
    
    return {
      twiml: twiml.toString(),
      url: `${this.baseUrl}/api/voice/twiml/${conferenceName}/coach`
    };
  }
  
  async initiateCall(toNumber, twimlUrl, role, conferenceId) {
    try {
      const call = await this.client.calls.create({
        to: toNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: twimlUrl,
        statusCallback: `${this.baseUrl}/api/voice/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        machineDetection: 'DetectMessageEnd',
        machineDetectionTimeout: 5000,
        asyncAmd: true,
        asyncAmdStatusCallback: `${this.baseUrl}/api/voice/amd-status`
      });
      
      console.log(`Initiated call to ${role}: ${call.sid}`);
      
      // Store call info
      await supabase.from('conference_calls').insert({
        conference_id: conferenceId,
        call_sid: call.sid,
        role,
        to_number: toNumber,
        status: 'initiated'
      });
      
      return call;
    } catch (error) {
      console.error(`Error initiating call to ${role}:`, error);
      throw error;
    }
  }
  
  async toggleCoachMode(conferenceName, mode) {
    const conference = Array.from(this.conferences.values())
      .find(c => c.name === conferenceName);
    
    if (!conference) return;
    
    try {
      // Get conference participants
      const participants = await this.client
        .conferences(conferenceName)
        .participants
        .list();
      
      const coach = participants.find(p => p.label === 'coach');
      if (!coach) return;
      
      switch (mode) {
        case 'broadcast':
          // Unmute coach - everyone can hear
          await coach.update({ muted: false, coaching: false });
          this.emit('coach-mode', { conference: conferenceName, mode: 'broadcast' });
          break;
          
        case 'whisper':
          // Coach whisper mode - only rep can hear
          await coach.update({ muted: false, coaching: true });
          this.emit('coach-mode', { conference: conferenceName, mode: 'whisper' });
          break;
          
        case 'mute':
          // Mute coach
          await coach.update({ muted: true });
          this.emit('coach-mode', { conference: conferenceName, mode: 'mute' });
          break;
      }
      
      // Update database
      await supabase
        .from('coaching_conferences')
        .update({ coach_mode: mode })
        .eq('conference_name', conferenceName);
        
    } catch (error) {
      console.error('Error toggling coach mode:', error);
    }
  }
  
  async endConference(conferenceId) {
    const conference = this.conferences.get(conferenceId);
    if (!conference) return;
    
    try {
      // End the Twilio conference
      await this.client
        .conferences(conference.name)
        .update({ status: 'completed' });
      
      // Update database
      await supabase
        .from('coaching_conferences')
        .update({ 
          status: 'completed',
          ended_at: new Date()
        })
        .eq('id', conferenceId);
      
      this.conferences.delete(conferenceId);
      
      console.log(`Conference ended: ${conferenceId}`);
    } catch (error) {
      console.error('Error ending conference:', error);
    }
  }
  
  generateAccessCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  async storeTwimlEndpoints(conferenceId, endpoints) {
    // Store TwiML endpoints for reference
    await supabase
      .from('conference_twiml_endpoints')
      .insert({
        conference_id: conferenceId,
        rep_url: endpoints.rep.url,
        client_url: endpoints.client.url,
        coach_url: endpoints.coach.url
      });
  }
}

// Export singleton
const twilioConferenceService = new TwilioConferenceService();
export default twilioConferenceService;