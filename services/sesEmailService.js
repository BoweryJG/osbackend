import AWS from 'aws-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { getRepXTier } from '../utils/repxHelpers.js';

dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize AWS SES
const ses = new AWS.SES({
  apiVersion: '2010-12-01',
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

class SESEmailService {
  constructor() {
    this.initialized = false;
    this.verifiedEmails = new Set();
    this.initialize();
  }

  async initialize() {
    try {
      // Verify SES is configured
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        logger.warn('AWS SES credentials not configured');
        return;
      }

      // Get verified email addresses
      const { VerifiedEmailAddresses } = await ses.listVerifiedEmailAddresses().promise();
      this.verifiedEmails = new Set(VerifiedEmailAddresses);
      
      this.initialized = true;
      logger.info(`✅ Amazon SES initialized with ${this.verifiedEmails.size} verified emails`);
    } catch (error) {
      logger.error('SES initialization error:', error);
    }
  }

  async getUserEmailConfig(userId) {
    try {
      const repxTier = await getRepXTier(userId);
      
      // Email limits by tier (using SES for all tiers)
      const configs = {
        repx0: {
          tier: 'repx0',
          emailLimit: 0,
          canSendEmail: false
        },
        repx1: {
          tier: 'repx1',
          emailLimit: 100,
          canSendEmail: true,
          costPerMonth: '$0.01'
        },
        repx2: {
          tier: 'repx2',
          emailLimit: 500,
          canSendEmail: true,
          costPerMonth: '$0.05'
        },
        repx3: {
          tier: 'repx3',
          emailLimit: 2000,
          canSendEmail: true,
          costPerMonth: '$0.20'
        },
        repx4: {
          tier: 'repx4',
          emailLimit: null, // Unlimited
          canSendEmail: true,
          costPerMonth: 'Pay as you go'
        },
        repx5: {
          tier: 'repx5',
          emailLimit: null, // Unlimited
          canSendEmail: true,
          costPerMonth: 'Pay as you go',
          whiteLabel: true
        }
      };

      return configs[repxTier] || configs.repx0;
    } catch (error) {
      logger.error('Error getting user email config:', error);
      return { tier: 'repx0', emailLimit: 0, canSendEmail: false };
    }
  }

  async checkEmailQuota(userId, emailConfig) {
    // Unlimited tiers have no quota
    if (emailConfig.emailLimit === null) {
      return { allowed: true, remaining: null };
    }

    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: usage, error } = await supabase
        .from('user_email_usage')
        .select('emails_sent')
        .eq('user_id', userId)
        .eq('month', monthStart.toISOString().slice(0, 7))
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        throw error;
      }

      const sent = usage?.emails_sent || 0;
      const remaining = emailConfig.emailLimit - sent;

      return {
        allowed: remaining > 0,
        remaining,
        sent,
        limit: emailConfig.emailLimit
      };
    } catch (error) {
      logger.error('Error checking email quota:', error);
      return { allowed: false, remaining: 0 };
    }
  }

  async trackEmailUsage(userId, count = 1) {
    try {
      await supabase.rpc('increment_email_usage', {
        p_user_id: userId,
        p_month: new Date().toISOString().slice(0, 7),
        p_count: count
      });
    } catch (error) {
      logger.error('Error tracking email usage:', error);
    }
  }

  async sendEmail(options) {
    const {
      userId,
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments = [],
      tags = {}
    } = options;

    if (!userId) {
      throw new Error('userId is required');
    }

    if (!this.initialized) {
      throw new Error('SES not initialized');
    }

    try {
      // Get user's email configuration
      const emailConfig = await this.getUserEmailConfig(userId);

      // Check if user has email access
      if (!emailConfig.canSendEmail) {
        throw new Error('Email access requires RepX1 or higher subscription');
      }

      // Check quota for limited tiers
      const quota = await this.checkEmailQuota(userId, emailConfig);
      if (!quota.allowed) {
        throw new Error(`Monthly email limit reached (${emailConfig.emailLimit} emails/month). Upgrade to RepX4 for unlimited emails.`);
      }

      // Prepare SES parameters
      const params = {
        Source: from || process.env.SES_FROM_EMAIL || 'noreply@repspheres.com',
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {}
        },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Tags: [
          { Name: 'userId', Value: userId },
          { Name: 'tier', Value: emailConfig.tier },
          ...Object.entries(tags).map(([k, v]) => ({ Name: k, Value: String(v) }))
        ]
      };

      // Add email body
      if (html) {
        params.Message.Body.Html = {
          Data: html,
          Charset: 'UTF-8'
        };
      }
      if (text || !html) {
        params.Message.Body.Text = {
          Data: text || this.htmlToText(html),
          Charset: 'UTF-8'
        };
      }

      // Send email via SES
      const result = await ses.sendEmail(params).promise();

      // Track usage for limited tiers
      if (emailConfig.emailLimit !== null) {
        await this.trackEmailUsage(userId);
      }

      // Log the send for analytics
      await this.logEmailSend({
        userId,
        messageId: result.MessageId,
        to: Array.isArray(to) ? to : [to],
        subject,
        tier: emailConfig.tier
      });

      return {
        success: true,
        messageId: result.MessageId,
        service: 'ses',
        tier: emailConfig.tier,
        quotaRemaining: quota.remaining,
        cost: this.calculateCost(1)
      };
    } catch (error) {
      logger.error('SES send error:', error);
      throw error;
    }
  }

  async sendBulkEmail(options) {
    const {
      userId,
      from,
      recipients, // Array of { email, data } objects
      subject,
      template,
      defaultData = {}
    } = options;

    if (!userId) {
      throw new Error('userId is required');
    }

    try {
      const emailConfig = await this.getUserEmailConfig(userId);

      // Only RepX4+ can send bulk emails
      if (emailConfig.tier !== 'repx4' && emailConfig.tier !== 'repx5') {
        throw new Error('Bulk email requires RepX4 or higher subscription');
      }

      // Process in batches of 50 (SES limit)
      const batchSize = 50;
      const results = [];
      
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        // Create bulk template data
        const destinations = batch.map(recipient => ({
          Destination: {
            ToAddresses: [recipient.email]
          },
          ReplacementTemplateData: JSON.stringify({
            ...defaultData,
            ...recipient.data
          })
        }));

        const params = {
          Source: from || process.env.SES_FROM_EMAIL,
          Template: template,
          DefaultTemplateData: JSON.stringify(defaultData),
          Destinations: destinations,
          Tags: [
            { Name: 'userId', Value: userId },
            { Name: 'tier', Value: emailConfig.tier },
            { Name: 'type', Value: 'bulk' }
          ]
        };

        try {
          const result = await ses.sendBulkTemplatedEmail(params).promise();
          results.push(...result.Status);
        } catch (error) {
          logger.error(`Bulk email batch error (${i}-${i + batchSize}):`, error);
        }
      }

      const successful = results.filter(r => r.Status === 'Success').length;
      const failed = results.filter(r => r.Status !== 'Success').length;

      return {
        success: true,
        sent: successful,
        failed,
        total: recipients.length,
        service: 'ses',
        tier: emailConfig.tier,
        cost: this.calculateCost(successful)
      };
    } catch (error) {
      logger.error('SES bulk send error:', error);
      throw error;
    }
  }

  async createEmailTemplate(options) {
    const { name, subject, html, text } = options;

    try {
      const params = {
        Template: {
          TemplateName: name,
          SubjectPart: subject,
          HtmlPart: html,
          TextPart: text || this.htmlToText(html)
        }
      };

      await ses.createTemplate(params).promise();

      return {
        success: true,
        templateName: name
      };
    } catch (error) {
      if (error.code === 'AlreadyExists') {
        // Update existing template
        await ses.updateTemplate(params).promise();
        return {
          success: true,
          templateName: name,
          updated: true
        };
      }
      throw error;
    }
  }

  async getEmailStats(userId) {
    try {
      const emailConfig = await this.getUserEmailConfig(userId);
      
      // Get current month usage
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: usage } = await supabase
        .from('user_email_usage')
        .select('emails_sent')
        .eq('user_id', userId)
        .eq('month', monthStart.toISOString().slice(0, 7))
        .single();

      const sent = usage?.emails_sent || 0;
      const limit = emailConfig.emailLimit;
      const remaining = limit ? limit - sent : null;

      // Get sending statistics from SES
      const sesStats = await ses.getSendStatistics().promise();
      const latestDatapoint = sesStats.SendDataPoints[sesStats.SendDataPoints.length - 1] || {};

      return {
        tier: emailConfig.tier,
        monthlyLimit: limit,
        sent: sent,
        remaining: remaining,
        percentUsed: limit ? (sent / limit * 100).toFixed(1) : 0,
        costThisMonth: this.calculateCost(sent),
        sesStats: {
          bounceRate: latestDatapoint.Bounces || 0,
          complaintRate: latestDatapoint.Complaints || 0,
          deliveryRate: latestDatapoint.DeliveryAttempts ? 
            ((latestDatapoint.DeliveryAttempts - latestDatapoint.Bounces) / latestDatapoint.DeliveryAttempts * 100).toFixed(1) : 100
        }
      };
    } catch (error) {
      logger.error('Error getting email stats:', error);
      throw error;
    }
  }

  async logEmailSend(data) {
    try {
      await supabase
        .from('email_send_logs')
        .insert({
          user_id: data.userId,
          message_id: data.messageId,
          recipients: data.to,
          subject: data.subject,
          tier: data.tier,
          service: 'ses',
          sent_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Error logging email send:', error);
    }
  }

  calculateCost(emailCount) {
    // SES pricing: $0.10 per 1000 emails
    const cost = (emailCount / 1000) * 0.10;
    return `$${cost.toFixed(4)}`;
  }

  htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  // SES Configuration Helpers
  async verifyEmailAddress(email) {
    try {
      await ses.verifyEmailIdentity({ EmailAddress: email }).promise();
      return {
        success: true,
        message: `Verification email sent to ${email}`
      };
    } catch (error) {
      logger.error('Error verifying email:', error);
      throw error;
    }
  }

  async verifyDomain(domain) {
    try {
      const result = await ses.verifyDomainIdentity({ Domain: domain }).promise();
      return {
        success: true,
        verificationToken: result.VerificationToken,
        dnsRecord: {
          type: 'TXT',
          name: `_amazonses.${domain}`,
          value: result.VerificationToken
        }
      };
    } catch (error) {
      logger.error('Error verifying domain:', error);
      throw error;
    }
  }

  async getSandboxStatus() {
    try {
      const { Attributes } = await ses.getAccountSendingEnabled().promise();
      return {
        inSandbox: !Attributes?.SendingEnabled,
        verified: this.verifiedEmails
      };
    } catch (error) {
      logger.error('Error getting sandbox status:', error);
      return {
        inSandbox: true,
        verified: []
      };
    }
  }
}

export default new SESEmailService();