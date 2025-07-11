import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY ? 
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : 
  null;

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY ?
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) :
  null;

// Personality trait schema with dimensions
const PERSONALITY_DIMENSIONS = {
  professionalism: {
    min: 0,
    max: 10,
    default: 7,
    description: 'Level of formal vs casual communication'
  },
  friendliness: {
    min: 0,
    max: 10,
    default: 6,
    description: 'Warmth and approachability in interactions'
  },
  assertiveness: {
    min: 0,
    max: 10,
    default: 5,
    description: 'Directness and confidence in communication'
  },
  humor: {
    min: 0,
    max: 10,
    default: 3,
    description: 'Use of humor and playfulness'
  },
  empathy: {
    min: 0,
    max: 10,
    default: 7,
    description: 'Understanding and emotional sensitivity'
  },
  verbosity: {
    min: 0,
    max: 10,
    default: 5,
    description: 'Level of detail and length in responses'
  },
  formality: {
    min: 0,
    max: 10,
    default: 6,
    description: 'Adherence to formal language conventions'
  },
  creativity: {
    min: 0,
    max: 10,
    default: 5,
    description: 'Innovation and creative expression'
  }
};

// Personality templates
const PERSONALITY_TEMPLATES = {
  professional: {
    name: 'Professional Consultant',
    traits: {
      professionalism: 9,
      friendliness: 5,
      assertiveness: 7,
      humor: 2,
      empathy: 6,
      verbosity: 6,
      formality: 8,
      creativity: 4
    }
  },
  friendly: {
    name: 'Friendly Assistant',
    traits: {
      professionalism: 6,
      friendliness: 9,
      assertiveness: 4,
      humor: 6,
      empathy: 8,
      verbosity: 5,
      formality: 4,
      creativity: 6
    }
  },
  sales: {
    name: 'Sales Expert',
    traits: {
      professionalism: 7,
      friendliness: 8,
      assertiveness: 8,
      humor: 4,
      empathy: 7,
      verbosity: 7,
      formality: 5,
      creativity: 7
    }
  },
  technical: {
    name: 'Technical Expert',
    traits: {
      professionalism: 8,
      friendliness: 4,
      assertiveness: 6,
      humor: 1,
      empathy: 4,
      verbosity: 8,
      formality: 7,
      creativity: 5
    }
  },
  casual: {
    name: 'Casual Buddy',
    traits: {
      professionalism: 3,
      friendliness: 9,
      assertiveness: 5,
      humor: 8,
      empathy: 7,
      verbosity: 4,
      formality: 2,
      creativity: 8
    }
  }
};

// Trait conflict rules
const TRAIT_CONFLICTS = [
  {
    traits: ['professionalism', 'humor'],
    rule: (traits) => {
      if (traits.professionalism > 8 && traits.humor > 6) {
        return 'High professionalism conflicts with high humor. Consider reducing one.';
      }
    }
  },
  {
    traits: ['formality', 'friendliness'],
    rule: (traits) => {
      if (traits.formality > 8 && traits.friendliness > 8) {
        return 'Very high formality may conflict with very high friendliness. Consider balancing.';
      }
    }
  },
  {
    traits: ['assertiveness', 'empathy'],
    rule: (traits) => {
      if (traits.assertiveness > 9 && traits.empathy < 3) {
        return 'Very high assertiveness with very low empathy may seem aggressive.';
      }
    }
  }
];

export class PersonalityEngine {
  constructor() {
    this.openai = openai;
    this.supabase = supabase;
  }

