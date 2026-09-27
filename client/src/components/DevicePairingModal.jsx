import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Smartphone, QrCode, Copy, Check, RefreshCw,
  ExternalLink, ShieldCheck, Cloud, AlertCircle, Laptop, Settings,
  ArrowDownToLine, Download
} from 'lucide-react';
import { getApiBase } from '../App';

export default function DevicePairingModal({ onClose, onRegenerate }) {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('apk'); // 'apk' | 'web' | 'settings'

  // Cloud Config Form State
  const [projectIdInput, setProjectIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudMsg, setCloudMsg] = useState(null);

  const fetchDeviceInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/api/device/info`);
      if (res.ok) {
        const json = await res.json();
        setDeviceInfo(json);
        if (json.firebaseConfig?.projectId) {
          setProjectIdInput(json.firebaseConfig.projectId);
          setApiKeyInput(json.firebaseConfig.apiKey || '');
        }
      }
    } catch (e) {
      console.warn('Failed to load device info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceInfo();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateCode = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/device/regenerate-code`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setDeviceInfo(json);
        if (onRegenerate) onRegenerate(json);
      }
    } catch (e) {
      console.error('Failed to regenerate code:', e);
    }
  };

  const handleSaveFirebase = async (e) => {
    e.preventDefault();
    if (!projectIdInput.trim()) return;
    setIsSavingCloud(true);
    setCloudMsg(null);

    try {
      const res = await fetch(`${getApiBase()}/api/device/firebase-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectIdInput.trim(),
          apiKey: apiKeyInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update Firebase configuration');
      }

      setCloudMsg({ type: 'success', text: `Connected to Firebase Project: ${projectIdInput.trim()}` });
      fetchDeviceInfo();
    } catch (err) {
      setCloudMsg({ type: 'error', text: err.message });
    } finally {
      setIsSavingCloud(false);
    }
  };

  const pairingCode = deviceInfo?.deviceId || 'SENT-????';
  const localIp = deviceInfo?.localIp || '192.168.4.39';
  const port = deviceInfo?.port || 3500;
  const currentHost = window.location.origin;

  // APK Direct Download URL
  const apkDownloadUrl = deviceInfo?.apkDownloadUrl || `${currentHost}/download/pc-sentinel.apk`;
  // Web Companion Browser URL
  const pairingUrl = deviceInfo?.pairingUrl || `${currentHost}?pair=${pairingCode}`;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Mobile Companion & APK
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Android Native
                </span>
              </h2>
              <p className="text-xs text-slate-400">Install the standalone APK or open the web dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('apk')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'apk'
                ? 'border-emerald-400 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Android APK</span>
          </button>
          <button
            onClick={() => setActiveTab('windows')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'windows'
                ? 'border-blue-400 text-blue-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-4 h-4 text-blue-400" />
            <span>Windows Setup (.exe)</span>
          </button>
          <button
            onClick={() => setActiveTab('web')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'web'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Web Companion</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Cloud Relay</span>
            {deviceInfo?.isCloudActive && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="Cloud Relay active" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {/* 1. Android APK Tab */}
          {activeTab === 'apk' && (
            <div className="space-y-6">
              {/* QR Code and APK Direct Download */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-xl bg-slate-950/70 border border-emerald-500/30 shadow-inner">
                {/* QR Code for APK */}
                <div className="p-3.5 bg-white rounded-xl shadow-xl shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={apkDownloadUrl}
                    size={150}
                    level="M"
                    includeMargin={false}
                  />
                  <span className="text-[10px] text-slate-800 font-mono mt-2 font-bold tracking-wider">
                    SCAN TO DOWNLOAD
                  </span>
                </div>

                {/* Instructions & Actions */}
                <div className="space-y-3 flex-1 w-full text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">PC Sentinel Native Android App</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                      v1.0 • {deviceInfo?.apkSizeMB || '11.9'} MB
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Scan with your phone or tablet camera to directly download <strong>pc-sentinel.apk</strong>. Once installed, the app runs locally on your device with <strong>zero server dependencies</strong>—it will always open even if the ThinkPad is completely dead.
                  </p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                    <a
                      href={apkDownloadUrl}
                      download="pc-sentinel.apk"
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <ArrowDownToLine className="w-4 h-4 text-slate-950" />
                      <span>Download APK Directly</span>
                    </a>
                    <button
                      onClick={() => handleCopy(apkDownloadUrl)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'URL Copied!' : 'Copy Link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sideload Instructions */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-white text-xs flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>How to Install on Android Phone / Tablet:</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li>Scan the QR code or tap <strong>Download APK Directly</strong> on your phone.</li>
                  <li>Tap the downloaded <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">pc-sentinel.apk</code> in your notification bar or Downloads.</li>
                  <li>Tap <strong>Install</strong> (if prompted, enable <em>"Install unknown apps"</em> for your browser).</li>
                  <li>Launch <strong>PC Sentinel</strong> from your Android home screen!</li>
                </ol>
              </div>
            </div>
          )}

          {/* 2. Windows Setup (.exe) Tab */}
          {activeTab === 'windows' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-xl bg-slate-950/70 border border-blue-500/30 shadow-inner">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 shrink-0">
                  <Laptop className="w-10 h-10" />
                </div>

                <div className="space-y-3 flex-1 w-full text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">PC Sentinel 1-Click Windows Setup</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                      v1.0 • {deviceInfo?.installerSizeMB || '32.6'} MB
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Download <strong>PC-Sentinel-Setup.exe</strong> to install on your other computers (Alienware laptop, home desktop, or give to family/cousin). Includes bundled portable Node runtime, auto-start boot service, dying-gasp shutdown trigger, and automatic firewall rules with zero setup.
                  </p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                    <a
                      href={deviceInfo?.installerDownloadUrl || `${currentHost}/download/PC-Sentinel-Setup.exe`}
                      download="PC-Sentinel-Setup.exe"
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                      <span>Download PC-Sentinel-Setup.exe</span>
                    </a>
                    <button
                      onClick={() => handleCopy(deviceInfo?.installerDownloadUrl || `${currentHost}/download/PC-Sentinel-Setup.exe`)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'URL Copied!' : 'Copy Download Link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-white text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Setup Features:</span>
                </h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li><strong>Standalone & Portable:</strong> Fully self-contained — no Node.js or manual software installations required.</li>
                  <li><strong>Instant Dying-Gasp Interceptor:</strong> Listens to Windows ACPI & Event 1074 triggers in &lt;10ms.</li>
                  <li><strong>Multi-PC Fleet Sync:</strong> Once installed, pair it with your phone companion to monitor all your machines together.</li>
                </ul>
              </div>
            </div>
          )}

          {/* 3. Web Companion Tab */}
          {activeTab === 'web' && (
            <div className="space-y-6">
              {/* QR Code and Device Code Card */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-xl bg-slate-950/70 border border-slate-800 shadow-inner">
                {/* QR Code */}
                <div className="p-3.5 bg-white rounded-xl shadow-xl shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={pairingUrl}
                    size={150}
                    level="M"
                    includeMargin={false}
                  />
                  <span className="text-[10px] text-slate-700 font-mono mt-2 font-bold tracking-wider">
                    {pairingCode}
                  </span>
                </div>

                {/* Pairing Code & Steps */}
                <div className="space-y-3 flex-1 w-full text-center sm:text-left">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">
                    Your 6-Character Device Pairing Code
                  </span>

                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="text-2xl font-black font-mono tracking-widest text-cyan-400 bg-cyan-950/50 border border-cyan-800/80 px-3.5 py-1.5 rounded-lg shadow-sm">
                      {pairingCode}
                    </span>
                    <button
                      onClick={handleRegenerateCode}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Generate new pairing code"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Open your phone's camera and point it at the QR code to open the <strong>web version</strong> in Chrome, Safari, or Edge without installing an app.
                  </p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                    <a
                      href={pairingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Browser</span>
                    </a>
                    <button
                      onClick={() => handleCopy(pairingUrl)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Link Copied!' : 'Copy Web Link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Card */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  <span>Host Endpoint</span>
                </div>
                <span className="text-xs text-slate-300 font-mono block">
                  {deviceInfo?.deviceName || 'ThinkPad'} ({localIp}:{port})
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Web companion requires the ThinkPad server to be running and reachable.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Cloud className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-xs">
                    Firebase Cloud Relay (Consumer Backend)
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    By linking your Firebase Project, PC Sentinel automatically pushes real-time heartbeats and crash dumps to Google Firestore.
                    End-users simply pair their phone with their 6-character code and never need accounts or router setup.
                  </p>
                </div>
              </div>

              {cloudMsg && (
                <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  cloudMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{cloudMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveFirebase} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
                  Firebase Project Settings
                </h4>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block">
                    Firebase Project ID
                  </label>
                  <input
                    type="text"
                    value={projectIdInput}
                    onChange={(e) => setProjectIdInput(e.target.value)}
                    placeholder="e.g. pc-sentinel-diagnostics"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    From your Firebase Console: <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">console.firebase.google.com</a>
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block">
                    Firebase Web API Key (Optional)
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingCloud || !projectIdInput.trim()}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {isSavingCloud ? 'Saving...' : 'Connect Cloud Project'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Device Code: {pairingCode}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
