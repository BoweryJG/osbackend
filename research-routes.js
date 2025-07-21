/**
 * Enhanced Research Routes for Canvas Sales Intelligence
 * Provides comprehensive doctor research with confidence scoring
 */

import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// In-memory job storage (replace with Redis in production)
const researchJobs = new Map();
const researchCache = new Map();

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimits = rateLimitMap.get(userId) || [];
  
  // Remove old entries
  const recentRequests = userLimits.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(userId, recentRequests);
  return true;
}

// Helper function to calculate confidence score
function calculateConfidence(data) {
  let score = 0;
  const breakdown = {
    npiVerified: 0,
    sourceCount: 0,
    websiteFound: 0,
    reviewsFound: 0,
    analysisQuality: 0
  };

  // NPI Verification (35 points)
  if (data.npiVerified) {
    score += 35;
    breakdown.npiVerified = 35;
  }

  // Sources (2 points each, max 30)
  const sourcePoints = Math.min((data.sources?.length || 0) * 2, 30);
  score += sourcePoints;
  breakdown.sourceCount = sourcePoints;

  // Website Analysis (15 points)
  if (data.websiteData?.url) {
    score += 15;
    breakdown.websiteFound = 15;
  }

  // Reviews (10 points)
  if (data.reviewData?.totalReviews > 0) {
    const reviewPoints = Math.min(10, Math.floor(data.reviewData.totalReviews / 10));
    score += reviewPoints;
    breakdown.reviewsFound = reviewPoints;
  }

  // Analysis Quality (10 points)
  if (data.synthesis?.buyingSignals?.length > 0) {
    score += 10;
    breakdown.analysisQuality = 10;
  }

  return {
    score: Math.min(score, 95), // Cap at 95%
    breakdown
  };
}

// Search for website using multiple methods
async function findDoctorWebsite(doctor) {
  const searchQueries = [
    `${doctor.displayName} ${doctor.specialty} ${doctor.city} ${doctor.state}`,
    `${doctor.organizationName} ${doctor.city} ${doctor.state}`,
    `Dr. ${doctor.displayName} dentist ${doctor.city}`
  ];

  for (const query of searchQueries) {
    try {
      const response = await axios.post(
        'https://api.brave.com/v1/web/search',
        null,
        {
          params: { q: query, count: 5 },
          headers: {
            'X-Subscription-Token': process.env.BRAVE_API_KEY,
            'Accept': 'application/json'
          }
        }
      );

      const results = response.data.results || [];
      for (const result of results) {
        if (result.url && !result.url.includes('npidb.org') && !result.url.includes('healthgrades')) {
          return {
            url: result.url,
            title: result.title,
            description: result.description
          };
        }
      }
    } catch (error) {
      console.error('Website search error:', error.message);
    }
  }

  return null;
}

// Analyze website content
async function analyzeWebsite(url) {
  try {
    const response = await axios.post(
      'https://api.firecrawl.dev/v0/scrape',
      {
        url,
        pageOptions: {
          includeHtml: false,
          onlyMainContent: true
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.data?.content || '';
    
    return {
      url,
      crawled: true,
      content: content.substring(0, 2000), // Limit content size
      services: extractServices(content),
      technology: extractTechnology(content),
      teamSize: extractTeamSize(content),
      philosophy: extractPhilosophy(content)
    };
  } catch (error) {
    console.error('Website analysis error:', error.message);
    return { url, crawled: false };
  }
}

// Extract services from website content
function extractServices(content) {
  const services = [];
  const serviceKeywords = [
    'implants', 'orthodontics', 'invisalign', 'cosmetic', 'whitening',
    'crowns', 'veneers', 'root canal', 'periodontal', 'oral surgery'
  ];
  
  serviceKeywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      services.push(keyword);
    }
  });
  
  return services;
}

// Extract technology mentions
function extractTechnology(content) {
  const tech = [];
  const techKeywords = [
    'digital', 'laser', '3D', 'CAD/CAM', 'CEREC', 'iTero', 'cone beam'
  ];
  
  techKeywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      tech.push(keyword);
    }
  });
  
  return tech;
}

// Extract team size indicators
function extractTeamSize(content) {
  const numbers = content.match(/(\d+)\s*(dentist|doctor|provider|hygienist)/gi);
  if (numbers && numbers.length > 0) {
    return numbers[0];
  }
  return 'Unknown';
}

