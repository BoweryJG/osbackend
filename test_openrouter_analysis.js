import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Test OpenRouter analysis functionality
 */
async function testOpenRouterAnalysis() {
  console.log('=== Testing OpenRouter Analysis ===');
  
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OpenRouter API key not found. Cannot test analysis.');
    return false;
  }
  
  try {
    console.log('Testing transcription analysis with OpenRouter...');
    
    // Sample transcription text
    const sampleTranscription = `
    Sales Rep: Hi there, thanks for calling RepSpheres. This is Alex. How can I help you today?
    
    Customer: Hi Alex, this is Jamie from TechCorp. I'm looking into your CRM solution for our sales team.
    
    Sales Rep: Great to meet you, Jamie! I'd be happy to tell you about our CRM. Can I ask what challenges you're currently facing with your sales process?
    
    Customer: Well, we're using a combination of spreadsheets and an older CRM system. It's becoming difficult to track customer interactions, and our sales forecasting is pretty much guesswork at this point.
    
    Sales Rep: I understand completely. Many of our clients came to us with similar challenges. How large is your sales team?
    
    Customer: We have about 25 sales reps across three regions. And we're planning to expand next quarter.
    
    Sales Rep: Perfect, our platform is designed to scale with your business. What features are most important to you in a new CRM?
    
    Customer: We definitely need better reporting and analytics. Also, integration with our marketing automation platform is crucial. And honestly, ease of use is a big factor - our team resisted adopting the last system because it was too complicated.
    
    Sales Rep: Those are all areas where we excel. Our dashboard gives you real-time analytics, we integrate with all major marketing platforms, and our interface is designed to be intuitive. Would you be interested in seeing a demo tailored to your specific needs?
    
    Customer: Yes, that would be helpful. But I'm also concerned about pricing. Our budget is somewhat limited this quarter.
    
    Sales Rep: I completely understand budget constraints. We have flexible pricing tiers, and I'm confident we can find a solution that fits your budget. Let's schedule that demo, and I can walk you through the pricing options as well.
    `;
    
    // Prompt for analysis
    const prompt = `
    Analyze the following conversation transcript:
    
    ${sampleTranscription}
    
    Please provide insights on:
    1. Key points discussed
    2. Customer pain points
    3. Objections raised
    4. Next steps
    5. Overall sentiment
    
    Format your response in markdown with clear headings for each section.
    `;
    
    // Use OpenRouter API for analysis
    console.log('Sending request to OpenRouter API...');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
        'X-Title': 'Transcription Analysis Test'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo',
        messages: [
          { role: "system", content: "You are an expert sales conversation analyzer." },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error from OpenRouter API:', errorData);
      return false;
    }
    
    const data = await response.json();
    
    console.log('\n✅ Successfully received analysis from OpenRouter!');
    console.log('\n=== Analysis Result ===\n');
    console.log(data.choices[0].message.content);
    
    return true;
  } catch (err) {
    console.error('❌ Error analyzing transcription:', err);
    return false;
  }
}

// Run the test
console.log('Starting OpenRouter analysis test...');
testOpenRouterAnalysis().then(success => {
  if (success) {
    console.log('\n✅ OpenRouter analysis test completed successfully!');
  } else {
    console.error('\n❌ OpenRouter analysis test failed.');
    process.exit(1);
  }
});
