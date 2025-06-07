# MCP PR Automation Setup Guide

## 1. Required MCP Servers

### Essential Free MCP Tools:
- **Content Generation**: OpenAI MCP or Claude MCP for writing
- **GitHub MCP**: Version control and collaboration
- **Web Scraping MCP**: Media contact discovery
- **File System MCP**: Local file management
- **Perplexity/Brave Search MCP**: Research and monitoring

## 2. Installation Steps

### Step 1: Install MCP Framework
```bash
# Install Node.js first (if not installed)
# Then install MCP CLI
npm install -g @modelcontextprotocol/cli

# Create MCP configuration directory
mkdir ~/.mcp
cd ~/.mcp
```

### Step 2: Configure MCP Servers
Create `mcp.json` configuration file:
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path/to/pr/files"]
    },
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "free-tier-key"
      }
    }
  }
}
```

## 3. PR Distribution Accounts

Create accounts on these free platforms:
1. **PRLog.org** - Unlimited free releases
2. **OpenPR.com** - Global distribution
3. **24-7PressRelease.com** - Free tier available
4. **PRFree.com** - Simple submission
5. **NewswireToday.com** - Tech-friendly
6. **PR.com** - Company profiles

## 4. Automation Workflow

### Basic PR Creation Script
```javascript
// pr-generator.js
const generatePR = async (companyInfo) => {
  // AI generates content
  const mainRelease = await generateMainPR(companyInfo);
  const shortVersion = await generateShortPR(mainRelease);
  const socialPosts = await generateSocialContent(mainRelease);
  
  return {
    main: mainRelease,
    short: shortVersion,
    social: socialPosts
  };
};
```

### Distribution Automation
```javascript
// distribute-pr.js
const distributePR = async (content) => {
  const platforms = [
    { name: 'PRLog', url: 'https://www.prlog.org/submit', delay: 0 },
    { name: 'OpenPR', url: 'https://www.openpr.com/submit', delay: 300 },
    { name: '24-7PR', url: 'https://www.24-7pressrelease.com/submit', delay: 600 }
  ];
  
  for (const platform of platforms) {
    await submitToPlatform(platform, content);
    await wait(platform.delay);
  }
};
```

## 5. Content Templates

### Main Press Release Structure
```
FOR IMMEDIATE RELEASE

[HEADLINE - 10-12 words, keyword-rich]

[SUBHEADLINE - Expand on main benefit]

[CITY, State] - [DATE] - [LEAD PARAGRAPH - Who, What, When, Where, Why]

[BODY PARAGRAPH 1 - Expand on the news]

[QUOTE - From company executive]

[BODY PARAGRAPH 2 - Additional details, benefits]

[BODY PARAGRAPH 3 - Market context, future plans]

[BOILERPLATE - About the company]

[CONTACT INFORMATION]
```

### Social Media Templates
**LinkedIn (300 chars):**
"Excited to announce [NEWS]. This [BENEFIT] will help [AUDIENCE] to [OUTCOME]. Learn more: [LINK]"

**Twitter/X (280 chars):**
"🚀 [COMPANY] launches [PRODUCT] - [KEY BENEFIT] for [AUDIENCE]. [LINK] #startup #innovation"

## 6. Monitoring Setup
- Google Alerts for company name
- Social media monitoring via MCP
- Analytics tracking dashboard