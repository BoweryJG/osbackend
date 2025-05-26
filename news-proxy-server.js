import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import NodeCache from 'node-cache';

// Load environment variables
dotenv.config();

// Initialize cache for API responses
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Create Express app
const app = express();

// Configure CORS to allow your frontend domains
app.use(cors({
  origin: [
    'https://marketdata.repspheres.com',
    'https://repspheres.netlify.app',
    'https://repspheres.com',
    'https://workspace.repspheres.com',
    'https://linguistics.repspheres.com',
    'https://crm.repspheres.com',
    'http://localhost:5176',
    'https://localhost:5176',
    'http://localhost:3000',
    'https://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add JSON parsing middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'RepSpheres News Proxy'
  });
});

// Brave Search API endpoint
app.get('/api/search/brave', async (req, res) => {
  try {
    const { query, q, limit = 20 } = req.query;
    const searchQuery = query || q || '';

    console.log(`Received search request: "${searchQuery}" with limit: ${limit}`);

    if (!searchQuery) {
      return res.status(400).json({ 
        error: 'Search query is required',
        message: 'Please provide a query parameter'
      });
    }

    // Check cache first
    const cacheKey = `brave-search-${searchQuery}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached data for:', searchQuery);
      return res.json(cachedData);
    }

    if (!process.env.BRAVE_SEARCH_API_KEY) {
      console.error('BRAVE_SEARCH_API_KEY not configured');
      return res.status(500).json({ 
        error: 'Brave Search API key not configured',
        message: 'The server is not properly configured to handle search requests'
      });
    }

    console.log('Making request to Brave Search API...');
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { 
        q: searchQuery, 
        count: Math.min(parseInt(limit), 50) // Limit to max 50 results
      },
      headers: { 
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log(`Successfully fetched ${response.data.web?.results?.length || 0} results`);

    // Cache the successful response
    cache.set(cacheKey, response.data);
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Brave search results:', error.message);
    
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
      
      // Handle specific error codes
      if (error.response.status === 401) {
        return res.status(500).json({ 
          error: 'API authentication failed',
          message: 'Invalid or expired API key'
        });
      } else if (error.response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.'
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch search results',
      message: 'An error occurred while processing your search request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// News-specific endpoint (filters for news results)
app.get('/api/news/brave', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ 
        error: 'Search query is required',
        message: 'Please provide a query parameter'
      });
    }

    // Check cache first
    const cacheKey = `brave-news-${query}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    if (!process.env.BRAVE_SEARCH_API_KEY) {
      return res.status(500).json({ 
        error: 'Brave Search API key not configured'
      });
    }

    // Search with news-focused query
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { 
        q: `${query} news`, 
        count: Math.min(parseInt(limit) * 2, 40), // Get more results to filter
        search_lang: 'en'
      },
      headers: { 
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    // Format and filter for news results
    const formattedResponse = {
      query: response.data.query,
      news: {
        results: response.data.web.results
          .filter(result => 
            result.subtype === 'news' || 
            result.url.includes('/news/') || 
            result.title.toLowerCase().includes('news') ||
            result.description.toLowerCase().includes('news')
          )
          .slice(0, parseInt(limit))
          .map(result => ({
            title: result.title,
            url: result.url,
            description: result.description,
            source: result.profile?.name || 'Unknown Source',
            published_date: result.age || 'Unknown Date',
            thumbnail: result.thumbnail?.src
          }))
      }
    };

    cache.set(cacheKey, formattedResponse);
    
    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching Brave news:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch news results',
      message: 'An error occurred while processing your news request'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`News Proxy Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Brave Search API configured: ${!!process.env.BRAVE_SEARCH_API_KEY}`);
  console.log('Available endpoints:');
  console.log(`  GET /health - Health check`);
  console.log(`  GET /api/search/brave?query=<search_term>&limit=<number> - Web search`);
  console.log(`  GET /api/news/brave?query=<search_term>&limit=<number> - News search`);
});
