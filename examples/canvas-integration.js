/**
 * Example: Canvas App Integration with RepConnect Subscription System
 * 
 * This example shows how the Canvas app can integrate with the unified
 * subscription system to check limits and track usage.
 */

import SubscriptionClient from '../client/subscriptionClient.js';

// Initialize the subscription client
const subscriptionClient = new SubscriptionClient({
  apiUrl: process.env.REPCONNECT_API_URL || 'https://osbackend-zl1h.onrender.com',
  appName: 'canvas',
  cacheTimeout: 5 * 60 * 1000 // 5 minutes
});

/**
 * Canvas Practice Scan Handler
 */
export async function handlePracticeScan(userId, practiceData) {
  try {
    // Step 1: Validate access
    console.log('🔍 Checking scan access for user:', userId);
    
    const access = await subscriptionClient.validateAccess(
      userId,
      'canvas_scans',
      1 // Requesting 1 scan
    );

    if (!access.allowed) {
      // User has exceeded their limit
      console.log('❌ Scan limit exceeded:', access);
      
      return {
        success: false,
        error: 'LIMIT_EXCEEDED',
        message: `You've reached your monthly limit of ${access.limit} scans.`,
        currentUsage: access.currentUsage,
        limit: access.limit,
        tier: access.tier,
        upgradeUrl: `/upgrade?from=${access.tier}&feature=canvas_scans`
      };
    }

    // Step 2: Perform the scan
    console.log('✅ Access granted, performing scan...');
    
    const scanResult = await performCanvasScan(practiceData);
    
    // Step 3: Track usage (only if scan succeeded)
    console.log('📊 Tracking usage...');
    
    await subscriptionClient.trackUsage(
      userId,
      'canvas_scans',
      1,
      {
        practiceId: practiceData.id,
        practiceName: practiceData.name,
        scanType: practiceData.scanType || 'full',
        scanDuration: scanResult.duration,
        dataPoints: scanResult.dataPoints
      }
    );

    // Step 4: Return success with usage info
    return {
      success: true,
      scanResult,
      usage: {
        used: access.currentUsage + 1,
        remaining: access.remaining - 1,
        limit: access.limit
      }
    };

  } catch (error) {
    console.error('❌ Error in practice scan:', error);
    
    return {
      success: false,
      error: 'SCAN_ERROR',
      message: error.message
    };
  }
}

/**
 * Check user's Canvas features on app load
 */
export async function checkCanvasFeatures(userId) {
  try {
    const limits = await subscriptionClient.checkLimits(userId);
    
    // Extract Canvas-specific features
    const canvasFeatures = {
      tier: limits.tier,
      scanLimit: limits.limits.canvas_scans?.limit || 0,
      scansUsed: limits.limits.canvas_scans?.used || 0,
      scansRemaining: limits.limits.canvas_scans?.remaining || 0,
      hasAccess: limits.limits.canvas_scans?.limit > 0,
      isUnlimited: limits.limits.canvas_scans?.limit === 'unlimited',
      resetDate: limits.resetDate
    };

    // Check tier-specific features
    canvasFeatures.features = {
      basicScans: ['repx2', 'repx3', 'repx4', 'repx5'].includes(limits.tier),
      advancedAnalytics: ['repx3', 'repx4', 'repx5'].includes(limits.tier),
      competitiveIntel: ['repx3', 'repx4', 'repx5'].includes(limits.tier),
      aiInsights: ['repx4', 'repx5'].includes(limits.tier),
      unlimitedScans: limits.tier === 'repx5'
    };

    return canvasFeatures;
  } catch (error) {
    console.error('Error checking Canvas features:', error);
    return {
      tier: 'free',
      scanLimit: 0,
      hasAccess: false,
      error: error.message
    };
  }
}

/**
 * React Component Example
 */
