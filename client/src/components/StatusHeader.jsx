import React from 'react';
import { Activity, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle, Monitor, Cpu, Clock, Laptop, Globe, Smartphone, ChevronRight } from 'lucide-react';

export default function StatusHeader({ overallHealth, systemSummary, loading, onRefresh, lastScanTime, onOpenRemoteAccess, isOffline, onJumpToIncident, onResetHome }) {
  const getStatusBadge = () => {
    if (isOffline) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-medium text-sm">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          <span>Host Offline (Cloud Vault)</span>
        </div>
      );
    }

    if (!overallHealth) return null;
    const status = overallHealth.status;

    if (status === 'critical') {
      return (
        <button
          onClick={onJumpToIncident}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 hover:border-rose-400 text-rose-300 hover:text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 shadow-sm group cursor-pointer"
          title="Click to jump directly to the latest critical incident"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse group-hover:scale-110 transition-transform" />
          <span>{overallHealth.label || 'Action Needed'}</span>
          <span className="text-[10px] bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800/80 text-rose-200">View</span>
          <ChevronRight className="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      );
    }
    if (status === 'warning') {
      return (
        <button
          onClick={onJumpToIncident}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 shadow-sm group cursor-pointer"
          title="Click to jump directly to the latest warning"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span>{overallHealth.label || 'Warnings Detected'}</span>
          <span className="text-[10px] bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80 text-amber-200">View</span>
          <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
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
        {/* Title & Brand (Click to return Home from any screen) */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={onResetHome}
            className="flex items-center gap-3.5 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-xl transition-all select-none -m-1.5 p-1.5 hover:bg-slate-900/60"
            title="Click to return to PC Sentinel Home screen"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20 group-hover:scale-105 group-hover:shadow-cyan-500/40 group-active:scale-95 transition-all shrink-0">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2 group-hover:text-cyan-300 transition-colors">
                  PC SENTINEL
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 group-hover:border-cyan-500/60 transition-colors">
                    Diagnostics
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 group-hover:text-slate-300 transition-colors">
                Intelligent Windows Hardware, Crash & Shutdown Telemetry
              </p>
            </div>
          </button>
          {getStatusBadge()}
        </div>

        {/* System Quick Specs & Scan Button */}
        <div className="flex items-center flex-wrap gap-3 w-full md:w-auto justify-between md:justify-end">
          {systemSummary && (
            <div className="hidden lg:flex items-center gap-3.5 text-xs text-slate-300 bg-slate-900/80 px-3.5 py-2 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-300 font-semibold" title={`${systemSummary.Manufacturer || ''} ${systemSummary.Model || ''}`}>
                <Laptop className="w-3.5 h-3.5 text-cyan-400" />
                <span>{systemSummary.SystemFamily || systemSummary.Model || 'ThinkPad'}</span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div className="flex items-center gap-1.5" title={systemSummary.Processor}>
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-mono truncate max-w-[130px]">{systemSummary.Processor?.split('@')[0] || 'CPU'}</span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Up: {systemSummary.UptimeHours || 0}h</span>
              </div>
            </div>
          )}

          <button
            onClick={onOpenRemoteAccess}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium text-xs tracking-wide bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/80 hover:to-blue-900/80 text-cyan-300 border border-cyan-500/40 transition-all active:scale-95 shadow-sm"
            title="Pair with Phone or Companion App"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Pair Phone</span>
          </button>

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
