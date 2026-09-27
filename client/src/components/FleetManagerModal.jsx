import React, { useState } from 'react';
import {
  X, Laptop, Trash2, Edit2, Check, Star, Plus, Server,
  ShieldCheck, AlertTriangle, Monitor, ExternalLink
} from 'lucide-react';

export default function FleetManagerModal({
  isOpen,
  onClose,
  fleet = [],
  activeDevice,
  onUpdateFleet,
  onSelectDevice,
  onOpenAddDevice
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (device) => {
    setEditingId(device.id);
    setEditName(device.name);
  };

  const handleSaveEdit = (deviceId) => {
    if (!editName.trim()) return;
    const updated = fleet.map(d => d.id === deviceId ? { ...d, name: editName.trim() } : d);
    onUpdateFleet(updated);
    setEditingId(null);
  };

  const handleSetPrimary = (deviceId) => {
    const updated = fleet.map(d => ({
      ...d,
      isDefault: d.id === deviceId
    }));
    onUpdateFleet(updated);
  };

  const handleRemoveDevice = (deviceId) => {
    if (fleet.length <= 1) {
      alert('You must have at least one monitored PC in your fleet.');
      return;
    }
    const target = fleet.find(d => d.id === deviceId);
    if (!confirm(`Are you sure you want to remove "${target?.name || 'this PC'}" from your fleet?`)) return;

    const updated = fleet.filter(d => d.id !== deviceId);
    onUpdateFleet(updated);

    if (activeDevice && activeDevice.id === deviceId) {
      onSelectDevice(updated[0]);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Manage Monitored PC Fleet
              </h2>
              <p className="text-xs text-slate-400">Configure multiple computers, nicknames, and default primary PC</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device List */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {fleet.map((device) => {
            const isActive = activeDevice && activeDevice.id === device.id;
            const isEditing = editingId === device.id;

            return (
              <div
                key={device.id}
                className={`p-4 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-slate-950/80 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <Laptop className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-500 text-white text-xs font-semibold focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(device.id)}
                            className="p-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">
                            {device.name}
                          </span>
                          <button
                            onClick={() => handleStartEdit(device)}
                            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                            title="Rename PC"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span className="truncate">{device.hostUrl || device.id}</span>
                        {device.isDefault && (
                          <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                            ★ Primary
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                            Active View
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelectDevice(device);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
                        title="Switch active dashboard to this PC"
                      >
                        Switch To
                      </button>
                    )}

                    {!device.isDefault && (
                      <button
                        onClick={() => handleSetPrimary(device.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Set as default primary PC"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleRemoveDevice(device.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Remove PC from fleet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onOpenAddDevice();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>Add Another PC</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
