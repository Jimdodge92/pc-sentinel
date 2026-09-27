import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, QrCode, Smartphone, Laptop, Radio, Check,
  AlertCircle, RefreshCw, ArrowRight, ShieldCheck, Activity,
  Trash2, X
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { universalFetch } from '../App';

export default function OnboardingPairing({ onDeviceAdded, isNativeApp }) {
  const [pinCode, setPinCode] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Camera QR Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const qrScannerRef = useRef(null);

  // Nearby Discovery State (on-demand only, never blocks UI on launch)
  const [discoveredPCs, setDiscoveredPCs] = useState([]);
  const [isScanningNetwork, setIsScanningNetwork] = useState(false);

  // On-demand network probe for nearby PCs on Wi-Fi (parallel, non-blocking)
  const probeNetwork = async () => {
    if (isScanningNetwork) return;
    setIsScanningNetwork(true);
    try {
      let phoneIp = '';
      if (typeof window !== 'undefined' && window.AndroidBridge?.getDeviceWifiIp) {
        phoneIp = window.AndroidBridge.getDeviceWifiIp();
      }

      const subnets = [];
      if (phoneIp && phoneIp.includes('.')) {
        const parts = phoneIp.split('.');
        subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
      if (!subnets.includes('192.168.4')) subnets.push('192.168.4');
      if (!subnets.includes('192.168.1')) subnets.push('192.168.1');

      const found = [];
      const candidateIps = [];
      for (const subnet of subnets) {
        candidateIps.push(
          `${subnet}.1`, `${subnet}.39`, `${subnet}.50`, `${subnet}.100`,
          `${subnet}.101`, `${subnet}.105`, `${subnet}.110`, `${subnet}.120`,
          `${subnet}.150`, `${subnet}.200`
        );
      }

      await Promise.allSettled(
        candidateIps.map(async (ip) => {
          try {
            const res = await universalFetch(`http://${ip}:3500/api/device/info`, {
              signal: AbortSignal.timeout(1500)
            });
            if (res.ok) {
              const info = await res.json();
              if (info.deviceId && !found.some(p => p.deviceId === info.deviceId)) {
                found.push({
                  deviceId: info.deviceId,
                  deviceName: info.deviceName || 'PC Sentinel Host',
                  url: `http://${ip}:3500`,
                  ip: ip,
                  shortCode: info.shortCode || info.deviceId.replace(/^SENT-/, '')
                });
              }
            }
          } catch (e) {}
        })
      );

      setDiscoveredPCs(found);
    } catch (err) {
      console.warn('Network probe error:', err);
    } finally {
      setIsScanningNetwork(false);
    }
  };

  // Camera QR Scanner Lifecycle (instant initialization with zero artificial delay)
  useEffect(() => {
    if (!isCameraActive) return;

    let isMounted = true;
    let scannerInstance = null;

    const startScanning = async () => {
      setCameraError(null);
      try {
        const elem = document.getElementById('onboarding-qr-reader');
        if (!elem) {
          throw new Error('Camera container element not found in DOM.');
        }

        scannerInstance = new Html5Qrcode('onboarding-qr-reader');
        qrScannerRef.current = scannerInstance;

        await scannerInstance.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            if (isMounted) {
              await handleQrScanned(decodedText);
            }
          },
          () => {} // frame noise
        );
      } catch (err) {
        console.warn('QR camera start error:', err);
        if (isMounted) {
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera permission was not granted. Please check Android Settings > Apps > PC Sentinel > Permissions.'
              : (err.message || 'Unable to access camera.')
          );
          setIsCameraActive(false);
        }
      }
    };

    startScanning();

    return () => {
      isMounted = false;
      if (scannerInstance) {
        try {
          scannerInstance.stop().catch(() => {});
        } catch (e) {}
        qrScannerRef.current = null;
      }
    };
  }, [isCameraActive]);

  const stopCamera = async () => {
    try {
      if (qrScannerRef.current) {
        await qrScannerRef.current.stop();
        qrScannerRef.current = null;
      }
    } catch (e) {}
    setIsCameraActive(false);
  };

  // 3. Process scanned QR payload
  const handleQrScanned = async (decodedText) => {
    await stopCamera();
    setIsResolving(true);
    setErrorMsg(null);

    try {
      let targetUrl = '';
      let deviceId = '';
      let deviceName = '';
      let code = '';

      if (decodedText.startsWith('{') && decodedText.endsWith('}')) {
        try {
          const parsed = JSON.parse(decodedText);
          deviceId = parsed.id || parsed.deviceId;
          deviceName = parsed.name || parsed.deviceName;
          targetUrl = parsed.url || parsed.host;
          code = parsed.code || '';
        } catch (e) {}
      }

      if (!targetUrl && decodedText.startsWith('http')) {
        try {
          const urlObj = new URL(decodedText);
          targetUrl = `${urlObj.protocol}//${urlObj.host}`;
          deviceId = urlObj.searchParams.get('pair') || '';
          deviceName = urlObj.searchParams.get('name') || '';
          code = urlObj.searchParams.get('code') || '';
        } catch (e) {
          targetUrl = decodedText;
        }
      }

      if (targetUrl) {
        const res = await universalFetch(`${targetUrl}/api/device/info`, {
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const info = await res.json();
          completePairing({
            id: info.deviceId || deviceId || `SENT-${Math.floor(1000 + Math.random() * 9000)}`,
            name: info.deviceName || deviceName || 'PC Sentinel Machine',
            hostUrl: targetUrl,
            lanIps: info.localIp ? [info.localIp] : [],
            status: 'healthy',
            isDefault: true,
            isOffline: false,
            lastSeen: new Date().toISOString()
          });
          return;
        }
      }

      if (code) {
        await handlePinSubmit(code);
        return;
      }

      if (deviceId) {
        completePairing({
          id: deviceId,
          name: deviceName || 'PC Sentinel Machine',
          hostUrl: targetUrl || '',
          relayTopic: `pcsentinel-telemetry-${deviceId}`,
          isCloudRelayed: true,
          status: 'healthy',
          isDefault: true,
          isOffline: false,
          lastSeen: new Date().toISOString()
        });
        return;
      }

      throw new Error('Unrecognized QR format. Please scan the QR code from the PC Sentinel desktop application.');
    } catch (err) {
      setErrorMsg(err.message || 'Could not connect to the scanned PC. Ensure PC Sentinel is running on the computer.');
    } finally {
      setIsResolving(false);
    }
  };

  // 4. Resolve and pair by 4-digit code
  const [resolvingCode, setResolvingCode] = useState('');

  const handlePinSubmit = async (codeOverride = null) => {
    const raw = (codeOverride || pinCode).trim();
    if (!raw) return;

    setIsResolving(true);
    setResolvingCode(raw);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const clean = raw.toLowerCase().replace(/^sent-/, '');

      // 1. Check discovered PCs on local Wi-Fi first (in-memory, 0ms)
      const peer = discoveredPCs.find(p =>
        (p.shortCode && p.shortCode.toLowerCase() === clean) ||
        (p.deviceId && p.deviceId.toLowerCase() === raw.toLowerCase())
      );

      if (peer) {
        completePairing({
          id: peer.deviceId,
          name: peer.deviceName,
          hostUrl: peer.url,
          lanUrl: peer.url,
          lanIps: [peer.ip],
          status: 'healthy',
          isDefault: true,
          isOffline: false,
          lastSeen: new Date().toISOString()
        });
        return;
      }

      // 2. Parallel Race: Query Universal Cloud Relay across redundant servers and LAN probe simultaneously
      const queryCloudRelay = async () => {
        const relayServers = ['https://ntfy.adminforge.de', 'https://ntfy.tedomum.fr', 'https://ntfy.sh'];
        for (const server of relayServers) {
          try {
            const relayRes = await universalFetch(`${server}/pcsentinel-pair-${clean}/json?poll=1`, {
              signal: AbortSignal.timeout(3500)
            });
            if (relayRes.ok) {
              const text = await relayRes.text();
              const lines = text.trim().split('\n').filter(Boolean);
              for (let i = lines.length - 1; i >= 0; i--) {
                try {
                  const lastMsg = JSON.parse(lines[i]);
                  if (lastMsg.message) {
                    const record = JSON.parse(lastMsg.message);
                    if (record.deviceId) {
                      return {
                        id: record.deviceId,
                        name: record.deviceName || 'PC Sentinel Machine',
                        hostUrl: record.lanUrl || record.wanUrl || '',
                        lanUrl: record.lanUrl || '',
                        wanUrl: record.wanUrl || null,
                        lanIps: record.lanIps || [],
                        relayTopic: record.relayTopic || `pcsentinel-telemetry-${record.deviceId}`,
                        isCloudRelayed: true,
                        status: record.status || 'healthy',
                        isDefault: true,
                        isOffline: false,
                        lastSeen: record.lastSeen || new Date().toISOString()
                      };
                    }
                  }
                } catch (lineErr) {}
              }
            }
          } catch (cloudErr) {}
        }
        return null;
      };

      const queryLanSubnet = async () => {
        let phoneIp = '';
        if (typeof window !== 'undefined' && window.AndroidBridge?.getDeviceWifiIp) {
          phoneIp = window.AndroidBridge.getDeviceWifiIp();
        }
        const subnets = [];
        if (phoneIp && phoneIp.includes('.')) {
          const parts = phoneIp.split('.');
          subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
        if (!subnets.includes('192.168.4')) subnets.push('192.168.4');
        if (!subnets.includes('192.168.1')) subnets.push('192.168.1');

        const candidateIps = [];
        for (const subnet of subnets) {
          candidateIps.push(
            `${subnet}.1`, `${subnet}.39`, `${subnet}.50`, `${subnet}.100`,
            `${subnet}.101`, `${subnet}.105`, `${subnet}.110`, `${subnet}.120`,
            `${subnet}.150`, `${subnet}.200`
          );
        }

        const results = await Promise.allSettled(
          candidateIps.map(async (ip) => {
            try {
              const res = await universalFetch(`http://${ip}:3500/api/device/info`, {
                signal: AbortSignal.timeout(1500)
              });
              if (res.ok) {
                const info = await res.json();
                const sCode = (info.shortCode || info.deviceId?.replace(/^SENT-/, '') || '').toLowerCase();
                if (sCode === clean || info.deviceId?.toLowerCase() === raw.toLowerCase()) {
                  return {
                    id: info.deviceId,
                    name: info.deviceName || 'PC Sentinel Machine',
                    hostUrl: `http://${ip}:3500`,
                    lanUrl: `http://${ip}:3500`,
                    lanIps: [ip],
                    status: 'healthy',
                    isDefault: true,
                    isOffline: false,
                    lastSeen: new Date().toISOString()
                  };
                }
              }
            } catch (e) {}
            return null;
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) return r.value;
        }
        return null;
      };

      // Race Cloud Relay vs LAN: whichever returns a valid machine first wins!
      let matched = null;
      try {
        matched = await Promise.race([
          queryCloudRelay().then(res => res ? Promise.resolve(res) : new Promise(() => {})),
          queryLanSubnet().then(res => res ? Promise.resolve(res) : new Promise(() => {})),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
      } catch (raceErr) {
        // Fallback: wait for both to conclude
        const [cloud, lan] = await Promise.all([queryCloudRelay(), queryLanSubnet()]);
        matched = cloud || lan;
      }

      if (matched) {
        completePairing(matched);
        return;
      }

      throw new Error(`No PC Sentinel machine found with code "${raw}". Ensure PC Sentinel is running on your computer.`);
    } catch (err) {
      setErrorMsg(err.message || 'Could not find PC Sentinel host. Verify code and ensure desktop app is active.');
    } finally {
      setIsResolving(false);
    }
  };

  const completePairing = (newDevice) => {
    setSuccessMsg(`Paired successfully with ${newDevice.name}!`);
    setTimeout(() => {
      onDeviceAdded(newDevice);
    }, 600);
  };

  const handleClearCache = () => {
    if (confirm('Clear all stored PC Sentinel cache and reset companion app?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-300 py-4 px-2">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-xl shadow-cyan-500/25 ring-4 ring-cyan-500/20">
          <Activity className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            PC SENTINEL
          </h1>
          <p className="text-xs font-medium text-cyan-400">
            Mobile Companion & Fleet Monitor
          </p>
        </div>
      </div>

      {/* Welcome Card */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-2xl shadow-cyan-950/30 text-center space-y-3">
        <h2 className="text-base font-bold text-white flex items-center justify-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span>Pair Your PC to Start Monitoring</span>
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
          Connect your phone to the PC Sentinel desktop app running on your computer. Monitor live hardware health, thermal spikes, and abrupt shutdowns with zero configuration.
        </p>
      </div>

      {/* Notifications / Feedback */}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3.5 rounded-xl flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-3.5 rounded-xl flex items-center gap-2.5">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* METHOD 1: Camera QR Scanner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Method 1: Scan QR Code
              </h3>
              <p className="text-[11px] text-slate-400">
                Point camera at your PC screen (Easiest)
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 uppercase">
            Recommended
          </span>
        </div>

        {/* Viewfinder element ALWAYS mounted in DOM to prevent race condition */}
        <div className={isCameraActive ? "space-y-3" : "hidden"}>
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/50 bg-black aspect-square max-w-[280px] mx-auto shadow-2xl">
            <div id="onboarding-qr-reader" className="w-full h-full" />
            <div className="absolute inset-0 border-2 border-cyan-400/40 rounded-xl pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={stopCamera}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel Camera
          </button>
        </div>

        {!isCameraActive && (
          <button
            type="button"
            onClick={() => setIsCameraActive(true)}
            disabled={isResolving}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            <span>Scan QR Code on PC Screen</span>
          </button>
        )}

        {cameraError && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 text-center space-y-1">
            <p>{cameraError}</p>
            <p className="text-slate-400">
              Tip: You can also tap <strong>Pair Now</strong> under <strong>Nearby PCs on Wi-Fi</strong> below!
            </p>
          </div>
        )}
      </div>

      {/* METHOD 2: 4-Digit Code */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Method 2: Enter 4-Digit Code
            </h3>
            <p className="text-[11px] text-slate-400">
              Type the code shown on your PC Sentinel screen
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 6))}
            placeholder="e.g. 2541"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-center text-base tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => handlePinSubmit()}
            disabled={isResolving || !pinCode.trim()}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-xl text-xs border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isResolving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            ) : (
              <ArrowRight className="w-4 h-4 text-cyan-400" />
            )}
            <span>Pair</span>
          </button>
        </div>
      </div>

      {/* Discovered Nearby on Wi-Fi */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 text-cyan-400 ${isScanningNetwork ? 'animate-pulse' : ''}`} />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Nearby PCs on Wi-Fi
            </h3>
          </div>
          {isScanningNetwork ? (
            <span className="text-[10px] text-cyan-400 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              Scanning...
            </span>
          ) : (
            <button
              type="button"
              onClick={probeNetwork}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              <span>Scan</span>
            </button>
          )}
        </div>

        {discoveredPCs.length > 0 ? (
          <div className="space-y-2">
            {discoveredPCs.map((pc) => (
              <div
                key={pc.deviceId}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-xs truncate">{pc.deviceName}</p>
                    <p className="text-[10px] text-cyan-400 font-mono">Code: {pc.shortCode}</p>
                  </div>
                </div>
                <button
                  onClick={() => completePairing({
                    id: pc.deviceId,
                    name: pc.deviceName,
                    hostUrl: pc.url,
                    lanIps: [pc.ip],
                    status: 'healthy',
                    isDefault: true,
                    isOffline: false,
                    lastSeen: new Date().toISOString()
                  })}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs transition-transform active:scale-95 cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  Pair Now
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400">
              {isScanningNetwork
                ? 'Looking for running PC Sentinel hosts on local Wi-Fi...'
                : 'No nearby hosts currently scanned. Scan the QR code on your PC screen above or tap Scan below.'}
            </p>
            {!isScanningNetwork && (
              <button
                type="button"
                onClick={probeNetwork}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Scan Wi-Fi Network</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Subtle Reset Cache Button */}
      <div className="text-center pt-2">
        <button
          onClick={handleClearCache}
          className="text-[11px] text-slate-500 hover:text-rose-400 inline-flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
          <span>Reset Companion App Cache</span>
        </button>
      </div>

      {/* High-Tech Animated Connecting & Pairing Modal Overlay */}
      {isResolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl shadow-cyan-950/60 space-y-5">
            {/* Animated Radar Rings */}
            <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping duration-1000" />
              <div className="absolute inset-2 rounded-full border border-cyan-400/40 animate-pulse" />
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/30">
                <Laptop className="w-8 h-8 text-white animate-bounce" />
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Connecting to PC...</h3>
              <p className="text-xs text-cyan-400 font-mono mt-1">Code: {resolvingCode || pinCode || '4-Digit Code'}</p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-[11px] text-slate-300 space-y-2 text-left">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                <span className="font-semibold text-white">Establishing Connection...</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal pl-5">
                Linking via Cloud Relay & local network across Wi-Fi, 5G, or cellular without entering IP addresses.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsResolving(false)}
              className="px-4 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
