// Deployment-specific diagnostic logging to validate assumptions about PORT and WebSocket issues
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('=== DEPLOYMENT FAILURE DIAGNOSTICS ===');
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);
console.log();

// 1. PORT Variable Analysis (Primary Suspected Issue)
console.log('=== PORT VARIABLE ANALYSIS (PRIMARY ISSUE) ===');
const PORT = process.env.PORT;
const DEFAULT_PORT = 3000;
const RENDER_EXPECTED_PORT = 10000;

console.log(`PORT environment variable: ${PORT ? `"${PORT}"` : 'NOT SET ❌'}`);
console.log(`Fallback port (from code): ${DEFAULT_PORT}`);
console.log(`Render expected port: ${RENDER_EXPECTED_PORT}`);

if (!PORT) {
    console.log('🚨 CRITICAL: PORT not set - app will default to 3000 but Render expects 10000');
    console.log('🚨 This will cause "Exited with status 1" after ~7 seconds');
} else if (PORT != RENDER_EXPECTED_PORT) {
    console.log(`⚠️  WARNING: PORT is set to ${PORT}, but Render typically expects ${RENDER_EXPECTED_PORT}`);
} else {
    console.log('✅ PORT correctly set to Render expected value');
}

const actualPort = PORT || DEFAULT_PORT;
console.log(`Actual port that will be used: ${actualPort}`);
console.log();

// 2. WebSocket Port Configuration (Secondary Issue)
console.log('=== WEBSOCKET PORT CONFIGURATION (SECONDARY ISSUE) ===');
const WS_PORT = process.env.WS_PORT;
const METRICS_WS_PORT = process.env.METRICS_WS_PORT;

console.log(`WS_PORT: ${WS_PORT || 'NOT SET (will default to hardcoded port)'}`);
console.log(`METRICS_WS_PORT: ${METRICS_WS_PORT || 'NOT SET (will default to hardcoded port)'}`);

// Hardcoded ports from README analysis
const HARDCODED_METRICS_PORT = 8081;
const HARDCODED_CENTRAL_WS_PORT = 8082;

console.log(`Expected hardcoded metrics WebSocket port: ${HARDCODED_METRICS_PORT}`);
console.log(`Expected hardcoded central WebSocket port: ${HARDCODED_CENTRAL_WS_PORT}`);

if (!WS_PORT || !METRICS_WS_PORT) {
    console.log('⚠️  WARNING: WebSocket ports not configured via environment variables');
    console.log('⚠️  App will try to bind to multiple hardcoded ports (8081, 8082)');
    console.log('⚠️  Render only allows binding to ONE port - this will cause failures');
}
console.log();

// 3. API Keys Check
console.log('=== API KEYS CHECK ===');
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

console.log(`ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY ? 'SET ✅' : 'NOT SET ⚠️'}`);
console.log(`SENDGRID_API_KEY: ${SENDGRID_API_KEY ? 'SET ✅' : 'NOT SET ⚠️'}`);
console.log();

// 4. All Environment Variables (for context)
console.log('=== ALL ENVIRONMENT VARIABLES ===');
const envVars = Object.keys(process.env).sort();
console.log(`Total environment variables: ${envVars.length}`);

// Show deployment-critical variables
const criticalVars = ['PORT', 'NODE_ENV', 'WS_PORT', 'METRICS_WS_PORT', 'ELEVENLABS_API_KEY', 'SENDGRID_API_KEY'];
console.log('\nCritical deployment variables:');
criticalVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '❌';
    const displayValue = value ? (varName.includes('KEY') ? `${value.substring(0, 4)}...` : value) : 'NOT SET';
    console.log(`  ${status} ${varName}: ${displayValue}`);
});
console.log();

// 5. Deployment Failure Prediction
console.log('=== DEPLOYMENT FAILURE PREDICTION ===');
let failureReasons = [];

if (!PORT) {
    failureReasons.push('PORT not set - will cause immediate deployment failure');
}

if (!WS_PORT || !METRICS_WS_PORT) {
    failureReasons.push('WebSocket ports not configured - may cause port binding conflicts');
}

if (failureReasons.length > 0) {
    console.log('🚨 PREDICTED DEPLOYMENT FAILURE:');
    failureReasons.forEach((reason, i) => {
        console.log(`  ${i + 1}. ${reason}`);
    });
} else {
    console.log('✅ No obvious deployment failure indicators detected');
}
console.log();

// 6. Fix Recommendations
console.log('=== IMMEDIATE FIX RECOMMENDATIONS ===');
if (!PORT) {
    console.log('1. 🔧 ADD: PORT=10000 to Render environment variables');
}
if (!WS_PORT || !METRICS_WS_PORT) {
    console.log('2. 🔧 ADD: WS_PORT=10000 and METRICS_WS_PORT=10000 to force single port usage');
}
if (!ELEVENLABS_API_KEY || !SENDGRID_API_KEY) {
    console.log('3. 🔧 ADD: Missing API keys if required by application');
}
console.log();

// 7. Test Port Binding (Simulation)
console.log('=== PORT BINDING SIMULATION ===');
console.log(`Application will attempt to bind to port: ${actualPort}`);
console.log(`Health checks will hit port: ${RENDER_EXPECTED_PORT || 'unknown'}`);

if (actualPort != RENDER_EXPECTED_PORT) {
    console.log('🚨 MISMATCH: App port != Health check port = DEPLOYMENT FAILURE');
} else {
    console.log('✅ MATCH: App port == Health check port = Should work');
}
console.log();

console.log('=== DIAGNOSTICS COMPLETE ===');
console.log('Save this output and compare before/after environment variable changes');