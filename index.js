import * as Sentry from '@sentry/node';
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
import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';
import Parser from 'rss-parser';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import AgentWebSocketServer from './agents/websocket/server.js';
import agentRoutes from './routes/agents/agentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import rateLimiterMiddleware from './middleware/rateLimiter.js';
import responseTimeMiddleware from './middleware/responseTime.js';
import {
  processAudioFile,
  processAudioFromUrl,
  getUserTranscriptions,
  getTranscriptionById,
  deleteTranscription
} from './transcription_service.js';
import { 
  validateTwilioSignature,
  generateVoiceResponse,
  generateSmsResponse,
  generateStreamingVoiceResponse,
  makeCall,
  sendSms,
  saveCallRecord,
  saveSmsRecord,
  saveRecordingRecord,
  processRecording,
  getCallHistory,
  getSmsHistory
} from './twilio_service.js';
import researchRoutes from './research-routes.js';
import zapierRoutes from './zapier_webhook.js';
import usageRoutes from './routes/usage.js';
import emailRoutes from './routes/email.js';
import phoneRoutes from './routes/phone.js';
import harveyRoutes from './routes/harvey.js';
import coachingSessionRoutes from './routes/coachingSessionRoutes.js';
import { authenticateUser, optionalAuth } from './auth.js';
import { WebSocketServer } from 'ws';
import CallTranscriptionService from './services/callTranscriptionService.js';
import callTranscriptionRoutes, { setCallTranscriptionService } from './routes/callTranscription.js';
import HarveyWebSocketService from './services/harveyWebSocketService.js';
import callSummaryRoutes from './routes/callSummaryRoutes.js';
import twilioWebhookRoutes from './routes/twilioWebhookRoutes.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize cache for API responses
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize Sentry
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration({ app: express() }),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

// Initialize Stripe if configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
}

// Pricing Structure
const pricingPlans = {
  free: {
    name: 'Free',
    price: 0,
    features: {
      users: 1,
      aiQueries: 10,
      categories: 2,
      automation: false,
      support: 'community',
      transcriptionMinutes: 30
    }
  },
  starter: {
    name: 'Starter',
    price: 99,
    features: {
      users: 1,
      aiQueries: 100,
      categories: 5,
      automation: false,
      support: 'email',
      transcriptionMinutes: 300
    }
  },
  professional: {
    name: 'Professional',
    price: 299,
    features: {
      users: 5,
      aiQueries: 1000,
      categories: 'unlimited',
      automation: true,
      support: 'priority',
      transcriptionMinutes: 1500
    }
  },
  enterprise: {
    name: 'Enterprise',
    price: 'custom',
    features: {
      users: 'unlimited',
      aiQueries: 'unlimited',
      categories: 'unlimited',
      automation: true,
      support: 'dedicated',
      transcriptionMinutes: 'unlimited'
    }
  }
};

// Usage-Based Add-ons
const usageProducts = {
  aiQuery: { price: 0.50 }, // Per query over limit
  automationRun: { price: 2.00 }, // Per automation execution
  premiumData: { price: 5.00 }, // Per premium report
  apiCall: { price: 0.10 }, // Per API call
  transcriptionMinute: { price: 0.25 } // Per minute over limit
};

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
app.use(cookieParser()); // Parse cookies
app.use(responseTimeMiddleware.responseTimeMiddleware); // Track response times

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
      'https://repconnect.repspheres.com', // RepConnect production domain
      'https://repconnect1.netlify.app', // RepConnect1 app
      'https://repspheres.netlify.app',
      'https://globalrepspheres.netlify.app', // Main app on Netlify
      'https://repspheres.com',
      'https://www.repspheres.com', // www version
      'https://workspace.repspheres.com', 
      'https://linguistics.repspheres.com', 
      'https://crm.repspheres.com', // Added SphereOsCrM frontend URL
      'https://canvas.repspheres.com', // Canvas sales intelligence
      'https://marketdata.repspheres.com', // Added MarketData frontend URL
      'https://auth.repspheres.com', // Auth subdomain if needed
      'http://localhost:5173', // Common Vite dev port
      'http://localhost:5174', // Alternative Vite port
      'http://localhost:5175', // Alternative Vite port
      'http://localhost:5176',
      'https://localhost:5173',
      'https://localhost:5174',
      'https://localhost:5175',
      'https://localhost:5176',
      'http://localhost:3000', // Common React dev port
      'http://localhost:3001'  // Alternative port
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
      
      try {
        // Create a new Supabase client
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        
        // Test the connection by making a simple query
        const { data, error } = await supabase.from('user_subscriptions').select('*').limit(1);
        
        if (error && !error.message.includes('does not exist')) {
          throw error;
        }
        
        console.log('Successfully connected to Supabase!');
        supabaseConnected = true;
        return true;
      } catch (err) {
        console.warn('Error connecting to Supabase:', err.message);
        console.warn('Continuing with Supabase features disabled.');
        return false;
      }
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

