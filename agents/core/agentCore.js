import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export class AgentCore {
  constructor() {
    // Initialize Anthropic if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    } else {
      console.warn('AgentCore: Anthropic API key not found');
      this.anthropic = null;
    }

    // Initialize Supabase if credentials are available
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (process.env.SUPABASE_URL && supabaseKey) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        supabaseKey
      );
    } else {
      console.warn('AgentCore: Supabase credentials not found');
      this.supabase = null;
    }

    this.agentCache = new Map();
  }

  async getAgent(agentId) {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    // Check cache first
    if (this.agentCache.has(agentId)) {
      return this.agentCache.get(agentId);
    }

    // Fetch from database
    const { data: agent, error } = await this.supabase
      .from('canvas_ai_agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch agent: ${error.message}`);
    }

    // Cache the agent
    this.agentCache.set(agentId, agent);
    return agent;
  }

  async listAgents() {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    const { data: agents, error } = await this.supabase
      .from('canvas_ai_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list agents: ${error.message}`);
    }

    return agents;
  }

  async createAgent(agentData) {
    const { data: agent, error } = await this.supabase
      .from('canvas_ai_agents')
      .insert(agentData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }

    // Clear cache
    this.agentCache.delete(agent.id);
    return agent;
  }

  async updateAgent(agentId, updates) {
    const { data: agent, error } = await this.supabase
      .from('canvas_ai_agents')
      .update(updates)
      .eq('id', agentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update agent: ${error.message}`);
    }

    // Clear cache
    this.agentCache.delete(agentId);
    return agent;
  }

  buildSystemPrompt(agent, context) {
    const basePrompt = agent.system_prompt || this.getDefaultSystemPrompt(agent);
    
    // Add procedure knowledge
    let procedureContext = '';
    
    // Check if we have specific procedure context from the conversation
    if (context.metadata?.procedureContext) {
      const pc = context.metadata.procedureContext;
      procedureContext = `
You are currently specialized in ${pc.name} (${pc.category} - ${pc.subcategory}).

## Product Knowledge
- Manufacturer: ${pc.manufacturer || 'Various'}
- Price Range: ${pc.price_range}
- Treatment Duration: ${pc.treatment_duration || 'Varies'}
- Target Demographics: ${pc.target_demographics}

## Key Selling Points
${pc.key_features.map(point => `- ${point}`).join('\n')}

## Competitive Advantages  
${pc.competitive_advantages.map(adv => `- ${adv}`).join('\n')}

## Sales Strategy
${pc.sales_strategy}

## ROI Timeline
${pc.roi_timeline}

Use this specialized knowledge to provide expert guidance on selling ${pc.name}.
`;
    } else if (agent.specialty && agent.specialty.length > 0) {
      // Fallback to general specialties
      procedureContext = `
You are specialized in the following medical procedures:
${agent.specialty.join(', ')}

Use your deep knowledge of these procedures to provide expert guidance on:
- Patient qualification and selection
- Pricing and insurance considerations
- Competition and market positioning
- Technical specifications and advantages
- Common objections and how to address them
`;
    }

    // Add conversation context
    let conversationContext = '';
    if (context.previousMessages && context.previousMessages.length > 0) {
      conversationContext = `
Previous conversation context:
${context.previousMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
`;
    }

    // Add user context
    let userContext = '';
    if (context.userData) {
      userContext = `
User information:
- Name: ${context.userData.name || 'Not provided'}
- Territory: ${context.userData.territory || 'Not specified'}
- Experience: ${context.userData.experience || 'Not specified'}
`;
    }

    return `${basePrompt}

${procedureContext}
${conversationContext}
${userContext}

Current date: ${new Date().toISOString().split('T')[0]}
`;
  }

  getDefaultSystemPrompt(agent) {
    return `You are ${agent.name}, a specialized AI sales agent for Canvas Sales Intelligence.

Your personality traits:
- Tone: ${agent.personality?.tone || 'professional'}
- Verbosity: ${agent.personality?.verbosity || 'concise'}
- Approach: ${agent.personality?.approach || 'consultative'}

Your role is to help medical sales representatives:
1. Research healthcare professionals effectively
2. Understand medical procedures and their market
3. Create compelling outreach strategies
4. Navigate competitive landscapes
5. Close more deals with data-driven insights

You have access to:
- NPI database for doctor verification
- Real-time market intelligence
- Procedure pricing and adoption data
- Competitor analysis
- Sales best practices

Always be helpful, accurate, and focused on driving sales success. When you don't have specific information, guide the user on how to find it using Canvas's research tools.`;
  }

  async streamResponse(agentId, message, context, userId) {
    const agent = await this.getAgent(agentId);
    const systemPrompt = this.buildSystemPrompt(agent, context);

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history if available
    if (context.previousMessages) {
      messages.push(...context.previousMessages.slice(-10)); // Last 10 messages
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Create streaming response
    const stream = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      messages,
      max_tokens: 2000,
      stream: true,
      temperature: agent.personality?.temperature || 0.7
    });

    // Transform stream to our format
    return this.transformAnthropicStream(stream);
  }

  async *transformAnthropicStream(anthropicStream) {
    try {
      for await (const chunk of anthropicStream) {
        if (chunk.type === 'content_block_delta') {
          yield {
            type: 'text_delta',
            text: chunk.delta.text
          };
        } else if (chunk.type === 'message_start') {
          yield {
            type: 'message_start',
            id: chunk.message.id
          };
        } else if (chunk.type === 'message_stop') {
          yield {
            type: 'message_complete'
          };
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  async checkProactiveInsights(conversationId, userId) {
    // Analyze conversation for opportunities to provide proactive insights
    const insights = [];

    // Get conversation data
    const { data: conversation } = await this.supabase
      .from('agent_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (!conversation || !conversation.messages) {
      return insights;
    }

    // Check for various insight triggers
    const lastMessages = conversation.messages.slice(-5);
    const messageContent = lastMessages.map(m => m.content).join(' ').toLowerCase();

    // Doctor mentioned without research
    if (messageContent.includes('dr.') || messageContent.includes('doctor')) {
      const doctorMatch = messageContent.match(/dr\.?\s+(\w+\s*\w*)/i);
      if (doctorMatch) {
        insights.push({
          type: 'doctor_research',
          title: 'Research Available',
          message: `I can help you research ${doctorMatch[0]}. Would you like me to pull their NPI data and practice information?`,
          action: 'research_doctor',
          data: { doctorName: doctorMatch[1] }
        });
      }
    }

    // Procedure mentioned
    const procedures = ['implant', 'invisalign', 'botox', 'filler', 'laser', 'crown', 'veneer'];
    for (const procedure of procedures) {
      if (messageContent.includes(procedure)) {
        insights.push({
          type: 'procedure_intel',
          title: 'Procedure Intelligence',
          message: `I have detailed market data on ${procedure}s in your area. Would you like to see pricing, adoption rates, and top providers?`,
          action: 'show_procedure_data',
          data: { procedure }
        });
      }
    }

    // Competition mentioned
    if (messageContent.includes('competitor') || messageContent.includes('competition')) {
      insights.push({
        type: 'competitive_analysis',
        title: 'Competitive Intelligence',
        message: 'I can provide a competitive analysis for your territory. Want to see who your main competitors are and their strategies?',
        action: 'competitive_analysis'
      });
    }

    return insights;
  }

  async generateVoiceResponse(text, agentId) {
    // This would integrate with a TTS service
    // For now, return null to indicate text-only response
    return null;
  }

  async logInteraction(conversationId, userId, metrics) {
    // Log interaction metrics for learning
    await this.supabase
      .from('agent_interaction_logs')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        metrics,
        timestamp: new Date().toISOString()
      });
  }
}