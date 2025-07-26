import express from 'express';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

import { AgentCore } from '../agents/core/agentCore.js';
import { ConversationManager } from '../agents/core/conversationManager.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import { PersonalityEngine } from '../services/personalityEngine.js';

const router = express.Router();

// Initialize Supabase for RepConnect
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
let supabase = null;
let agentCore = null;
let conversationManager = null;
let anthropic = null;
let personalityEngine = null;

if (process.env.SUPABASE_URL && supabaseKey) {
  supabase = createClient(process.env.SUPABASE_URL, supabaseKey);
  agentCore = new AgentCore('repconnect');
  conversationManager = new ConversationManager(supabase);
  personalityEngine = new PersonalityEngine(supabase);
  console.log('RepConnect Agents: Supabase and AgentCore initialized');
} else {
  console.warn('RepConnect Agents: Missing Supabase credentials');
}

if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log('RepConnect Agents: Anthropic initialized');
} else {
  console.warn('RepConnect Agents: Missing Anthropic API key');
}

// Middleware to check if Supabase is initialized
const checkSupabase = (req, res, next) => {
  if (!supabase) {
    return res
      .status(503)
      .json(
        errorResponse('SERVICE_UNAVAILABLE', 'RepConnect agent service not available', null, 503)
      );
  }
  next();
};

// Middleware to check if chat services are initialized
const checkChatServices = (req, res, next) => {
  if (!supabase || !agentCore || !conversationManager) {
    return res
      .status(503)
      .json(
        errorResponse(
          'SERVICE_UNAVAILABLE',
          'RepConnect chat services not available - missing required configuration',
          null,
          503
        )
      );
  }
  next();
};

// Middleware for authentication
const requireAuth = async (req, res, next) => {
  if (!supabase) {
    return res
      .status(503)
      .json(
        errorResponse('AUTH_SERVICE_UNAVAILABLE', 'Authentication service not available', null, 503)
      );
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res
      .status(401)
      .json(errorResponse('MISSING_TOKEN', 'Authentication token required', null, 401));
  }

  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res
        .status(401)
        .json(errorResponse('INVALID_TOKEN', 'Invalid or expired token', null, 401));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json(errorResponse('AUTH_FAILED', 'Authentication failed', null, 401));
  }
};

// GET /api/repconnect/test - Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'RepConnect routes are loaded', version: '2025-01-26-v2' });
});

// POST /api/repconnect/test - Simple POST test endpoint  
router.post('/test', (req, res) => {
  console.log('[Test] POST endpoint hit');
  res.json({ success: true, message: 'POST works', body: req.body });
});

// POST /api/repconnect/chat/simple - Simplest possible public endpoint
router.post('/chat/simple', (req, res) => {
  console.log('[Simple] Endpoint hit');
  res.json({ success: true });
});

// GET /api/repconnect/agents - List all agents from unified system with voice support
router.get('/agents', checkSupabase, async (req, res) => {
  try {
    const { category } = req.query;

    // Build query for unified agents
    let query = supabase
      .from('unified_agents')
      .select(
        `
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
        ),
        agent_knowledge_domains!inner (
          expertise_level,
          customizations,
          domain:domain_id (
            domain_name,
            domain_category,
            product_lines
          )
        )
      `
      )
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

    // Transform agents to include voice info and knowledge domains
    const transformedAgents = (agents || []).map(agent => ({
      ...agent,
      voice_enabled: !!agent.voice_id,
      voice_provider: agent.voice_id ? 'elevenlabs' : null,
      whisper_supported: agent.whisper_config?.supports_whisper || false,
      // Flatten voice profile if exists
      voice_config: agent.agent_voice_profiles?.[0]?.voice_config || agent.voice_settings,
      conversation_style: agent.agent_conversation_styles?.[0] || null,
      // Include knowledge domains
      knowledge_domains:
        agent.agent_knowledge_domains?.map(akd => ({
          domain_name: akd.domain?.domain_name,
          domain_category: akd.domain?.domain_category,
          expertise_level: akd.expertise_level,
          product_lines: akd.domain?.product_lines || []
        })) || []
    }));

    res.json(
      successResponse({
        agents: transformedAgents,
        total: transformedAgents.length,
        voice_enabled_count: transformedAgents.filter(a => a.voice_enabled).length
      })
    );
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
      .select(
        `
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
      `
      )
      .contains('available_in_apps', ['repconnect'])
      .not('voice_id', 'is', null)
      .eq('is_active', true)
      .order('agent_category', { ascending: true });

    if (error) throw error;

    res.json(
      successResponse({
        agents: agents || [],
        count: (agents || []).length
      })
    );
  } catch (error) {
    console.error('Error fetching voice-enabled agents:', error);
    res
      .status(500)
      .json(
        errorResponse('FETCH_ERROR', 'Failed to fetch voice-enabled agents', error.message, 500)
      );
  }
});

