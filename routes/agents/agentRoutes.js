import express from 'express';
import fetch from 'node-fetch';
import { AgentCore } from '../../agents/core/agentCore.js';
import { ConversationManager } from '../../agents/core/conversationManager.js';
import { ProcedureService } from '../../agents/services/procedureService.js';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from '../../utils/responseHelpers.js';

const router = express.Router();

// Initialize services with error handling
let supabase = null;
let agentCore = null;
let conversationManager = null;
let procedureService = null;

// Only initialize if environment variables are available
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (process.env.SUPABASE_URL && supabaseKey) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey
  );
  agentCore = new AgentCore();
  conversationManager = new ConversationManager(supabase);
  procedureService = new ProcedureService();
} else {
  console.warn('Agent System: Missing Supabase credentials, agent features will be disabled');
}

// Middleware to check if services are initialized
const checkServicesInitialized = (req, res, next) => {
  if (!supabase || !agentCore || !conversationManager) {
    return res.status(503).json(errorResponse(
      'SERVICE_UNAVAILABLE', 
      'Agent services not available - missing required configuration', 
      null, 
      503
    ));
  }
  next();
};

// Middleware to verify authentication
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

// List all available agents (temporarily allow without auth for RepConnect)
router.get('/agents', checkServicesInitialized, async (req, res) => {
  try {
    const agents = await agentCore.listAgents();
    res.json(successResponse({ agents }));
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to list agents', error.message, 500));
  }
});

// Get specific agent details
router.get('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    const agent = await agentCore.getAgent(req.params.agentId);
    res.json(successResponse({ agent }));
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch agent', error.message, 500));
  }
});

// Create new agent (admin only)
router.post('/agents', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    if (!profile?.is_admin) {
      return res.status(403).json(errorResponse('INSUFFICIENT_PERMISSIONS', 'Admin access required', null, 403));
    }

    const agent = await agentCore.createAgent(req.body);
    res.json(successResponse({ agent }, 'Agent created successfully'));
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json(errorResponse('CREATION_ERROR', 'Failed to create agent', error.message, 500));
  }
});

// Update agent (admin only)
router.put('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    if (!profile?.is_admin) {
      return res.status(403).json(errorResponse('INSUFFICIENT_PERMISSIONS', 'Admin access required', null, 403));
    }

    const agent = await agentCore.updateAgent(req.params.agentId, req.body);
    res.json(successResponse({ agent }, 'Agent updated successfully'));
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json(errorResponse('UPDATE_ERROR', 'Failed to update agent', error.message, 500));
  }
});

// Receive agent deployment from agent-command-center
router.post('/agents/receive', async (req, res) => {
  try {
    const { agent, source } = req.body;
    
    // Verify source
    if (source !== 'agent-command-center') {
      return res.status(403).json(errorResponse('UNAUTHORIZED_SOURCE', 'Unauthorized source', null, 403));
    }
    
    // Validate agent data
    if (!agent || !agent.id || !agent.name || !agent.type) {
      return res.status(400).json(errorResponse('INVALID_DATA', 'Invalid agent data - missing required fields', null, 400));
    }
    
    // Check if agent already exists
    const existingAgent = await agentCore.getAgent(agent.id);
    
    if (existingAgent) {
      // Update existing agent
      const updatedAgent = await agentCore.updateAgent(agent.id, {
        ...agent,
        deployedFrom: 'agent-command-center',
        deployedAt: new Date().toISOString(),
        platformSpecific: {
          ...agent.platformSpecific,
          repconnect1: {
            enabled: true,
            role: 'sales'
          }
        }
      });
      
      res.json(successResponse({
        action: 'updated',
        agent: updatedAgent 
      }, 'Agent updated successfully'));
    } else {
      // Create new agent
      const newAgent = await agentCore.createAgent({
        ...agent,
        deployedFrom: 'agent-command-center',
        deployedAt: new Date().toISOString(),
        platformSpecific: {
          ...agent.platformSpecific,
          repconnect1: {
            enabled: true,
            role: 'sales'
          }
        }
      });
      
      res.status(201).json(successResponse({
        action: 'created',
        agent: newAgent 
      }, 'Agent created successfully'));
    }
  } catch (error) {
    console.error('Error receiving agent:', error);
    res.status(500).json(errorResponse('AGENT_RECEIVE_ERROR', 'Failed to receive agent', error.message, 500));
  }
});

