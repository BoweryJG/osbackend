import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Test the new Private Practice Intelligence endpoint
 */
async function testPrivatePracticeIntelligence() {
  console.log('🧠 Testing Private Practice Intelligence Factory...');
  
  try {
    // Testing with Dr. Scott O. Kissel (NYC Periodontist)
    const testDoctor = {
      npi: '1234567890', // placeholder
      displayName: 'Dr. Scott O. Kissel, DMD',
      firstName: 'Scott',
      lastName: 'Kissel',
      credential: 'DMD',
      specialty: 'Periodontist, Implant Dentistry',
      city: 'NEW YORK',
      state: 'NY',
      fullAddress: '501 MADISON AVE STE 2101, NEW YORK, NY 10022',
      phone: '212-702-9088',
      organizationName: 'NYC Periodontics and Implant Dentistry'
    };
    
    const testProduct = 'iTero Intraoral Scanner';
    
    console.log(`Testing intelligence for: ${testDoctor.displayName}`);
    console.log(`Product: ${testProduct}`);
    console.log(`Location: ${testDoctor.city}, ${testDoctor.state}`);
    
    const startTime = Date.now();
    
    // Call the new intelligence endpoint
    const response = await axios.post('http://localhost:3001/api/private-practice-intelligence', {
      doctor: testDoctor,
      product: testProduct,
      userId: 'test-user'
    }, {
      timeout: 60000 // 60 second timeout
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log('\n✅ Intelligence Generation Complete!');
    console.log(`⏱️  Total Processing Time: ${processingTime}ms (${(processingTime/1000).toFixed(1)}s)`);
    console.log(`🎯 Target: Under 60 seconds (${processingTime < 60000 ? 'PASS' : 'FAIL'})`);
    
    const intelligence = response.data;
    
    // Display results summary
    console.log('\n=== INTELLIGENCE SUMMARY ===');
    console.log(`Doctor: ${intelligence.doctorName}`);
    console.log(`NPI: ${intelligence.npi}`);
    console.log(`Processing Time: ${intelligence.processingTime}ms`);
    
    console.log('\n=== PRACTICE DATA ===');
    console.log(`Website Found: ${intelligence.summary.websiteFound ? 'YES' : 'NO'}`);
    console.log(`Private Practice: ${intelligence.summary.isPrivatePractice ? 'YES' : 'NO'}`);
    console.log(`Website URL: ${intelligence.practiceData.websiteUrl || 'Not found'}`);
    
    console.log('\n=== TECH STACK ===');
    console.log(`Equipment Count: ${intelligence.summary.techStackItems}`);
    console.log(`Equipment Found: ${intelligence.techStackData.equipment?.join(', ') || 'None'}`);
    
    console.log('\n=== SOCIAL MEDIA ===');
    console.log(`Instagram: ${intelligence.social?.instagram || 'Not found'}`);
    console.log(`Followers: ${intelligence.summary.instagramFollowers}`);
    console.log(`Recent Posts: ${intelligence.summary.recentPosts}`);
    
    console.log('\n=== SALES REP BRIEF (Preview) ===');
    console.log(intelligence.salesRepBrief.substring(0, 500) + '...');
    
    console.log('\n=== PERFORMANCE ANALYSIS ===');
    if (processingTime < 60000) {
      console.log('🎯 SUCCESS: Under 60 second target!');
    } else {
      console.log('⚠️  WARNING: Exceeded 60 second target');
    }
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('Full error:', error);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
    
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    
    return false;
  }
}

// Run the test
console.log('Starting Private Practice Intelligence test...');
testPrivatePracticeIntelligence().then(success => {
  if (success) {
    console.log('\n✅ Test completed successfully!');
  } else {
    console.error('\n❌ Test failed.');
    process.exit(1);
  }
});