import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function testHealthEndpoint() {
  try {
    console.log('Testing health endpoint...');
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testSearchEndpoint() {
  try {
    console.log('\nTesting search endpoint...');
    const response = await axios.get(`${BASE_URL}/api/search/brave`, {
      params: { query: 'digital dentistry trends 2025', limit: 5 }
    });
    console.log('✅ Search endpoint passed');
    console.log('Results count:', response.data.web?.results?.length || 0);
    if (response.data.web?.results?.length > 0) {
      console.log('First result:', {
        title: response.data.web.results[0].title,
        url: response.data.web.results[0].url
      });
    }
    return true;
  } catch (error) {
    console.error('❌ Search endpoint failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return false;
  }
}

async function testNewsEndpoint() {
  try {
    console.log('\nTesting news endpoint...');
    const response = await axios.get(`${BASE_URL}/api/news/brave`, {
      params: { query: 'dental technology', limit: 3 }
    });
    console.log('✅ News endpoint passed');
    console.log('News results count:', response.data.news?.results?.length || 0);
    if (response.data.news?.results?.length > 0) {
      console.log('First news result:', {
        title: response.data.news.results[0].title,
        source: response.data.news.results[0].source
      });
    }
    return true;
  } catch (error) {
    console.error('❌ News endpoint failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return false;
  }
}

async function testCorsHeaders() {
  try {
    console.log('\nTesting CORS headers...');
    const response = await axios.get(`${BASE_URL}/health`, {
      headers: {
        'Origin': 'https://marketdata.repspheres.com'
      }
    });
    
    const corsHeader = response.headers['access-control-allow-origin'];
    if (corsHeader) {
      console.log('✅ CORS headers present:', corsHeader);
      return true;
    } else {
      console.log('⚠️ CORS headers not found in response');
      return false;
    }
  } catch (error) {
    console.error('❌ CORS test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting News Proxy Service Tests\n');
  console.log('Make sure the news proxy server is running on port 3001');
  console.log('You can start it with: node news-proxy-server.js\n');
  
  const results = [];
  
  results.push(await testHealthEndpoint());
  results.push(await testCorsHeaders());
  results.push(await testSearchEndpoint());
  results.push(await testNewsEndpoint());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! The news proxy service is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Check the error messages above.');
  }
  
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.log('\n⚠️ Note: BRAVE_SEARCH_API_KEY is not set. Search tests may fail.');
  }
}

runAllTests().catch(console.error);
