# Knowledge Bank Service - Agent Academy System

The Knowledge Bank Service implements a comprehensive learning management system for Canvas AI Agents, enabling them to acquire, retain, and apply knowledge through structured learning paths.

## Features

### 1. Document Management
- **Upload Documents**: Support for PDF, TXT, and DOCX files
- **URL Processing**: Scrape and process web content
- **Content Extraction**: Automatic text extraction from various formats
- **Metadata Storage**: Store additional context with documents

### 2. Vector Embeddings & RAG
- **OpenAI Embeddings**: Convert text into vector embeddings using text-embedding-ada-002
- **Chunk Management**: Split documents into optimized chunks with overlap
- **Vector Search**: Use pgvector for similarity search
- **RAG Implementation**: Retrieval Augmented Generation for intelligent responses

### 3. Specialization Tracks
- **Pre-defined Tracks**:
  - Medical Device Sales
  - Legal Compliance
  - Technical Product Knowledge
  - Sales Excellence
- **Custom Tracks**: Create custom specialization paths
- **Certification Criteria**: Define requirements for completion
- **Progress Tracking**: Monitor agent advancement

### 4. Learning Progress
- **Document Progress**: Track completion percentage per document
- **Quiz Scores**: Store and analyze quiz performance
- **Learning Velocity**: Calculate learning speed (docs/week)
- **Retention Testing**: Periodic knowledge retention assessments

### 5. Curriculum Management
- **Custom Curricula**: Create tailored learning paths
- **Mandatory Training**: Set required courses
- **Deadline Management**: Track completion deadlines
- **Multi-agent Assignment**: Assign curricula to multiple agents

### 6. Assessment & Certification
- **Quiz Creation**: Build custom assessments
- **Automatic Grading**: Score submissions automatically
- **Certificate Generation**: Issue completion certificates
- **Performance Analytics**: Track strengths and weaknesses

## API Endpoints

### Document Management
```
POST /api/knowledge/documents/upload
POST /api/knowledge/documents/url
```

### Knowledge Query (RAG)
```
POST /api/knowledge/query
```

### Specialization Tracks
```
GET  /api/knowledge/specializations
POST /api/knowledge/specializations
POST /api/knowledge/specializations/enroll
```

### Progress Tracking
```
POST /api/knowledge/progress/update
GET  /api/knowledge/progress/:agentId
```

### Quizzes
```
POST /api/knowledge/quizzes
POST /api/knowledge/quizzes/submit
```

### Curricula
```
POST /api/knowledge/curricula
POST /api/knowledge/curricula/enroll
GET  /api/knowledge/curricula/:curriculumId/progress/:agentId
```

### Analytics & Testing
```
POST /api/knowledge/retention-test
GET  /api/knowledge/analytics/:agentId
POST /api/knowledge/certificates/generate
```

## Usage Examples

### Upload a Document
```javascript
const formData = new FormData();
formData.append('document', file);
formData.append('metadata', JSON.stringify({
  category: 'Medical Devices',
  tags: ['implants', 'surgical']
}));

const response = await fetch('/api/knowledge/documents/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

### Query Knowledge (RAG)
```javascript
const response = await fetch('/api/knowledge/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: 'What are the benefits of robotic surgery?',
    agentId: 'agent-uuid',
    limit: 5
  })
});
```

### Track Progress
```javascript
const response = await fetch('/api/knowledge/progress/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    agentId: 'agent-uuid',
    documentId: 'document-uuid',
    progress: 100
  })
});
```

## Database Schema

### Core Tables
- `knowledge_documents`: Store document metadata and content
- `knowledge_embeddings`: Store vector embeddings for RAG
- `specialization_tracks`: Define learning tracks
- `agent_knowledge_progress`: Track agent progress
- `agent_specialization_progress`: Track specialization completion
- `knowledge_quizzes`: Store quiz questions
- `quiz_attempts`: Record quiz submissions
- `custom_curricula`: Define custom learning paths
- `curriculum_enrollment`: Track curriculum assignments
- `retention_tests`: Store retention test results

## Configuration

### Environment Variables
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=your_openai_api_key
```

### Database Setup
1. Run the migration script: `create_knowledge_bank_tables.sql`
2. Enable pgvector extension
3. Create vector search function

## Testing

Run the test suite:
```bash
node test_knowledge_bank.js
```

## Best Practices

1. **Document Chunking**: Keep chunks between 500-1500 characters for optimal embedding quality
2. **Metadata**: Always include relevant metadata for better search results
3. **Progress Tracking**: Update progress in real-time for accurate analytics
4. **Quiz Design**: Create varied question types to test different aspects of knowledge
5. **Retention Testing**: Schedule regular retention tests to identify knowledge gaps

## Integration with Canvas AI Agents

The Knowledge Bank Service seamlessly integrates with the existing Canvas AI Agents system:

1. **Agent Context**: Each agent maintains their own knowledge base
2. **Personalized Learning**: Tracks are tailored to agent specialties
3. **Performance Impact**: Knowledge directly influences agent responses
4. **Continuous Learning**: Agents can query their knowledge base during conversations

## Future Enhancements

- [ ] Video content support
- [ ] Interactive simulations
- [ ] Peer learning features
- [ ] Advanced analytics dashboard
- [ ] Mobile app integration
- [ ] Multi-language support
- [ ] Collaborative learning spaces
- [ ] AI-generated quizzes based on content