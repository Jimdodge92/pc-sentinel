import React from 'react';
import { Monitor, HardDrive, CheckCircle2, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';

export default function HardwareStatusCard({ deviceStatus, storageData, systemSummary }) {
  // Normalize arrays
  const toList = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object' && Object.keys(v).length > 0) return [v];
    return [];
  };

  const gpus = toList(deviceStatus?.GPUs);
  const problemDevices = toList(deviceStatus?.ProblemDevices);
  const disks = toList(storageData?.Disks);
  const volumes = toList(storageData?.Volumes);

  return (
    <div className="space-y-6">
      {/* 1. Hardware Problem Device Alert (e.g. unseated GPU or Code 43/45) */}
      {problemDevices.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm uppercase tracking-wider mb-2">
            <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
            <span>Hardware Attention Required ({problemDevices.length} Device Problem)</span>
          </div>
          <p className="text-xs text-slate-300 mb-3">
            Windows Device Manager has reported an error status on the following hardware:
          </p>
          <div className="space-y-2">
            {problemDevices.map((dev, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3 rounded-lg border border-rose-500/20 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{dev.Name || dev.Description || 'Unknown Device'}</span>
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                    Problem Code {dev.ErrorCode}
                  </span>
                </div>
                <p className="text-slate-400 mt-1 text-[11px] font-mono">{dev.DeviceID}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Graphics Card / GPU Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Monitor className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Graphics & Displays</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">{gpus.length} Adapter(s)</span>
        </div>

        <div className="space-y-3">
          {gpus.length === 0 ? (
            <p className="text-xs text-slate-400">Querying graphics adapters...</p>
          ) : (
            gpus.map((gpu, idx) => (
              <div key={idx} className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">{gpu.Name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    gpu.Status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {gpu.Status || 'Active'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[11px]">
                  <span>Driver: <strong className="text-slate-300 font-mono">{gpu.DriverVersion || 'Standard'}</strong></span>
                  {gpu.CurrentHorizontalResolution && (
                    <span>Display: <strong className="text-slate-300 font-mono">{gpu.CurrentHorizontalResolution}x{gpu.CurrentVerticalResolution} @ {gpu.CurrentRefreshRate}Hz</strong></span>
                  )}
                  {gpu.AdapterRAM > 0 && (
                    <span>VRAM: <strong className="text-slate-300 font-mono">{gpu.AdapterRAM} GB</strong></span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Storage Drives & Health Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <HardDrive className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Physical Storage & Volumes</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">{disks.length} Disk(s)</span>
        </div>

        <div className="space-y-3">
          {disks.map((disk, idx) => (
            <div key={idx} className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">{disk.FriendlyName || 'Storage Drive'}</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {disk.HealthStatus || 'Healthy'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[11px]">
                <span>Type: <strong className="text-slate-300">{disk.MediaType || 'SSD'} ({disk.BusType || 'NVMe'})</strong></span>
                <span>Capacity: <strong className="text-slate-300 font-mono">{disk.SizeGB || 0} GB</strong></span>
                {disk.ReadErrorsTotal !== undefined && (
                  <span>Read Errors: <strong className={disk.ReadErrorsTotal > 0 ? 'text-rose-400' : 'text-slate-300'}>{disk.ReadErrorsTotal}</strong></span>
                )}
              </div>
            </div>
          ))}

          {/* Volume Free Space */}
          {volumes.filter(v => v.SizeGB > 0).map((vol, idx) => (
            <div key={idx} className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Drive ({vol.DriveLetter}:)</span>
                <span className="font-mono text-slate-400">{vol.SizeRemainingGB} GB free of {vol.SizeGB} GB ({vol.PercentFree}%)</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    vol.PercentFree < 10 ? 'bg-rose-500' : vol.PercentFree < 20 ? 'bg-amber-500' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${100 - vol.PercentFree}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
