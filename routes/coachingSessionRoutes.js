import express from 'express';
const router = express.Router();

// Placeholder - actual implementation moved to harvey.js
router.post('/start-session', (req, res) => {
  res.status(301).json({ 
    message: 'This endpoint has moved to /api/harvey/coaching/start-session' 
  });
});

export default router;