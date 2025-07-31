import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import repxEmailService from './services/repxEmailService.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRepXEmail() {
  console.log('🧪 Testing RepX Email Service\n');

  // Test user IDs (you'll need to replace with actual user IDs from your database)
  const testUsers = {
    repx0: 'user-id-with-repx0', // Replace with actual user ID
    repx1: 'user-id-with-repx1', // Replace with actual user ID
    repx4: 'user-id-with-repx4'  // Replace with actual user ID
  };

  // Get a real user for testing
  const { data: users, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, subscription_tier')
    .in('subscription_tier', ['repx0', 'repx1', 'repx4'])
    .limit(3);

  if (error) {
    console.error('Error fetching test users:', error);
    return;
  }

  console.log('Found test users:', users);

  // Test 1: Check email configuration for different tiers
  console.log('\n📧 Test 1: Email Configuration by Tier');
  for (const user of users) {
    const config = await repxEmailService.getUserEmailConfig(user.user_id);
    console.log(`${config.tier}: Limit=${config.emailLimit}, Vultr=${config.useVultr}`);
  }

  // Test 2: Check email quota
  console.log('\n📊 Test 2: Email Quota Check');
  for (const user of users) {
    const config = await repxEmailService.getUserEmailConfig(user.user_id);
    const quota = await repxEmailService.checkEmailQuota(user.user_id, config);
    console.log(`${config.tier}: ${quota.allowed ? 'Allowed' : 'Blocked'}, Remaining=${quota.remaining}`);
  }

  // Test 3: Verify SMTP connections
  console.log('\n🔌 Test 3: SMTP Connection Status');
  console.log('Vultr SMTP configured:', !!repxEmailService.vultrTransporter);
  console.log('SendGrid configured:', !!repxEmailService.sendgridClient);
  
  if (repxEmailService.vultrTransporter) {
    try {
      await repxEmailService.vultrTransporter.verify();
      console.log('✅ Vultr SMTP connection verified');
    } catch (error) {
      console.log('❌ Vultr SMTP connection failed:', error.message);
    }
  }

  // Test 4: Simulate sending email (dry run)
  console.log('\n📨 Test 4: Email Send Simulation');
  const testEmail = {
    to: 'test@example.com',
    subject: 'RepX Email Test',
    html: '<h1>Test Email</h1><p>This is a test of the RepX email system.</p>',
    text: 'Test Email - This is a test of the RepX email system.'
  };

  // Find a user with email access for testing
  const userWithEmail = users.find(u => u.subscription_tier !== 'repx0');
  if (userWithEmail) {
    try {
      console.log(`Simulating email send for ${userWithEmail.subscription_tier} user...`);
      const config = await repxEmailService.getUserEmailConfig(userWithEmail.user_id);
      const quota = await repxEmailService.checkEmailQuota(userWithEmail.user_id, config);
      
      if (quota.allowed) {
        console.log(`✅ Email would be sent via ${config.useVultr ? 'Vultr SMTP' : 'SendGrid'}`);
        console.log(`   Remaining quota: ${quota.remaining || 'Unlimited'}`);
      } else {
        console.log(`❌ Email blocked: quota exceeded`);
      }
    } catch (error) {
      console.error('Email simulation error:', error.message);
    }
  }

  // Test 5: Check email stats
  console.log('\n📈 Test 5: Email Statistics');
  for (const user of users) {
    const stats = await repxEmailService.getEmailStats(user.user_id);
    if (stats) {
      console.log(`${stats.tier}: ${stats.sent}/${stats.limit || '∞'} sent, Service: ${stats.service}`);
    }
  }

  console.log('\n✅ RepX Email Service tests complete!');
}

// Run tests
testRepXEmail().catch(console.error);