import puppeteerScraper from './services/puppeteerScraper.js';

async function testScraper() {
  console.log('Testing Puppeteer scraper...\n');
  
  // Test with Pure Dental website
  const testUrl = 'https://www.puredental.com/buffalo/';
  
  try {
    console.log(`Scraping: ${testUrl}`);
    const result = await puppeteerScraper.scrapeWebsite(testUrl);
    
    if (result.success) {
      console.log('\n✅ Scraping successful!');
      console.log('\nTitle:', result.data.title);
      console.log('Description:', result.data.metaDescription);
      console.log('\nServices found:', result.data.services.length);
      result.data.services.slice(0, 5).forEach(s => console.log(`  - ${s}`));
      
      console.log('\nTeam members found:', result.data.teamMembers.length);
      result.data.teamMembers.slice(0, 3).forEach(t => console.log(`  - ${t}`));
      
      console.log('\nTechnology keywords:', result.data.techKeywords);
      console.log('\nContact info:');
      console.log('  Phones:', result.data.phones);
      console.log('  Emails:', result.data.emails);
      console.log('  Addresses:', result.data.addresses);
      
      console.log('\nMarkdown preview (first 500 chars):');
      console.log(result.data.markdown.substring(0, 500) + '...');
    } else {
      console.log('❌ Scraping failed:', result.error);
    }
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Clean up
    await puppeteerScraper.close();
  }
}

testScraper();