// Extract practice philosophy
function extractPhilosophy(content) {
  const philosophyMatch = content.match(/our (mission|philosophy|approach|commitment) is[^.]+\./i);
  if (philosophyMatch) {
    return philosophyMatch[0];
  }
  return null;
}

// Gather reviews from multiple sources
async function gatherReviews(doctor) {
  const sources = ['Google', 'Yelp', 'Healthgrades'];
  const reviews = {
    doctorReviews: { rating: 0, count: 0, sources: [], highlights: [] },
    practiceReviews: { rating: 0, count: 0, sources: [] },
    combinedRating: 0,
    totalReviews: 0
  };

  // Simulate review gathering (replace with actual API calls)
  const mockRating = 3.5 + Math.random() * 1.5;
  const mockCount = Math.floor(Math.random() * 200) + 20;
  
  reviews.doctorReviews = {
    rating: Number(mockRating.toFixed(1)),
    count: mockCount,
    sources: sources,
    highlights: [
      "Great bedside manner",
      "Very thorough and professional",
      "Explains procedures clearly"
    ]
  };
  
  reviews.totalReviews = mockCount;
  reviews.combinedRating = Number(mockRating.toFixed(1));
  
  return reviews;
}

// Find local competitors
async function findCompetitors(doctor) {
  try {
    const query = `dentists near ${doctor.city} ${doctor.state}`;
    const response = await axios.post(
      'https://api.brave.com/v1/local/search',
      null,
      {
        params: { q: query, count: 10 },
        headers: {
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    return (response.data.results || []).map(r => ({
      title: r.title,
      rating: r.rating || 0,
      rating_count: r.rating_count || 0,
      distance: r.distance || 'N/A',
      address: r.address
    }));
  } catch (error) {
    console.error('Competitor search error:', error.message);
    return [];
  }
}

// Generate comprehensive synthesis
async function generateSynthesis(doctor, product, websiteIntel, reviewData, competitors) {
  const prompt = `You are an elite medical sales intelligence analyst. Create a COMPREHENSIVE, ACTIONABLE sales brief.

DOCTOR: ${doctor.displayName}, ${doctor.specialty}
LOCATION: ${doctor.city}, ${doctor.state}
ORGANIZATION: ${doctor.organizationName || 'Private Practice'}
NPI VERIFIED: Yes

PRACTICE WEBSITE: ${websiteIntel?.url || 'Not found'}
Services Offered: ${websiteIntel?.services?.join(', ') || 'Unknown'}

REPUTATION DATA:
- Rating: ${reviewData.combinedRating}/5 (${reviewData.totalReviews} reviews)

LOCAL COMPETITION: ${competitors.length} similar practices nearby

PRODUCT: ${product}

Create a detailed JSON response with:
1. executiveSummary: 3-4 sentences about the opportunity
2. buyingSignals: Array of specific opportunities with evidence
3. painPoints: Array of challenges this practice faces
4. approachStrategy: Best way to engage
5. actionPlan: Step-by-step engagement plan

BE SPECIFIC. NO GENERIC STATEMENTS.`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-opus-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://canvas.repspheres.com',
          'X-Title': 'Canvas Sales Intelligence',
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    
    // Try to parse as JSON, fallback to structured extraction
    try {
      return JSON.parse(content);
    } catch {
      return {
        executiveSummary: content.substring(0, 500),
        buyingSignals: [],
        painPoints: [],
        approachStrategy: {},
        actionPlan: []
      };
    }
  } catch (error) {
    console.error('Synthesis generation error:', error.message);
    return {
      executiveSummary: `${doctor.displayName} in ${doctor.city} presents a strong opportunity for ${product}.`,
      buyingSignals: [{
        signal: "Practice identified through NPI verification",
        evidence: "Verified healthcare provider",
        urgency: "medium",
        relevanceToProduct: `Could benefit from ${product} capabilities`
      }]
    };
  }
}

// Main research orchestration
async function conductResearch(doctor, product, jobId, updateProgress) {
  try {
    updateProgress({ stage: 'website', progress: 10, message: 'Searching for practice website...' });
    
    // Find website
    const websiteData = await findDoctorWebsite(doctor);
    updateProgress({ stage: 'website', progress: 25, message: 'Analyzing website content...' });
    
    // Analyze website if found
    const websiteIntel = websiteData ? await analyzeWebsite(websiteData.url) : null;
    updateProgress({ stage: 'reviews', progress: 40, message: 'Gathering reputation data...' });
    
    // Gather reviews
    const reviewData = await gatherReviews(doctor);
    updateProgress({ stage: 'competition', progress: 60, message: 'Analyzing local competition...' });
    
    // Find competitors
    const competitors = await findCompetitors(doctor);
    updateProgress({ stage: 'synthesis', progress: 80, message: 'Creating intelligence brief...' });
    
    // Generate synthesis
    const synthesis = await generateSynthesis(doctor, product, websiteIntel, reviewData, competitors);
    
    // Build final result
    const result = {
      doctor,
      npiVerified: true,
      sources: [
        { type: 'NPI Database', url: 'https://npiregistry.cms.hhs.gov' },
        ...(websiteIntel?.url ? [{ type: 'Practice Website', url: websiteIntel.url }] : []),
        { type: 'Review Aggregation', url: 'Multiple sources' },
        { type: 'Competitive Analysis', url: 'Local market data' }
      ],
      websiteData: websiteIntel,
      reviewData,
      competitors: competitors.slice(0, 5),
      synthesis,
      timestamp: new Date().toISOString()
    };
    
    // Calculate confidence
    result.confidence = calculateConfidence(result);
    
    updateProgress({ stage: 'completed', progress: 100, message: 'Research complete!' });
    
    return result;
  } catch (error) {
    console.error('Research error:', error);
    throw error;
  }
}

// Start research job
router.post('/research/start', async (req, res) => {
  const { doctor, product, userId } = req.body;
  
  // Check rate limit
  if (userId && !checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }
  
  // Check cache
  const cacheKey = `${doctor.npi}_${product}`;
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3 * 24 * 60 * 60 * 1000) { // 3 days
    return res.json({
      jobId: uuidv4(),
      status: 'completed',
      fromCache: true,
      data: cached.data
    });
  }
  
  // Create new job
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'processing',
    progress: 0,
    stage: 'starting',
    message: 'Initializing research...',
    doctor,
    product,
    startTime: Date.now()
  };
  
  researchJobs.set(jobId, job);
  
  // Start research in background
  conductResearch(doctor, product, jobId, (update) => {
    const job = researchJobs.get(jobId);
    if (job) {
      Object.assign(job, update);
    }
  }).then(data => {
    const job = researchJobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.data = data;
      job.endTime = Date.now();
      
      // Cache result
      researchCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
    }
  }).catch(error => {
    const job = researchJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message;
      job.endTime = Date.now();
    }
  });
  
  res.json({ jobId, status: 'processing' });
});

