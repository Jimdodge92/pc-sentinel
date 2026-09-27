import React, { useState, useEffect } from 'react';
import { X, Server, Wifi, Globe, Check, AlertCircle, RefreshCw, Zap, ArrowRight } from 'lucide-react';
import { getApiBase } from '../App';

export default function HostConfigModal({ isOpen, onClose, onHostChanged }) {
  const [currentHost, setCurrentHost] = useState('');
  const [inputHost, setInputHost] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const LAN_HOST = 'http://192.168.4.39:3500';
  const WAN_HOST = 'http://173.18.4.217:3500';

  useEffect(() => {
    if (isOpen) {
      const active = getApiBase() || LAN_HOST;
      setCurrentHost(active);
      setInputHost(active);
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testConnection = async (hostToTest) => {
    const target = (hostToTest || inputHost).trim().replace(/\/+$/, '');
    if (!target) return;
    setTesting(true);
    setTestResult(null);

    const startTime = performance.now();
    try {
      const res = await fetch(`${target}/api/health`, {
        signal: AbortSignal.timeout(3500)
      });
      const latency = Math.round(performance.now() - startTime);

      if (res.ok) {
        const json = await res.json();
        setTestResult({
          success: true,
          latency,
          message: `Connected! Response in ${latency}ms (${json.device || "PC Sentinel Server"})`
        });
      } else {
        setTestResult({
          success: false,
          message: `Server returned HTTP ${res.status}`
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.name === 'TimeoutError' ? 'Connection timed out (host unreachable)' : 'Unable to reach host. Check network or IP.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSelectPreset = (presetUrl) => {
    setInputHost(presetUrl);
    testConnection(presetUrl);
  };

  const handleSave = () => {
    const finalHost = inputHost.trim().replace(/\/+$/, '');
    if (!finalHost) return;
    localStorage.setItem('sentinel_host_url', finalHost);
    setCurrentHost(finalHost);
    if (onHostChanged) {
      onHostChanged(finalHost);
    }
    onClose();
  };

  const handleAutoDetect = async () => {
    setTesting(true);
    setTestResult(null);

    // Test LAN first, then WAN in parallel
    const candidates = [LAN_HOST, WAN_HOST];
    let detected = null;

    for (const host of candidates) {
      try {
        const start = performance.now();
        const res = await fetch(`${host}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const lat = Math.round(performance.now() - start);
          detected = { host, latency: lat };
          break;
        }
      } catch (e) {
        // Try next
      }
    }

    setTesting(false);
    if (detected) {
      setInputHost(detected.host);
      setTestResult({
        success: true,
        latency: detected.latency,
        message: `Auto-detected working host: ${detected.host} (${detected.latency}ms)`
      });
    } else {
      setTestResult({
        success: false,
        message: 'Could not automatically reach ThinkPad on LAN or WAN. Check Wi-Fi or enter IP manually.'
      });
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                ThinkPad Connection Settings
              </h2>
              <p className="text-[11px] text-slate-400">Configure PC Sentinel server host IP</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-xs text-slate-300">
          {/* Quick Select Presets */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Host Presets
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectPreset(LAN_HOST)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  inputHost === LAN_HOST
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-sm shadow-cyan-950/50'
                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    Home Wi-Fi (LAN)
                  </span>
                  {inputHost === LAN_HOST && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <span className="font-mono text-[10px] text-slate-400">{LAN_HOST}</span>
                <span className="text-[10px] text-slate-400">Use when your phone is on the same home Wi-Fi</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset(WAN_HOST)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  inputHost === WAN_HOST
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-sm shadow-cyan-950/50'
                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    Away from Home (WAN)
                  </span>
                  {inputHost === WAN_HOST && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <span className="font-mono text-[10px] text-slate-400">{WAN_HOST}</span>
                <span className="text-[10px] text-slate-400">Use over Cellular (5G/LTE) or outside Wi-Fi</span>
              </button>
            </div>
          </div>

          {/* Custom Host Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Server URL
              </label>
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={testing}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Auto-Detect</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputHost}
                onChange={(e) => setInputHost(e.target.value)}
                placeholder="http://192.168.4.39:3500"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => testConnection()}
                disabled={testing || !inputHost.trim()}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{testing ? 'Testing...' : 'Test'}</span>
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-[11px] leading-relaxed ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!inputHost.trim()}
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>Save & Connect</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
