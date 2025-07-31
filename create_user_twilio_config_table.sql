-- Create table for storing user Twilio configuration
CREATE TABLE IF NOT EXISTS user_twilio_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    twilio_subaccount_sid VARCHAR(255) UNIQUE,
    twilio_auth_token TEXT, -- Encrypted in production
    twilio_phone_number VARCHAR(50),
    twilio_phone_number_sid VARCHAR(255),
    webhook_url TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'failed', 'suspended'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_user_twilio_config_user_id ON user_twilio_config(user_id);
CREATE INDEX idx_user_twilio_config_email ON user_twilio_config(email);
CREATE INDEX idx_user_twilio_config_status ON user_twilio_config(status);

-- Create table for tracking usage across all features
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    feature_type VARCHAR(50) NOT NULL, -- 'calls', 'emails', 'canvas_scans', 'ai_queries', 'transcriptions'
    quantity INTEGER DEFAULT 1,
    subscription_tier VARCHAR(20), -- 'repx1', 'repx2', 'repx3', 'repx4', 'repx5'
    app_name VARCHAR(100), -- 'canvas', 'market_data', 'globalrep', etc.
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for usage tracking
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_email ON usage_tracking(email);
CREATE INDEX idx_usage_tracking_feature_type ON usage_tracking(feature_type);
CREATE INDEX idx_usage_tracking_timestamp ON usage_tracking(timestamp);
CREATE INDEX idx_usage_tracking_monthly ON usage_tracking(user_id, feature_type, date_trunc('month', timestamp));

-- Add trigger to update updated_at
CREATE TRIGGER update_user_twilio_config_updated_at 
    BEFORE UPDATE ON user_twilio_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get user's current month usage
CREATE OR REPLACE FUNCTION get_user_monthly_usage(
    p_user_id UUID,
    p_feature_type VARCHAR(50),
    p_month DATE DEFAULT date_trunc('month', NOW())::DATE
)
RETURNS INTEGER AS $$
DECLARE
    v_total_usage INTEGER;
BEGIN
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_usage
    FROM usage_tracking
    WHERE user_id = p_user_id
      AND feature_type = p_feature_type
      AND date_trunc('month', timestamp) = date_trunc('month', p_month::TIMESTAMP);
    
    RETURN v_total_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check feature access based on tier
CREATE OR REPLACE FUNCTION check_feature_access(
    p_user_id UUID,
    p_feature_type VARCHAR(50),
    p_requested_quantity INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
    v_subscription RECORD;
    v_current_usage INTEGER;
    v_limit INTEGER;
    v_tier_limits JSONB;
BEGIN
    -- Get user's current subscription tier
    SELECT 
        us.plan_id as tier,
        us.stripe_subscription_id
    INTO v_subscription
    FROM user_subscriptions us
    WHERE us.user_id = p_user_id
    ORDER BY us.updated_at DESC
    LIMIT 1;
    
    -- Default to free if no subscription
    IF v_subscription IS NULL OR v_subscription.tier IS NULL THEN
        v_subscription.tier := 'free';
    END IF;
    
    -- Define tier limits
    v_tier_limits := '{
        "free": {"calls": 0, "emails": 0, "canvas_scans": 0, "ai_queries": 10, "transcriptions": 5},
        "repx1": {"calls": 100, "emails": 0, "canvas_scans": 0, "ai_queries": 50, "transcriptions": 100},
        "repx2": {"calls": 200, "emails": 50, "canvas_scans": 10, "ai_queries": 100, "transcriptions": 200},
        "repx3": {"calls": 400, "emails": 100, "canvas_scans": 25, "ai_queries": 500, "transcriptions": 400},
        "repx4": {"calls": 800, "emails": 200, "canvas_scans": 50, "ai_queries": 1000, "transcriptions": 800},
        "repx5": {"calls": -1, "emails": -1, "canvas_scans": -1, "ai_queries": -1, "transcriptions": -1}
    }'::JSONB;
    
    -- Get limit for this feature and tier
    v_limit := (v_tier_limits->v_subscription.tier->p_feature_type)::INTEGER;
    
    -- If limit is -1, it's unlimited
    IF v_limit = -1 THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'tier', v_subscription.tier,
            'limit', 'unlimited',
            'current_usage', 0,
            'remaining', 'unlimited'
        );
    END IF;
    
    -- Get current month usage
    v_current_usage := get_user_monthly_usage(p_user_id, p_feature_type);
    
    -- Check if request would exceed limit
    IF v_current_usage + p_requested_quantity > v_limit THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'tier', v_subscription.tier,
            'limit', v_limit,
            'current_usage', v_current_usage,
            'remaining', GREATEST(0, v_limit - v_current_usage),
            'overage', (v_current_usage + p_requested_quantity) - v_limit,
            'message', format('Monthly limit exceeded for %s. Current: %s, Limit: %s', 
                             p_feature_type, v_current_usage, v_limit)
        );
    END IF;
    
    RETURN jsonb_build_object(
        'allowed', true,
        'tier', v_subscription.tier,
        'limit', v_limit,
        'current_usage', v_current_usage,
        'remaining', v_limit - v_current_usage - p_requested_quantity
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable row level security
ALTER TABLE user_twilio_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Policies for user_twilio_config
CREATE POLICY user_twilio_config_user_policy ON user_twilio_config
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_twilio_config_service_policy ON user_twilio_config
    FOR ALL USING (TRUE);

-- Policies for usage_tracking
CREATE POLICY usage_tracking_user_policy ON usage_tracking
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY usage_tracking_service_policy ON usage_tracking
    FOR ALL USING (TRUE);