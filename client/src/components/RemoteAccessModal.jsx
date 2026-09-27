import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Globe, Wifi, Smartphone, ShieldCheck, ShieldAlert,
  Key, Copy, Check, ExternalLink, Terminal, AlertTriangle, RefreshCw,
  Github, Cloud, CheckCircle2, Lock
} from 'lucide-react';

export default function RemoteAccessModal({ onClose, networkInfo, onUpdateConfig }) {
  const [activeTab, setActiveTab] = useState('cloud'); // Default to 'cloud' for offline access
  const [qrType, setQrType] = useState('cloud'); // 'cloud' | 'remote' | 'lan'
  const [copiedKey, setCopiedKey] = useState(null);

  // Security PIN form state
  const [pinInput, setPinInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [allowBypass, setAllowBypass] = useState(networkInfo?.allowLocalBypass ?? true);
  const [pinStatusMsg, setPinStatusMsg] = useState(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Cloud Vault state
  const [cloudStatus, setCloudStatus] = useState(null);
  const [githubToken, setGithubToken] = useState('');
  const [customGistId, setCustomGistId] = useState('');
  const [cloudAutoSync, setCloudAutoSync] = useState(true);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  const [cloudMsg, setCloudMsg] = useState(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  const fetchCloudStatus = async () => {
    try {
      const res = await fetch('/api/cloud/status');
      if (res.ok) {
        const json = await res.json();
        setCloudStatus(json);
      }
    } catch (e) {
      console.warn('Failed to load cloud status:', e);
    }
  };

  useEffect(() => {
    fetchCloudStatus();
  }, []);

  useEffect(() => {
    if (networkInfo) {
      setAllowBypass(networkInfo.allowLocalBypass !== false);
    }
  }, [networkInfo]);

  const localIp = networkInfo?.localIp || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const publicIp = networkInfo?.publicIp || localIp;
  const port = networkInfo?.port || 3500;

  const remoteUrl = `http://${publicIp}:${port}`;
  const lanUrl = `http://${localIp}:${port}`;
  const cloudGistUrl = cloudStatus?.gistUrl || '';
  const currentQrUrl = qrType === 'cloud' && cloudGistUrl ? cloudGistUrl : (qrType === 'remote' ? remoteUrl : lanUrl);

  const handleCopy = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    setIsSavingPin(true);
    setPinStatusMsg(null);

    try {
      const res = await fetch('/api/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPin: currentPinInput,
          newPin: pinInput,
          allowLocalBypass: allowBypass
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update PIN');
      }

      setPinStatusMsg({ type: 'success', text: pinInput ? 'Security PIN successfully updated!' : 'Security PIN removed.' });
      setPinInput('');
      setCurrentPinInput('');
      if (onUpdateConfig) {
        onUpdateConfig();
      }
    } catch (err) {
      setPinStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleConnectCloud = async (e) => {
    e.preventDefault();
    if (!githubToken.trim()) return;
    setIsConnectingCloud(true);
    setCloudMsg(null);

    try {
      const res = await fetch('/api/cloud/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken: githubToken.trim(),
          gistId: customGistId.trim(),
          autoSync: cloudAutoSync
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to setup Cloud Vault');
      }

      setCloudMsg({ type: 'success', text: `Vault connected! Secret GitHub Gist active (${data.gistId}).` });
      setGithubToken('');
      setCustomGistId('');
      fetchCloudStatus();
      if (onUpdateConfig) onUpdateConfig();
    } catch (err) {
      setCloudMsg({ type: 'error', text: err.message });
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncingNow(true);
    setCloudMsg(null);
    try {
      const res = await fetch('/api/cloud/sync-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Sync failed');
      }
      setCloudMsg({ type: 'success', text: 'Telemetry successfully pushed to GitHub Gist!' });
      fetchCloudStatus();
    } catch (err) {
      setCloudMsg({ type: 'error', text: err.message });
    } finally {
      setIsSyncingNow(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Off-Network & Offline Access
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Cloud Vault Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">View diagnostic telemetry from your phone even if your PC powers down</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 text-xs font-medium overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('cloud')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'cloud'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Github className="w-4 h-4 text-purple-400" />
            GitHub Cloud Vault (Offline)
            {cloudStatus?.configured ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="Cloud Vault connected" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Not connected" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'connect'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Live Links & QR
          </button>
          <button
            onClick={() => setActiveTab('router')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'router'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            Router Port Forwarding
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'security'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            Security PIN
            {networkInfo?.hasPin ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="PIN active" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="No PIN set" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {/* TAB: GITHUB CLOUD VAULT (OFFLINE CRASH DUMP ACCESS) */}
          {activeTab === 'cloud' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-cyan-950/30 border border-purple-800/40 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
                  <Github className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-white text-xs flex items-center gap-2">
                    Persistent Cloud Vault: Zero Downtime Crash Access
                    <span className="text-[10px] bg-purple-900/80 text-purple-300 px-2 py-0.5 rounded font-mono">
                      Dead-Man's Mirror
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    When your PC experiences an emergency thermal shutdown or power loss, the motherboard cuts power, making direct connections to the machine impossible.
                    By linking a private GitHub Gist, PC Sentinel continuously pushes <strong>30-second heartbeats</strong> and an <strong>immediate emergency crash snapshot</strong> to the cloud before power drops.
                  </p>
                </div>
              </div>

              {cloudMsg && (
                <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  cloudMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {cloudMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{cloudMsg.text}</span>
                </div>
              )}

              {/* Status Display if Configured */}
              {cloudStatus?.configured ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-semibold text-white">Vault Connected & Synchronizing</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Sync: Every {cloudStatus.syncIntervalSec}s
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase font-mono block">Secret Gist ID</span>
                      <span className="font-mono text-cyan-300 font-semibold truncate block">{cloudStatus.gistId}</span>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase font-mono block">Last Heartbeat Pushed</span>
                      <span className="font-mono text-slate-200 block truncate">
                        {cloudStatus.lastSyncTime ? new Date(cloudStatus.lastSyncTime).toLocaleTimeString() : 'Pending initial push...'}
                      </span>
                    </div>
                  </div>

                  {cloudStatus.gistUrl && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs">
                      <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate flex-1 text-slate-300">{cloudStatus.gistUrl}</span>
                      <a
                        href={cloudStatus.gistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Gist</span>
                      </a>
                      <button
                        onClick={() => handleCopy('gistUrl', cloudStatus.gistUrl)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1 transition-colors"
                      >
                        {copiedKey === 'gistUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'gistUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-slate-400">
                      When your PC powers off, opening this Gist on your phone shows the exact markdown crash breakdown and raw telemetry.
                    </p>
                    <button
                      onClick={handleSyncNow}
                      disabled={isSyncingNow}
                      className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all shrink-0 active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                      <span>{isSyncingNow ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Connect / Reconfigure Form */}
              <form onSubmit={handleConnectCloud} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
                    {cloudStatus?.configured ? 'Update GitHub Token / Gist' : 'Connect Your GitHub Account'}
                  </h4>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=PC-Sentinel-Vault"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
                  >
                    <span>Generate GitHub Token (gist scope)</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block">
                    GitHub Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder={cloudStatus?.maskedToken ? `Configured: ${cloudStatus.maskedToken} (Enter new token to replace)` : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Stored strictly on your local machine in <code className="text-cyan-300">server/secrets.json</code> (ignored in git).
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block">
                    Existing Gist ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={customGistId}
                    onChange={(e) => setCustomGistId(e.target.value)}
                    placeholder="Leave blank to automatically create a private Gist for you"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="cloudAutoSync"
                    checked={cloudAutoSync}
                    onChange={(e) => setCloudAutoSync(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                  />
                  <label htmlFor="cloudAutoSync" className="text-xs text-slate-300 cursor-pointer">
                    Enable automatic 30s heartbeats & emergency crash snapshot
                  </label>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isConnectingCloud || !githubToken.trim()}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg text-xs transition-all shadow-md shadow-purple-900/30 active:scale-95 disabled:opacity-50"
                  >
                    {isConnectingCloud ? 'Connecting & Provisioning...' : (cloudStatus?.configured ? 'Update Cloud Vault' : 'Connect & Provision Cloud Vault')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 1: CONNECT & QR CODE */}
          {activeTab === 'connect' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="p-3 bg-white rounded-xl shadow-lg shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={currentQrUrl || 'http://localhost:3500'}
                    size={140}
                    level="M"
                    includeMargin={false}
                  />
                  <span className="text-[10px] text-slate-600 font-mono mt-2 font-semibold text-center">
                    {qrType === 'cloud' ? 'GitHub Vault (Offline)' : (qrType === 'remote' ? 'Cellular / WAN' : 'Local Wi-Fi')}
                  </span>
                </div>

                <div className="space-y-3 flex-1 w-full text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                    <span className="text-xs font-semibold text-slate-300 mr-1">Scan:</span>
                    <button
                      onClick={() => setQrType('cloud')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        qrType === 'cloud'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Cloud Vault (Offline 24/7)
                    </button>
                    <button
                      onClick={() => setQrType('remote')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        qrType === 'remote'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Cellular (WAN)
                    </button>
                    <button
                      onClick={() => setQrType('lan')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        qrType === 'lan'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Home Wi-Fi (LAN)
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">
                    {qrType === 'cloud'
                      ? 'Bookmark this on your phone: always accessible even when your PC is completely powered off or battery dead.'
                      : 'Scan to connect directly to the live server running on your PC.'}
                  </p>

                  <div className="space-y-2 pt-1">
                    {cloudStatus?.gistUrl && (
                      <div className="flex items-center gap-2 bg-slate-900 border border-purple-800/40 rounded-lg p-2 font-mono text-xs">
                        <Github className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="truncate flex-1 text-purple-200">{cloudStatus.gistUrl}</span>
                        <button
                          onClick={() => handleCopy('cloudUrl', cloudStatus.gistUrl)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 transition-colors"
                        >
                          {copiedKey === 'cloudUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[11px]">{copiedKey === 'cloudUrl' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-lg p-2 font-mono text-xs">
                      <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate flex-1 text-slate-200">{remoteUrl}</span>
                      <button
                        onClick={() => handleCopy('remoteUrl', remoteUrl)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 transition-colors"
                      >
                        {copiedKey === 'remoteUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[11px]">{copiedKey === 'remoteUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ROUTER PORT FORWARDING */}
          {activeTab === 'router' && (
            <div className="space-y-5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-xs uppercase tracking-wider text-cyan-300">
                    Exact Router Configuration Values
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">{networkInfo?.deviceName || 'Windows PC'}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Log into your router's administration portal (usually your router app or default gateway) and create this port forwarding rule:
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs border border-slate-800 rounded-lg overflow-hidden">
                    <thead className="bg-slate-900 text-slate-400 text-[11px]">
                      <tr>
                        <th className="p-2.5 border-b border-slate-800">Setting Field</th>
                        <th className="p-2.5 border-b border-slate-800">Value to Enter</th>
                        <th className="p-2.5 border-b border-slate-800 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      <tr>
                        <td className="p-2.5 text-slate-400 font-sans">Service Name</td>
                        <td className="p-2.5 font-bold text-cyan-300">PC Sentinel</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => handleCopy('f_name', 'PC Sentinel')} className="text-slate-400 hover:text-white">
                            {copiedKey === 'f_name' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-slate-400 font-sans">Protocol</td>
                        <td className="p-2.5 font-bold text-indigo-300">TCP (or TCP/UDP)</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => handleCopy('f_proto', 'TCP')} className="text-slate-400 hover:text-white">
                            {copiedKey === 'f_proto' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-slate-400 font-sans">Internal / Target IP</td>
                        <td className="p-2.5 font-bold text-emerald-300">{localIp}</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => handleCopy('f_ip', localIp)} className="text-slate-400 hover:text-white">
                            {copiedKey === 'f_ip' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-slate-400 font-sans">Internal Port</td>
                        <td className="p-2.5 font-bold text-amber-300">{port}</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => handleCopy('f_iport', port.toString())} className="text-slate-400 hover:text-white">
                            {copiedKey === 'f_iport' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-slate-400 font-sans">External / WAN Port</td>
                        <td className="p-2.5 font-bold text-amber-300">{port}</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => handleCopy('f_eport', port.toString())} className="text-slate-400 hover:text-white">
                            {copiedKey === 'f_eport' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Windows Firewall Instruction */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span>Windows Inbound Firewall Rule</span>
                </div>
                <p className="text-xs text-slate-400">
                  By default, Windows blocks incoming connections from other networks. Run the automated batch script:
                </p>
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-lg font-mono text-xs text-cyan-300">
                  <span>enable-firewall.bat (Right-click &gt; Run as Administrator)</span>
                  <button
                    onClick={() => handleCopy('fw_batch', 'enable-firewall.bat')}
                    className="text-slate-400 hover:text-white ml-2"
                  >
                    {copiedKey === 'fw_batch' ? <Check className="w-3.5 h-3.5 text-emerald-400 inline" /> : <Copy className="w-3.5 h-3.5 inline" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACCESS PIN & SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                {networkInfo?.hasPin ? (
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-white text-xs">
                    {networkInfo?.hasPin ? 'WAN Protection Active' : 'Off-Network Access Unprotected'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {networkInfo?.hasPin
                      ? 'A security PIN is set. Anyone accessing PC Sentinel from cellular data or outside networks must enter this PIN before diagnostic telemetry is displayed.'
                      : 'We recommend setting a 4-8 digit Security PIN to prevent automated web crawlers from reading your hardware logs.'}
                  </p>
                </div>
              </div>

              {pinStatusMsg && (
                <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  pinStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {pinStatusMsg.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{pinStatusMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleSavePin} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
                  {networkInfo?.hasPin ? 'Change or Remove Security PIN' : 'Set New Security PIN'}
                </h4>

                {networkInfo?.hasPin && !networkInfo?.isLocalRequest && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Current PIN</label>
                    <input
                      type="password"
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value)}
                      placeholder="Enter current PIN"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block">
                    {networkInfo?.hasPin ? 'New PIN (Leave blank to remove PIN)' : 'Enter PIN (e.g. 4-8 digits)'}
                  </label>
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={networkInfo?.hasPin ? 'Leave blank to disable PIN protection' : 'e.g. 7492'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono tracking-widest"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="allowBypass"
                    checked={allowBypass}
                    onChange={(e) => setAllowBypass(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                  />
                  <label htmlFor="allowBypass" className="text-xs text-slate-300 cursor-pointer">
                    Auto-bypass PIN when browsing from this PC (localhost)
                  </label>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingPin}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {isSavingPin ? 'Saving...' : (networkInfo?.hasPin ? 'Update PIN Settings' : 'Enable PIN Protection')}
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
            <span>Host IP: {localIp}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
