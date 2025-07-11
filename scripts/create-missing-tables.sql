-- Create missing tables that the code expects

-- Activity log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Callback requests table  
CREATE TABLE IF NOT EXISTS public.callback_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  name TEXT,
  email TEXT,
  preferred_time TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency calls table
CREATE TABLE IF NOT EXISTS public.emergency_calls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  caller_number TEXT NOT NULL,
  emergency_type TEXT,
  location TEXT,
  details JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice calls table
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  call_sid TEXT UNIQUE,
  from_number TEXT,
  to_number TEXT,
  duration INTEGER,
  status TEXT,
  recording_url TEXT,
  transcript TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_callback_requests_status ON public.callback_requests(status);
CREATE INDEX idx_emergency_calls_status ON public.emergency_calls(status);
CREATE INDEX idx_voice_calls_call_sid ON public.voice_calls(call_sid);

-- Enable RLS on all tables
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;

-- Grant basic permissions
GRANT ALL ON public.activity_log TO anon, authenticated;
GRANT ALL ON public.callback_requests TO anon, authenticated;
GRANT ALL ON public.emergency_calls TO anon, authenticated;
GRANT ALL ON public.voice_calls TO anon, authenticated;