import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Smartphone, QrCode, Copy, Check, RefreshCw,
  ExternalLink, ShieldCheck, Cloud, AlertCircle, Laptop, Settings
} from 'lucide-react';

export default function DevicePairingModal({ onClose, onRegenerate }) {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('pair'); // 'pair' | 'settings'

  // Cloud Config Form State
  const [projectIdInput, setProjectIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudMsg, setCloudMsg] = useState(null);

  const fetchDeviceInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/device/info');
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
  }, []);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateCode = async () => {
    try {
      const res = await fetch('/api/device/regenerate-code', { method: 'POST' });
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
      const res = await fetch('/api/device/firebase-config', {
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
  // If hosted on a cloud domain or locally, generate direct pairing URL
  const currentHost = window.location.origin;
  const pairingUrl = `${currentHost}?pair=${pairingCode}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pair Phone & Companion App
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Instant Link
                </span>
              </h2>
              <p className="text-xs text-slate-400">Scan to open the complete PC Sentinel diagnostic app on your phone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('pair')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'pair'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Scan QR & Pairing Code
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            Cloud Relay Backend
            {deviceInfo?.isCloudActive && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="Cloud Relay active" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {activeTab === 'pair' && (
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
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Generate new pairing code"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Open your phone's camera and point it at the QR code. Your phone will immediately open the <strong>full PC Sentinel dashboard</strong>, paired directly to this ThinkPad.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleCopy(pairingUrl)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Link Copied!' : 'Copy Pairing Link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Status & Capabilities Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Laptop className="w-4 h-4 text-cyan-400" />
                    <span>Host Hardware</span>
                  </div>
                  <span className="text-xs text-slate-300 font-mono block">
                    {deviceInfo?.deviceName || 'Jims-ThinkPad'} (ThinkPad T15)
                  </span>
                  <span className="text-[11px] text-slate-500 block">IP: {localIp}:{port}</span>
                </div>

                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Cloud className="w-4 h-4 text-blue-400" />
                    <span>Offline Crash Access</span>
                  </div>
                  <span className={`text-xs font-medium block ${deviceInfo?.isCloudActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {deviceInfo?.isCloudActive ? 'Cloud Relay Active' : 'Local Standby'}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {deviceInfo?.isCloudActive ? 'Full app accessible even when PC is off' : 'Configure cloud backend for 24/7 access'}
                  </span>
                </div>
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