// Remove deployed agent
router.delete('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { source } = req.query;
    
    // Only allow deletion from agent-command-center
    if (source !== 'agent-command-center') {
      return res.status(403).json(errorResponse('UNAUTHORIZED_SOURCE', 'Unauthorized source', null, 403));
    }
    
    // Check if agent exists and was deployed from agent-command-center
    const agent = await agentCore.getAgent(agentId);
    if (!agent) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Agent not found', null, 404));
    }
    
    if (agent.deployedFrom !== 'agent-command-center') {
      return res.status(403).json(errorResponse('DELETION_FORBIDDEN', 'Cannot delete agent not deployed from agent-command-center', null, 403));
    }
    
    // Delete or deactivate the agent
    await agentCore.deleteAgent(agentId);
    
    res.json(successResponse({}, `Agent ${agentId} removed from repconnect1`));
  } catch (error) {
    console.error('Error removing agent:', error);
    res.status(500).json(errorResponse('DELETION_ERROR', 'Failed to remove agent', error.message, 500));
  }
});

// List user conversations
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await conversationManager.listConversations(req.user.id);
    res.json(successResponse({ conversations }));
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to list conversations', error.message, 500));
  }
});

// Get specific conversation
router.get('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    const conversation = await conversationManager.loadConversation(
      req.params.conversationId,
      req.user.id
    );
    res.json(successResponse({ conversation }));
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to load conversation', error.message, 500));
  }
});

// Create new conversation
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const { agentId, title } = req.body;
    const conversation = await conversationManager.createConversation(
      req.user.id,
      agentId,
      title
    );
    res.json(successResponse({ conversation }, 'Conversation created successfully'));
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json(errorResponse('CREATION_ERROR', 'Failed to create conversation', error.message, 500));
  }
});

// Update conversation title
router.patch('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    await conversationManager.updateConversationTitle(
      req.params.conversationId,
      req.user.id,
      title
    );
    res.json(successResponse({}, 'Conversation title updated successfully'));
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json(errorResponse('UPDATE_ERROR', 'Failed to update conversation', error.message, 500));
  }
});

// Delete conversation
router.delete('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    await conversationManager.deleteConversation(
      req.params.conversationId,
      req.user.id
    );
    res.json(successResponse({}, 'Conversation deleted successfully'));
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json(errorResponse('DELETION_ERROR', 'Failed to delete conversation', error.message, 500));
  }
});

// Search conversations
router.get('/conversations/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const conversations = await conversationManager.searchConversations(
      req.user.id,
      q
    );
    res.json(successResponse({ conversations }));
  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json(errorResponse('SEARCH_ERROR', 'Failed to search conversations', error.message, 500));
  }
});

// Export conversation
router.get('/conversations/:conversationId/export', requireAuth, async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const exported = await conversationManager.exportConversation(
      req.params.conversationId,
      req.user.id,
      format
    );
    
    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${req.params.conversationId}.md"`);
      res.send(exported);
    } else {
      res.json(exported);
    }
  } catch (error) {
    console.error('Error exporting conversation:', error);
    res.status(500).json(errorResponse('EXPORT_ERROR', 'Failed to export conversation', error.message, 500));
  }
});

// Get agent suggestions based on user's needs
router.post('/agents/suggest', requireAuth, async (req, res) => {
  try {
    const { need, specialty } = req.body;
    
    let query = supabase
      .from('unified_agents')
      .select('*');
    
    if (specialty) {
      query = query.contains('specialty', [specialty]);
    }
    
    const { data: agents, error } = await query;
    
    if (error) throw error;
    
    // Score agents based on need
    const scoredAgents = agents.map(agent => {
      let score = 0;
      
      // Score based on specialty match
      if (specialty && agent.specialty?.includes(specialty)) {
        score += 10;
      }
      
      // Score based on personality match
      if (need === 'quick_answer' && agent.personality?.verbosity === 'concise') {
        score += 5;
      } else if (need === 'detailed_analysis' && agent.personality?.verbosity === 'detailed') {
        score += 5;
      }
      
      if (need === 'training' && agent.personality?.approach === 'educational') {
        score += 5;
      } else if (need === 'strategy' && agent.personality?.approach === 'consultative') {
        score += 5;
      }
      
      return { ...agent, score };
    });
    
    // Sort by score and return top 3
    const topAgents = scoredAgents
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    res.json(successResponse({ agents: topAgents }));
  } catch (error) {
    console.error('Error suggesting agents:', error);
    res.status(500).json(errorResponse('SUGGESTION_ERROR', 'Failed to suggest agents', error.message, 500));
  }
});

