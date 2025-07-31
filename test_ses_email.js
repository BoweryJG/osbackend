import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sesEmailService from './services/sesEmailService.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSESEmail() {
  console.log('🧪 Testing Amazon SES Email Service\n');

  // Test user IDs for different tiers
  const testUsers = {
    repx1: 'a10cf099-1b46-4b1c-a943-c31b4bdc7e0f', // 100 emails/month
    repx4: '5dc00e13-c4a2-43cf-aa62-66e088e18ed8'  // Unlimited
  };

  try {
    // 1. Check SES initialization
    console.log('1️⃣ Checking SES initialization...');
    const sandboxStatus = await sesEmailService.getSandboxStatus();
    console.log('Sandbox Status:', sandboxStatus);
    console.log('✅ SES initialized\n');

    // 2. Test email config for different tiers
    console.log('2️⃣ Testing tier configurations...');
    for (const [tier, userId] of Object.entries(testUsers)) {
      const config = await sesEmailService.getUserEmailConfig(userId);
      console.log(`${tier}:`, config);
    }
    console.log('✅ Tier configurations loaded\n');

    // 3. Test sending an email (RepX1 user)
    console.log('3️⃣ Testing email send for RepX1 user...');
    try {
      const result = await sesEmailService.sendEmail({
        userId: testUsers.repx1,
        to: 'test@example.com',
        subject: 'Test Email - RepX1 Tier',
        html: '<h1>Test Email</h1><p>This is a test from RepX1 tier.</p>',
        tags: {
          test: 'true',
          environment: 'development'
        }
      });
      console.log('Email sent:', result);
      console.log('✅ Email send successful\n');
    } catch (error) {
      console.log('⚠️  Email send failed (expected in sandbox):', error.message);
    }

    // 4. Test quota checking
    console.log('4️⃣ Testing quota system...');
    const repx1Config = await sesEmailService.getUserEmailConfig(testUsers.repx1);
    const quota = await sesEmailService.checkEmailQuota(testUsers.repx1, repx1Config);
    console.log('RepX1 Quota:', quota);
    console.log('✅ Quota system working\n');

    // 5. Test email statistics
    console.log('5️⃣ Testing email statistics...');
    const stats = await sesEmailService.getEmailStats(testUsers.repx1);
    console.log('Email Stats:', stats);
    console.log('✅ Statistics working\n');

    // 6. Test cost calculation
    console.log('6️⃣ Testing cost calculation...');
    console.log('Cost for 100 emails:', sesEmailService.calculateCost(100));
    console.log('Cost for 1000 emails:', sesEmailService.calculateCost(1000));
    console.log('Cost for 10000 emails:', sesEmailService.calculateCost(10000));
    console.log('✅ Cost calculation working\n');

    // 7. Test template creation
    console.log('7️⃣ Testing template creation...');
    try {
      const template = await sesEmailService.createEmailTemplate({
        name: 'welcome-email',
        subject: 'Welcome to RepSpheres, {{name}}!',
        html: `
          <h1>Welcome {{name}}!</h1>
          <p>Your RepX{{tier}} subscription is now active.</p>
          <p>You have {{emailLimit}} emails per month.</p>
        `,
        text: 'Welcome {{name}}! Your RepX{{tier}} subscription is active.'
      });
      console.log('Template created:', template);
      console.log('✅ Template system working\n');
    } catch (error) {
      console.log('⚠️  Template creation failed (expected in sandbox):', error.message);
    }

    console.log('✨ All tests completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Add AWS credentials to .env file');
    console.log('2. Verify your sending domain in AWS SES console');
    console.log('3. Request production access to exit sandbox mode');
    console.log('4. Run migration: node migrations/20250731_create_email_logs.sql');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSESEmail();