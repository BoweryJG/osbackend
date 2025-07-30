import express from 'express';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
);

// OAuth2 client configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  // Redirect URI will be determined based on the request origin
  null
);

// Gmail scopes needed
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Get Google OAuth URL
 * This endpoint is called by the frontend to get the URL to redirect users to Google
 */
router.get('/auth/google/url', requireAuth, (req, res) => {
  try {
    // Get the origin from the request to determine redirect URI
    const origin = req.headers.origin || req.headers.referer;
    let redirectUri;

    // Determine redirect URI based on origin
    if (origin?.includes('crm.repspheres.com')) {
      redirectUri = 'https://crm.repspheres.com/auth/google/callback';
    } else if (origin?.includes('marketdata.repspheres.com')) {
      redirectUri = 'https://marketdata.repspheres.com/auth/google/callback';
    } else if (origin?.includes('localhost:3000')) {
      redirectUri = 'http://localhost:3000/auth/google/callback';
    } else if (origin?.includes('localhost:7003')) {
      redirectUri = 'http://localhost:7003/auth/google/callback';
    } else if (origin?.includes('repconnect.repspheres.com')) {
      redirectUri = 'https://repconnect.repspheres.com/gmail-auth-callback';
    } else {
      // Default to osbackend redirect
      redirectUri = 'https://osbackend-zl1h.onrender.com/auth/google/callback';
    }

    // Set redirect URI for this request
    oauth2Client.redirectUri = redirectUri;

    // Generate the auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent', // Force consent to ensure we get refresh token
      state: JSON.stringify({
        userId: req.user.id,
        redirectUri,
        returnUrl: req.query.returnUrl || origin
      })
    });

    res.json(successResponse({ authUrl }, 'OAuth URL generated successfully'));
  } catch (error) {
    logger.error('Error generating Google OAuth URL:', error);
    res.status(500).json(errorResponse('OAUTH_URL_ERROR', 'Failed to generate OAuth URL', null, 500));
  }
});

/**
 * Handle Google OAuth callback
 * This endpoint handles the callback from Google after user authorization
 */
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      throw new Error('Authorization code not provided');
    }

    // Parse state to get user info
    let stateData;
    try {
      stateData = JSON.parse(state);
    } catch (e) {
      throw new Error('Invalid state parameter');
    }

    const { userId, redirectUri, returnUrl } = stateData;

    // Set redirect URI for token exchange
    oauth2Client.redirectUri = redirectUri;

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('user_gmail_tokens')
      .upsert({
        user_id: userId,
        email: userInfo.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scope: tokens.scope
      }, {
        onConflict: 'user_id,email'
      });

    if (dbError) {
      throw dbError;
    }

    logger.info(`Gmail connected successfully for user ${userId}`);

    // Redirect back to the application with success
    const successUrl = new URL(returnUrl || 'https://crm.repspheres.com/settings');
    successUrl.searchParams.set('gmail_connected', 'true');
    successUrl.searchParams.set('email', userInfo.email);
    
    res.redirect(successUrl.toString());
  } catch (error) {
    logger.error('Google OAuth callback error:', error);
    
    // Redirect back with error
    const errorUrl = new URL(req.query.returnUrl || 'https://crm.repspheres.com/settings');
    errorUrl.searchParams.set('gmail_error', 'true');
    errorUrl.searchParams.set('error_message', error.message);
    
    res.redirect(errorUrl.toString());
  }
});

/**
 * Disconnect Gmail account
 */
router.delete('/auth/google/disconnect', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    // Delete the token from database
    const { error } = await supabase
      .from('user_gmail_tokens')
      .delete()
      .match({ user_id: userId, email });

    if (error) {
      throw error;
    }

    logger.info(`Gmail disconnected for user ${userId}, email: ${email}`);
    res.json(successResponse(null, 'Gmail account disconnected successfully'));
  } catch (error) {
    logger.error('Error disconnecting Gmail:', error);
    res.status(500).json(errorResponse('DISCONNECT_ERROR', 'Failed to disconnect Gmail account', null, 500));
  }
});

/**
 * Get connected Gmail accounts
 */
router.get('/auth/google/accounts', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all connected Gmail accounts for the user
    const { data: accounts, error } = await supabase
      .from('user_gmail_tokens')
      .select('email, created_at, expires_at')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.json(successResponse({
      accounts: accounts || []
    }, 'Gmail accounts retrieved successfully'));
  } catch (error) {
    logger.error('Error retrieving Gmail accounts:', error);
    res.status(500).json(errorResponse('RETRIEVE_ERROR', 'Failed to retrieve Gmail accounts', null, 500));
  }
});

/**
 * Refresh Gmail token if needed
 */
router.post('/auth/google/refresh', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    // Get current tokens
    const { data: tokenData, error: fetchError } = await supabase
      .from('user_gmail_tokens')
      .select('*')
      .match({ user_id: userId, email })
      .single();

    if (fetchError || !tokenData) {
      throw new Error('Gmail account not found');
    }

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token
    });

    // Refresh the token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('user_gmail_tokens')
      .update({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .match({ user_id: userId, email });

    if (updateError) {
      throw updateError;
    }

    res.json(successResponse(null, 'Token refreshed successfully'));
  } catch (error) {
    logger.error('Error refreshing Gmail token:', error);
    res.status(500).json(errorResponse('REFRESH_ERROR', 'Failed to refresh Gmail token', null, 500));
  }
});

export default router;