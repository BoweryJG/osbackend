/**
 * Auth Debug Utility
 * Helps diagnose cross-domain authentication issues
 */

import supabase from '../supabase';

export async function debugAuth() {
  console.group('🔍 Auth Debug Info');
  
  // 1. Check current domain
  console.log('Current Domain:', window.location.hostname);
  console.log('Current URL:', window.location.href);
  
  // 2. Check Supabase session
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Session Error:', error);
    } else if (session) {
      console.log('✅ Session found:', {
        user_id: session.user.id,
        email: session.user.email,
        expires_at: new Date(session.expires_at * 1000).toLocaleString()
      });
    } else {
      console.log('❌ No session found');
    }
  } catch (err) {
    console.error('Failed to get session:', err);
  }
  
  // 3. Check cookies
  console.log('Cookies:', document.cookie);
  
  // 4. Check localStorage
  console.log('LocalStorage auth keys:');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.includes('auth') || key.includes('supabase')) {
      console.log(`  ${key}:`, localStorage.getItem(key)?.substring(0, 50) + '...');
    }
  }
  
  // 5. Check sessionStorage
  console.log('SessionStorage auth keys:');
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key.includes('auth') || key.includes('return') || key.includes('destination')) {
      console.log(`  ${key}:`, sessionStorage.getItem(key));
    }
  }
  
  // 6. Check Supabase cookie config
  console.log('Supabase Config:', {
    url: supabase.supabaseUrl,
    cookieOptions: supabase.auth?.cookieOptions || 'Not accessible'
  });
  
  console.groupEnd();
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.debugAuth = debugAuth;
  console.log('💡 Run window.debugAuth() to debug authentication issues');
}