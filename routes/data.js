import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

router.post('/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const { userId, data } = req.body;
    if (!appName || !userId || !data) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name, user ID, and data are required'
      });
    }
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    const { data: existingData } = await supabase
      .from('app_data')
      .select('id')
      .eq('app_name', appName)
      .eq('user_id', userId)
      .maybeSingle();
    let result;
    if (existingData) {
      const { data: updateData, error: updateError } = await supabase
        .from('app_data')
        .update({ data })
        .eq('id', existingData.id)
        .select();
      if (updateError) throw updateError;
      result = updateData[0];
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('app_data')
        .insert([{ app_name: appName, user_id: userId, data }])
        .select();
      if (insertError) throw insertError;
      result = insertData[0];
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error saving app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error saving app data'
    });
  }
});

router.get('/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const userId = req.query.userId;
    if (!appName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name and user ID are required'
      });
    }
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    const { data, error } = await supabase
      .from('app_data')
      .select('*')
      .eq('app_name', appName)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return res.json({ success: true, data: data || null });
  } catch (err) {
    console.error('Error fetching app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error fetching app data'
    });
  }
});

router.delete('/data/:appName', async (req, res) => {
  try {
    const { appName } = req.params;
    const userId = req.query.userId;
    if (!appName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'App name and user ID are required'
      });
    }
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    const { error } = await supabase
      .from('app_data')
      .delete()
      .eq('app_name', appName)
      .eq('user_id', userId);
    if (error) throw error;
    return res.json({ success: true, message: 'App data deleted successfully' });
  } catch (err) {
    console.error('Error deleting app data:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error deleting app data'
    });
  }
});

export default router;
