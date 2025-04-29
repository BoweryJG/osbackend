import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import session from 'express-session';
import SupabaseSessionStore from './supabaseSessionStore.js';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Ensure correct protocol for OAuth redirects on Render
app.use(cors({
  origin: 'https://repspheres.netlify.app',
  credentials: true
}));
app.use(express.json());
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
  if (profile.emails && profile.emails[0].value.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return done(null, profile);
  } else {
    return done(null, false, { message: 'Not authorized' });
  }
}));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/google');
}

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/admin');
  }
);

// Protected admin dashboard
app.get('/admin', ensureAuthenticated, (req, res) => {
  res.send(`Welcome to the admin dashboard, ${req.user.displayName}!`);
});

// Supabase client setup
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
  const { data, error } = await supabase.from('activity_log').insert([{ task, result }]);
  if (error) throw error;
  return data;
}

// Main endpoint: receive task, call LLM, log to Supabase
app.post('/task', async (req, res) => {
  const { model, prompt, llm_model } = req.body;
  try {
    const llmResult = await callLLM(model, prompt, llm_model);
    await logActivity({ model, prompt, llm_model }, llmResult);
    res.json({ success: true, llmResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP AI server running on port ${PORT}`);
});
