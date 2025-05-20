import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import modulesRouter from './routes/modules.js';
import dataRouter from './routes/data.js';
import { supabase, logActivity } from './services/supabase.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

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
    const allowedOrigins = [];
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    allowedOrigins.push(
      'https://repspheres.netlify.app',
      'https://repspheres.com',
      'http://localhost:5176',
      'https://localhost:5176',
      'https://*.netlify.app',
      '*' // Allow all origins temporarily during testing
    );
    
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

// Route modules
app.use('/api', modulesRouter);
app.use('/api', dataRouter);


// Call LLM endpoint using OpenRouter
async function callLLM(model, prompt, llm_model) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }
  
  // Use OpenRouter API for all LLM calls
  const modelToUse = llm_model || process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
  
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: modelToUse,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error calling OpenRouter API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}


// Task endpoint
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
    
    // Check if OpenRouter API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn('OpenRouter API key not configured. Returning dummy response.');
      return res.json({
        success: true,
        llmResult: {
          choices: [{
            message: {
              content: "OpenRouter API key not configured. Please set the OPENROUTER_API_KEY environment variable."
            }
          }],
          model: model || llm_model || "dummy-model",
          prompt: prompt || "No prompt provided"
        }
      });
    }
    
    try {
      // Call the LLM API
      const llmResult = await callLLM(model, prompt, llm_model);
      
      // Try to log activity, but don't fail the request if logging fails
      try {
        await logActivity({ model, prompt, llm_model }, llmResult);
      } catch (logErr) {
        console.error('Error logging activity:', logErr);
      }
      
      // Return the LLM result
      res.json({ success: true, llmResult });
    } catch (err) {
      console.error('Error calling LLM:', err);
      
      // Handle specific error codes
      if (err.response && err.response.status === 402) {
        // Payment Required error from OpenRouter
        return res.json({ 
          success: true, 
          llmResult: {
            choices: [{ 
              message: { 
                content: "I'm sorry, but there seems to be an issue with the API key or credits. The OpenRouter service returned a 'Payment Required' error. This is likely because the API key has expired or has insufficient credits. Please try again later or contact the administrator to update the API key." 
              } 
            }]
          }
        });
      }
      
      // For other errors, return a generic error response
      res.status(500).json({
        success: false,
        error: err.message,
        response: "Sorry, there was an error processing your request. Please try again later."
      });
    }
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

// Webhook endpoint for backward compatibility with existing frontends
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received request to /webhook endpoint:', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });

    // Extract the filename or fileUrl if it exists in the request body
    let fileUrl = '';
    if (req.body.data?.fileUrl) {
      fileUrl = req.body.data.fileUrl;
    } else if (req.body.fileUrl) {
      fileUrl = req.body.fileUrl;
    }

    // Default prompt
    let prompt = "Please analyze this conversation.";
    if (req.body.data?.prompt) {
      prompt = req.body.data.prompt;
    } else if (req.body.prompt) {
      prompt = req.body.prompt;
    }

    // Include the file URL in the prompt if it exists
    if (fileUrl) {
      prompt = `Please analyze this conversation from file: ${fileUrl}. ${prompt}`;
    }

    try {
      // Route to LLM processing
      const llmResult = await callLLM(null, prompt, null);
      
      // Return a modified response structure compatible with webhook expectations
      return res.json({
        message: "Processing started",
        user_id: "webhook-user",
        result: llmResult,
        usage: {
          current: 1,
          limit: 10
        }
      });
    } catch (err) {
      console.error('Error calling LLM from webhook:', err);
      
      return res.status(500).json({
        success: false,
        error: err.message,
        message: "Error processing webhook request"
      });
    }
  } catch (err) {
    console.error('Error processing webhook request:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      message: "Error processing webhook request"
    });
  }
});

// User usage endpoint for frontend compatibility
app.get('/user/usage', (req, res) => {
  // Return mock usage data as the real endpoint isn't implemented yet
  res.json({
    tier: 'free',
    usage: 0,
    quota: 10,
    reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
  });
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
