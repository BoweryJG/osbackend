import express from 'express';
import { authenticateToken, requireTier } from '../middleware/auth.js';
import sesEmailService from '../services/sesEmailService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Send email with RepX tier-based limits
router.post('/send', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await sesEmailService.sendEmail({
      userId,
      ...req.body
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Email send error:', error);
    res.status(400).json({
      error: error.message,
      code: error.code
    });
  }
});

// Send bulk email (RepX4+ only)
router.post('/send-bulk', authenticateToken, requireTier('repx4'), async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await sesEmailService.sendBulkEmail({
      userId,
      ...req.body
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Bulk email error:', error);
    res.status(400).json({
      error: error.message,
      code: error.code
    });
  }
});

// Create email template
router.post('/templates', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const result = await sesEmailService.createEmailTemplate(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Template creation error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

// Get email statistics
router.get('/stats', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await sesEmailService.getEmailStats(userId);
    res.json(stats);
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to get email statistics'
    });
  }
});

// Get remaining quota
router.get('/quota', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const emailConfig = await sesEmailService.getUserEmailConfig(userId);
    const quota = await sesEmailService.checkEmailQuota(userId, emailConfig);
    
    res.json({
      tier: emailConfig.tier,
      limit: emailConfig.emailLimit,
      ...quota
    });
  } catch (error) {
    logger.error('Quota check error:', error);
    res.status(500).json({
      error: 'Failed to check email quota'
    });
  }
});

// SES Setup Endpoints (Admin only)
router.post('/verify-email', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email } = req.body;
    const result = await sesEmailService.verifyEmailAddress(email);
    res.json(result);
  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

router.post('/verify-domain', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { domain } = req.body;
    const result = await sesEmailService.verifyDomain(domain);
    res.json(result);
  } catch (error) {
    logger.error('Domain verification error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

router.get('/sandbox-status', authenticateToken, async (req, res) => {
  try {
    const status = await sesEmailService.getSandboxStatus();
    res.json(status);
  } catch (error) {
    logger.error('Sandbox status error:', error);
    res.status(500).json({
      error: 'Failed to get sandbox status'
    });
  }
});

// Test email endpoint
router.post('/test', authenticateToken, requireTier('repx2'), async (req, res) => {
  try {
    const userId = req.user.id;
    const testEmail = req.user.email;
    
    const result = await sesEmailService.sendEmail({
      userId,
      to: testEmail,
      subject: 'RepSpheres Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Service Test</h2>
          <p>This is a test email from your RepSpheres account.</p>
          <p>Your current tier: <strong>${result.tier}</strong></p>
          <p>If you received this email, your email service is working correctly!</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Sent via Amazon SES | Cost: ${result.cost}
          </p>
        </div>
      `,
      tags: {
        type: 'test'
      }
    });
    
    res.json({
      success: true,
      message: `Test email sent to ${testEmail}`,
      ...result
    });
  } catch (error) {
    logger.error('Test email error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

export default router;