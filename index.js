import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Create Express app
const app = express();

// Configure middleware
app.set('trust proxy', 1); // Trust first proxy - important for Render
app.use(express.json()); // Parse JSON request bodies

// Configure CORS
app.use(cors({
  origin: function(origin, callback) {
    // Allow any origin in development
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    
    // In production, check against allowed origins
    const allowedOrigins = [
      'https://repspheres.netlify.app',
      'https://repspheres.com',
      'http://localhost:5176',
      'https://*.netlify.app'
    ];
    
    // Check if origin matches any allowed pattern
    const isAllowed = !origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Task endpoint - the one that was returning 404
app.post('/task', async (req, res) => {
  try {
    // Log the incoming request for debugging
    console.log('Received request to /task endpoint:', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });

    // Extract data from request body
    const { model, prompt, llm_model, token } = req.body;
    
    // Return a dummy success response
    res.json({
      success: true,
      llmResult: {
        choices: [{
          message: {
            content: "This is a dummy response from the /task endpoint. Your request was received successfully."
          }
        }],
        model: model || llm_model || "dummy-model",
        prompt: prompt || "No prompt provided"
      }
    });
    
    // Log success
    console.log('Successfully processed /task request');
  } catch (err) {
    // Log the error
    console.error('Error processing /task request:', err);
    
    // Return a friendly error response
    res.status(500).json({
      success: false,
      error: err.message,
      response: "Sorry, there was an error processing your request. Please try again later."
    });
  }
});

// Catch-all route for undefined endpoints
app.use('*', (req, res) => {
  console.log(`Received request for undefined route: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `The requested endpoint ${req.originalUrl} does not exist.`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Server time: ${new Date().toISOString()}`);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Keep the process running despite the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Keep the process running despite the error
});