// GET /api/repconnect/agents/harvey - Get Harvey Specter specifically
router.get('/agents/harvey', checkSupabase, async (req, res) => {
  try {
    const { data: harvey, error } = await supabase
      .from('unified_agents')
      .select(
        `
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
        agent_knowledge_domains (
          expertise_level,
          customizations,
          domain:domain_id (
            domain_name,
            domain_category,
            product_lines
          )
        ),
        whisper_prompts (
          prompt_category,
          trigger_phrase,
          whisper_text,
          whisper_timing
        )
      `
      )
      .eq('name', 'Harvey Specter')
      .single();

    if (error) throw error;

    if (!harvey) {
      return res
        .status(404)
        .json(errorResponse('NOT_FOUND', 'Harvey Specter not found', null, 404));
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
      whisper_arsenal: harvey.whisper_prompts || [],
      knowledge_domains:
        harvey.agent_knowledge_domains?.map(akd => ({
          domain_name: akd.domain?.domain_name,
          domain_category: akd.domain?.domain_category,
          expertise_level: akd.expertise_level,
          product_lines: akd.domain?.product_lines || []
        })) || []
    };

    res.json(successResponse({ agent: harveyEnhanced }));
  } catch (error) {
    console.error('Error fetching Harvey:', error);
    res
      .status(500)
      .json(errorResponse('FETCH_ERROR', 'Failed to fetch Harvey', error.message, 500));
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
      label: category
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }));

    res.json(
      successResponse({
        categories: categoryList,
        total: categoryList.length
      })
    );
  } catch (error) {
    console.error('Error fetching agent categories:', error);
    res
      .status(500)
      .json(errorResponse('FETCH_ERROR', 'Failed to fetch categories', error.message, 500));
  }
});

// GET /api/repconnect/agents/:id - Get specific agent with full voice details
router.get('/agents/:agentId', checkSupabase, async (req, res) => {
  try {
    const { data: agent, error } = await supabase
      .from('unified_agents')
      .select(
        `
        *,
        agent_voice_profiles (
          voice_id,
          voice_name,
          voice_config,
          voice_attributes,
          sample_audio_url
        ),
        agent_knowledge_domains (
          expertise_level,
          customizations,
          domain:domain_id (
            domain_name,
            domain_category,
            product_lines
          )
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
      `
      )
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
    res
      .status(500)
      .json(errorResponse('CREATE_ERROR', 'Failed to create agent', error.message, 500));
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
    res
      .status(500)
      .json(errorResponse('UPDATE_ERROR', 'Failed to update agent', error.message, 500));
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
    res
      .status(500)
      .json(errorResponse('UPDATE_ERROR', 'Failed to update agent status', error.message, 500));
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
    res
      .status(500)
      .json(errorResponse('DELETE_ERROR', 'Failed to delete agent', error.message, 500));
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
      return res
        .status(400)
        .json(errorResponse('NO_VOICE', 'Agent does not have voice capabilities', null, 400));
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

    res.json(
      successResponse({
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
      })
    );
  } catch (error) {
    console.error('Error starting voice session:', error);
    res
      .status(500)
      .json(errorResponse('SESSION_ERROR', 'Failed to start voice session', error.message, 500));
  }
});

