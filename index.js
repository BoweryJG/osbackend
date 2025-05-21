import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Supabase client setup with connection retry
let supabase;
let supabaseConnected = false;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

async function connectToSupabase(retryCount = 0) {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      console.log(`Connecting to Supabase at: ${process.env.SUPABASE_URL} (Attempt ${retryCount + 1})`);
      
      // Create a new Supabase client
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      
      // Test the connection by making a simple query
      const { data, error } = await supabase.from('user_subscriptions').select('*').limit(1);
      
      if (error) {
        throw error;
      }
      
      console.log('Successfully connected to Supabase!');
      supabaseConnected = true;
      return true;
    } else {
      console.warn('Supabase credentials not found. Supabase features will be disabled.');
      return false;
    }
  } catch (err) {
    console.error(`Error connecting to Supabase (Attempt ${retryCount + 1}):`, err);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying connection in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectToSupabase(retryCount + 1);
    } else {
      console.error(`Failed to connect to Supabase after ${MAX_RETRIES} attempts.`);
      return false;
    }
  }
}

// Call connectToSupabase immediately and then set up periodic reconnection attempts if it fails
connectToSupabase().then(connected => {
  if (!connected) {
    // Try to reconnect every 30 seconds
    setInterval(() => {
      if (!supabaseConnected) {
        console.log('Attempting to reconnect to Supabase...');
        connectToSupabase();
      }
    }, 30000);
  }
});

// Call LLM endpoint using OpenRouter
async function callLLM(prompt, llm_model) {
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

// Log activity to Supabase
async function logActivity(task, result) {
  if (!supabase) {
    console.warn('Supabase not configured. Activity logging skipped.');
    return null;
  }
  
  try {
    const { data, error } = await supabase.from('activity_log').insert([{ task, result }]);
    if (error) {
      console.error('Error logging activity to Supabase:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exception logging activity to Supabase:', err);
    return null;
  }
}

// Helper function to check if a model is free based on its ID
function isFreeModel(modelId) {
  if (!modelId) return true;
  
  // List of free models or patterns that identify free models
  const freeModels = [
    'google/gemini-pro',
    'google/gemini-1.5-pro',
    'google/gemini-2.0-flash',  // Using Gemini 2.0 Flash which is free
    'anthropic/claude-instant',
    'mistralai/mistral',
    'meta-llama/llama-2'
  ];
  
  // Only consider all models as free if explicitly in development mode
  if (process.env.NODE_ENV === 'development' || process.env.LOCAL_DEV === 'true') {
    console.log('Local development mode: All models are considered free');
    return true;
  }
  
  // Check if the model ID contains any of the free model patterns
  return freeModels.some(freeModel => modelId.toLowerCase().includes(freeModel.toLowerCase()));
}

// Helper function to check if a model is ASM level
function isAsmModel(modelId) {
  if (!modelId) return false;
  
  // ASM level models - more accessible paid models
  const asmModels = [
    'microsoft/phi',
    'anthropic/claude-instant',
    'mistralai/mistral-medium',
    'google/gemini-1.5-flash'
  ];
  
  // Check if the model ID contains any of the ASM model patterns
  return asmModels.some(asmModel => modelId.toLowerCase().includes(asmModel.toLowerCase()));
}

// Helper function to check user's subscription level
async function getUserSubscription(email) {
  if (!email || !supabase) return 'free';
  
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('subscription_level')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      console.log(`No subscription found for ${email}, defaulting to free`);
      return 'free';
    }
    
    return data.subscription_level;
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return 'free';
  }
}

// Helper function to check if user has access to a specific module
async function hasModuleAccess(email, moduleName) {
  if (!email || !supabase) return false;

  try {
    // First get the user_id from user_subscriptions
    const { data: userData, error: userError } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      console.log(`No user found for ${email}, denying module access`);
      return false;
    }

    // Then check module access
    const { data, error } = await supabase
      .from('module_access')
      .select('has_access')
      .eq('user_id', userData.user_id)
      .eq('module', moduleName)
      .single();

    if (error || !data) {
      console.log(`No module access found for ${email}/${moduleName}, denying access`);
      return false;
    }

    return data.has_access;
  } catch (err) {
    console.error('Error checking module access:', err);
    return false;
  }
}

// Helper function to check if user can access a model
async function canAccessModel(email, modelId) {
  // Free models are accessible to everyone
  if (isFreeModel(modelId)) return true;
  
  // If no email, user can only access free models
  if (!email) return false;
  
  const subscriptionLevel = await getUserSubscription(email);
  
  switch (subscriptionLevel) {
    case 'rsm':
      return true; // RSM users get access to all models
    case 'asm':
      // ASM users get access to free models and ASM models
      return isFreeModel(modelId) || isAsmModel(modelId);
    case 'free':
    default:
      return isFreeModel(modelId);
  }
}


