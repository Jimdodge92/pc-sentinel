const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.join(__dirname, 'secrets.json');

function loadSecrets() {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[CloudSync] Error reading secrets.json:', e.message);
  }
  return {
    githubToken: '',
    gistId: '',
    gistUrl: '',
    rawUrl: '',
    autoSync: true,
    syncIntervalSec: 30,
    lastSyncTime: null,
    lastSyncStatus: 'idle',
    lastSyncError: null
  };
}

function saveSecrets(secrets) {
  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[CloudSync] Error saving secrets.json:', e.message);
    return false;
  }
}

/**
 * Returns safe status object with token masked for UI display
 */
function getCloudStatus() {
  const secrets = loadSecrets();
  let maskedToken = '';
  if (secrets.githubToken && secrets.githubToken.length > 8) {
    maskedToken = `${secrets.githubToken.substring(0, 4)}...${secrets.githubToken.slice(-4)}`;
  }

  return {
    configured: !!(secrets.githubToken && secrets.gistId),
    hasToken: !!secrets.githubToken,
    maskedToken,
    gistId: secrets.gistId || '',
    gistUrl: secrets.gistUrl || '',
    rawUrl: secrets.rawUrl || '',
    autoSync: secrets.autoSync !== false,
    syncIntervalSec: secrets.syncIntervalSec || 30,
    lastSyncTime: secrets.lastSyncTime || null,
    lastSyncStatus: secrets.lastSyncStatus || 'idle',
    lastSyncError: secrets.lastSyncError || null
  };
}

/**
 * Validates a GitHub token and either links an existing Gist or creates a new private Gist
 */
async function setupCloudVault({ githubToken, gistId, autoSync = true }) {
  if (!githubToken || !githubToken.trim()) {
    throw new Error('A GitHub Personal Access Token (PAT) is required.');
  }

  const cleanToken = githubToken.trim();

  // 1. Verify token by requesting authenticated user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'PC-Sentinel-Telemetry-Agent'
    }
  });

  if (!userRes.ok) {
    throw new Error(`GitHub token verification failed (HTTP ${userRes.status}). Verify your token permissions (gist scope).`);
  }

  const userData = await userRes.json();
  const githubUsername = userData.login;
  let targetGistId = gistId ? gistId.trim() : '';
  let gistUrl = '';
  let rawUrl = '';

  // 2. Link existing Gist or create new secret Gist
  if (targetGistId) {
    const gistCheckRes = await fetch(`https://api.github.com/gists/${targetGistId}`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'PC-Sentinel-Telemetry-Agent'
      }
    });

    if (!gistCheckRes.ok) {
      throw new Error(`Failed to access Gist ${targetGistId} (HTTP ${gistCheckRes.status}). Verify the ID is correct.`);
    }

    const gistData = await gistCheckRes.json();
    gistUrl = gistData.html_url;
    rawUrl = gistData.files?.['sentinel_telemetry.json']?.raw_url || '';
  } else {
    // Auto-create a brand new secret Gist for PC Sentinel
    const createRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'PC-Sentinel-Telemetry-Agent'
      },
      body: JSON.stringify({
        description: 'PC Sentinel - Autonomous Hardware & Crash Diagnostics Cloud Vault',
        public: false,
        files: {
          'sentinel_status.md': {
            'content': `# 🛡️ PC Sentinel Cloud Vault\n\nInitialized for **${githubUsername}** on ${new Date().toISOString()}.\nReady to receive live heartbeats and crash dumps.`
          },
          'sentinel_telemetry.json': {
            'content': JSON.stringify({
              status: 'initialized',
              machine: 'Lenovo ThinkPad T15 Gen 1',
              createdAt: new Date().toISOString()
            }, null, 2)
          }
        }
      })
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`Failed to create secret Gist on GitHub (HTTP ${createRes.status}): ${errBody}`);
    }

    const newGist = await createRes.json();
    targetGistId = newGist.id;
    gistUrl = newGist.html_url;
    rawUrl = newGist.files?.['sentinel_telemetry.json']?.raw_url || '';
  }

  // 3. Save secrets securely to secrets.json
  const secrets = loadSecrets();
  secrets.githubToken = cleanToken;
  secrets.gistId = targetGistId;
  secrets.gistUrl = gistUrl;
  secrets.rawUrl = rawUrl;
  secrets.autoSync = autoSync;
  secrets.lastSyncStatus = 'ready';
  secrets.lastSyncError = null;

  saveSecrets(secrets);

  console.log(`[CloudSync] Connected to GitHub Gist: ${targetGistId} (User: ${githubUsername})`);

  return {
    success: true,
    githubUsername,
    gistId: targetGistId,
    gistUrl,
    rawUrl
  };
}

