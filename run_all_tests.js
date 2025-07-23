import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define all test files with their expected behavior
const testFiles = [
  { name: 'test_supabase.js', script: 'test:supabase', description: 'Supabase connection test' },
  { name: 'test_transcription.js', script: 'test:transcription', description: 'Audio transcription test', requiresAudio: true },
  { name: 'test_openrouter_analysis.js', script: 'test:openrouter', description: 'OpenRouter analysis test', requiresApiKey: 'OPENROUTER_API_KEY' },
  { name: 'test_brave_search.js', script: 'test:brave', description: 'Brave search test', requiresApiKey: 'BRAVE_API_KEY' },
  { name: 'test_email_service.js', script: 'test:email', description: 'Email service test' },
  { name: 'test_voice_cloning.js', script: 'test:voice-cloning', description: 'Voice cloning test' },
  { name: 'test_knowledge_bank.js', script: 'test:knowledge-bank', description: 'Knowledge bank test' },
  { name: 'test_twilio.js', script: 'test:twilio', description: 'Twilio service test', requiresApiKey: 'TWILIO_AUTH_TOKEN' },
  { name: 'test_stripe_checkout.js', script: null, description: 'Stripe checkout test', requiresApiKey: 'STRIPE_SECRET_KEY' },
  { name: 'test_stripe_webhook.js', script: null, description: 'Stripe webhook test', requiresApiKey: 'STRIPE_SECRET_KEY' }
];

// Additional individual test files to check
const individualTests = [
  'test_webhook.js',
  'test_supabase_with_log.js',
  'test_all_endpoints.js',
  'test_correct_endpoints.js',
  'test_dashboard_endpoints.js',
  'test_call_transcription.js',
  'test_audio_clip_service.js',
  'test_metrics_aggregator.js',
  'test_real_call.js',
  'test_repspheres_emails.js',
  'test_research.js'
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function runTest(command, testName) {
  return new Promise((resolve) => {
    console.log(`${colors.blue}Running ${testName}...${colors.reset}`);
    
    const child = spawn('npm', ['run', command], {
      stdio: 'pipe',
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        testName,
        command,
        exitCode: code,
        stdout,
        stderr
      });
    });
    
    // Set timeout for tests
    setTimeout(() => {
      child.kill();
      resolve({
        testName,
        command,
        exitCode: -1,
        stdout,
        stderr: stderr + '\nTest timed out after 30 seconds'
      });
    }, 30000);
  });
}

function runDirectTest(filename) {
  return new Promise((resolve) => {
    console.log(`${colors.blue}Running ${filename} directly...${colors.reset}`);
    
    const child = spawn('node', [filename], {
      stdio: 'pipe',
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        testName: filename,
        command: `node ${filename}`,
        exitCode: code,
        stdout,
        stderr
      });
    });
    
    // Set timeout for tests
    setTimeout(() => {
      child.kill();
      resolve({
        testName: filename,
        command: `node ${filename}`,
        exitCode: -1,
        stdout,
        stderr: stderr + '\nTest timed out after 30 seconds'
      });
    }, 30000);
  });
}

async function checkEnvironmentVariables() {
  console.log(`${colors.cyan}=== Environment Variables Check ===${colors.reset}`);
  
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'BRAVE_API_KEY',
    'TWILIO_AUTH_TOKEN',
    'STRIPE_SECRET_KEY'
  ];
  
  const missingVars = [];
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      console.log(`${colors.green}✓${colors.reset} ${varName} is set`);
    } else {
      console.log(`${colors.yellow}⚠${colors.reset} ${varName} is missing`);
      missingVars.push(varName);
    }
  }
  
  return missingVars;
}

async function checkFileExists(filename) {
  try {
    await fs.promises.access(path.join(__dirname, filename));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}=== RepSpheres Backend Test Suite ===${colors.reset}\n`);
  
  // Check environment variables
  const missingVars = await checkEnvironmentVariables();
  console.log();
  
  // Check for required test files
  console.log(`${colors.cyan}=== File Existence Check ===${colors.reset}`);
  const missingFiles = [];
  
  for (const test of [...testFiles, ...individualTests.map(name => ({ name }))]) {
    const exists = await checkFileExists(test.name);
    if (exists) {
      console.log(`${colors.green}✓${colors.reset} ${test.name} exists`);
    } else {
      console.log(`${colors.red}✗${colors.reset} ${test.name} is missing`);
      missingFiles.push(test.name);
    }
  }
  console.log();
  
  // Run npm script tests
  console.log(`${colors.cyan}=== Running NPM Script Tests ===${colors.reset}`);
  const results = [];
  
  for (const test of testFiles) {
    if (test.script && !missingFiles.includes(test.name)) {
      const result = await runTest(test.script, test.description);
      results.push(result);
      
      if (result.exitCode === 0) {
        console.log(`${colors.green}✓ PASS${colors.reset} ${result.testName}`);
      } else {
        console.log(`${colors.red}✗ FAIL${colors.reset} ${result.testName} (Exit code: ${result.exitCode})`);
        if (result.stderr) {
          console.log(`  Error: ${result.stderr.split('\n')[0]}`);
        }
      }
    }
  }
  
  // Run individual tests
  console.log(`\n${colors.cyan}=== Running Individual Tests ===${colors.reset}`);
  
  for (const filename of individualTests) {
    if (!missingFiles.includes(filename)) {
      const result = await runDirectTest(filename);
      results.push(result);
      
      if (result.exitCode === 0) {
        console.log(`${colors.green}✓ PASS${colors.reset} ${result.testName}`);
      } else {
        console.log(`${colors.red}✗ FAIL${colors.reset} ${result.testName} (Exit code: ${result.exitCode})`);
        if (result.stderr) {
          console.log(`  Error: ${result.stderr.split('\n')[0]}`);
        }
      }
    }
  }
  
  // Generate summary report
  console.log(`\n${colors.cyan}=== Test Summary Report ===${colors.reset}`);
  
  const passed = results.filter(r => r.exitCode === 0).length;
  const failed = results.filter(r => r.exitCode !== 0).length;
  const total = results.length;
  
  console.log(`Total tests run: ${total}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`Success rate: ${Math.round((passed / total) * 100)}%`);
  
  if (missingVars.length > 0) {
    console.log(`\n${colors.yellow}Missing environment variables: ${missingVars.join(', ')}${colors.reset}`);
  }
  
  if (missingFiles.length > 0) {
    console.log(`${colors.red}Missing test files: ${missingFiles.join(', ')}${colors.reset}`);
  }
  
  // Save detailed results to file
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, successRate: Math.round((passed / total) * 100) },
    missingVars,
    missingFiles,
    results: results.map(r => ({
      testName: r.testName,
      command: r.command,
      exitCode: r.exitCode,
      hasOutput: !!r.stdout,
      hasErrors: !!r.stderr,
      errorPreview: r.stderr ? r.stderr.split('\n')[0] : null
    }))
  };
  
  await fs.promises.writeFile(
    path.join(__dirname, 'test-results.json'),
    JSON.stringify(reportData, null, 2)
  );
  
  console.log(`\nDetailed results saved to test-results.json`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);