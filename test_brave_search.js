import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Test the Brave search endpoint directly
async function testBraveSearchDirect() {
  try {
    console.log('Testing Brave Search API directly...');
    
    if (!process.env.BRAVE_SEARCH_API_KEY) {
      console.error('BRAVE_SEARCH_API_KEY is not set in .env file');
      return;
    }
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: 'test query', count: 5 },
      headers: { 
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    console.log('Direct API Response Status:', response.status);
    console.log('Direct API Response Data (first result):', response.data.web.results[0]);
    console.log('Total results:', response.data.web.results.length);
    
    return response.data;
  } catch (error) {
    console.error('Error testing Brave Search API directly:', error);
    if (error.response) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Error status:', error.response.status);
    }
  }
}

// Test the local endpoint
async function testLocalEndpoint() {
  try {
    console.log('\nTesting local Brave Search endpoint...');
    
    const response = await axios.get('http://localhost:3000/api/search/brave', {
      params: { query: 'test query', limit: 5 }
    });
    
    console.log('Local Endpoint Response Status:', response.status);
    console.log('Local Endpoint Response Data (first result):', response.data.web.results[0]);
    console.log('Total results:', response.data.web.results.length);
    
    return response.data;
  } catch (error) {
    console.error('Error testing local Brave Search endpoint:', error);
    if (error.response) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Error status:', error.response.status);
    }
  }
}

// Test the news endpoint
async function testNewsEndpoint() {
  try {
    console.log('\nTesting local Brave News endpoint...');
    
    const response = await axios.get('http://localhost:3000/api/news/brave', {
      params: { query: 'latest technology', limit: 3 }
    });
    
    console.log('News Endpoint Response Status:', response.status);
    console.log('News Endpoint Response Data (first result):', response.data.news?.results[0]);
    console.log('Total news results:', response.data.news?.results.length);
    
    return response.data;
  } catch (error) {
    console.error('Error testing local Brave News endpoint:', error);
    if (error.response) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Error status:', error.response.status);
    }
  }
}

// Run the tests
async function runTests() {
  try {
    // Test direct API call first
    await testBraveSearchDirect();
    
    // Test local endpoints
    await testLocalEndpoint();
    await testNewsEndpoint();
    
    console.log('\nAll tests completed.');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

runTests();
