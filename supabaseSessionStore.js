import session from 'express-session';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class SupabaseSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.table = options.table || 'sessions';
    this.ttl = options.ttl || 86400; // default: 1 day in seconds
  }

  async get(sid, callback) {
    try {
      const { data, error } = await supabase
        .from(this.table)
        .select('sess')
        .eq('sid', sid)
        .single();
      if (error || !data) return callback(null, null);
      const sess = typeof data.sess === 'string' ? JSON.parse(data.sess) : data.sess;
      callback(null, sess);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sess, callback) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).toISOString()
        : new Date(Date.now() + this.ttl * 1000).toISOString();
      const { error } = await supabase
        .from(this.table)
        .upsert([{ sid, sess: JSON.stringify(sess), expires }], { onConflict: 'sid' });
      callback(error || null);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      const { error } = await supabase
        .from(this.table)
        .delete()
        .eq('sid', sid);
      callback(error || null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sid, sess, callback) {
    // Update only the expiration
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).toISOString()
        : new Date(Date.now() + this.ttl * 1000).toISOString();
      const { error } = await supabase
        .from(this.table)
        .update({ expires })
        .eq('sid', sid);
      callback(error || null);
    } catch (err) {
      callback(err);
    }
  }
}

export default SupabaseSessionStore;
