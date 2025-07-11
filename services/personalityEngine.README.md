# Personality Engine

A sophisticated NLP-based personality management system for AI agents that converts natural language commands into personality traits and applies them to agent behavior.

## Features

- **Natural Language Parsing**: Convert commands like "make agent more friendly" into numerical trait values using OpenAI
- **8 Personality Dimensions**: Professionalism, Friendliness, Assertiveness, Humor, Empathy, Verbosity, Formality, Creativity
- **Personality Templates**: Pre-configured personalities (Professional, Friendly, Sales, Technical, Casual)
- **Trait Validation**: Automatic detection of conflicting personality traits
- **Template Blending**: Combine multiple templates with custom weights
- **Database Integration**: Store and retrieve personality configurations
- **Prompt Enhancement**: Automatically modify agent prompts based on personality

## Installation

```bash
# Ensure required environment variables are set
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Usage

### Basic Usage

```javascript
import { personalityEngine } from './services/personalityEngine.js';

// Get a personality template
const salesPersonality = personalityEngine.getTemplate('sales');

// Apply personality to a prompt
const enhancedPrompt = personalityEngine.applyPersonalityToPrompt(
  salesPersonality,
  'You are a helpful assistant.'
);
```

### Natural Language Commands

```javascript
// Parse natural language to traits
const currentTraits = personalityEngine.getDefaultPersonality().traits;
const updatedTraits = await personalityEngine.parseNaturalLanguage(
  "Make the agent more friendly but professional",
  currentTraits
);
```

### Template Blending

```javascript
// Blend multiple templates
const blendedTraits = personalityEngine.blendTemplates(
  ['professional', 'friendly'],
  { professional: 0.7, friendly: 0.3 }
);
```

### Integration with AgentCore

```javascript
import PersonalityAwareAgent from './services/personalityEngine.integration.js';

const agent = new PersonalityAwareAgent();

// Create agent with personality
const salesAgent = await agent.createAgentWithPersonality({
  name: 'Sales Expert',
  system_prompt: 'You help with sales inquiries.'
}, 'sales');

// Update personality with natural language
await agent.updateAgentPersonalityNL(
  agentId,
  "Be more assertive but maintain empathy"
);
```

## Personality Dimensions

| Dimension | Range | Description |
|-----------|-------|-------------|
| Professionalism | 0-10 | Level of formal vs casual communication |
| Friendliness | 0-10 | Warmth and approachability |
| Assertiveness | 0-10 | Directness and confidence |
| Humor | 0-10 | Use of humor and playfulness |
| Empathy | 0-10 | Understanding and emotional sensitivity |
| Verbosity | 0-10 | Level of detail in responses |
| Formality | 0-10 | Adherence to formal language |
| Creativity | 0-10 | Innovation and creative expression |

## Personality Templates

### Professional
- High professionalism (9) and formality (8)
- Moderate friendliness (5) and assertiveness (7)
- Low humor (2)

### Friendly
- High friendliness (9) and empathy (8)
- Moderate professionalism (6)
- Good balance of humor (6)

### Sales
- High friendliness (8) and assertiveness (8)
- Good balance of professionalism (7) and empathy (7)
- Moderate humor (4)

### Technical
- High professionalism (8) and verbosity (8)
- Low humor (1) and moderate empathy (4)
- Focus on precision and detail

### Casual
- High friendliness (9) and humor (8)
- Low professionalism (3) and formality (2)
- High creativity (8)

## Conflict Detection

The system automatically detects potentially conflicting traits:

- **High professionalism + High humor**: May seem inconsistent
- **High formality + High friendliness**: Can create mixed signals
- **High assertiveness + Low empathy**: May appear aggressive

## API Reference

### personalityEngine.parseNaturalLanguage(command, currentTraits)
Converts natural language commands to trait values.

### personalityEngine.applyPersonalityToPrompt(traits, basePrompt)
Enhances a prompt with personality guidelines.

### personalityEngine.validateTraits(traits)
Returns warnings for conflicting or extreme traits.

### personalityEngine.getTemplate(templateName)
Retrieves a predefined personality template.

### personalityEngine.blendTemplates(templateNames, weights)
Creates a custom personality by blending templates.

### personalityEngine.describePersonality(traits)
Generates a human-readable personality description.

## Database Schema

Personality data is stored in the `canvas_ai_agents` table:

```sql
personality JSONB DEFAULT '{
  "traits": {},
  "template": "default",
  "warnings": [],
  "last_command": null,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}'::jsonb
```

## Testing

Run the test file to see examples:

```bash
node services/personalityEngine.test.js
```

## Natural Language Examples

- "Make more friendly" → Increases friendliness by 2-3 points
- "Be professional but approachable" → Sets professionalism to 7-8, friendliness to 6-7
- "Less verbose" → Decreases verbosity by 2-3 points
- "Add some humor" → Increases humor by 2-3 points
- "Act like a technical expert" → Applies technical template characteristics
- "Be warm but assertive" → Balances friendliness with assertiveness

## Best Practices

1. **Start with templates**: Use predefined templates as a baseline
2. **Validate changes**: Always check for trait conflicts
3. **Test incrementally**: Make small adjustments and test the results
4. **Consider context**: Different situations may require different personalities
5. **Monitor feedback**: Track user responses to personality changes

## Troubleshooting

- **OpenAI API errors**: Ensure OPENAI_API_KEY is set correctly
- **Database errors**: Verify Supabase credentials and table schema
- **Trait conflicts**: Review warnings and adjust conflicting values
- **Unexpected behavior**: Check if traits are within valid ranges (0-10)