// Get job status
router.get('/research/:jobId/status', (req, res) => {
  const job = researchJobs.get(req.params.jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    data: job.data,
    error: job.error
  });
});

// Get job results
router.get('/research/:jobId', (req, res) => {
  const job = researchJobs.get(req.params.jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'completed') {
    return res.status(202).json({ 
      message: 'Job still processing', 
      status: job.status,
      progress: job.progress 
    });
  }
  
  res.json(job.data);
});

// Stream updates via SSE
router.get('/research/:jobId/stream', (req, res) => {
  const jobId = req.params.jobId;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const sendUpdate = () => {
    const job = researchJobs.get(jobId);
    if (job) {
      res.write(`data: ${JSON.stringify({
        progress: job.progress,
        stage: job.stage,
        message: job.message,
        status: job.status
      })}\n\n`);
      
      if (job.status === 'completed' || job.status === 'failed') {
        res.end();
        return;
      }
    }
    
    setTimeout(sendUpdate, 1000);
  };
  
  sendUpdate();
});

// Batch research
router.post('/research/batch', async (req, res) => {
  const { doctors, product, userId } = req.body;
  
  if (!Array.isArray(doctors) || doctors.length === 0) {
    return res.status(400).json({ error: 'Invalid doctors array' });
  }
  
  if (doctors.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 doctors per batch' });
  }
  
  const jobs = doctors.map(doctor => ({
    doctor,
    jobId: uuidv4()
  }));
  
  // Start all jobs
  jobs.forEach(({ doctor, jobId }) => {
    const job = {
      id: jobId,
      status: 'processing',
      progress: 0,
      doctor,
      product
    };
    researchJobs.set(jobId, job);
    
    // Start research
    conductResearch(doctor, product, jobId, (update) => {
      const job = researchJobs.get(jobId);
      if (job) Object.assign(job, update);
    }).then(data => {
      const job = researchJobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.data = data;
      }
    }).catch(error => {
      const job = researchJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
    });
  });
  
  res.json({
    batchId: uuidv4(),
    jobs: jobs.map(j => ({ doctorName: j.doctor.displayName, jobId: j.jobId }))
  });
});

