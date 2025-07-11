import { personalityEngine } from './personalityEngine.js';
import { AgentCore } from '../agents/core/agentCore.js';

/**
 * Example integration of PersonalityEngine with existing AgentCore
 */
export class PersonalityAwareAgent extends AgentCore {
  constructor() {
    super();
    this.personalityEngine = personalityEngine;
  }

  /**
   * Create an agent with a specific personality
   * @param {Object} agentData - Agent configuration
   * @param {string} personalityTemplate - Optional personality template name
   * @returns {Promise<Object>} Created agent
   */
  async createAgentWithPersonality(agentData, personalityTemplate = null) {
    // Get personality traits
    let personalityTraits;
    if (personalityTemplate) {
      personalityTraits = this.personalityEngine.getTemplate(personalityTemplate);
    } else {
      personalityTraits = this.personalityEngine.getDefaultPersonality().traits;
    }

    // Apply personality to system prompt
    const enhancedPrompt = this.personalityEngine.applyPersonalityToPrompt(
      personalityTraits,
      agentData.system_prompt || ''
    );

    // Create agent with personality
    const agent = await this.createAgent({
      ...agentData,
      system_prompt: enhancedPrompt,
      personality: {
        traits: personalityTraits,
        template: personalityTemplate || 'custom',
        created_at: new Date().toISOString()
      }
    });

    return agent;
  }

  /**
   * Update agent personality using natural language
   * @param {string} agentId - Agent ID
   * @param {string} command - Natural language command
   * @returns {Promise<Object>} Updated agent
   */
  async updateAgentPersonalityNL(agentId, command) {
    // Get current agent
    const agent = await this.getAgent(agentId);
    
    // Get current personality traits
    const currentTraits = agent.personality?.traits || 
      this.personalityEngine.getDefaultPersonality().traits;

    // Parse natural language command
    const updatedTraits = await this.personalityEngine.parseNaturalLanguage(
      command,
      currentTraits
    );

    // Validate traits
    const warnings = this.personalityEngine.validateTraits(updatedTraits);

    // Apply personality to system prompt
    const basePrompt = agent.system_prompt?.replace(/\n\nPersonality Guidelines:[\s\S]*?(?=\n\n|$)/, '') || '';
    const enhancedPrompt = this.personalityEngine.applyPersonalityToPrompt(
      updatedTraits,
      basePrompt
    );

    // Update agent
    const updatedAgent = await this.updateAgent(agentId, {
      system_prompt: enhancedPrompt,
      personality: {
        traits: updatedTraits,
        warnings,
        last_command: command,
        updated_at: new Date().toISOString()
      }
    });

    return updatedAgent;
  }

  /**
   * Apply personality template to agent
   * @param {string} agentId - Agent ID
   * @param {string} templateName - Template name
   * @returns {Promise<Object>} Updated agent
   */
  async applyPersonalityTemplate(agentId, templateName) {
    const agent = await this.getAgent(agentId);
    const templateTraits = this.personalityEngine.getTemplate(templateName);
    
    // Apply personality to system prompt
    const basePrompt = agent.system_prompt?.replace(/\n\nPersonality Guidelines:[\s\S]*?(?=\n\n|$)/, '') || '';
    const enhancedPrompt = this.personalityEngine.applyPersonalityToPrompt(
      templateTraits,
      basePrompt
    );

    // Update agent
    const updatedAgent = await this.updateAgent(agentId, {
      system_prompt: enhancedPrompt,
      personality: {
        traits: templateTraits,
        template: templateName,
        updated_at: new Date().toISOString()
      }
    });

    return updatedAgent;
  }

  /**
   * Blend multiple personality templates for an agent
   * @param {string} agentId - Agent ID
   * @param {Array<string>} templateNames - Template names to blend
   * @param {Object} weights - Optional weights for each template
   * @returns {Promise<Object>} Updated agent
   */
  async blendPersonalityTemplates(agentId, templateNames, weights = {}) {
    const agent = await this.getAgent(agentId);
    const blendedTraits = this.personalityEngine.blendTemplates(templateNames, weights);
    
    // Apply personality to system prompt
    const basePrompt = agent.system_prompt?.replace(/\n\nPersonality Guidelines:[\s\S]*?(?=\n\n|$)/, '') || '';
    const enhancedPrompt = this.personalityEngine.applyPersonalityToPrompt(
      blendedTraits,
      basePrompt
    );

    // Update agent
    const updatedAgent = await this.updateAgent(agentId, {
      system_prompt: enhancedPrompt,
      personality: {
        traits: blendedTraits,
        template: 'blended',
        blend_config: { templates: templateNames, weights },
        updated_at: new Date().toISOString()
      }
    });

    return updatedAgent;
  }

  /**
   * Get personality analysis for an agent
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Personality analysis
   */
  async analyzeAgentPersonality(agentId) {
    const agent = await this.getAgent(agentId);
    const personality = agent.personality || this.personalityEngine.getDefaultPersonality();
    
    const analysis = {
      traits: personality.traits,
      template: personality.template,
      description: this.personalityEngine.describePersonality(personality.traits),
      warnings: this.personalityEngine.validateTraits(personality.traits),
      last_updated: personality.updated_at || personality.created_at
    };

    return analysis;
  }
}

// Example usage
async function demonstrateIntegration() {
  const personalityAgent = new PersonalityAwareAgent();

  console.log('=== Personality-Aware Agent Integration Demo ===\n');

  // Example 1: Create agent with personality template
  console.log('1. Creating Sales Agent with personality template...');
  try {
    const salesAgent = await personalityAgent.createAgentWithPersonality({
      name: 'Alex Sales Pro',
      specialty: ['sales', 'customer relations'],
      system_prompt: 'You are a sales expert helping with customer inquiries.'
    }, 'sales');
    
    console.log('Created agent:', salesAgent.name);
    console.log('Personality:', salesAgent.personality.template);
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Example 2: Update personality with natural language
  console.log('\n2. Updating agent personality with natural language...');
  // This would require an existing agent ID
  // const updatedAgent = await personalityAgent.updateAgentPersonalityNL(
  //   agentId,
  //   "Make the agent more friendly but keep it professional"
  // );

  // Example 3: Blend templates
  console.log('\n3. Creating blended personality agent...');
  try {
    const blendedAgent = await personalityAgent.createAgentWithPersonality({
      name: 'Balanced Assistant',
      specialty: ['general', 'support'],
      system_prompt: 'You are a helpful assistant.'
    });
    
    // Would then apply blended personality
    // await personalityAgent.blendPersonalityTemplates(
    //   blendedAgent.id,
    //   ['professional', 'friendly'],
    //   { professional: 0.6, friendly: 0.4 }
    // );
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\n=== Integration Demo Complete ===');
}

// Uncomment to run demo
// demonstrateIntegration().catch(console.error);

export default PersonalityAwareAgent;