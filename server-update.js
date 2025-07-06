
// Add these lines to your main server.js or app.js file

// Import new routes
const callSummaryRoutes = require('./routes/callSummaryRoutes');
const twilioWebhookRoutes = require('./routes/twilioWebhookRoutes');

// Use routes (add these after other middleware)
app.use(callSummaryRoutes);
app.use(twilioWebhookRoutes);

// Required packages to install:
// npm install twilio node-fetch
