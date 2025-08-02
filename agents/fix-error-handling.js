#!/usr/bin/env node

/**
 * Agent 4: Error Handling & Graceful Degradation
 * Mission: Add try-catch and fallbacks everywhere
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';

class ErrorHandlingFixAgent {
  constructor() {
    this.fixes = [];
    this.errors = [];
  }
  
  async run() {
    console.log(chalk.blue('🔧 Agent 4: Error Handling & Graceful Degradation starting...'));
    
    try {
      // Step 1: Wrap service initializations in try-catch
      await this.wrapServiceInitializations();
      
      // Step 2: Add fallback for missing ElevenLabs
      await this.addElevenLabsFallback();
      
      // Step 3: Implement WebSocket reconnection logic
      await this.addWebSocketReconnection();
      
      // Step 4: Add circuit breakers
      await this.addCircuitBreakers();
      
      console.log(chalk.green('✅ Error Handling & Graceful Degradation completed successfully!'));
      console.log(chalk.gray(`Fixed ${this.fixes.length} issues`));
      
      return {
        success: true,
        fixes: this.fixes,
        errors: this.errors
      };
      
    } catch (error) {
      console.error(chalk.red('❌ Error Handling Fix failed:'), error);
      return {
        success: false,
        fixes: this.fixes,
        errors: [...this.errors, error.message]
      };
    }
  }
  
  async wrapServiceInitializations() {
    console.log('📝 Wrapping service initializations with try-catch...');
    
    const indexPath = join(process.cwd(), 'index.js');
    let content = await readFile(indexPath, 'utf8');
    
    // Find service initialization sections
    const initPatterns = [
      {
        name: 'Database Pool',
        pattern: /\/\/ Initialize database pool\n([\s\S]*?)(?=\n\/\/|$)/,
        wrapper: (code) => `// Initialize database pool
try {
${code.trim()}
  logger.info('Database pool initialized successfully');
} catch (error) {
  logger.error('Failed to initialize database pool:', error);
  logger.warn('Running without connection pooling - performance may be degraded');
}`
      },
      {
        name: 'WebSocket Server',
        pattern: /\/\/ Start WebSocket server\n([\s\S]*?)(?=\n\/\/|$)/,
        wrapper: (code) => `// Start WebSocket server
try {
${code.trim()}
  logger.info('WebSocket server started successfully');
} catch (error) {
  logger.error('Failed to start WebSocket server:', error);
  logger.warn('Running without WebSocket support - real-time features disabled');
}`
      }
    ];
    
    let changeCount = 0;
    initPatterns.forEach(({ name, pattern, wrapper }) => {
      const match = content.match(pattern);
      if (match && !match[0].includes('try {')) {
        content = content.replace(match[0], wrapper(match[1]));
        changeCount++;
        console.log(chalk.green(`✓ Wrapped ${name} initialization`));
      }
    });
    
    if (changeCount > 0) {
      await writeFile(indexPath, content);
      this.fixes.push(`Added try-catch to ${changeCount} service initializations`);
    } else {
      console.log(chalk.yellow('⚠️  Service initializations already wrapped or not found'));
    }
  }
  
  async addElevenLabsFallback() {
    console.log('📝 Adding fallback for missing ElevenLabs API key...');
    
    const audioServicePath = join(process.cwd(), 'services/audioClipService.js');
    
    try {
      let content = await readFile(audioServicePath, 'utf8');
      
      // Add fallback in constructor
      if (!content.includes('ElevenLabs fallback mode')) {
        const constructorPattern = /constructor\(\) \{([\s\S]*?)\}/;
        const match = content.match(constructorPattern);
        
        if (match) {
          const newConstructor = `constructor() {${match[1]}
    
    // Fallback mode when ElevenLabs is not available
    this.fallbackMode = !process.env.ELEVENLABS_API_KEY;
    if (this.fallbackMode) {
      logger.warn('ElevenLabs API key not found - running in fallback mode');
      logger.info('Voice features will return mock responses');
    }
  }`;
          
          content = content.replace(match[0], newConstructor);
          
          // Add fallback methods
          const fallbackMethods = `
  
  /**
   * Fallback text-to-speech when ElevenLabs is unavailable
   */
  async fallbackTextToSpeech(text, voiceId, options = {}) {
    logger.info('Using fallback TTS for:', { text: text.substring(0, 50), voiceId });
    
    // Return mock audio data
    return {
      success: true,
      audioUrl: '/mock-audio/fallback.mp3',
      duration: Math.ceil(text.length / 15), // Rough estimate
      message: 'Generated using fallback TTS',
      fallback: true
    };
  }
  
  /**
   * Check if running in fallback mode
   */
  isInFallbackMode() {
    return this.fallbackMode;
  }`;
          
          // Add before the closing brace of the class
          const classEndIndex = content.lastIndexOf('}');
          content = content.slice(0, classEndIndex) + fallbackMethods + '\n' + content.slice(classEndIndex);
          
          await writeFile(audioServicePath, content);
          this.fixes.push('Added ElevenLabs fallback mode');
          console.log(chalk.green('✓ Added ElevenLabs fallback'));
        }
      } else {
        console.log(chalk.yellow('⚠️  ElevenLabs fallback already exists'));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not add ElevenLabs fallback:', error.message));
    }
  }
  
  async addWebSocketReconnection() {
    console.log('📝 Adding WebSocket reconnection logic...');
    
    const wsManagerPath = join(process.cwd(), 'services/websocketManager.js');
    let content = await readFile(wsManagerPath, 'utf8');
    
    // Check if reconnection logic exists
    if (!content.includes('reconnectAttempts')) {
      // Add reconnection properties
      const constructorIndex = content.indexOf('constructor() {');
      const superIndex = content.indexOf('super();', constructorIndex);
      const insertPoint = content.indexOf('\n', superIndex) + 1;
      
      const reconnectProps = `    
    // Reconnection settings
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
`;
      
      content = content.slice(0, insertPoint) + reconnectProps + content.slice(insertPoint);
      
      // Add reconnection method
      const reconnectMethod = `
  
  /**
   * Handle client reconnection with exponential backoff
   */
  async handleClientReconnect(clientId, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    if (client.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn(\`Client \${clientId} exceeded max reconnection attempts\`);
      this.clients.delete(clientId);
      return;
    }
    
    client.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, client.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    logger.info(\`Scheduling reconnection for client \${clientId} in \${delay}ms (attempt \${client.reconnectAttempts})\`);
    
    setTimeout(() => {
      if (this.clients.has(clientId)) {
        this.emit('client:reconnect', { clientId, attempt: client.reconnectAttempts });
      }
    }, delay);
  }`;
      
      // Insert before the cleanup method
      const cleanupIndex = content.indexOf('cleanup() {');
      content = content.slice(0, cleanupIndex) + reconnectMethod + '\n  \n  ' + content.slice(cleanupIndex);
      
      await writeFile(wsManagerPath, content);
      this.fixes.push('Added WebSocket reconnection logic');
      console.log(chalk.green('✓ Added WebSocket reconnection'));
    } else {
      console.log(chalk.yellow('⚠️  WebSocket reconnection already exists'));
    }
  }
  
  async addCircuitBreakers() {
    console.log('📝 Adding circuit breakers for external services...');
    
    // Create circuit breaker utility
    const circuitBreakerCode = `/**
 * Circuit Breaker for external service calls
 */
export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.lastStateChange = Date.now();
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
        logger.info(\`Circuit breaker \${this.name} entering HALF_OPEN state\`);
      } else {
        throw new Error(\`Circuit breaker \${this.name} is OPEN\`);
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.lastStateChange = Date.now();
      logger.info(\`Circuit breaker \${this.name} is now CLOSED\`);
    }
  }
  
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      logger.error(\`Circuit breaker \${this.name} is now OPEN after \${this.failures} failures\`);
    }
  }
  
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange
    };
  }
}

// Export singleton instances for common services
export const circuitBreakers = {
  elevenlabs: new CircuitBreaker('ElevenLabs', { failureThreshold: 3 }),
  openai: new CircuitBreaker('OpenAI', { failureThreshold: 5 }),
  anthropic: new CircuitBreaker('Anthropic', { failureThreshold: 5 }),
  twilio: new CircuitBreaker('Twilio', { failureThreshold: 3 }),
  sendgrid: new CircuitBreaker('SendGrid', { failureThreshold: 3 })
};

export default CircuitBreaker;`;
    
    const cbPath = join(process.cwd(), 'utils/circuitBreaker.js');
    await writeFile(cbPath, circuitBreakerCode);
    
    this.fixes.push('Created circuit breaker utility');
    console.log(chalk.green('✓ Added circuit breakers'));
  }
}

// Execute agent
const agent = new ErrorHandlingFixAgent();
agent.run().then(result => {
  process.exit(result.success ? 0 : 1);
});