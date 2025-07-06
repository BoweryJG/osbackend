// Harvey's Pre-Call Motivation Messages
// These play ONLY to the sales rep before connecting the customer

export const harveyPreCallMessages = {
  // Default Harvey - Aggressive closer
  default: [
    "Listen up! This is Harvey. Time to close this deal. Remember - you're not just selling, you're winning. When you hear the beep, own this call. Let's fucking go!",
    "Harvey here. This caller? They're already sold. They just don't know it yet. Make them realize it. Close hard, close fast. Show me what you've got!",
    "It's game time! This is Harvey. Forget everything except this: ABC - Always Be Closing. Now get in there and make me proud!",
    "Harvey speaking. You've got 3 seconds to get your mind right. This call is yours to win or lose. Choose win. Now GO!"
  ],
  
  // Morning motivation
  morning: [
    "Good morning superstar! Harvey here. First call of the day sets the tone. Make it count. Energy high, objections low. Let's start strong!",
    "Rise and grind! This is Harvey. Coffee's for closers, and you're about to earn a whole pot. Attack this call!"
  ],
  
  // Afternoon push
  afternoon: [
    "Afternoon slump? Not on my watch! Harvey here. This call is your second wind. Hit them with everything you've got!",
    "Harvey checking in. Post-lunch laziness is for losers. You're a closer. Prove it on this call!"
  ],
  
  // End of day
  evening: [
    "Last calls of the day! Harvey here. Finish strong. This could be the deal that makes your whole day. Don't let up now!",
    "Harvey speaking. The day's not over until you've closed one more. Make this one count!"
  ],
  
  // Based on caller info (if available)
  highValue: [
    "Harvey alert! Big fish on the line. This is a high-value prospect. Bring your A-game. Close this and you're a legend!",
    "Listen carefully - this is Harvey. VIP caller incoming. Time to show why you're the best. Make this sale legendary!"
  ],
  
  // Motivational variants
  motivational: [
    "You miss 100% of the shots you don't take. This is Harvey. Take the shot. Close the deal. Be unstoppable!",
    "Harvey here with truth: You're not selling a product, you're selling success. Make them feel it. Close it!"
  ],
  
  // Tough love
  toughLove: [
    "Harvey here. Your numbers are down. This call changes that. No excuses, no weakness. Just close!",
    "Wake up! This is Harvey. You want to be average or exceptional? This call decides. Choose wisely!"
  ],
  
  // Confidence boost
  confidence: [
    "Harvey believes in you. You've got the skills, the product, and the prospect. Now just execute. You've got this!",
    "This is Harvey. Remember - you're the expert here. They need what you're selling. Show them why!"
  ],
  
  // Friday special
  friday: [
    "TGIF? Wrong! Harvey says Thank God It's Closing Day! End the week with a bang. Close this deal!",
    "Harvey here. Make this Friday count. One more close before the weekend. Let's go!"
  ],
  
  // Monday motivation
  monday: [
    "Monday morning! Harvey speaking. Set the tone for the whole week. Start with a close. Make it happen!",
    "New week, new deals! This is Harvey. Show Monday who's boss. Close strong!"
  ]
};

// Function to get contextual message
export function getHarveyPreCallMessage(options = {}) {
  const { 
    timeOfDay, 
    dayOfWeek, 
    callerValue, 
    repPerformance,
    messageType = 'default' 
  } = options;
  
  const hour = new Date().getHours();
  const day = new Date().getDay();
  
  // Determine which message set to use
  let messageSet = harveyPreCallMessages.default;
  
  if (messageType && harveyPreCallMessages[messageType]) {
    messageSet = harveyPreCallMessages[messageType];
  } else if (day === 1) {
    messageSet = harveyPreCallMessages.monday;
  } else if (day === 5) {
    messageSet = harveyPreCallMessages.friday;
  } else if (hour < 12) {
    messageSet = harveyPreCallMessages.morning;
  } else if (hour < 17) {
    messageSet = harveyPreCallMessages.afternoon;
  } else {
    messageSet = harveyPreCallMessages.evening;
  }
  
  // Add high value if applicable
  if (callerValue === 'high') {
    messageSet = [...messageSet, ...harveyPreCallMessages.highValue];
  }
  
  // Add tough love if performance is low
  if (repPerformance === 'low') {
    messageSet = [...messageSet, ...harveyPreCallMessages.toughLove];
  }
  
  // Return random message from the set
  return messageSet[Math.floor(Math.random() * messageSet.length)];
}

export default {
  harveyPreCallMessages,
  getHarveyPreCallMessage
};