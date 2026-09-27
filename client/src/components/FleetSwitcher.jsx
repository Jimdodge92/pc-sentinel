import React, { useState, useRef, useEffect } from 'react';
import {
  Laptop, ChevronDown, Check, Plus, Settings, Monitor,
  Wifi, ShieldCheck, ShieldAlert, AlertTriangle, Cloud, ExternalLink
} from 'lucide-react';

export default function FleetSwitcher({
  fleet = [],
  activeDevice,
  onSelectDevice,
  onOpenAddDevice,
  onOpenFleetSettings,
  isNativeApp
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusDot = (device) => {
    if (device.isOffline) return 'bg-slate-500';
    if (device.status === 'critical') return 'bg-rose-400 animate-pulse';
    if (device.status === 'warning') return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const displayName = activeDevice?.name || (fleet.length === 0 ? 'Pair a PC' : 'Select PC');

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Device Switcher Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 hover:border-cyan-500/50 text-white font-medium text-xs transition-all active:scale-95 shadow-md group cursor-pointer"
        title="Switch active PC or add another laptop to fleet"
      >
        <div className="relative flex items-center justify-center">
          <Laptop className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusDot(activeDevice || {})} ring-2 ring-slate-900`} />
        </div>
        
        <span className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors max-w-[120px] sm:max-w-[160px] truncate">
          {displayName}
        </span>

        <span className="text-[10px] text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40 hidden sm:inline-block">
          {fleet.length} {fleet.length === 1 ? 'PC' : 'PCs'}
        </span>

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl shadow-cyan-950/50 backdrop-blur-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
              Monitored Fleet ({fleet.length})
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">
              Multi-Device Sync
            </span>
          </div>

          {/* List of Devices */}
          <div className="p-1.5 max-h-60 overflow-y-auto space-y-1">
            {fleet.map((device) => {
              const isSelected = activeDevice && activeDevice.id === device.id;
              return (
                <button
                  key={device.id}
                  onClick={() => {
                    onSelectDevice(device);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-950/60 border border-cyan-500/40 text-white'
                      : 'hover:bg-slate-800/60 border border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                        <Monitor className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusDot(device)} ring-2 ring-slate-900`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs truncate">
                          {device.name}
                        </span>
                        {device.isDefault && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {device.hostUrl ? device.hostUrl.replace('http://', '') : (device.id || 'Cloud Relay')}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Footer */}
          <div className="p-2 bg-slate-950/80 border-t border-slate-800 space-y-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenAddDevice();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Add PC / Laptop to Fleet</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenFleetSettings();
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <Settings className="w-3 h-3" />
              <span>Manage Monitored Devices</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
