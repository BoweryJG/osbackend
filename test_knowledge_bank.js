import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import knowledgeBankService from './services/knowledgeBankService.js';

dotenv.config();

// Initialize Supabase client for testing
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testKnowledgeBank() {
  console.log('Testing Knowledge Bank Service...\n');
  
  try {
    // Test 1: Process a URL
    console.log('1. Testing URL processing...');
    const testUrl = 'https://openai.com/blog/chatgpt';
    const userId = 'test-user-' + Date.now();
    
    const urlDocument = await knowledgeBankService.processURL(testUrl, userId, {
      category: 'AI',
      tags: ['chatgpt', 'openai']
    });
    
    console.log('✓ URL processed successfully:', {
      id: urlDocument.id,
      title: urlDocument.title,
      word_count: urlDocument.word_count
    });
    
    // Test 2: Create specialization track
    console.log('\n2. Testing specialization track creation...');
    const track = await knowledgeBankService.createSpecializationTrack({
      name: 'Test AI Specialization',
      description: 'Test track for AI knowledge',
      icon_url: '/icons/ai.svg',
      certification_criteria: {
        required_documents: 5,
        minimum_quiz_score: 80,
        practice_scenarios: 3
      }
    });
    
    console.log('✓ Specialization track created:', track.name);
    
    // Test 3: Create a test agent - using unified_agents table
    console.log('\n3. Creating test agent...');
    const { data: agent, error: agentError } = await supabase
      .from('unified_agents')
      .insert({
        name: 'Test Agent ' + Date.now(),
        specialty: ['test'],
        personality: { tone: 'professional' },
        available_in_apps: ['canvas'] // Add apps array for unified table
      })
      .select()
      .single();
    
    if (agentError) throw agentError;
    console.log('✓ Test agent created:', agent.name);
    
    // Test 4: Enroll agent in track
    console.log('\n4. Testing agent enrollment...');
    const enrollment = await knowledgeBankService.enrollAgentInTrack(
      agent.id,
      track.id,
      userId
    );
    
    console.log('✓ Agent enrolled in track');
    
    // Test 5: Update progress
    console.log('\n5. Testing progress update...');
    const progress = await knowledgeBankService.updateAgentProgress(
      agent.id,
      urlDocument.id,
      75,
      userId
    );
    
    console.log('✓ Progress updated:', progress.progress_percentage + '%');
    
    // Test 6: Query knowledge
    console.log('\n6. Testing knowledge query (RAG)...');
    const queryResult = await knowledgeBankService.queryKnowledge(
      'What is ChatGPT?',
      agent.id,
      3
    );
    
    console.log('✓ Query completed');
    console.log('Response preview:', queryResult.response.substring(0, 200) + '...');
    console.log('Sources found:', queryResult.sources.length);
    
    // Test 7: Create quiz
    console.log('\n7. Testing quiz creation...');
    const quiz = await knowledgeBankService.createQuiz({
      document_id: urlDocument.id,
      title: 'ChatGPT Knowledge Test',
      questions: [
        {
          question: 'What is ChatGPT?',
          options: ['A chatbot', 'A search engine', 'A database', 'A programming language'],
          correct_answer: 'A chatbot'
        },
        {
          question: 'Who created ChatGPT?',
          options: ['Google', 'OpenAI', 'Microsoft', 'Facebook'],
          correct_answer: 'OpenAI'
        }
      ],
      passing_score: 50
    });
    
    console.log('✓ Quiz created:', quiz.title);
    
    // Test 8: Submit quiz attempt
    console.log('\n8. Testing quiz submission...');
    const attempt = await knowledgeBankService.submitQuizAttempt(
      quiz.id,
      agent.id,
      userId,
      ['A chatbot', 'OpenAI']
    );
    
    console.log('✓ Quiz submitted - Score:', attempt.score + '%', 'Passed:', attempt.passed);
    
    // Test 9: Get analytics
    console.log('\n9. Testing analytics...');
    const analytics = await knowledgeBankService.getAgentLearningAnalytics(agent.id, userId);
    
    console.log('✓ Analytics retrieved:');
    console.log('  - Overall score:', analytics.overall_score);
    console.log('  - Learning velocity:', analytics.learning_velocity, 'docs/week');
    console.log('  - Specializations:', analytics.specializations.length);
    
    // Test 10: Create custom curriculum
    console.log('\n10. Testing custom curriculum...');
    const curriculum = await knowledgeBankService.createCustomCurriculum({
      name: 'AI Fundamentals Curriculum',
      description: 'Basic AI knowledge for sales agents',
      document_ids: [urlDocument.id],
      quiz_ids: [quiz.id],
      target_agents: [agent.id],
      is_mandatory: false
    }, userId);
    
    console.log('✓ Curriculum created:', curriculum.name);
    
    // Cleanup
    console.log('\n11. Cleaning up test data...');
    await supabase.from('agent_conversations').delete().eq('agent_id', agent.id);
    await supabase.from('agent_knowledge_progress').delete().eq('agent_id', agent.id);
    await supabase.from('agent_specialization_progress').delete().eq('agent_id', agent.id);
    await supabase.from('quiz_attempts').delete().eq('agent_id', agent.id);
    await supabase.from('unified_agents').delete().eq('id', agent.id);
    await supabase.from('knowledge_quizzes').delete().eq('id', quiz.id);
    await supabase.from('knowledge_embeddings').delete().eq('document_id', urlDocument.id);
    await supabase.from('knowledge_documents').delete().eq('id', urlDocument.id);
    await supabase.from('specialization_tracks').delete().eq('id', track.id);
    await supabase.from('custom_curricula').delete().eq('id', curriculum.id);
    
    console.log('✓ Test data cleaned up');
    
    console.log('\n✅ All tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testKnowledgeBank();