/**
 * Generate human-readable Markdown summary for the Gist preview
 */
function buildMarkdownSummary(payload) {
  const timeStr = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
  const health = payload.overallHealth || {};
  const statusIcon = health.status === 'critical' ? '🔴 CRITICAL' : (health.status === 'warning' ? '🟡 WARNING' : '🟢 HEALTHY');

  let md = `# 🛡️ PC Sentinel - Cloud Telemetry Vault\n\n`;
  md += `**Host Machine:** ${payload.systemSummary?.Manufacturer || 'Lenovo'} ${payload.systemSummary?.Model || 'ThinkPad T15 Gen 1'} (${payload.systemSummary?.ComputerName || 'ThinkPad'})\n`;
  md += `**Operating System:** ${payload.systemSummary?.OS || 'Windows 11'}\n`;
  md += `**Overall Health:** **${statusIcon}** (${health.label || 'All Systems Healthy'})\n`;
  md += `**Last Recorded Heartbeat:** \`${timeStr}\` (${new Date().toISOString()})\n\n`;

  const topIncident = (payload.incidents && payload.incidents[0]) || null;
  if (topIncident) {
    md += `## 🚨 Latest Recorded Incident\n\n`;
    md += `* **Title:** ${topIncident.title}\n`;
    md += `* **Timestamp:** ${topIncident.timestamp}\n`;
    md += `* **Severity:** ${topIncident.severity?.toUpperCase()}\n`;
    md += `* **What Happened:** ${topIncident.description}\n\n`;
    if (topIncident.likelyCauses?.length > 0) {
      md += `### Why It Happened:\n`;
      topIncident.likelyCauses.forEach(c => {
        md += `* ${c}\n`;
      });
      md += `\n`;
    }
    if (topIncident.remediationSteps?.length > 0) {
      md += `### Actionable Remediation:\n`;
      topIncident.remediationSteps.forEach((s, idx) => {
        md += `${idx + 1}. ${s}\n`;
      });
      md += `\n`;
    }
  }

  md += `## 📊 Quick System Telemetry\n\n`;
  md += `* **CPU:** ${payload.systemSummary?.Processor || 'Intel Core i7'}\n`;
  md += `* **RAM Used:** ${payload.systemSummary?.UsedRAMGB || 0} GB / ${payload.systemSummary?.TotalRAMGB || 0} GB (${payload.systemSummary?.RAMUsagePercent || 0}%)\n`;
  md += `* **System Uptime:** ${payload.systemSummary?.UptimeHours || 0} hours\n`;
  md += `* **Primary Storage:** ${payload.storageData?.Volumes?.PercentFree || 0}% Free (${payload.storageData?.Volumes?.SizeRemainingGB || 0} GB remaining)\n\n`;
  md += `*Generated automatically by PC Sentinel Telemetry Agent.*`;

  return md;
}

/**
 * Pushes live diagnostics payload to the configured GitHub Gist
 */
