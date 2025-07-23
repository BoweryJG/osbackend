import { createTransport } from 'nodemailer';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import logger from '../utils/logger.js';

dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

class EmailOrchestrator {
  constructor() {
    this.accounts = [];
    this.currentAccountIndex = 0;
    this.dailySendCounts = new Map();
    this.postalEnabled = false;
    this.postalTransporter = null;
    this.initializeAccounts();
    this.initializePostal();
    this.startDailyReset();
  }

  initializeAccounts() {
    // Dynamically load all configured Gmail accounts
    const accountConfigs = [];
    
    // Check for up to 10 accounts
    for (let i = 1; i <= 10; i++) {
      const email = process.env[`GMAIL_EMAIL_${i}`];
      const password = process.env[`GMAIL_APP_PASSWORD_${i}`];
      
      if (email && password && !email.includes('your-email')) {
        accountConfigs.push({ email, password });
        logger.info(`✅ Loaded email account ${i}: ${email}`);
      }
    }
    
    if (accountConfigs.length === 0) {
      logger.warn('⚠️  No email accounts configured! Add Gmail credentials to .env');
      return;
    }

    // Create transporters for each account
    this.accounts = accountConfigs.map(config => ({
      email: config.email,
      transporter: createTransport({
        service: 'gmail',
        auth: {
          user: config.email,
          pass: config.password
        }
      }),
      // Google Workspace accounts have 2000/day limit
      dailyLimit: config.email.includes('bowerycreativeagency.com') ? 2000 : 500,
      sentToday: 0
    }));

    // Initialize daily counts
    this.accounts.forEach(acc => {
      this.dailySendCounts.set(acc.email, 0);
    });
  }

