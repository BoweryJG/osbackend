import express from 'express';

import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get Supabase instance from app locals (set by index.js)
function getSupabase(req) {
  const supabase = req.app.locals.supabase;
  if (!supabase) {
    logger.warn('Supabase not available in app.locals');
  }
  return supabase;
}

/**
 * Start a new coaching session
 */
router.post('/start-session', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }
    const { repId, coachId, procedureCategory, sessionType = 'practice_pitch' } = req.body;

    if (!repId || !coachId || !procedureCategory) {
      return res.status(400).json(errorResponse('MISSING_PARAMETERS', 'Missing required fields: repId, coachId, procedureCategory', null, 400));
    }

    // Check coach availability
    const { data: availability, error: availError } = await supabase
      .from('coach_availability')
      .select('is_available')
      .eq('coach_id', coachId)
      .single();

    if (availError || !availability?.is_available) {
      return res.status(409).json(errorResponse('COACH_UNAVAILABLE', 'Coach is not available for instant sessions', null, 409));
    }

    // Create unique room ID
    const roomId = `coach-${coachId}-rep-${repId}-${Date.now()}`;

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('instant_coaching_sessions')
      .insert({
        rep_id: repId,
        coach_id: coachId,
        session_type: sessionType,
        procedure_category: procedureCategory,
        webrtc_room_id: roomId,
        connection_status: 'pending',
        session_goals: getDefaultGoals(sessionType)
      })
      .select()
      .single();

    if (sessionError) {
      logger.error('Error creating session:', sessionError);
      return res.status(500).json(errorResponse('SESSION_CREATE_ERROR', 'Failed to create coaching session', sessionError.message, 500));
    }

    // Mark coach as busy
    const { error: busyError } = await supabase
      .from('coach_availability')
      .update({
        is_available: false,
        current_session_id: session.id,
        updated_at: new Date().toISOString()
      })
      .eq('coach_id', coachId);

    if (busyError) {
      logger.error('Error updating coach availability:', busyError);
    }

    res.json(successResponse({
      session: {
        ...session,
        roomId,
        webrtcConfig: {
          iceServers: getIceServers()
        }
      }
    }, 'Coaching session started successfully'));

  } catch (error) {
    logger.error('Error starting coaching session:', error);
    res.status(500).json(errorResponse('SESSION_START_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * End a coaching session
 */
router.post('/end-session/:sessionId', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }
    const { sessionId } = req.params;
    const { notes, feedback } = req.body;

    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('instant_coaching_sessions')
      .select('*, coach_id, started_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Session not found', null, 404));
    }

    // Calculate duration
    const duration = session.started_at
      ? Math.floor((new Date().getTime() - new Date(session.started_at).getTime()) / 1000)
      : 0;

    // Update session
    const { error: updateError } = await supabase
      .from('instant_coaching_sessions')
      .update({
        connection_status: 'completed',
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
        notes: notes
      })
      .eq('id', sessionId);

    if (updateError) {
      logger.error('Error updating session:', updateError);
      return res.status(500).json(errorResponse('SESSION_UPDATE_ERROR', 'Failed to end session', updateError.message, 500));
    }

    // Free up coach
    const { error: availError } = await supabase
      .from('coach_availability')
      .update({
        is_available: true,
        current_session_id: null,
        last_session_end: new Date().toISOString()
      })
      .eq('coach_id', session.coach_id);

    if (availError) {
      logger.error('Error freeing coach:', availError);
    }

    // Save feedback if provided
    if (feedback) {
      const { error: feedbackError } = await supabase
        .from('coaching_feedback')
        .insert({
          session_id: sessionId,
          rep_id: session.rep_id,
          ...feedback
        });

      if (feedbackError) {
        logger.error('Error saving feedback:', feedbackError);
      }
    }

    res.json(successResponse({
      session: {
        id: sessionId,
        duration_seconds: duration,
        status: 'completed'
      }
    }, 'Session ended successfully'));

  } catch (error) {
    logger.error('Error ending coaching session:', error);
    res.status(500).json(errorResponse('SESSION_END_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Get available coaches for a procedure
 */
router.get('/available-coaches/:procedureCategory', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }
    const { procedureCategory } = req.params;

    // First get the specializations
    const { data: specializations, error } = await supabase
      .from('coach_procedure_specializations')
      .select(`
        *,
        coach:sales_coach_agents(*)
      `)
      .eq('procedure_category', procedureCategory)
      .eq('available_for_instant', true);

    if (error) {
      logger.error('Error fetching specializations:', error);
      return res.status(500).json(errorResponse('FETCH_ERROR', 'Failed to fetch available coaches', error.message, 500));
    }

    // Then check availability for each coach
    const coachesWithAvailability = [];
    for (const spec of specializations || []) {
      const { data: availability } = await supabase
        .from('coach_availability')
        .select('*')
        .eq('coach_id', spec.coach_id)
        .eq('is_available', true)
        .single();
      
      if (availability) {
        coachesWithAvailability.push({
          ...spec,
          availability
        });
      }
    }

    const data = coachesWithAvailability;

    res.json(successResponse({
      coaches: data || []
    }));

  } catch (error) {
    logger.error('Error in available coaches endpoint:', error);
    res.status(500).json(errorResponse('COACHES_FETCH_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Get practice scenarios for a procedure
 */
router.get('/practice-scenarios/:procedureCategory', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }
    const { procedureCategory } = req.params;
    const { difficulty } = req.query;

    let query = supabase
      .from('practice_scenarios')
      .select('*')
      .eq('procedure_category', procedureCategory);

    if (difficulty) {
      query = query.eq('difficulty_level', parseInt(difficulty));
    }

    const { data, error } = await query.order('difficulty_level', { ascending: true });

    if (error) {
      logger.error('Error fetching scenarios:', error);
      return res.status(500).json(errorResponse('SCENARIOS_FETCH_ERROR', 'Failed to fetch practice scenarios', error.message, 500));
    }

    res.json(successResponse({
      scenarios: data || []
    }));

  } catch (error) {
    logger.error('Error in practice scenarios endpoint:', error);
    res.status(500).json(errorResponse('SCENARIOS_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Test endpoint to check if coaching tables exist
 */
router.get('/test-yomi-coaches', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }

    // First check what procedure categories exist
    const { data: categories, error: catError } = await supabase
      .from('coach_procedure_specializations')
      .select('procedure_category')
      .limit(10);

    // Then check for yomi_robot specifically
    const { data: yomiCoaches, error: yomiError } = await supabase
      .from('coach_procedure_specializations')
      .select('*')
      .eq('procedure_category', 'yomi_robot')
      .limit(10);

    res.json(successResponse({
      availableCategories: categories ? [...new Set(categories.map(c => c.procedure_category))] : [],
      yomiRobotCoaches: yomiCoaches || [],
      errors: {
        categories: catError?.message,
        yomi: yomiError?.message
      }
    }));

  } catch (error) {
    logger.error('Error testing yomi coaches:', error);
    res.status(500).json(errorResponse('TEST_ERROR', 'Error testing yomi coaches', error.message, 500));
  }
});

router.get('/test-tables', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }

    const tables = [
      'sales_coach_agents',
      'coach_availability',
      'coach_procedure_specializations',
      'instant_coaching_sessions',
      'practice_scenarios',
      'coaching_feedback'
    ];

    const results = {};
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          results[table] = { exists: false, error: error.message };
        } else {
          results[table] = { exists: true, hasData: data && data.length > 0 };
        }
      } catch (err) {
        results[table] = { exists: false, error: err.message };
      }
    }

    res.json(successResponse({
      tables: results
    }));

  } catch (error) {
    logger.error('Error testing tables:', error);
    res.status(500).json(errorResponse('TABLE_TEST_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Get session status
 */
router.get('/session-status/:sessionId', async (req, res) => {
  try {
    const supabase = getSupabase(req);
    if (!supabase) {
      return res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Database service unavailable. Please try again later.', null, 503));
    }
    const { sessionId } = req.params;

    const { data, error } = await supabase
      .from('instant_coaching_sessions')
      .select(`
        *,
        coach:sales_coach_agents(name, personality_type),
        rep:sales_reps(name)
      `)
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Session not found', null, 404));
    }

    res.json(successResponse({
      session: data
    }));

  } catch (error) {
    logger.error('Error fetching session status:', error);
    res.status(500).json(errorResponse('SESSION_STATUS_ERROR', 'Internal server error', error.message, 500));
  }
});

/**
 * Helper functions
 */
function getDefaultGoals(sessionType) {
  const goals = {
    practice_pitch: [
      'Master product positioning',
      'Handle common objections',
      'Build confidence in presentation'
    ],
    objection_handling: [
      'Address price concerns effectively',
      'Counter competitor comparisons',
      'Turn objections into opportunities'
    ],
    product_qa: [
      'Deep dive into technical details',
      'Understand clinical evidence',
      'Learn differentiators'
    ],
    mock_consultation: [
      'Practice full patient journey',
      'Build rapport quickly',
      'Close with confidence'
    ]
  };

  return goals[sessionType] || ['Improve sales skills'];
}

function getIceServers() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Add TURN servers if configured
  if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  return iceServers;
}

export default router;