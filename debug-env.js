// Debug script to check environment variables on Render
console.log('=== Environment Variable Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('');

// Check Supabase variables
console.log('Supabase Variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set ✓' : 'Not set ✗');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'Set ✓' : 'Not set ✗');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set ✓' : 'Not set ✗');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set ✓' : 'Not set ✗');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set ✓' : 'Not set ✗');
console.log('');

// Show first 20 chars of keys if they exist (for verification)
if (process.env.SUPABASE_KEY) {
  console.log('SUPABASE_KEY preview:', process.env.SUPABASE_KEY.substring(0, 20) + '...');
}
if (process.env.SUPABASE_SERVICE_KEY) {
  console.log('SUPABASE_SERVICE_KEY preview:', process.env.SUPABASE_SERVICE_KEY.substring(0, 20) + '...');
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('SUPABASE_SERVICE_ROLE_KEY preview:', process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...');
}

// Exit after logging
process.exit(0);