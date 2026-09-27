import React, { useState, useEffect, useRef } from 'react';
import {
  X, Laptop, QrCode, Search, Check, AlertCircle,
  RefreshCw, Plus, ArrowRight, ShieldCheck, Zap,
  Camera, Hash, Wifi, ChevronDown, ChevronUp
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { universalFetch, getApiBase } from '../App';

export default function AddDeviceModal({ isOpen, onClose, onDeviceAdded, existingFleet = [] }) {
  const [activeTab, setActiveTab] = useState('scan'); // 'scan' | 'code' | 'discovered'
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [matchedDevice, setMatchedDevice] = useState(null);

  // Discovered Peers on local Wi-Fi
  const [discoveredPeers, setDiscoveredPeers] = useState([]);
  const [loadingPeers, setLoadingPeers] = useState(false);

  // Camera QR Scanner State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const qrScannerRef = useRef(null);

  // Advanced Manual IP Fallback
  const [showManual, setShowManual] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTesting, setManualTesting] = useState(false);
  const [manualTestResult, setManualTestResult] = useState(null);

  // Fetch discovered peers on local network
  const fetchDiscoveredPeers = async () => {
    try {
      setLoadingPeers(true);
      const res = await universalFetch(`${getApiBase()}/api/fleet/discovered`, {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        const existingIds = new Set(existingFleet.map(d => d.id));
        // Filter out machines already in the fleet and self
        const peers = (data.peers || []).filter(p => !existingIds.has(p.deviceId));
        setDiscoveredPeers(peers);
      }
    } catch (e) {
      // Non-blocking
    } finally {
      setLoadingPeers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiscoveredPeers();
      const interval = setInterval(fetchDiscoveredPeers, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, existingFleet]);

  // Clean up QR scanner on unmount or tab switch
  const stopQrScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
        qrScannerRef.current.clear();
      } catch (e) {
        // Ignore stop error
      }
      qrScannerRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'scan') {
      stopQrScanner();
    }
  }, [isOpen, activeTab]);

  const startQrScanner = async () => {
    setCameraError(null);
    try {
      setCameraActive(true);
      const scanner = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 }
        },
        async (decodedText) => {
          // Successfully decoded QR code!
          await handleQrCodeScanned(decodedText);
        },
        (errorMessage) => {
          // Ignore transient frame scanning failures
        }
      );
    } catch (err) {
      console.warn('Camera scanner failed:', err);
      setCameraError('Camera access required. Please allow camera permissions or enter the 4-digit code instead.');
      setCameraActive(false);
    }
  };

  const handleQrCodeScanned = async (decodedText) => {
    await stopQrScanner();
    setIsResolving(true);
    setResolveError(null);

    try {
      let targetUrl = '';
      let deviceId = '';
      let deviceName = '';
      let code = '';

      // 1. Try parsing as JSON
      if (decodedText.startsWith('{') && decodedText.endsWith('}')) {
        try {
          const parsed = JSON.parse(decodedText);
          deviceId = parsed.id || parsed.deviceId;
          deviceName = parsed.name || parsed.deviceName;
          targetUrl = parsed.url || parsed.host;
          code = parsed.code || '';
        } catch (e) {}
      }

      // 2. Try parsing as URL (e.g., http://192.168.4.50:3500?pair=SENT-8812&name=Alienware)
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

      // 3. Fallback: plain code
      if (!targetUrl && !deviceId) {
        code = decodedText.trim();
      }

      if (targetUrl) {
        // Ping device to confirm handshake
        const res = await universalFetch(`${targetUrl}/api/device/info`, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const info = await res.json();
          addDeviceToFleet({
            id: info.deviceId || deviceId || `SENT-${Math.floor(1000 + Math.random() * 9000)}`,
            name: deviceName || info.deviceName || 'PC Sentinel Machine',
            hostUrl: targetUrl,
            lanIps: info.localIp ? [info.localIp] : [],
            status: 'healthy',
            isOffline: false,
            lastSeen: new Date().toISOString()
          });
          return;
        }
      }

      if (code) {
        await resolveAndAddByCode(code);
      } else {
        throw new Error('Unrecognized PC Sentinel QR code format.');
      }
    } catch (err) {
      setResolveError(err.message || 'Could not connect to the scanned PC. Please verify both devices are on the same network.');
    } finally {
      setIsResolving(false);
    }
  };

  const resolveAndAddByCode = async (codeToResolve) => {
    const raw = (codeToResolve || pairingCodeInput).trim();
    if (!raw) return;

    setIsResolving(true);
    setResolveError(null);
    setMatchedDevice(null);

    try {
      // 1. Check discovered peers first
      const cleanCode = raw.toLowerCase().replace(/^sent-/, '');
      const localMatch = discoveredPeers.find(p =>
        (p.shortCode && p.shortCode.toLowerCase() === cleanCode) ||
        (p.deviceId && p.deviceId.toLowerCase() === raw.toLowerCase())
      );

      if (localMatch) {
        addDeviceToFleet({
          id: localMatch.deviceId,
          name: localMatch.deviceName,
          hostUrl: localMatch.url,
          lanIps: [localMatch.ip],
          status: 'healthy',
          isOffline: false,
          lastSeen: new Date().toISOString()
        });
        return;
      }

      // 2. Query active server's fleet resolver
      const res = await universalFetch(`${getApiBase()}/api/fleet/resolve/${encodeURIComponent(raw)}`, {
        signal: AbortSignal.timeout(3500)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.found && data.device) {
          addDeviceToFleet({
            id: data.device.deviceId,
            name: data.device.deviceName,
            hostUrl: data.device.url,
            lanIps: [data.device.ip],
            status: 'healthy',
            isOffline: false,
            lastSeen: new Date().toISOString()
          });
          return;
        }
      }

      throw new Error(`No PC Sentinel machine found with code "${raw}". Make sure PC Sentinel is running on the other PC and both devices are on the same Wi-Fi.`);
    } catch (err) {
      setResolveError(err.message);
    } finally {
      setIsResolving(false);
    }
  };

  const addDeviceToFleet = (device) => {
    onDeviceAdded(device);
    onClose();
  };

  // Advanced Manual IP connection test
  const handleManualTest = async () => {
    let target = manualHost.trim().replace(/\/+$/, '');
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    if (!target.match(/:\d+$/)) {
      target = `${target}:3500`;
    }

    setManualTesting(true);
    setManualTestResult(null);

    try {
      const res = await universalFetch(`${target}/api/device/info`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const info = await res.json();
        setManualTestResult({
          success: true,
          deviceInfo: info,
          url: target,
          message: `Connected to ${info.deviceName}!`
        });
        if (!manualName.trim()) setManualName(info.deviceName || 'PC Sentinel Machine');
      } else {
        setManualTestResult({ success: false, message: `Responded with HTTP ${res.status}` });
      }
    } catch (e) {
      setManualTestResult({ success: false, message: 'Could not reach host.' });
    } finally {
      setManualTesting(false);
    }
  };

  const handleManualSave = () => {
    if (!manualTestResult?.url) return;
    addDeviceToFleet({
      id: manualTestResult.deviceInfo?.deviceId || `SENT-${Math.floor(1000 + Math.random() * 9000)}`,
      name: manualName.trim() || manualTestResult.deviceInfo?.deviceName || 'Monitored PC',
      hostUrl: manualTestResult.url,
      lanIps: manualTestResult.deviceInfo?.localIp ? [manualTestResult.deviceInfo.localIp] : [],
      status: 'healthy',
      isOffline: false,
      lastSeen: new Date().toISOString()
    });
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pair PC / Laptop to Fleet
              </h2>
              <p className="text-xs text-slate-400">Zero IP configuration required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('scan')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'scan'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>Scan QR Code</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'code'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Hash className="w-4 h-4 text-blue-400" />
            <span>4-Digit Code</span>
          </button>
          <button
            onClick={() => { setActiveTab('discovered'); fetchDiscoveredPeers(); }}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer relative ${
              activeTab === 'discovered'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span>Discovered Nearby</span>
            {discoveredPeers.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-200 text-xs flex-1">
          {/* Resolve Error Banner */}
          {resolveError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">{resolveError}</p>
            </div>
          )}

          {/* TAB 1: SCAN QR CODE */}
          {activeTab === 'scan' && (
            <div className="space-y-4 text-center">
              <p className="text-slate-300 text-xs leading-relaxed">
                Open <strong>PC Sentinel</strong> on your other computer, click the <strong>Pair Device</strong> icon in the header, and point your phone's camera at the screen.
              </p>

              {/* Viewfinder container */}
              <div className="relative mx-auto w-full max-w-[280px] aspect-square rounded-2xl bg-slate-950 border-2 border-cyan-500/40 flex flex-col items-center justify-center overflow-hidden shadow-xl shadow-cyan-950/30">
                <div id="qr-reader-container" className="w-full h-full" />

                {!cameraActive && (
                  <div className="p-6 flex flex-col items-center justify-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg">
                      <Camera className="w-7 h-7" />
                    </div>
                    <button
                      type="button"
                      onClick={startQrScanner}
                      className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-slate-950" />
                      <span>Start Camera Scanner</span>
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center z-10">
                    <button
                      type="button"
                      onClick={stopQrScanner}
                      className="px-3 py-1 bg-slate-900/90 text-slate-300 hover:text-white rounded-lg text-[10px] font-semibold border border-slate-700 backdrop-blur-md cursor-pointer"
                    >
                      Stop Camera
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="text-amber-300 text-[11px] leading-relaxed bg-amber-950/30 border border-amber-500/30 rounded-xl p-3">
                  {cameraError}
                </p>
              )}

              {isResolving && (
                <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs font-semibold py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting to scanned PC...</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 4-TO-6 DIGIT PAIRING CODE */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/20 flex items-center gap-2.5">
                <Hash className="w-4 h-4 text-blue-400 shrink-0" />
                <p className="text-[11px] text-slate-300">
                  Look at the <strong>Pair Device</strong> popup on your computer screen. Enter the 4-digit code shown there (e.g. <span className="font-mono text-cyan-300 font-bold">2541</span> or <span className="font-mono text-cyan-300 font-bold">8812</span>).
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                  Device Pairing Code
                </label>
                <div className="flex justify-center gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    value={pairingCodeInput}
                    onChange={(e) => setPairingCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') resolveAndAddByCode(); }}
                    placeholder="e.g. 2541"
                    className="w-48 text-center px-4 py-3 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-mono text-xl tracking-widest placeholder:text-slate-700 shadow-inner"
                    autoFocus
                  />
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => resolveAndAddByCode()}
                    disabled={isResolving || !pairingCodeInput.trim()}
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isResolving ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-950" />
                    )}
                    <span>{isResolving ? 'Locating Machine...' : 'Find & Add PC'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DISCOVERED NEARBY WI-FI PCS */}
          {activeTab === 'discovered' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  PCs Discovered on Local Network
                </span>
                <button
                  onClick={fetchDiscoveredPeers}
                  disabled={loadingPeers}
                  className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingPeers ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {discoveredPeers.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950/40 border border-slate-800 text-center space-y-2">
                  <Wifi className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                  <p className="text-xs text-slate-400 font-semibold">Listening for nearby PCs...</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Ensure PC Sentinel is running on your other laptop. As soon as it boots on the same Wi-Fi, it will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredPeers.map((peer) => (
                    <div
                      key={peer.deviceId}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition-colors flex items-center justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs">{peer.deviceName}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span>Code: {peer.shortCode || peer.deviceId}</span>
                            <span>•</span>
                            <span className="text-emerald-400">Online</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => addDeviceToFleet({
                          id: peer.deviceId,
                          name: peer.deviceName,
                          hostUrl: peer.url,
                          lanIps: [peer.ip],
                          status: 'healthy',
                          isOffline: false,
                          lastSeen: new Date().toISOString()
                        })}
                        className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Pair Now</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ADVANCED MANUAL OVERRIDE (COLLAPSIBLE) */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className="text-[10px] text-slate-500 hover:text-slate-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>Advanced manual override (for custom ports or proxies)</span>
            </button>

            {showManual && (
              <div className="mt-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Manual Host / URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualHost}
                      onChange={(e) => setManualHost(e.target.value)}
                      placeholder="e.g. my-pc:3500"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleManualTest}
                      disabled={manualTesting || !manualHost.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs rounded-lg border border-slate-700 cursor-pointer disabled:opacity-50"
                    >
                      {manualTesting ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>

                {manualTestResult && (
                  <div className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between ${
                    manualTestResult.success ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                  }`}>
                    <span>{manualTestResult.message}</span>
                    {manualTestResult.success && (
                      <button
                        onClick={handleManualSave}
                        className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-bold rounded text-[10px] cursor-pointer"
                      >
                        Add
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            Both devices must be on the same Wi-Fi / Local Network
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
