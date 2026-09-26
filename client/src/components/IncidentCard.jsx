import React from 'react';
import {
  AlertCircle, AlertTriangle, Info, ChevronRight,
  Power, Monitor, ShieldAlert, Cpu, HardDrive, FileText,
  Wifi, Server, Layers, ShieldCheck, Usb
} from 'lucide-react';

export default function IncidentCard({ incident, onSelect }) {
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'power': return <Power className="w-4 h-4 text-rose-400" />;
      case 'gpu': return <Monitor className="w-4 h-4 text-purple-400" />;
      case 'bsod': return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'thermal': return <Cpu className="w-4 h-4 text-amber-400" />;
      case 'storage': return <HardDrive className="w-4 h-4 text-cyan-400" />;
      case 'hardware': return <Usb className="w-4 h-4 text-indigo-400" />;
      case 'app': return <Layers className="w-4 h-4 text-emerald-400" />;
      case 'system': return <Server className="w-4 h-4 text-blue-400" />;
      case 'network': return <Wifi className="w-4 h-4 text-sky-400" />;
      case 'security': return <ShieldCheck className="w-4 h-4 text-teal-400" />;
      case 'memory': return <Cpu className="w-4 h-4 text-blue-400" />;
      default: return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSeverityBorder = (sev) => {
    if (sev === 'critical') return 'border-l-rose-500 hover:border-rose-500/50';
    if (sev === 'warning') return 'border-l-amber-500 hover:border-amber-500/50';
    return 'border-l-slate-700 hover:border-slate-500/50';
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'critical') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
          Critical
        </span>
      );
    }
    if (sev === 'warning') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Warning
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
        Info
      </span>
    );
  };

  const formatRelativeTime = (isoString) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 30) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  return (
    <div
      id={`incident-${incident.id}`}
      onClick={() => onSelect(incident)}
      className={`bg-slate-900/70 border border-slate-800 border-l-4 rounded-xl p-4 transition-all duration-200 cursor-pointer hover:bg-slate-850/80 hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between gap-3 ${getSeverityBorder(
        incident.severity
      )}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-slate-800/80 border border-slate-700/60">
              {getCategoryIcon(incident.category)}
            </div>
            {getSeverityBadge(incident.severity)}
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
              {incident.category}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {formatRelativeTime(incident.timestamp)}
          </span>
        </div>

        <h3 className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover:text-cyan-400 transition-colors">
          {incident.title}
        </h3>

        <p className="text-xs text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
          {incident.description}
        </p>

        {incident.likelyCauses && incident.likelyCauses.length > 0 && incident.severity !== 'info' && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-amber-400 font-medium shrink-0">Likely cause:</span>
            <span className="truncate text-slate-300">{incident.likelyCauses[0]}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
        <span className="text-slate-400 font-mono text-[11px]">
          {new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-cyan-400 font-medium flex items-center gap-1 group-hover:translate-x-1 transition-transform">
          {incident.severity === 'info' ? 'View Event Details' : 'View Diagnosis & Fix'} <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
