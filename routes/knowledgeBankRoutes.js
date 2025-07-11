import express from 'express';
import knowledgeBankService, { upload } from '../services/knowledgeBankService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Document upload endpoint
router.post('/documents/upload', upload.single('document'), async (req, res) => {
  try {
    const userId = req.user.id;
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    const document = await knowledgeBankService.uploadDocument(req.file, userId, metadata);
    
    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// URL processing endpoint
router.post('/documents/url', async (req, res) => {
  try {
    const { url, metadata = {} } = req.body;
    const userId = req.user.id;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    const document = await knowledgeBankService.processURL(url, userId, metadata);
    
    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error processing URL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// RAG query endpoint
router.post('/query', async (req, res) => {
  try {
    const { query, agentId, limit = 5 } = req.body;
    
    if (!query || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Query and agentId are required'
      });
    }
    
    const result = await knowledgeBankService.queryKnowledge(query, agentId, limit);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error querying knowledge:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Specialization tracks endpoints
router.get('/specializations', async (req, res) => {
  try {
    const { data: tracks, error } = await req.supabase
      .from('specialization_tracks')
      .select('*')
      .eq('is_active', true);
    
    if (error) throw error;
    
    res.json({
      success: true,
      tracks
    });
  } catch (error) {
    console.error('Error fetching specialization tracks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/specializations', async (req, res) => {
  try {
    const trackData = req.body;
    const track = await knowledgeBankService.createSpecializationTrack(trackData);
    
    res.json({
      success: true,
      track
    });
  } catch (error) {
    console.error('Error creating specialization track:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/specializations/enroll', async (req, res) => {
  try {
    const { agentId, trackId } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !trackId) {
      return res.status(400).json({
        success: false,
        error: 'agentId and trackId are required'
      });
    }
    
    const enrollment = await knowledgeBankService.enrollAgentInTrack(agentId, trackId, userId);
    
    res.json({
      success: true,
      enrollment
    });
  } catch (error) {
    console.error('Error enrolling agent in track:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Progress tracking endpoints
router.post('/progress/update', async (req, res) => {
  try {
    const { agentId, documentId, progress } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !documentId || progress === undefined) {
      return res.status(400).json({
        success: false,
        error: 'agentId, documentId, and progress are required'
      });
    }
    
    const progressData = await knowledgeBankService.updateAgentProgress(
      agentId, 
      documentId, 
      progress, 
      userId
    );
    
    res.json({
      success: true,
      progress: progressData
    });
  } catch (error) {
    console.error('Error updating agent progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/progress/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    
    const { data: progress, error } = await req.supabase
      .from('agent_knowledge_progress')
      .select('*, knowledge_documents(*)')
      .eq('agent_id', agentId)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    res.json({
      success: true,
      progress
    });
  } catch (error) {
    console.error('Error fetching agent progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Quiz endpoints
router.post('/quizzes', async (req, res) => {
  try {
    const quizData = req.body;
    const quiz = await knowledgeBankService.createQuiz(quizData);
    
    res.json({
      success: true,
      quiz
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/quizzes/submit', async (req, res) => {
  try {
    const { quizId, agentId, answers } = req.body;
    const userId = req.user.id;
    
    if (!quizId || !agentId || !answers) {
      return res.status(400).json({
        success: false,
        error: 'quizId, agentId, and answers are required'
      });
    }
    
    const attempt = await knowledgeBankService.submitQuizAttempt(
      quizId, 
      agentId, 
      userId, 
      answers
    );
    
    res.json({
      success: true,
      attempt
    });
  } catch (error) {
    console.error('Error submitting quiz attempt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Curriculum endpoints
router.post('/curricula', async (req, res) => {
  try {
    const curriculumData = req.body;
    const userId = req.user.id;
    
    const curriculum = await knowledgeBankService.createCustomCurriculum(curriculumData, userId);
    
    res.json({
      success: true,
      curriculum
    });
  } catch (error) {
    console.error('Error creating curriculum:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/curricula/enroll', async (req, res) => {
  try {
    const { curriculumId, agentId } = req.body;
    const userId = req.user.id;
    
    if (!curriculumId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'curriculumId and agentId are required'
      });
    }
    
    const enrollment = await knowledgeBankService.enrollAgentInCurriculum(
      curriculumId, 
      agentId, 
      userId
    );
    
    res.json({
      success: true,
      enrollment
    });
  } catch (error) {
    console.error('Error enrolling agent in curriculum:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/curricula/:curriculumId/progress/:agentId', async (req, res) => {
  try {
    const { curriculumId, agentId } = req.params;
    
    const progress = await knowledgeBankService.getCurriculumProgress(curriculumId, agentId);
    
    res.json({
      success: true,
      progress
    });
  } catch (error) {
    console.error('Error fetching curriculum progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Retention testing endpoint
router.post('/retention-test', async (req, res) => {
  try {
    const { agentId, knowledgeIds = [] } = req.body;
    const userId = req.user.id;
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'agentId is required'
      });
    }
    
    const test = await knowledgeBankService.conductRetentionTest(agentId, userId, knowledgeIds);
    
    res.json({
      success: true,
      test
    });
  } catch (error) {
    console.error('Error conducting retention test:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Analytics endpoint
router.get('/analytics/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    
    const analytics = await knowledgeBankService.getAgentLearningAnalytics(agentId, userId);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error fetching agent analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Certificate generation endpoint
router.post('/certificates/generate', async (req, res) => {
  try {
    const { agentId, trackId } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !trackId) {
      return res.status(400).json({
        success: false,
        error: 'agentId and trackId are required'
      });
    }
    
    const certificateUrl = await knowledgeBankService.generateCertificate(agentId, trackId, userId);
    
    res.json({
      success: true,
      certificateUrl
    });
  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;