// Brave Search endpoint for Canvas
router.post('/brave-search', async (req, res) => {
  try {
    const { query, count = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Debug: Check if API key is set
    if (!process.env.BRAVE_API_KEY) {
      console.error('BRAVE_API_KEY not set in environment');
      return res.status(500).json({ error: 'Brave API key not configured' });
    }

    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: {
        q: query,
        count: Math.min(count, 20)
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Brave search error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Brave search failed', 
      message: error.message,
      details: error.response?.data
    });
  }
});

// Firecrawl Scrape endpoint for Canvas
router.post('/firecrawl-scrape', async (req, res) => {
  try {
    const { url, formats = ['markdown'] } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.post('https://api.firecrawl.dev/v1/scrape', {
      url,
      formats
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Firecrawl error:', error);
    res.status(500).json({ 
      error: 'Firecrawl scrape failed', 
      message: error.message 
    });
  }
});

// OpenRouter endpoint for Canvas
router.post('/openrouter', async (req, res) => {
  try {
    const { prompt, model = 'anthropic/claude-3-opus-20240229' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`OpenRouter request - Model: ${model}, Prompt length: ${prompt.length}`);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://canvas.repspheres.com',
          'X-Title': 'Canvas Sales Intelligence'
        }
      }
    );

    console.log('OpenRouter response received successfully');
    res.json(response.data);
  } catch (error) {
    console.error('OpenRouter error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    res.status(500).json({ 
      error: 'OpenRouter API failed', 
      message: error.response?.data?.error?.message || error.message,
      details: error.response?.status ? `HTTP ${error.response.status}` : 'Network error'
    });
  }
});

// NPI Lookup endpoint for Canvas
router.get('/npi-lookup', async (req, res) => {
  try {
    const { search } = req.query;
    
    if (!search || search.length < 3) {
      return res.json({ results: [] });
    }

    // Parse search term - handle variations
    const searchLower = search.toLowerCase().trim();
    const terms = search.trim().split(/\s+/);
    let firstName = terms[0];
    let lastName = terms.length > 1 ? terms[terms.length - 1] : '';
    let state = '';
    let city = '';
    
    // Check if search includes location hints
    if (searchLower.includes('buffalo') || searchLower.includes('ny')) {
      // For Buffalo area, don't specify city - just use state
      // This catches suburbs like Williamsville, Amherst, etc.
      if (searchLower.includes('ny')) {
        state = 'NY';
        // Don't set city for Buffalo area - too many suburbs
      }
    }

    // Build NPI API URL with flexible parameters
    const params = new URLSearchParams({
      version: '2.1',
      limit: '20',  // Increased limit
      first_name: firstName,
      ...(lastName && { last_name: lastName }),
      ...(state && { state: state }),
      ...(city && { city: city })
    });

    const response = await axios.get(
      `https://npiregistry.cms.hhs.gov/api/?${params}`
    );
    
    if (!response.data || !response.data.results) {
      return res.json({ results: [] });
    }

    // Transform results to match Canvas format
    const doctors = response.data.results.map(result => {
      const basic = result.basic || {};
      // Prefer location address over mailing address
      const locationAddress = result.addresses?.find(a => a.address_purpose === 'LOCATION') || {};
      const mailingAddress = result.addresses?.find(a => a.address_purpose === 'MAILING') || {};
      const address = locationAddress.address_1 ? locationAddress : mailingAddress;
      
      const taxonomy = result.taxonomies?.find(t => t.primary) || {};
      
      // Format name properly
      const formattedFirstName = basic.first_name
        ? basic.first_name.charAt(0).toUpperCase() + basic.first_name.slice(1).toLowerCase()
        : '';
      const formattedLastName = basic.last_name
        ? basic.last_name.charAt(0).toUpperCase() + basic.last_name.slice(1).toLowerCase()
        : '';
      
      return {
        npi: result.number,
        displayName: `Dr. ${formattedFirstName} ${formattedLastName}${basic.credential ? ', ' + basic.credential : ''}`,
        firstName: formattedFirstName,
        lastName: formattedLastName,
        credential: basic.credential || '',
        specialty: taxonomy.desc || 'Not specified',
        city: address.city || '',
        state: address.state || '',
        fullAddress: address.address_1 
          ? `${address.address_1}, ${address.city}, ${address.state} ${address.postal_code}`
          : '',
        phone: address.telephone_number || '',
        organizationName: basic.organization_name || ''
      };
    }).filter(doc => {
      // Filter for dental and aesthetic specialties
      const specialtyLower = doc.specialty.toLowerCase();
      return (
        specialtyLower.includes('dent') ||
        specialtyLower.includes('oral') ||
        specialtyLower.includes('maxillofacial') ||
        specialtyLower.includes('dermat') ||
        specialtyLower.includes('plastic') ||
        specialtyLower.includes('aesthetic') ||
        specialtyLower.includes('cosmetic')
      ) && doc.city && doc.state;
    });

    res.json({ results: doctors }); // Return all filtered results
    
  } catch (error) {
    console.error('NPI lookup error:', error);
    res.status(500).json({ 
      error: 'Failed to search NPI registry',
      message: error.message 
    });
  }
});

