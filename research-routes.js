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

// Master Orchestrator for Private Practice Intelligence Factory
router.post('/private-practice-intelligence', async (req, res) => {
  try {
    const { doctor, product, userId } = req.body;
    
    if (!doctor || !doctor.npi) {
      return res.status(400).json({ error: 'Doctor with NPI is required' });
    }

    console.log(`🧠 Starting Private Practice Intelligence for: ${doctor.displayName}`);
    const startTime = Date.now();

    // STAGE 1: Parallel Intelligence Collection (6 agents running simultaneously)
    console.log('🔍 Stage 1: Launching parallel intelligence agents...');
    const [
      practiceResult, 
      techStackResult, 
      painPointsResult, 
      newsResult, 
      teamResult, 
      gapAnalysisResult
    ] = await Promise.allSettled([
      practiceDiscoveryAgent(doctor),
      medicalTechStackAgent(doctor),
      patientPainPointAgent(doctor),
      recentNewsAgent(doctor), 
      teamAnalysisAgent(doctor),
      serviceGapAgent(doctor)
    ]);

    const practiceData = practiceResult.status === 'fulfilled' ? practiceResult.value : {};
    const techStackData = techStackResult.status === 'fulfilled' ? techStackResult.value : {};
    const painPointsData = painPointsResult.status === 'fulfilled' ? painPointsResult.value : {};
    const newsData = newsResult.status === 'fulfilled' ? newsResult.value : {};
    const teamData = teamResult.status === 'fulfilled' ? teamResult.value : {};
    const gapData = gapAnalysisResult.status === 'fulfilled' ? gapAnalysisResult.value : {};

    // ENHANCED: If website found, scrape it with Puppeteer for deeper intelligence
    let websiteIntelligence = {};
    if (practiceData.websiteUrl) {
      console.log('🤖 STAGE 1.5: Deep website scraping with Puppeteer...');
      try {
        websiteIntelligence = await puppeteerWebsiteAnalyzer(practiceData.websiteUrl, doctor);
        console.log(`✅ Puppeteer analysis complete: ${Object.keys(websiteIntelligence).length} data points extracted`);
      } catch (error) {
        console.error('⚠️ Puppeteer analysis failed:', error.message);
        websiteIntelligence = {};
      }
    }

    console.log(`📊 Website found: ${practiceData.websiteUrl || 'No'}`);
    console.log(`🔬 Tech stack items: ${techStackData.equipment?.length || 0}`);
    console.log(`😤 Pain points found: ${painPointsData.painPoints?.length || 0}`);
    console.log(`📰 Recent news items: ${newsData.newsItems?.length || 0}`);
    console.log(`👥 Team members: ${teamData.teamSize || 'Unknown'}`);
    console.log(`⚡ Service gaps: ${gapData.gaps?.length || 0}`);

    // STAGE 2: Social Media + Sentiment Analysis
    console.log('📱 Stage 2: Social media and sentiment analysis...');
    const [socialData, sentimentData] = await Promise.allSettled([
      practiceData.websiteUrl ? socialMediaAgent(doctor, practiceData) : Promise.resolve({ instagram: null, followers: 0, recentPosts: 0 }),
      practiceData.websiteUrl ? practiceSentimentAgent(practiceData) : Promise.resolve({ sentiment: 'neutral', positioning: 'unknown' })
    ]);

    const social = socialData.status === 'fulfilled' ? socialData.value : { instagram: null, followers: 0, recentPosts: 0 };
    const sentiment = sentimentData.status === 'fulfilled' ? sentimentData.value : { sentiment: 'neutral', positioning: 'unknown' };

    // STAGE 3: Generate Comprehensive Sales Rep Brief (with all intelligence)
    console.log('📝 Stage 3: Generating game-changing sales rep brief...');
    const salesRepBrief = await generateSalesRepBrief(doctor, product, {
      practice: practiceData,
      techStack: techStackData,
      painPoints: painPointsData,
      news: newsData,
      team: teamData,
      gaps: gapData,
      social: social,
      sentiment: sentiment
    });

    // STAGE 5: Background Intelligence (runs in parallel, not critical for rep brief)
    console.log('🔍 Stage 5: Background market intelligence...');
    const marketIntelligence = await marketIntelligenceAgent(doctor);

    const intelligence = {
      doctorName: doctor.displayName,
      npi: doctor.npi,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      
      // CRITICAL FOR SALES REP
      salesRepBrief,
      
      // DETAILED DATA
      practiceData,
      techStackData,
      painPointsData,
      newsData,
      teamData,
      gapData,
      social,
      sentiment,
      marketIntelligence,
      websiteIntelligence,
      
      // SUMMARY STATS
      summary: {
        websiteFound: !!practiceData.websiteUrl,
        techStackItems: techStackData.equipment?.length || 0,
        instagramFollowers: social.followers || 0,
        recentPosts: social.recentPosts || 0,
        isPrivatePractice: practiceData.isPrivatePractice || false,
        painPointsFound: painPointsData.painPoints?.length || 0,
        recentNewsItems: newsData.newsItems?.length || 0,
        teamSize: teamData.teamSize || 'Unknown',
        serviceGaps: gapData.gaps?.length || 0,
        sentimentScore: sentiment.sentiment || 'neutral'
      }
    };

    console.log(`✅ Intelligence complete in ${intelligence.processingTime}ms`);
    res.json(intelligence);

  } catch (error) {
    console.error('Intelligence orchestration error:', error);
    res.status(500).json({ 
      error: 'Intelligence generation failed', 
      message: error.message 
    });
  }
});

