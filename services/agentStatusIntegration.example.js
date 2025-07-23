import logger from '../utils/logger.js';

import { emitAgentStatusChange } from './websocketManager.js';

/**
 * Example integration for agent status changes
 * This shows how to emit WebSocket events when agent status changes
 */

// Example: Agent becomes online
export function notifyAgentOnline(agentId, metadata = {}) {
  try {
    emitAgentStatusChange(agentId, {
      status: 'online',
      timestamp: new Date().toISOString(),
      ...metadata
    });
    
    logger.info(`Agent ${agentId} is now online`);
  } catch (error) {
    logger.error('Failed to emit agent online status:', error);
  }
}

// Example: Agent becomes offline
export function notifyAgentOffline(agentId, reason = 'normal') {
  try {
    emitAgentStatusChange(agentId, {
      status: 'offline',
      reason,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Agent ${agentId} is now offline: ${reason}`);
  } catch (error) {
    logger.error('Failed to emit agent offline status:', error);
  }
}

// Example: Agent is busy/in conversation
export function notifyAgentBusy(agentId, conversationId) {
  try {
    emitAgentStatusChange(agentId, {
      status: 'busy',
      conversationId,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Agent ${agentId} is busy with conversation ${conversationId}`);
  } catch (error) {
    logger.error('Failed to emit agent busy status:', error);
  }
}

// Example: Agent is available
export function notifyAgentAvailable(agentId) {
  try {
    emitAgentStatusChange(agentId, {
      status: 'available',
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Agent ${agentId} is now available`);
  } catch (error) {
    logger.error('Failed to emit agent available status:', error);
  }
}

// Example: Agent training/updating
export function notifyAgentTraining(agentId, progress) {
  try {
    emitAgentStatusChange(agentId, {
      status: 'training',
      progress,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Agent ${agentId} training progress: ${progress}%`);
  } catch (error) {
    logger.error('Failed to emit agent training status:', error);
  }
}

// Example: Agent error
export function notifyAgentError(agentId, error) {
  try {
    emitAgentStatusChange(agentId, {
      status: 'error',
      error: error.message || error,
      timestamp: new Date().toISOString()
    });
    
    logger.error(`Agent ${agentId} encountered error: ${error.message || error}`);
  } catch (error) {
    logger.error('Failed to emit agent error status:', error);
  }
}

// Example usage in your agent service:
/*
import { notifyAgentOnline, notifyAgentOffline, notifyAgentBusy } from './agentStatusIntegration.example.js';

// When agent starts
async function startAgent(agentId) {
  // ... agent initialization logic ...
  notifyAgentOnline(agentId, { version: '1.0.0' });
}

// When agent handles a conversation
async function handleConversation(agentId, conversationId) {
  notifyAgentBusy(agentId, conversationId);
  
  try {
    // ... handle conversation ...
  } finally {
    notifyAgentAvailable(agentId);
  }
}

// When agent shuts down
async function stopAgent(agentId) {
  notifyAgentOffline(agentId, 'shutdown');
  // ... cleanup logic ...
}
*/