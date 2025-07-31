import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { ElevenLabsTTS } from '../services/elevenLabsTTS.js';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://cbopynuvhcymbumjnvay.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

// Audio samples configuration
const audioSamples = {
  openingHooks: [
    {
      id: 'hook1',
      text: "Did you know 73% of medical practices are losing revenue they don't even know about?",
      voice: 'rachel',
      settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 }
    },
    {
      id: 'hook2', 
      text: "What if I told you there's a way to 10x your practice efficiency in just 30 days?",
      voice: 'antoni',
      settings: { stability: 0.45, similarity_boost: 0.8, style: 0.1 }
    },
    {
      id: 'hook3',
      text: "The average medical device rep is using tools from 2015. You're not average.",
      voice: 'nicole',
      settings: { stability: 0.55, similarity_boost: 0.7, style: 0.3 }
    }
  ],
  objectionHandlers: [
    {
      id: 'objection1',
      text: "I understand your concern about implementation time. That's why we handle everything in 48 hours.",
      voice: 'rachel',
      settings: { stability: 0.6, similarity_boost: 0.75, style: 0.1 }
    },
    {
      id: 'objection2',
      text: "ROI concerns are valid. Our average client sees 300% return in the first quarter.",
      voice: 'antoni',
      settings: { stability: 0.5, similarity_boost: 0.85, style: 0.0 }
    },
    {
      id: 'objection3',
      text: "Integration complexity? Our AI handles 95% automatically. Your team just benefits.",
      voice: 'bella',
      settings: { stability: 0.55, similarity_boost: 0.8, style: 0.2 }
    }
  ],
  closingLines: [
    {
      id: 'close1',
      text: "The decision you make today determines your competitive advantage tomorrow. Let's start.",
      voice: 'antoni',
      settings: { stability: 0.4, similarity_boost: 0.9, style: 0.0 }
    },
    {
      id: 'close2',
      text: "Every minute without RepSpheres is revenue left on the table. Shall we fix that now?",
      voice: 'rachel',
      settings: { stability: 0.5, similarity_boost: 0.85, style: 0.1 }
    },
    {
      id: 'close3',
      text: "Your competitors are already using AI. The question is: leader or follower?",
      voice: 'nicole',
      settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 }
    }
  ],
  motivational: [
    {
      id: 'motivate1',
      text: "Champions don't wait for perfect conditions. They create them. Make the call.",
      voice: 'antoni',
      settings: { stability: 0.35, similarity_boost: 0.9, style: 0.3 }
    },
    {
      id: 'motivate2',
      text: "Your future self will thank you for the courage you show today. Trust the process.",
      voice: 'domi',
      settings: { stability: 0.6, similarity_boost: 0.8, style: 0.4 }
    },
    {
      id: 'motivate3',
      text: "Excellence isn't an accident. It's a choice you make every single day. Choose wisely.",
      voice: 'rachel',
      settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2 }
    }
  ],
  dataInsights: [
    {
      id: 'data1',
      text: "Market analysis shows 47% growth in AI-powered medical sales. Position yourself accordingly.",
      voice: 'elli',
      settings: { stability: 0.45, similarity_boost: 0.9, style: 0.0 }
    },
    {
      id: 'data2',
      text: "Top performers using RepSpheres close 3.7 times more deals. The data doesn't lie.",
      voice: 'rachel',
      settings: { stability: 0.5, similarity_boost: 0.85, style: 0.1 }
    },
    {
      id: 'data3',
      text: "Neural synchronization increases team performance by 85%. That's not theory, it's fact.",
      voice: 'bella',
      settings: { stability: 0.55, similarity_boost: 0.8, style: 0.0 }
    }
  ]
};

// Initialize TTS service
let tts;
try {
  tts = new ElevenLabsTTS({
    modelId: 'eleven_turbo_v2'
  });
} catch (error) {
  console.error('Failed to initialize ElevenLabs TTS:', error);
}

