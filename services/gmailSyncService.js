import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Gmail sync service for syncing sent emails to CRM
 */
class GmailSyncService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      null // Redirect URI will be set dynamically
    );

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Get OAuth credentials for a user from the database
   * @param {string} userId - The user ID
   * @param {string} email - The Gmail email address
   * @returns {Promise<Object|null>}
   */
  async getUserGmailCredentials(userId, email) {
    try {
      const { data, error } = await supabase
        .from('user_gmail_tokens')
        .select('*')
        .match({ user_id: userId, email })
        .single();

      if (error || !data) {
        return null;
      }

      // Check if token is expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        // Try to refresh the token
        this.oauth2Client.setCredentials({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });

        try {
          const { credentials } = await this.oauth2Client.refreshAccessToken();
          
          // Update tokens in database
          await supabase
            .from('user_gmail_tokens')
            .update({
              access_token: credentials.access_token,
              expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
              updated_at: new Date().toISOString()
            })
            .match({ user_id: userId, email });

          return {
            ...data,
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date
          };
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
          return null;
        }
      }

      return data;
    } catch (error) {
      console.error('Error fetching Gmail credentials:', error);
      return null;
    }
  }

  /**
   * Sync Gmail emails for a user
   * @param {string} userId - The user ID
   * @param {string} accountEmail - Optional specific email account to sync
   * @returns {Promise<{syncedCount: number}>}
   */
  async syncGmailEmails(userId, accountEmail = null) {
    try {
      console.log(`Starting Gmail sync for user: ${userId}, account: ${accountEmail || 'all'}`);

      // Get user's connected Gmail accounts
      const { data: gmailAccounts, error } = await supabase
        .from('user_gmail_tokens')
        .select('email')
        .eq('user_id', userId);

      if (error || !gmailAccounts || gmailAccounts.length === 0) {
        throw new Error('No Gmail accounts connected for this user');
      }

      const syncedEmails = [];
      
      // Sync emails from each connected account
      for (const account of gmailAccounts) {
        if (accountEmail && account.email !== accountEmail) {
          continue; // Skip if specific account requested
        }

        try {
          const emails = await this.syncUserGmailAccount(userId, account.email);
          syncedEmails.push(...emails);
        } catch (error) {
          console.error(`Error syncing account ${account.email}:`, error);
          // Continue with other accounts even if one fails
        }
      }
      
      console.log(`Gmail sync completed. Synced ${syncedEmails.length} emails`);
      
      return {
        syncedCount: syncedEmails.length,
        emails: syncedEmails
      };
    } catch (error) {
      console.error('Gmail sync error:', error);
      throw new Error(`Gmail sync failed: ${error.message}`);
    }
  }

  /**
   * Sync emails from a specific user's Gmail account using OAuth
   * @param {string} userId - The user ID
   * @param {string} email - The Gmail email address
   * @returns {Promise<Array>}
   */
  async syncUserGmailAccount(userId, email) {
    console.log(`Syncing Gmail account: ${email} for user: ${userId}`);

    // Get user's OAuth credentials
    const credentials = await this.getUserGmailCredentials(userId, email);
    if (!credentials) {
      throw new Error(`No valid credentials found for ${email}`);
    }

    // Set OAuth credentials
    this.oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token
    });

    try {
      // Get emails from Gmail API
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'in:sent', // Get sent emails
        maxResults: 50 // Limit for initial sync
      });

      if (!response.data.messages) {
        return [];
      }

      const emails = [];
      
      // Fetch full details for each message
      for (const message of response.data.messages) {
        try {
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id
          });

          const email = this.parseGmailMessage(fullMessage.data, userId, email);
          if (email) {
            const stored = await this.storeEmailInDatabase(email);
            if (stored) {
              emails.push(stored);
            }
          }
        } catch (error) {
          console.error(`Error fetching message ${message.id}:`, error);
        }
      }

      return emails;
    } catch (error) {
      console.error('Gmail API error:', error);
      throw error;
    }
  }

  /**
   * Parse Gmail message into our email format
   * @param {Object} message - Gmail message object
   * @param {string} userId - The user ID
   * @param {string} fromEmail - The sender email
   * @returns {Object|null}
   */
  parseGmailMessage(message, userId, fromEmail) {
    try {
      const headers = message.payload.headers;
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

      // Extract email body
      let body = '';
      if (message.payload.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString();
      } else if (message.payload.parts) {
        const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString();
        }
      }

      return {
        user_id: userId,
        from_email: fromEmail,
        to_email: getHeader('To'),
        subject: getHeader('Subject'),
        body: body,
        email_type: 'outbound',
        sent_at: new Date(parseInt(message.internalDate)).toISOString(),
        gmail_message_id: message.id,
        thread_id: message.threadId
      };
    } catch (error) {
      console.error('Error parsing Gmail message:', error);
      return null;
    }
  }

  /**
   * Sync emails from configured Gmail accounts
   * @param {string} userId - The user ID
   * @param {string} accountEmail - Optional specific email account
   * @returns {Promise<Array>}
   */
  async syncFromConfiguredAccounts(userId, accountEmail = null) {
    const syncedEmails = [];
    
    // Get configured Gmail accounts from environment
    const gmailAccounts = this.getConfiguredGmailAccounts();
    
    for (const account of gmailAccounts) {
      if (accountEmail && account.email !== accountEmail) {
        continue; // Skip if specific account requested and this isn't it
      }
      
      try {
        const emails = await this.syncAccountEmails(userId, account);
        syncedEmails.push(...emails);
      } catch (error) {
        console.error(`Error syncing account ${account.email}:`, error);
        // Continue with other accounts even if one fails
      }
    }
    
    return syncedEmails;
  }

  /**
   * Get configured Gmail accounts from environment
   * @returns {Array<{email: string, password: string}>}
   */
  getConfiguredGmailAccounts() {
    const accounts = [];
    
    // Check for Gmail accounts in environment variables
    if (process.env.REACT_APP_GMAIL_EMAIL_1 && process.env.REACT_APP_GMAIL_PASSWORD_1) {
      accounts.push({
        email: process.env.REACT_APP_GMAIL_EMAIL_1,
        password: process.env.REACT_APP_GMAIL_PASSWORD_1
      });
    }
    
    if (process.env.REACT_APP_GMAIL_EMAIL_2 && process.env.REACT_APP_GMAIL_PASSWORD_2) {
      accounts.push({
        email: process.env.REACT_APP_GMAIL_EMAIL_2,
        password: process.env.REACT_APP_GMAIL_PASSWORD_2
      });
    }
    
    return accounts;
  }

  /**
   * Sync emails from a specific Gmail account
   * @param {string} userId - The user ID
   * @param {Object} account - Gmail account credentials
   * @returns {Promise<Array>}
   */
  async syncAccountEmails(userId, account) {
    console.log(`Syncing emails from account: ${account.email}`);
    
    // For demonstration, we'll create mock email data
    // In production, you'd use Gmail API or IMAP to fetch real emails
    const mockEmails = await this.getMockEmailsForToday(userId, account.email);
    
    // Store emails in database
    const storedEmails = [];
    for (const email of mockEmails) {
      try {
        const stored = await this.storeEmailInDatabase(email);
        if (stored) {
          storedEmails.push(stored);
        }
      } catch (error) {
        console.error('Error storing email:', error);
      }
    }
    
    return storedEmails;
  }

  /**
   * Get mock emails for today (placeholder for real Gmail integration)
   * @param {string} userId - The user ID
   * @param {string} fromEmail - The sender email
   * @returns {Promise<Array>}
   */
  async getMockEmailsForToday(userId, fromEmail) {
    const today = new Date();
    const mockEmails = [
      {
        user_id: userId,
        from_email: fromEmail,
        to_email: 'john.doe@example.com',
        subject: 'Product Demo Follow-up',
        body: 'Hi John, thank you for attending our product demo yesterday. I wanted to follow up and see if you have any questions about our aesthetic device solutions.',
        email_type: 'outbound',
        sent_at: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        gmail_message_id: `mock_${Date.now()}_1`,
        thread_id: `thread_${Date.now()}_1`
      },
      {
        user_id: userId,
        from_email: fromEmail,
        to_email: 'sarah.smith@clinic.com',
        subject: 'Pricing Information for Dental Equipment',
        body: 'Hello Sarah, as requested, I am sending you the pricing information for our dental implant system. Please let me know if you need any clarification.',
        email_type: 'outbound',
        sent_at: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        gmail_message_id: `mock_${Date.now()}_2`,
        thread_id: `thread_${Date.now()}_2`
      }
    ];
    
    return mockEmails;
  }

  /**
   * Store email in database
   * @param {Object} email - Email data
   * @returns {Promise<Object|null>}
   */
  async storeEmailInDatabase(email) {
    try {
      // Check if email already exists
      const { data: existing } = await supabase
        .from('email_logs')
        .select('id')
        .eq('gmail_message_id', email.gmail_message_id)
        .single();
      
      if (existing) {
        console.log(`Email ${email.gmail_message_id} already exists, skipping`);
        return null;
      }
      
      // Insert new email
      const { data, error } = await supabase
        .from('email_logs')
        .insert([{
          user_id: email.user_id,
          from_email: email.from_email,
          to_email: email.to_email,
          subject: email.subject,
          body: email.body,
          email_type: email.email_type,
          sent_at: email.sent_at,
          gmail_message_id: email.gmail_message_id,
          thread_id: email.thread_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      console.log(`Stored email: ${email.subject} to ${email.to_email}`);
      return data;
    } catch (error) {
      console.error('Database error storing email:', error);
      throw error;
    }
  }

  /**
   * Get authentication URL for Gmail OAuth
   * @returns {string}
   */
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ];
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes
    });
  }

  /**
   * Set OAuth credentials from authorization code
   * @param {string} code - Authorization code from Google
   * @returns {Promise<Object>}
   */
  async setCredentialsFromCode(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      console.error('Error setting credentials:', error);
      throw error;
    }
  }
}

// Create singleton instance
const gmailSyncService = new GmailSyncService();

/**
 * Main export function for syncing Gmail emails
 * @param {string} userId - The user ID
 * @param {string} accountEmail - Optional specific email account to sync
 * @returns {Promise<{syncedCount: number}>}
 */
export async function syncGmailEmails(userId, accountEmail = null) {
  return gmailSyncService.syncGmailEmails(userId, accountEmail);
}

export { gmailSyncService };
export default gmailSyncService;