const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
    cfg.deviceName = os.hostname() || 'Jims-ThinkPad';
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

let syncTimer = null;
let isSyncing = false;

/**
 * Start background heartbeat push
 */
function startFirebaseHeartbeat(getTelemetryCallback) {
  if (syncTimer) clearInterval(syncTimer);

  const run = async () => {
    const cfg = loadConfig();
    if (!cfg.firebaseConfig || !cfg.firebaseConfig.projectId) return;

    if (isSyncing) return;
    isSyncing = true;
    try {
      const telemetry = await getTelemetryCallback();
      if (telemetry) {
        await pushToFirebase(telemetry);
      }
    } catch (e) {
      console.error('[FirebaseRelay] Error in sync loop:', e.message);
    } finally {
      isSyncing = false;
    }
  };

  setTimeout(run, 3000);
  syncTimer = setInterval(run, 30000); // Push every 30 seconds
}

/**
 * Pre-death emergency push (called immediately when Event 86/1074 occurs)
 */
async function triggerEmergencyPush(telemetryData) {
  console.log('[FirebaseRelay] 🚨 TRIGGERING PRE-DEATH EMERGENCY SNAPSHOT TO CLOUD...');
  return await pushToFirebase(telemetryData);
}

module.exports = {
  getOrInitDevice,
  regenerateDeviceCode,
  setFirebaseConfig,
  pushToFirebase,
  startFirebaseHeartbeat,
  triggerEmergencyPush
};
