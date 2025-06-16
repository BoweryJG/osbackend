# Unified Authentication Deployment Checklist

## Overview
All RepSpheres applications have been updated to use a unified authentication system with cross-domain session synchronization. This document provides the deployment steps and testing procedures.

## What Was Changed

### 1. **Standardized Configuration**
- All apps now use the same Supabase storage key: `repspheres-auth`
- Cookie domain set to `.repspheres.com` for production
- Consistent auth options across all applications

### 2. **Cross-Domain Auth Utilities**
Added `crossDomainAuth.js/ts` to each app with:
- Session broadcasting via iframes
- Cross-domain message listeners
- Return URL management
- Centralized OAuth through main domain

### 3. **Updated Apps**
- **Homepage (globalrepspheres)**: Already configured as auth gateway ✓
- **Market Data**: Updated auth context and Supabase config ✓
- **Podcast**: Updated auth context and Supabase config ✓
- **Canvas**: Updated auth context and Supabase config ✓
- **CRM**: Updated auth context and Supabase config ✓

### 4. **Auth Sync Pages**
Created `/public/auth/sync.html` in each subdomain app for cross-domain communication.

## Deployment Order

### Phase 1: Backend Services
```bash
# 1. Deploy osbackend (if any changes needed)
cd /Users/jasonsmacbookpro2022/osbackend
git add .
git commit -m "Add shared cross-domain auth utilities"
git push
```

### Phase 2: Homepage (Auth Gateway)
```bash
# 2. Verify homepage is already deployed with latest changes
cd /Users/jasonsmacbookpro2022/Documents/globalrepspheres
# No changes needed - already configured
```

### Phase 3: Subdomain Applications (Deploy in parallel)

#### Market Data
```bash
cd /Users/jasonsmacbookpro2022/market_data_jg
npm run build
git add .
git commit -m "Implement unified cross-domain authentication"
git push
# Deploy to your hosting service
```

#### Podcast
```bash
cd /Users/jasonsmacbookpro2022/podcast-repspheres
npm run build
git add .
git commit -m "Implement unified cross-domain authentication"
git push
# Deploy to your hosting service
```

#### Canvas
```bash
cd /Users/jasonsmacbookpro2022/canvas
npm run build
git add .
git commit -m "Implement unified cross-domain authentication"
git push
# Deploy to your hosting service
```

#### CRM
```bash
cd /Users/jasonsmacbookpro2022/crm
npm run build
git add .
git commit -m "Implement unified cross-domain authentication"
git push
# Deploy to your hosting service
```

## Testing Checklist

### Pre-Testing Setup
1. [ ] Clear all cookies for `.repspheres.com` domain
2. [ ] Clear localStorage for all RepSpheres domains
3. [ ] Open browser developer tools to monitor network requests

### Test 1: Basic Cross-Domain Auth
1. [ ] Go to https://repspheres.com
2. [ ] Click login and authenticate with Google/Email
3. [ ] Verify you're logged in on homepage
4. [ ] Navigate to https://marketdata.repspheres.com
5. [ ] Verify you're automatically logged in (no redirect)
6. [ ] Navigate to https://canvas.repspheres.com
7. [ ] Verify you're automatically logged in
8. [ ] Navigate to https://crm.repspheres.com
9. [ ] Verify you're automatically logged in
10. [ ] Navigate to https://podcast.repspheres.com
11. [ ] Verify you're automatically logged in

### Test 2: Direct Subdomain Access
1. [ ] Clear all auth data again
2. [ ] Go directly to https://marketdata.repspheres.com
3. [ ] Should redirect to https://repspheres.com/login
4. [ ] Login with credentials
5. [ ] Should redirect back to marketdata after login
6. [ ] Verify you're logged in on marketdata

### Test 3: Cross-Domain Logout
1. [ ] While logged in, go to any subdomain
2. [ ] Click logout
3. [ ] Navigate to another subdomain
4. [ ] Verify you're logged out everywhere

### Test 4: Session Persistence
1. [ ] Login on main domain
2. [ ] Close browser completely
3. [ ] Reopen and go to a subdomain
4. [ ] Verify you're still logged in

### Test 5: OAuth Return URLs
1. [ ] Clear auth and go to https://canvas.repspheres.com/some/deep/path
2. [ ] Get redirected to login
3. [ ] Login with OAuth (Google)
4. [ ] Verify you're returned to the original deep path

## Debug Commands

Run these in browser console to check auth state:

```javascript
// Check current auth session
localStorage.getItem('repspheres-auth')

// Check cookies
document.cookie

// Check if cross-domain listener is active
window.crossDomainAuthActive = true; // Should be set by the listener

// Force auth state broadcast (for testing)
const session = JSON.parse(localStorage.getItem('repspheres-auth'))?.currentSession;
if (session && window.broadcastAuthState) {
  window.broadcastAuthState(session);
}
```

## Rollback Plan

If issues occur, you can rollback each app independently:

1. **Revert code changes**:
   ```bash
   git revert HEAD
   git push
   ```

2. **Temporary fix** (add to each app's index.html):
   ```html
   <script>
     // Disable cross-domain auth temporarily
     window.DISABLE_CROSS_DOMAIN_AUTH = true;
   </script>
   ```

## Common Issues & Solutions

### Issue: Auth state not syncing
- **Check**: Browser console for errors
- **Check**: Network tab for blocked iframe requests
- **Fix**: Ensure all domains are on HTTPS
- **Fix**: Check Content Security Policy headers

### Issue: Redirect loops
- **Check**: localStorage for stuck return URLs
- **Fix**: Clear all storage and cookies
- **Fix**: Check redirect URL configuration

### Issue: OAuth not working
- **Check**: Supabase dashboard for allowed redirect URLs
- **Check**: Should include: `https://repspheres.com/auth/callback`
- **Fix**: Add all callback URLs to Supabase

### Issue: Cookies not sharing
- **Check**: Cookie domain in browser dev tools
- **Fix**: Must be `.repspheres.com` (with leading dot)
- **Fix**: Ensure all apps use HTTPS in production

## Post-Deployment Verification

After all apps are deployed:

1. [ ] Run full test suite again
2. [ ] Check error monitoring for auth-related errors
3. [ ] Monitor user feedback channels
4. [ ] Check Supabase logs for unusual activity

## Success Metrics

- Users can navigate between all RepSpheres apps without re-authenticating
- OAuth login from any subdomain returns user to original location
- Logout from any app logs out from all apps
- No increase in authentication errors in monitoring

## Notes

- The homepage (globalrepspheres) acts as the central auth gateway
- All OAuth redirects go through the main domain
- Session data is synchronized via iframe postMessage
- Each app maintains its own Supabase client but shares auth state
- Development (localhost) uses different ports but same principles

## Support

If you encounter issues:
1. Check browser console for detailed error messages
2. Verify all apps are using the latest deployed version
3. Ensure Supabase configuration matches across all apps
4. Check that all domains are properly configured in DNS