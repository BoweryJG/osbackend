import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';

import dotenv from 'dotenv';
import OpenAI from 'openai';


import logger from '../utils/logger.js';

import { ElevenLabsTTS } from './elevenLabsTTS.js';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

class HarveyVoiceService {
  constructor() {
    if (HarveyVoiceService.instance) {
      return HarveyVoiceService.instance;
    }

    this.openai = null;
    this.elevenLabsTTS = null;
    this.voiceSettings = {
      model: 'tts-1',
      voice: 'onyx', // Deep, authoritative voice for Harvey
      speed: 0.95, // Slightly slower for gravitas
    };

    this.initializeOpenAI();
    this.initializeElevenLabs();
    this.harveyPhrases = this.loadHarveyPhrases();

    // Set the singleton instance
    HarveyVoiceService.instance = this;
  }

  static getInstance() {
    if (!HarveyVoiceService.instance) {
      HarveyVoiceService.instance = new HarveyVoiceService();
    }
    return HarveyVoiceService.instance;
  }

  initializeOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn('Harvey Voice: OpenAI API key not configured');
      return;
    }

    this.openai = new OpenAI({ apiKey });
  }

  initializeElevenLabs() {
    try {
      this.elevenLabsTTS = new ElevenLabsTTS({
        voiceId: 'antoni', // Professional male voice for Harvey
        modelId: 'eleven_turbo_v2',
        stability: 0.6, // More stable for authoritative voice
        similarityBoost: 0.8,
        style: 0.2, // Slight style for personality
        outputFormat: 'mp3_44100_128' // High quality for Harvey
      });
      logger.info('Harvey Voice: ElevenLabs TTS initialized with Antoni voice');
    } catch (error) {
      logger.error('Harvey Voice: Failed to initialize ElevenLabs:', error);
    }
  }

  loadHarveyPhrases() {
    return {
      greetings: [
        "I don't have time for pleasantries. Show me results.",
        "You're here to win, or you're here to waste my time. Which is it?",
        "Welcome to the major leagues. Try not to embarrass yourself.",
        "I hope you brought your A-game. I don't coach losers."
      ],
      verdicts: {
        excellent: [
          "Now that's what I call closing. You almost impressed me.",
          "Finally, someone who gets it. Keep this up and you might actually matter.",
          "That's the killer instinct I'm looking for. Don't let it go to your head.",
          "You just played the game like a pro. Almost like I taught you something."
        ],
        good: [
          "Not bad. But 'not bad' doesn't make you a legend.",
          "You're showing promise. Promise doesn't pay the bills.",
          "Better than yesterday. Still not good enough for tomorrow.",
          "I've seen worse. I've also seen much better."
        ],
        poor: [
          "That was painful to watch. And I don't feel pain easily.",
          "You call that closing? I call it career suicide.",
          "If mediocrity was a crime, you'd get life without parole.",
          "I've seen better performances from first-year law students."
        ]
      },
      coaching: {
        confidence: [
          "Your voice is shaking. Winners don't shake, they make others shake.",
          "Square your shoulders. Confidence is 90% posture, 10% voice.",
          "Stop apologizing with your tone. You're not sorry, you're closing.",
          "Channel that nervous energy into conviction. Now."
        ],
        pace: [
          "Slow down. Power comes from pauses, not speed.",
          "You're rushing. Make them wait for your words.",
          "Each word should land like a verdict. Give them weight.",
          "Speed implies nervousness. Control implies power."
        ],
        objections: [
          "Never accept the first 'no'. It's just a test.",
          "Their objection is fear. Your job is to be fearless.",
          "Flip their concern into your advantage. Always be pivoting.",
          "An objection is an unopened door. Kick it down."
        ],
        closing: [
          "Stop asking for permission. Assume the sale.",
          "The close started the moment you dialed. Finish it.",
          "They're waiting for you to lead. So lead.",
          "ABC - Always Be Closing. Did you forget the basics?"
        ]
      },
      motivation: [
        "Winners focus on winning. Losers focus on winners. Which are you?",
        "Success isn't given, it's taken. So take it.",
        "I don't play the odds, I play the man. Learn the difference.",
        "You want to be a shark? Stop swimming with the minnows.",
        "Loyalty is a two-way street. Show me results, I'll show you respect."
      ],
      battleMode: [
        "Battle mode activated. Show them what a real closer looks like.",
        "This is where legends are made. Don't choke.",
        "Your opponent thinks they can beat you. Prove them wrong.",
        "In battle, there's no second place. Only first and forgotten."
      ],
      callAnalysis: {
        opening: [
          "That opening was weak. You gave them control from word one.",
          "Strong opener. You had them before they knew what hit them.",
          "Next time, lead with confidence, not questions.",
          "Perfect. You owned the conversation from 'hello'."
        ],
        middle: [
          "You lost momentum in the middle. Never let up.",
          "Good recovery from their objection. That's how it's done.",
          "You're talking too much. Let them sell themselves.",
          "Excellent use of silence. Make them fill the void."
        ],
        closing: [
          "You fumbled the close. All that work for nothing.",
          "Textbook closing. You made it inevitable.",
          "You asked for the sale. Winners don't ask, they assume.",
          "That's how you close. No mercy, no hesitation."
        ]
      }
    };
  }

  async generateHarveyResponse(type, context = {}) {
    // Select appropriate phrase based on type and context
    let text = '';
    
    switch (type) {
      case 'greeting':
        text = this.getRandomPhrase(this.harveyPhrases.greetings);
        break;
        
      case 'verdict':
        const performance = context.performance || 'poor';
        text = this.getRandomPhrase(this.harveyPhrases.verdicts[performance]);
        break;
        
      case 'coaching':
        const coachingType = context.coachingType || 'confidence';
        text = this.getRandomPhrase(this.harveyPhrases.coaching[coachingType]);
        break;
        
      case 'motivation':
        text = this.getRandomPhrase(this.harveyPhrases.motivation);
        break;
        
      case 'battle':
        text = this.getRandomPhrase(this.harveyPhrases.battleMode);
        break;
        
      case 'call-analysis':
        const phase = context.phase || 'opening';
        text = this.getRandomPhrase(this.harveyPhrases.callAnalysis[phase]);
        break;
        
      case 'custom':
        text = context.text || "I don't repeat myself. Pay attention the first time.";
        break;
        
      default:
        text = "Stop wasting time. Get back to work.";
    }

    // Add personalization if user data provided
    if (context.userName && Math.random() > 0.7) {
      text = `${context.userName}, ${text.toLowerCase()}`;
    }

    return {
      text,
      type,
      context,
      timestamp: new Date().toISOString()
    };
  }

  async synthesizeVoice(text) {
    // Try ElevenLabs first for best quality
    if (this.elevenLabsTTS) {
      try {
        // Generate speech using ElevenLabs
        const audioBuffer = await this.elevenLabsTTS.textToSpeech(text, {
          optimizeLatency: 2 // Balance quality and latency for Harvey
        });
        
        // Convert to base64 for easy transmission
        const base64Audio = audioBuffer.toString('base64');
        const audioDataUri = `data:audio/mp3;base64,${base64Audio}`;

        return {
          audio: audioDataUri,
          text,
          duration: this.estimateDuration(text),
          format: 'mp3',
          voice: 'antoni'
        };
      } catch (elevenLabsError) {
        logger.error('ElevenLabs TTS failed, falling back to OpenAI:', elevenLabsError);
      }
    }

    // Fallback to OpenAI if ElevenLabs fails
    if (!this.openai) {
      // Return a placeholder if neither service is configured
      return {
        audio: null,
        text,
        duration: this.estimateDuration(text),
        error: 'Voice synthesis not configured'
      };
    }

    try {
      // Generate speech using OpenAI TTS
      const mp3 = await this.openai.audio.speech.create({
        model: this.voiceSettings.model,
        voice: this.voiceSettings.voice,
        input: text,
        speed: this.voiceSettings.speed,
      });

      // Convert response to buffer
      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      // Convert to base64 for easy transmission
      const base64Audio = buffer.toString('base64');
      const audioDataUri = `data:audio/mp3;base64,${base64Audio}`;

      return {
        audio: audioDataUri,
        text,
        duration: this.estimateDuration(text),
        format: 'mp3',
        voice: this.voiceSettings.voice
      };
    } catch (error) {
      logger.error('Error synthesizing Harvey voice:', error);
      return {
        audio: null,
        text,
        duration: this.estimateDuration(text),
        error: error.message
      };
    }
  }

  async generateVerdict(userMetrics) {
    // Determine performance level
    let performance = 'poor';
    if (userMetrics.closingRate >= 80) {
      performance = 'excellent';
    } else if (userMetrics.closingRate >= 60) {
      performance = 'good';
    }

    // Generate contextual verdict
    const response = await this.generateHarveyResponse('verdict', {
      performance,
      userName: userMetrics.userName
    });

    // Add specific advice based on metrics
    if (userMetrics.currentStreak === 0) {
      response.text += " Your streak is broken. Time to rebuild.";
    } else if (userMetrics.currentStreak > 10) {
      response.text += " That streak is impressive. Don't get comfortable.";
    }

    // Synthesize the verdict
    const audio = await this.synthesizeVoice(response.text);
    
    return {
      ...response,
      ...audio,
      metrics: {
        closingRate: userMetrics.closingRate,
        streak: userMetrics.currentStreak,
        performance
      }
    };
  }

  async generateCoachingAudio(voiceAnalysis) {
    let coachingType = 'confidence';
    let urgency = 'normal';

    // Determine coaching type based on voice analysis
    if (voiceAnalysis.confidence < 50) {
      coachingType = 'confidence';
      urgency = 'high';
    } else if (voiceAnalysis.pace === 'fast') {
      coachingType = 'pace';
      urgency = 'medium';
    } else if (voiceAnalysis.tone === 'nervous') {
      coachingType = 'confidence';
      urgency = 'high';
    }

    const response = await this.generateHarveyResponse('coaching', {
      coachingType,
      voiceMetrics: voiceAnalysis
    });

    const audio = await this.synthesizeVoice(response.text);

    return {
      ...response,
      ...audio,
      urgency,
      coachingType,
      whisper: urgency === 'high' // Whisper urgent coaching
    };
  }

  async generateBattleModeAudio(event, participants) {
    let text = '';
    
    switch (event) {
      case 'start':
        text = "Battle mode initiated. Two enter, one leaves victorious. Begin!";
        break;
      case 'winner':
        text = `Victory! ${participants.winner} just showed what real closing looks like.`;
        break;
      case 'taunt':
        text = this.getRandomPhrase([
          "Is that the best you've got? My grandmother closes harder than that.",
          "Your opponent is destroying you. Fight back or forfeit.",
          "This isn't even close. Step up or step out.",
          "Now that's what I call domination. Keep pushing."
        ]);
        break;
    }

    const response = await this.generateHarveyResponse('custom', { text });
    const audio = await this.synthesizeVoice(response.text);
    
    return {
      ...response,
      ...audio,
      event,
      participants
    };
  }

  async streamAudioResponse(text, websocket) {
    if (!this.openai || !websocket) return;

    try {
      const mp3 = await this.openai.audio.speech.create({
        model: this.voiceSettings.model,
        voice: this.voiceSettings.voice,
        input: text,
        speed: this.voiceSettings.speed,
        stream: true
      });

      // Stream audio chunks to websocket
      for await (const chunk of mp3) {
        if (websocket.readyState === websocket.OPEN) {
          websocket.send(JSON.stringify({
            type: 'audio-chunk',
            data: Buffer.from(chunk).toString('base64'),
            complete: false
          }));
        }
      }

      // Send completion message
      if (websocket.readyState === websocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'audio-chunk',
          complete: true,
          text: text
        }));
      }
    } catch (error) {
      logger.error('Error streaming audio:', error);
    }
  }

  getRandomPhrase(phrases) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  estimateDuration(text) {
    // Estimate duration based on text length (roughly 150 words per minute)
    const words = text.split(' ').length;
    return Math.ceil((words / 150) * 60 * 1000); // Duration in milliseconds
  }

  // Real-time call analysis
  async analyzeCallSegment(transcript, phase = 'middle') {
    const response = await this.generateHarveyResponse('call-analysis', {
      phase,
      transcript
    });

    // Quick analysis based on keywords
    const analysisPoints = [];
    
    if (transcript.toLowerCase().includes('um') || transcript.toLowerCase().includes('uh')) {
      analysisPoints.push("Stop with the filler words. Silence is better than 'um'.");
    }
    
    if (transcript.includes('?') && phase === 'closing') {
      analysisPoints.push("Stop asking questions at the close. Make statements.");
    }
    
    if (transcript.toLowerCase().includes('maybe') || transcript.toLowerCase().includes('possibly')) {
      analysisPoints.push("Maybe? Possibly? Use definitive language or go home.");
    }

    if (analysisPoints.length > 0) {
      response.text += ' ' + analysisPoints[0];
    }

    const audio = await this.synthesizeVoice(response.text);
    
    return {
      ...response,
      ...audio,
      phase,
      analysisPoints
    };
  }
}

export default HarveyVoiceService;