import express from 'express';

import { 
  sendEmail, 
  sendAsClient, 
  createCampaign, 
  getEmailStats 
} from '../services/emailService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session?.user?.id) {
    return res.status(401).json(errorResponse('NOT_AUTHENTICATED', 'Authentication required', null, 401));
  }
  next();
};

// Send single email
router.post('/send', requireAuth, async (req, res) => {
  try {
    const {
      to,
      subject,
      html,
      text,
      from,
      replyTo,
      attachments
    } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Missing required fields: to, subject, and html or text', null, 400));
    }

    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      from,
      replyTo,
      attachments,
      userId: req.session.user.id
    });

    res.json(successResponse(result, 'Email sent successfully'));
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json(errorResponse('EMAIL_SEND_ERROR', 'Failed to send email', error.message, 500));
  }
});

// Send as client
router.post('/send-as-client', requireAuth, async (req, res) => {
  try {
    const {
      clientEmail,
      clientName,
      recipientEmail,
      subject,
      body
    } = req.body;

    if (!clientEmail || !clientName || !recipientEmail || !subject || !body) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Missing required fields: clientEmail, clientName, recipientEmail, subject, body', null, 400));
    }

    const result = await sendAsClient(
      clientEmail,
      clientName,
      recipientEmail,
      subject,
      body
    );

    res.json(successResponse(result, 'Email sent as client successfully'));
  } catch (error) {
    console.error('Send as client error:', error);
    res.status(500).json(errorResponse('CLIENT_EMAIL_ERROR', 'Failed to send email as client', error.message, 500));
  }
});

// Create email campaign
router.post('/campaign', requireAuth, async (req, res) => {
  try {
    const {
      name,
      recipients,
      subject,
      htmlTemplate,
      schedule
    } = req.body;

    if (!name || !recipients || !subject || !htmlTemplate || !schedule) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Missing required fields: name, recipients, subject, htmlTemplate, schedule', null, 400));
    }

    const campaign = await createCampaign({
      name,
      recipients,
      subject,
      htmlTemplate,
      schedule,
      userId: req.session.user.id
    });

    res.json(successResponse({ campaign }, 'Email campaign created successfully'));
  } catch (error) {
    console.error('Campaign creation error:', error);
    res.status(500).json(errorResponse('CAMPAIGN_ERROR', 'Failed to create email campaign', error.message, 500));
  }
});

// Send bulk emails with delay
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const { emails, delayBetween = 5000 } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json(errorResponse('INVALID_INPUT', 'emails must be an array with at least one email', null, 400));
    }

    const results = [];
    
    for (const email of emails) {
      try {
        const result = await sendEmail({
          ...email,
          userId: req.session.user.id
        });
        results.push({ success: true, ...result });
        
        // Delay between sends
        if (delayBetween > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      } catch (error) {
        results.push({ 
          success: false, 
          error: error.message,
          to: email.to 
        });
      }
    }

    res.json(successResponse({
      total: emails.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }, 'Bulk email send completed'));
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json(errorResponse('BULK_SEND_ERROR', 'Failed to send bulk emails', error.message, 500));
  }
});

// Get email statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await getEmailStats();
    res.json(successResponse(stats));
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json(errorResponse('STATS_ERROR', 'Failed to get email statistics', error.message, 500));
  }
});

// Test email configuration
router.post('/test', requireAuth, async (req, res) => {
  try {
    const testEmail = req.body.email || req.session.user.email;
    
    const result = await sendEmail({
      to: testEmail,
      subject: 'RepSpheres Email Test',
      html: `
        <h1>Email Configuration Test</h1>
        <p>This is a test email from your RepSpheres backend.</p>
        <p>If you received this, your email service is working correctly!</p>
        <hr>
        <p><small>Sent at: ${new Date().toISOString()}</small></p>
      `,
      userId: req.session.user.id
    });

    res.json(successResponse({
      message: 'Test email sent successfully',
      ...result
    }, 'Test email sent successfully'));
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json(errorResponse('TEST_EMAIL_ERROR', 'Failed to send test email', error.message, 500));
  }
});

// Gmail sync endpoint
router.post('/sync', async (req, res) => {
  try {
    const { userId, accountEmail } = req.body;
    
    if (!userId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'userId is required', null, 400));
    }

    // Import Gmail sync service
    const { syncGmailEmails } = await import('../services/gmailSyncService.js');
    
    const result = await syncGmailEmails(userId, accountEmail);
    
    res.json(successResponse({
      syncedCount: result.syncedCount || 0,
      message: `Successfully synced ${result.syncedCount || 0} emails`
    }, `Successfully synced ${result.syncedCount || 0} emails`));
  } catch (error) {
    console.error('Gmail sync error:', error);
    res.status(500).json(errorResponse('SYNC_ERROR', 'Failed to sync Gmail emails', error.message, 500));
  }
});

export default router;