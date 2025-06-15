import express from 'express';
import { 
  sendEmail, 
  sendAsClient, 
  createCampaign, 
  getEmailStats 
} from '../services/emailService.js';

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
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
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, and html or text' 
      });
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

    res.json(result);
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: error.message });
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
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    const result = await sendAsClient(
      clientEmail,
      clientName,
      recipientEmail,
      subject,
      body
    );

    res.json(result);
  } catch (error) {
    console.error('Send as client error:', error);
    res.status(500).json({ error: error.message });
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
      return res.status(400).json({ 
        error: 'Missing required fields for campaign' 
      });
    }

    const campaign = await createCampaign({
      name,
      recipients,
      subject,
      htmlTemplate,
      schedule,
      userId: req.session.user.id
    });

    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    console.error('Campaign creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send bulk emails with delay
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const { emails, delayBetween = 5000 } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ 
        error: 'emails must be an array with at least one email' 
      });
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

    res.json({
      total: emails.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get email statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await getEmailStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
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

    res.json({
      success: true,
      message: 'Test email sent successfully',
      ...result
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;