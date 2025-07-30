import express from 'express';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

import { AgentCore } from '../agents/core/agentCore.js';
import { ConversationManager } from '../agents/core/conversationManager.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import { PersonalityEngine } from '../services/personalityEngine.js';

const router = express.Router();

// Add CORS headers to ALL RepConnect routes
router.use((req, res, next) => {
  console.log(`[RepConnect Router] ${req.method} ${req.path}`);
  console.log('[RepConnect Router] Body:', req.body);
  
  // Add CORS headers for all requests
  res.header('Access-Control-Allow-Origin', 'https://repconnect.repspheres.com');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// OPTIONS handler now handled by middleware above

// Initialize Supabase for RepConnect
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
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

// Test what happens before route handler
router.post('/debug/test-minimal', (req, res, next) => {
  try {
    // Just return success immediately
    res.json({
      success: true,
      message: 'Route handler reached',
      method: req.method,
      path: req.path
    });
  } catch (error) {
    // Pass to error handler
    next(error);
  }
});

// Simple voice test endpoint
router.get('/debug/voice-simple-test', (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Voice test endpoint is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint for Supabase configuration (public)
router.get('/debug/supabase-config', (req, res) => {
  res.json({
    success: true,
    data: {
      supabaseInitialized: !!supabase,
      hasRpcMethod: !!supabase?.rpc,
      hasFromMethod: !!supabase?.from,
      supabaseKeyUsed: supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'none',
      envVarsSet: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
        SUPABASE_KEY: !!process.env.SUPABASE_KEY
      }
    }
  });
});

// Debug endpoint to test voice session steps
router.post('/debug/voice-steps/:agentId', checkSupabase, async (req, res) => {
  const { agentId } = req.params;
  const steps = [];
  
  try {
    // Step 1: Agent fetch
    steps.push({ step: 'agent_fetch', status: 'starting' });
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();
      
    if (agentError) {
      steps.push({ step: 'agent_fetch', status: 'failed', error: agentError });
      throw agentError;
    }
    steps.push({ step: 'agent_fetch', status: 'success', agentName: agent.name });
    
    // Step 2: Voice check
    steps.push({ step: 'voice_check', status: 'starting' });
    const voiceId = agent.voice_id || agent.agent_voice_profiles?.[0]?.voice_id;
    if (!voiceId) {
      steps.push({ step: 'voice_check', status: 'failed', error: 'No voice ID' });
      throw new Error('Agent does not have voice capabilities');
    }
    steps.push({ step: 'voice_check', status: 'success', voiceId });
    
    // Step 3: Client identifier
    steps.push({ step: 'client_identifier', status: 'starting' });
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const clientIdentifier = crypto
      .createHash('sha256')
      .update(`${clientIp}:${userAgent}`)
      .digest('hex');
    steps.push({ step: 'client_identifier', status: 'success', clientIp, hasUserAgent: !!userAgent });
    
    // Step 4: RPC call
    steps.push({ step: 'rpc_call', status: 'starting' });
    const { data: remainingSeconds, error: rpcError } = await supabase
      .rpc('get_remaining_trial_seconds', { p_client_identifier: clientIdentifier });
      
    if (rpcError) {
      steps.push({ step: 'rpc_call', status: 'failed', error: rpcError });
      throw rpcError;
    }
    steps.push({ step: 'rpc_call', status: 'success', remainingSeconds });
    
    // Step 5: Session insert
    steps.push({ step: 'session_insert', status: 'starting' });
    const sessionId = `test_voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { error: insertError } = await supabase
      .from('guest_voice_sessions')
      .insert({
        session_id: sessionId,
        agent_id: agentId,
        client_identifier: clientIdentifier,
        max_duration_seconds: Math.min(remainingSeconds, 600)
      });
      
    if (insertError) {
      steps.push({ step: 'session_insert', status: 'failed', error: insertError });
      throw insertError;
    }
    steps.push({ step: 'session_insert', status: 'success', sessionId });
    
    // Clean up test session
    await supabase
      .from('guest_voice_sessions')
      .delete()
      .eq('session_id', sessionId);
    
    res.json({
      success: true,
      message: 'All steps completed successfully',
      steps
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      steps,
      fullError: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stack: error.stack
      }
    });
  }
});

// Debug endpoint to test voice session error
router.get('/debug/voice-error/:agentId', checkSupabase, async (req, res) => {
  const { agentId } = req.params;
  
  try {
    // Just test the parts that might fail
    // crypto is already imported at top of file
    
    // Test crypto
    const testHash = crypto.createHash('sha256').update('test').digest('hex');
    console.log('Crypto test passed:', testHash);
    
    // Test agent fetch
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();
      
    if (agentError) throw agentError;
    
    // Test that we can access agent properties
    const voiceId = agent.voice_id || agent.agent_voice_profiles?.[0]?.voice_id;
    const personality = agent.personality_profile || {};
    
    res.json({
      success: true,
      data: {
        cryptoWorks: true,
        agentFound: true,
        agentId: agent.id,
        agentName: agent.name,
        hasVoiceId: !!voiceId,
        voiceId: voiceId,
        personalityType: typeof personality,
        personality: personality
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack,
      details: error
    });
  }
});

// Debug endpoint for voice session testing (public)
router.get('/debug/voice-session-test/:agentId', checkSupabase, async (req, res) => {
  const { agentId } = req.params;
  console.log('[VOICE DEBUG TEST] Starting test for agent:', agentId);
  
  try {
    // Test 1: Fetch agent
    console.log('[VOICE DEBUG TEST] Test 1: Fetching agent from unified_agents...');
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();
    
    if (agentError) {
      console.error('[VOICE DEBUG TEST] Agent fetch error:', agentError);
      return res.json({
        success: false,
        error: 'Agent fetch failed',
        details: agentError
      });
    }
    
    console.log('[VOICE DEBUG TEST] Agent found:', {
      id: agent?.id,
      name: agent?.name,
      voice_id: agent?.voice_id,
      has_voice_profiles: !!agent?.agent_voice_profiles?.length
    });
    
    // Test 2: Check voice capabilities
    const voiceId = agent?.voice_id || agent?.agent_voice_profiles?.[0]?.voice_id;
    console.log('[VOICE DEBUG TEST] Voice ID:', voiceId);
    
    // Test 3: Test RPC function
    console.log('[VOICE DEBUG TEST] Test 3: Testing RPC function...');
    const clientIdentifier = 'test-' + Date.now();
    
    try {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('get_remaining_trial_seconds', { p_client_identifier: clientIdentifier });
      
      console.log('[VOICE DEBUG TEST] RPC result:', { rpcResult, rpcError });
      
      if (rpcError) {
        return res.json({
          success: false,
          error: 'RPC function failed',
          details: rpcError
        });
      }
    } catch (rpcErr) {
      console.error('[VOICE DEBUG TEST] RPC exception:', rpcErr);
      return res.json({
        success: false,
        error: 'RPC function exception',
        details: rpcErr.message
      });
    }
    
    // Test 4: Test guest session insert
    console.log('[VOICE DEBUG TEST] Test 4: Testing guest session insert...');
    const sessionId = `test_voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { error: insertError } = await supabase
        .from('guest_voice_sessions')
        .insert({
          session_id: sessionId,
          agent_id: agentId,
          client_identifier: clientIdentifier,
          max_duration_seconds: 600
        });
      
      if (insertError) {
        console.error('[VOICE DEBUG TEST] Insert error:', insertError);
        return res.json({
          success: false,
          error: 'Guest session insert failed',
          details: insertError
        });
      }
      
      // Clean up test session
      await supabase
        .from('guest_voice_sessions')
        .delete()
        .eq('session_id', sessionId);
        
      console.log('[VOICE DEBUG TEST] All tests passed!');
      
      res.json({
        success: true,
        data: {
          agent: {
            id: agent.id,
            name: agent.name,
            voice_id: voiceId,
            has_voice: !!voiceId
          },
          tests: {
            agent_fetch: 'passed',
            voice_check: voiceId ? 'passed' : 'failed - no voice ID',
            rpc_function: 'passed',
            session_insert: 'passed'
          }
        }
      });
    } catch (insertErr) {
      console.error('[VOICE DEBUG TEST] Insert exception:', insertErr);
      return res.json({
        success: false,
        error: 'Guest session insert exception',
        details: insertErr.message
      });
    }
  } catch (error) {
    console.error('[VOICE DEBUG TEST] General error:', error);
    res.json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
});

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
  res.json({ success: true, message: 'RepConnect routes are loaded', version: '2025-01-26-v3' });
});

// GET /api/repconnect/test-response-structure - Test the exact response structure
router.get('/test-response-structure', async (req, res) => {
  try {
    const agentId = '00ed4a18-12f9-4ab0-9c94-2915ad94a9b1';
    
    // Fetch agent exactly like the trial endpoint
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();
    
    if (agentError) {
      return res.json({ error: 'Agent fetch failed', details: agentError });
    }
    
    // Test building the response structure
    const response = {
      test1_basic: {
        id: agent.id,
        name: agent.name
      }
    };
    
    // Test voice_id
    try {
      const voiceId = agent.voice_id || agent.agent_voice_profiles?.[0]?.voice_id;
      response.test2_voiceId = voiceId;
    } catch (e) {
      response.test2_voiceId_error = e.message;
    }
    
    // Test voice_name
    try {
      const voiceName = agent.voice_name || agent.agent_voice_profiles?.[0]?.voice_name;
      response.test3_voiceName = voiceName;
    } catch (e) {
      response.test3_voiceName_error = e.message;
    }
    
    // Test voice_settings
    try {
      const voiceSettings = agent.voice_settings || agent.agent_voice_profiles?.[0]?.voice_config;
      response.test4_voiceSettings = voiceSettings;
    } catch (e) {
      response.test4_voiceSettings_error = e.message;
    }
    
    // Test building full agent object
    try {
      const fullAgent = {
        id: agent.id,
        name: agent.name,
        voice_id: agent.voice_id || agent.agent_voice_profiles?.[0]?.voice_id,
        voice_name: agent.voice_name || agent.agent_voice_profiles?.[0]?.voice_name,
        voice_settings: agent.voice_settings || agent.agent_voice_profiles?.[0]?.voice_config
      };
      response.test5_fullAgent = fullAgent;
    } catch (e) {
      response.test5_fullAgent_error = e.message;
    }
    
    res.json({ success: true, ...response });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// GET /api/repconnect/test-voice-trial-detailed - Detailed test of voice trial steps
router.get('/test-voice-trial-detailed', async (req, res) => {
  const results = {};
  const agentId = '00ed4a18-12f9-4ab0-9c94-2915ad94a9b1';
  
  try {
    // Test 1: RPC function
    results.rpc = {};
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_remaining_trial_seconds', { p_client_identifier: 'test-detailed' });
    results.rpc.success = !rpcError;
    results.rpc.data = rpcData;
    results.rpc.error = rpcError;
    
    // Test 2: Fetch agent
    results.agent = {};
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();
    results.agent.success = !agentError;
    results.agent.data = agent ? { id: agent.id, name: agent.name, voice_id: agent.voice_id } : null;
    results.agent.error = agentError;
    
    // Test 3: Insert into guest_voice_sessions
    results.insert = {};
    const sessionId = `test_detailed_${Date.now()}`;
    const { data: session, error: insertError } = await supabase
      .from('guest_voice_sessions')
      .insert({
        session_id: sessionId,
        agent_id: agentId,
        client_identifier: 'test-detailed',
        max_duration_seconds: 300
      })
      .select()
      .single();
    results.insert.success = !insertError;
    results.insert.data = session;
    results.insert.error = insertError;
    
    res.json({
      success: Object.values(results).every(r => r.success),
      results,
      summary: {
        rpc: results.rpc.success ? 'PASS' : 'FAIL',
        agent: results.agent.success ? 'PASS' : 'FAIL',
        insert: results.insert.success ? 'PASS' : 'FAIL'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      results
    });
  }
});

// GET /api/repconnect/test-rpc - Test RPC function directly
router.get('/test-rpc', async (req, res) => {
  try {
    console.log('[TEST-RPC] Testing RPC function...');
    console.log('[TEST-RPC] Supabase exists:', !!supabase);
    console.log('[TEST-RPC] RPC method exists:', typeof supabase?.rpc);
    
    const { data, error } = await supabase
      .rpc('get_remaining_trial_seconds', { 
        p_client_identifier: 'test-client-direct' 
      });
    
    if (error) {
      console.error('[TEST-RPC] RPC Error:', error);
      console.error('[TEST-RPC] Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({
        success: false,
        error: {
          message: 'RPC failed',
          details: error
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        remainingSeconds: data,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[TEST-RPC] Catch error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
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

// POST /api/repconnect/agents/:agentId/start-voice-session - Start a voice session (authenticated or trial)
router.post('/agents/:agentId/start-voice-session', checkSupabase, async (req, res) => {
  console.error('[VOICE DEBUG] Endpoint hit');
  console.error('[VOICE DEBUG] Headers:', req.headers);
  console.error('[VOICE DEBUG] User:', req.user);
  
  try {
    const { provider = 'webrtc' } = req.body;
    const { agentId } = req.params;
    
    console.error('[VOICE DEBUG] Agent ID:', agentId);
    
    // Check if user is authenticated
    const isAuthenticated = !!(req.user && req.headers.authorization);
    console.error('[VOICE DEBUG] Is authenticated:', isAuthenticated);

    // Get agent details (same for both authenticated and trial)
    console.error('[VOICE DEBUG] Fetching agent from DB...');
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .select('*, agent_voice_profiles(*)')
      .eq('id', agentId)
      .single();

    console.error('[VOICE DEBUG] Agent fetch result:', { agent, agentError });

    if (agentError || !agent) {
      console.error('[VOICE DEBUG] Agent not found error');
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    // Check voice capabilities
    const voiceId = agent.voice_id || agent.agent_voice_profiles?.[0]?.voice_id;
    if (!voiceId) {
      return res
        .status(400)
        .json(errorResponse('NO_VOICE', 'Agent does not have voice capabilities', null, 400));
    }

    if (isAuthenticated) {
      // AUTHENTICATED USER FLOW
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
          agent_id: agentId,
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
            voice_id: voiceId,
            voice_name: agent.voice_name || agent.agent_voice_profiles?.[0]?.voice_name,
            voice_settings: agent.voice_settings || agent.agent_voice_profiles?.[0]?.voice_config,
            personality: agent.personality_profile || {},
            whisper_enabled: agent.whisper_config?.supports_whisper && voiceConfig?.whisper_enabled
          },
          provider: voiceConfig?.preferred_provider || provider,
          elevenlabs_api_key: process.env.ELEVENLABS_API_KEY,
          is_trial: false
        })
      );
    } else {
      // TRIAL/GUEST USER FLOW
      // Create client identifier from IP and User-Agent
      const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const clientIdentifier = crypto
        .createHash('sha256')
        .update(`${clientIp}:${userAgent}`)
        .digest('hex');
      
      // Check remaining trial time
      const { data: remainingSeconds, error: checkError } = await supabase
        .rpc('get_remaining_trial_seconds', { p_client_identifier: clientIdentifier });
      
      if (checkError) {
        console.error('Error checking trial time:', checkError);
        throw new Error('Failed to check trial availability');
      }
      
      if (remainingSeconds <= 0) {
        return res.status(403).json(
          errorResponse(
            'TRIAL_EXPIRED',
            'Your free 5-minute trial has been used today. Please sign up for unlimited access.',
            null,
            403
          )
        );
      }
      
      // Create guest session
      const sessionId = `guest_voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { error: sessionError } = await supabase
        .from('guest_voice_sessions')
        .insert({
          session_id: sessionId,
          agent_id: agentId,
          client_identifier: clientIdentifier,
          max_duration_seconds: Math.min(remainingSeconds, 600)
        });
      
      if (sessionError) {
        console.error('Error creating guest session:', sessionError);
        throw new Error('Failed to create voice session');
      }
      
      // Fetch the created session
      const { data: session, error: fetchError } = await supabase
        .from('guest_voice_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();
      
      if (fetchError || !session) {
        console.error('Error fetching guest session:', fetchError);
        throw new Error('Failed to fetch created session');
      }
      
      // Return session info WITHOUT API keys for guests
      res.json(
        successResponse({
          session: {
            id: session.id,
            session_id: session.session_id,
            max_duration_seconds: session.max_duration_seconds,
            remaining_seconds: remainingSeconds
          },
          agent: {
            id: agent.id,
            name: agent.name,
            voice_id: voiceId,
            voice_name: agent.voice_name || agent.agent_voice_profiles?.[0]?.voice_name,
            voice_settings: agent.voice_settings || agent.agent_voice_profiles?.[0]?.voice_config
          },
          provider: 'webrtc',
          is_trial: true
          // NO API keys exposed for guest sessions
        })
      );
    }
  } catch (error) {
    console.error('Error starting voice session:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    res
      .status(500)
      .json(errorResponse('SESSION_ERROR', 'Failed to start voice session', error.message, 500));
  }
});

// DELETED: Trial endpoint moved into main voice endpoint

// POST /api/repconnect/voice/heartbeat - Update session duration
router.post('/voice/heartbeat', checkSupabase, async (req, res) => {
  try {
    const { sessionId, duration } = req.body;
    
    if (!sessionId || duration === undefined) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Session ID and duration are required', null, 400)
      );
    }
    
    // Update session duration
    const { data: updated, error } = await supabase
      .rpc('update_guest_session_duration', {
        p_session_id: sessionId,
        p_duration: Math.floor(duration)
      });
    
    if (error) {
      console.error('Error updating session:', error);
      throw error;
    }
    
    // Get updated session info
    const { data: session } = await supabase
      .from('guest_voice_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    res.json(
      successResponse({
        updated,
        session,
        should_disconnect: session?.status === 'expired'
      })
    );
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json(
      errorResponse('HEARTBEAT_ERROR', 'Failed to update session', error.message, 500)
    );
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

// POST /api/repconnect/chat/public/message - REMOVED - now handled in index.js
// This endpoint was moved to the top of index.js to bypass middleware issues

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
