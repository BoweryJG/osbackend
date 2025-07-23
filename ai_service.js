import path from 'path';
import { fileURLToPath } from 'url';

import OpenAI from 'openai';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// OpenAI client for Whisper
const openai = process.env.OPENAI_API_KEY ? 
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : 
  null;

// OpenRouter functionality disabled
const OPENROUTER_API_KEY = null;
const OPENROUTER_BASE_URL = null;

/**
 * Transcribe audio using either OpenAI Whisper or Gemini via OpenRouter
 * @param {Buffer|File} audioData - Audio file data
 * @param {Object} options - Transcription options
 * @param {string} options.provider - 'openai' or 'gemini'
 * @param {string} options.language - Language code (optional)
 * @param {string} options.prompt - Context prompt (optional)
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeAudio(audioData, options = {}) {
  const { provider = 'openai', language = 'en', prompt } = options;
  
  try {
    if (provider === 'openai' && openai) {
      // Use OpenAI Whisper
      console.log('Transcribing with OpenAI Whisper...');
      
      // Convert Buffer to File if needed
      let file = audioData;
      if (Buffer.isBuffer(audioData)) {
        file = new File([audioData], 'audio.mp3', { type: 'audio/mp3' });
      }
      
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: language,
        prompt: prompt,
        response_format: 'verbose_json'
      });
      
      return {
        provider: 'openai',
        text: transcription.text,
        segments: transcription.segments,
        language: transcription.language,
        duration: transcription.duration
      };
      
    } else if (provider === 'gemini' && OPENROUTER_API_KEY) {
      // Use Gemini via OpenRouter
      console.log('Transcribing with Gemini via OpenRouter...');
      
      // Convert audio to base64
      const base64Audio = Buffer.isBuffer(audioData) ? 
        audioData.toString('base64') : 
        Buffer.from(await audioData.arrayBuffer()).toString('base64');
      
      const response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: 'google/gemini-2.0-flash-exp',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Transcribe this audio recording. ${prompt || 'Provide a complete and accurate transcription.'} Return the transcription in JSON format with the following structure: { "text": "full transcription", "language": "detected language code" }`
              },
              {
                type: 'audio_url',
                audio_url: {
                  url: `data:audio/mp3;base64,${base64Audio}`
                }
              }
            ]
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
            'X-Title': 'Audio Transcription',
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Parse the response
      const content = response.data.choices[0].message.content;
      let transcriptionData;
      
      try {
        // Try to parse as JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          transcriptionData = JSON.parse(jsonMatch[0]);
        } else {
          transcriptionData = { text: content, language: language };
        }
      } catch (e) {
        transcriptionData = { text: content, language: language };
      }
      
      return {
        provider: 'gemini',
        text: transcriptionData.text,
        language: transcriptionData.language || language,
        model: 'gemini-2.0-flash-exp'
      };
    }
    
    throw new Error(`No valid provider available. Provider: ${provider}, OpenAI: ${!!openai}, OpenRouter: ${!!OPENROUTER_API_KEY}`);
    
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

/**
 * Analyze transcribed text using either OpenAI or Gemini via OpenRouter
 * @param {string} text - Transcribed text to analyze
 * @param {Object} options - Analysis options
 * @param {string} options.provider - 'openai' or 'gemini'
 * @param {string} options.contactName - Contact name for context
 * @param {string} options.analysisType - Type of analysis to perform
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeTranscription(text, options = {}) {
  const { 
    provider = 'gemini', 
    contactName, 
    analysisType = 'sales_call',
    customPrompt 
  } = options;
  
  // Default analysis prompt for sales calls
  const defaultPrompt = `
    You are analyzing a ${analysisType === 'sales_call' ? 'sales call' : 'business'} recording. Please provide:
    
    1. Executive summary (2-3 sentences)
    2. Overall sentiment analysis (positive/neutral/negative)
    3. Key discussion points (bullet points)
    4. Action items identified
    5. Main topics discussed
    6. ${analysisType === 'sales_call' ? 'Sales' : 'Call'} metrics analysis including:
       - Talk-to-listen ratio (if identifiable)
       - Number of questions asked
       - Number of objections raised
       - Whether next steps were clearly defined
    
    ${contactName ? `The call is with ${contactName}.` : ''}
    
    Format the response as a JSON object with the following structure:
    {
      "summary": "executive summary",
      "sentiment": "positive/neutral/negative",
      "keyPoints": ["point 1", "point 2"],
      "actionItems": ["action 1", "action 2"],
      "topics": ["topic 1", "topic 2"],
      "callMetrics": {
        "talkToListenRatio": 0.6,
        "questionCount": 5,
        "objectionCount": 2,
        "nextStepsIdentified": true
      }
    }
  `;
  
  const prompt = customPrompt || defaultPrompt;
  
  try {
    let response;
    
    if (provider === 'openai' && OPENROUTER_API_KEY) {
      // Use OpenAI via OpenRouter
      console.log('Analyzing with OpenAI GPT-4 via OpenRouter...');
      
      response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: 'openai/gpt-4-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert business analyst specializing in conversation analysis.'
            },
            {
              role: 'user',
              content: `${prompt}\n\nTranscription:\n${text}`
            }
          ],
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
            'X-Title': 'Transcription Analysis',
            'Content-Type': 'application/json'
          }
        }
      );
      
    } else if (provider === 'gemini' && OPENROUTER_API_KEY) {
      // Use Gemini via OpenRouter
      console.log('Analyzing with Gemini via OpenRouter...');
      
      response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: 'google/gemini-2.0-flash-exp',
          messages: [
            {
              role: 'user',
              content: `${prompt}\n\nTranscription:\n${text}`
            }
          ],
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
            'X-Title': 'Transcription Analysis',
            'Content-Type': 'application/json'
          }
        }
      );
    } else {
      throw new Error(`No valid provider available for analysis`);
    }
    
    // Parse the response
    const content = response.data.choices[0].message.content;
    let analysisResult;
    
    try {
      // Try to parse as JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback structure
        analysisResult = {
          summary: content.substring(0, 200),
          sentiment: 'neutral',
          keyPoints: [],
          actionItems: [],
          topics: [],
          callMetrics: {}
        };
      }
    } catch (e) {
      console.error('Error parsing analysis result:', e);
      analysisResult = {
        summary: content.substring(0, 200),
        sentiment: 'neutral',
        keyPoints: [],
        actionItems: [],
        topics: [],
        callMetrics: {},
        rawContent: content
      };
    }
    
    return {
      provider: provider,
      model: provider === 'gemini' ? 'gemini-2.0-flash-exp' : 'gpt-4-turbo',
      analysis: analysisResult,
      usage: response.data.usage
    };
    
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
}

/**
 * Process audio file with transcription and analysis
 * @param {Buffer|File} audioData - Audio file data
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Complete processing result
 */
