// Multi-Rep Harvey Whisper Configuration

// Rep configuration - map Twilio numbers to reps
// Configure these in environment variables or database
export const repConfig = {
  [process.env.TWILIO_REP1_NUMBER || '+18454090692']: {
    name: process.env.REP1_NAME || 'Jason',
    forwardTo: process.env.REP1_FORWARD_TO || '+12015231306',
    harveyStyle: process.env.REP1_HARVEY_STYLE || 'quick',
    personalMessage: process.env.REP1_MESSAGE || 'Jason. Sales mode on. Let\'s go!'
  },
  [process.env.TWILIO_REP2_NUMBER || '+18454090693']: {
    name: process.env.REP2_NAME || 'Sarah',
    forwardTo: process.env.REP2_FORWARD_TO || '+12125551234',
    harveyStyle: process.env.REP2_HARVEY_STYLE || 'motivational',
    personalMessage: process.env.REP2_MESSAGE || 'Sarah, you\'re a rockstar. Show them why!'
  },
  [process.env.TWILIO_REP3_NUMBER || '+18454090694']: {
    name: process.env.REP3_NAME || 'Mike',
    forwardTo: process.env.REP3_FORWARD_TO || '+13475551234',
    harveyStyle: process.env.REP3_HARVEY_STYLE || 'aggressive',
    personalMessage: process.env.REP3_MESSAGE || 'Mike! Time to dominate. Close this deal NOW!'
  },
  // Add more reps as needed
};

// Updated webhook handler for multiple reps
export function getRepConfig(twilioNumber) {
  return repConfig[twilioNumber] || {
    name: 'Rep',
    forwardTo: process.env.FORWARD_TO_PHONE,
    harveyStyle: 'default',
    personalMessage: null
  };
}

// Environment-based configuration
export const harveyMultiRepConfig = {
  // Option 1: Each rep has their own Twilio number
  multiNumberMode: true,
  
  // Option 2: Use Supabase to look up rep by various criteria
  useDatabase: true,
  
  // Option 3: Round-robin assignment
  roundRobinEnabled: false,
  
  // Custom greetings per rep
  customGreetings: {
    'Jason': 'Thank you for calling RepConnect. Connecting you to our top closer.',
    'Sarah': 'Welcome to RepConnect. Our solution specialist will be right with you.',
    'Mike': 'RepConnect sales team. Preparing your expert connection.'
  }
};

// Database lookup function (if using Supabase)
export async function getRepByCustomer(customerPhone, supabase) {
  // Look up which rep owns this customer
  const { data } = await supabase
    .from('contacts')
    .select('assigned_rep')
    .eq('phone', customerPhone)
    .single();
    
  if (data?.assigned_rep) {
    // Get rep details
    const { data: rep } = await supabase
      .from('users')
      .select('name, phone, harvey_config')
      .eq('id', data.assigned_rep)
      .single();
      
    return rep;
  }
  
  // No assignment - use round robin or default
  return null;
}

// Webhook modifications needed
export const webhookUpdate = `
// In your twilioWebhookRoutes.js, update the incoming call handler:

const { To, From } = req.body; // To = which Twilio number was called

// Get rep configuration
const repConfig = getRepConfig(To);

// Use rep-specific forward number
const forwardTo = repConfig.forwardTo;

// Use rep-specific Harvey message
const harveyMessage = repConfig.personalMessage || 
  getHarveyPreCallMessage({
    repName: repConfig.name,
    messageType: repConfig.harveyStyle
  });
`;

// Twilio setup instructions
export const twilioSetup = `
1. Buy additional numbers in Twilio Console
2. For each number, set webhook to:
   https://osbackend-zl1h.onrender.com/api/twilio/incoming-call
3. Update repConfig with each number and rep details
4. Deploy backend with updated configuration
`;

// Cost breakdown
export const costAnalysis = `
Per Rep Costs:
- Twilio Phone Number: $1/month
- Incoming calls: ~$0.0085/minute
- Outbound leg: ~$0.013/minute
- Recording: ~$0.0025/minute
- Total per minute: ~$0.024

For 10 reps with 100 calls/day @ 5 min average:
- Numbers: $10/month
- Call costs: ~$360/month
- Total: ~$370/month
`;