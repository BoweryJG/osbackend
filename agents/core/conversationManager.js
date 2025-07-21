import { v4 as uuidv4 } from 'uuid';

export class ConversationManager {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async createConversation(userId, agentId, title = null) {
    const conversationId = uuidv4();
    
    const { data, error } = await this.supabase
      .from('agent_conversations')
      .insert({
        id: conversationId,
        user_id: userId,
        agent_id: agentId,
        title: title || `New Conversation - ${new Date().toLocaleDateString()}`,
        messages: [],
        metadata: {
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    return data;
  }

  async listConversations(userId) {
    const { data, error } = await this.supabase
      .from('agent_conversations')
      .select(`
        id,
        title,
        agent_id,
        created_at,
        metadata,
        unified_agents (
          id,
          name,
          avatar_url,
          specialty
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }

    // Add summary of last message
    const conversationsWithSummary = data.map(conv => {
      const lastMessage = conv.messages?.[conv.messages.length - 1];
      return {
        ...conv,
        lastMessage: lastMessage ? {
          content: lastMessage.content.substring(0, 100) + '...',
          timestamp: lastMessage.timestamp,
          role: lastMessage.role
        } : null
      };
    });

    return conversationsWithSummary;
  }

  async loadConversation(conversationId, userId) {
    const { data, error } = await this.supabase
      .from('agent_conversations')
      .select(`
        *,
        unified_agents (
          id,
          name,
          avatar_url,
          specialty,
          personality
        )
      `)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to load conversation: ${error.message}`);
    }

    return data;
  }

  async addMessage(conversationId, message) {
    // Get current conversation
    const { data: conversation, error: fetchError } = await this.supabase
      .from('agent_conversations')
      .select('messages')
      .eq('id', conversationId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch conversation: ${fetchError.message}`);
    }

    // Add new message
    const newMessage = {
      id: uuidv4(),
      ...message,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...(conversation.messages || []), newMessage];

    // Update conversation
    const { error: updateError } = await this.supabase
      .from('agent_conversations')
      .update({
        messages: updatedMessages,
        metadata: {
          ...conversation.metadata,
          last_active: new Date().toISOString(),
          message_count: updatedMessages.length
        }
      })
      .eq('id', conversationId);

    if (updateError) {
      throw new Error(`Failed to add message: ${updateError.message}`);
    }

    return newMessage;
  }

  async getConversationContext(conversationId, userId) {
    const conversation = await this.loadConversation(conversationId, userId);
    
    // Get user data
    const { data: userData } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Get recent Canvas research if available
    const { data: recentResearch } = await this.supabase
      .from('canvas_research_cache')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get recent scans
    const { data: recentScans } = await this.supabase
      .from('canvas_scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      conversationId,
      agentId: conversation.agent_id,
      previousMessages: conversation.messages || [],
      userData,
      recentResearch,
      recentScans,
      metadata: conversation.metadata
    };
  }

  async deleteConversation(conversationId, userId) {
    const { error } = await this.supabase
      .from('agent_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }

    return { success: true };
  }

  async updateConversationTitle(conversationId, userId, title) {
    const { error } = await this.supabase
      .from('agent_conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update conversation title: ${error.message}`);
    }

    return { success: true };
  }

  async searchConversations(userId, searchTerm) {
    // This would use full-text search or vector search
    // For now, simple implementation
    const { data, error } = await this.supabase
      .from('agent_conversations')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', `%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to search conversations: ${error.message}`);
    }

    return data;
  }

  async exportConversation(conversationId, userId, format = 'json') {
    const conversation = await this.loadConversation(conversationId, userId);

    if (format === 'json') {
      return conversation;
    } else if (format === 'markdown') {
      // Convert to markdown format
      let markdown = `# ${conversation.title}\n\n`;
      markdown += `Agent: ${conversation.unified_agents.name}\n`;
      markdown += `Date: ${new Date(conversation.created_at).toLocaleDateString()}\n\n`;
      
      conversation.messages.forEach(msg => {
        markdown += `### ${msg.role === 'user' ? 'You' : conversation.unified_agents.name}\n`;
        markdown += `${msg.content}\n\n`;
      });

      return markdown;
    }

    throw new Error('Unsupported export format');
  }
}