  initializePostal() {
    // Initialize Postal SMTP if configured
    if (process.env.POSTAL_HOST && process.env.POSTAL_API_KEY) {
      try {
        this.postalTransporter = createTransport({
          host: process.env.POSTAL_HOST || 'localhost',
          port: parseInt(process.env.POSTAL_PORT || '25'),
          secure: false,
          auth: {
            user: process.env.POSTAL_API_KEY,
            pass: process.env.POSTAL_API_KEY
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        this.postalEnabled = true;
        logger.info('✅ Postal email server connected - UNLIMITED emails!');
      } catch (error) {
        logger.info('Postal not configured, using Gmail accounts only');
      }
    }
  }

  startDailyReset() {
    // Reset counts at midnight
    cron.schedule('0 0 * * *', () => {
      logger.info('Resetting daily email counts');
      this.accounts.forEach(acc => {
        acc.sentToday = 0;
        this.dailySendCounts.set(acc.email, 0);
      });
    });
  }

  getNextAvailableAccount() {
    // Find account with available quota
    for (let i = 0; i < this.accounts.length; i++) {
      const index = (this.currentAccountIndex + i) % this.accounts.length;
      const account = this.accounts[index];
      
      if (account.sentToday < account.dailyLimit) {
        this.currentAccountIndex = (index + 1) % this.accounts.length;
        return account;
      }
    }
    
    throw new Error('All email accounts have reached their daily limits');
  }

  async sendEmail(options) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      headers = {},
      attachments = [],
      preferPostal = false
    } = options;

    try {
      // Use Postal for bulk/unlimited sends if available
      if (this.postalEnabled && (preferPostal || options.bulk)) {
        return this.sendViaPostal(options);
      }

      // Otherwise use Gmail accounts
      const account = this.getNextAvailableAccount();
      
      // Prepare email
      const mailOptions = {
        from: from || `"RepSpheres" <${account.email}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
        replyTo: replyTo || account.email,
        headers: {
          'X-Mailer': 'RepSpheres Platform',
          'X-Campaign-ID': options.campaignId || 'direct',
          ...headers
        },
        attachments
      };

      // Send email
      const info = await account.transporter.sendMail(mailOptions);
      
      // Update counts
      account.sentToday++;
      this.dailySendCounts.set(account.email, account.sentToday);
      
      // Log to database
      await this.logEmail({
        message_id: info.messageId,
        from_email: account.email,
        to_email: to,
        subject,
        status: 'sent',
        sent_at: new Date().toISOString(),
        campaign_id: options.campaignId
      });

      return {
        success: true,
        messageId: info.messageId,
        account: account.email
      };

    } catch (error) {
      logger.error('Email send error:', error);
      
      // Log failure
      await this.logEmail({
        from_email: from,
        to_email: to,
        subject,
        status: 'failed',
        error: error.message,
        sent_at: new Date().toISOString()
      });

      throw error;
    }
  }

  async sendAsClient(clientEmail, clientName, recipientEmail, subject, body) {
    // Send email appearing to be from client
    return this.sendEmail({
      from: `"${clientName}" <${clientEmail}>`,
      to: recipientEmail,
      subject,
      html: body,
      replyTo: clientEmail,
      headers: {
        'Sender': 'platform@repspheres.com',
        'Return-Path': clientEmail
      }
    });
  }

  async createCampaign(campaign) {
    const { data, error } = await supabase
      .from('email_campaigns')
      .insert({
        name: campaign.name,
        recipients: campaign.recipients,
        subject: campaign.subject,
        html_template: campaign.htmlTemplate,
        schedule: campaign.schedule,
        status: 'scheduled',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Schedule the campaign
    this.scheduleCampaign(data);
    
    return data;
  }

  scheduleCampaign(campaign) {
    campaign.schedule.forEach((scheduleItem, index) => {
      const sendDate = new Date(scheduleItem.sendAt);
      const cronExpression = `${sendDate.getMinutes()} ${sendDate.getHours()} ${sendDate.getDate()} ${sendDate.getMonth() + 1} *`;
      
      cron.schedule(cronExpression, async () => {
        logger.info(`Executing campaign step ${index + 1} for ${campaign.name}`);
        
        for (const recipient of campaign.recipients) {
          try {
            // Personalize content
            const personalizedHtml = this.personalizeTemplate(
              scheduleItem.template || campaign.html_template,
              recipient
            );

            await this.sendEmail({
              to: recipient.email,
              subject: this.personalizeTemplate(campaign.subject, recipient),
              html: personalizedHtml,
              campaignId: campaign.id
            });

            // Add delay between sends
            await this.delay(Math.random() * 5000 + 2000); // 2-7 seconds
          } catch (error) {
            logger.error(`Failed to send to ${recipient.email}:`, error);
          }
        }
      });
    });
  }

  async sendViaPostal(options) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      headers = {},
      attachments = []
    } = options;

    const mailOptions = {
      from: from || '"RepSpheres" <noreply@repspheres.com>',
      to,
      subject,
      html,
      text: text || this.htmlToText(html),
      replyTo: replyTo || 'support@repspheres.com',
      headers: {
        'X-Mailer': 'RepSpheres Postal Server',
        'X-Campaign-ID': options.campaignId || 'direct',
        ...headers
      },
      attachments
    };

    const info = await this.postalTransporter.sendMail(mailOptions);
    
    // Log to database
    await this.logEmail({
      message_id: info.messageId,
      from_email: mailOptions.from,
      to_email: to,
      subject,
      status: 'sent',
      sent_at: new Date().toISOString(),
      campaign_id: options.campaignId,
      sent_via: 'postal'
    });

    return {
      success: true,
      messageId: info.messageId,
      account: 'postal-unlimited'
    };
  }

  personalizeTemplate(template, recipient) {
    let personalized = template;
    Object.entries(recipient).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      personalized = personalized.replace(regex, value);
    });
    return personalized;
  }

  async logEmail(emailData) {
    try {
      await supabase
        .from('email_logs')
        .insert(emailData);
    } catch (error) {
      logger.error('Failed to log email:', error);
    }
  }

  htmlToText(html) {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get email statistics
  async getStats() {
    const stats = {
      accounts: this.accounts.map(acc => ({
        email: acc.email,
        sentToday: acc.sentToday,
        remainingToday: acc.dailyLimit - acc.sentToday
      })),
      totalSentToday: Array.from(this.dailySendCounts.values()).reduce((a, b) => a + b, 0),
      postalEnabled: this.postalEnabled,
      totalDailyCapacity: this.postalEnabled ? 'UNLIMITED' : this.accounts.reduce((sum, acc) => sum + acc.dailyLimit, 0)
    };

    if (this.postalEnabled) {
      stats.accounts.push({
        email: 'postal-server',
        sentToday: 'N/A',
        remainingToday: 'UNLIMITED'
      });
    }

    return stats;
  }
}

// Export singleton instance
export const emailService = new EmailOrchestrator();

// Export functions for direct use
export const sendEmail = (options) => emailService.sendEmail(options);
export const sendAsClient = (...args) => emailService.sendAsClient(...args);
export const createCampaign = (campaign) => emailService.createCampaign(campaign);
export const getEmailStats = () => emailService.getStats();