// Generate single audio file
router.post('/generate-single', async (req, res) => {
  try {
    const { category, sampleId } = req.body;
    
    if (!audioSamples[category]) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const sample = audioSamples[category].find(s => s.id === sampleId);
    if (!sample) {
      return res.status(400).json({ error: 'Sample not found' });
    }
    
    // Set voice for this sample
    tts.voiceId = tts.voices[sample.voice] || sample.voice;
    
    // Generate audio
    const audioData = await tts.textToSpeech(sample.text, {
      voiceSettings: sample.settings
    });
    
    // Return audio data
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioData.length,
      'X-Sample-Id': sampleId,
      'X-Voice-Used': sample.voice
    });
    res.send(audioData);
    
  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate all audio files for a category
router.post('/generate-category', async (req, res) => {
  try {
    const { category } = req.body;
    
    if (!audioSamples[category]) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const results = [];
    
    for (const sample of audioSamples[category]) {
      try {
        // Set voice for this sample
        tts.voiceId = tts.voices[sample.voice] || sample.voice;
        
        // Generate audio
        const audioData = await tts.textToSpeech(sample.text, {
          voiceSettings: sample.settings
        });
        
        // Convert to base64 for easier transport
        const base64Audio = audioData.toString('base64');
        
        results.push({
          id: sample.id,
          text: sample.text,
          voice: sample.voice,
          audioData: base64Audio,
          mimeType: 'audio/mpeg'
        });
        
      } catch (error) {
        console.error(`Error generating ${sample.id}:`, error);
        results.push({
          id: sample.id,
          error: error.message
        });
      }
    }
    
    res.json({
      category,
      generated: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results
    });
    
  } catch (error) {
    console.error('Error generating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate all audio files
router.post('/generate-all', async (req, res) => {
  try {
    const allResults = {};
    
    for (const [category, samples] of Object.entries(audioSamples)) {
      allResults[category] = [];
      
      for (const sample of samples) {
        try {
          // Set voice for this sample
          tts.voiceId = tts.voices[sample.voice] || sample.voice;
          
          // Generate audio
          const audioData = await tts.textToSpeech(sample.text, {
            voiceSettings: sample.settings
          });
          
          // Upload to Supabase Storage
          const filename = `${category}/${sample.id}.mp3`;
          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('whisper-audio')
            .upload(filename, audioData, {
              contentType: 'audio/mpeg',
              cacheControl: '3600',
              upsert: true
            });
          
          if (uploadError) {
            throw uploadError;
          }
          
          // Get public URL
          const { data: { publicUrl } } = supabase
            .storage
            .from('whisper-audio')
            .getPublicUrl(filename);
          
          allResults[category].push({
            id: sample.id,
            text: sample.text,
            voice: sample.voice,
            filename,
            url: publicUrl,
            size: audioData.length
          });
          
        } catch (error) {
          console.error(`Error generating ${category}/${sample.id}:`, error);
          allResults[category].push({
            id: sample.id,
            error: error.message
          });
        }
      }
    }
    
    // Calculate summary
    const summary = {
      totalSamples: Object.values(audioSamples).flat().length,
      generated: Object.values(allResults).flat().filter(r => !r.error).length,
      failed: Object.values(allResults).flat().filter(r => r.error).length
    };
    
    res.json({
      summary,
      results: allResults
    });
    
  } catch (error) {
    console.error('Error generating all audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sample configuration with URLs
router.get('/samples', async (req, res) => {
  const config = {};
  
  try {
    // Get all files from whisper-audio bucket
    const { data: files, error } = await supabase
      .storage
      .from('whisper-audio')
      .list('', {
        limit: 100,
        offset: 0
      });
    
    if (error) throw error;
    
    // Build URL map
    const urlMap = {};
    for (const folder of ['openingHooks', 'objectionHandlers', 'closingLines', 'motivational', 'dataInsights']) {
      const { data: categoryFiles } = await supabase
        .storage
        .from('whisper-audio')
        .list(folder, {
          limit: 100
        });
      
      if (categoryFiles) {
        for (const file of categoryFiles) {
          const { data: { publicUrl } } = supabase
            .storage
            .from('whisper-audio')
            .getPublicUrl(`${folder}/${file.name}`);
          
          urlMap[`${folder}/${file.name.replace('.mp3', '')}`] = publicUrl;
        }
      }
    }
    
    // Build response with URLs
    for (const [category, samples] of Object.entries(audioSamples)) {
      config[category] = samples.map(({ id, text, voice }) => ({
        id,
        text,
        voice,
        url: urlMap[`${category}/${id}`] || null
      }));
    }
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching samples:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  try {
    const testText = "Welcome to RepSpheres Strategic Whisper. Your AI-powered sales coach.";
    const audioData = await tts.textToSpeech(testText);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioData.length
    });
    res.send(audioData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;