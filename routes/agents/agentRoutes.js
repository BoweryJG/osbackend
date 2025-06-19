import express from 'express';
import { AgentCore } from '../../agents/core/agentCore.js';
import { ConversationManager } from '../../agents/core/conversationManager.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const agentCore = new AgentCore();
const conversationManager = new ConversationManager(supabase);

// Middleware to verify authentication
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// List all available agents
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const agents = await agentCore.listAgents();
    res.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Get specific agent details
router.get('/agents/:agentId', requireAuth, async (req, res) => {
  try {
    const agent = await agentCore.getAgent(req.params.agentId);
    res.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
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
      return res.status(403).json({ error: 'Admin access required' });
    }

    const agent = await agentCore.createAgent(req.body);
    res.json({ agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
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
      return res.status(403).json({ error: 'Admin access required' });
    }

    const agent = await agentCore.updateAgent(req.params.agentId, req.body);
    res.json({ agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// List user conversations
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await conversationManager.listConversations(req.user.id);
    res.json({ conversations });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Get specific conversation
router.get('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    const conversation = await conversationManager.loadConversation(
      req.params.conversationId,
      req.user.id
    );
    res.json({ conversation });
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
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
    res.json({ conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
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
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Delete conversation
router.delete('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    await conversationManager.deleteConversation(
      req.params.conversationId,
      req.user.id
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
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
    res.json({ conversations });
  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json({ error: 'Failed to search conversations' });
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
    res.status(500).json({ error: 'Failed to export conversation' });
  }
});

// Get agent suggestions based on user's needs
router.post('/agents/suggest', requireAuth, async (req, res) => {
  try {
    const { need, specialty } = req.body;
    
    let query = supabase
      .from('canvas_ai_agents')
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
    
    res.json({ agents: topAgents });
  } catch (error) {
    console.error('Error suggesting agents:', error);
    res.status(500).json({ error: 'Failed to suggest agents' });
  }
});

export default router;