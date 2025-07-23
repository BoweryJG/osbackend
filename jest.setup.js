import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables for tests
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests unless VERBOSE_TESTS is set
if (!process.env.VERBOSE_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn()
  };
}

// Global test timeout
jest.setTimeout(30000);

// Mock external services that shouldn't be called during testing
jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'test-message-sid' })
    }
  }))
}));

// Setup global test variables
global.testConfig = {
  supabaseConnected: false,
  skipExternalTests: !process.env.RUN_EXTERNAL_TESTS
};