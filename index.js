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
    'google/gemini-2.5-pro',  // Added Gemini 2.5 Pro
    'anthropic/claude-instant',
    'mistralai/mistral',
    'meta-llama/llama-2'
  ];
  
  // For local development, consider all models as free
  const isLocalDevelopment = process.env.NODE_ENV === 'development' || 
                            (process.env.NODE_ENV !== 'production' && 
                             (process.env.LOCAL_DEV === 'true' || !process.env.LOCAL_DEV));
  
  if (isLocalDevelopment) {
    console.log('Local development mode: All models are considered free');
    return true;
  }
  
  // Check if the model ID contains any of the free model patterns
  return freeModels.some(freeModel => modelId.toLowerCase().includes(freeModel.toLowerCase()));
}

// Main endpoint: receive task, call LLM, log to Supabase
app.post('/task', async (req, res) => {
  const { model, prompt, llm_model } = req.body;
  
  // Check if the model is paid and if the user is authenticated
  if (!isFreeModel(model) && !req.isAuthenticated()) {
    return res.status(403).json({ 
      success: false, 
      error: 'Authentication required for this model',
      response: 'Please log in to use premium models.'
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
