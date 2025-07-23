import express from 'express';

import knowledgeBankService, { upload } from '../services/knowledgeBankService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Document upload endpoint
router.post('/documents/upload', upload.single('document'), async (req, res) => {
  try {
    const userId = req.user.id;
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    const document = await knowledgeBankService.uploadDocument(req.file, userId, metadata);
    
    res.json(successResponse({ document }, 'Document uploaded successfully'));
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json(errorResponse('UPLOAD_ERROR', 'Failed to upload document', error.message, 500));
  }
});

// URL processing endpoint
router.post('/documents/url', async (req, res) => {
  try {
    const { url, metadata = {} } = req.body;
    const userId = req.user.id;
    
    if (!url) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'URL is required', null, 400));
    }
    
    const document = await knowledgeBankService.processURL(url, userId, metadata);
    
    res.json(successResponse({ document }, 'URL processed successfully'));
  } catch (error) {
    console.error('Error processing URL:', error);
    res.status(500).json(errorResponse('URL_PROCESS_ERROR', 'Failed to process URL', error.message, 500));
  }
});

// RAG query endpoint
router.post('/query', async (req, res) => {
  try {
    const { query, agentId, limit = 5 } = req.body;
    
    if (!query || !agentId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Query and agentId are required', null, 400));
    }
    
    const result = await knowledgeBankService.queryKnowledge(query, agentId, limit);
    
    res.json(successResponse(result));
  } catch (error) {
    console.error('Error querying knowledge:', error);
    res.status(500).json(errorResponse('QUERY_ERROR', 'Failed to query knowledge', error.message, 500));
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
    
    res.json(successResponse({ tracks }));
  } catch (error) {
    console.error('Error fetching specialization tracks:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch specialization tracks', error.message, 500));
  }
});

router.post('/specializations', async (req, res) => {
  try {
    const trackData = req.body;
    const track = await knowledgeBankService.createSpecializationTrack(trackData);
    
    res.json(successResponse({ track }, 'Specialization track created successfully'));
  } catch (error) {
    console.error('Error creating specialization track:', error);
    res.status(500).json(errorResponse('CREATE_ERROR', 'Failed to create specialization track', error.message, 500));
  }
});

router.post('/specializations/enroll', async (req, res) => {
  try {
    const { agentId, trackId } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !trackId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'agentId and trackId are required', null, 400));
    }
    
    const enrollment = await knowledgeBankService.enrollAgentInTrack(agentId, trackId, userId);
    
    res.json(successResponse({ enrollment }, 'Agent enrolled in track successfully'));
  } catch (error) {
    console.error('Error enrolling agent in track:', error);
    res.status(500).json(errorResponse('ENROLLMENT_ERROR', 'Failed to enroll agent in track', error.message, 500));
  }
});

// Progress tracking endpoints
router.post('/progress/update', async (req, res) => {
  try {
    const { agentId, documentId, progress } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !documentId || progress === undefined) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'agentId, documentId, and progress are required', null, 400));
    }
    
    const progressData = await knowledgeBankService.updateAgentProgress(
      agentId, 
      documentId, 
      progress, 
      userId
    );
    
    res.json(successResponse({ progress: progressData }, 'Progress updated successfully'));
  } catch (error) {
    console.error('Error updating agent progress:', error);
    res.status(500).json(errorResponse('PROGRESS_UPDATE_ERROR', 'Failed to update agent progress', error.message, 500));
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
    
    res.json(successResponse({ progress }));
  } catch (error) {
    console.error('Error fetching agent progress:', error);
    res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch agent progress', error.message, 500));
  }
});

// Quiz endpoints
router.post('/quizzes', async (req, res) => {
  try {
    const quizData = req.body;
    const quiz = await knowledgeBankService.createQuiz(quizData);
    
    res.json(successResponse({ quiz }, 'Quiz created successfully'));
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json(errorResponse('QUIZ_CREATE_ERROR', 'Failed to create quiz', error.message, 500));
  }
});

