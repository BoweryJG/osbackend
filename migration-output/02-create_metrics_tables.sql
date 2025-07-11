-- ============================================
-- METRICS AGGREGATOR TABLES
-- ============================================
-- This migration creates the unified metrics schema
-- for collecting and aggregating data from all systems
-- ============================================

-- Create metrics table for storing all metric events
CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'harvey_performance',
    'voice_call',
    'email_campaign',
    'agent_interaction',
    'api_usage',
    'system_health'
  )),
  
  -- Reference IDs for different metric types
  conversation_id UUID,
  call_id UUID,
  email_id UUID,
  campaign_id UUID,
  user_id UUID REFERENCES auth.users(id),
  
  -- Metric data
  metrics JSONB NOT NULL DEFAULT '{}',
  cost DECIMAL(10,6) DEFAULT 0,
  
  -- Timestamps
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_metrics_type ON metrics(type);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_user_id ON metrics(user_id);
CREATE INDEX idx_metrics_conversation_id ON metrics(conversation_id);
CREATE INDEX idx_metrics_type_timestamp ON metrics(type, timestamp DESC);

-- Create metric aggregates table for pre-computed statistics
CREATE TABLE IF NOT EXISTS metric_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(20) NOT NULL CHECK (period IN ('minute', 'hour', 'day', 'week', 'month')),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  type VARCHAR(50) NOT NULL,
  
  -- Aggregated data
  count INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0,
  avg_cost DECIMAL(10,6) DEFAULT 0,
  min_cost DECIMAL(10,6) DEFAULT 0,
  max_cost DECIMAL(10,6) DEFAULT 0,
  
  -- Type-specific aggregated metrics
  aggregated_metrics JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for aggregates
CREATE INDEX idx_metric_aggregates_period ON metric_aggregates(period);
CREATE INDEX idx_metric_aggregates_type ON metric_aggregates(type);
CREATE INDEX idx_metric_aggregates_period_start ON metric_aggregates(period_start DESC);
CREATE UNIQUE INDEX idx_metric_aggregates_unique ON metric_aggregates(period, period_start, type);

-- Create API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL CHECK (service IN (
    'openai',
    'elevenlabs',
    'twilio',
    'sendgrid',
    'supabase'
  )),
  endpoint VARCHAR(255),
  method VARCHAR(20),
  
  -- Usage data
  tokens_used JSONB,
  characters_used INTEGER,
  duration_seconds INTEGER,
  request_count INTEGER DEFAULT 1,
  
  -- Cost tracking
  unit_cost DECIMAL(10,6),
  total_cost DECIMAL(10,6),
  
  -- References
  user_id UUID REFERENCES auth.users(id),
  related_id UUID, -- Can reference conversation, call, email, etc.
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  error VARCHAR(500),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for API usage
CREATE INDEX idx_api_usage_service ON api_usage_logs(service);
CREATE INDEX idx_api_usage_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_created_at ON api_usage_logs(created_at DESC);

-- Create alerts table for threshold monitoring
CREATE TABLE IF NOT EXISTS metric_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  
  -- Alert details
  metric_type VARCHAR(50),
  threshold_value DECIMAL(10,2),
  actual_value DECIMAL(10,2),
  message TEXT NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for alerts
CREATE INDEX idx_metric_alerts_status ON metric_alerts(status);
CREATE INDEX idx_metric_alerts_severity ON metric_alerts(severity);
CREATE INDEX idx_metric_alerts_created_at ON metric_alerts(created_at DESC);

-- Create dashboard cache table for performance
CREATE TABLE IF NOT EXISTS dashboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  cache_type VARCHAR(50) NOT NULL,
  
  -- Cached data
  data JSONB NOT NULL,
  
  -- TTL management
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for cache expiration
CREATE INDEX idx_dashboard_cache_expires_at ON dashboard_cache(expires_at);
CREATE INDEX idx_dashboard_cache_key ON dashboard_cache(cache_key);

-- Create function to automatically clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM dashboard_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_metric_alerts_updated_at
  BEFORE UPDATE ON metric_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_cache_updated_at
  BEFORE UPDATE ON dashboard_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE OR REPLACE VIEW daily_metrics_summary AS
SELECT 
  date_trunc('day', timestamp) as date,
  type,
  COUNT(*) as count,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost,
  COUNT(DISTINCT user_id) as unique_users
FROM metrics
WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date_trunc('day', timestamp), type
ORDER BY date DESC, type;

CREATE OR REPLACE VIEW hourly_metrics_summary AS
SELECT 
  date_trunc('hour', timestamp) as hour,
  type,
  COUNT(*) as count,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost
FROM metrics
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY date_trunc('hour', timestamp), type
ORDER BY hour DESC, type;

CREATE OR REPLACE VIEW active_alerts AS
SELECT 
  *,
  CASE 
    WHEN severity = 'critical' THEN 1
    WHEN severity = 'error' THEN 2
    WHEN severity = 'warning' THEN 3
    ELSE 4
  END as severity_order
FROM metric_alerts
WHERE status = 'active'
ORDER BY severity_order, created_at DESC;

-- Create materialized view for expensive aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_cost_analysis AS
SELECT 
  date_trunc('week', timestamp) as week,
  type,
  COUNT(*) as total_events,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost_per_event,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT DATE(timestamp)) as active_days
FROM metrics
WHERE timestamp >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY date_trunc('week', timestamp), type
ORDER BY week DESC, total_cost DESC;

-- Create index on materialized view
CREATE INDEX idx_weekly_cost_analysis_week ON weekly_cost_analysis(week);

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_metric_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_cost_analysis;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust based on your user roles)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT ON metrics, api_usage_logs, metric_alerts TO authenticated;
GRANT UPDATE ON metric_alerts, dashboard_cache TO authenticated;

-- Create RPC function for custom SQL execution (used by aggregator)
CREATE OR REPLACE FUNCTION execute_sql(query text, params text[] DEFAULT '{}')
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  -- Security check: only allow SELECT queries
  IF NOT (query ~* '^\s*SELECT') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Execute query with parameters
  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query)
  USING params
  INTO result;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create scheduled job to clean up old metrics (requires pg_cron extension)
-- Note: This is a comment as pg_cron setup varies by environment
-- SELECT cron.schedule('cleanup-old-metrics', '0 3 * * *', $$DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '90 days'$$);
-- SELECT cron.schedule('refresh-metric-views', '0 * * * *', $$SELECT refresh_metric_views()$$);
-- SELECT cron.schedule('clean-expired-cache', '*/15 * * * *', $$SELECT clean_expired_cache()$$);