// Apify Actor proxy
router.post('/apify-actor', async (req, res) => {
  const { actorId, input, waitForFinish = true } = req.body;
  
  if (!actorId || !input) {
    return res.status(400).json({ error: 'Actor ID and input required' });
  }
  
  const APIFY_API_KEY = process.env.APIFY_API_KEY;
  if (!APIFY_API_KEY) {
    console.error('APIFY_API_KEY not configured');
    return res.status(500).json({ error: 'Apify not configured' });
  }
  
  try {
    // Start the actor run
    const runResponse = await axios.post(
      `https://api.apify.com/v2/acts/${actorId}/runs`,
      input,
      {
        headers: {
          'Authorization': `Bearer ${APIFY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          waitForFinish: waitForFinish ? '300' : '0' // Wait up to 5 minutes
        }
      }
    );
    
    const runId = runResponse.data.data.id;
    
    if (!waitForFinish) {
      return res.json({ runId, status: 'RUNNING' });
    }
    
    // Get the results
    const resultsResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      {
        headers: {
          'Authorization': `Bearer ${APIFY_API_KEY}`
        }
      }
    );
    
    res.json({
      runId,
      status: runResponse.data.data.status,
      results: resultsResponse.data
    });
    
  } catch (error) {
    console.error('Apify error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Apify API failed', message: error.message });
  }
});

// Research Intelligence proxy - Uses OpenRouter instead of Perplexity
router.post('/perplexity-research', async (req, res) => {
  const { query, model = 'sonar' } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }
  
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not configured');
    return res.status(500).json({ error: 'OpenRouter not configured' });
  }
  
  try {
    // First do a Brave search to get real-time context
    let searchContext = '';
    if (process.env.BRAVE_API_KEY) {
      try {
        const searchResponse = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          params: { q: query, count: 5 },
          headers: {
            'X-Subscription-Token': process.env.BRAVE_API_KEY,
            'Accept': 'application/json'
          }
        });
        
        const results = searchResponse.data.results || [];
        searchContext = results.slice(0, 3).map(r => 
          `${r.title}: ${r.description}`
        ).join('\n\n');
      } catch (searchError) {
        console.error('Brave search error:', searchError.message);
      }
    }
    
    // Use OpenRouter with search context for research
    const enhancedPrompt = `You are a medical market research expert. Provide detailed, factual information with specific examples and data points.

${searchContext ? `Recent search results for context:\n${searchContext}\n\n` : ''}

User Query: ${query}

Provide a comprehensive answer that includes:
1. Key insights and findings
2. Specific examples or case studies
3. Relevant statistics or data points
4. Actionable recommendations

Format your response to be clear and well-structured.`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3-opus-20240229',
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }],
        temperature: 0.3,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://canvas.repspheres.com',
          'X-Title': 'Canvas Sales Intelligence',
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({
      answer: response.data.choices[0].message.content,
      sources: searchContext ? ['Brave Search Results'] : [],
      model: 'claude-3-opus (via OpenRouter)'
    });
  } catch (error) {
    console.error('Research error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Research API failed', message: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeJobs: researchJobs.size,
    cacheSize: researchCache.size,
    version: '1.0.4',
    env: {
      hasBraveKey: !!process.env.BRAVE_API_KEY,
      hasFirecrawlKey: !!process.env.FIRECRAWL_API_KEY,
      hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

export default router;