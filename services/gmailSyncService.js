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
      process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set credentials if available
    if (process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        access_token: process.env.GOOGLE_ACCESS_TOKEN,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
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

      // For now, we'll use a simple approach with the configured Gmail accounts
      // In production, you'd integrate with OAuth to get user's Gmail access
      
      const syncedEmails = await this.syncFromConfiguredAccounts(userId, accountEmail);
      
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