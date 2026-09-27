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

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sentinel-pin, Access-Control-Request-Private-Network, Cache-Control, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-sentinel-pin', 'Cache-Control', 'Accept', 'Access-Control-Request-Private-Network'],
  exposedHeaders: ['Content-Type', 'Content-Disposition']
}));
app.options('*', cors());
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

// Persistent resolved incidents storage
const RESOLVED_FILE = path.join(__dirname, 'resolvedIncidents.json');

function loadResolvedIncidents() {
  try {
    if (fs.existsSync(RESOLVED_FILE)) {
      return JSON.parse(fs.readFileSync(RESOLVED_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading resolved incidents:', e.message);
  }
  return [];
}

function saveResolvedIncidents(list) {
  try {
    fs.writeFileSync(RESOLVED_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving resolved incidents:', e.message);
    return false;
  }
}

// Persistent storage for last shutdown intent
const SHUTDOWN_INTENT_FILE = path.join(__dirname, 'lastShutdownIntent.json');

function saveLastShutdownIntent(intent) {
  try {
    fs.writeFileSync(SHUTDOWN_INTENT_FILE, JSON.stringify(intent, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving last shutdown intent:', e.message);
  }
}

function loadLastShutdownIntent() {
  try {
    if (fs.existsSync(SHUTDOWN_INTENT_FILE)) {
      return JSON.parse(fs.readFileSync(SHUTDOWN_INTENT_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading last shutdown intent:', e.message);
  }
  return null;
}

// Active Server-Sent Events (SSE) subscribers
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
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
 * Real-time Server-Sent Events (SSE) stream for live heartbeats and instant shutdown alerts
 */
app.get('/api/stream', requirePinIfRemote, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sentinel-pin',
    'X-Accel-Buffering': 'no'
  });

  const device = getOrInitDevice();
  res.write(`event: connected\ndata: ${JSON.stringify({
    status: 'connected',
    time: new Date().toISOString(),
    deviceId: device.deviceId,
    deviceName: device.deviceName
  })}\n\n`);

  // If an active shutdown intent was recently logged (within 3 minutes), push it immediately
  const lastIntent = loadLastShutdownIntent();
  if (lastIntent && lastIntent.timestamp && (Date.now() - new Date(lastIntent.timestamp).getTime() < 180000)) {
    res.write(`event: shutdown_intent\ndata: ${JSON.stringify(lastIntent)}\n\n`);
  }

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/**
 * Endpoint to check current/latest shutdown intent
 */
app.get('/api/shutdown-intent', requirePinIfRemote, (req, res) => {
  res.json(loadLastShutdownIntent() || { state: 'normal' });
});

/**
 * Immediate internal shutdown broadcast endpoint (triggered by Windows Event / Task Scheduler)
 */
app.all('/api/internal/broadcast-shutdown', async (req, res) => {
  try {
    const intent = await runPowerShellScript('check-shutdown-intent.ps1', ['-WindowSeconds', '60']);
    const finalIntent = (intent && intent.state) ? intent : {
      state: 'rebooting',
      title: '🔄 User-Initiated Restart in Progress',
      message: 'Windows is currently restarting. Connection will restore momentarily as system reboots.',
      willRestore: true,
      timestamp: new Date().toISOString()
    };
    saveLastShutdownIntent(finalIntent);
    console.log(`[ShutdownSentinel] 🚨 INSTANT TRIGGER BROADCAST: ${finalIntent.title}`);
    broadcastSSE('shutdown_intent', finalIntent);
    res.json({ success: true, intent: finalIntent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pc-sentinel-server',
    time: new Date().toISOString(),
    uptime: os.uptime()
  });
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
    runPowerShellScript('get-system-events.ps1', ['-Days', days.toString(), '-MaxEvents', '300']),
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

  // Filter out any resolved incidents
  const resolvedList = loadResolvedIncidents();
  const resolvedIds = new Set(resolvedList.map(r => r.incidentId));
  const activeIncidents = (diagnosis.incidents || []).filter(inc => !resolvedIds.has(inc.id));

  // Re-evaluate overall health for remaining active incidents
  const hasCritical = activeIncidents.some(i => i.severity === 'critical');
  const hasWarning = activeIncidents.some(i => i.severity === 'warning');

  let overallHealth = {
    status: 'healthy',
    label: 'All Systems Normal',
    color: 'emerald',
    summary: 'No critical crashes, unexpected power cuts, or hardware disconnects detected.'
  };

  if (hasCritical) {
    overallHealth = {
      status: 'critical',
      label: 'Action Needed',
      color: 'rose',
      summary: 'Critical events detected (unexpected shutdown, BSOD, or hardware fault). Review diagnostic actions below.'
    };
  } else if (hasWarning) {
    overallHealth = {
      status: 'warning',
      label: 'Minor Warnings Detected',
      color: 'amber',
      summary: 'System is running, but warnings were detected (driver recoveries, throttling, or high wear).'
    };
  }

  return {
    scanTime: new Date().toISOString(),
    ...diagnosis,
    incidents: activeIncidents,
    overallHealth
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
 * Top Memory-Consuming Processes Endpoint
 */
app.get('/api/system/top-memory', requirePinIfRemote, async (req, res) => {
  try {
    const top = parseInt(req.query.top, 10) || 5;
    const memData = await runPowerShellScript('get-top-memory-processes.ps1', ['-Top', top.toString()]);
    res.json(memData || { topProcesses: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mark Incident as Resolved (clears permanently from active log and surviving rescans)
 * Automatically clears all identical events matching the same title/provider/eventId
 */
app.post('/api/incidents/resolve', requirePinIfRemote, (req, res) => {
  const { incidentId, stepTitle, resolutionNote, category, matchingIds, clearIdentical = true } = req.body || {};
  if (!incidentId) {
    return res.status(400).json({ error: 'incidentId is required' });
  }

  const resolved = loadResolvedIncidents();
  const existingSet = new Set(resolved.map(r => r.incidentId));
  const now = new Date().toISOString();

  // Find target incident from cache
  const targetIncident = cachedDiagnostics?.incidents?.find(i => i.id === incidentId);

  // Collect all IDs to resolve
  const idsToResolve = [incidentId];

  // If frontend passed matchingIds array, include them
  if (Array.isArray(matchingIds)) {
    for (const mId of matchingIds) {
      if (!idsToResolve.includes(mId)) idsToResolve.push(mId);
    }
  }

  // Also inspect cachedDiagnostics for any other identical events
  if (clearIdentical && targetIncident && Array.isArray(cachedDiagnostics?.incidents)) {
    const isTargetPnPOrEvent = targetIncident.technicalDetails?.eventId && targetIncident.technicalDetails?.provider;
    for (const other of cachedDiagnostics.incidents) {
      if (idsToResolve.includes(other.id)) continue;

      const isIdentical =
        (isTargetPnPOrEvent &&
         other.technicalDetails?.eventId === targetIncident.technicalDetails.eventId &&
         other.technicalDetails?.provider === targetIncident.technicalDetails.provider &&
         other.title === targetIncident.title) ||
        (!isTargetPnPOrEvent && other.title && other.title === targetIncident.title && other.category === targetIncident.category);

      if (isIdentical) {
        idsToResolve.push(other.id);
      }
    }
  }

  for (const id of idsToResolve) {
    if (!existingSet.has(id)) {
      resolved.push({
        incidentId: id,
        stepTitle: stepTitle || 'User confirmed fix step resolved issue',
        resolutionNote: resolutionNote || (idsToResolve.length > 1 ? `Resolved along with identical event ${incidentId}` : 'Marked as resolved in PC Sentinel'),
        category: category || targetIncident?.category || 'general',
        title: targetIncident?.title,
        resolvedAt: now
      });
      existingSet.add(id);
    }
  }
  saveResolvedIncidents(resolved);

  // Invalidate cache and update cached diagnostics immediately
  if (cachedDiagnostics && Array.isArray(cachedDiagnostics.incidents)) {
    cachedDiagnostics.incidents = cachedDiagnostics.incidents.filter(i => !existingSet.has(i.id));
    const hasCritical = cachedDiagnostics.incidents.some(i => i.severity === 'critical');
    const hasWarning = cachedDiagnostics.incidents.some(i => i.severity === 'warning');

    cachedDiagnostics.overallHealth = hasCritical ? {
      status: 'critical',
      label: 'Action Needed',
      color: 'rose',
      summary: 'Critical events detected (unexpected shutdown, BSOD, or hardware fault). Review diagnostic actions below.'
    } : hasWarning ? {
      status: 'warning',
      label: 'Minor Warnings Detected',
      color: 'amber',
      summary: 'System is running, but warnings were detected (driver recoveries, throttling, or high wear).'
    } : {
      status: 'healthy',
      label: 'All Systems Normal',
      color: 'emerald',
      summary: 'No critical crashes, unexpected power cuts, or hardware disconnects detected.'
    };
  }

  res.json({
    success: true,
    message: idsToResolve.length > 1
      ? `Incident and ${idsToResolve.length - 1} identical events marked as resolved and permanently cleared.`
      : 'Incident marked as resolved and permanently cleared from active logs.',
    resolvedId: incidentId,
    resolvedIds: idsToResolve,
    clearedCount: idsToResolve.length,
    activeIncidentsCount: cachedDiagnostics ? cachedDiagnostics.incidents.length : undefined,
    overallHealth: cachedDiagnostics ? cachedDiagnostics.overallHealth : undefined
  });
});

/**
 * List Resolved Incidents
 */
app.get('/api/incidents/resolved', requirePinIfRemote, (req, res) => {
  const resolved = loadResolvedIncidents();
  res.json(resolved);
});

/**
 * Unresolve Incident (Restore to active diagnostics)
 */
app.post('/api/incidents/unresolve', requirePinIfRemote, (req, res) => {
  const { incidentId } = req.body || {};
  let resolved = loadResolvedIncidents();
  resolved = resolved.filter(r => r.incidentId !== incidentId);
  saveResolvedIncidents(resolved);
  lastCacheTime = 0; // invalidate cache
  res.json({ success: true, message: 'Incident restored to active log' });
});

/**
 * Clear All Informational Logs
 */
app.post('/api/incidents/clear-all-info', requirePinIfRemote, async (req, res) => {
  if (!cachedDiagnostics) {
    try {
      cachedDiagnostics = await getDiagnosticSnapshot(14);
      lastCacheTime = Date.now();
    } catch (e) {
      console.warn('Failed to load snapshot for clear-all-info:', e.message);
    }
  }

  const currentIncidents = cachedDiagnostics?.incidents || [];
  const infoIncidents = currentIncidents.filter(i => i.severity === 'info');
  const infoIds = infoIncidents.map(i => i.id);

  if (infoIds.length === 0) {
    return res.json({ success: true, clearedCount: 0, message: 'No informational logs to clear' });
  }

  const resolved = loadResolvedIncidents();
  const existingSet = new Set(resolved.map(r => r.incidentId));
  const now = new Date().toISOString();

  for (const id of infoIds) {
    if (!existingSet.has(id)) {
      resolved.push({
        incidentId: id,
        stepTitle: 'Cleared all info logs',
        resolutionNote: 'Batch cleared info logs in PC Sentinel',
        category: 'info',
        resolvedAt: now
      });
      existingSet.add(id);
    }
  }
  saveResolvedIncidents(resolved);

  if (cachedDiagnostics && Array.isArray(cachedDiagnostics.incidents)) {
    cachedDiagnostics.incidents = cachedDiagnostics.incidents.filter(i => !existingSet.has(i.id));
  }

  res.json({
    success: true,
    message: `Cleared ${infoIds.length} informational logs`,
    clearedCount: infoIds.length,
    clearedIds: infoIds,
    remainingCount: cachedDiagnostics ? cachedDiagnostics.incidents.length : 0
  });
});

/**
 * Batch Resolve / Clear Incidents
 */
app.post('/api/incidents/resolve-batch', requirePinIfRemote, (req, res) => {
  const { incidentIds, reason } = req.body || {};
  if (!Array.isArray(incidentIds) || incidentIds.length === 0) {
    return res.status(400).json({ error: 'incidentIds array is required' });
  }

  const resolved = loadResolvedIncidents();
  const existingSet = new Set(resolved.map(r => r.incidentId));
  const now = new Date().toISOString();

  for (const id of incidentIds) {
    if (!existingSet.has(id)) {
      resolved.push({
        incidentId: id,
        stepTitle: reason || 'Cleared by user',
        resolutionNote: 'Batch cleared in PC Sentinel',
        category: 'general',
        resolvedAt: now
      });
      existingSet.add(id);
    }
  }
  saveResolvedIncidents(resolved);

  if (cachedDiagnostics && Array.isArray(cachedDiagnostics.incidents)) {
    cachedDiagnostics.incidents = cachedDiagnostics.incidents.filter(i => !existingSet.has(i.id));
  }

  res.json({
    success: true,
    clearedCount: incidentIds.length,
    clearedIds: incidentIds
  });
});

/**
/**
 * Direct Android APK Download Route
 */
app.get(['/download/pc-sentinel.apk', '/downloads/pc-sentinel.apk', '/api/download/apk'], (req, res) => {
  const apkPath = path.join(__dirname, 'public/pc-sentinel.apk');
  if (fs.existsSync(apkPath)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="pc-sentinel.apk"');
    return res.sendFile(apkPath);
  }
  res.status(404).send('PC Sentinel Android APK is currently being compiled. Please try again shortly.');
});

/**
 * Device Pairing & Identity info
 */
app.get('/api/device/info', (req, res) => {
  const device = getOrInitDevice();
  const localIp = getLocalIp();
  const reqHost = req.headers.host || `${localIp}:${PORT}`;
  const protocol = req.protocol || 'http';
  const apkPath = path.join(__dirname, 'public/pc-sentinel.apk');
  const apkExists = fs.existsSync(apkPath);
  const apkSizeMB = apkExists ? (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(1) : null;

  res.json({
    ...device,
    localIp,
    port: PORT,
    pairingUrl: `${protocol}://${reqHost}?pair=${device.deviceId}`,
    apkDownloadUrl: `${protocol}://${reqHost}/download/pc-sentinel.apk`,
    apkExists,
    apkSizeMB
  });
});

/**
 * Regenerate Device Pairing Code
 */
app.post('/api/device/regenerate-code', requirePinIfRemote, (req, res) => {
  const newCode = regenerateDeviceCode();
  const device = getOrInitDevice();
  const localIp = getLocalIp();
  const reqHost = req.headers.host || `${localIp}:${PORT}`;
  const protocol = req.protocol || 'http';
  const apkPath = path.join(__dirname, 'public/pc-sentinel.apk');
  const apkExists = fs.existsSync(apkPath);
  const apkSizeMB = apkExists ? (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(1) : null;

  res.json({
    ...device,
    deviceId: newCode,
    pairingUrl: `${protocol}://${reqHost}?pair=${newCode}`,
    apkDownloadUrl: `${protocol}://${reqHost}/download/pc-sentinel.apk`,
    apkExists,
    apkSizeMB
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

  // Start Heartbeat interval for active SSE clients (every 5 seconds)
  setInterval(() => {
    if (sseClients.size > 0) {
      broadcastSSE('heartbeat', {
        time: new Date().toISOString(),
        uptime: os.uptime(),
        activeClients: sseClients.size
      });
    }
  }, 5000);

  // Background Shutdown Sentinel: Check for impending Windows shutdown/restart every 2.5 seconds
  let lastBroadcastedTimestamp = null;
  setInterval(async () => {
    try {
      const intent = await runPowerShellScript('check-shutdown-intent.ps1', ['-WindowSeconds', '45']);
      if (intent && intent.state && intent.timestamp !== lastBroadcastedTimestamp) {
        lastBroadcastedTimestamp = intent.timestamp;
        saveLastShutdownIntent(intent);
        console.log(`[ShutdownSentinel] 🚨 DETECTED IMPENDING SHUTDOWN: ${intent.title}`);
        broadcastSSE('shutdown_intent', intent);
      }
    } catch (e) {
      // Non-blocking
    }
  }, 2500);

  // Process Exit Handlers (Windows Shutdown / Service Stop Signals)
  function handleExitSignal(signal) {
    console.log(`[ShutdownSentinel] ⚠️ Intercepted OS signal: ${signal}`);
    const intent = {
      state: 'rebooting',
      title: '🔄 System Shutdown Signal Received',
      message: 'Windows has instructed services to stop. System is entering shutdown or reboot.',
      willRestore: true,
      timestamp: new Date().toISOString()
    };
    saveLastShutdownIntent(intent);
    broadcastSSE('shutdown_intent', intent);

    // Give 600ms grace period so packets are flushed through the network card
    setTimeout(() => {
      process.exit(0);
    }, 600);
  }

  process.on('SIGINT', () => handleExitSignal('SIGINT'));
  process.on('SIGTERM', () => handleExitSignal('SIGTERM'));
  process.on('SIGBREAK', () => handleExitSignal('SIGBREAK'));

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