  /**
   * Parse natural language command to personality traits
   * @param {string} command - Natural language command
   * @param {Object} currentTraits - Current personality traits
   * @returns {Promise<Object>} Updated personality traits
   */
  async parseNaturalLanguage(command, currentTraits = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    // Create a prompt for GPT to parse the command
    const systemPrompt = `You are a personality trait parser. Convert natural language commands into numerical personality trait values.

Available traits (0-10 scale):
${Object.entries(PERSONALITY_DIMENSIONS).map(([trait, config]) => 
  `- ${trait}: ${config.description} (default: ${config.default})`
).join('\n')}

Current traits: ${JSON.stringify(currentTraits, null, 2)}

Parse the command and return a JSON object with updated trait values. Only include traits that should be changed.
Consider relative changes (e.g., "more friendly" means increase current value, not set to maximum).

Examples:
- "Make more friendly" -> increase friendliness by 2-3 points
- "Be professional but approachable" -> set professionalism to 7-8, friendliness to 6-7
- "Less verbose" -> decrease verbosity by 2-3 points
- "Add some humor" -> increase humor by 2-3 points

Return ONLY valid JSON with trait names and numerical values.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: command }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const parsedTraits = JSON.parse(response.choices[0].message.content);
      
      // Validate and merge with current traits
      const updatedTraits = { ...currentTraits };
      
      for (const [trait, value] of Object.entries(parsedTraits)) {
        if (PERSONALITY_DIMENSIONS[trait]) {
          // Ensure value is within bounds
          const dimension = PERSONALITY_DIMENSIONS[trait];
          updatedTraits[trait] = Math.max(dimension.min, Math.min(dimension.max, Number(value)));
        }
      }

      return updatedTraits;
    } catch (error) {
      console.error('Error parsing natural language:', error);
      throw new Error(`Failed to parse personality command: ${error.message}`);
    }
  }

  /**
   * Convert personality traits to prompt modifications
   * @param {Object} traits - Personality trait values
   * @param {string} basePrompt - Base system prompt
   * @returns {string} Modified prompt with personality instructions
   */
  applyPersonalityToPrompt(traits, basePrompt = '') {
    const personalityInstructions = [];

    // Professionalism
    if (traits.professionalism !== undefined) {
      if (traits.professionalism >= 8) {
        personalityInstructions.push('Maintain a highly professional tone. Use formal language and business etiquette.');
      } else if (traits.professionalism <= 3) {
        personalityInstructions.push('Use a casual, relaxed tone. Avoid overly formal language.');
      } else if (traits.professionalism >= 6) {
        personalityInstructions.push('Be professional but not overly formal.');
      }
    }

    // Friendliness
    if (traits.friendliness !== undefined) {
      if (traits.friendliness >= 8) {
        personalityInstructions.push('Be very warm, welcoming, and enthusiastic. Show genuine interest in helping.');
      } else if (traits.friendliness <= 3) {
        personalityInstructions.push('Maintain a neutral, matter-of-fact tone without excessive warmth.');
      } else if (traits.friendliness >= 6) {
        personalityInstructions.push('Be friendly and approachable.');
      }
    }

    // Assertiveness
    if (traits.assertiveness !== undefined) {
      if (traits.assertiveness >= 8) {
        personalityInstructions.push('Be direct, confident, and decisive in your communication.');
      } else if (traits.assertiveness <= 3) {
        personalityInstructions.push('Use softer, more tentative language. Offer suggestions rather than directives.');
      } else if (traits.assertiveness >= 6) {
        personalityInstructions.push('Be reasonably assertive and confident.');
      }
    }

    // Humor
    if (traits.humor !== undefined) {
      if (traits.humor >= 7) {
        personalityInstructions.push('Use appropriate humor, wit, and playfulness to engage.');
      } else if (traits.humor <= 2) {
        personalityInstructions.push('Avoid humor and maintain a serious tone.');
      } else if (traits.humor >= 4) {
        personalityInstructions.push('Occasionally use light humor when appropriate.');
      }
    }

    // Empathy
    if (traits.empathy !== undefined) {
      if (traits.empathy >= 8) {
        personalityInstructions.push('Show deep understanding and emotional sensitivity. Acknowledge feelings and concerns.');
      } else if (traits.empathy <= 3) {
        personalityInstructions.push('Focus on facts and solutions rather than emotional aspects.');
      } else if (traits.empathy >= 6) {
        personalityInstructions.push('Show understanding and consideration for the user\'s perspective.');
      }
    }

    // Verbosity
    if (traits.verbosity !== undefined) {
      if (traits.verbosity >= 8) {
        personalityInstructions.push('Provide detailed, comprehensive responses with thorough explanations.');
      } else if (traits.verbosity <= 3) {
        personalityInstructions.push('Keep responses brief and to the point. Avoid unnecessary details.');
      } else if (traits.verbosity >= 6) {
        personalityInstructions.push('Provide reasonably detailed responses.');
      }
    }

    // Formality
    if (traits.formality !== undefined) {
      if (traits.formality >= 8) {
        personalityInstructions.push('Use formal titles, proper grammar, and avoid contractions.');
      } else if (traits.formality <= 3) {
        personalityInstructions.push('Use contractions, colloquialisms, and informal expressions.');
      }
    }

    // Creativity
    if (traits.creativity !== undefined) {
      if (traits.creativity >= 8) {
        personalityInstructions.push('Be creative and innovative in your responses. Think outside the box.');
      } else if (traits.creativity <= 3) {
        personalityInstructions.push('Stick to conventional, tried-and-true approaches.');
      }
    }

    // Combine personality instructions with base prompt
    const personalitySection = personalityInstructions.length > 0 
      ? `\n\nPersonality Guidelines:\n${personalityInstructions.map(i => `- ${i}`).join('\n')}\n\n`
      : '';

    return basePrompt + personalitySection;
  }

  /**
   * Validate personality traits for conflicts
   * @param {Object} traits - Personality trait values
   * @returns {Array} Array of conflict warnings
   */
  validateTraits(traits) {
    const warnings = [];

    // Check for conflicts
    for (const conflict of TRAIT_CONFLICTS) {
      const warning = conflict.rule(traits);
      if (warning) {
        warnings.push(warning);
      }
    }

    // Check for extreme values
    for (const [trait, value] of Object.entries(traits)) {
      if (value === 0) {
        warnings.push(`${trait} is at minimum (0). This may result in complete absence of this trait.`);
      } else if (value === 10) {
        warnings.push(`${trait} is at maximum (10). This may result in excessive ${trait}.`);
      }
    }

    return warnings;
  }

  /**
   * Get a personality template
   * @param {string} templateName - Name of the template
   * @returns {Object} Template traits
   */
  getTemplate(templateName) {
    const template = PERSONALITY_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found. Available templates: ${Object.keys(PERSONALITY_TEMPLATES).join(', ')}`);
    }
    return { ...template.traits };
  }

  /**
   * List all available templates
   * @returns {Object} All personality templates
   */
  listTemplates() {
    return Object.entries(PERSONALITY_TEMPLATES).map(([key, template]) => ({
      key,
      name: template.name,
      traits: template.traits
    }));
  }

  /**
   * Store personality configuration in database
   * @param {string} agentId - Agent ID
   * @param {Object} personality - Personality configuration
   * @returns {Promise<Object>} Updated agent
   */
  async storePersonality(agentId, personality) {
    if (!this.supabase) {
      throw new Error('Database connection not configured');
    }

    // Validate traits
    const warnings = this.validateTraits(personality.traits || {});
    
    // Update agent personality in database
    const { data, error } = await this.supabase
      .from('canvas_ai_agents')
      .update({ 
        personality: {
          ...personality,
          warnings,
          updated_at: new Date().toISOString()
        }
      })
      .eq('id', agentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store personality: ${error.message}`);
    }

    return data;
  }

  /**
   * Load personality configuration from database
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Personality configuration
   */
  async loadPersonality(agentId) {
    if (!this.supabase) {
      throw new Error('Database connection not configured');
    }

    const { data, error } = await this.supabase
      .from('canvas_ai_agents')
      .select('personality')
      .eq('id', agentId)
      .single();

    if (error) {
      throw new Error(`Failed to load personality: ${error.message}`);
    }

    return data?.personality || this.getDefaultPersonality();
  }

  /**
   * Get default personality configuration
   * @returns {Object} Default personality
   */
  getDefaultPersonality() {
    const traits = {};
    for (const [dimension, config] of Object.entries(PERSONALITY_DIMENSIONS)) {
      traits[dimension] = config.default;
    }
    return {
      traits,
      template: 'default',
      created_at: new Date().toISOString()
    };
  }

  /**
   * Create a custom personality from multiple templates
   * @param {Array<string>} templateNames - Template names to blend
   * @param {Object} weights - Optional weights for each template
   * @returns {Object} Blended personality traits
   */
  blendTemplates(templateNames, weights = {}) {
    const blendedTraits = {};
    const totalWeight = templateNames.reduce((sum, name) => sum + (weights[name] || 1), 0);

    // Initialize all traits to 0
    for (const dimension of Object.keys(PERSONALITY_DIMENSIONS)) {
      blendedTraits[dimension] = 0;
    }

    // Blend templates
    for (const templateName of templateNames) {
      const template = this.getTemplate(templateName);
      const weight = (weights[templateName] || 1) / totalWeight;

      for (const [trait, value] of Object.entries(template)) {
        blendedTraits[trait] += value * weight;
      }
    }

    // Round to nearest integer
    for (const trait of Object.keys(blendedTraits)) {
      blendedTraits[trait] = Math.round(blendedTraits[trait]);
    }

    return blendedTraits;
  }

  /**
   * Generate a personality description from traits
   * @param {Object} traits - Personality trait values
   * @returns {string} Human-readable description
   */
  describePersonality(traits) {
    const descriptions = [];

    // Analyze each trait
    for (const [trait, value] of Object.entries(traits)) {
      const dimension = PERSONALITY_DIMENSIONS[trait];
      if (!dimension) continue;

      let intensity = '';
      if (value >= 8) intensity = 'very high';
      else if (value >= 6) intensity = 'high';
      else if (value >= 4) intensity = 'moderate';
      else if (value >= 2) intensity = 'low';
      else intensity = 'very low';

      descriptions.push(`${intensity} ${trait}`);
    }

    // Create overall personality profile
    let profile = 'This personality configuration features ';
    profile += descriptions.slice(0, -1).join(', ');
    if (descriptions.length > 1) {
      profile += ', and ' + descriptions[descriptions.length - 1];
    } else {
      profile += descriptions[0] || 'default traits';
    }
    profile += '.';

    // Add specific observations
    const observations = [];

    if (traits.professionalism >= 7 && traits.friendliness >= 7) {
      observations.push('Balances professionalism with approachability');
    }
    
    if (traits.humor >= 6 && traits.empathy >= 6) {
      observations.push('Uses humor empathetically to connect');
    }
    
    if (traits.assertiveness >= 7 && traits.empathy >= 7) {
      observations.push('Combines assertiveness with emotional intelligence');
    }
    
    if (traits.verbosity <= 3 && traits.formality >= 7) {
      observations.push('Formal but concise communication style');
    }

    if (observations.length > 0) {
      profile += ' ' + observations.join('. ') + '.';
    }

    return profile;
  }
}

// Export singleton instance
export const personalityEngine = new PersonalityEngine();

// Export for testing and direct usage
export default PersonalityEngine;