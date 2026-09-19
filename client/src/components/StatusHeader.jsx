import React from 'react';
import { Activity, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle, Monitor, Cpu, Clock } from 'lucide-react';

export default function StatusHeader({ overallHealth, systemSummary, loading, onRefresh, lastScanTime }) {
  const getStatusBadge = () => {
    if (!overallHealth) return null;
    const status = overallHealth.status;

    if (status === 'critical') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-medium text-sm">
          <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
          <span>{overallHealth.label || 'Attention Needed'}</span>
        </div>
      );
    }
    if (status === 'warning') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>{overallHealth.label || 'Minor Warnings Detected'}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium text-sm">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>{overallHealth.label || 'All Systems Healthy'}</span>
      </div>
    );
  };

  return (
    <header className="border-b border-slate-800 bg-[#0c1220]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Title & Brand */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                PC SENTINEL
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Diagnostics
                </span>
              </h1>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Intelligent Windows Hardware, Crash & Shutdown Telemetry
            </p>
          </div>
        </div>

        {/* System Quick Specs & Scan Button */}
        <div className="flex items-center flex-wrap gap-3 w-full md:w-auto justify-between md:justify-end">
          {systemSummary && (
            <div className="hidden lg:flex items-center gap-4 text-xs text-slate-300 bg-slate-900/80 px-3.5 py-2 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5" title={systemSummary.Processor}>
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-mono truncate max-w-[140px]">{systemSummary.Processor?.split('@')[0] || 'CPU'}</span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Up: {systemSummary.UptimeHours || 0}h</span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono">{systemSummary.ComputerName || 'PC'}</span>
              </div>
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-xs tracking-wide transition-all shadow-md ${
              loading
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Analyzing Telemetry...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