router.post('/quizzes/submit', async (req, res) => {
  try {
    const { quizId, agentId, answers } = req.body;
    const userId = req.user.id;
    
    if (!quizId || !agentId || !answers) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'quizId, agentId, and answers are required', null, 400));
    }
    
    const attempt = await knowledgeBankService.submitQuizAttempt(
      quizId, 
      agentId, 
      userId, 
      answers
    );
    
    res.json(successResponse({ attempt }, 'Quiz submitted successfully'));
  } catch (error) {
    console.error('Error submitting quiz attempt:', error);
    res.status(500).json(errorResponse('QUIZ_SUBMIT_ERROR', 'Failed to submit quiz attempt', error.message, 500));
  }
});

// Curriculum endpoints
router.post('/curricula', async (req, res) => {
  try {
    const curriculumData = req.body;
    const userId = req.user.id;
    
    const curriculum = await knowledgeBankService.createCustomCurriculum(curriculumData, userId);
    
    res.json(successResponse({ curriculum }, 'Curriculum created successfully'));
  } catch (error) {
    console.error('Error creating curriculum:', error);
    res.status(500).json(errorResponse('CURRICULUM_CREATE_ERROR', 'Failed to create curriculum', error.message, 500));
  }
});

router.post('/curricula/enroll', async (req, res) => {
  try {
    const { curriculumId, agentId } = req.body;
    const userId = req.user.id;
    
    if (!curriculumId || !agentId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'curriculumId and agentId are required', null, 400));
    }
    
    const enrollment = await knowledgeBankService.enrollAgentInCurriculum(
      curriculumId, 
      agentId, 
      userId
    );
    
    res.json(successResponse({ enrollment }, 'Agent enrolled in curriculum successfully'));
  } catch (error) {
    console.error('Error enrolling agent in curriculum:', error);
    res.status(500).json(errorResponse('CURRICULUM_ENROLL_ERROR', 'Failed to enroll agent in curriculum', error.message, 500));
  }
});

router.get('/curricula/:curriculumId/progress/:agentId', async (req, res) => {
  try {
    const { curriculumId, agentId } = req.params;
    
    const progress = await knowledgeBankService.getCurriculumProgress(curriculumId, agentId);
    
    res.json(successResponse({ progress }));
  } catch (error) {
    console.error('Error fetching curriculum progress:', error);
    res.status(500).json(errorResponse('PROGRESS_FETCH_ERROR', 'Failed to fetch curriculum progress', error.message, 500));
  }
});

// Retention testing endpoint
router.post('/retention-test', async (req, res) => {
  try {
    const { agentId, knowledgeIds = [] } = req.body;
    const userId = req.user.id;
    
    if (!agentId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETER', 'agentId is required', null, 400));
    }
    
    const test = await knowledgeBankService.conductRetentionTest(agentId, userId, knowledgeIds);
    
    res.json(successResponse({ test }, 'Retention test completed successfully'));
  } catch (error) {
    console.error('Error conducting retention test:', error);
    res.status(500).json(errorResponse('RETENTION_TEST_ERROR', 'Failed to conduct retention test', error.message, 500));
  }
});

// Analytics endpoint
router.get('/analytics/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    
    const analytics = await knowledgeBankService.getAgentLearningAnalytics(agentId, userId);
    
    res.json(successResponse({ analytics }));
  } catch (error) {
    console.error('Error fetching agent analytics:', error);
    res.status(500).json(errorResponse('ANALYTICS_ERROR', 'Failed to fetch agent analytics', error.message, 500));
  }
});

// Certificate generation endpoint
router.post('/certificates/generate', async (req, res) => {
  try {
    const { agentId, trackId } = req.body;
    const userId = req.user.id;
    
    if (!agentId || !trackId) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'agentId and trackId are required', null, 400));
    }
    
    const certificateUrl = await knowledgeBankService.generateCertificate(agentId, trackId, userId);
    
    res.json(successResponse({ certificateUrl }, 'Certificate generated successfully'));
  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json(errorResponse('CERTIFICATE_ERROR', 'Failed to generate certificate', error.message, 500));
  }
});

export default router;