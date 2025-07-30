import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Initialize Twilio client with master account
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Encrypt sensitive data (simplified - use proper encryption in production)
 */
function encrypt(text) {
  if (!process.env.ENCRYPTION_KEY) {
    console.warn('No encryption key found, storing as plain text');
    return text;
  }
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
function decrypt(text) {
  if (!process.env.ENCRYPTION_KEY) {
    return text;
  }
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Create a Twilio subaccount for a user
 */
async function createTwilioSubaccount(userId, email, friendlyName) {
  try {
    console.log('🔧 Creating Twilio subaccount for:', email);
    
    // Create subaccount
    const subaccount = await twilioClient.api.accounts.create({
      friendlyName: friendlyName || `RepConnect - ${email}`
    });
    
    console.log('✅ Subaccount created:', subaccount.sid);
    
    return {
      subaccountSid: subaccount.sid,
      authToken: subaccount.authToken
    };
  } catch (error) {
    console.error('❌ Error creating subaccount:', error);
    throw error;
  }
}

/**
 * Purchase a phone number for the subaccount
 */
async function purchasePhoneNumber(subaccountSid, authToken, areaCode = null) {
  try {
    console.log('📱 Purchasing phone number for subaccount:', subaccountSid);
    
    // Create client for subaccount
    const subaccountClient = twilio(subaccountSid, authToken);
    
    // Search for available numbers
    const searchParams = {
      voiceEnabled: true,
      smsEnabled: true,
      mmsEnabled: true,
      capabilities: {
        voice: true,
        sms: true
      },
      limit: 1
    };
    
    if (areaCode) {
      searchParams.areaCode = areaCode;
    }
    
    const availableNumbers = await subaccountClient
      .availablePhoneNumbers('US')
      .local
      .list(searchParams);
    
    if (availableNumbers.length === 0) {
      throw new Error('No available phone numbers found');
    }
    
    const numberToPurchase = availableNumbers[0];
    
    // Purchase the number
    const purchasedNumber = await subaccountClient.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/voice`,
      voiceMethod: 'POST',
      smsUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/sms`,
      smsMethod: 'POST',
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status`,
      statusCallbackMethod: 'POST'
    });
    
    console.log('✅ Phone number purchased:', purchasedNumber.phoneNumber);
    
    return {
      phoneNumber: purchasedNumber.phoneNumber,
      phoneNumberSid: purchasedNumber.sid
    };
  } catch (error) {
    console.error('❌ Error purchasing phone number:', error);
    throw error;
  }
}

/**
 * Configure webhooks for the phone number
 */
async function configureWebhooks(subaccountSid, authToken, phoneNumberSid, userId) {
  try {
    console.log('🔗 Configuring webhooks for phone number');
    
    const subaccountClient = twilio(subaccountSid, authToken);
    
    // Update phone number with webhook URLs including user ID
    const webhookBase = process.env.WEBHOOK_BASE_URL || 'https://osbackend-zl1h.onrender.com';
    
    await subaccountClient
      .incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: `${webhookBase}/api/twilio/voice/${userId}`,
        voiceMethod: 'POST',
        voiceFallbackUrl: `${webhookBase}/api/twilio/voice/fallback/${userId}`,
        voiceFallbackMethod: 'POST',
        smsUrl: `${webhookBase}/api/twilio/sms/${userId}`,
        smsMethod: 'POST',
        smsFallbackUrl: `${webhookBase}/api/twilio/sms/fallback/${userId}`,
        smsFallbackMethod: 'POST',
        statusCallback: `${webhookBase}/api/twilio/status/${userId}`,
        statusCallbackMethod: 'POST'
      });
    
    console.log('✅ Webhooks configured successfully');
    
    return {
      voiceUrl: `${webhookBase}/api/twilio/voice/${userId}`,
      smsUrl: `${webhookBase}/api/twilio/sms/${userId}`
    };
  } catch (error) {
    console.error('❌ Error configuring webhooks:', error);
    throw error;
  }
}

/**
 * Main function to provision Twilio for a user
 */
export async function provisionTwilioForUser(userId, email, subscriptionTier, areaCode = null) {
  try {
    console.log('🚀 Starting Twilio provisioning for user:', { userId, email, subscriptionTier });
    
    // Check if user already has Twilio config
    const { data: existingConfig } = await supabase
      .from('user_twilio_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (existingConfig && existingConfig.status === 'active') {
      console.log('ℹ️ User already has active Twilio configuration');
      return existingConfig;
    }
    
    // Check if user has RepX1 or higher subscription
    const validTiers = ['repx1', 'repx2', 'repx3', 'repx4', 'repx5'];
    if (!validTiers.includes(subscriptionTier)) {
      throw new Error(`Invalid subscription tier for Twilio provisioning: ${subscriptionTier}`);
    }
    
    // Create or update initial config record
    const { data: configRecord, error: configError } = await supabase
      .from('user_twilio_config')
      .upsert({
        user_id: userId,
        email: email,
        status: 'provisioning',
        metadata: {
          subscription_tier: subscriptionTier,
          provisioning_started: new Date().toISOString()
        }
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (configError) {
      throw configError;
    }
    
    try {
      // Step 1: Create subaccount
      const { subaccountSid, authToken } = await createTwilioSubaccount(
        userId, 
        email,
        `RepConnect - ${email}`
      );
      
      // Step 2: Purchase phone number
      const { phoneNumber, phoneNumberSid } = await purchasePhoneNumber(
        subaccountSid,
        authToken,
        areaCode
      );
      
      // Step 3: Configure webhooks
      const { voiceUrl, smsUrl } = await configureWebhooks(
        subaccountSid,
        authToken,
        phoneNumberSid,
        userId
      );
      
      // Step 4: Update config with successful provisioning
      const { data: updatedConfig, error: updateError } = await supabase
        .from('user_twilio_config')
        .update({
          twilio_subaccount_sid: subaccountSid,
          twilio_auth_token: encrypt(authToken),
          twilio_phone_number: phoneNumber,
          twilio_phone_number_sid: phoneNumberSid,
          webhook_url: voiceUrl,
          status: 'active',
          metadata: {
            ...configRecord.metadata,
            provisioning_completed: new Date().toISOString(),
            voice_webhook: voiceUrl,
            sms_webhook: smsUrl
          }
        })
        .eq('id', configRecord.id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      console.log('✅ Twilio provisioning completed successfully');
      
      // Log successful provisioning
      await supabase.from('usage_tracking').insert({
        user_id: userId,
        email: email,
        feature_type: 'twilio_provisioning',
        quantity: 1,
        subscription_tier: subscriptionTier,
        app_name: 'repconnect',
        metadata: {
          phone_number: phoneNumber,
          subaccount_sid: subaccountSid
        }
      });
      
      return updatedConfig;
      
    } catch (provisionError) {
      // Update config with failure status
      await supabase
        .from('user_twilio_config')
        .update({
          status: 'failed',
          metadata: {
            ...configRecord.metadata,
            error: provisionError.message,
            failed_at: new Date().toISOString()
          }
        })
        .eq('id', configRecord.id);
      
      throw provisionError;
    }
    
  } catch (error) {
    console.error('❌ Error in Twilio provisioning:', error);
    throw error;
  }
}

/**
 * Get user's Twilio configuration
 */
export async function getUserTwilioConfig(userId) {
  try {
    const { data, error } = await supabase
      .from('user_twilio_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // Not found error
      throw error;
    }
    
    if (data && data.twilio_auth_token) {
      // Decrypt auth token before returning
      data.twilio_auth_token = decrypt(data.twilio_auth_token);
    }
    
    return data;
  } catch (error) {
    console.error('Error getting user Twilio config:', error);
    throw error;
  }
}

/**
 * Suspend user's Twilio service
 */
export async function suspendUserTwilioService(userId) {
  try {
    const config = await getUserTwilioConfig(userId);
    if (!config || config.status !== 'active') {
      return { message: 'No active Twilio service to suspend' };
    }
    
    // Update phone number to remove webhooks
    const subaccountClient = twilio(config.twilio_subaccount_sid, config.twilio_auth_token);
    
    await subaccountClient
      .incomingPhoneNumbers(config.twilio_phone_number_sid)
      .update({
        voiceUrl: '',
        smsUrl: '',
        statusCallback: ''
      });
    
    // Update status in database
    const { data, error } = await supabase
      .from('user_twilio_config')
      .update({
        status: 'suspended',
        metadata: {
          ...config.metadata,
          suspended_at: new Date().toISOString()
        }
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log('✅ Twilio service suspended for user:', userId);
    return data;
    
  } catch (error) {
    console.error('Error suspending Twilio service:', error);
    throw error;
  }
}

/**
 * Reactivate user's Twilio service
 */
export async function reactivateUserTwilioService(userId) {
  try {
    const config = await getUserTwilioConfig(userId);
    if (!config || config.status !== 'suspended') {
      return { message: 'No suspended Twilio service to reactivate' };
    }
    
    // Reconfigure webhooks
    await configureWebhooks(
      config.twilio_subaccount_sid,
      config.twilio_auth_token,
      config.twilio_phone_number_sid,
      userId
    );
    
    // Update status in database
    const { data, error } = await supabase
      .from('user_twilio_config')
      .update({
        status: 'active',
        metadata: {
          ...config.metadata,
          reactivated_at: new Date().toISOString()
        }
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log('✅ Twilio service reactivated for user:', userId);
    return data;
    
  } catch (error) {
    console.error('Error reactivating Twilio service:', error);
    throw error;
  }
}

export default {
  provisionTwilioForUser,
  getUserTwilioConfig,
  suspendUserTwilioService,
  reactivateUserTwilioService
};