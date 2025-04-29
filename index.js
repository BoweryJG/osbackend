import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import session from 'express-session';
import SupabaseSessionStore from './supabaseSessionStore.js';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Verify required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'OPENROUTER_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Environment variable ${envVar} is required but not set.`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1); // Ensure correct protocol for OAuth redirects on Render
app.use(cors({
  origin: ['https://repspheres.netlify.app', 'http://localhost:5176', 'https://*.netlify.app'],
  credentials: true
}));
app.use(express.json());
// Use memory store for sessions to avoid connection issues
// but keep Supabase for activity logging and other functionality
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: true,
  store: new SupabaseSessionStore({
    table: 'sessions',
    ttl: 86400 // 1 day
  })
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Google OAuth config ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'Jasonwilliamgolden@gmail.com';

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  // Allow any user to log in for using paid models
  // But only admin can access the admin dashboard
  return done(null, {
    ...profile,
    isAdmin: profile.emails && profile.emails[0].value.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  });
}));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/google');
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin) { 
    return next(); 
  }
  res.status(403).send('Access denied: Admin privileges required');
}

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // After successful authentication, redirect back to the frontend
    const frontendUrl = process.env.FRONTEND_URL || 'https://repspheres.netlify.app';
    res.redirect(frontendUrl);
  }
);

// Protected admin dashboard
app.get('/admin', ensureAdmin, (req, res) => {
  res.send(`Welcome to the admin dashboard, ${req.user.displayName}!`);
});

// Authentication status endpoint
app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      id: req.user.id,
      displayName: req.user.displayName,
      email: req.user.emails?.[0]?.value
    } : null
  });
});

// Subscription status endpoint
app.get('/auth/subscription', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.json({
      subscription: 'free',
      authenticated: false
    });
  }
  
  const email = req.user.emails?.[0]?.value;
  const subscriptionLevel = await getUserSubscription(email);
  
  res.json({
    subscription: subscriptionLevel,
    authenticated: true,
    email: email
  });
});

// Admin endpoints for managing subscriptions
app.get('/admin/subscriptions', ensureAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, subscriptions: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/admin/subscriptions', ensureAdmin, async (req, res) => {
  const { user_id, email, subscription_level } = req.body;
  
  if (!email || !subscription_level) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and subscription level are required' 
    });
  }
  
  if (!['free', 'asm', 'rsm'].includes(subscription_level)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid subscription level. Must be one of: free, asm, rsm' 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: user_id || email.replace(/[^a-zA-Z0-9]/g, '_'),
        email,
        subscription_level,
        updated_at: new Date()
      });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Subscription for ${email} set to ${subscription_level}` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supabase client setup
console.log('Connecting to Supabase at:', process.env.SUPABASE_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Example: Call LLM endpoint using OpenRouter
async function callLLM(model, prompt, llm_model) {
  // Use OpenRouter API for all LLM calls
  const modelToUse = llm_model || process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
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
}


// Log activity to Supabase
async function logActivity(task, result) {
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
  if (!email) return 'free';
  
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

// Main endpoint: receive task, call LLM, log to Supabase
app.post('/task', async (req, res) => {
  const { model, prompt, llm_model } = req.body;
  
  // Get user email from session if authenticated
  const userEmail = req.isAuthenticated() ? req.user.emails?.[0]?.value : null;
  
  // Check if user can access this model
  const hasAccess = await canAccessModel(userEmail, model);
  
  if (!hasAccess) {
    // If user is not authenticated at all
    if (!req.isAuthenticated()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Authentication required for this model',
        response: 'Please log in to use premium models.'
      });
    }
    
    // If user is authenticated but doesn't have the right subscription
    return res.status(403).json({ 
      success: false, 
      error: 'Subscription required for this model',
      response: 'Your current subscription level does not include access to this model. Please upgrade to RSM level for full access.'
    });
  }
  
  try {
    const llmResult = await callLLM(model, prompt, llm_model);
    
    // Try to log activity, but don't fail the request if logging fails
    try {
      await logActivity({ model, prompt, llm_model }, llmResult);
    } catch (logErr) {
      console.error('Error logging activity:', logErr);
    }
    
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
    
    // For other errors, return a generic error message
    res.status(500).json({ 
      success: false, 
      error: err.message,
      response: "Sorry, there was an error processing your request. Please try again later."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP AI server running on port ${PORT}`);
});
