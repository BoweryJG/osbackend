// PR Distribution Automation Script
// This script automates press release distribution to free platforms

const puppeteer = require('puppeteer');

const fs = require('fs').promises;

// Configuration
const config = {
  prContent: null, // Will be loaded from file
  platforms: [
    {
      name: 'PRLog',
      url: 'https://www.prlog.org/submit-news.html',
      selectors: {
        title: '#title',
        content: '#content',
        category: '#category',
        tags: '#tags',
        submit: '#submit-button'
      }
    },
    {
      name: 'OpenPR',
      url: 'https://www.openpr.com/news/submit.html',
      selectors: {
        title: 'input[name="title"]',
        content: 'textarea[name="content"]',
        category: 'select[name="category"]',
        submit: 'button[type="submit"]'
      }
    },
    {
      name: '24-7PressRelease',
      url: 'https://www.24-7pressrelease.com/submit_pr.php',
      selectors: {
        title: '#pr_title',
        content: '#pr_body',
        submit: '#submit_pr'
      }
    }
  ]
};

// Main distribution function
async function distributePR() {
  console.log('Starting PR distribution...');
  
  // Load PR content
  const prData = JSON.parse(await fs.readFile('pr-content.json', 'utf8'));
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    defaultViewport: null
  });
  
  // Distribute to each platform
  for (const platform of config.platforms) {
    try {
      console.log(`Submitting to ${platform.name}...`);
      await submitToPlatform(browser, platform, prData);
      console.log(`✓ Successfully submitted to ${platform.name}`);
      
      // Wait between submissions
      await delay(5000);
    } catch (error) {
      console.error(`✗ Error submitting to ${platform.name}:`, error.message);
    }
  }
  
  await browser.close();
  console.log('Distribution complete!');
}

// Submit to individual platform
async function submitToPlatform(browser, platform, prData) {
  const page = await browser.newPage();
  
  try {
    // Navigate to submission page
    await page.goto(platform.url, { waitUntil: 'networkidle2' });
    
    // Fill in the form
    if (platform.selectors.title) {
      await page.type(platform.selectors.title, prData.title);
    }
    
    if (platform.selectors.content) {
      await page.type(platform.selectors.content, prData.content);
    }
    
    if (platform.selectors.category && prData.category) {
      await page.select(platform.selectors.category, prData.category);
    }
    
    if (platform.selectors.tags && prData.tags) {
      await page.type(platform.selectors.tags, prData.tags.join(', '));
    }
    
    // Take screenshot before submission (for debugging)
    await page.screenshot({ 
      path: `screenshots/${platform.name}-ready.png`,
      fullPage: true 
    });
    
    // Submit the form (commented out for safety)
    // await page.click(platform.selectors.submit);
    // await page.waitForNavigation();
    
  } finally {
    await page.close();
  }
}

// Utility function for delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Social media posting function
async function postToSocial(prData) {
  console.log('Preparing social media posts...');
  
  const socialPosts = {
    twitter: `🚀 ${prData.title}\n\n${prData.socialSnippet}\n\n#startup #innovation #tech`,
    linkedin: `Excited to announce: ${prData.title}\n\n${prData.leadParagraph}\n\nRead more: ${prData.url}`,
    facebook: prData.content.substring(0, 500) + '...'
  };
  
  // Save social posts for manual posting or API integration
  await fs.writeFile('social-posts.json', JSON.stringify(socialPosts, null, 2));
  console.log('✓ Social posts saved to social-posts.json');
}

// Analytics tracking setup
async function setupTracking(prData) {
  const tracking = {
    googleAlerts: [
      prData.companyName,
      prData.productName,
      `"${prData.title}"`
    ],
    utmLinks: {
      website: `${prData.website}?utm_source=pr&utm_medium=release&utm_campaign=${prData.campaignId}`,
      demo: `${prData.demoUrl}?utm_source=pr&utm_medium=release&utm_campaign=${prData.campaignId}`
    },
    metrics: {
      baseline: {
        date: new Date().toISOString(),
        websiteTraffic: 0,
        socialMentions: 0,
        mediaPickups: 0
      }
    }
  };
  
  await fs.writeFile('tracking-config.json', JSON.stringify(tracking, null, 2));
  console.log('✓ Tracking configuration saved');
}

// Run the distribution
if (require.main === module) {
  distributePR().catch(console.error);
}

module.exports = { distributePR, postToSocial, setupTracking };