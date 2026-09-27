import React, { useState } from 'react';
import {
  X, Laptop, Server, QrCode, Search, Check, AlertCircle,
  RefreshCw, Plus, ArrowRight, ShieldCheck, Zap
} from 'lucide-react';
import { universalFetch } from '../App';

export default function AddDeviceModal({ isOpen, onClose, onDeviceAdded }) {
  const [activeTab, setActiveTab] = useState('ip'); // 'ip' | 'code'
  const [hostInput, setHostInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    let target = hostInput.trim().replace(/\/+$/, '');
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    // Default port if omitted
    if (!target.match(/:\d+$/)) {
      target = `${target}:3500`;
    }

    setTesting(true);
    setTestResult(null);

    const start = performance.now();
    try {
      const res = await universalFetch(`${target}/api/device/info`, {
        signal: AbortSignal.timeout(3500)
      });
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        const info = await res.json();
        setTestResult({
          success: true,
          latency,
          deviceInfo: info,
          message: `Connected in ${latency}ms!`
        });

        // Pre-fill name if user hasn't typed one
        if (!nameInput.trim()) {
          setNameInput(info.deviceName || 'PC Sentinel Machine');
        }
      } else {
        setTestResult({
          success: false,
          message: `Host responded with HTTP ${res.status}`
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.name === 'TimeoutError'
          ? 'Connection timed out. Check that PC Sentinel is running on port 3500.'
          : 'Could not reach host. Verify IP address or Wi-Fi network.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    let target = hostInput.trim().replace(/\/+$/, '');
    if (target && !target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    if (target && !target.match(/:\d+$/)) {
      target = `${target}:3500`;
    }

    const deviceId = testResult?.deviceInfo?.deviceId || pairingCodeInput.trim() || `SENT-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalName = nameInput.trim() || testResult?.deviceInfo?.deviceName || 'Monitored PC';

    const newDevice = {
      id: deviceId,
      name: finalName,
      hostUrl: target || '',
      lanIps: testResult?.deviceInfo?.localIp ? [testResult.deviceInfo.localIp] : [],
      status: testResult?.deviceInfo?.overallHealth?.status || 'healthy',
      isOffline: !testResult?.success,
      lastSeen: new Date().toISOString()
    };

    onDeviceAdded(newDevice);
    onClose();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Add PC / Laptop to Fleet
              </h2>
              <p className="text-xs text-slate-400">Monitor another machine simultaneously in PC Sentinel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-slate-200 text-xs">
          {/* Quick presets or instructions */}
          <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
            <p className="text-[11px] text-slate-300">
              Install <strong>PC Sentinel</strong> on your other laptop (Alienware, desktop, or family PC), then enter its local IP or device pairing code below.
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                PC IP Address or Hostname
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hostInput}
                  onChange={(e) => setHostInput(e.target.value)}
                  placeholder="e.g. 192.168.4.45 or alienware-m16"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-white font-mono text-xs placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !hostInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? 'Testing...' : 'Test'}</span>
                </button>
              </div>
            </div>

            {/* Test Connection Banner */}
            {testResult && (
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 animate-in fade-in duration-150 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}>
                {testResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-xs">{testResult.message}</p>
                  {testResult.deviceInfo && (
                    <p className="text-[11px] text-slate-300 mt-1">
                      Detected: <span className="font-semibold text-white">{testResult.deviceInfo.deviceName}</span> ({testResult.deviceInfo.deviceId})
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Display Name (Nickname)
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Jim's Alienware m16, Living Room Rig"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-white text-xs placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hostInput.trim() && !nameInput.trim()}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>Add to Fleet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
