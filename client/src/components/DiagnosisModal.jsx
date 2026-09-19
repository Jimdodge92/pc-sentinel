import React, { useState } from 'react';
import {
  X, CheckCircle2, AlertCircle, AlertTriangle, Info,
  ChevronDown, ChevronUp, Copy, Check, Wrench, FileText,
  HelpCircle, Monitor, Power, HardDrive, Cpu, ShieldAlert
} from 'lucide-react';

export default function DiagnosisModal({ incident, onClose }) {
  const [completedSteps, setCompletedSteps] = useState({});
  const [showTechnical, setShowTechnical] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!incident) return null;

  const toggleStep = (index) => {
    setCompletedSteps(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const copyDiagnosis = () => {
    const text = `[PC Sentinel Diagnostic Report]
Title: ${incident.title}
Severity: ${incident.severity.toUpperCase()}
Category: ${incident.category}
Timestamp: ${incident.timestamp}

WHAT HAPPENED:
${incident.description}

LIKELY CAUSES:
${incident.likelyCauses?.map(c => `• ${c}`).join('\n')}

RECOMMENDED FIXES:
${incident.remediationSteps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'power': return <Power className="w-5 h-5 text-rose-400" />;
      case 'gpu': return <Monitor className="w-5 h-5 text-purple-400" />;
      case 'bsod': return <ShieldAlert className="w-5 h-5 text-rose-400" />;
      case 'thermal': return <Cpu className="w-5 h-5 text-amber-400" />;
      case 'storage': return <HardDrive className="w-5 h-5 text-cyan-400" />;
      case 'memory': return <Cpu className="w-5 h-5 text-blue-400" />;
      default: return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'critical') {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          Critical Incident
        </span>
      );
    }
    if (sev === 'warning') {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Warning
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
        <Info className="w-3.5 h-3.5 text-slate-400" />
        Informational
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700">
                {getCategoryIcon(incident.category)}
              </div>
              {getSeverityBadge(incident.severity)}
              <span className="text-xs font-mono text-slate-400">
                {new Date(incident.timestamp).toLocaleString()}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              {incident.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyDiagnosis}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
              title="Copy diagnosis report"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* 1. What Happened */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm uppercase tracking-wider mb-2">
              <HelpCircle className="w-4 h-4" />
              <span>What Happened</span>
            </div>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">
              {incident.description}
            </p>
          </div>

          {/* 2. Why It Happened (Root Causes) */}
          {incident.likelyCauses && incident.likelyCauses.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider mb-3">
                <AlertTriangle className="w-4 h-4" />
                <span>Why It Happened (Likely Causes)</span>
              </div>
              <ul className="space-y-2.5">
                {incident.likelyCauses.map((cause, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                    <span>{cause}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Recommended Fix Steps (Checklist) */}
          {incident.remediationSteps && incident.remediationSteps.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                  <Wrench className="w-4 h-4" />
                  <span>Recommended Fix Steps</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {Object.values(completedSteps).filter(Boolean).length} / {incident.remediationSteps.length} done
                </span>
              </div>
              <div className="space-y-2.5">
                {incident.remediationSteps.map((step, idx) => {
                  const isDone = !!completedSteps[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleStep(idx)}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-800/50 text-slate-400 line-through'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 ${
                          isDone ? 'bg-emerald-500 text-slate-950' : 'border border-slate-600 bg-slate-800'
                        }`}
                      >
                        {isDone && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                      </button>
                      <span className="text-sm select-none leading-snug">{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Technical Telemetry Details (Collapsible) */}
          {incident.technicalDetails && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowTechnical(!showTechnical)}
                className="w-full px-5 py-3.5 bg-slate-900/80 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Technical Diagnostics & Raw Event Telemetry</span>
                </div>
                {showTechnical ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showTechnical && (
                <div className="p-4 bg-black/50 font-mono text-xs text-cyan-300/90 overflow-x-auto border-t border-slate-800">
                  <pre>{JSON.stringify(incident.technicalDetails, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors border border-slate-700"
          >
            Close Diagnosis
          </button>
        </div>
      </div>
    </div>
  );
}
