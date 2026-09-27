const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[DevicePairing] Error loading config:', e.message);
  }
  return { pin: '', allowLocalBypass: true };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[DevicePairing] Error saving config:', e.message);
    return false;
  }
}

/**
 * Generate a random 4-digit pairing suffix (e.g. SENT-4912)
 */
function generatePairingCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SENT-${num}`;
}

/**
 * Ensure device has a persistent Device ID and Device Name
 */
function getOrInitDevice() {
  const cfg = loadConfig();
  let changed = false;

  if (!cfg.deviceId) {
    cfg.deviceId = generatePairingCode();
    changed = true;
  }

  if (!cfg.deviceName) {
    cfg.deviceName = os.hostname() || 'PC-Sentinel-Host';
    changed = true;
  }

  if (changed) {
    saveConfig(cfg);
  }

  return {
    deviceId: cfg.deviceId,
    deviceName: cfg.deviceName,
    firebaseConfig: cfg.firebaseConfig || null,
    lastSyncTime: cfg.lastSyncTime || null,
    isCloudActive: !!(cfg.firebaseConfig && cfg.firebaseConfig.projectId)
  };
}

/**
 * Regenerate pairing code
 */
function regenerateDeviceCode() {
  const cfg = loadConfig();
  cfg.deviceId = generatePairingCode();
  saveConfig(cfg);
  return cfg.deviceId;
}

/**
 * Update Firebase configuration
 */
function setFirebaseConfig(fbConfig) {
  const cfg = loadConfig();
  cfg.firebaseConfig = fbConfig;
  saveConfig(cfg);
  return true;
}

/**
 * Push telemetry payload to Firebase Firestore via standard Google REST API
 * (Works without any npm dependencies or complex SDKs)
 */
async function pushToFirebase(telemetryData) {
  const cfg = loadConfig();
  if (!cfg.firebaseConfig || !cfg.firebaseConfig.projectId) {
    return { skipped: true, reason: 'Firebase not configured' };
  }

  const projectId = cfg.firebaseConfig.projectId;
  const apiKey = cfg.firebaseConfig.apiKey || '';
  const deviceId = cfg.deviceId;

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices/${deviceId}?key=${apiKey}`;

  // Format into Firestore document fields
  const fields = {
    deviceId: { stringValue: deviceId },
    deviceName: { stringValue: cfg.deviceName || 'Jims-ThinkPad' },
    lastHeartbeat: { timestampValue: new Date().toISOString() },
    isOnline: { booleanValue: true },
    overallHealth: {
      mapValue: {
        fields: {
          status: { stringValue: telemetryData.overallHealth?.status || 'healthy' },
          label: { stringValue: telemetryData.overallHealth?.label || 'All Systems Healthy' }
        }
      }
    },
    // Store full diagnostic snapshot as JSON string for complete UI rendering
    telemetryJson: {
      stringValue: JSON.stringify(telemetryData)
    },
    updatedAt: { timestampValue: new Date().toISOString() }
  };

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[FirebaseRelay] Firestore update warning (HTTP ${res.status}):`, errText);
      return { success: false, error: errText };
    }

    cfg.lastSyncTime = new Date().toISOString();
    saveConfig(cfg);
    console.log(`[FirebaseRelay] Telemetry pushed to Firestore for device ${deviceId}`);
    return { success: true, syncTime: cfg.lastSyncTime };
  } catch (err) {
    console.error('[FirebaseRelay] Network error pushing to Firestore:', err.message);
    return { success: false, error: err.message };
  }
}

function getLocalIpAddress() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254')) {
          return net.address;
        }
        fallback = net.address;
      }
    }
  }
  return fallback;
}

/**
 * Universal Zero-Config Cloud Relay:
 * Publishes pairing announcement to ntfy.sh/pcsentinel-pair-${shortCode}
 * and full diagnostics snapshot to ntfy.sh/pcsentinel-telemetry-${deviceId}
 */
async function publishToCloudRelay(telemetryData) {
  const cfg = loadConfig();
  if (!cfg.deviceId) return;
  const shortCode = cfg.deviceId.replace(/^SENT-/, '');
  const localIp = getLocalIpAddress();

  const pairingRecord = {
    deviceId: cfg.deviceId,
    deviceName: cfg.deviceName || os.hostname() || 'PC-Sentinel-Host',
    shortCode: shortCode,
    lanUrl: `http://${localIp}:3500`,
    lanIps: [localIp],
    relayTopic: `pcsentinel-telemetry-${cfg.deviceId}`,
    status: telemetryData?.overallHealth?.status || 'healthy',
    lastSeen: new Date().toISOString()
  };

  // 1. Announce pairing info to global rendezvous topic
  try {
    const postData = JSON.stringify(pairingRecord);
    const req = https.request(`https://ntfy.sh/pcsentinel-pair-${shortCode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Title': `PC Sentinel - ${pairingRecord.deviceName}`
      },
      timeout: 5000
    }, (res) => {
      res.resume();
    });
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (e) {}

  // 2. Publish Full Diagnostics Snapshot to Device Cloud Vault
  if (telemetryData) {
    try {
      const snapJson = JSON.stringify(telemetryData);
      const req = https.request(`https://ntfy.sh/pcsentinel-telemetry-${cfg.deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Filename': 'diagnostics.json',
          'Title': `${pairingRecord.deviceName} Diagnostic Snapshot`
        },
        timeout: 8000
      }, (res) => {
        res.resume();
      });
      req.on('error', () => {});
      req.write(snapJson);
      req.end();
    } catch (e) {}
  }

  // 3. Also push to Firebase if configured
  if (cfg.firebaseConfig && cfg.firebaseConfig.projectId) {
    try {
      await pushToFirebase(telemetryData);
    } catch (e) {}
  }
}

let syncTimer = null;
let isSyncing = false;

/**
 * Start background heartbeat push
 */
function startFirebaseHeartbeat(getTelemetryCallback) {
  if (syncTimer) clearInterval(syncTimer);

  const run = async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const telemetry = await getTelemetryCallback();
      if (telemetry) {
        await publishToCloudRelay(telemetry);
      }
    } catch (e) {
      console.warn('[CloudRelay] Error in heartbeat sync loop:', e.message);
    } finally {
      isSyncing = false;
    }
  };

  setTimeout(run, 1500); // Quick initial heartbeat after boot
  syncTimer = setInterval(run, 30000); // Push every 30 seconds
}

/**
 * Pre-death emergency push (called immediately when Event 86/1074 occurs)
 */
async function triggerEmergencyPush(telemetryData) {
  console.log('[CloudRelay] 🚨 TRIGGERING PRE-DEATH EMERGENCY SNAPSHOT TO CLOUD RELAY...');
  return await publishToCloudRelay(telemetryData);
}

module.exports = {
  getOrInitDevice,
  regenerateDeviceCode,
  setFirebaseConfig,
  pushToFirebase,
  publishToCloudRelay,
  startFirebaseHeartbeat,
  triggerEmergencyPush
};
