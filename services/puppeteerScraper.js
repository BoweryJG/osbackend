import puppeteer from 'puppeteer';

class PuppeteerScraper {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      });
    }
  }

  async scrapeWebsite(url, options = {}) {
    const {
      waitForSelector = 'body',
      timeout = 30000,
      extractMarkdown = true
    } = options;

    await this.init();
    
    const page = await this.browser.newPage();
    
    try {
      // Set user agent to avoid bot detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout
      });
      
      // Wait for content to load
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
      
      // Extract page data
      const pageData = await page.evaluate(() => {
        // Helper function to extract text content
        const extractText = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.textContent.trim()).filter(text => text);
        };
        
        // Extract various elements
        return {
          title: document.title,
          metaDescription: document.querySelector('meta[name="description"]')?.content || '',
          
          // Headers
          h1: extractText('h1'),
          h2: extractText('h2'),
          h3: extractText('h3'),
          
          // Common content areas
          mainContent: document.querySelector('main')?.textContent?.trim() || 
                      document.querySelector('[role="main"]')?.textContent?.trim() || 
                      document.querySelector('#content')?.textContent?.trim() || '',
          
          // Services (common patterns)
          services: extractText('.service, .services li, [class*="service"] li, [id*="service"] li'),
          
          // Team/About
          teamMembers: extractText('.team-member, .doctor, .provider, [class*="team"] [class*="member"]'),
          
          // Contact info
          phones: Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => a.textContent.trim()),
          emails: Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.textContent.trim()),
          
          // Address (common patterns)
          addresses: extractText('address, .address, [class*="address"], [itemprop="address"]'),
          
          // Social media links
          socialLinks: Array.from(document.querySelectorAll('a[href*="facebook.com"], a[href*="twitter.com"], a[href*="instagram.com"], a[href*="linkedin.com"], a[href*="youtube.com"]'))
            .map(a => ({ platform: a.href.match(/(?:facebook|twitter|instagram|linkedin|youtube)/i)?.[0], url: a.href })),
          
          // Technology mentions
          techKeywords: (() => {
            const bodyText = document.body.textContent.toLowerCase();
            const techTerms = ['cerec', 'cad/cam', 'laser', 'digital', '3d', 'cone beam', 'cbct', 'intraoral scanner', 'trios', 'itero', 'primescan'];
            return techTerms.filter(term => bodyText.includes(term));
          })()
        };
      });
      
      // Convert to markdown if requested
      if (extractMarkdown) {
        const markdown = this.convertToMarkdown(pageData);
        pageData.markdown = markdown;
      }
      
      // Extract structured data
      const structuredData = this.extractStructuredData(pageData);
      
      return {
        success: true,
        url,
        data: {
          ...pageData,
          ...structuredData
        }
      };
      
    } catch (error) {
      console.error('Puppeteer scraping error:', error);
      return {
        success: false,
        url,
        error: error.message
      };
    } finally {
      await page.close();
    }
  }

  convertToMarkdown(data) {
    let markdown = `# ${data.title}\n\n`;
    
    if (data.metaDescription) {
      markdown += `${data.metaDescription}\n\n`;
    }
    
    // Add headers
    if (data.h1.length) {
      markdown += `## Main Headlines\n${data.h1.map(h => `- ${h}`).join('\n')}\n\n`;
    }
    
    // Add services
    if (data.services.length) {
      markdown += `## Services\n${data.services.map(s => `- ${s}`).join('\n')}\n\n`;
    }
    
    // Add team
    if (data.teamMembers.length) {
      markdown += `## Team Members\n${data.teamMembers.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    
    // Add contact
    if (data.phones.length || data.emails.length || data.addresses.length) {
      markdown += `## Contact Information\n`;
      if (data.phones.length) markdown += `Phone: ${data.phones.join(', ')}\n`;
      if (data.emails.length) markdown += `Email: ${data.emails.join(', ')}\n`;
      if (data.addresses.length) markdown += `Address: ${data.addresses.join('; ')}\n`;
      markdown += '\n';
    }
    
    // Add technology
    if (data.techKeywords.length) {
      markdown += `## Technology\n${data.techKeywords.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    
    return markdown;
  }

  extractStructuredData(pageData) {
    return {
      practiceInfo: {
        name: pageData.title || '',
        description: pageData.metaDescription || '',
        services: pageData.services || [],
        teamSize: pageData.teamMembers.length || 0,
        technologies: pageData.techKeywords || []
      },
      contactInfo: {
        phones: pageData.phones || [],
        emails: pageData.emails || [],
        addresses: pageData.addresses || []
      },
      socialMedia: pageData.socialLinks.reduce((acc, link) => {
        if (link.platform) acc[link.platform] = link.url;
        return acc;
      }, {}),
      techStack: pageData.techKeywords.reduce((acc, tech) => {
        acc[tech] = true;
        return acc;
      }, {})
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Create singleton instance
const scraper = new PuppeteerScraper();

// Cleanup on exit
process.on('SIGINT', async () => {
  await scraper.close();
  process.exit();
});

export default scraper;