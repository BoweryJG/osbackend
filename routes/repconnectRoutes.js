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

// GET /api/repconnect/agents - List all agents
router.get('/agents', checkSupabase, async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('repconnect_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(successResponse({ agents: agents || [] }));
  } catch (error) {
    console.error('Error listing RepConnect agents:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to list agents', error.message, 500));
  }
});

// GET /api/repconnect/agents/:id - Get specific agent
router.get('/agents/:agentId', checkSupabase, async (req, res) => {
  try {
    const { data: agent, error } = await supabase
      .from('repconnect_agents')
      .select('*')
      .eq('id', req.params.agentId)
      .single();

    if (error) throw error;

    if (!agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }

    res.json(successResponse({ agent }));
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

export default router;