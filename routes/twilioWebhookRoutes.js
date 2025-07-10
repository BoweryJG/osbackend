import express from 'express';
const router = express.Router();

// Placeholder - implementation moved to phone.js
router.post('/api/twilio/incoming-call', (req, res) => {
  res.status(301).json({ 
    message: 'This endpoint has moved to /api/phone/incoming-call' 
  });
});

export default router;