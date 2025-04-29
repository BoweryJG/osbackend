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
  origin: function(origin, callback) {
    // Allow any origin in development
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    
    // In production, check against allowed origins
    const allowedOrigins = [
      'https://repspheres.netlify.app',
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
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-site cookies in production
    path: '/'
  }
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

// User registration endpoint
app.post('/auth/register', async (req, res) => {
  const { name, email, company, reason } = req.body;
  
  // Validate required fields
  if (!name || !email || !company || !reason) {
    return res.status(400).json({ 
      success: false, 
      message: 'All fields are required' 
    });
  }
  
  try {
    // Store user registration in Supabase
    const { data, error } = await supabase
      .from('user_registrations')
      .upsert({
        name,
        email,
        company,
        reason,
        created_at: new Date(),
        updated_at: new Date()
      });
    
    if (error) {
      console.error('Error storing user registration:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to register user' 
      });
    }
    
    // Set a session variable to track this user
    req.session.registeredUser = {
      name,
      email,
      company,
      registeredAt: new Date()
    };
    
    res.json({ 
      success: true, 
      message: 'Registration successful'
    });
  } catch (err) {
    console.error('Exception during registration:', err);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during registration' 
    });
  }
});

// Password authentication endpoint
app.post('/auth/password', (req, res) => {
  const { password, userData } = req.body;
  
  // Check if user is registered
  if (!req.session.registeredUser && !userData) {
    return res.status(403).json({ 
      success: false, 
      message: 'Registration required',
      requiresRegistration: true
    });
  }
  
  // If userData is provided, store it in the session
  if (userData && !req.session.registeredUser) {
    req.session.registeredUser = {
      ...userData,
      registeredAt: new Date()
    };
    
    // Also store in Supabase asynchronously
    supabase
      .from('user_registrations')
      .upsert({
        name: userData.name,
        email: userData.email,
        company: userData.company,
        reason: userData.reason || 'Not provided',
        created_at: new Date(),
        updated_at: new Date()
      })
      .then(({ error }) => {
        if (error) console.error('Error storing user registration:', error);
      });
  }
  
  if (password === 'letmein123') {
    // Set a session variable to indicate the user is authenticated
    req.session.passwordAuthenticated = true;
    
    // Generate a simple token for localStorage backup authentication
    const token = Buffer.from(`auth_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`).toString('base64');
    
    // Save the token in the session for verification
    req.session.authToken = token;
    
    // Return the token to the client
    res.json({ 
      success: true, 
      message: 'Authentication successful',
      token: token
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Token verification endpoint
app.post('/auth/verify-token', (req, res) => {
  const { token } = req.body;
  
  // Check if the token is valid
  if (token === 'letmein123') {
    // Special case: hardcoded token always works
    req.session.passwordAuthenticated = true;
    res.json({ success: true, message: 'Token verified' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// Authentication status endpoint
app.get('/auth/status', (req, res) => {
  // Check both OAuth and password authentication
  const isAuth = req.isAuthenticated() || req.session.passwordAuthenticated === true;
  
  res.json({
    authenticated: isAuth,
    user: req.isAuthenticated() ? {
      id: req.user.id,
      displayName: req.user.displayName,
      email: req.user.emails?.[0]?.value
    } : (isAuth ? { id: 'password-user', displayName: 'Password User' } : null)
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
  const { model, prompt, llm_model, token } = req.body;
  
  // Check if the model is free
  if (!isFreeModel(model)) {
    // For paid models, check if the user is authenticated with password
    if (!req.session.passwordAuthenticated) {
      // Check if a valid token was provided
      if (token === 'letmein123') {
        // Token is valid, set session authentication
        req.session.passwordAuthenticated = true;
      } else {
        return res.status(403).json({ 
          success: false, 
          error: 'Password required',
          response: 'Please enter the password to access paid models.'
        });
      }
    }
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
