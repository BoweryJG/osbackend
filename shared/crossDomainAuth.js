/**
 * Cross-Domain Authentication Utilities
 * Shared across all RepSpheres applications
 */

// Configuration for all RepSpheres domains
const REPSPHERES_DOMAINS = {
  main: 'https://repspheres.com',
  marketdata: 'https://marketdata.repspheres.com',
  canvas: 'https://canvas.repspheres.com',
  crm: 'https://crm.repspheres.com',
  podcast: 'https://podcast.repspheres.com'
};

// Development domains
const DEV_PORTS = {
  main: 3000,
  marketdata: 3001,
  canvas: 3002,
  crm: 3003,
  podcast: 3004
};

/**
 * Get the main domain URL (for centralized auth)
 */
export function getMainDomain() {
  if (window.location.hostname === 'localhost') {
    return `http://localhost:${DEV_PORTS.main}`;
  }
  return REPSPHERES_DOMAINS.main;
}

/**
 * Check if we're on a RepSpheres subdomain
 */
export function isOnSubdomain() {
  const hostname = window.location.hostname;
  return hostname.includes('marketdata.repspheres.com') ||
         hostname.includes('canvas.repspheres.com') ||
         hostname.includes('crm.repspheres.com') ||
         hostname.includes('podcast.repspheres.com');
}

/**
 * Get the current domain context
 */
export function getCurrentDomain() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('marketdata.repspheres.com')) {
    return 'marketdata';
  } else if (hostname.includes('canvas.repspheres.com')) {
    return 'canvas';
  } else if (hostname.includes('crm.repspheres.com')) {
    return 'crm';
  } else if (hostname.includes('podcast.repspheres.com')) {
    return 'podcast';
  }
  
  return 'main';
}

/**
 * Store the return URL for cross-domain auth
 */
export function storeReturnUrl(url = window.location.href) {
  sessionStorage.setItem('authReturnUrl', url);
  localStorage.setItem('authReturnUrl', url);
  
  const domain = getCurrentDomain();
  sessionStorage.setItem('authReturnDomain', domain);
  localStorage.setItem('authReturnDomain', domain);
}

/**
 * Get and clear the stored return URL
 */
export function getAndClearReturnUrl() {
  let returnUrl = sessionStorage.getItem('authReturnUrl') || 
                  localStorage.getItem('authReturnUrl');
  
  sessionStorage.removeItem('authReturnUrl');
  sessionStorage.removeItem('authReturnDomain');
  localStorage.removeItem('authReturnUrl');
  localStorage.removeItem('authReturnDomain');
  
  return returnUrl;
}

/**
 * Validate if a URL belongs to RepSpheres domains
 */
export function isValidRepSpheresUrl(url) {
  if (!url) return false;
  
  // Check production domains
  const isValidDomain = Object.values(REPSPHERES_DOMAINS).some(domain => 
    url.startsWith(domain)
  );
  
  // Check localhost development
  const isLocalDev = url.includes('localhost:') && 
    Object.values(DEV_PORTS).some(port => url.includes(`:${port}`));
  
  return isValidDomain || isLocalDev;
}

/**
 * Handle authentication redirect with Supabase client
 */
export async function handleCrossDomainRedirect(supabaseClient) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
      // Broadcast auth state to other domains
      broadcastAuthState(session);
      
      // Handle stored return URL
      const returnUrl = getAndClearReturnUrl();
      if (returnUrl && isValidRepSpheresUrl(returnUrl)) {
        window.location.href = returnUrl;
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error handling cross-domain redirect:', error);
    return false;
  }
}

/**
 * Setup cross-domain auth message listener with Supabase client
 */
export function setupCrossDomainAuthListener(supabaseClient) {
  window.addEventListener('message', async (event) => {
    // Validate origin
    if (!isValidRepSpheresUrl(event.origin)) {
      return;
    }
    
    // Handle auth state sync messages
    if (event.data.type === 'AUTH_STATE_SYNC') {
      const { session } = event.data;
      
      if (session) {
        try {
          await supabaseClient.auth.setSession(session);
        } catch (error) {
          console.error('Error setting session:', error);
        }
      } else {
        await supabaseClient.auth.signOut();
      }
    }
    
    // Handle auth check requests
    if (event.data.type === 'AUTH_CHECK_REQUEST') {
      const { data: { session } } = await supabaseClient.auth.getSession();
      event.source.postMessage({
        type: 'AUTH_CHECK_RESPONSE',
        session: session,
        authenticated: !!session
      }, event.origin);
    }
  });
}

/**
 * Broadcast auth state to other domains
 */
export function broadcastAuthState(session) {
  if (!window.postMessage) return;
  
  const domains = window.location.hostname === 'localhost' 
    ? Object.entries(DEV_PORTS).map(([key, port]) => `http://localhost:${port}`)
    : Object.values(REPSPHERES_DOMAINS);
  
  domains.forEach(domain => {
    if (domain !== window.location.origin) {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `${domain}/auth/sync`;
        document.body.appendChild(iframe);
        
        iframe.onload = () => {
          iframe.contentWindow.postMessage({
            type: 'AUTH_STATE_SYNC',
            session: session
          }, domain);
          
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        };
        
        // Cleanup on error
        iframe.onerror = () => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        };
      } catch (error) {
        console.error(`Failed to sync auth with ${domain}:`, error);
      }
    }
  });
}

/**
 * Get standardized Supabase auth configuration
 */
export function getStandardAuthConfig() {
  const isProduction = window.location.hostname !== 'localhost';
  
  return {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'repspheres-auth',
      flowType: 'pkce',
      cookies: isProduction ? {
        domain: '.repspheres.com',
        sameSite: 'lax',
        secure: true,
        path: '/'
      } : {
        domain: 'localhost',
        sameSite: 'lax',
        secure: false,
        path: '/'
      }
    }
  };
}

export default {
  getMainDomain,
  isOnSubdomain,
  getCurrentDomain,
  storeReturnUrl,
  getAndClearReturnUrl,
  isValidRepSpheresUrl,
  handleCrossDomainRedirect,
  setupCrossDomainAuthListener,
  broadcastAuthState,
  getStandardAuthConfig,
  REPSPHERES_DOMAINS,
  DEV_PORTS
};