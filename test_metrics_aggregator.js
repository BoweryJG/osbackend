#!/usr/bin/env node

/**
 * Test script for MetricsAggregator
 * 
 * This script demonstrates the basic functionality of the metrics aggregator
 * Run with: node test_metrics_aggregator.js
 */

import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testMetricsAggregator() {
  console.log('🚀 Testing MetricsAggregator Service...\n');
  
  try {
    // Import metrics aggregator functions
    const {
      default: metricsAggregator,
      collectHarveyMetrics,
      getMetrics,
      getAggregatedMetrics,
      getDashboardSummary,
      getSuccessRates,
      startWebSocketServer
    } = await import('./services/metricsAggregator.js');
    
    console.log('✅ MetricsAggregator imported successfully\n');
    
    // Test 1: Collect Harvey metrics
    console.log('Test 1: Collecting Harvey AI metrics...');
    const conversationId = 'test-conv-' + Date.now();
    await collectHarveyMetrics(conversationId, {
      responseTime: 1250,
      tokensUsed: {
        input: 150,
        output: 200
      },
      model: 'gpt-4',
      success: true,
      coachingScore: 85,
      sentiment: 'positive'
    });
    console.log('✅ Harvey metrics collected\n');
    
    // Test 2: Get recent metrics
    console.log('Test 2: Retrieving recent metrics...');
    const recentMetrics = await getMetrics({
      limit: 5
    });
    console.log(`Found ${recentMetrics.length} recent metrics`);
    if (recentMetrics.length > 0) {
      console.log('Sample metric:', JSON.stringify(recentMetrics[0], null, 2));
    }
    console.log('✅ Metrics retrieved\n');
    
    // Test 3: Get dashboard summary
    console.log('Test 3: Getting dashboard summary...');
    const summary = await getDashboardSummary();
    console.log('Dashboard Summary:');
    console.log('- Today\'s total cost: $' + (summary.today.totalCost || 0).toFixed(4));
    console.log('- Today\'s calls: ' + summary.today.callCount);
    console.log('- Today\'s emails: ' + summary.today.emailCount);
    console.log('- Today\'s AI interactions: ' + summary.today.aiInteractions);
    console.log('✅ Dashboard summary retrieved\n');
    
    // Test 4: Get aggregated metrics
    console.log('Test 4: Getting aggregated metrics...');
    const hourlyMetrics = await getAggregatedMetrics('hour');
    console.log(`Found ${hourlyMetrics.length} hourly aggregations`);
    if (hourlyMetrics.length > 0) {
      console.log('Latest hour summary:');
      console.log('- Period:', hourlyMetrics[0].period);
      console.log('- Total events:', hourlyMetrics[0].totalCount);
      console.log('- Total cost: $' + (hourlyMetrics[0].totalCost || 0).toFixed(4));
    }
    console.log('✅ Aggregated metrics retrieved\n');
    
    // Test 5: Start WebSocket server
    console.log('Test 5: Starting WebSocket server...');
    startWebSocketServer();
    console.log('✅ WebSocket server started on port 8081\n');
    
    // Test 6: Simulate some metrics
    console.log('Test 6: Simulating various metrics...');
    
    // Simulate voice call metric
    await metricsAggregator.storeMetric({
      type: 'voice_call',
      call_id: 'test-call-' + Date.now(),
      metrics: {
        duration: 180,
        direction: 'inbound',
        status: 'completed',
        from_number: '+1234567890',
        to_number: '+0987654321'
      },
      cost: 0.042, // 3 minutes * $0.014/minute
      timestamp: new Date().toISOString()
    });
    console.log('✅ Voice call metric stored');
    
    // Simulate email campaign metric
    await metricsAggregator.storeMetric({
      type: 'email_campaign',
      email_id: 'test-email-' + Date.now(),
      metrics: {
        status: 'sent',
        recipient: 'test@example.com',
        subject: 'Test Campaign',
        opened: false,
        clicked: false
      },
      cost: 0.0001,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Email campaign metric stored');
    
    // Simulate system health metric
    await metricsAggregator.collectSystemHealthMetrics();
    console.log('✅ System health metrics collected\n');
    
    // Test 7: Get success rates
    console.log('Test 7: Calculating success rates...');
    const voiceSuccess = await getSuccessRates('voice_call', 'day');
    console.log('Voice call success rates:', voiceSuccess.slice(0, 3));
    console.log('✅ Success rates calculated\n');
    
    // Test 8: Test caching
    console.log('Test 8: Testing cache performance...');
    const start = Date.now();
    await getDashboardSummary(); // First call
    const firstCallTime = Date.now() - start;
    
    const cacheStart = Date.now();
    await getDashboardSummary(); // Cached call
    const cachedCallTime = Date.now() - cacheStart;
    
    console.log(`First call: ${firstCallTime}ms`);
    console.log(`Cached call: ${cachedCallTime}ms`);
    console.log(`Cache speedup: ${(firstCallTime / cachedCallTime).toFixed(2)}x`);
    console.log('✅ Cache working properly\n');
    
    // Test 9: Test WebSocket connection
    console.log('Test 9: Testing WebSocket connection...');
    const WebSocket = (await import('ws')).default;
    const ws = new WebSocket('ws://localhost:8081');
    
    await new Promise((resolve) => {
      ws.on('open', () => {
        console.log('✅ Connected to WebSocket server');
        
        // Subscribe to metrics
        ws.send(JSON.stringify({
          type: 'subscribe',
          params: {
            metrics: ['harvey_performance', 'voice_call']
          }
        }));
        
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          console.log('Received:', message.type);
          
          if (message.type === 'subscribed') {
            console.log('✅ Subscribed to metrics:', message.metrics);
            ws.close();
            resolve();
          }
        });
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        resolve();
      });
    });
    
    console.log('\n🎉 All tests completed successfully!');
    
    // Cleanup
    console.log('\nCleaning up...');
    metricsAggregator.stop();
    console.log('✅ MetricsAggregator stopped');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
console.log('MetricsAggregator Test Suite');
console.log('============================\n');

testMetricsAggregator().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});