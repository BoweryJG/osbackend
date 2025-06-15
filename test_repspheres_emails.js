import { sendEmail } from './services/emailService.js';
import { repspheresEmails } from './services/repspheresEmails.js';

async function testRepSpheresEmails() {
  console.log('🚀 Testing RepSpheres Email System\n');

  try {
    // Test 1: Send as CEO
    console.log('1️⃣ Sending as CEO...');
    await sendEmail({
      from: repspheresEmails.getFromAddress('jgolden'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: CEO Email from RepSpheres',
      html: `
        <h2>CEO Communication Test</h2>
        <p>This email is sent from jason@repspheres.com</p>
        ${repspheresEmails.getSignature('jgolden')}
      `
    });
    console.log('✅ CEO email sent!\n');

    // Test 2: Send as Sarah (Customer Success)
    console.log('2️⃣ Sending as Sarah from Customer Success...');
    await sendEmail({
      from: repspheresEmails.getFromAddress('sarah'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: Customer Success Follow-up',
      html: `
        <h2>Customer Success Test</h2>
        <p>Hi! This is Sarah from the Customer Success team.</p>
        <p>Just checking in to see how your Canvas implementation is going!</p>
        ${repspheresEmails.getSignature('sarah')}
      `
    });
    console.log('✅ Customer Success email sent!\n');

    // Test 3: Send as Support
    console.log('3️⃣ Sending as Support Team...');
    await sendEmail({
      from: repspheresEmails.getFromAddress('support'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: Support Ticket #1234',
      html: `
        <h2>Support Team Test</h2>
        <p>Your support ticket has been received.</p>
        <p>We'll get back to you within 24 hours.</p>
        ${repspheresEmails.getSignature('support')}
      `
    });
    console.log('✅ Support email sent!\n');

    // Test 4: Send as Canvas Product
    console.log('4️⃣ Sending as Canvas Product Team...');
    await sendEmail({
      from: repspheresEmails.getFromAddress('canvas'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: New Canvas AI Features Released!',
      html: `
        <h2>Canvas Product Update</h2>
        <p>We've just released new AI-powered features in Canvas!</p>
        <ul>
          <li>Enhanced doctor profiling with 95% accuracy</li>
          <li>Competitor analysis dashboard</li>
          <li>AI conversation prep for sales calls</li>
        </ul>
        ${repspheresEmails.getSignature('canvas')}
      `
    });
    console.log('✅ Canvas product email sent!\n');

    // Show all available aliases
    console.log('📧 All Available RepSpheres Email Aliases:');
    console.log('==========================================');
    Object.entries(repspheresEmails.addresses).forEach(([key, addr]) => {
      console.log(`${key.padEnd(15)} → ${addr.email.padEnd(35)} (${addr.name})`);
    });

    console.log('\n✨ All tests complete! Check your inbox.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
testEmailService();