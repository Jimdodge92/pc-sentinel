const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { analyzeDiagnostics } = require('./diagnostics/incidentEngine');
const {
  getOrInitDevice,
  regenerateDeviceCode,
  setFirebaseConfig,
  pushToFirebase,
  startFirebaseHeartbeat,
  triggerEmergencyPush
} = require('./devicePairing');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());

// Configuration path & helpers
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading config:', e.message);
  }
  return { pin: '', allowLocalBypass: true };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving config:', e.message);
    return false;
  }
}

/**
 * Get primary local LAN IPv4 address (e.g. 192.168.4.39)
 */
function getLocalIp() {
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
 * Cache for public IP
 */
let cachedPublicIp = null;
let lastPublicIpCheck = 0;

async function getPublicIp() {
  const now = Date.now();
  if (cachedPublicIp && (now - lastPublicIpCheck < 300000)) { // 5 min cache
    return cachedPublicIp;
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      cachedPublicIp = data.ip;
      lastPublicIpCheck = now;
      return cachedPublicIp;
    }
  } catch (e) {
    // Return cached or null
  }
  return cachedPublicIp || null;
}

/**
 * Check if request originates from localhost
 */
function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
}

/**
 * Security PIN verification middleware for remote/off-network requests
 */
function requirePinIfRemote(req, res, next) {
  const config = loadConfig();
  if (!config.pin) return next(); // No PIN configured

  if (config.allowLocalBypass && isLocalRequest(req)) {
    return next(); // Localhost on same PC is exempt
  }

  const clientPin = req.headers['x-sentinel-pin'] || req.query.pin;
  if (clientPin && clientPin.trim() === config.pin.trim()) {
    return next();
  }

  return res.status(401).json({ error: 'PIN_REQUIRED', message: 'Valid security PIN required for off-network remote access.' });
}

// Path to powershell scripts
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

/**
 * Execute a PowerShell script safely with ExecutionPolicy Bypass
 */
function runPowerShellScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const cmdArgs = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...args
    ];

    execFile('powershell.exe', cmdArgs, {
      maxBuffer: 1024 * 1024 * 16, // 16MB buffer for event logs
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error running script ${scriptName}:`, error.message);
        // If there's partial stdout, attempt parsing, otherwise return empty
        if (!stdout || stdout.trim() === '') {
          return resolve(null);
        }
      }

      try {
        const trimmed = stdout.trim();
        if (!trimmed) return resolve(null);
        const parsed = JSON.parse(trimmed);
        resolve(parsed);
      } catch (parseError) {
        console.warn(`Warning: Failed to parse JSON from ${scriptName}.`);
        resolve(null);
      }
    });
  });
}

// Simple in-memory cache to prevent spamming PowerShell
let cachedDiagnostics = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15000; // 15 seconds

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'pc-sentinel-server', time: new Date().toISOString() });
});

/**
 * Network configuration and remote access info
 */
app.get('/api/network-info', async (req, res) => {
  try {
    const config = loadConfig();
    const localIp = getLocalIp();
    const publicIp = await getPublicIp();
    const isLocal = isLocalRequest(req);

    res.json({
      localIp,
      publicIp,
      port: PORT,
      hasPin: !!(config.pin && config.pin.trim().length > 0),
      allowLocalBypass: config.allowLocalBypass !== false,
      isLocalRequest: isLocal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Verify Security PIN
 */
app.post('/api/auth/verify', (req, res) => {
  const { pin } = req.body || {};
  const config = loadConfig();

  if (!config.pin || config.pin.trim().length === 0) {
    return res.json({ success: true, message: 'No PIN configured' });
  }

  if (pin && pin.trim() === config.pin.trim()) {
    return res.json({ success: true, message: 'PIN authenticated' });
  }

  return res.status(401).json({ success: false, error: 'INVALID_PIN', message: 'Incorrect PIN provided.' });
});

/**
 * Update Security PIN and settings
 */
app.post('/api/auth/set-pin', (req, res) => {
  const { currentPin, newPin, allowLocalBypass } = req.body || {};
  const config = loadConfig();
  const isLocal = isLocalRequest(req);

  // If a PIN is currently active and request is not local, require current PIN
  if (config.pin && !isLocal) {
    if (!currentPin || currentPin.trim() !== config.pin.trim()) {
      return res.status(403).json({ error: 'Current PIN required to change settings remotely.' });
    }
  }

  if (typeof newPin === 'string') {
    config.pin = newPin.trim();
  }
  if (typeof allowLocalBypass === 'boolean') {
    config.allowLocalBypass = allowLocalBypass;
  }

  const saved = saveConfig(config);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save configuration.' });
  }

  res.json({
    success: true,
    hasPin: !!(config.pin && config.pin.trim().length > 0),
    allowLocalBypass: config.allowLocalBypass
  });
});

/**
 * System hardware summary (CPU, RAM, OS, Uptime)
 */
app.get('/api/system-summary', requirePinIfRemote, async (req, res) => {
  try {
    const summary = await runPowerShellScript('get-system-summary.ps1');
    res.json(summary || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Device and GPU status (including Problem Codes 43, 45, etc.)
 */
app.get('/api/device-status', requirePinIfRemote, async (req, res) => {
  try {
    const status = await runPowerShellScript('get-device-status.ps1');
    res.json(status || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Storage health and SMART metrics
 */
app.get('/api/storage-health', requirePinIfRemote, async (req, res) => {
  try {
    const storage = await runPowerShellScript('get-storage-reliability.ps1');
    res.json(storage || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Core Diagnostic Collector
 * Collects events, hardware, and storage, runs the diagnostic engine, and returns complete analysis.
 */
async function getDiagnosticSnapshot(days = 14) {
  const [events, deviceStatus, storageData, systemSummary] = await Promise.all([
    runPowerShellScript('get-system-events.ps1', ['-Days', days.toString(), '-MaxEvents', '100']),
    runPowerShellScript('get-device-status.ps1'),
    runPowerShellScript('get-storage-reliability.ps1'),
    runPowerShellScript('get-system-summary.ps1')
  ]);

  const diagnosis = analyzeDiagnostics(
    events || [],
    deviceStatus || {},
    storageData || {},
    systemSummary || {}
  );

  return {
    scanTime: new Date().toISOString(),
    ...diagnosis
  };
}

/**
 * Full Diagnostics Endpoint
 */
app.get('/api/diagnostics', requirePinIfRemote, async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const days = parseInt(req.query.days, 10) || 14;

  const now = Date.now();
  if (!forceRefresh && cachedDiagnostics && (now - lastCacheTime < CACHE_TTL_MS)) {
    return res.json(cachedDiagnostics);
  }

  try {
    console.log(`[PC Sentinel] Running diagnostic scan (Days: ${days})...`);
    cachedDiagnostics = await getDiagnosticSnapshot(days);
    lastCacheTime = now;

    console.log(`[PC Sentinel] Scan complete. Found ${cachedDiagnostics.incidents.length} incident(s). Status: ${cachedDiagnostics.overallHealth.status}`);

    // If a critical thermal or emergency shutdown incident is active, trigger immediate emergency push
    const hasEmergency = (cachedDiagnostics.incidents || []).some(
      inc => inc.category === 'thermal' && inc.severity === 'critical'
    );
    if (hasEmergency) {
      triggerEmergencyPush(cachedDiagnostics).catch(e => console.error('[FirebaseRelay] Emergency push error:', e.message));
    }

    res.json(cachedDiagnostics);
  } catch (err) {
    console.error('[PC Sentinel] Diagnostics error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Device Pairing & Identity info
 */
app.get('/api/device/info', (req, res) => {
  const device = getOrInitDevice();
  const localIp = getLocalIp();
  res.json({
    ...device,
    localIp,
    port: PORT,
    pairingUrl: `http://${localIp}:${PORT}?pair=${device.deviceId}`
  });
});

/**
 * Regenerate Device Pairing Code
 */
app.post('/api/device/regenerate-code', requirePinIfRemote, (req, res) => {
  const newCode = regenerateDeviceCode();
  const device = getOrInitDevice();
  const localIp = getLocalIp();
  res.json({
    ...device,
    deviceId: newCode,
    pairingUrl: `http://${localIp}:${PORT}?pair=${newCode}`
  });
});

/**
 * Save Firebase Configuration
 */
app.post('/api/device/firebase-config', requirePinIfRemote, async (req, res) => {
  const { projectId, apiKey, appId } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: 'Firebase Project ID is required.' });
  }

  setFirebaseConfig({ projectId, apiKey, appId });

  // Immediately push telemetry to test connection
  getDiagnosticSnapshot().then(snapshot => {
    pushToFirebase(snapshot);
  }).catch(e => console.error('[FirebaseRelay] Push error:', e.message));

  res.json({ success: true, isCloudActive: true, projectId });
});

/**
 * Manually force sync to Firebase Cloud
 */
app.post('/api/device/sync-now', requirePinIfRemote, async (req, res) => {
  try {
    const snapshot = cachedDiagnostics || await getDiagnosticSnapshot();
    const result = await pushToFirebase(snapshot);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve compiled React frontend directly
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback all non-API routes to index.html for React SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Start Express Server (Dual-stack IPv4/IPv6)
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` PC Sentinel Autonomous Server Active`);
  console.log(` Local Dashboard: http://localhost:${PORT}`);
  console.log(`=================================================`);

  // Start Background Firebase Cloud Heartbeat
  startFirebaseHeartbeat(async () => {
    try {
      return cachedDiagnostics || await getDiagnosticSnapshot(7);
    } catch (e) {
      console.error('[FirebaseRelay] Heartbeat collection error:', e.message);
      return null;
    }
  });
});
