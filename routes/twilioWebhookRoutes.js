import express from 'express';

import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const router = express.Router();

// Placeholder - implementation moved to phone.js
router.post('/api/twilio/incoming-call', (req, res) => {
  res.status(301).json(successResponse({ 
    redirectTo: '/api/phone/incoming-call'
  }, 'This endpoint has moved to /api/phone/incoming-call'));
});

export default router;