// ========================================
// CHAT FUNCTIONALITY ENDPOINTS
// ========================================

// POST /api/repconnect/chat/stream - Streaming chat response
router.post('/chat/stream', checkChatServices, requireAuth, async (req, res) => {
  try {
    const { agentId, message, conversationId, context } = req.body;

    if (!agentId || !message) {
      return res
        .status(400)
        .json(errorResponse('MISSING_PARAMETERS', 'Agent ID and message are required', null, 400));
    }

    // Verify agent exists and is available for RepConnect
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*')
      .eq('id', agentId)
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return res
        .status(404)
        .json(
          errorResponse(
            'AGENT_NOT_FOUND',
            'Agent not found or not available for RepConnect',
            null,
            404
          )
        );
    }

    // Load conversation history if conversationId provided
    let conversation = null;
    let previousMessages = [];

    if (conversationId) {
      conversation = await conversationManager.loadConversation(conversationId, req.user.id);
      if (conversation && conversation.messages) {
        previousMessages = conversation.messages;
      }
    }

    // Build context for RepConnect agents
    const repconnectContext = {
      ...context,
      appName: 'repconnect',
      userType: 'sales_rep',
      previousMessages,
      conversation: conversation || null
    };

    // Set up SSE headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Stream the response
    const stream = await agentCore.streamResponse(agentId, message, repconnectContext, req.user.id);
    let fullResponse = '';

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text_delta' && chunk.text) {
          fullResponse += chunk.text;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'message_start') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'message_stop') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      }

      // Save message to conversation if conversationId provided
      if (conversationId && fullResponse) {
        const newMessages = [
          ...(conversation?.messages || []),
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() }
        ];

        await supabase
          .from('agent_conversations')
          .update({
            messages: newMessages,
            metadata: {
              ...conversation?.metadata,
              last_active: new Date().toISOString()
            }
          })
          .eq('id', conversationId)
          .eq('user_id', req.user.id);
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrupted' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in RepConnect chat stream:', error);
    res
      .status(500)
      .json(
        errorResponse('CHAT_STREAM_ERROR', 'Failed to stream chat response', error.message, 500)
      );
  }
});

// POST /api/repconnect/chat/message - Regular chat message (non-streaming)
router.post('/chat/message', checkChatServices, requireAuth, async (req, res) => {
  try {
    const { agentId, message, conversationId, context } = req.body;

    if (!agentId || !message) {
      return res
        .status(400)
        .json(errorResponse('MISSING_PARAMETERS', 'Agent ID and message are required', null, 400));
    }

    // Verify agent exists and is available for RepConnect
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*')
      .eq('id', agentId)
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return res
        .status(404)
        .json(
          errorResponse(
            'AGENT_NOT_FOUND',
            'Agent not found or not available for RepConnect',
            null,
            404
          )
        );
    }

    // Load conversation history if conversationId provided
    let conversation = null;
    let previousMessages = [];

    if (conversationId) {
      conversation = await conversationManager.loadConversation(conversationId, req.user.id);
      if (conversation && conversation.messages) {
        previousMessages = conversation.messages;
      }
    }

    // Build context for RepConnect agents
    const repconnectContext = {
      ...context,
      appName: 'repconnect',
      userType: 'sales_rep',
      previousMessages,
      conversation: conversation || null
    };

    // Get non-streaming response
    const stream = await agentCore.streamResponse(agentId, message, repconnectContext, req.user.id);
    let fullResponse = '';

    // Collect the full response
    for await (const chunk of stream) {
      if (chunk.type === 'text_delta' && chunk.text) {
        fullResponse += chunk.text;
      }
    }

    // Save message to conversation if conversationId provided
    if (conversationId && fullResponse) {
      const newMessages = [
        ...(conversation?.messages || []),
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() }
      ];

      await supabase
        .from('agent_conversations')
        .update({
          messages: newMessages,
          metadata: {
            ...conversation?.metadata,
            last_active: new Date().toISOString()
          }
        })
        .eq('id', conversationId)
        .eq('user_id', req.user.id);
    }

    res.json(
      successResponse({
        response: fullResponse,
        agent: {
          id: agent.id,
          name: agent.name,
          avatar_url: agent.avatar_url,
          personality_type: agent.personality_profile?.type
        },
        conversationId,
        timestamp: new Date().toISOString()
      })
    );
  } catch (error) {
    console.error('Error in RepConnect chat message:', error);
    res
      .status(500)
      .json(
        errorResponse('CHAT_MESSAGE_ERROR', 'Failed to process chat message', error.message, 500)
      );
  }
});

