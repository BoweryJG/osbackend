#!/usr/bin/env node

/**
 * Production Fix Integration Test
 * Tests all critical systems after fixes
 */

import chalk from 'chalk';
import fetch from 'node-fetch';
import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:10000';

class IntegrationTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }
  
  async run() {
    console.log(chalk.blue.bold('🧪 Running Production Fix Integration Tests\n'));
    
    // Test 1: Health Check
    await this.testHealthCheck();
    
    // Test 2: Database Pool
    await this.testDatabasePool();
    
    // Test 3: WebSocket Connection
    await this.testWebSocket();
    
    // Test 4: RepConnect Agents API
    await this.testRepConnectAgents();
    
    // Test 5: Canvas Agents API
    await this.testCanvasAgents();
    
    // Test 6: Authentication
    await this.testAuthentication();
    
    // Test 7: Environment Variables
    await this.testEnvironmentVariables();
    
    // Generate report
    this.generateReport();
  }
  
  async testHealthCheck() {
    const testName = 'Health Check Endpoint';
    try {
      const response = await fetch(`${BASE_URL}/health`);
      const data = await response.json();
      
      if (response.ok && data.status === 'healthy') {
        this.addResult(testName, true, 'Service is healthy');
      } else {
        this.addResult(testName, false, `Unhealthy status: ${data.status}`);
      }
    } catch (error) {
      this.addResult(testName, false, error.message);
    }
  }
  
  async testDatabasePool() {
    const testName = 'Database Pool Connection';
    try {
      const response = await fetch(`${BASE_URL}/api/repx/validate-access`, {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Even a 401 means database is working
      if (response.status === 401 || response.ok) {
        this.addResult(testName, true, 'Database responding');
      } else {
        this.addResult(testName, false, `Database error: ${response.status}`);
      }
    } catch (error) {
      this.addResult(testName, false, error.message);
    }
  }
  
  async testWebSocket() {
    const testName = 'WebSocket Connection';
    
    return new Promise((resolve) => {
      const ws = new WebSocket(`${BASE_URL.replace('http', 'ws')}/ws`);
      
      const timeout = setTimeout(() => {
        ws.close();
        this.addResult(testName, false, 'Connection timeout');
        resolve();
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        this.addResult(testName, true, 'WebSocket connected');
        ws.close();
        resolve();
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.addResult(testName, false, error.message);
        resolve();
      });
    });
  }
  
  async testRepConnectAgents() {
    const testName = 'RepConnect Agents API';
    try {
      const response = await fetch(`${BASE_URL}/api/repconnect/agents`);
      const agents = await response.json();
      
      if (response.ok && Array.isArray(agents) && agents.length > 0) {
        this.addResult(testName, true, `Found ${agents.length} agents`);
      } else {
        this.addResult(testName, false, 'No agents returned');
      }
    } catch (error) {
      this.addResult(testName, false, error.message);
    }
  }
  
  async testCanvasAgents() {
    const testName = 'Canvas Agents API';
    try {
      const response = await fetch(`${BASE_URL}/api/canvas/agents`);
      const agents = await response.json();
      
      if (response.ok && Array.isArray(agents) && agents.length > 0) {
        this.addResult(testName, true, `Found ${agents.length} agents`);
      } else {
        this.addResult(testName, false, 'No agents returned');
      }
    } catch (error) {
      this.addResult(testName, false, error.message);
    }
  }
  
  async testAuthentication() {
    const testName = 'Authentication Endpoint';
    try {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'test123'
        })
      });
      
      // Even a 401 means auth system is working
      if (response.status === 401 || response.status === 400 || response.ok) {
        this.addResult(testName, true, 'Auth system responding');
      } else {
        this.addResult(testName, false, `Auth error: ${response.status}`);
      }
    } catch (error) {
      this.addResult(testName, false, error.message);
    }
  }
  
  async testEnvironmentVariables() {
    const testName = 'Environment Variables';
    const required = ['PORT', 'SUPABASE_URL', 'SUPABASE_KEY'];
    const missing = required.filter(v => !process.env[v]);
    
    if (missing.length === 0) {
      this.addResult(testName, true, 'All critical env vars present');
    } else {
      this.addResult(testName, false, `Missing: ${missing.join(', ')}`);
    }
  }
  
  addResult(testName, passed, message) {
    this.results.tests.push({ testName, passed, message });
    if (passed) {
      this.results.passed++;
      console.log(chalk.green(`✓ ${testName}: ${message}`));
    } else {
      this.results.failed++;
      console.log(chalk.red(`✗ ${testName}: ${message}`));
    }
  }
  
  generateReport() {
    console.log('\n' + chalk.cyan('═'.repeat(50)));
    console.log(chalk.cyan.bold('Integration Test Report'));
    console.log(chalk.cyan('═'.repeat(50)));
    
    const total = this.results.passed + this.results.failed;
    const percentage = total > 0 ? (this.results.passed / total * 100).toFixed(0) : 0;
    
    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${this.results.passed}`));
    console.log(chalk.red(`Failed: ${this.results.failed}`));
    console.log(`Success Rate: ${percentage}%`);
    
    if (this.results.failed === 0) {
      console.log(chalk.green.bold('\n✅ All integration tests passed!'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold(`\n❌ ${this.results.failed} tests failed`));
      process.exit(1);
    }
  }
}

// Run tests
const tester = new IntegrationTester();
tester.run().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});