import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import Stripe from 'stripe';
import {
  processAudioFile,
  getUserTranscriptions,
  getTranscriptionById,
  deleteTranscription
} from './transcription_service.js';
import { 
  validateTwilioSignature,
  generateVoiceResponse,
  generateSmsResponse,
  makeCall,
  sendSms,
  saveCallRecord,
  saveSmsRecord,
  saveRecordingRecord,
  processRecording,
  getCallHistory,
  getSmsHistory
} from './twilio_service.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize Stripe if configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
}

// Create Express app
const app = express();

// Configure middleware
app.set('trust proxy', 1); // Trust first proxy - important for Render

// Stripe webhook needs raw body
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ success: false, message: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'invoice.paid': {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        if (supabase && email) {
          await supabase.from('user_subscriptions')
            .update({
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              subscription_status: 'active'
            })
            .eq('email', email);
        }
        break;
      }
      case 'invoice.payment_failed':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        if (supabase) {
          await supabase.from('user_subscriptions')
            .update({ subscription_status: 'past_due' })
            .or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${sub.customer}`);
        }
        break;
      }
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error processing Stripe webhook:', err);
    res.status(500).send('Webhook handler failed');
  }
});

// JSON body parser for all other routes
app.use(express.json()); // Parse JSON request bodies

// Ensure the upload directory exists for multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '50000000') },
  fileFilter: (req, file, cb) => {
    const allowed = (process.env.ALLOWED_FILE_TYPES ||
      'audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg').split(',');
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

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
      'https://workspace.repspheres.com', 
      'https://linguistics.repspheres.com', 
      'https://crm.repspheres.com', // Added SphereOsCrM frontend URL
      'http://localhost:5176',
      'https://localhost:5176'
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
      .select('subscription_level, subscription_status')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      console.log(`No subscription found for ${email}, defaulting to free`);
      return 'free';
    }
    
    if (data.subscription_status !== 'active') {
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
    // First get the user_id and subscription info
    const { data: userData, error: userError } = await supabase
      .from('user_subscriptions')
      .select('user_id, subscription_level, subscription_status')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      console.log(`No user found for ${email}, denying module access`);
      return false;
    }

    // If subscription is inactive, limit to default free modules
    if (userData.subscription_status !== 'active' && userData.subscription_level !== 'free') {
      const freeModules = ['workspace', 'blog'];
      return freeModules.includes(moduleName);
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

// Create a Stripe Checkout session
app.post('/api/checkout', async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ success: false, message: 'Stripe not configured' });
  }

  const email = req.body.email;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cancel`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating Stripe checkout session:', err);
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
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

// Transcription service routes
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const userId = req.header('x-user-id') || req.body.userId || req.query.userId;
  if (!userId || !req.file) {
    return res.status(400).json({
      success: false,
      message: 'User ID and audio file are required'
    });
  }

  try {
    const result = await processAudioFile(userId, req.file);
    if (result.success) {
      return res.json({
        success: true,
        message: 'Audio file processed successfully',
        transcription: result.transcription
      });
    }

    return res.status(500).json({
      success: false,
      error: result.error || 'Error processing audio file'
    });
  } catch (err) {
    console.error('Error processing audio file:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/transcriptions', async (req, res) => {
  const userId = req.header('x-user-id') || req.query.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const transcriptions = await getUserTranscriptions(userId);
    return res.json({ success: true, transcriptions });
  } catch (err) {
    console.error('Error getting user transcriptions:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/transcriptions/:id', async (req, res) => {
  const userId = req.header('x-user-id') || req.query.userId;
  const { id } = req.params;
  if (!userId || !id) {
    return res.status(400).json({ success: false, message: 'Transcription ID and user ID are required' });
  }

  try {
    const transcription = await getTranscriptionById(id, userId);
    return res.json({ success: true, transcription });
  } catch (err) {
    console.error('Error getting transcription:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/transcriptions/:id', async (req, res) => {
  const userId = req.header('x-user-id') || req.query.userId;
  const { id } = req.params;
  if (!userId || !id) {
    return res.status(400).json({ success: false, message: 'Transcription ID and user ID are required' });
  }

  try {
    await deleteTranscription(id, userId);
    return res.json({ success: true, message: 'Transcription deleted successfully' });
  } catch (err) {
    console.error('Error deleting transcription:', err);
    return res.status(500).json({ success: false, error: err.message });
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
    
    // Return a generic error response
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request.'
    });
  }
});

// Twilio webhook endpoints
app.post('/twilio/voice', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Validate the request is from Twilio
    if (!validateTwilioSignature(req, process.env.TWILIO_AUTH_TOKEN)) {
      return res.status(403).send('Forbidden');
    }

    // Save call record
    await saveCallRecord(req.body);

    // Generate TwiML response
    const twiml = generateVoiceResponse(req.body);
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('Error handling voice webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Validate the request is from Twilio
    if (!validateTwilioSignature(req, process.env.TWILIO_AUTH_TOKEN)) {
      return res.status(403).send('Forbidden');
    }

    // Save SMS record
    await saveSmsRecord(req.body);

    // Generate TwiML response
    const twiml = generateSmsResponse(req.body);
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('Error handling SMS webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/twilio/recording', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Validate the request is from Twilio
    if (!validateTwilioSignature(req, process.env.TWILIO_AUTH_TOKEN)) {
      return res.status(403).send('Forbidden');
    }

    // Save recording record
    await saveRecordingRecord(req.body);

    // Process the recording asynchronously
    processRecording(req.body).catch(err => {
      console.error('Error processing recording:', err);
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error handling recording webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Twilio API endpoints
app.post('/api/twilio/call', async (req, res) => {
  try {
    const { to, from, url } = req.body;
    const result = await makeCall(to, from, url);
    res.json({ success: true, callSid: result.sid });
  } catch (err) {
    console.error('Error making call:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/twilio/sms', async (req, res) => {
  try {
    const { to, from, body } = req.body;
    const result = await sendSms(to, from, body);
    res.json({ success: true, messageSid: result.sid });
  } catch (err) {
    console.error('Error sending SMS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/twilio/calls', async (req, res) => {
  try {
    const { userId, limit, offset } = req.query;
    const calls = await getCallHistory(userId, limit, offset);
    res.json({ success: true, calls });
  } catch (err) {
    console.error('Error getting call history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/twilio/messages', async (req, res) => {
  try {
    const { userId, limit, offset } = req.query;
    const messages = await getSmsHistory(userId, limit, offset);
    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error getting SMS history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Supabase configured: ${!!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY}`);
  console.log(`OpenRouter configured: ${!!process.env.OPENROUTER_API_KEY}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Twilio configured: ${!!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN}`);
});
