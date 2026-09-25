import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Globe, Wifi, Smartphone, ShieldCheck, ShieldAlert,
  Key, Copy, Check, ExternalLink, Terminal, AlertTriangle, RefreshCw
} from 'lucide-react';

export default function RemoteAccessModal({ onClose, networkInfo, onUpdateConfig }) {
  const [activeTab, setActiveTab] = useState('connect'); // 'connect' | 'router' | 'security'
  const [qrType, setQrType] = useState('remote'); // 'remote' | 'lan'
  const [copiedKey, setCopiedKey] = useState(null);

  // Security PIN form state
  const [pinInput, setPinInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [allowBypass, setAllowBypass] = useState(networkInfo?.allowLocalBypass ?? true);
  const [pinStatusMsg, setPinStatusMsg] = useState(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  useEffect(() => {
    if (networkInfo) {
      setAllowBypass(networkInfo.allowLocalBypass !== false);
    }
  }, [networkInfo]);

  const localIp = networkInfo?.localIp || '192.168.4.39';
  const publicIp = networkInfo?.publicIp || '173.18.4.217';
  const port = networkInfo?.port || 3500;

  const remoteUrl = `http://${publicIp}:${port}`;
  const lanUrl = `http://${localIp}:${port}`;
  const currentQrUrl = qrType === 'remote' ? remoteUrl : lanUrl;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Off-Network & Remote Access
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Port Forwarding
                </span>
              </h2>
              <p className="text-xs text-slate-400">Access your PC Sentinel diagnostic board anywhere via phone or laptop</p>
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
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('connect')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'connect'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Connect & QR Code
          </button>
          <button
            onClick={() => setActiveTab('router')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
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
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'security'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            Access PIN & Security
            {networkInfo?.hasPin ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="PIN active" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="No PIN set" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {/* TAB 1: CONNECT & QR CODE */}
          {activeTab === 'connect' && (
            <div className="space-y-6">
              {/* QR Code and Quick Links */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="p-3 bg-white rounded-xl shadow-lg shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={currentQrUrl}
                    size={140}
                    level="M"
                    includeMargin={false}
                  />
                  <span className="text-[10px] text-slate-600 font-mono mt-2 font-semibold">
                    {qrType === 'remote' ? 'Cellular / WAN' : 'Local Wi-Fi'}
                  </span>
                </div>

                <div className="space-y-3 flex-1 w-full text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="text-xs font-semibold text-slate-300">Scan mode:</span>
                    <button
                      onClick={() => setQrType('remote')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        qrType === 'remote'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Cellular / Off-Network (WAN)
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
                    Scan with your mobile camera to open the live diagnostics dashboard.
                    {qrType === 'remote' && ' (Requires your router port forwarding rule to be active).'}
                  </p>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-lg p-2 font-mono text-xs">
                      <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate flex-1 text-slate-200">{remoteUrl}</span>
                      <button
                        onClick={() => handleCopy('remoteUrl', remoteUrl)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 transition-colors"
                        title="Copy WAN link"
                      >
                        {copiedKey === 'remoteUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[11px]">{copiedKey === 'remoteUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-lg p-2 font-mono text-xs">
                      <Wifi className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="truncate flex-1 text-slate-300">{lanUrl}</span>
                      <button
                        onClick={() => handleCopy('lanUrl', lanUrl)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 transition-colors"
                        title="Copy LAN link"
                      >
                        {copiedKey === 'lanUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[11px]">{copiedKey === 'lanUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Checklist Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Remote Access Checklist
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Step 1: Firewall</span>
                    <span className="text-slate-200 font-medium">Windows Port 3500</span>
                    <p className="text-[11px] text-slate-400 mt-1">Run <code className="text-cyan-300 font-mono">enable-firewall.bat</code> as admin</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Step 2: Router</span>
                    <span className="text-slate-200 font-medium">Port Forward Rule</span>
                    <p className="text-[11px] text-slate-400 mt-1">Forward TCP 3500 to {localIp}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Step 3: Security</span>
                    <span className={`font-medium ${networkInfo?.hasPin ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {networkInfo?.hasPin ? 'PIN Enabled' : 'No PIN Set'}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {networkInfo?.hasPin ? 'Protected against WAN crawlers' : 'Set a PIN in the Security tab'}
                    </p>
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
                  <span className="text-[10px] text-slate-400 font-mono">Lenovo ThinkPad T15</span>
                </div>
                <p className="text-xs text-slate-400">
                  Log into your router's administration portal (usually <code className="text-cyan-300">192.168.1.1</code>, <code className="text-cyan-300">192.168.4.1</code>, or your router app like Eero/Google Home) and create this port forwarding rule:
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
                  By default, Windows blocks incoming connections from other networks. We have prepared an automated batch script in the project directory:
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
                      ? 'A security PIN is set. Anyone accessing PC Sentinel from cellular data or outside networks must enter this PIN before diagnostic telemetry and system specs are disclosed.'
                      : 'We strongly recommend setting a 4-8 digit Security PIN. Because port forwarding exposes port 3500 to the public internet, a PIN prevents automated web scanners or unauthorized users from reading your crash logs.'}
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
            <span>Server IP: {localIp}</span>
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
