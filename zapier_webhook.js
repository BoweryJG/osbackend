import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { processAudioWithAI } from './ai_service.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const router = express.Router();

// Zapier webhook secret for verification
const ZAPIER_WEBHOOK_SECRET = process.env.ZAPIER_WEBHOOK_SECRET || '';

/**
 * Smart contact matching function
 */
async function matchContact(userId, hints = {}) {
  let bestMatch = null;
  let matchConfidence = 0;
  let matchMethod = null;

  try {
    // 1. Try phone number match first (highest confidence)
    if (hints.phone_number) {
      const cleanPhone = hints.phone_number.replace(/\D/g, '');
      const phoneVariants = [
        cleanPhone,
        `+1${cleanPhone}`,
        `1${cleanPhone}`,
        cleanPhone.slice(-10) // Last 10 digits
      ];

      const { data: phoneMatches } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .or(phoneVariants.map(p => `phone_number.eq.${p},cell.eq.${p}`).join(','));

      if (phoneMatches && phoneMatches.length > 0) {
        bestMatch = phoneMatches[0];
        matchConfidence = 0.95;
        matchMethod = 'phone';
      }
    }

    // 2. Try email match (high confidence)
    if (!bestMatch && hints.contact_email) {
      const { data: emailMatch } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .ilike('email', hints.contact_email)
        .single();

      if (emailMatch) {
        bestMatch = emailMatch;
        matchConfidence = 0.9;
        matchMethod = 'email';
      }
    }

    // 3. Try calendar event match
    if (!bestMatch && hints.calendar_event_id) {
      const { data: calendarMatch } = await supabase
        .from('calendar_events')
        .select('*, contacts(*)')
        .eq('event_id', hints.calendar_event_id)
        .eq('user_id', userId)
        .single();

      if (calendarMatch && calendarMatch.contacts) {
        bestMatch = calendarMatch.contacts;
        matchConfidence = 0.85;
        matchMethod = 'calendar';
      }
    }

    // 4. Try fuzzy name match
    if (!bestMatch && hints.contact_name) {
      const nameParts = hints.contact_name.toLowerCase().split(/\s+/);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId);

      if (contacts && contacts.length > 0) {
        // Score each contact
        const scoredContacts = contacts.map(contact => {
          const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.toLowerCase();
          const companyMatch = contact.company?.toLowerCase().includes(hints.contact_name.toLowerCase());
          
          let score = 0;
          // Check how many name parts match
          nameParts.forEach(part => {
            if (fullName.includes(part)) score += 0.3;
          });
          
          // Bonus for exact match
          if (fullName === hints.contact_name.toLowerCase()) score = 1;
          
          // Bonus for company match
          if (companyMatch) score += 0.2;
          
          return { contact, score };
        });

        // Get best match
        const topMatch = scoredContacts.sort((a, b) => b.score - a.score)[0];
        if (topMatch && topMatch.score >= 0.6) {
          bestMatch = topMatch.contact;
          matchConfidence = topMatch.score * 0.7; // Max 0.7 for name match
          matchMethod = 'name';
        }
      }
    }

    // 5. Location-based match (if available)
    if (!bestMatch && hints.location && hints.location.latitude && hints.location.longitude) {
      // This would require location data in contacts table
      // Implement if you have location data
    }

    return {
      contact: bestMatch,
      confidence: matchConfidence,
      method: matchMethod
    };

  } catch (error) {
    console.error('Contact matching error:', error);
    return { contact: null, confidence: 0, method: null };
  }
}

/**
 * Create tasks from action items
 */
