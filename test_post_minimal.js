import express from 'express';

const app = express();
const PORT = process.env.PORT || 3099;

// Minimal middleware
app.use(express.json());

// Test endpoints
app.get('/test', (req, res) => {
  res.json({ success: true, message: 'GET works' });
});

app.post('/test', (req, res) => {
  console.log('POST endpoint hit');
  console.log('Body:', req.body);
  res.json({ success: true, message: 'POST works', body: req.body });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});