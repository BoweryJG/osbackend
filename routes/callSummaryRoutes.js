import express from 'express';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Helper functions
function buildPrompt(transcription, format = 'detailed') {
  return `Analyze the following call transcription and provide a comprehensive summary in JSON format.

Transcription:
${transcription}

Please provide a ${format} summary with the following structure:
{
  "executiveSummary": "A concise overview of the call",
  "keyPoints": ["Array of main discussion points"],
  "actionItems": [
    {
      "task": "Description of the action item",
      "assignee": "Person responsible (if mentioned)",
      "priority": "high/medium/low",
      "dueDate": "Due date if mentioned"
    }
  ],
  "sentimentAnalysis": {
    "overall": "positive/neutral/negative",
    "score": 0.0,
    "emotions": {
      "satisfaction": 0.0,
      "frustration": 0.0,
      "confusion": 0.0,
      "enthusiasm": 0.0
    },
    "keyMoments": [
      {
        "sentiment": "Description of sentiment",
        "text": "Quote from the call"
      }
    ]
  },
  "nextSteps": ["Array of recommended next steps"]
}

Important guidelines:
1. Be objective and accurate
2. Extract concrete action items with clear ownership when possible
3. Identify sentiment based on tone, language, and context
4. Provide actionable next steps
5. For ${format} format, adjust the level of detail accordingly`;
}

async function callOpenAI(prompt) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant specialized in analyzing business calls and providing structured summaries. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

function parseAIResponse(content) {
  try {
    // Extract JSON from the response (in case it includes markdown formatting)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize the response
    return {
      executiveSummary: parsed.executiveSummary || 'No summary available',
      keyPoints: parsed.keyPoints || [],
      actionItems: parsed.actionItems || [],
      sentimentAnalysis: parsed.sentimentAnalysis || {
        overall: 'neutral',
        score: 0,
        emotions: {},
        keyMoments: []
      },
      nextSteps: parsed.nextSteps || []
    };
  } catch (error) {
    console.error('Error parsing AI response:', error);
    throw new Error('Failed to parse AI response');
  }
}

// GET /api/calls/:callSid/summary
router.get('/api/calls/:callSid/summary', async (req, res) => {
  const { callSid } = req.params;
  
  try {
    // Fetch existing summary from database
    const { data, error } = await supabase
      .from('call_analysis')
      .select('*')
      .eq('call_sid', callSid)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Summary not found' });
      }
      throw error;
    }
    
    return res.json(data.summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// POST /api/calls/:callSid/summary
router.post('/api/calls/:callSid/summary', async (req, res) => {
  const { callSid } = req.params;
  const { transcription, format = 'detailed' } = req.body;
  
  if (!transcription) {
    return res.status(400).json({ error: 'Transcription is required' });
  }
  
  try {
    // Check if summary already exists
    const { data: existing } = await supabase
      .from('call_analysis')
      .select('id')
      .eq('call_sid', callSid)
      .single();
    
    if (existing) {
      return res.status(400).json({ error: 'Summary already exists. Use regenerate endpoint.' });
    }
    
    // Generate summary using OpenAI
    const prompt = buildPrompt(transcription, format);
    const aiResponse = await callOpenAI(prompt);
    const summary = parseAIResponse(aiResponse.choices[0].message.content);
    
    // Save to database
    const { data, error } = await supabase
      .from('call_analysis')
      .insert({
        call_sid: callSid,
        summary,
        format,
        ai_model: 'gpt-4-turbo-preview',
        ai_provider: 'openai',
        processing_time_ms: 0,
        token_count: {
          input: aiResponse.usage?.prompt_tokens || 0,
          output: aiResponse.usage?.completion_tokens || 0
        }
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return res.json(summary);
  } catch (error) {
    console.error('Error generating summary:', error);
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// POST /api/calls/:callSid/summary/regenerate
router.post('/api/calls/:callSid/summary/regenerate', async (req, res) => {
  const { callSid } = req.params;
  const { transcription, format = 'detailed' } = req.body;
  
  if (!transcription) {
    return res.status(400).json({ error: 'Transcription is required' });
  }
  
  try {
    // Generate new summary
    const prompt = buildPrompt(transcription, format);
    const aiResponse = await callOpenAI(prompt);
    const summary = parseAIResponse(aiResponse.choices[0].message.content);
    
    // Update existing record or create new one
    const { data, error } = await supabase
      .from('call_analysis')
      .upsert({
        call_sid: callSid,
        summary,
        format,
        ai_model: 'gpt-4-turbo-preview',
        ai_provider: 'openai',
        processing_time_ms: 0,
        token_count: {
          input: aiResponse.usage?.prompt_tokens || 0,
          output: aiResponse.usage?.completion_tokens || 0
        },
        regenerated_at: new Date().toISOString()
      }, {
        onConflict: 'call_sid'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return res.json(summary);
  } catch (error) {
    console.error('Error regenerating summary:', error);
    return res.status(500).json({ error: 'Failed to regenerate summary' });
  }
});

// PUT /api/calls/:callSid/summary
router.put('/api/calls/:callSid/summary', async (req, res) => {
  const { callSid } = req.params;
  const { summary } = req.body;
  
  if (!summary) {
    return res.status(400).json({ error: 'Summary is required' });
  }
  
  try {
    const { data, error } = await supabase
      .from('call_analysis')
      .update({ 
        summary,
        user_edited: true,
        updated_at: new Date().toISOString()
      })
      .eq('call_sid', callSid)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Summary not found' });
      }
      throw error;
    }
    
    return res.json(data.summary);
  } catch (error) {
    console.error('Error updating summary:', error);
    return res.status(500).json({ error: 'Failed to update summary' });
  }
});

export default router;