async function pushTelemetryToGitHub(diagnosticData) {
  const secrets = loadSecrets();
  if (!secrets.githubToken || !secrets.gistId) {
    return { skipped: true, reason: 'GitHub Cloud Vault not configured' };
  }

  const payload = {
    heartbeatTime: new Date().toISOString(),
    hostInfo: {
      computerName: diagnosticData.systemSummary?.ComputerName || 'Jims-ThinkPad',
      manufacturer: diagnosticData.systemSummary?.Manufacturer || 'LENOVO',
      model: diagnosticData.systemSummary?.Model || '20S6001SUS',
      systemFamily: diagnosticData.systemSummary?.SystemFamily || 'ThinkPad T15 Gen 1',
      os: diagnosticData.systemSummary?.OS || 'Windows 11',
      processor: diagnosticData.systemSummary?.Processor,
      uptimeHours: diagnosticData.systemSummary?.UptimeHours || 0
    },
    overallHealth: diagnosticData.overallHealth || { status: 'healthy', label: 'All Systems Healthy' },
    incidents: diagnosticData.incidents || [],
    systemSummary: diagnosticData.systemSummary || {},
    storageData: diagnosticData.storageData || {},
    deviceStatus: diagnosticData.deviceStatus || {},
    scanTime: diagnosticData.scanTime || new Date().toISOString()
  };

  const mdContent = buildMarkdownSummary(payload);
  const jsonContent = JSON.stringify(payload, null, 2);

  try {
    const res = await fetch(`https://api.github.com/gists/${secrets.gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${secrets.githubToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'PC-Sentinel-Telemetry-Agent'
      },
      body: JSON.stringify({
        description: `PC Sentinel Telemetry [${payload.overallHealth.label}] - Updated ${new Date().toLocaleTimeString()}`,
        files: {
          'sentinel_status.md': {
            content: mdContent
          },
          'sentinel_telemetry.json': {
            content: jsonContent
          }
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      secrets.lastSyncStatus = 'error';
      secrets.lastSyncError = `HTTP ${res.status}: ${err}`;
      saveSecrets(secrets);
      console.error(`[CloudSync] Sync failed (HTTP ${res.status}):`, err);
      return { success: false, error: err };
    }

    const updatedGist = await res.json();
    secrets.lastSyncTime = new Date().toISOString();
    secrets.lastSyncStatus = 'success';
    secrets.lastSyncError = null;
    secrets.gistUrl = updatedGist.html_url;
    secrets.rawUrl = updatedGist.files?.['sentinel_telemetry.json']?.raw_url || secrets.rawUrl;
    saveSecrets(secrets);

    console.log(`[CloudSync] Telemetry synced to GitHub Gist: ${secrets.gistId} at ${secrets.lastSyncTime}`);
    return { success: true, syncTime: secrets.lastSyncTime, gistUrl: secrets.gistUrl, rawUrl: secrets.rawUrl };
  } catch (err) {
    secrets.lastSyncStatus = 'error';
    secrets.lastSyncError = err.message;
    saveSecrets(secrets);
    console.error(`[CloudSync] Network error syncing to GitHub:`, err.message);
    return { success: false, error: err.message };
  }
}

let heartbeatTimer = null;
let isSyncInProgress = false;

/**
 * Starts continuous background heartbeat loop
 */
function startHeartbeatLoop(getTelemetryCallback) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  const secrets = loadSecrets();
  const intervalMs = (secrets.syncIntervalSec || 30) * 1000;

  console.log(`[CloudSync] Initializing background heartbeat loop (${secrets.syncIntervalSec || 30}s interval)...`);

  const runSync = async () => {
    const currentSecrets = loadSecrets();
    if (!currentSecrets.githubToken || !currentSecrets.gistId || currentSecrets.autoSync === false) {
      return;
    }

    if (isSyncInProgress) return;
    isSyncInProgress = true;

    try {
      const telemetry = await getTelemetryCallback();
      if (telemetry) {
        await pushTelemetryToGitHub(telemetry);
      }
    } catch (e) {
      console.error('[CloudSync] Error in heartbeat iteration:', e.message);
    } finally {
      isSyncInProgress = false;
    }
  };

  // Run initial sync after a short 5-second initial delay
  setTimeout(runSync, 5000);

  // Set recurring interval
  heartbeatTimer = setInterval(runSync, intervalMs);
}

/**
 * Immediate high-priority emergency push (triggered on thermal trip or shutdown notice)
 */
async function triggerEmergencySync(telemetryData) {
  console.log('[CloudSync] 🚨 EMERGENCY SYNC TRIGGERED! Pushing pre-death telemetry snapshot...');
  return await pushTelemetryToGitHub(telemetryData);
}

module.exports = {
  loadSecrets,
  saveSecrets,
  getCloudStatus,
  setupCloudVault,
  pushTelemetryToGitHub,
  startHeartbeatLoop,
  triggerEmergencySync
};