// Get featured procedures
router.get('/procedures/featured', checkServicesInitialized, requireAuth, async (req, res) => {
  try {
    const procedures = await procedureService.getFeaturedProcedures();
    res.json(successResponse({ procedures }));
  } catch (error) {
    console.error('Error fetching featured procedures:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch featured procedures', error.message, 500));
  }
});

// Search procedures
router.get('/procedures/search', checkServicesInitialized, requireAuth, async (req, res) => {
  try {
    const { q, type } = req.query;
    
    if (!q) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'Search query required', null, 400));
    }
    
    const results = await procedureService.searchProcedures(q, type);
    res.json(successResponse({ procedures: results }));
  } catch (error) {
    console.error('Error searching procedures:', error);
    res.status(500).json(errorResponse('SEARCH_ERROR', 'Failed to search procedures', error.message, 500));
  }
});

// Get specific procedure details
router.get('/procedures/:procedureId', checkServicesInitialized, requireAuth, async (req, res) => {
  try {
    const { procedureId } = req.params;
    const { type } = req.query;
    
    if (!type || !['dental', 'aesthetic'].includes(type)) {
      return res.status(400).json(errorResponse('INVALID_PARAMETER', 'Valid procedure type required (dental or aesthetic)', null, 400));
    }
    
    const procedure = await procedureService.getProcedure(procedureId, type);
    res.json(successResponse({ procedure }));
  } catch (error) {
    console.error('Error fetching procedure:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch procedure', error.message, 500));
  }
});

// Create conversation with procedure context
router.post('/conversations/with-procedure', checkServicesInitialized, requireAuth, async (req, res) => {
  try {
    const { agentId, procedureId, procedureType, title } = req.body;
    
    // Create conversation
    const conversation = await conversationManager.createConversation(
      req.user.id,
      agentId,
      title
    );
    
    // Add procedure context to conversation metadata
    if (procedureId && procedureType) {
      const procedure = await procedureService.getProcedure(procedureId, procedureType);
      
      // Update conversation metadata with procedure info
      await supabase
        .from('agent_conversations')
        .update({
          metadata: {
            ...conversation.metadata,
            procedureId,
            procedureType,
            procedureName: procedure.name,
            procedureContext: procedureService.generateProcedureContext(procedure)
          }
        })
        .eq('id', conversation.id);
    }
    
    res.json(successResponse({ conversation }, 'Conversation with procedure context created successfully'));
  } catch (error) {
    console.error('Error creating conversation with procedure:', error);
    res.status(500).json(errorResponse('CREATION_ERROR', 'Failed to create conversation with procedure', error.message, 500));
  }
});

// ========================================
// EXTERNAL AGENT INTEGRATION (AGENTBACKEND)
// ========================================

