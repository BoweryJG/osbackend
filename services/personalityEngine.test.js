import { personalityEngine } from './personalityEngine.js';

// Example usage of the PersonalityEngine

async function demonstratePersonalityEngine() {
  console.log('=== Personality Engine Demo ===\n');

  // 1. List available templates
  console.log('1. Available Personality Templates:');
  const templates = personalityEngine.listTemplates();
  templates.forEach(template => {
    console.log(`\n  ${template.key}: ${template.name}`);
    console.log('  Traits:', JSON.stringify(template.traits, null, 2).replace(/\n/g, '\n  '));
  });

  // 2. Get default personality
  console.log('\n2. Default Personality:');
  const defaultPersonality = personalityEngine.getDefaultPersonality();
  console.log(JSON.stringify(defaultPersonality, null, 2));

  // 3. Parse natural language commands (requires OpenAI API key)
  if (process.env.OPENAI_API_KEY) {
    console.log('\n3. Natural Language Parsing Examples:');
    
    try {
      // Example 1: Make more friendly
      console.log('\n  Command: "Make the agent more friendly and approachable"');
      const friendlyTraits = await personalityEngine.parseNaturalLanguage(
        "Make the agent more friendly and approachable",
        defaultPersonality.traits
      );
      console.log('  Result:', JSON.stringify(friendlyTraits, null, 2));

      // Example 2: Professional but warm
      console.log('\n  Command: "Be professional but warm, add a touch of humor"');
      const professionalWarmTraits = await personalityEngine.parseNaturalLanguage(
        "Be professional but warm, add a touch of humor",
        defaultPersonality.traits
      );
      console.log('  Result:', JSON.stringify(professionalWarmTraits, null, 2));

      // Example 3: Technical expert
      console.log('\n  Command: "Act like a technical expert, be precise and detailed"');
      const technicalTraits = await personalityEngine.parseNaturalLanguage(
        "Act like a technical expert, be precise and detailed",
        defaultPersonality.traits
      );
      console.log('  Result:', JSON.stringify(technicalTraits, null, 2));
    } catch (error) {
      console.log('  Error:', error.message);
    }
  } else {
    console.log('\n3. Natural Language Parsing: Skipped (OpenAI API key not configured)');
  }

  // 4. Apply personality to prompts
  console.log('\n4. Apply Personality to Prompts:');
  
  const basePrompt = 'You are a helpful AI assistant.';
  
  // Professional personality
  const professionalTraits = personalityEngine.getTemplate('professional');
  const professionalPrompt = personalityEngine.applyPersonalityToPrompt(professionalTraits, basePrompt);
  console.log('\n  Professional Personality Prompt:');
  console.log('  ---');
  console.log('  ' + professionalPrompt.replace(/\n/g, '\n  '));
  
  // Casual personality
  const casualTraits = personalityEngine.getTemplate('casual');
  const casualPrompt = personalityEngine.applyPersonalityToPrompt(casualTraits, basePrompt);
  console.log('\n  Casual Personality Prompt:');
  console.log('  ---');
  console.log('  ' + casualPrompt.replace(/\n/g, '\n  '));

  // 5. Validate traits for conflicts
  console.log('\n5. Trait Validation:');
  
  // Test conflicting traits
  const conflictingTraits = {
    professionalism: 9,
    humor: 8,
    formality: 9,
    friendliness: 9,
    assertiveness: 10,
    empathy: 1
  };
  
  console.log('\n  Testing traits:', JSON.stringify(conflictingTraits, null, 2));
  const warnings = personalityEngine.validateTraits(conflictingTraits);
  if (warnings.length > 0) {
    console.log('  Warnings:');
    warnings.forEach(warning => console.log(`    - ${warning}`));
  } else {
    console.log('  No conflicts detected.');
  }

  // 6. Blend templates
  console.log('\n6. Blending Templates:');
  
  const blendedTraits = personalityEngine.blendTemplates(
    ['professional', 'friendly'],
    { professional: 0.7, friendly: 0.3 }
  );
  console.log('\n  Blending 70% Professional + 30% Friendly:');
  console.log('  Result:', JSON.stringify(blendedTraits, null, 2));

  // 7. Describe personality
  console.log('\n7. Personality Descriptions:');
  
  const salesTraits = personalityEngine.getTemplate('sales');
  const salesDescription = personalityEngine.describePersonality(salesTraits);
  console.log('\n  Sales Personality Description:');
  console.log('  ' + salesDescription);
  
  const blendedDescription = personalityEngine.describePersonality(blendedTraits);
  console.log('\n  Blended Personality Description:');
  console.log('  ' + blendedDescription);

  // 8. Database operations (requires Supabase connection)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    console.log('\n8. Database Operations:');
    console.log('  (Would store/load personality configurations here)');
  } else {
    console.log('\n8. Database Operations: Skipped (Supabase not configured)');
  }

  console.log('\n=== Demo Complete ===');
}

// Run the demo
demonstratePersonalityEngine().catch(console.error);