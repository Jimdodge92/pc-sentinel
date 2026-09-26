import React, { useState, useEffect } from 'react';
import {
  X, Cpu, RefreshCw, AlertCircle, HardDrive,
  Activity, CheckCircle2, ChevronRight, Layers, ExternalLink
} from 'lucide-react';

export default function MemoryDetailsModal({ isOpen, onClose, systemSummary }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTopProcesses = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/system/top-memory?top=5');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch top memory processes:', err);
      setError('Unable to sample running processes. Ensure PC Sentinel server is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTopProcesses();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const topProcesses = data?.topProcesses || [];
  const totalRamGB = systemSummary?.TotalRAMGB || data?.totalRamGB || 16;
  const usedRamGB = systemSummary?.UsedRAMGB || 0;
  const freeRamGB = systemSummary?.FreeRAMGB || 0;
  const ramUsagePercent = systemSummary?.RAMUsagePercent || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                System Memory (RAM) Analysis
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/80 font-bold uppercase tracking-wider">
                  Top 5 Apps
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live inspection of physical memory utilization & heaviest consumers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* 1. Overall System RAM Bar */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                Physical RAM Consumption
              </span>
              <span className="font-mono text-cyan-300 font-bold text-sm">
                {usedRamGB} GB / {totalRamGB} GB ({ramUsagePercent}%)
              </span>
            </div>

            {/* RAM Progress Bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  ramUsagePercent > 85 ? 'bg-rose-500' :
                  ramUsagePercent > 70 ? 'bg-amber-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(ramUsagePercent, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Free: <strong className="text-emerald-400 font-mono">{freeRamGB} GB</strong> available</span>
              <span>Hardware Form Factor: <strong className="text-slate-300">{systemSummary?.FormFactor || 'ThinkPad Laptop'}</strong></span>
            </div>
          </div>

          {/* 2. Top 5 Memory Consumers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-400" />
                Top 5 Highest Memory Consumption Programs
              </h3>
              <span className="text-[11px] text-slate-500">Sorted by Working Set RAM</span>
            </div>

            {loading ? (
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-8 text-center text-slate-400 space-y-2">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Sampling system memory usage across active processes...</p>
              </div>
            ) : error ? (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-4 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            ) : topProcesses.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-6 text-center text-slate-400 text-xs">
                No active user processes currently consuming &gt;10 MB RAM.
              </div>
            ) : (
              <div className="space-y-2">
                {topProcesses.map((proc, idx) => (
                  <div
                    key={proc.Id || idx}
                    className="bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between gap-4 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-xs truncate">
                            {proc.Description || proc.ProcessName}
                          </h4>
                          {proc.Description && proc.Description !== proc.ProcessName && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({proc.ProcessName}.exe)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                          <span>PID: <strong className="text-slate-300 font-mono">{proc.Id}</strong></span>
                          {proc.CPUSeconds > 0 && (
                            <span>CPU Time: <strong className="text-slate-300 font-mono">{proc.CPUSeconds}s</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-extrabold text-cyan-300 text-sm">
                        {proc.MemoryMB >= 1024 ? `${proc.MemoryGB} GB` : `${proc.MemoryMB} MB`}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-400 h-full rounded-full"
                            style={{ width: `${Math.min(proc.MemoryPercent * 5, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-semibold">
                          {proc.MemoryPercent}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Memory Optimization Insight */}
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 text-xs text-slate-300 space-y-1.5">
            <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              Memory Health Insights
            </h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Windows maintains high responsiveness by utilizing unused RAM for caching and <strong className="text-slate-300 font-medium">Memory Compression</strong>. If RAM usage exceeds 85%, closing unused browser tabs or stopping background processes will immediately release headroom.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <button
            onClick={fetchTopProcesses}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Processes</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
