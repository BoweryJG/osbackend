import express from 'express';
import { authenticateToken, requireTier } from '../middleware/unifiedAuth.js';
import repxEmailService from '../services/repxEmailService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Send email with RepX tier-based limits
router.post('/send', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { to, subject, html, text, replyTo, attachments } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        error: 'Missing required fields: to, subject, and either html or text'
      });
    }

    const result = await repxEmailService.sendEmail({
      userId,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Email send error:', error);
    res.status(400).json({
      error: error.message || 'Failed to send email'
    });
  }
});

// Send bulk emails (RepX4+ only)
router.post('/send-bulk', authenticateToken, requireTier('repx4'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipients, subject, html, text, replyTo } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'Recipients array is required'
      });
    }

    // Check if user has unlimited email (RepX4+)
    const emailConfig = await repxEmailService.getUserEmailConfig(userId);
    if (!emailConfig.useVultr) {
      return res.status(403).json({
        error: 'Bulk email requires RepX4 or higher subscription',
        currentTier: emailConfig.tier
      });
    }

    // Send emails in batches
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(recipient => 
          repxEmailService.sendEmail({
            userId,
            to: recipient.email || recipient,
            subject,
            html: html.replace(/\{\{name\}\}/g, recipient.name || ''),
            text: text?.replace(/\{\{name\}\}/g, recipient.name || ''),
            replyTo
          })
        )
      );
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      sent: successful,
      failed,
      total: recipients.length,
      tier: emailConfig.tier
    });
  } catch (error) {
    logger.error('Bulk email error:', error);
    res.status(400).json({
      error: error.message || 'Failed to send bulk emails'
    });
  }
});

// Get email usage stats
router.get('/stats', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await repxEmailService.getEmailStats(userId);

    if (!stats) {
      return res.status(500).json({
        error: 'Failed to retrieve email statistics'
      });
    }

    res.json(stats);
  } catch (error) {
    logger.error('Email stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve email statistics'
    });
  }
});

// Check email quota
router.get('/quota', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const emailConfig = await repxEmailService.getUserEmailConfig(userId);
    
    if (emailConfig.tier === 'repx0') {
      return res.json({
        allowed: false,
        message: 'Email access requires RepX1 or higher subscription',
        tier: 'repx0'
      });
    }

    const quota = await repxEmailService.checkEmailQuota(userId, emailConfig);

    res.json({
      tier: emailConfig.tier,
      unlimited: emailConfig.useVultr,
      ...quota
    });
  } catch (error) {
    logger.error('Email quota error:', error);
    res.status(500).json({
      error: 'Failed to check email quota'
    });
  }
});

// Test SMTP connection (admin only)
router.get('/test-smtp', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.email !== 'admin@repspheres.com') {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    const vultrStatus = repxEmailService.vultrTransporter ? 
      await repxEmailService.vultrTransporter.verify() : false;
    
    const sendgridStatus = !!repxEmailService.sendgridClient;

    res.json({
      vultr: {
        configured: !!repxEmailService.vultrTransporter,
        connected: vultrStatus,
        host: process.env.VULTR_SMTP_HOST
      },
      sendgrid: {
        configured: sendgridStatus,
        from: process.env.SENDGRID_FROM_EMAIL
      }
    });
  } catch (error) {
    logger.error('SMTP test error:', error);
    res.status(500).json({
      error: 'Failed to test SMTP connections'
    });
  }
});

export default router;