// Helper function to check user's subscription level and features
async function getUserSubscription(email) {
  if (!email || !supabase) return { plan: 'free', features: pricingPlans.free.features };
  
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('subscription_level, subscription_status, plan_id')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      console.log(`No subscription found for ${email}, defaulting to free`);
      return { plan: 'free', features: pricingPlans.free.features };
    }
    
    if (data.subscription_status !== 'active') {
      return { plan: 'free', features: pricingPlans.free.features };
    }

    const planId = data.plan_id || data.subscription_level || 'free';
    const plan = pricingPlans[planId] || pricingPlans.free;
    
    return { 
      plan: planId, 
      features: plan.features,
      status: data.subscription_status 
    };
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return { plan: 'free', features: pricingPlans.free.features };
  }
}

// Helper function to check if user can perform action based on subscription
async function checkUsageLimit(userId, action, amount = 1) {
  if (!supabase) return { allowed: true, remaining: 'unlimited' };
  
  try {
    // Get user subscription info
    const { data: userSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('plan_id, subscription_status, email')
      .eq('user_id', userId)
      .single();
    
    if (subError || !userSub) {
      console.log(`No subscription found for user ${userId}, using free plan`);
      return checkPlanLimits('free', action, amount, userId);
    }
    
    const planId = userSub.plan_id || 'free';
    return checkPlanLimits(planId, action, amount, userId);
  } catch (err) {
    console.error('Error checking usage limit:', err);
    return { allowed: false, error: 'Failed to check usage limits' };
  }
}

// Check plan limits for specific actions
async function checkPlanLimits(planId, action, amount, userId) {
  const plan = pricingPlans[planId] || pricingPlans.free;
  const limit = plan.features[action];
  
  if (limit === 'unlimited') {
    return { allowed: true, remaining: 'unlimited' };
  }
  
  // Get current usage for this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const { data: usage, error } = await supabase
    .from('usage_logs')
    .select('quantity')
    .eq('user_id', userId)
    .eq('product_type', action)
    .gte('timestamp', startOfMonth.toISOString())
    .order('timestamp', { ascending: false });
  
  if (error) {
    console.error('Error fetching usage:', error);
    return { allowed: false, error: 'Failed to fetch usage data' };
  }
  
  const currentUsage = usage.reduce((total, record) => total + record.quantity, 0);
  const remaining = limit - currentUsage;
  
  if (currentUsage + amount > limit) {
    return { 
      allowed: false, 
      remaining: remaining,
      overage: (currentUsage + amount) - limit,
      overagePrice: usageProducts[action]?.price || 0
    };
  }
  
  return { 
    allowed: true, 
    remaining: remaining - amount,
    currentUsage: currentUsage
  };
}

// Log usage for billing
async function logUsage(userId, productType, quantity = 1, metadata = {}) {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .insert([{
        user_id: userId,
        product_type: productType,
        quantity: quantity,
        metadata: metadata,
        timestamp: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error logging usage:', error);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('Error in logUsage:', err);
    return null;
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

// External recording upload endpoint (for PLAUD and other external sources)
app.post('/api/upload-external-recording', upload.single('file'), async (req, res) => {
  try {
    const userId = req.header('x-user-id') || req.body.userId;
    const { 
      contactId, 
      contactName, 
      practiceId, 
      source,
      externalId,
      transcriptionProvider = 'openai',
      analysisProvider = 'gemini'
    } = req.body;

    if (!userId || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'User ID and audio file are required'
      });
    }

    // Import the AI processing function
    const { processAudioWithAI } = await import('./ai_service.js');

    // Process the audio file
    const result = await processAudioWithAI(req.file.buffer, {
      transcriptionProvider,
      analysisProvider,
      contactName,
      userId,
      metadata: {
        source: source || 'manual',
        external_id: externalId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        contactId,
        practiceId
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Processing failed');
    }

    // Return the result
    res.json({
      success: true,
      data: {
        recordingId: result.recordingId,
        analysis: result.analysis?.analysis || {},
        transcription: result.transcription,
        metadata: result.metadata
      }
    });

  } catch (error) {
    console.error('External recording upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process recording'
    });
  }
});

// Webhook endpoint for audio processing (requires authentication)
app.post('/webhook', async (req, res) => {
  try {
    // Get user ID from headers, body, or query
    const userId = req.header('x-user-id') || req.body.userId || req.query.userId;
    const { filename } = req.body;
    
    console.log('Webhook received:', { 
      userId, 
      filename, 
      headers: req.headers, 
      body: req.body,
      query: req.query 
    });
    
    // Check if user is authenticated
    if (!userId) {
      console.log('No userId found in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in to use this service.',
        error: 'UNAUTHENTICATED'
      });
    }

    // Validate that userId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format. Please provide a valid UUID.',
        error: 'INVALID_USER_ID'
      });
    }
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required'
      });
    }

    console.log('Processing audio from webhook:', { userId, filename });

    // Check if user can transcribe (usage limits)
    const usageCheck = await checkUsageLimit(userId, 'aiQueries', 1);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Monthly transcription limit exceeded',
        error: 'QUOTA_EXCEEDED',
        remaining: usageCheck.remaining,
        overage: usageCheck.overage,
        overagePrice: usageCheck.overagePrice
      });
    }

    // Process the audio file from URL
    const result = await processAudioFromUrl(userId, filename, filename);
    
    if (result.success) {
      // Log usage for billing
      await logUsage(userId, 'aiQueries', 1, {
        filename: filename,
        transcriptionId: result.transcription.id,
        duration: result.transcription.duration_seconds
      });

      // Also log transcription minutes if we have duration
      if (result.transcription.duration_seconds) {
        const minutes = Math.ceil(result.transcription.duration_seconds / 60);
        await logUsage(userId, 'transcriptionMinutes', minutes, {
          transcriptionId: result.transcription.id,
          filename: filename
        });
      }

      return res.json({
        success: true,
        message: 'Audio file processed successfully',
        transcription: result.transcription,
        usage: {
          remaining: usageCheck.remaining - 1,
          currentUsage: usageCheck.currentUsage + 1
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: result.error || 'Error processing audio file'
    });
  } catch (err) {
    console.error('Error in webhook endpoint:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Pricing and subscription endpoints
app.get('/api/pricing', (req, res) => {
  res.json({
    success: true,
    plans: pricingPlans,
    usage: usageProducts
  });
});

app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get subscription info
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    const planId = subscription?.plan_id || 'free';
    const plan = pricingPlans[planId];

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usage, error: usageError } = await supabase
      .from('usage_logs')
      .select('product_type, quantity')
      .eq('user_id', userId)
      .gte('timestamp', startOfMonth.toISOString());

    if (usageError) {
      console.error('Error fetching usage:', usageError);
    }

    // Calculate usage by type
    const usageSummary = {};
    if (usage) {
      usage.forEach(record => {
        if (!usageSummary[record.product_type]) {
          usageSummary[record.product_type] = 0;
        }
        usageSummary[record.product_type] += record.quantity;
      });
    }

    res.json({
      success: true,
      subscription: subscription || { plan_id: 'free', status: 'free' },
      plan: plan,
      usage: usageSummary,
      limits: plan.features
    });
  } catch (err) {
    console.error('Error fetching subscription:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { planId, userId, email } = req.body;

    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: 'Stripe not configured'
      });
    }

    const plan = pricingPlans[planId];
    if (!plan || planId === 'free') {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env[`STRIPE_${planId.toUpperCase()}_PRICE_ID`],
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      customer_email: email,
      metadata: {
        userId: userId,
        planId: planId
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Authenticated subscription status endpoint
app.get('/api/subscription-status', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = req.userEmail;

    // Get subscription info
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    const planId = subscription?.plan_id || 'free';
    const status = subscription?.subscription_status || 'active';
    
    res.json({
      tier: planId,
      status: status,
      isDemo: false,
      user_id: userId,
      email: userEmail,
      features: pricingPlans[planId]?.features || pricingPlans.free.features
    });
  } catch (err) {
    console.error('Error fetching subscription status:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Authenticated usage endpoint
app.get('/api/usage', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usage, error } = await supabase
      .from('usage_logs')
      .select('product_type, quantity')
      .eq('user_id', userId)
      .gte('timestamp', startOfMonth.toISOString());

    if (error) {
      console.error('Error fetching usage:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Aggregate usage by type
    const usageMap = {};
    for (const log of usage || []) {
      usageMap[log.product_type] = (usageMap[log.product_type] || 0) + log.quantity;
    }

    // Return usage in expected format
    res.json({
      canvas_briefs: usageMap.canvas_briefs || 0,
      ai_prompts: usageMap.aiQueries || 0,
      call_analyses: usageMap.call_analyses || 0,
      market_procedures: usageMap.market_procedures || 0,
      contacts: usageMap.contacts || 0,
      ripples: usageMap.ripples || 0
    });
  } catch (err) {
    console.error('Error fetching usage:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Authenticated usage increment endpoint
app.post('/api/usage/increment', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { feature } = req.body;

    if (!feature) {
      return res.status(400).json({
        success: false,
        error: 'Feature parameter is required'
      });
    }

    // Map frontend feature names to backend product types
    const featureMap = {
      canvas_briefs: 'canvas_briefs',
      ai_prompts: 'aiQueries',
      call_analyses: 'call_analyses',
      market_procedures: 'market_procedures',
      contacts: 'contacts',
      ripples: 'ripples'
    };

    const productType = featureMap[feature] || feature;

    // Check usage limits
    const usageCheck = await checkUsageLimit(userId, productType, 1);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Usage limit exceeded',
        error: 'QUOTA_EXCEEDED',
        remaining: usageCheck.remaining
      });
    }

    // Log usage
    await logUsage(userId, productType, 1, {
      feature: feature,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Usage incremented successfully'
    });
  } catch (err) {
    console.error('Error incrementing usage:', err);
    res.status(500).json({
      success: false,
      error: err.message
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
    // Validate the request is from Twilio (skip in development)
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      if (!validateTwilioSignature(signature, url, req.body)) {
        return res.status(403).send('Forbidden');
      }
    }

    // Save call record
    const callData = {
      call_sid: req.body.CallSid,
      phone_number_sid: req.body.To,
      from_number: req.body.From,
      to_number: req.body.To,
      direction: req.body.Direction,
      status: req.body.CallStatus,
      metadata: {
        hasStream: true
      }
    };
    await saveCallRecord(callData);

    // Generate TwiML response with recording and Media Stream
    const message = "Hello! Thank you for calling. Your call is being transcribed in real-time.";
    
    // Get the WebSocket URL for Media Streams
    const wsUrl = process.env.NODE_ENV === 'production' 
      ? `wss://${req.get('host')}/api/media-stream`
      : `wss://localhost:${process.env.PORT || 3000}/api/media-stream`;
    
    const twiml = generateVoiceResponse(message, { 
      record: true,
      stream: true,
      streamUrl: wsUrl,
      streamName: `call-${req.body.CallSid}`,
      streamParameters: {
        callSid: req.body.CallSid,
        from: req.body.From,
        to: req.body.To
      }
    });
    
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('Error handling voice webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Validate the request is from Twilio (skip in development)
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      if (!validateTwilioSignature(signature, url, req.body)) {
        return res.status(403).send('Forbidden');
      }
    }

    // Save SMS record
    const smsData = {
      message_sid: req.body.MessageSid,
      from_number: req.body.From,
      to_number: req.body.To,
      body: req.body.Body,
      direction: 'inbound',
      status: req.body.SmsStatus || 'received',
      num_segments: req.body.NumSegments || 1,
      metadata: {}
    };
    await saveSmsRecord(smsData);

    // Generate TwiML response
    const responseMessage = "Thank you for your message. We'll get back to you soon!";
    const twiml = generateSmsResponse(responseMessage);
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

// New endpoint for Twilio stream status callbacks
app.post('/api/twilio/stream-status', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Validate the request is from Twilio (skip in development)
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      if (!validateTwilioSignature(signature, url, req.body)) {
        return res.status(403).send('Forbidden');
      }
    }

    const {
      StreamSid,
      CallSid,
      StreamStatus,
      StreamTrack,
      StreamName,
      StreamEvent
    } = req.body;

    console.log('Stream status update:', {
      streamSid: StreamSid,
      callSid: CallSid,
      status: StreamStatus,
      track: StreamTrack,
      name: StreamName,
      event: StreamEvent
    });

    // Update call record with stream information
    if (CallSid) {
      await saveCallRecord({
        call_sid: CallSid,
        metadata: {
          streamSid: StreamSid,
          streamStatus: StreamStatus,
          streamEvent: StreamEvent,
          lastStreamUpdate: new Date().toISOString()
        }
      });
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error handling stream status webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Twilio API endpoints
app.post('/api/twilio/make-call', async (req, res) => {
  try {
    const { 
      to, 
      message, 
      record, 
      userId, 
      metadata,
      enableStream,
      streamUrl,
      streamName,
      streamParameters
    } = req.body;
    
    // Build options including Media Stream configuration
    const options = { 
      record, 
      metadata,
      enableStream: enableStream || false,
      streamUrl: streamUrl || `wss://${req.get('host')}/api/media-stream`,
      streamName: streamName,
      streamParameters: streamParameters || {}
    };
    
    const result = await makeCall(to, message, options);
    res.json({ success: true, call: result });
  } catch (err) {
    console.error('Error making call:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/twilio/send-sms', async (req, res) => {
  try {
    const { to, body, userId, metadata } = req.body;
    const options = { metadata };
    const result = await sendSms(to, body, options);
    res.json({ success: true, message: result });
  } catch (err) {
    console.error('Error sending SMS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/twilio/calls', async (req, res) => {
  try {
    const { phoneNumber, limit } = req.query;
    const options = { limit: limit ? parseInt(limit) : undefined };
    const calls = await getCallHistory(phoneNumber, options);
    res.json({ success: true, calls });
  } catch (err) {
    console.error('Error getting call history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/twilio/sms', async (req, res) => {
  try {
    const { phoneNumber, limit } = req.query;
    const options = { limit: limit ? parseInt(limit) : undefined };
    const messages = await getSmsHistory(phoneNumber, options);
    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error getting SMS history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Brave Search API endpoints
// Endpoint to proxy Brave web search
app.get('/api/search/brave', async (req, res) => {
  try {
    const { query, q, limit = 10 } = req.query;
    const searchQuery = query || q || '';

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cacheKey = `brave-search-${searchQuery}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    if (!process.env.BRAVE_API_KEY) {
      return res.status(500).json({ error: 'Brave Search API key not configured' });
    }

    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: searchQuery, count: limit },
      headers: { 
        'X-Subscription-Token': process.env.BRAVE_API_KEY,
        'Accept': 'application/json'
      }
    });

    cache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Brave search results:', error);
    if (error.response) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Error status:', error.response.status);
    }
    res.status(500).json({ 
      error: 'Failed to fetch Brave search results',
      details: error.response?.data || error.message 
    });
  }
});

// Endpoint to fetch news from Brave Search
app.get('/api/news/brave', async (req, res) => {
  try {
    const { query, limit = 5 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cacheKey = `brave-news-${query}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    if (!process.env.BRAVE_API_KEY) {
      return res.status(500).json({ error: 'Brave Search API key not configured' });
    }

    // Use the web search endpoint and filter for news results
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { 
        q: `${query} news`, 
        count: limit,
        search_lang: 'en'
      },
      headers: { 
        'X-Subscription-Token': process.env.BRAVE_API_KEY,
        'Accept': 'application/json'
      }
    });

    // Format the response to look like a news API response
    const formattedResponse = {
      query: response.data.query,
      news: {
        results: response.data.web.results
          .filter(result => 
            result.subtype === 'news' || 
            result.url.includes('/news/') || 
            result.title.toLowerCase().includes('news')
          )
          .map(result => ({
            title: result.title,
            url: result.url,
            description: result.description,
            source: result.profile?.name || 'Unknown Source',
            published_date: result.age || 'Unknown Date',
            thumbnail: result.thumbnail?.src
          }))
      }
    };

    cache.set(cacheKey, formattedResponse);
    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching Brave news:', error);
    res.status(500).json({ error: 'Failed to fetch Brave news' });
  }
});

// In-memory storage for polls
const polls = [];

// Create a new poll
app.post('/api/polls', (req, res) => {
  try {
    const { question, options } = req.body;
    
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Question and at least 2 options are required'
      });
    }
    
    const pollId = Date.now().toString();
    const newPoll = {
      id: pollId,
      question,
      options: options.map(option => ({
        id: Math.random().toString(36).substring(2, 15),
        text: option,
        votes: 0
      })),
      created_at: new Date().toISOString(),
      total_votes: 0
    };
    
    polls.push(newPoll);
    
    return res.status(201).json({
      success: true,
      poll: newPoll
    });
  } catch (err) {
    console.error('Error creating poll:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error creating poll'
    });
  }
});

// Get all polls
app.get('/api/polls', (req, res) => {
  return res.json({
    success: true,
    polls
  });
});

// Get a specific poll
app.get('/api/polls/:id', (req, res) => {
  const { id } = req.params;
  const poll = polls.find(p => p.id === id);
  
  if (!poll) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Poll not found'
    });
  }
  
  return res.json({
    success: true,
    poll
  });
});

// Vote on a poll
app.post('/api/polls/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const { optionId } = req.body;
    
    if (!optionId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Option ID is required'
      });
    }
    
    const pollIndex = polls.findIndex(p => p.id === id);
    
    if (pollIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Poll not found'
      });
    }
    
    const poll = polls[pollIndex];
    const optionIndex = poll.options.findIndex(o => o.id === optionId);
    
    if (optionIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Option not found'
      });
    }
    
    // Increment vote count
    poll.options[optionIndex].votes++;
    poll.total_votes++;
    
    return res.json({
      success: true,
      poll
    });
  } catch (err) {
    console.error('Error voting on poll:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error voting on poll'
    });
  }
});

// Initialize RSS parser
const rssParser = new Parser({
  timeout: 10000,
  requestOptions: {
    rejectUnauthorized: false
  }
});

// Podcast feed endpoints
// RSS Feed Parser endpoint
app.post('/api/feeds/rss', async (req, res) => {
  try {
    const { feedUrl, feedName, category, maxEpisodes = 3 } = req.body;
    
    if (!feedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Feed URL is required'
      });
    }

    const cacheKey = `rss-feed-${Buffer.from(feedUrl).toString('base64')}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Parse RSS feed with error handling
    let feed;
    try {
      feed = await rssParser.parseURL(feedUrl);
    } catch (parseError) {
      console.warn(`Failed to parse RSS feed ${feedUrl}:`, parseError.message);
      // Return empty array for invalid feeds instead of throwing error
      return res.json([]);
    }
    
    // Process episodes
    const episodes = feed.items.slice(0, maxEpisodes).map((item, index) => {
      // Check if episode is live (published within 24 hours)
      const pubDate = new Date(item.pubDate || item.isoDate);
      const now = new Date();
      const isLive = !isNaN(pubDate.getTime()) && (now - pubDate) < 24 * 60 * 60 * 1000;
      
      // Extract audio URL from enclosure
      let audioUrl = null;
      if (item.enclosure && item.enclosure.url) {
        audioUrl = item.enclosure.url;
      } else if (item.link) {
        audioUrl = item.link;
      }
      
      // Extract duration if available
      let duration = null;
      if (item.itunes && item.itunes.duration) {
        // Convert duration to seconds
        const durationStr = item.itunes.duration;
        const parts = durationStr.split(':');
        if (parts.length === 3) {
          duration = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        } else if (parts.length === 2) {
          duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }

      return {
        id: `${feedName}-${index}-${Date.now()}`,
        title: item.title || 'Untitled Episode',
        author: item.creator || feed.title || feedName,
        description: item.contentSnippet || item.content || item.summary || 'No description available',
        pubDate: item.pubDate || item.isoDate,
        audioUrl: audioUrl,
        duration: duration,
        image: item.itunes?.image || feed.image?.url || `https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300`,
        isLive: isLive
      };
    });

    const result = episodes;
    
    // Cache for 30 minutes
    cache.set(cacheKey, result, 1800);
    
    res.json(result);
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse RSS feed',
      details: error.message
    });
  }
});

// Apple Podcasts search endpoint
app.post('/api/feeds/apple', async (req, res) => {
  try {
    const { searchTerm, limit = 15 } = req.body;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    const cacheKey = `apple-podcasts-${Buffer.from(searchTerm).toString('base64')}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Use iTunes Search API
    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: searchTerm,
        entity: 'podcast',
        limit: limit,
        media: 'podcast'
      },
      timeout: 10000
    });

    const podcasts = response.data.results.map(podcast => ({
      id: podcast.trackId || podcast.collectionId,
      title: podcast.trackName || podcast.collectionName,
      author: podcast.artistName,
      description: podcast.description || 'No description available',
      image: podcast.artworkUrl600 || podcast.artworkUrl100,
      sourceUrl: podcast.trackViewUrl || podcast.collectionViewUrl,
      genre: podcast.primaryGenreName,
      episodeCount: podcast.trackCount,
      rating: podcast.averageUserRating,
      releaseDate: podcast.releaseDate
    }));

    // Cache for 1 hour
    cache.set(cacheKey, podcasts, 3600);
    
    res.json(podcasts);
  } catch (error) {
    console.error('Error searching Apple Podcasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search Apple Podcasts',
      details: error.message
    });
  }
});

