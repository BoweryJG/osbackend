
import { jest } from '@jest/globals';

import transcriptionService from '../../transcription_service.js';

const { transcribeAudio, analyzeTranscription, processAudioFromUrl } = transcriptionService;

describe('Transcription Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('transcribeAudio', () => {
    test('should throw error when OpenAI API key is not configured', async () => {
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(transcribeAudio('./test-audio.mp3')).rejects.toThrow(
        'OpenAI API key not configured'
      );

      // Restore the original value
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      }
    });

    test('should handle missing audio files gracefully', async () => {
      const nonExistentFile = './non-existent-audio.mp3';
      
      if (process.env.OPENAI_API_KEY) {
        await expect(transcribeAudio(nonExistentFile)).rejects.toThrow();
      } else {
        await expect(transcribeAudio(nonExistentFile)).rejects.toThrow(
          'OpenAI API key not configured'
        );
      }
    });
  });

  describe('analyzeTranscription', () => {
    test('should throw error when OpenAI API key is not configured', async () => {
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(
        analyzeTranscription('Sample transcription text')
      ).rejects.toThrow('OpenAI API key not configured');

      // Restore the original value
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      }
    });

    test('should require transcription text', async () => {
      if (process.env.OPENAI_API_KEY) {
        await expect(analyzeTranscription('')).rejects.toThrow();
      } else {
        await expect(analyzeTranscription('')).rejects.toThrow(
          'OpenAI API key not configured'
        );
      }
    });
  });

  describe('processAudioFromUrl', () => {
    test('should require valid parameters', async () => {
      await expect(
        processAudioFromUrl(null, 'http://example.com/audio.mp3', 'test.mp3')
      ).rejects.toThrow();
    });

    test('should handle invalid URLs', async () => {
      const result = await processAudioFromUrl(
        'test-user-id',
        'invalid-url',
        'test.mp3'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});

describe('Transcription Service Integration', () => {
  test('should have all required exports', () => {
    expect(typeof transcribeAudio).toBe('function');
    expect(typeof analyzeTranscription).toBe('function');
    expect(typeof transcriptionService.processAudioFile).toBe('function');
    expect(typeof transcriptionService.processAudioFromUrl).toBe('function');
    expect(typeof transcriptionService.getUserTranscriptions).toBe('function');
    expect(typeof transcriptionService.getTranscriptionById).toBe('function');
    expect(typeof transcriptionService.deleteTranscription).toBe('function');
  });
});