// Direct Claude API endpoint for Canvas (legacy support)
router.post('/openrouter', async (req, res) => {
  try {
    const { prompt, model = 'claude-3-5-sonnet-20241022' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`Claude API request - Model: ${model}, Prompt length: ${prompt.length}`);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    console.log('Claude API response received successfully');
    
    // Convert Anthropic response format to OpenAI-compatible format for frontend
    const openaiResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: response.data.content[0].text
        },
        finish_reason: 'stop'
      }],
      usage: response.data.usage
    };
    
    res.json(openaiResponse);
  } catch (error) {
    console.error('Claude API error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    res.status(500).json({ 
      error: 'Claude API failed', 
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

// ===== WEBSITE ANALYSIS WITH PUPPETEER =====

async function puppeteerWebsiteAnalyzer(websiteUrl, doctor) {
  try {
    console.log(`🔍 Puppeteer: Analyzing ${websiteUrl}...`);
    
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to website
    await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Extract comprehensive website data
    const websiteData = await page.evaluate(() => {
      
      // Get all text content
      const allText = document.body.innerText.toLowerCase();
      
      // Extract services offered
      const serviceKeywords = [
        'cleanings', 'fillings', 'crowns', 'bridges', 'implants', 'dentures',
        'root canal', 'extraction', 'whitening', 'veneers', 'braces', 'invisalign',
        'cosmetic', 'periodontal', 'oral surgery', 'emergency', 'pediatric'
      ];
      
      const servicesFound = serviceKeywords.filter(service => 
        allText.includes(service)
      );
      
      // Extract technology/equipment mentions
      const techKeywords = [
        'itero', 'cerec', 'invisalign', 'digital x-ray', 'cone beam', 'cbct',
        'laser', 'botox', 'coolsculpting', 'emsculpt', 'juvederm', 'restylane',
        'zoom whitening', 'kavo', 'straumann', 'nobel biocare', 'zimmer biomet'
      ];
      
      const techFound = techKeywords.filter(tech => 
        allText.includes(tech) || allText.includes(tech.replace(' ', ''))
      );
      
      // Extract team information
      const teamMatches = allText.match(/dr\.|doctor|dds|dmd|hygienist|assistant/gi) || [];
      const teamKeywords = ['team', 'staff', 'doctor', 'dr.', 'hygienist', 'assistant'];
      const teamMentions = teamKeywords.filter(keyword => allText.includes(keyword));
      
      // Extract contact information
      const phoneRegex = /\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phones = [...allText.matchAll(phoneRegex)].map(match => match[0]);
      const emails = [...allText.matchAll(emailRegex)].map(match => match[0]);
      
      // Extract patient testimonials/reviews
      const reviewKeywords = ['review', 'testimonial', 'patient says', 'experience', 'satisfied'];
      const reviewMentions = reviewKeywords.filter(keyword => allText.includes(keyword));
      
      // Extract location/address information
      const addressKeywords = ['address', 'location', 'visit us', 'find us'];
      const addressMentions = addressKeywords.filter(keyword => allText.includes(keyword));
      
      // Extract social media links
      const socialLinks = Array.from(document.querySelectorAll('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"], a[href*="linkedin"], a[href*="youtube"]'))
        .map(link => ({
          platform: link.href.includes('facebook') ? 'facebook' : 
                   link.href.includes('instagram') ? 'instagram' :
                   link.href.includes('twitter') ? 'twitter' :
                   link.href.includes('linkedin') ? 'linkedin' : 'youtube',
          url: link.href
        }));
      
      // Get page title and meta description
      const title = document.title || '';
      const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
      
      return {
        pageTitle: title,
        metaDescription: metaDescription,
        allTextLength: allText.length,
        servicesOffered: servicesFound,
        technologyMentioned: techFound,
        teamInformation: {
          mentions: teamMentions,
          totalMentions: teamMatches.length
        },
        contactInfo: {
          phones: phones,
          emails: emails
        },
        patientExperience: {
          reviewMentions: reviewMentions
        },
        socialMediaLinks: socialLinks,
        addressInfo: addressMentions,
        fullTextSample: allText.substring(0, 500) + '...'
      };
    });
    
    await browser.close();
    
    console.log(`✅ Puppeteer extracted: ${websiteData.servicesOffered.length} services, ${websiteData.technologyMentioned.length} tech items`);
    
    return websiteData;
    
  } catch (error) {
    console.error('Puppeteer website analysis error:', error.message);
    return {};
  }
}

// ===== PARALLEL INTELLIGENCE AGENTS =====

// Agent 1: Practice Discovery Agent (Website + Contact Info)
async function practiceDiscoveryAgent(doctor) {
  try {
    console.log(`🔍 Searching for: ${doctor.firstName} ${doctor.lastName} in ${doctor.city}, ${doctor.state}`);
    
    // Generic search queries using only NPI data
    const searchQueries = [
      `"${doctor.firstName} ${doctor.lastName}" ${doctor.city} ${doctor.state} dentist`,
      `"Dr ${doctor.lastName}" ${doctor.city} dental practice`,
      `"${doctor.displayName}" ${doctor.city} ${doctor.state}`,
      `"${doctor.firstName} ${doctor.lastName}" "${doctor.city}" dental`,
      `"${doctor.firstName} ${doctor.lastName}" ${doctor.fullAddress?.split(',')[0] || doctor.city}`
    ];
    
    let bestResult = null;
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Trying: "${query}"`);
        
        const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': process.env.BRAVE_API_KEY
          },
          params: { 
            q: query, 
            count: 10,
            country: 'US'
          }
        });

        const results = response.data.web?.results || [];
        console.log(`📊 Found ${results.length} results for "${query}"`);
        
        // Debug: show all results for first query
        if (query.includes('Gregory White')) {
          console.log('🔍 DEBUG - All search results:');
          results.slice(0, 5).forEach((r, i) => {
            console.log(`   ${i+1}. ${r.title} | ${r.url}`);
          });
        }
        
        for (const result of results) {
          const url = result.url?.toLowerCase() || '';
          const title = result.title?.toLowerCase() || '';
          const description = result.description?.toLowerCase() || '';
          
          // Smart website quality scoring system
          const websiteScore = calculateWebsiteScore(result, doctor);
          
          function calculateWebsiteScore(result, doctor) {
            let score = 0;
            const url = result.url?.toLowerCase() || '';
            const title = result.title?.toLowerCase() || '';
            const description = result.description?.toLowerCase() || '';
            const doctorFirstName = doctor.firstName?.toLowerCase() || '';
            const doctorLastName = doctor.lastName?.toLowerCase() || '';
            
            // POSITIVE SIGNALS (Practice Website Indicators)
            
            // ADDRESS MATCH - NEARLY 100% CONFIDENCE
            const addressParts = doctor.fullAddress?.split(',') || [];
            const streetAddress = addressParts[0]?.trim().toLowerCase() || '';
            if (streetAddress && (title.includes(streetAddress) || description.includes(streetAddress))) score += 90;
            
            // PHONE NUMBER MATCH - NEARLY 100% CONFIDENCE  
            const phone = doctor.phone?.replace(/\D/g, '') || '';
            if (phone && (title.includes(phone) || description.includes(phone))) score += 90;
            
            // Doctor name match (strong signal)
            if (title.includes(doctorFirstName) || title.includes(doctorLastName)) score += 30;
            if (description.includes(doctorFirstName) || description.includes(doctorLastName)) score += 20;
            
            // Dental practice indicators
            if (title.includes('dental') || title.includes('dentist') || title.includes('dds')) score += 15;
            if (title.includes('practice') || title.includes('office') || title.includes('clinic')) score += 10;
            
            // Professional indicators
            if (title.includes('dr.') || title.includes('doctor')) score += 10;
            if (url.includes('dental') || url.includes('dds')) score += 10;
            
            // Location match
            if (title.includes(doctor.city?.toLowerCase()) || title.includes(doctor.state?.toLowerCase())) score += 15;
            
            // High-quality practice website signals
            if (url.includes('.com') && !url.includes('www.') === false) score += 5;
            if (title.includes('family') || title.includes('cosmetic') || title.includes('oral')) score += 5;
            
            // NEGATIVE SIGNALS (Directory/Low Quality Indicators)
            
            // Major directories (strong negative)
            if (url.includes('healthgrades')) score -= 50;
            if (url.includes('vitals.com')) score -= 50;
            if (url.includes('zocdoc')) score -= 50;
            if (url.includes('yelp.com')) score -= 40;
            if (url.includes('yellowpages')) score -= 40;
            if (url.includes('whitepages')) score -= 40;
            
            // Social media (not practice websites)
            if (url.includes('facebook.com')) score -= 30;
            if (url.includes('linkedin.com')) score -= 30;
            if (url.includes('instagram.com')) score -= 30;
            if (url.includes('twitter.com')) score -= 30;
            
            // Generic/low quality indicators
            if (url.includes('google.com')) score -= 25;
            if (title.includes('reviews') || title.includes('rating')) score -= 15;
            if (title.includes('find a') || title.includes('directory')) score -= 20;
            
            // Insurance/corporate sites
            if (url.includes('insurance') || title.includes('insurance')) score -= 15;
            if (url.includes('corporate') || title.includes('chain')) score -= 10;
            
            return score;
          }
          
          const isDentalPractice = websiteScore >= 25; // Threshold for quality practice website
          
          if (isDentalPractice) {
            console.log(`✅ FOUND PRACTICE WEBSITE: ${result.url} (Score: ${websiteScore})`);
            console.log(`   Title: ${result.title}`);
            console.log(`   Description: ${result.description?.substring(0, 100)}...`);
            
            bestResult = {
              websiteUrl: result.url,
              websiteTitle: result.title,
              description: result.description,
              isPrivatePractice: true,
              searchQuery: query,
              searchResults: [result],
              websiteScore: websiteScore
            };
            break;
          }
        }
        
        if (bestResult) break; // Stop searching once we find a practice website
        
      } catch (searchError) {
        console.log(`⚠️ Search failed for "${query}": ${searchError.message}`);
        continue;
      }
    }

    if (bestResult) {
      return bestResult;
    }

    console.log('⚠️ No practice website found in any search');
    return {
      websiteUrl: null,
      websiteTitle: null,
      description: null,
      isPrivatePractice: false,
      searchResults: []
    };
    
  } catch (error) {
    console.error('Practice discovery error:', error.message);
    return { websiteUrl: null, isPrivatePractice: false };
  }
}

// Agent 2: Medical Tech Stack Scanner Agent 
async function medicalTechStackAgent(doctor) {
  try {
    // Use a general search to find medical equipment mentions for this practice
    const techQuery = `"${doctor.displayName}" ${doctor.specialty} ${doctor.city} equipment technology services`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: techQuery, count: 5 }
    });

    const results = response.data.results || [];
    const allContent = results.map(r => r.description || '').join(' ').toLowerCase();
    
    // Medical equipment brands to detect
    const medicalBrands = [
      // Injectables & Fillers
      'Botox', 'Dysport', 'Xeomin', 'Juvederm', 'Restylane', 'Sculptra', 'Radiesse',
      // Laser & Energy Devices  
      'CoolSculpting', 'EmSculpt', 'EmSculpt NEO', 'Ultherapy', 'Thermage', 'SculpSure', 'truSculpt',
      // Dental Technology
      'CEREC', 'iTero', 'Yomi Robotics', 'Straumann', 'Nobel Biocare', 'Zimmer Biomet',
      // Skincare Lines
      'SkinCeuticals', 'ZO Skin Health', 'Obagi', 'Revision Skincare', 'EltaMD',
      // Devices & Lasers
      'Fraxel', 'CO2 laser', 'IPL', 'BBL', 'Morpheus8', 'Profound RF', 'Venus Legacy'
    ];

    const foundEquipment = medicalBrands.filter(brand => 
      allContent.includes(brand.toLowerCase())
    );

    return {
      equipment: foundEquipment,
      searchResults: results,
      totalBrandsChecked: medicalBrands.length
    };
  } catch (error) {
    console.error('Tech stack analysis error:', error.message);
    return { equipment: [], searchResults: [], totalBrandsChecked: 0 };
  }
}

// Agent 3: Social Media Agent (Instagram Analysis)
async function socialMediaAgent(doctor, practiceData) {
  try {
    // Search for Instagram profile
    const instagramQuery = `"${doctor.displayName}" instagram ${doctor.specialty} ${doctor.city}`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: instagramQuery, count: 10 }
    });

    const results = response.data.results || [];
    const instagramResult = results.find(r => 
      r.url && r.url.includes('instagram.com')
    );

    // Basic analysis (would need Instagram API for detailed metrics)
    return {
      instagram: instagramResult?.url || null,
      followers: Math.floor(Math.random() * 5000) + 500, // Mock data
      recentPosts: Math.floor(Math.random() * 10) + 1,   // Mock data
      hasInstagram: !!instagramResult
    };
  } catch (error) {
    console.error('Social media analysis error:', error.message);
    return { instagram: null, followers: 0, recentPosts: 0 };
  }
}

// Agent 4: Market Intelligence Agent
async function marketIntelligenceAgent(doctor) {
  try {
    const competitorQuery = `${doctor.specialty} near "${doctor.city}, ${doctor.state}"`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json', 
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: competitorQuery, count: 10 }
    });

    const competitors = (response.data.results || [])
      .filter(r => r.url && !r.url.includes('healthgrades'))
      .slice(0, 5);

    return { competitors, marketDensity: competitors.length };
  } catch (error) {
    console.error('Market intelligence error:', error.message);
    return { competitors: [], marketDensity: 0 };
  }
}

// Agent 5: Psychological Profiling Agent (Education + Practice Details + Motivators)
async function psychologicalProfilingAgent(doctor, collectedData) {
  try {
    // Search for education/medical school background + practice details
    const educationQuery = `"${doctor.displayName}" ${doctor.specialty} education medical school residency university years experience`;
    const practiceQuery = `"${doctor.displayName}" practice locations providers staff "years in practice" established`;
    
    const [eduResponse, practiceResponse] = await Promise.all([
      axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY
        },
        params: { q: educationQuery, count: 5 }
      }),
      axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY
        },
        params: { q: practiceQuery, count: 5 }
      })
    ]);

    const eduResults = eduResponse.data.results || [];
    const practiceResults = practiceResponse.data.results || [];
    const eduContent = eduResults.map(r => r.description || '').join(' ').toLowerCase();
    const practiceContent = practiceResults.map(r => r.description || '').join(' ').toLowerCase();
    
    // Extract educational institutions
    const medicalSchools = [
      'Harvard Medical', 'Johns Hopkins', 'Stanford Medicine', 'Mayo Clinic', 'UCLA', 'UCSF',
      'NYU School of Medicine', 'Mount Sinai', 'Columbia', 'Yale School of Medicine',
      'University of Pennsylvania', 'Duke University', 'Northwestern', 'Vanderbilt',
      'Case Western', 'University of Michigan', 'University of Washington', 'Emory',
      'Boston University', 'Georgetown', 'George Washington', 'Cornell', 'Tufts'
    ];

    const foundSchools = medicalSchools.filter(school => 
      eduContent.includes(school.toLowerCase())
    );

    // Analyze psychological profile based on all collected data
    const profilePrompt = `Analyze this medical professional's psychological profile for sales motivators:

DOCTOR: ${doctor.displayName} - ${doctor.specialty}
LOCATION: ${doctor.city}, ${doctor.state}

EDUCATION FOUND: ${foundSchools.join(', ') || 'Not identified'}
PRACTICE WEBSITE: ${collectedData.practice.websiteUrl || 'None'}
TECH STACK: ${collectedData.techStack.equipment?.join(', ') || 'Basic setup'}
SOCIAL MEDIA: ${collectedData.social.followers || 0} Instagram followers
PRACTICE TYPE: ${collectedData.practice.isPrivatePractice ? 'Private Practice' : 'Unknown'}

Based on this data, identify likely psychological motivators:
1. ACHIEVEMENT MOTIVATION (evidence of high achiever vs comfort-seeker)
2. INNOVATION ADOPTION (early adopter vs conservative)
3. STATUS DRIVERS (prestige-focused vs practical-focused)
4. FINANCIAL MOTIVATION (ROI-driven vs patient-care driven)
5. SOCIAL INFLUENCE (peer validation vs independent decision maker)
6. RISK TOLERANCE (willing to try new technology vs proven solutions only)

Return JSON format:
{
  "primaryMotivators": ["achievement", "status", "innovation"],
  "riskTolerance": "moderate",
  "decisionStyle": "analytical",
  "statusIndicators": ["ivy_league_education", "high_tech_adoption"],
  "approachStyle": "evidence_based",
  "educationalBackground": ["school1", "school2"]
}`;

    const profileResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{ role: 'user', content: profilePrompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    let profile;
    try {
      profile = JSON.parse(profileResponse.data.content[0].text);
    } catch {
      profile = {
        primaryMotivators: ["achievement", "financial"],
        riskTolerance: "moderate",
        decisionStyle: "analytical",
        statusIndicators: [],
        approachStyle: "evidence_based",
        educationalBackground: foundSchools
      };
    }

    return {
      ...profile,
      educationalBackground: foundSchools,
      dataAnalyzed: {
        websiteFound: !!collectedData.practice.websiteUrl,
        techStackItems: collectedData.techStack.equipment?.length || 0,
        socialPresence: collectedData.social.followers > 500
      }
    };

  } catch (error) {
    console.error('Psychological profiling error:', error.message);
    return {
      primaryMotivators: ["achievement", "financial"],
      riskTolerance: "moderate",
      decisionStyle: "analytical",
      statusIndicators: [],
      approachStyle: "evidence_based",
      educationalBackground: []
    };
  }
}

// Game-Changing Intelligence Agents

// Agent: Patient Pain Points Analyzer
async function patientPainPointAgent(doctor) {
  try {
    const query = `"${doctor.displayName}" reviews complaints "waiting" "equipment" "outdated" "slow" "appointment" problems`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: query, count: 10 }
    });

    const results = response.data.results || [];
    const reviewContent = results.map(r => r.description || '').join(' ').toLowerCase();
    
    // Extract common pain points
    const painPointKeywords = [
      'long wait', 'waiting too long', 'outdated equipment', 'old technology', 
      'slow service', 'scheduling problems', 'payment issues', 'communication problems',
      'uncomfortable chairs', 'noisy equipment', 'pain during procedure'
    ];

    const foundPainPoints = painPointKeywords.filter(pain => 
      reviewContent.includes(pain)
    );

    return { painPoints: foundPainPoints, reviewContent: reviewContent.substring(0, 1000) };
  } catch (error) {
    console.error('Pain points analysis error:', error.message);
    return { painPoints: [], reviewContent: '' };
  }
}

// Agent: Recent News & Recognition Finder
async function recentNewsAgent(doctor) {
  try {
    const query = `"${doctor.displayName}" ${doctor.specialty} news awards recognition 2024 2023 speaking conference`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: query, count: 5 }
    });

    const results = response.data.results || [];
    const newsItems = results.filter(r => 
      r.title && (
        r.title.toLowerCase().includes('award') ||
        r.title.toLowerCase().includes('recognition') ||
        r.title.toLowerCase().includes('speaking') ||
        r.title.toLowerCase().includes('conference') ||
        r.title.toLowerCase().includes('best')
      )
    );

    return { 
      newsItems: newsItems.map(item => ({
        title: item.title,
        url: item.url,
        description: item.description
      }))
    };
  } catch (error) {
    console.error('News analysis error:', error.message);
    return { newsItems: [] };
  }
}

// Agent: Team Analysis Agent
async function teamAnalysisAgent(doctor) {
  try {
    const query = `"${doctor.displayName}" practice staff team hygienist assistant "meet our team"`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: query, count: 5 }
    });

    const results = response.data.results || [];
    const teamContent = results.map(r => r.description || '').join(' ').toLowerCase();
    
    // Extract team size indicators
    const teamSizeMatch = teamContent.match(/(\d+)\s*(hygienist|assistant|doctor|provider|staff)/);
    const teamSize = teamSizeMatch ? `${teamSizeMatch[1]} ${teamSizeMatch[2]}s` : 'Unknown';
    
    // Look for credentials
    const credentials = ['dds', 'dmd', 'rn', 'rda', 'rdh'];
    const foundCredentials = credentials.filter(cred => 
      teamContent.includes(cred)
    );

    return { 
      teamSize, 
      credentials: foundCredentials,
      teamContent: teamContent.substring(0, 500)
    };
  } catch (error) {
    console.error('Team analysis error:', error.message);
    return { teamSize: 'Unknown', credentials: [], teamContent: '' };
  }
}

// Agent: Service Gap Analysis Agent
async function serviceGapAgent(doctor) {
  try {
    const query = `"${doctor.displayName}" services "we offer" treatments specialties procedures`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY
      },
      params: { q: query, count: 5 }
    });

    const results = response.data.results || [];
    const servicesContent = results.map(r => r.description || '').join(' ').toLowerCase();
    
    // Standard services by specialty
    const dentalServices = [
      'cleanings', 'fillings', 'crowns', 'bridges', 'implants', 'orthodontics', 
      'whitening', 'root canal', 'extractions', 'periodontics', 'oral surgery'
    ];
    
    const currentServices = dentalServices.filter(service => 
      servicesContent.includes(service)
    );
    
    const missingServices = dentalServices.filter(service => 
      !servicesContent.includes(service)
    );

    return { 
      currentServices, 
      gaps: missingServices.slice(0, 5), // Top 5 gaps
      servicesContent: servicesContent.substring(0, 500)
    };
  } catch (error) {
    console.error('Service gap analysis error:', error.message);
    return { currentServices: [], gaps: [], servicesContent: '' };
  }
}

// Agent: Practice Sentiment Analyzer
async function practiceSentimentAgent(practiceData) {
  try {
    if (!practiceData.websiteUrl) {
      return { sentiment: 'neutral', positioning: 'unknown', tone: 'professional' };
    }

    // Use Claude to analyze website sentiment
    const prompt = `Analyze the sentiment and positioning of this dental practice:

WEBSITE: ${practiceData.websiteUrl}
TITLE: ${practiceData.websiteTitle || ''}
DESCRIPTION: ${practiceData.description || ''}

Based on this information, determine:
1. SENTIMENT: conservative, innovative, premium, budget-friendly, family-oriented
2. POSITIONING: cutting-edge technology leader, family practice, luxury experience, affordable care
3. TONE: professional, friendly, clinical, marketing-heavy

Return JSON: {"sentiment": "...", "positioning": "...", "tone": "..."}`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    try {
      return JSON.parse(response.data.content[0].text);
    } catch {
      return { sentiment: 'professional', positioning: 'general practice', tone: 'professional' };
    }
  } catch (error) {
    console.error('Sentiment analysis error:', error.message);
    return { sentiment: 'neutral', positioning: 'unknown', tone: 'professional' };
  }
}

// Enhanced Sales Rep Brief Generator (Uses Claude-3-Opus for reasoning)
async function generateSalesRepBrief(doctor, product, data) {
  try {
    const prompt = `You are an elite medical sales intelligence analyst. Create a GAME-CHANGING sales rep brief.

DOCTOR: ${doctor.displayName}
SPECIALTY: ${doctor.specialty}  
LOCATION: ${doctor.city}, ${doctor.state}
NPI: ${doctor.npi}

PRACTICE INTELLIGENCE:
- Website: ${data.practice.websiteUrl || 'Not found'}
- Tech Stack: ${data.techStack.equipment?.join(', ') || 'None identified'}
- Team Size: ${data.team.teamSize || 'Unknown'}
- Sentiment: ${data.sentiment.sentiment || 'neutral'} / ${data.sentiment.positioning || 'unknown'}

PAIN POINTS DISCOVERED:
- Patient Complaints: ${data.painPoints.painPoints?.join(', ') || 'None found'}

RECENT NEWS & RECOGNITION:
- News Items: ${data.news.newsItems?.map(n => n.title).join(', ') || 'None found'}

SERVICE GAPS IDENTIFIED:
- Missing Services: ${data.gaps.gaps?.join(', ') || 'None identified'}
- Current Services: ${data.gaps.currentServices?.join(', ') || 'Basic services'}

SOCIAL MEDIA:
- Instagram: ${data.social.instagram || 'Not found'}
- Followers: ${data.social.followers || 0}

PRODUCT TO SELL: ${product}

Create a sales rep brief with:
1. DOCTOR OVERVIEW (specialty, location, recognition, team size)
2. CURRENT TECH STACK & GAPS (what they have vs what they're missing)
3. PATIENT PAIN POINTS (specific complaints that your product solves)
4. CONVERSATION STARTERS (recent news, awards, recognition to mention)
5. PRACTICE SENTIMENT (conservative vs innovative approach needed)
6. IMMEDIATE OPPORTUNITIES (service gaps your product fills)
7. OBJECTION HANDLING (based on sentiment and current setup)
8. NEXT STEPS (specific action plan with timing)

Focus on ACTIONABLE INTELLIGENCE that gives this sales rep a massive advantage. Include specific talking points and pain points.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text;
  } catch (error) {
    console.error('Sales rep brief generation error:', error.message);
    return `Enhanced Sales Brief for ${doctor.displayName}: Game-changing intelligence analysis pending due to technical issue.`;
  }
}

// Puppeteer Website Search (fallback when APIs don't find the website)
async function puppeteerWebsiteSearch(doctor) {
  try {
    // Import puppeteer dynamically
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Search Google for the doctor's practice
    const searchName = doctor.organizationName || doctor.displayName;
    const searchQuery = `${searchName} ${doctor.city} ${doctor.state} dentist`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    console.log(`🔍 Puppeteer searching: ${searchQuery}`);
    
    await page.goto(googleUrl, { waitUntil: 'networkidle2', timeout: 10000 });
    
    // Extract search results
    const searchResults = await page.evaluate(() => {
      const results = [];
      const resultElements = document.querySelectorAll('div[data-ved] h3');
      
      for (let i = 0; i < Math.min(5, resultElements.length); i++) {
        const element = resultElements[i];
        const linkElement = element.closest('a');
        if (linkElement) {
          const url = linkElement.href;
          const title = element.textContent;
          
          // Skip directory websites
          if (!url.includes('healthgrades') && 
              !url.includes('vitals.com') && 
              !url.includes('zocdoc') && 
              !url.includes('doximity') &&
              !url.includes('linkedin') &&
              !url.includes('facebook') &&
              !url.includes('google.com')) {
            results.push({ url, title });
          }
        }
      }
      return results;
    });
    
    await browser.close();
    
    const practiceWebsite = searchResults[0]; // Take first non-directory result
    
    return {
      websiteUrl: practiceWebsite?.url || null,
      websiteTitle: practiceWebsite?.title || null,
      description: `Found via Puppeteer: ${searchQuery}`,
      isPrivatePractice: !!practiceWebsite,
      searchResults: searchResults.slice(0, 3),
      foundVia: 'puppeteer'
    };
    
  } catch (error) {
    console.error('Puppeteer website search error:', error.message);
    return { websiteUrl: null, isPrivatePractice: false, foundVia: 'puppeteer-failed' };
  }
}

export default router;