async function createTasksFromActionItems(actionItems, userId, contactId, recordingId) {
  if (!actionItems || actionItems.length === 0) return [];

  const tasks = actionItems.map(item => ({
    user_id: userId,
    contact_id: contactId,
    title: item,
    description: `Auto-generated from call recording`,
    due_date: getTaskDueDate(item),
    priority: getTaskPriority(item),
    status: 'pending',
    source: 'zapier_automation',
    related_recording_id: recordingId,
    created_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks)
    .select();

  if (error) {
    console.error('Error creating tasks:', error);
    return [];
  }

  return data;
}

/**
 * Main Zapier webhook handler for PLAUD recordings
 */
router.post('/webhook/plaud-zapier', async (req, res) => {
  try {
    // Verify webhook secret if configured
    const webhookSecret = req.headers['x-zapier-webhook-secret'];
    if (ZAPIER_WEBHOOK_SECRET && webhookSecret !== ZAPIER_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      // Required
      recording_url,
      user_id,
      api_key,
      
      // Optional AI configuration
      transcription_provider = 'openai', // 'openai' or 'gemini'
      analysis_provider = 'gemini', // 'openai' or 'gemini'
      
      // Metadata
      duration,
      device_id,
      device_name,
      timestamp,
      location,
      
      // Contact hints
      phone_number,
      contact_name,
      contact_email,
      meeting_title,
      calendar_event_id,
      
      // PLAUD specific
      plaud_recording_id,
      plaud_user_id,
      
      // Processing options
      create_tasks = true,
      match_contact = true
    } = req.body;

    // Validate required fields
    if (!recording_url) {
      return res.status(400).json({ error: 'Missing recording_url' });
    }

    // Authenticate user
    let userId;
    if (api_key) {
      const { data: apiKeyData } = await supabase
        .from('user_api_keys')
        .select('user_id')
        .eq('api_key', api_key)
        .eq('is_active', true)
        .single();
      
      if (!apiKeyData) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      userId = apiKeyData.user_id;
    } else if (user_id) {
      userId = user_id;
    } else {
      return res.status(400).json({ error: 'Missing user_id or api_key' });
    }

    // Download audio from URL
    console.log('Downloading recording from:', recording_url);
    const audioResponse = await fetch(recording_url);
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download recording: ${audioResponse.statusText}`);
    }

    const audioBuffer = await audioResponse.buffer();
    
    // Match contact if requested
    let contactMatch = null;
    if (match_contact) {
      contactMatch = await matchContact(userId, {
        phone_number,
        contact_name,
        contact_email,
        calendar_event_id,
        location
      });
    }

    // Process audio with AI
    const processingResult = await processAudioWithAI(audioBuffer, {
      transcriptionProvider: transcription_provider,
      analysisProvider: analysis_provider,
      contactName: contactMatch?.contact ? 
        `${contactMatch.contact.first_name} ${contactMatch.contact.last_name}` : 
        contact_name,
      userId: userId,
      metadata: {
        source: 'plaud',
        external_id: plaud_recording_id,
        fileName: `plaud_${plaud_recording_id || Date.now()}.mp3`,
        fileSize: audioBuffer.length,
        contactId: contactMatch?.contact?.id,
        device_id,
        device_name,
        location,
        meeting_title,
        timestamp: timestamp || new Date().toISOString(),
        match_confidence: contactMatch?.confidence,
        match_method: contactMatch?.method
      }
    });

    if (!processingResult.success) {
      throw new Error(processingResult.error || 'Processing failed');
    }

    // Create tasks if requested
    let createdTasks = [];
    if (create_tasks && processingResult.analysis?.analysis?.actionItems) {
      createdTasks = await createTasksFromActionItems(
        processingResult.analysis.analysis.actionItems,
        userId,
        contactMatch?.contact?.id,
        processingResult.recordingId
      );
    }

    // Upload to storage if we have a recording ID
    if (processingResult.recordingId) {
      const filePath = `external-recordings/${processingResult.recordingId}-plaud.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('audio_recordings')
        .upload(filePath, audioBuffer, {
          contentType: 'audio/mp3'
        });

      if (!uploadError) {
        await supabase
          .from('call_recordings')
          .update({ storage_path: filePath })
          .eq('id', processingResult.recordingId);
      }
    }

    // Return comprehensive response for Zapier
    res.json({
      success: true,
      recording_id: processingResult.recordingId,
      
      // Contact matching
      contact_matched: !!contactMatch?.contact,
      contact_id: contactMatch?.contact?.id,
      match_confidence: contactMatch?.confidence,
      match_method: contactMatch?.method,
      
      // Transcription
      transcription: {
        text: processingResult.transcription.text,
        language: processingResult.transcription.language,
        provider: processingResult.transcription.provider
      },
      
      // Analysis
      analysis: {
        summary: processingResult.analysis.analysis.summary,
        sentiment: processingResult.analysis.analysis.sentiment,
        key_points: processingResult.analysis.analysis.keyPoints,
        topics: processingResult.analysis.analysis.topics,
        provider: processingResult.analysis.provider
      },
      
      // Tasks
      tasks_created: createdTasks.length,
      task_ids: createdTasks.map(t => t.id),
      
      // Metadata
      processing_time: processingResult.metadata.processedAt,
      providers_used: {
        transcription: transcription_provider,
        analysis: analysis_provider
      }
    });

  } catch (error) {
    console.error('Zapier webhook error:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get webhook configuration and test endpoint
 */
router.get('/webhook/plaud-zapier/config', (req, res) => {
  res.json({
    endpoint: `${process.env.BACKEND_URL || 'http://localhost:3000'}/webhook/plaud-zapier`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Zapier-Webhook-Secret': 'your-secret-here'
    },
    required_fields: ['recording_url', 'user_id or api_key'],
    optional_fields: [
      'transcription_provider',
      'analysis_provider',
      'phone_number',
      'contact_name',
      'contact_email',
      'meeting_title',
      'create_tasks',
      'match_contact'
    ],
    available_providers: {
      transcription: ['openai', 'gemini'],
      analysis: ['openai', 'gemini']
    }
  });
});

// Helper functions
function getTaskDueDate(actionItem) {
  const today = new Date();
  const item = actionItem.toLowerCase();
  
  if (item.includes('urgent') || item.includes('asap') || item.includes('immediately')) {
    return today.toISOString();
  } else if (item.includes('tomorrow')) {
    today.setDate(today.getDate() + 1);
  } else if (item.includes('next week')) {
    today.setDate(today.getDate() + 7);
  } else if (item.includes('end of week')) {
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    today.setDate(today.getDate() + daysUntilFriday);
  } else if (item.includes('next month')) {
    today.setMonth(today.getMonth() + 1);
  } else {
    // Default: 3 days from now
    today.setDate(today.getDate() + 3);
  }
  
  return today.toISOString();
}

function getTaskPriority(actionItem) {
  const item = actionItem.toLowerCase();
  
  if (item.includes('urgent') || item.includes('critical') || item.includes('asap') || item.includes('important')) {
    return 'high';
  } else if (item.includes('priority') || item.includes('soon')) {
    return 'medium';
  }
  
  return 'low';
}

export default router;