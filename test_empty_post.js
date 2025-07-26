// Test if empty POST works
import express from 'express';

const app = express();
const router = express.Router();

// Don't add body parser initially
router.post('/test/empty', (req, res) => {
  console.log('Empty POST received');
  res.json({ success: true, message: 'Empty POST works' });
});

// Add body parser after
app.use(express.json());

router.post('/test/json', (req, res) => {
  console.log('JSON POST received');
  res.json({ success: true, message: 'JSON POST works', body: req.body });
});

app.use('/api', router);

// Add to index.js
export default router;