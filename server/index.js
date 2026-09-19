const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');
const { analyzeDiagnostics } = require('./diagnostics/incidentEngine');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());

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
 * System hardware summary (CPU, RAM, OS, Uptime)
 */
app.get('/api/system-summary', async (req, res) => {
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
app.get('/api/device-status', async (req, res) => {
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
app.get('/api/storage-health', async (req, res) => {
  try {
    const storage = await runPowerShellScript('get-storage-reliability.ps1');
    res.json(storage || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Full Diagnostics Endpoint
 * Collects events, hardware, and storage, runs the diagnostic engine, and returns plain-English results.
 */
app.get('/api/diagnostics', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const days = parseInt(req.query.days, 10) || 14;

  const now = Date.now();
  if (!forceRefresh && cachedDiagnostics && (now - lastCacheTime < CACHE_TTL_MS)) {
    return res.json(cachedDiagnostics);
  }

  try {
    console.log(`[PC Sentinel] Running diagnostic scan (Days: ${days})...`);

    // Run parallel data collection
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

    cachedDiagnostics = {
      scanTime: new Date().toISOString(),
      ...diagnosis
    };
    lastCacheTime = now;

    console.log(`[PC Sentinel] Scan complete. Found ${diagnosis.incidents.length} incident(s). Status: ${diagnosis.overallHealth.status}`);
    res.json(cachedDiagnostics);
  } catch (err) {
    console.error('[PC Sentinel] Diagnostics error:', err);
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
});
