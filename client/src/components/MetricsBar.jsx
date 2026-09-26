import React from 'react';
import { ShieldAlert, ShieldCheck, Power, HardDrive, Cpu, AlertTriangle } from 'lucide-react';

export default function MetricsBar({ overallHealth, incidents = [], systemSummary, storageData, onJumpToIncident }) {
  const criticalCount = incidents.filter(i => i.severity === 'critical').length;
  const warningCount = incidents.filter(i => i.severity === 'warning').length;
  const shutdownCrashes = incidents.filter(i => i.category === 'power' && i.severity === 'critical').length;

  // Storage summary
  const disks = storageData?.Disks;
  const diskList = Array.isArray(disks) ? disks : (disks && Object.keys(disks).length > 0 ? [disks] : []);
  const storageHealthy = diskList.length > 0 && diskList.every(d => (d.HealthStatus || '').toLowerCase() === 'healthy');

  const isClickable = (overallHealth?.status === 'critical' || overallHealth?.status === 'warning') && !!onJumpToIncident;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Health Status Card */}
      <div
        onClick={isClickable ? onJumpToIncident : undefined}
        className={`bg-slate-900/60 border rounded-xl p-4 flex flex-col justify-between relative overflow-hidden backdrop-blur-sm transition-all ${
          isClickable
            ? 'cursor-pointer hover:bg-slate-900/90 hover:border-rose-500/50 hover:shadow-lg hover:shadow-rose-950/20 active:scale-[0.99] border-slate-800/80 group'
            : 'border-slate-800/80'
        }`}
        title={isClickable ? "Click to view latest incident" : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Health Status</span>
          <div className={`p-2 rounded-lg transition-transform ${isClickable ? 'group-hover:scale-110' : ''} ${
            overallHealth?.status === 'critical' ? 'bg-rose-500/10 text-rose-400' :
            overallHealth?.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
            'bg-emerald-500/10 text-emerald-400'
          }`}>
            {overallHealth?.status === 'critical' ? <ShieldAlert className="w-5 h-5" /> :
             overallHealth?.status === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
             <ShieldCheck className="w-5 h-5" />}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white capitalize">{overallHealth?.label || 'Healthy'}</h3>
            {isClickable && (
              <span className="text-[11px] font-semibold text-rose-400 group-hover:translate-x-0.5 transition-transform flex items-center">
                Review &rarr;
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">
            {criticalCount > 0 ? `${criticalCount} critical incident(s) flagged` : `${warningCount} warning(s) logged`}
          </p>
        </div>
      </div>

      {/* 2. Unexpected Power / Crashes Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Abrupt Shutdowns</span>
          <div className={`p-2 rounded-lg ${shutdownCrashes > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
            <Power className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{shutdownCrashes}</span>
            <span className="text-xs text-slate-400">past 14 days</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {shutdownCrashes === 0 ? 'Zero abrupt power cuts logged' : 'Power cut without blue screen'}
          </p>
        </div>
      </div>

      {/* 3. Storage SMART Health */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Storage Health</span>
          <div className={`p-2 rounded-lg ${storageHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <HardDrive className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{storageHealthy ? '100% OK' : 'Checking'}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {diskList.length > 0 ? `${diskList[0].FriendlyName || 'SSD'} (${diskList[0].HealthStatus || 'OK'})` : 'SMART verified'}
          </p>
        </div>
      </div>

      {/* 4. Memory Utilization */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Memory (RAM)</span>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Cpu className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{systemSummary?.RAMUsagePercent || 0}%</span>
              <span className="text-xs text-slate-400">in use</span>
            </div>
            <span className="text-xs font-mono text-slate-400">{systemSummary?.UsedRAMGB || 0}/{systemSummary?.TotalRAMGB || 0} GB</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (systemSummary?.RAMUsagePercent || 0) > 85 ? 'bg-rose-500' :
                (systemSummary?.RAMUsagePercent || 0) > 70 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(systemSummary?.RAMUsagePercent || 0, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
