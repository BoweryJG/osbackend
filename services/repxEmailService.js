import { createTransport } from 'nodemailer';
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

class RepXEmailService {
  constructor() {
    this.vultrTransporter = null;
    this.sendgridTransporter = null;
    this.initializeTransporters();
  }

  initializeTransporters() {
    // Initialize Vultr SMTP for RepX4+ unlimited sending
    if (process.env.VULTR_SMTP_HOST && process.env.VULTR_SMTP_USER && process.env.VULTR_SMTP_PASS) {
      try {
        this.vultrTransporter = createTransport({
          host: process.env.VULTR_SMTP_HOST,
          port: parseInt(process.env.VULTR_SMTP_PORT || '587'),
          secure: process.env.VULTR_SMTP_PORT === '465', // true for 465, false for 587
          auth: {
            user: process.env.VULTR_SMTP_USER,
            pass: process.env.VULTR_SMTP_PASS
          },
          tls: {
            rejectUnauthorized: true
          }
        });
        logger.info('✅ Vultr SMTP initialized for RepX4+ unlimited email');
      } catch (error) {
        logger.error('Failed to initialize Vultr SMTP:', error);
      }
    }

    // Initialize SendGrid as fallback for lower tiers
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.sendgridClient = sgMail;
        logger.info('✅ SendGrid initialized for RepX1-3 email limits');
      } catch (error) {
        logger.error('Failed to initialize SendGrid:', error);
      }
    }
  }

  async getUserEmailConfig(userId) {
    try {
      // Get user's subscription tier
      const { data: sub, error: subError } = await supabase
        .from('user_subscriptions')
        .select('subscription_tier')
        .eq('user_id', userId)
        .single();

      if (subError || !sub) {
        return {
          tier: 'repx0',
          emailLimit: 0,
          useVultr: false
        };
      }

      const tier = sub.subscription_tier || 'repx0';
      
      // RepX tier email limits
      const emailLimits = {
        repx0: 0,        // No email access
        repx1: 100,      // 100 emails/month via SendGrid
        repx2: 500,      // 500 emails/month via SendGrid
        repx3: 2000,     // 2000 emails/month via SendGrid
        repx4: null,     // Unlimited via Vultr SMTP
        repx5: null      // Unlimited via Vultr SMTP
      };

      return {
        tier,
        emailLimit: emailLimits[tier],
        useVultr: tier === 'repx4' || tier === 'repx5'
      };
    } catch (error) {
      logger.error('Error getting user email config:', error);
      return {
        tier: 'repx0',
        emailLimit: 0,
        useVultr: false
      };
    }
  }

  async trackEmailUsage(userId, count = 1) {
    try {
      // Track monthly email usage for RepX1-3 tiers
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Upsert usage record
      const { error } = await supabase
        .from('user_email_usage')
        .upsert({
          user_id: userId,
          month: monthStart.toISOString().slice(0, 7), // YYYY-MM format
          emails_sent: count,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,month',
          ignoreDuplicates: false,
          count: 'exact'
        });

      if (error) {
        // If upsert fails, try incrementing existing record
        await supabase.rpc('increment_email_usage', {
          p_user_id: userId,
          p_month: monthStart.toISOString().slice(0, 7),
          p_count: count
        });
      }
    } catch (error) {
      logger.error('Error tracking email usage:', error);
    }
  }

  async checkEmailQuota(userId, emailConfig) {
    // RepX4+ have unlimited email
    if (emailConfig.useVultr) {
      return { allowed: true, remaining: null };
    }

    // Check usage for limited tiers
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

  async sendEmail(options) {
    const {
      userId,
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      headers = {},
      attachments = []
    } = options;

    if (!userId) {
      throw new Error('userId is required for RepX email service');
    }

    try {
      // Get user's email configuration
      const emailConfig = await this.getUserEmailConfig(userId);

      // Check if user has email access
      if (emailConfig.tier === 'repx0') {
        throw new Error('Email access requires RepX1 or higher subscription');
      }

      // Check quota for limited tiers
      const quota = await this.checkEmailQuota(userId, emailConfig);
      if (!quota.allowed) {
        throw new Error(`Monthly email limit reached (${emailConfig.emailLimit} emails/month). Upgrade to RepX4 for unlimited emails.`);
      }

      // Send via appropriate service
      let result;
      if (emailConfig.useVultr && this.vultrTransporter) {
        // RepX4+ use Vultr SMTP
        result = await this.sendViaVultr(options);
      } else if (this.sendgridClient) {
        // RepX1-3 use SendGrid
        result = await this.sendViaSendGrid(options);
      } else {
        throw new Error('No email service configured');
      }

      // Track usage for limited tiers
      if (!emailConfig.useVultr) {
        await this.trackEmailUsage(userId);
      }

      return {
        success: true,
        messageId: result.messageId,
        service: emailConfig.useVultr ? 'vultr' : 'sendgrid',
        tier: emailConfig.tier,
        quotaRemaining: quota.remaining
      };
    } catch (error) {
      logger.error('Email send error:', error);
      throw error;
    }
  }

  async sendViaVultr(options) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      headers,
      attachments
    } = options;

    const mailOptions = {
      from: from || `"RepSpheres" <${process.env.VULTR_SMTP_FROM || 'noreply@repspheres.com'}>`,
      to,
      subject,
      html,
      text: text || this.htmlToText(html),
      replyTo: replyTo || process.env.VULTR_SMTP_FROM,
      headers,
      attachments
    };

    const result = await this.vultrTransporter.sendMail(mailOptions);
    logger.info(`✅ Email sent via Vultr SMTP: ${result.messageId}`);
    return result;
  }

  async sendViaSendGrid(options) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments
    } = options;

    const msg = {
      to,
      from: from || process.env.SENDGRID_FROM_EMAIL || 'noreply@repspheres.com',
      subject,
      text: text || this.htmlToText(html),
      html,
      replyTo: replyTo || process.env.SENDGRID_FROM_EMAIL,
      attachments: attachments?.map(att => ({
        content: att.content,
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment'
      }))
    };

    const [result] = await this.sendgridClient.send(msg);
    logger.info(`✅ Email sent via SendGrid: ${result.headers['x-message-id']}`);
    return { messageId: result.headers['x-message-id'] };
  }

  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async getEmailStats(userId) {
    try {
      const emailConfig = await this.getUserEmailConfig(userId);
      const quota = await this.checkEmailQuota(userId, emailConfig);

      return {
        tier: emailConfig.tier,
        service: emailConfig.useVultr ? 'Vultr SMTP (Unlimited)' : 'SendGrid',
        limit: emailConfig.emailLimit,
        sent: quota.sent || 0,
        remaining: quota.remaining,
        unlimited: emailConfig.useVultr
      };
    } catch (error) {
      logger.error('Error getting email stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export default new RepXEmailService();