// POST /api/repconnect/chat/public/message - Public chat message endpoint (no auth required)
router.post('/chat/public/message', async (req, res, next) => {
  console.log('[CRITICAL] Public message endpoint called');
  console.log('Request body:', req.body);
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);
  
  try {
    const { agentId, message, conversationId } = req.body;

    if (!agentId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Agent ID and message are required' 
      });
    }
    
    // For now, just return a working response
    return res.json({
      success: true,
      message: "Hello! I'm here to help with B2B medical device sales. How can I assist you today?",
      agentId: agentId,
      sessionId: conversationId || `session_${Date.now()}`,
      timestamp: new Date().toISOString()
    });

    // Verify agent exists and is available for RepConnect with knowledge domains
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select(`
        *,
        agent_knowledge_domains (
          expertise_level,
          domain:domain_id (
            domain_name,
            domain_category,
            product_lines
          )
        )
      `)
      .eq('id', agentId)
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return res
        .status(404)
        .json(
          errorResponse(
            'AGENT_NOT_FOUND',
            'Agent not found or not available for RepConnect',
            null,
            404
          )
        );
    }

    // Create anonymous user ID for public users
    const publicUserId = `public_${req.ip}_${Date.now()}`;

    // Build context for RepConnect agents
    const repconnectContext = {
      appName: 'repconnect',
      app: 'repconnect',
      isPublicUser: true,
      userId: publicUserId
    };

    // Build system prompt for the agent with knowledge domains
    let systemPrompt = agent.system_prompt || `You are ${agent.name}, ${agent.description || 'a helpful AI assistant'}. Respond in character.`;
    
    // Add knowledge domains to system prompt
    if (agent.agent_knowledge_domains?.length > 0) {
      const domains = agent.agent_knowledge_domains
        .map(kd => kd.domain?.domain_name)
        .filter(Boolean)
        .join(', ');
      
      if (domains) {
        systemPrompt += `\n\nYou have expertise in the following B2B medical device sales areas: ${domains}. Use this knowledge to provide expert guidance on selling these products to healthcare providers.`;
      }
    }

    // Create messages array
    const messages = [
      {
        role: 'user',
        content: message
      }
    ];

    // Check if Anthropic is initialized
    if (!anthropic) {
      console.error('[RepConnect] Anthropic client not initialized - missing API key');
      return res.status(503).json(
        errorResponse('SERVICE_UNAVAILABLE', 'Chat service not available - AI provider not configured', null, 503)
      );
    }

    // Use direct Anthropic call for public users
    const completion = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: agent.temperature || 0.7,
      system: systemPrompt,
      messages: messages
    });

    const responseText = completion.content[0].text;

    // Return successful response
    res.json({
      success: true,
      message: responseText,
      agentId: agentId,
      sessionId: conversationId || `public_session_${Date.now()}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[RepConnect] Public chat error:', error);
    console.error('[RepConnect] Error stack:', error.stack);
    
    // Pass to error middleware to handle
    next(error);
  }
});

// POST /api/repconnect/chat/conversations - Create new conversation
router.post('/chat/conversations', checkChatServices, requireAuth, async (req, res) => {
  try {
    const { agentId, title, context } = req.body;

    if (!agentId) {
      return res
        .status(400)
        .json(errorResponse('MISSING_PARAMETER', 'Agent ID is required', null, 400));
    }

    // Verify agent exists and is available for RepConnect
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('name')
      .eq('id', agentId)
      .contains('available_in_apps', ['repconnect'])
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return res
        .status(404)
        .json(
          errorResponse(
            'AGENT_NOT_FOUND',
            'Agent not found or not available for RepConnect',
            null,
            404
          )
        );
    }

    // Create conversation with RepConnect context
    const conversation = await conversationManager.createConversation(
      req.user.id,
      agentId,
      title || `Chat with ${agent.name}`,
      {
        ...context,
        appName: 'repconnect',
        userType: 'sales_rep',
        created_via: 'repconnect_api'
      }
    );

    res.json(successResponse({ conversation }, 'RepConnect conversation created successfully'));
  } catch (error) {
    console.error('Error creating RepConnect conversation:', error);
    res
      .status(500)
      .json(
        errorResponse(
          'CONVERSATION_CREATE_ERROR',
          'Failed to create conversation',
          error.message,
          500
        )
      );
  }
});

// GET /api/repconnect/chat/conversations - List user's RepConnect conversations
router.get('/chat/conversations', checkChatServices, requireAuth, async (req, res) => {
  try {
    // Get conversations with RepConnect agents only
    const { data: conversations, error } = await supabase
      .from('agent_conversations')
      .select(
        `
        id,
        title,
        agent_id,
        created_at,
        updated_at,
        metadata,
        unified_agents!inner (
          id,
          name,
          avatar_url,
          agent_category
        )
      `
      )
      .eq('user_id', req.user.id)
      .contains('unified_agents.available_in_apps', ['repconnect'])
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const transformedConversations = (conversations || []).map(conv => ({
      id: conv.id,
      title: conv.title,
      agent: conv.unified_agents,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      last_active: conv.metadata?.last_active || conv.updated_at,
      message_count: conv.metadata?.message_count || 0
    }));

    res.json(
      successResponse({
        conversations: transformedConversations,
        count: transformedConversations.length
      })
    );
  } catch (error) {
    console.error('Error listing RepConnect conversations:', error);
    res
      .status(500)
      .json(
        errorResponse(
          'CONVERSATIONS_LIST_ERROR',
          'Failed to list conversations',
          error.message,
          500
        )
      );
  }
});

// GET /api/repconnect/chat/conversations/:conversationId - Get specific conversation
router.get(
  '/chat/conversations/:conversationId',
  checkChatServices,
  requireAuth,
  async (req, res) => {
    try {
      const conversation = await conversationManager.loadConversation(
        req.params.conversationId,
        req.user.id
      );

      if (!conversation) {
        return res
          .status(404)
          .json(errorResponse('NOT_FOUND', 'Conversation not found', null, 404));
      }

      // Verify this conversation is with a RepConnect agent
      const { data: agent, error: agentError } = await supabase
        .from('unified_agents')
        .select('name, avatar_url, agent_category')
        .eq('id', conversation.agent_id)
        .contains('available_in_apps', ['repconnect'])
        .single();

      if (agentError || !agent) {
        return res
          .status(404)
          .json(
            errorResponse(
              'INVALID_CONVERSATION',
              'Conversation not found or not accessible via RepConnect',
              null,
              404
            )
          );
      }

      res.json(
        successResponse({
          conversation: {
            ...conversation,
            agent
          }
        })
      );
    } catch (error) {
      console.error('Error loading RepConnect conversation:', error);
      res
        .status(500)
        .json(
          errorResponse(
            'CONVERSATION_LOAD_ERROR',
            'Failed to load conversation',
            error.message,
            500
          )
        );
    }
  }
);

export default router;
