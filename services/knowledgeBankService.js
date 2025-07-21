import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
// These will be dynamically imported when needed to avoid startup errors
let pdfParse, mammoth, cheerio;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/knowledge');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, TXT, and DOCX are allowed.'));
    }
  }
});

class KnowledgeBankService {
  constructor() {
    this.chunkSize = 1000; // Characters per chunk
    this.chunkOverlap = 200; // Overlap between chunks
  }

  // Document Processing Methods
  async uploadDocument(file, userId, metadata = {}) {
    try {
      let content = '';
      const filePath = file.path;

      // Extract content based on file type
      if (file.mimetype === 'application/pdf') {
        // Dynamically import pdf-parse when needed
        if (!pdfParse) {
          pdfParse = (await import('pdf-parse')).default;
        }
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        content = pdfData.text;
      } else if (file.mimetype === 'text/plain') {
        content = await fs.readFile(filePath, 'utf-8');
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Dynamically import mammoth when needed
        if (!mammoth) {
          mammoth = (await import('mammoth')).default;
        }
        const result = await mammoth.extractRawText({ path: filePath });
        content = result.value;
      }

      // Store document in database
      const { data: document, error } = await supabase
        .from('knowledge_documents')
        .insert({
          title: file.originalname,
          document_type: this.getDocumentType(file.mimetype),
          file_path: filePath,
          content,
          metadata,
          word_count: content.split(/\s+/).length,
          created_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      // Create embeddings
      await this.createEmbeddings(document.id, content);

      return document;
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  async processURL(url, userId, metadata = {}) {
    try {
      // Fetch content from URL
      const response = await axios.get(url);
      const html = response.data;

      // Dynamically import cheerio when needed
      if (!cheerio) {
        cheerio = await import('cheerio');
      }
      
      // Parse HTML and extract text
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style').remove();
      
      // Extract text content
      const content = $('body').text().trim().replace(/\s+/g, ' ');
      
      // Extract title
      const title = $('title').text() || new URL(url).hostname;

      // Store document
      const { data: document, error } = await supabase
        .from('knowledge_documents')
        .insert({
          title,
          document_type: 'url',
          source_url: url,
          content,
          metadata: { ...metadata, url },
          word_count: content.split(/\s+/).length,
          created_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      // Create embeddings
      await this.createEmbeddings(document.id, content);

      return document;
    } catch (error) {
      console.error('Error processing URL:', error);
      throw error;
    }
  }

  async createEmbeddings(documentId, content) {
    try {
      // Split content into chunks
      const chunks = this.splitIntoChunks(content);
      
      // Create embeddings for each chunk
      const embeddings = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Create embedding using OpenAI
        const response = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: chunk,
        });
        
        const embedding = response.data[0].embedding;
        
        embeddings.push({
          document_id: documentId,
          chunk_index: i,
          chunk_text: chunk,
          embedding: `[${embedding.join(',')}]`, // Format for pgvector
          metadata: { chunk_number: i + 1, total_chunks: chunks.length }
        });
      }
      
      // Batch insert embeddings
      const { error } = await supabase
        .from('knowledge_embeddings')
        .insert(embeddings);
      
      if (error) throw error;
      
      return embeddings.length;
    } catch (error) {
      console.error('Error creating embeddings:', error);
      throw error;
    }
  }

  splitIntoChunks(text) {
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + this.chunkSize;
      
      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastQuestion = text.lastIndexOf('?', end);
        const lastExclamation = text.lastIndexOf('!', end);
        
        const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
        
        if (lastSentenceEnd > start + this.chunkSize - this.chunkOverlap) {
          end = lastSentenceEnd + 1;
        }
      }
      
      chunks.push(text.slice(start, end).trim());
      start = end - this.chunkOverlap;
    }
    
    return chunks;
  }

  // RAG (Retrieval Augmented Generation) Methods
  async queryKnowledge(query, agentId, limit = 5) {
    try {
      // Create embedding for query
      const queryResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: query,
      });
      
      const queryEmbedding = queryResponse.data[0].embedding;
      
      // Search for similar embeddings using pgvector
      const { data: results, error } = await supabase.rpc('search_knowledge', {
        query_embedding: queryEmbedding,
        match_count: limit,
        p_agent_id: agentId
      });
      
      if (error) throw error;
      
      // Format results with context
      const context = results.map(r => ({
        document_id: r.document_id,
        document_title: r.document_title,
        chunk_text: r.chunk_text,
        similarity: r.similarity
      }));
      
      // Generate response using context
      const response = await this.generateResponse(query, context);
      
      return {
        response,
        sources: context
      };
    } catch (error) {
      console.error('Error querying knowledge:', error);
      throw error;
    }
  }

  async generateResponse(query, context) {
    const contextText = context.map(c => c.chunk_text).join('\n\n');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable assistant. Use the provided context to answer questions accurately. If the context doesn't contain relevant information, say so."
        },
        {
          role: "user",
          content: `Context:\n${contextText}\n\nQuestion: ${query}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });
    
    return completion.choices[0].message.content;
  }

  // Specialization Track Methods
  async createSpecializationTrack(trackData) {
    try {
      const { data, error } = await supabase
        .from('specialization_tracks')
        .insert(trackData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating specialization track:', error);
      throw error;
    }
  }

  async enrollAgentInTrack(agentId, trackId, userId) {
    try {
      const { data, error } = await supabase
        .from('agent_specialization_progress')
        .insert({
          agent_id: agentId,
          user_id: userId,
          track_id: trackId
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error enrolling agent in track:', error);
      throw error;
    }
  }

  async updateAgentProgress(agentId, documentId, progress, userId) {
    try {
      const { data, error } = await supabase
        .from('agent_knowledge_progress')
        .upsert({
          agent_id: agentId,
          user_id: userId,
          document_id: documentId,
          progress_percentage: progress,
          last_accessed: new Date().toISOString()
        }, {
          onConflict: 'agent_id,document_id'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Check if this completes any specialization
      await this.checkSpecializationCompletion(agentId, userId);
      
      return data;
    } catch (error) {
      console.error('Error updating agent progress:', error);
      throw error;
    }
  }

  async checkSpecializationCompletion(agentId, userId) {
    try {
      // Get all active specializations for agent
      const { data: enrollments, error: enrollError } = await supabase
        .from('agent_specialization_progress')
        .select('*, specialization_tracks(*)')
        .eq('agent_id', agentId)
        .eq('user_id', userId)
        .is('completion_date', null);
      
      if (enrollError) throw enrollError;
      
      for (const enrollment of enrollments) {
        const isComplete = await supabase.rpc('check_specialization_completion', {
          p_agent_id: agentId,
          p_track_id: enrollment.track_id
        });
        
        if (isComplete.data) {
          // Update specialization as complete
          await supabase
            .from('agent_specialization_progress')
            .update({
              completion_date: new Date().toISOString(),
              overall_progress: 100,
              certificate_issued: true
            })
            .eq('id', enrollment.id);
          
          // Generate certificate
          await this.generateCertificate(agentId, enrollment.track_id, userId);
        }
      }
    } catch (error) {
      console.error('Error checking specialization completion:', error);
      throw error;
    }
  }

  // Quiz and Testing Methods
  async createQuiz(quizData) {
    try {
      const { data, error } = await supabase
        .from('knowledge_quizzes')
        .insert(quizData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating quiz:', error);
      throw error;
    }
  }

  async submitQuizAttempt(quizId, agentId, userId, answers) {
    try {
      // Get quiz details
      const { data: quiz, error: quizError } = await supabase
        .from('knowledge_quizzes')
        .select('*')
        .eq('id', quizId)
        .single();
      
      if (quizError) throw quizError;
      
      // Calculate score
      const score = this.calculateQuizScore(quiz.questions, answers);
      const passed = score >= quiz.passing_score;
      
      // Store attempt
      const { data: attempt, error } = await supabase
        .from('quiz_attempts')
        .insert({
          quiz_id: quizId,
          agent_id: agentId,
          user_id: userId,
          score,
          passed,
          answers
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update agent progress if passed
      if (passed && quiz.document_id) {
        await this.updateAgentProgress(agentId, quiz.document_id, 100, userId);
      }
      
      return attempt;
    } catch (error) {
      console.error('Error submitting quiz attempt:', error);
      throw error;
    }
  }

  calculateQuizScore(questions, answers) {
    let correct = 0;
    
    questions.forEach((question, index) => {
      if (answers[index] === question.correct_answer) {
        correct++;
      }
    });
    
    return Math.round((correct / questions.length) * 100);
  }

  async conductRetentionTest(agentId, userId, knowledgeIds = []) {
    try {
      // Generate retention test questions based on agent's learning history
      const questions = await this.generateRetentionQuestions(agentId, knowledgeIds);
      
      // Create a temporary quiz
      const quiz = await this.createQuiz({
        title: `Retention Test - ${new Date().toISOString()}`,
        questions,
        passing_score: 70,
        time_limit_minutes: 30
      });
      
      return quiz;
    } catch (error) {
      console.error('Error conducting retention test:', error);
      throw error;
    }
  }

  async generateRetentionQuestions(agentId, knowledgeIds) {
    // This would use AI to generate questions based on the agent's learning history
    // For now, returning a placeholder
    return [
      {
        question: "Sample retention question",
        options: ["A", "B", "C", "D"],
        correct_answer: "A"
      }
    ];
  }

  // Curriculum Methods
  async createCustomCurriculum(curriculumData, userId) {
    try {
      const { data, error } = await supabase
        .from('custom_curricula')
        .insert({
          ...curriculumData,
          created_by: userId
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating custom curriculum:', error);
      throw error;
    }
  }

  async enrollAgentInCurriculum(curriculumId, agentId, userId) {
    try {
      const { data, error } = await supabase
        .from('curriculum_enrollment')
        .insert({
          curriculum_id: curriculumId,
          agent_id: agentId,
          user_id: userId
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error enrolling agent in curriculum:', error);
      throw error;
    }
  }

  async getCurriculumProgress(curriculumId, agentId) {
    try {
      // Get curriculum details
      const { data: curriculum, error: currError } = await supabase
        .from('custom_curricula')
        .select('*')
        .eq('id', curriculumId)
        .single();
      
      if (currError) throw currError;
      
      // Get progress for each document
      const { data: progress, error: progError } = await supabase
        .from('agent_knowledge_progress')
        .select('*')
        .eq('agent_id', agentId)
        .in('document_id', curriculum.document_ids);
      
      if (progError) throw progError;
      
      // Calculate overall progress
      const totalDocs = curriculum.document_ids.length;
      const completedDocs = progress.filter(p => p.progress_percentage >= 100).length;
      const overallProgress = totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;
      
      return {
        curriculum,
        document_progress: progress,
        overall_progress: overallProgress,
        completed_documents: completedDocs,
        total_documents: totalDocs
      };
    } catch (error) {
      console.error('Error getting curriculum progress:', error);
      throw error;
    }
  }

  // Certificate Generation
  async generateCertificate(agentId, trackId, userId) {
    try {
      // Get agent and track details - using unified_agents table
      const { data: agent } = await supabase
        .from('unified_agents')
        .select('*')
        .eq('id', agentId)
        .single();
      
      const { data: track } = await supabase
        .from('specialization_tracks')
        .select('*')
        .eq('id', trackId)
        .single();
      
      // Generate certificate (placeholder - would integrate with certificate generation service)
      const certificateUrl = `/certificates/${agentId}-${trackId}-${Date.now()}.pdf`;
      
      // Update specialization progress with certificate URL
      await supabase
        .from('agent_specialization_progress')
        .update({ certificate_url: certificateUrl })
        .eq('agent_id', agentId)
        .eq('track_id', trackId)
        .eq('user_id', userId);
      
      return certificateUrl;
    } catch (error) {
      console.error('Error generating certificate:', error);
      throw error;
    }
  }

  // Analytics Methods
  async getAgentLearningAnalytics(agentId, userId) {
    try {
      // Get overall knowledge score
      const { data: knowledgeScore } = await supabase.rpc('calculate_agent_knowledge_score', {
        p_agent_id: agentId
      });
      
      // Get specialization progress
      const { data: specializations } = await supabase
        .from('agent_specialization_progress')
        .select('*, specialization_tracks(*)')
        .eq('agent_id', agentId)
        .eq('user_id', userId);
      
      // Get recent quiz performance
      const { data: quizzes } = await supabase
        .from('quiz_attempts')
        .select('*, knowledge_quizzes(*)')
        .eq('agent_id', agentId)
        .eq('user_id', userId)
        .order('attempted_at', { ascending: false })
        .limit(10);
      
      // Get learning velocity (documents completed per week)
      const { data: recentProgress } = await supabase
        .from('agent_knowledge_progress')
        .select('*')
        .eq('agent_id', agentId)
        .eq('user_id', userId)
        .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      
      return {
        overall_score: knowledgeScore || 0,
        specializations,
        recent_quizzes: quizzes,
        learning_velocity: this.calculateLearningVelocity(recentProgress),
        strengths: this.identifyStrengths(quizzes),
        areas_for_improvement: this.identifyWeakAreas(quizzes)
      };
    } catch (error) {
      console.error('Error getting agent learning analytics:', error);
      throw error;
    }
  }

  calculateLearningVelocity(progressData) {
    const completedInLast30Days = progressData.filter(p => p.progress_percentage >= 100).length;
    return Math.round(completedInLast30Days / 4.3); // Average per week
  }

  identifyStrengths(quizData) {
    const topScores = quizData
      .filter(q => q.score >= 85)
      .map(q => q.knowledge_quizzes?.title || 'Unknown')
      .slice(0, 5);
    
    return topScores;
  }

  identifyWeakAreas(quizData) {
    const lowScores = quizData
      .filter(q => q.score < 70)
      .map(q => q.knowledge_quizzes?.title || 'Unknown')
      .slice(0, 5);
    
    return lowScores;
  }

  // Helper methods
  getDocumentType(mimetype) {
    const typeMap = {
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
    };
    return typeMap[mimetype] || 'unknown';
  }
}

// Create RPC function for vector search (to be added to Supabase)
const searchKnowledgeFunction = `
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(1536),
  match_count int,
  p_agent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  document_id uuid,
  document_title text,
  chunk_text text,
  similarity float
)
LANGUAGE sql
AS $$
  SELECT 
    ke.document_id,
    kd.title as document_title,
    ke.chunk_text,
    1 - (ke.embedding <=> query_embedding) as similarity
  FROM knowledge_embeddings ke
  JOIN knowledge_documents kd ON ke.document_id = kd.id
  LEFT JOIN agent_knowledge_progress akp ON kd.id = akp.document_id AND akp.agent_id = p_agent_id
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
$$;
`;

// Export service and multer upload
export default new KnowledgeBankService();
export { upload };