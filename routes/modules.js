import express from 'express';
import axios from 'axios';
import { supabase } from '../services/supabase.js';

const router = express.Router();

function isFreeModel(modelId) {
  if (!modelId) return true;
  const freeModels = [
    'google/gemini-pro',
    'google/gemini-1.5-pro',
    'google/gemini-2.0-flash',
    'anthropic/claude-instant',
    'mistralai/mistral',
    'meta-llama/llama-2'
  ];
  if (process.env.NODE_ENV === 'development' || process.env.LOCAL_DEV === 'true') {
    console.log('Local development mode: All models are considered free');
    return true;
  }
  return freeModels.some(freeModel => modelId.toLowerCase().includes(freeModel.toLowerCase()));
}

function isAsmModel(modelId) {
  if (!modelId) return false;
  const asmModels = [
    'microsoft/phi',
    'anthropic/claude-instant',
    'mistralai/mistral-medium',
    'google/gemini-1.5-flash'
  ];
  return asmModels.some(asmModel => modelId.toLowerCase().includes(asmModel.toLowerCase()));
}

async function getUserSubscription(email) {
  if (!email || !supabase) return 'free';
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('subscription_level')
      .eq('email', email)
      .single();
    if (error || !data) {
      console.log(`No subscription found for ${email}, defaulting to free`);
      return 'free';
    }
    return data.subscription_level;
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return 'free';
  }
}

async function hasModuleAccess(email, moduleName) {
  return true;
  /*
  if (!email || !supabase) return false;
  try {
    const { data: userData } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('email', email)
      .single();
    if (!userData) return false;
    const { data } = await supabase
      .from('module_access')
      .select('has_access')
      .eq('user_id', userData.user_id)
      .eq('module', moduleName)
      .single();
    return data?.has_access || false;
  } catch (err) {
    console.error('Error checking module access:', err);
    return false;
  }
  */
}

async function canAccessModel(email, modelId) {
  if (isFreeModel(modelId)) return true;
  if (!email) return false;
  const subscriptionLevel = await getUserSubscription(email);
  switch (subscriptionLevel) {
    case 'rsm':
      return true;
    case 'asm':
      return isFreeModel(modelId) || isAsmModel(modelId);
    case 'free':
    default:
      return isFreeModel(modelId);
  }
}

router.get('/models', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OpenRouter API key not configured');
    return res.status(500).json({ message: 'OpenRouter API key not configured' });
  }
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });
    if (response.data && response.data.data) {
      const formattedModels = response.data.data.map(model => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description || 'No description available.',
        pricing: (parseFloat(model.pricing?.prompt) > 0 || parseFloat(model.pricing?.completion) > 0) ? 'paid' : 'free',
        context_length: model.context_length,
        architecture: model.architecture?.modality,
      }));
      res.json(formattedModels);
    } else {
      console.error('Unexpected response structure from OpenRouter:', response.data);
      res.status(500).json({ message: 'Failed to fetch models due to unexpected response structure' });
    }
  } catch (error) {
    console.error('Error fetching models from OpenRouter:', error.response ? error.response.data : error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to fetch models from OpenRouter',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

router.get('/modules/access', async (req, res) => {
  try {
    const email = req.query.email;
    const module = req.query.module;
    if (!email || !module) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email and module parameters are required'
      });
    }
    const hasAccess = await hasModuleAccess(email, module);
    return res.json({ success: true, hasAccess });
  } catch (err) {
    console.error('Error checking module access:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error checking module access'
    });
  }
});

router.get('/modules/list', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email parameter is required'
      });
    }
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Supabase connection is not available'
      });
    }
    const { data: userData, error: userError } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('email', email)
      .single();
    if (userError || !userData) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
    }
    const { data, error } = await supabase
      .from('module_access')
      .select('module')
      .eq('user_id', userData.user_id)
      .eq('has_access', true);
    if (error) throw error;
    return res.json({ success: true, modules: data.map(item => item.module) });
  } catch (err) {
    console.error('Error listing accessible modules:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error listing accessible modules'
    });
  }
});

export default router;
