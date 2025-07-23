import dotenv from 'dotenv';

import { sendEmail, getEmailStats } from './services/emailService.js';

dotenv.config();

console.log('Testing RepSpheres Email Service...\n');

// Test basic email send
async function testEmailService() {
  try {
    // Check if email credentials are configured
    if (!process.env.GMAIL_EMAIL_1 || process.env.GMAIL_EMAIL_1 === 'your-email-1@gmail.com') {
      console.log('⚠️  Email credentials not configured!');
      console.log('Please add your Gmail credentials to .env file:');
      console.log('1. Go to https://myaccount.google.com/apppasswords');
      console.log('2. Generate an app password');
      console.log('3. Update GMAIL_EMAIL_1 and GMAIL_APP_PASSWORD_1 in .env\n');
      return;
    }

    console.log('📧 Sending test email...');
    
    const result = await sendEmail({
      to: process.env.GMAIL_EMAIL_1, // Send to yourself
      subject: 'RepSpheres Email Service Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #00ff88;">RepSpheres Email Service</h1>
          <p>Your email service is working perfectly! 🎉</p>
          
          <h2>Features Available:</h2>
          <ul>
            <li>✅ Send unlimited emails</li>
            <li>✅ Multiple account rotation</li>
            <li>✅ Campaign scheduling</li>
            <li>✅ Send as client</li>
            <li>✅ Email templates</li>
            <li>✅ Bulk sending with delays</li>
          </ul>
          
          <h2>API Endpoints:</h2>
          <code style="background: #f4f4f4; padding: 10px; display: block;">
            POST /api/emails/send - Send single email<br>
            POST /api/emails/send-as-client - Send as your client<br>
            POST /api/emails/campaign - Create campaign<br>
            POST /api/emails/bulk - Send bulk emails<br>
            GET /api/emails/stats - Get statistics
          </code>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Sent at: ${new Date().toISOString()}<br>
            No monthly fees. Total control. Unlimited power.
          </p>
        </div>
      `
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('Sent from:', result.account);

    // Get stats
    const stats = await getEmailStats();
    console.log('\n📊 Email Service Stats:');
    console.log(JSON.stringify(stats, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check your Gmail credentials in .env');
    console.log('2. Make sure 2-factor authentication is enabled');
    console.log('3. Generate app-specific password');
    console.log('4. Check if "Less secure app access" is disabled (it should be)');
  }
}

// Run the test
testEmailService();