export async function processAudioWithAI(audioData, options = {}) {
  const {
    transcriptionProvider = 'openai',
    analysisProvider = 'gemini',
    contactName,
    analysisType = 'sales_call',
    language = 'en',
    userId,
    metadata = {}
  } = options;
  
  try {
    // Step 1: Transcribe audio
    console.log(`Starting transcription with ${transcriptionProvider}...`);
    const transcriptionResult = await transcribeAudio(audioData, {
      provider: transcriptionProvider,
      language: language
    });
    
    // Step 2: Analyze transcription
    console.log(`Starting analysis with ${analysisProvider}...`);
    const analysisResult = await analyzeTranscription(transcriptionResult.text, {
      provider: analysisProvider,
      contactName: contactName,
      analysisType: analysisType
    });
    
    // Step 3: Store results in Supabase if userId provided
    let recordingId = null;
    if (userId && supabase) {
      const { data, error } = await supabase
        .from('call_recordings')
        .insert({
          user_id: userId,
          source: metadata.source || 'api',
          external_id: metadata.external_id,
          transcription: transcriptionResult.text,
          analysis_results: analysisResult.analysis,
          status: 'analyzed',
          duration: transcriptionResult.duration || 0,
          file_name: metadata.fileName,
          file_size: metadata.fileSize,
          contact_id: metadata.contactId,
          automation_metadata: {
            transcription_provider: transcriptionProvider,
            analysis_provider: analysisProvider,
            language: transcriptionResult.language,
            ...metadata
          },
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (!error && data) {
        recordingId = data.id;
      }
    }
    
    return {
      success: true,
      recordingId: recordingId,
      transcription: transcriptionResult,
      analysis: analysisResult,
      metadata: {
        transcriptionProvider,
        analysisProvider,
        language: transcriptionResult.language,
        processedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Audio processing error:', error);
    return {
      success: false,
      error: error.message,
      details: error.response?.data || error
    };
  }
}

// Export models available
export const AVAILABLE_MODELS = {
  transcription: {
    openai: 'whisper-1',
    gemini: 'gemini-2.0-flash-exp'
  },
  analysis: {
    openai: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    gemini: ['gemini-2.0-flash-exp', 'gemini-pro'],
    anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
  }
};