import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Supabase for RepConnect
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
let supabase = null;

if (process.env.SUPABASE_URL && supabaseKey) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey
  );
  console.log('RepConnect Agents: Supabase initialized');
} else {
  console.warn('RepConnect Agents: Missing Supabase credentials');
}

// Middleware to check if Supabase is initialized
const checkSupabase = (req, res, next) => {
  if (!supabase) {
    return res.status(503).json(errorResponse(
      'SERVICE_UNAVAILABLE', 
      'RepConnect agent service not available', 
      null, 
      503
    ));
  }
  next();
};

// Middleware for authentication
const requireAuth = async (req, res, next) => {
  if (!supabase) {
    return res.status(503).json(errorResponse('AUTH_SERVICE_UNAVAILABLE', 'Authentication service not available', null, 503));
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json(errorResponse('MISSING_TOKEN', 'Authentication token required', null, 401));
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid or expired token', null, 401));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json(errorResponse('AUTH_FAILED', 'Authentication failed', null, 401));
  }
};

// GET /api/repconnect/agents - List all agents from unified system with voice support
router.get('/agents', checkSupabase, async (req, res) => {
  try {
    const { category } = req.query;
    
    // Build query for unified agents
    let query = supabase
      .from('unified_agents')
      .select(`
        *,
        agent_voice_profiles (
          voice_id,
          voice_name,
          voice_config,
          voice_attributes
        ),
        agent_conversation_styles (
          greeting_style,
          closing_style,
          objection_handling_approach
        )
      `)
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true);
    
    // Filter by category if provided
    if (category) {
      query = query.eq('agent_category', category);
    }
    
    const { data: agents, error } = await query
      .order('agent_category', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    // Transform agents to include voice info
    const transformedAgents = (agents || []).map(agent => ({
      ...agent,
      voice_enabled: !!agent.voice_id,
      voice_provider: agent.voice_id ? 'elevenlabs' : null,
      whisper_supported: agent.whisper_config?.supports_whisper || false,
      // Flatten voice profile if exists
      voice_config: agent.agent_voice_profiles?.[0]?.voice_config || agent.voice_settings,
      conversation_style: agent.agent_conversation_styles?.[0] || null
    }));

    res.json(successResponse({ 
      agents: transformedAgents,
      total: transformedAgents.length,
      voice_enabled_count: transformedAgents.filter(a => a.voice_enabled).length
    }));
  } catch (error) {
    console.error('Error listing RepConnect agents:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to list agents', error.message, 500));
  }
});

// GET /api/repconnect/agents/voice-enabled - Get all voice-enabled agents
router.get('/agents/voice-enabled', checkSupabase, async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('unified_agents')
      .select(`
        *,
        agent_voice_profiles (
          voice_id,
          voice_name,
          voice_config,
          voice_attributes,
          sample_audio_url
        ),
        agent_conversation_styles (
          greeting_style,
          closing_style,
          objection_handling_approach
        )
      `)
      .contains('available_in_apps', ['repconnect'])
      .not('voice_id', 'is', null)
      .eq('is_active', true)
      .order('agent_category', { ascending: true });

    if (error) throw error;

    res.json(successResponse({ 
      agents: agents || [],
      count: (agents || []).length 
    }));
  } catch (error) {
    console.error('Error fetching voice-enabled agents:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch voice-enabled agents', error.message, 500));
  }
});

// GET /api/repconnect/agents/harvey - Get Harvey Specter specifically
router.get('/agents/harvey', checkSupabase, async (req, res) => {
  try {
    const { data: harvey, error } = await supabase
      .from('unified_agents')
      .select(`
        *,
        agent_voice_profiles (
          voice_id,
          voice_name,
          voice_config,
          voice_attributes
        ),
        agent_conversation_styles (
          greeting_style,
          closing_style,
          objection_handling_approach,
          question_asking_style
        ),
        whisper_prompts (
          prompt_category,
          trigger_phrase,
          whisper_text,
          whisper_timing
        )
      `)
      .eq('name', 'Harvey Specter')
      .single();

    if (error) throw error;

    if (!harvey) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Harvey Specter not found', null, 404));
    }

    // Add special Harvey features
    const harveyEnhanced = {
      ...harvey,
      voice_enabled: true,
      voice_provider: 'elevenlabs',
      whisper_supported: true,
      aggression_level: harvey.personality_profile?.aggression || 9,
      signature_move: 'The Harvey Close - Break them down, build them up stronger',
      voice_profile: harvey.agent_voice_profiles?.[0] || null,
      conversation_style: harvey.agent_conversation_styles?.[0] || null,
      whisper_arsenal: harvey.whisper_prompts || []
    };

    res.json(successResponse({ agent: harveyEnhanced }));
  } catch (error) {
    console.error('Error fetching Harvey:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch Harvey', error.message, 500));
  }
});

// GET /api/repconnect/agents/categories - Get available agent categories
router.get('/agents/categories', checkSupabase, async (req, res) => {
  try {
    const { data: categories, error } = await supabase
      .from('unified_agents')
      .select('agent_category')
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true);

    if (error) throw error;

    // Get unique categories with counts
    const categoryCounts = (categories || []).reduce((acc, agent) => {
      acc[agent.agent_category] = (acc[agent.agent_category] || 0) + 1;
      return acc;
    }, {});

    const categoryList = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
      label: category.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }));

    res.json(successResponse({ 
      categories: categoryList,
      total: categoryList.length 
    }));
  } catch (error) {
    console.error('Error fetching agent categories:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch categories', error.message, 500));
  }
});