// Fetch agents from external agentbackend for sales purposes
router.get('/agents/external', requireAuth, async (req, res) => {
  try {
    const { role, purpose, category } = req.query;
    
    // Check if agentbackend integration is enabled
    if (!process.env.AGENTBACKEND_URL) {
      return res.status(503).json(errorResponse(
        'SERVICE_UNAVAILABLE', 
        'External agents not configured - Agentbackend integration is not enabled', 
        null, 
        503
      ));
    }
    
    // Build query parameters for sales agents
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (role) params.append('role', role);
    if (purpose) params.append('purpose', purpose);
    
    // Default to sales category if none specified
    if (!category) {
      params.append('category', 'sales');
    }
    
    const response = await fetch(`${process.env.AGENTBACKEND_URL}/api/agents?${params}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AGENTBACKEND_API_KEY && {
          'Authorization': `Bearer ${process.env.AGENTBACKEND_API_KEY}`
        })
      }
    });
    
    if (!response.ok) {
      throw new Error(`Agentbackend API failed: ${response.status}`);
    }
    
    const externalData = await response.json();
    
    // Filter agents suitable for sales reps
    const salesAgents = externalData.agents?.filter(agent => {
      // Include sales, aesthetic, and coaching agents
      const suitableCategories = ['sales', 'aesthetic', 'coaching'];
      return suitableCategories.includes(agent.category?.toLowerCase());
    }) || [];
    
    res.json(successResponse({ 
      agents: salesAgents.map(agent => ({
        ...agent,
        source: 'agentbackend',
        external: true
      })),
      count: salesAgents.length,
      source: 'agentbackend'
    }));
  } catch (error) {
    console.error('Error fetching external agents:', error);
    res.status(500).json(errorResponse(
      'EXTERNAL_SERVICE_ERROR', 
      'Failed to fetch external agents', 
      error.message, 
      500
    ));
  }
});

// Get combined agents (local unified agents + external agentbackend)
router.get('/agents/combined', requireAuth, async (req, res) => {
  try {
    const { role, purpose, category } = req.query;
    
    // Fetch local unified agents
    const localAgents = await agentCore.listAgents();
    
    // Fetch external agents from agentbackend
    let externalAgents = [];
    if (process.env.AGENTBACKEND_URL) {
      try {
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        if (role) params.append('role', role);
        if (purpose) params.append('purpose', purpose);
        
        // Default to sales category for external agents
        if (!category) {
          params.append('category', 'sales');
        }
        
        const response = await fetch(`${process.env.AGENTBACKEND_URL}/api/agents?${params}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.AGENTBACKEND_API_KEY && {
              'Authorization': `Bearer ${process.env.AGENTBACKEND_API_KEY}`
            })
          }
        });
        
        if (response.ok) {
          const externalData = await response.json();
          externalAgents = externalData.agents?.filter(agent => {
            const suitableCategories = ['sales', 'aesthetic', 'coaching'];
            return suitableCategories.includes(agent.category?.toLowerCase());
          }) || [];
        }
      } catch (error) {
        console.warn('Failed to fetch external agents, continuing with local only:', error.message);
      }
    }
    
    // Combine agents with source identification
    const combinedAgents = [
      ...localAgents.map(agent => ({ ...agent, source: 'unified', external: false })),
      ...externalAgents.map(agent => ({ ...agent, source: 'agentbackend', external: true }))
    ];
    
    res.json(successResponse({ 
      agents: combinedAgents,
      count: combinedAgents.length,
      sources: {
        unified: localAgents.length,
        agentbackend: externalAgents.length
      }
    }));
  } catch (error) {
    console.error('Error fetching combined agents:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch combined agents', error.message, 500));
  }
});

// Get agent recommendations for sales scenarios
router.post('/agents/sales/recommend', requireAuth, async (req, res) => {
  try {
    const { 
      customer_type,      // e.g., "dental_practice", "hospital_system"
      sales_stage,        // e.g., "prospecting", "demo", "closing"
      product_category,   // e.g., "dental_implants", "aesthetic_devices"
      urgency = 'medium'  // e.g., "high", "medium", "low"
    } = req.body;
    
    // Fetch combined agents
    const { agents } = await new Promise((resolve, reject) => {
      const mockReq = { user: req.user, query: { category: 'sales' } };
      const mockRes = {
        json: (data) => resolve(data),
        status: (code) => ({ json: (error) => reject(new Error(error.error)) })
      };
      
      // Use the combined agents endpoint internally
      router.stack.find(layer => 
        layer.route?.path === '/agents/combined'
      ).route.stack[0].handle(mockReq, mockRes, () => {});
    });
    
    // Smart agent recommendation algorithm
    const recommendations = agents
      .map(agent => ({
        agent,
        score: calculateAgentScore(agent, {
          customer_type,
          sales_stage,
          product_category,
          urgency
        })
      }))
      .filter(rec => rec.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) // Top 5 recommendations
      .map(rec => ({
        ...rec.agent,
        recommendation_score: rec.score,
        recommendation_reason: getRecommendationReason(rec.agent, {
          customer_type,
          sales_stage,
          product_category,
          urgency
        })
      }));
    
    res.json(successResponse({ 
      recommendations,
      count: recommendations.length,
      context: {
        customer_type,
        sales_stage,
        product_category,
        urgency
      }
    }));
  } catch (error) {
    console.error('Error getting agent recommendations:', error);
    res.status(500).json(errorResponse('RECOMMENDATION_ERROR', 'Failed to get agent recommendations', error.message, 500));
  }
});