export function CanvasScanButton({ userId, practiceData, onScanComplete }) {
  const [scanning, setScanning] = useState(false);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load initial usage on mount
    checkCanvasFeatures(userId).then(setUsage);
  }, [userId]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);

    const result = await handlePracticeScan(userId, practiceData);

    if (result.success) {
      setUsage(prev => ({
        ...prev,
        scansUsed: result.usage.used,
        scansRemaining: result.usage.remaining
      }));
      onScanComplete(result.scanResult);
    } else {
      setError(result);
    }

    setScanning(false);
  };

  if (!usage?.hasAccess) {
    return (
      <div className="no-access-prompt">
        <p>Canvas Intelligence requires RepX2 or higher</p>
        <a href="/upgrade" className="upgrade-button">
          Upgrade to RepX2
        </a>
      </div>
    );
  }

  return (
    <div className="scan-button-container">
      <button 
        onClick={handleScan}
        disabled={scanning || usage.scansRemaining === 0}
        className="scan-button"
      >
        {scanning ? 'Scanning...' : 'Scan Practice'}
      </button>
      
      <div className="usage-info">
        {usage.isUnlimited ? (
          <span>Unlimited scans (RepX5)</span>
        ) : (
          <span>{usage.scansRemaining} of {usage.scanLimit} scans remaining</span>
        )}
      </div>

      {error && error.error === 'LIMIT_EXCEEDED' && (
        <div className="limit-exceeded-modal">
          <h3>Monthly Limit Reached</h3>
          <p>{error.message}</p>
          <p>Resets on: {new Date(usage.resetDate).toLocaleDateString()}</p>
          <div className="actions">
            <a href={error.upgradeUrl} className="upgrade-button">
              Upgrade Plan
            </a>
            <button onClick={() => setError(null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mock scan function for testing
 */
async function performCanvasScan(practiceData) {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    id: `scan_${Date.now()}`,
    practiceId: practiceData.id,
    timestamp: new Date().toISOString(),
    duration: 2.5,
    dataPoints: 47,
    insights: [
      'High growth market identified',
      '3 competitor practices within 2 miles',
      'Above average procedure pricing'
    ]
  };
}

/**
 * Batch validation for multiple scans
 */
export async function validateBatchScans(userId, count) {
  const access = await subscriptionClient.validateAccess(
    userId,
    'canvas_scans',
    count
  );

  if (!access.allowed) {
    const possibleScans = Math.min(count, access.remaining);
    return {
      allowed: false,
      requestedCount: count,
      possibleCount: possibleScans,
      message: possibleScans > 0 
        ? `You can only scan ${possibleScans} more practices this month`
        : 'You have reached your monthly scan limit'
    };
  }

  return {
    allowed: true,
    requestedCount: count
  };
}

/**
 * Usage dashboard component
 */
export function CanvasUsageDashboard({ userId }) {
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('current_month');

  useEffect(() => {
    subscriptionClient.getUsageStats(userId, period)
      .then(setStats)
      .catch(console.error);
  }, [userId, period]);

  if (!stats) return <div>Loading usage data...</div>;

  return (
    <div className="usage-dashboard">
      <h3>Canvas Usage Statistics</h3>
      
      <select value={period} onChange={e => setPeriod(e.target.value)}>
        <option value="current_month">Current Month</option>
        <option value="last_month">Last Month</option>
        <option value="last_30_days">Last 30 Days</option>
      </select>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Scans</h4>
          <p className="stat-value">
            {stats.aggregated.canvas_scans?.total || 0}
          </p>
        </div>

        <div className="stat-card">
          <h4>Daily Average</h4>
          <p className="stat-value">
            {Math.round((stats.aggregated.canvas_scans?.total || 0) / 30)}
          </p>
        </div>

        <div className="stat-card">
          <h4>Last Scan</h4>
          <p className="stat-value">
            {stats.aggregated.canvas_scans?.lastUsed 
              ? new Date(stats.aggregated.canvas_scans.lastUsed).toLocaleDateString()
              : 'Never'
            }
          </p>
        </div>
      </div>

      <div className="daily-chart">
        {/* Add chart visualization here */}
      </div>
    </div>
  );
}