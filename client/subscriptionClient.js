/**
 * RepConnect Subscription Client
 * 
 * A client library for integrating with the unified RepConnect subscription system.
 * Use this in your apps to check subscription status, validate access, and track usage.
 * 
 * Example usage:
 * ```javascript
 * import SubscriptionClient from '@repconnect/subscription-client';
 * 
 * const client = new SubscriptionClient({
 *   apiUrl: 'https://osbackend-zl1h.onrender.com',
 *   apiKey: process.env.REPCONNECT_API_KEY,
 *   cacheTimeout: 300000 // 5 minutes
 * });
 * 
 * // Check if user can make a call
 * const access = await client.validateAccess(userId, 'calls');
 * if (!access.allowed) {
 *   showUpgradePrompt(access.tier, access.overage);
 * }
 * 
 * // Track usage after successful action
 * await client.trackUsage(userId, 'calls', 1, 'canvas');
 * ```
 */

export class SubscriptionClient {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.REPCONNECT_API_URL || 'https://osbackend-zl1h.onrender.com';
    this.apiKey = config.apiKey || process.env.REPCONNECT_API_KEY;
    this.cacheTimeout = config.cacheTimeout || 5 * 60 * 1000; // 5 minutes default
    this.cache = new Map();
    this.appName = config.appName || 'unknown';
  }

  /**
   * Make an authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get cached data or fetch if expired
   */
  async getCached(key, fetcher) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheTimeout
    });

    return data;
  }

  /**
   * Validate user access to a feature
   */
  async validateAccess(userId, feature, requestedQuantity = 1, email = null) {
    const cacheKey = `access_${userId || email}_${feature}`;
    
    return this.getCached(cacheKey, async () => {
      const result = await this.request('/api/subscription/validate-access', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          email,
          feature,
          requestedQuantity
        })
      });

      return result.data;
    });
  }

  /**
   * Check all subscription limits for a user
   */
  async checkLimits(userId, email = null) {
    const cacheKey = `limits_${userId || email}`;
    
    return this.getCached(cacheKey, async () => {
      const result = await this.request('/api/subscription/check-limits', {
        method: 'POST',
        body: JSON.stringify({ userId, email })
      });

      return result.data;
    });
  }

  /**
   * Track feature usage
   */
  async trackUsage(userId, feature, quantity = 1, metadata = {}, email = null) {
    const result = await this.request('/api/subscription/track-usage', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        email,
        feature,
        quantity,
        appName: this.appName,
        metadata
      })
    });

    // Clear relevant caches
    this.cache.delete(`access_${userId || email}_${feature}`);
    this.cache.delete(`limits_${userId || email}`);

    return result.data;
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(userId, period = 'current_month', email = null) {
    const params = new URLSearchParams({ period });
    if (userId) params.append('userId', userId);
    if (email) params.append('email', email);

    const result = await this.request(`/api/subscription/usage-stats?${params}`);
    return result.data;
  }

  /**
   * Check if user has Twilio configured
   */
  async getTwilioConfig(userId) {
    const result = await this.request(`/api/subscription/twilio-config?userId=${userId}`);
    return result.data;
  }

  /**
   * Provision Twilio for a user (admin/backend only)
   */
  async provisionTwilio(userId, email, subscriptionTier, areaCode = null) {
    const result = await this.request('/api/subscription/provision-twilio', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        email,
        subscriptionTier,
        areaCode
      })
    });

    return result.data;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Helper: Check if feature is available for tier
   */
  isFeatureAvailable(tier, feature) {
    const tierFeatures = {
      free: ['ai_queries', 'transcriptions'],
      repx1: ['calls', 'ai_queries', 'transcriptions'],
      repx2: ['calls', 'emails', 'canvas_scans', 'ai_queries', 'transcriptions'],
      repx3: ['calls', 'emails', 'canvas_scans', 'ai_queries', 'transcriptions'],
      repx4: ['calls', 'emails', 'canvas_scans', 'ai_queries', 'transcriptions'],
      repx5: ['calls', 'emails', 'canvas_scans', 'ai_queries', 'transcriptions']
    };

    return tierFeatures[tier]?.includes(feature) || false;
  }

  /**
   * Helper: Get tier display name
   */
  getTierDisplayName(tier) {
    const names = {
      free: 'Free',
      repx1: 'RepX1 Professional',
      repx2: 'RepX2 Market Intelligence',
      repx3: 'RepX3 Territory Command',
      repx4: 'RepX4 Executive Operations',
      repx5: 'RepX5 Elite Global'
    };

    return names[tier] || tier;
  }

  /**
   * Helper: Format usage for display
   */
  formatUsage(used, limit) {
    if (limit === 'unlimited' || limit === -1) {
      return `${used} used (unlimited)`;
    }
    return `${used} / ${limit}`;
  }
}

/**
 * React Hook for subscription management
 * 
 * Example:
 * ```javascript
 * import { useSubscription } from '@repconnect/subscription-client/react';
 * 
 * function MyComponent() {
 *   const { limits, validateAccess, trackUsage, loading } = useSubscription(userId);
 *   
 *   const handleAction = async () => {
 *     const access = await validateAccess('calls');
 *     if (!access.allowed) {
 *       showUpgradeModal();
 *       return;
 *     }
 *     
 *     // Perform action
 *     await makeCall();
 *     
 *     // Track usage
 *     await trackUsage('calls', 1);
 *   };
 * }
 * ```
 */
export function useSubscription(userId, email = null, config = {}) {
  const [client] = useState(() => new SubscriptionClient(config));
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId && !email) return;

    const loadLimits = async () => {
      try {
        setLoading(true);
        const data = await client.checkLimits(userId, email);
        setLimits(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadLimits();
  }, [userId, email]);

  const validateAccess = useCallback(
    async (feature, quantity = 1) => {
      try {
        return await client.validateAccess(userId, feature, quantity, email);
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [userId, email]
  );

  const trackUsage = useCallback(
    async (feature, quantity = 1, metadata = {}) => {
      try {
        const result = await client.trackUsage(userId, feature, quantity, metadata, email);
        // Refresh limits
        const newLimits = await client.checkLimits(userId, email);
        setLimits(newLimits);
        return result;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [userId, email]
  );

  return {
    limits,
    loading,
    error,
    validateAccess,
    trackUsage,
    tier: limits?.tier,
    isFeatureAvailable: (feature) => client.isFeatureAvailable(limits?.tier, feature),
    formatUsage: client.formatUsage.bind(client),
    getTierDisplayName: () => client.getTierDisplayName(limits?.tier)
  };
}

// For environments that don't support ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubscriptionClient, useSubscription };
}

export default SubscriptionClient;