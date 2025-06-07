/**
 * Test script for Canvas research routes
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testResearch() {
  console.log('🧪 Testing Canvas Research Routes...\n');

  // Test health check
  try {
    const health = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health check:', health.data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }

  // Test research job
  const testDoctor = {
    displayName: 'Gregory White',
    npi: '1234567890',
    specialty: 'Dentistry',
    city: 'Williamsville',
    state: 'NY',
    organizationName: 'White Dental Practice'
  };

  try {
    console.log('\n📊 Starting research for:', testDoctor.displayName);
    
    // Start research job
    const startResponse = await axios.post(`${BASE_URL}/api/research/start`, {
      doctor: testDoctor,
      product: 'yomi',
      userId: 'test-user-123'
    });

    const { jobId } = startResponse.data;
    console.log('✅ Job started:', jobId);

    // Poll for status
    let complete = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!complete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await axios.get(`${BASE_URL}/api/research/${jobId}/status`);
      const status = statusResponse.data;
      
      console.log(`📍 Progress: ${status.progress}% - ${status.stage} - ${status.message}`);
      
      if (status.status === 'completed') {
        complete = true;
        console.log('\n✅ Research completed!');
        console.log('📊 Confidence Score:', status.data.confidence.score + '%');
        console.log('📍 Sources found:', status.data.sources.length);
        console.log('🎯 Buying signals:', status.data.synthesis?.buyingSignals?.length || 0);
        console.log('\n📋 Executive Summary:');
        console.log(status.data.synthesis?.executiveSummary || 'No summary generated');
      } else if (status.status === 'failed') {
        console.error('❌ Research failed:', status.error);
        break;
      }
      
      attempts++;
    }

    if (!complete) {
      console.error('❌ Research timed out');
    }

  } catch (error) {
    console.error('❌ Research test failed:', error.response?.data || error.message);
  }
}

// Run the test
testResearch().catch(console.error);