// GET /api/repconnect/agents/:id - Get specific agent with full voice details
router.get('/agents/:agentId', checkSupabase, async (req, res) => {
  try {
    const { data: agent, error } = await supabase
      .from('unified_agents')
      .select(`
        *,
        agent_voice_profiles (
          voice_id,
          voice_name,
          voice_config,
          voice_attributes,
          sample_audio_url
        ),
        agent_conversation_styles (
          greeting_style,
          closing_style,
          objection_handling_approach,
          question_asking_style,
          research_methodology
        ),
        whisper_prompts (
          prompt_category,
          trigger_phrase,
          whisper_text,
          whisper_timing
        )
      `)
      .eq('id', req.params.agentId)
      .contains('available_in_apps', ['repconnect'])
      .single();

    if (error) throw error;

    if (!agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    // Transform agent data
    const transformedAgent = {
      ...agent,
      voice_enabled: !!agent.voice_id,
      voice_provider: agent.voice_id ? 'elevenlabs' : null,
      whisper_supported: agent.whisper_config?.supports_whisper || false,
      voice_profile: agent.agent_voice_profiles?.[0] || null,
      conversation_style: agent.agent_conversation_styles?.[0] || null,
      whisper_prompts: agent.whisper_prompts || []
    };

    res.json(successResponse({ agent: transformedAgent }));
  } catch (error) {
    console.error('Error fetching RepConnect agent:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch agent', error.message, 500));
  }
});

// POST /api/repconnect/agents - Create new agent
router.post('/agents', requireAuth, async (req, res) => {
  try {
    const agentData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: agent, error } = await supabase
      .from('repconnect_agents')
      .insert(agentData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(successResponse({ agent }, 'Agent created successfully'));
  } catch (error) {
    console.error('Error creating RepConnect agent:', error);
    res.status(500).json(errorResponse('CREATE_ERROR', 'Failed to create agent', error.message, 500));
  }
});

// PUT /api/repconnect/agents/:id - Update agent
router.put('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    const updates = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    // Remove id from updates if present
    delete updates.id;

    const { data: agent, error } = await supabase
      .from('repconnect_agents')
      .update(updates)
      .eq('id', req.params.agentId)
      .select()
      .single();

    if (error) throw error;

    if (!agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    res.json(successResponse({ agent }, 'Agent updated successfully'));
  } catch (error) {
    console.error('Error updating RepConnect agent:', error);
    res.status(500).json(errorResponse('UPDATE_ERROR', 'Failed to update agent', error.message, 500));
  }
});

// PATCH /api/repconnect/agents/:id - Update agent status
router.patch('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    const { active } = req.body;

    const { data: agent, error } = await supabase
      .from('repconnect_agents')
      .update({ 
        active,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.agentId)
      .select()
      .single();

    if (error) throw error;

    if (!agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    res.json(successResponse({ agent }, 'Agent status updated successfully'));
  } catch (error) {
    console.error('Error updating RepConnect agent status:', error);
    res.status(500).json(errorResponse('UPDATE_ERROR', 'Failed to update agent status', error.message, 500));
  }
});

// DELETE /api/repconnect/agents/:id - Delete agent
router.delete('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('repconnect_agents')
      .delete()
      .eq('id', req.params.agentId);

    if (error) throw error;

    res.json(successResponse(null, 'Agent deleted successfully'));
  } catch (error) {
    console.error('Error deleting RepConnect agent:', error);
    res.status(500).json(errorResponse('DELETE_ERROR', 'Failed to delete agent', error.message, 500));
  }
});

// POST /api/repconnect/agents/:agentId/start-voice-session - Start a voice session with an agent
router.post('/agents/:agentId/start-voice-session', requireAuth, async (req, res) => {
  try {
    const { provider = 'webrtc' } = req.body;
    
    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', req.params.agentId)
      .single();

    if (agentError || !agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    if (!agent.voice_id) {
      return res.status(400).json(errorResponse('NO_VOICE', 'Agent does not have voice capabilities', null, 400));
    }

    // Get user's voice provider config
    const { data: voiceConfig } = await supabase
      .from('voice_provider_configs')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    // Create voice session
    const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: session, error: sessionError } = await supabase
      .from('agent_voice_sessions')
      .insert({
        agent_id: req.params.agentId,
        user_id: req.user.id,
        provider: voiceConfig?.preferred_provider || provider,
        session_id: sessionId,
        whisper_enabled: voiceConfig?.whisper_enabled || false
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    res.json(successResponse({
      session,
      agent: {
        id: agent.id,
        name: agent.name,
        voice_id: agent.voice_id,
        voice_name: agent.voice_name,
        voice_settings: agent.voice_settings,
        personality: agent.personality_profile,
        whisper_enabled: agent.whisper_config?.supports_whisper && voiceConfig?.whisper_enabled
      },
      provider: voiceConfig?.preferred_provider || provider,
      elevenlabs_api_key: process.env.ELEVENLABS_API_KEY // Only for authorized users
    }));
  } catch (error) {
    console.error('Error starting voice session:', error);
    res.status(500).json(errorResponse('SESSION_ERROR', 'Failed to start voice session', error.message, 500));
  }
});

export default router;