// Trending podcasts endpoint
app.post('/api/feeds/trending', async (req, res) => {
  try {
    const { categories = ['medical', 'dental', 'healthcare', 'ai'], limit = 10 } = req.body;

    const cacheKey = `trending-podcasts-${categories.join('-')}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Mock trending data for now - can be replaced with real trending API
    const trendingPodcasts = [
      {
        id: 'trending-1',
        title: 'The Future of Telemedicine Post-COVID',
        author: 'Healthcare Horizons',
        description: 'Expert panel discusses permanent changes in healthcare delivery and what it means for patient care',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=300',
        audioUrl: 'https://example.com/trending1.mp3',
        downloads: 15420,
        pubDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-2',
        title: 'Robotics in Surgery: Year in Review',
        author: 'MedTech Weekly',
        description: 'Breakthrough robotic procedures that saved lives in 2024',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=300',
        audioUrl: 'https://example.com/trending2.mp3',
        downloads: 12350,
        pubDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-3',
        title: 'AI Diagnosis: Success Stories from the ER',
        author: 'Emergency Medicine Today',
        description: 'Real cases where AI-assisted diagnosis made the difference',
        image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=300',
        audioUrl: 'https://example.com/trending3.mp3',
        downloads: 11200,
        pubDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-4',
        title: 'Dental Implants and 3D Printing Revolution',
        author: 'Digital Dentistry Podcast',
        description: 'How 3D printing is changing everything about dental implants',
        image: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=300',
        audioUrl: 'https://example.com/trending4.mp3',
        downloads: 9800,
        pubDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-5',
        title: 'Mental Health Apps That Actually Work',
        author: 'Digital Health Review',
        description: 'Evidence-based mental health applications making real impact',
        image: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=300',
        audioUrl: 'https://example.com/trending5.mp3',
        downloads: 8900,
        pubDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    const result = trendingPodcasts.slice(0, limit);
    
    // Cache for 2 hours
    cache.set(cacheKey, result, 7200);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching trending podcasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending podcasts',
      details: error.message
    });
  }
});

// Add Canvas research routes
app.use('/api', researchRoutes);

// Add usage tracking routes
app.use('/api/usage', usageRoutes);

// Add email routes
app.use('/api/emails', emailRoutes);

// Add phone system routes
app.use('/api/phone', phoneRoutes);

// Add Harvey AI routes
app.use('/api/harvey', harveyRoutes);

// Add Coaching Session routes
app.use('/api/coaching', coachingSessionRoutes);

// Add Zapier webhook routes
app.use('/', zapierRoutes);

// Add Canvas Agent routes
app.use('/api/canvas', agentRoutes);

// Add Call Transcription routes
app.use('/api', callTranscriptionRoutes);

// Add Call Summary routes (from Netlify migration)
app.use(callSummaryRoutes);
app.use(twilioWebhookRoutes);

// Add Auth routes
app.use('/api/auth', authRoutes);

// Add Health monitoring routes
app.use('/', healthRoutes);

// Apply rate limiting to API routes
app.use('/api/', rateLimiterMiddleware.apiRateLimiter);

// Create HTTP server for both Express and WebSocket
const httpServer = createServer(app);

// Initialize WebSocket server for agents
const agentWSServer = new AgentWebSocketServer(httpServer);

// Initialize Call Transcription Service
const callTranscriptionService = new CallTranscriptionService(agentWSServer.io);
setCallTranscriptionService(callTranscriptionService);

// Initialize Harvey WebSocket Service
const harveyWSService = new HarveyWebSocketService();
harveyWSService.initialize(httpServer);

// Set up WebSocket server for Twilio Media Streams
const wsServer = new WebSocketServer({ 
  server: httpServer,
  path: '/api/media-stream'
});

wsServer.on('connection', (ws, request) => {
  callTranscriptionService.handleTwilioMediaStream(ws, request);
});

// Sentry error handler (must be after all routes)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Supabase configured: ${!!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY}`);
  console.log(`OpenRouter configured: ${!!process.env.OPENROUTER_API_KEY}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Twilio configured: ${!!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN}`);
  console.log(`Canvas Agents WebSocket: Active on /agents-ws`);
  console.log(`Call Transcription WebSocket: Active on /call-transcription-ws`);
  console.log(`Harvey AI WebSocket: Active on /harvey-ws`);
  console.log(`Twilio Media Stream WebSocket: Active on /api/media-stream`);
});