// Create conversation with external agent
router.post('/conversations/external', requireAuth, async (req, res) => {
  try {
    const { externalAgentId, title, agentSource = 'agentbackend', context } = req.body;
    
    if (!externalAgentId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'External agent ID is required', null, 400));
    }
    
    // Create conversation with external agent reference
    const conversation = await conversationManager.createConversation(
      req.user.id,
      null, // No local agent ID
      title || `Chat with ${externalAgentId}`,
      {
        type: 'external',
        externalAgentId,
        agentSource,
        agentbackend_url: process.env.AGENTBACKEND_URL,
        context: context || {},
        created_via: 'osbackend'
      }
    );
    
    res.json(successResponse({ conversation }, 'External conversation created successfully'));
  } catch (error) {
    console.error('Error creating external conversation:', error);
    res.status(500).json(errorResponse('CREATION_ERROR', 'Failed to create conversation with external agent', error.message, 500));
  }
});

// Helper function to calculate agent score for recommendations
function calculateAgentScore(agent, context) {
  let score = 0;
  
  // Base score for external vs internal agents
  score += agent.external ? 5 : 3;
  
  // Score based on customer type
  if (context.customer_type && agent.targetAudience) {
    const audienceMatch = agent.targetAudience.some(audience => 
      audience.toLowerCase().includes(context.customer_type.toLowerCase()) ||
      context.customer_type.toLowerCase().includes(audience.toLowerCase())
    );
    if (audienceMatch) score += 10;
  }
  
  // Score based on sales stage
  if (context.sales_stage && agent.specialties) {
    const stageKeywords = {
      prospecting: ['lead', 'prospect', 'initial', 'discovery'],
      demo: ['demo', 'presentation', 'showcase', 'explanation'],
      closing: ['close', 'deal', 'negotiation', 'final'],
      followup: ['follow', 'relationship', 'maintenance', 'support']
    };
    
    const keywords = stageKeywords[context.sales_stage] || [];
    const specialtyMatch = keywords.some(keyword => 
      agent.specialties.some(specialty => 
        specialty.toLowerCase().includes(keyword)
      )
    );
    if (specialtyMatch) score += 8;
  }
  
  // Score based on product category
  if (context.product_category && agent.category) {
    const categoryMatch = agent.category.toLowerCase().includes(context.product_category.toLowerCase()) ||
                         context.product_category.toLowerCase().includes(agent.category.toLowerCase());
    if (categoryMatch) score += 7;
  }
  
  // Urgency modifier
  const urgencyMultiplier = {
    high: 1.2,
    medium: 1.0,
    low: 0.8
  };
  score *= urgencyMultiplier[context.urgency] || 1.0;
  
  return Math.round(score);
}

// Helper function to generate recommendation reason
function getRecommendationReason(agent, context) {
  const reasons = [];
  
  if (agent.external) {
    reasons.push('Specialized external agent');
  }
  
  if (context.customer_type && agent.targetAudience) {
    const audienceMatch = agent.targetAudience.some(audience => 
      audience.toLowerCase().includes(context.customer_type.toLowerCase())
    );
    if (audienceMatch) {
      reasons.push(`Expert in ${context.customer_type} market`);
    }
  }
  
  if (context.sales_stage && agent.specialties) {
    const stageMatch = agent.specialties.some(specialty => 
      specialty.toLowerCase().includes(context.sales_stage)
    );
    if (stageMatch) {
      reasons.push(`Specialized in ${context.sales_stage} stage`);
    }
  }
  
  if (context.product_category && agent.category) {
    const categoryMatch = agent.category.toLowerCase().includes(context.product_category.toLowerCase());
    if (categoryMatch) {
      reasons.push(`${agent.category} category expert`);
    }
  }
  
  return reasons.join(', ') || 'Good general match for your requirements';
}

export default router;