// API endpoint to fetch models from OpenRouter
app.get('/api/models', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OpenRouter API key not configured');
    return res.status(500).json({ message: 'OpenRouter API key not configured' });
  }

  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // Optional: Add HTTP-Referer and X-Title if OpenRouter requires/recommends for backend calls
        // 'HTTP-Referer': process.env.SITE_URL || 'https://repspheres.com',
        // 'X-Title': process.env.APP_NAME || 'RepSpheres Backend'
      }
    });

    if (response.data && response.data.data) {
      const formattedModels = response.data.data.map(model => ({
        id: model.id,
        name: model.name || model.id, // Fallback to id if name is not present
        description: model.description || 'No description available.',
        // Determine pricing status based on actual costs from OpenRouter
        // The frontend ModelPicker.jsx expects a 'pricing' field with 'paid' or 'free'
        pricing: (parseFloat(model.pricing?.prompt) > 0 || parseFloat(model.pricing?.completion) > 0) ? 'paid' : 'free',
        context_length: model.context_length,
        architecture: model.architecture?.modality, // e.g., 'text-to-text'
        // You can include more details if needed by the frontend in the future
        // e.g., model.provider, model.pricing (for detailed costs)
      }));
      res.json(formattedModels);
    } else {
      console.error('Unexpected response structure from OpenRouter:', response.data);
      res.status(500).json({ message: 'Failed to fetch models due to unexpected response structure' });
    }
  } catch (error) {
    console.error('Error fetching models from OpenRouter:', error.response ? error.response.data : error.message);
    res.status(error.response?.status || 500).json({ 
      message: 'Failed to fetch models from OpenRouter',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Module access check endpoint
app.get('/api/modules/access', async (req, res) => {
  try {
    const email = req.query.email;
    const module = req.query.module;
    
    if (!email || !module) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email and module parameters are required'
      });
    }
    
    const hasAccess = await hasModuleAccess(email, module);
    
    return res.json({
      success: true,
      hasAccess
    });
  } catch (err) {
    console.error('Error checking module access:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error checking module access'
    });
  }
});

// List all modules a user has access to
app.get('/api/modules/list', async (req, res) => {
  try {
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email parameter is required'
      });
    }
    
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    
    // First get the user_id from user_subscriptions
    const { data: userData, error: userError } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('email', email)
      .single();
    
    if (userError || !userData) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    // Then get all modules user has access to
    const { data, error } = await supabase
      .from('module_access')
      .select('module')
      .eq('user_id', userData.user_id)
      .eq('has_access', true);
    
    if (error) {
      throw error;
    }
    
    return res.json({
      success: true,
      modules: data.map(item => item.module)
    });
  } catch (err) {
    console.error('Error listing accessible modules:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error listing accessible modules'
    });
  }
});

// App data CRUD endpoints
// Create/update app data
app.post('/api/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const { userId, data } = req.body;
    
    if (!appName || !userId || !data) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name, user ID, and data are required'
      });
    }
    
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    
    // Check if record already exists
    const { data: existingData, error: selectError } = await supabase
      .from('app_data')
      .select('id')
      .eq('app_name', appName)
      .eq('user_id', userId)
      .maybeSingle();
    
    let result;
    
    if (existingData) {
      // Update existing record
      const { data: updateData, error: updateError } = await supabase
        .from('app_data')
        .update({ data })
        .eq('id', existingData.id)
        .select();
      
      if (updateError) throw updateError;
      result = updateData[0];
    } else {
      // Insert new record
      const { data: insertData, error: insertError } = await supabase
        .from('app_data')
        .insert([{ app_name: appName, user_id: userId, data }])
        .select();
      
      if (insertError) throw insertError;
      result = insertData[0];
    }
    
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error saving app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error saving app data'
    });
  }
});

// Get app data
app.get('/api/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const userId = req.query.userId;
    
    if (!appName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name and user ID are required'
      });
    }
    
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    
    const { data, error } = await supabase
      .from('app_data')
      .select('*')
      .eq('app_name', appName)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw error;
    
    return res.json({
      success: true,
      data: data || null
    });
  } catch (err) {
    console.error('Error fetching app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error fetching app data'
    });
  }
});

// Delete app data
app.delete('/api/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const userId = req.query.userId;
    
    if (!appName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name and user ID are required'
      });
    }
    
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    
    const { error } = await supabase
      .from('app_data')
      .delete()
      .eq('app_name', appName)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    return res.json({
      success: true,
      message: 'App data deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error deleting app data'
    });
  }
});

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
    const { prompt, llm_model, email } = req.body;
    
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
          model: llm_model || "dummy-model",
          prompt: prompt || "No prompt provided"
        }
      });
    }
    
    try {
      // Verify the user can access the requested model
      const hasAccess = await canAccessModel(email, llm_model);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Access to requested model is not allowed'
        });
      }

      // Call the LLM API
      const llmResult = await callLLM(prompt, llm_model);
      
      // Try to log activity, but don't fail the request if logging fails
      try {
        await logActivity({ prompt, llm_model }, llmResult);
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
      const llmResult = await callLLM(prompt, null);
      
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
