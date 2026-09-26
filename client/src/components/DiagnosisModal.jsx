import React, { useState } from 'react';
import {
  X, CheckCircle2, AlertCircle, AlertTriangle, Info,
  ChevronDown, ChevronUp, Copy, Check, Wrench, FileText,
  HelpCircle, Monitor, Power, HardDrive, Cpu, ShieldAlert,
  ArrowRight, Sparkles, CheckSquare, CornerDownRight, RotateCcw
} from 'lucide-react';

export default function DiagnosisModal({ incident, onClose, onResolveIncident }) {
  const [completedSteps, setCompletedSteps] = useState({});
  const [stepResolutionState, setStepResolutionState] = useState({});
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedSuccess, setResolvedSuccess] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!incident) return null;

  const toggleStep = (index) => {
    const isCurrentlyDone = !!completedSteps[index];
    if (isCurrentlyDone) {
      // Uncheck step and collapse resolution verification
      setCompletedSteps(prev => ({ ...prev, [index]: false }));
      setStepResolutionState(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } else {
      // Check step and open secondary resolution prompt
      setCompletedSteps(prev => ({ ...prev, [index]: true }));
      setStepResolutionState(prev => ({ ...prev, [index]: 'asking' }));
    }
  };

  const handleSelectResolved = async (index, stepText) => {
    setIsResolving(true);
    setStepResolutionState(prev => ({ ...prev, [index]: 'resolved' }));

    if (onResolveIncident) {
      try {
        await onResolveIncident(incident.id, stepText);
        setResolvedSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1200);
      } catch (e) {
        console.error('Error resolving incident:', e);
        setIsResolving(false);
      }
    } else {
      setResolvedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    }
  };

  const handleSelectNeedAnother = (index) => {
    setStepResolutionState(prev => ({ ...prev, [index]: 'need_another' }));
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

  // Category-specific tertiary guidance
  const getTertiaryRecommendations = (cat, stepIdx) => {
    switch (cat) {
      case 'thermal':
        return [
          {
            title: 'Lenovo Vantage / BIOS Cooling Profile',
            desc: 'Open Lenovo Vantage, navigate to Device > Power, and switch Thermal Mode from "Extreme Performance" to "Intelligent Cooling" or "Cool & Quiet" to lower peak VRM/CPU power limits.'
          },
          {
            title: 'Windows System Cooling Policy',
            desc: 'Open Windows Control Panel > Power Options > Change plan settings > Advanced power settings > Processor power management > System cooling policy, and set both On Battery and Plugged In to "Active".'
          },
          {
            title: 'Intake Vent Clearance & Dust Evacuation',
            desc: 'Ensure the bottom intake vents have at least 1-inch clearance off your desk surface. Use short, pulsed bursts of compressed air into the side/rear copper exhaust fins to blow out compacted lint.'
          }
        ];
      case 'power':
        return [
          {
            title: 'Disable Windows Fast Startup',
            desc: 'Fast Startup can corrupt kernel sleep state files during hybrid shutdowns. Go to Control Panel > Power Options > "Choose what the power buttons do", click "Change settings that are currently unavailable", and uncheck "Turn on fast startup".'
          },
          {
            title: 'Update Intel Management Engine (MEI) & Power Firmware',
            desc: 'Outdated Intel MEI drivers cause sleep-to-wake kernel hangs and ACPI power-rail timeouts. Check Lenovo Vantage for the latest Intel ME / Chipset updates.'
          },
          {
            title: 'Verify AC Adapter & Battery Rail Health',
            desc: 'Check if abrupt shutdowns occur strictly on AC power, battery, or docking stations. Run Lenovo Vantage Battery Gauge Reset if charge readings fluctuate erratically.'
          }
        ];
      case 'gpu':
        return [
          {
            title: 'Clean Driver Installation (DDU)',
            desc: 'Boot into Windows Safe Mode, run Display Driver Uninstaller (DDU) to wipe residual registry hooks, and install the latest clean OEM/WHQL driver from Lenovo.'
          },
          {
            title: 'Disable Browser Hardware Acceleration',
            desc: 'If crashes occur when streaming video or switching tabs, toggle off "Use hardware acceleration when available" in Chrome/Edge settings.'
          }
        ];
      case 'bsod':
        return [
          {
            title: 'Run System File Checker (SFC)',
            desc: 'Open PowerShell as Administrator and run "sfc /scannow" followed by "DISM /Online /Cleanup-Image /RestoreHealth" to replace damaged system DLLs.'
          },
          {
            title: 'Windows Memory Diagnostic Tool',
            desc: 'Press Win + R, type "mdsched.exe", and select "Restart now and check for problems" to test physical RAM cells for parity faults.'
          }
        ];
      default:
        return [
          {
            title: 'Windows Component Store Integrity Check',
            desc: 'Open Administrator PowerShell and run "dism /online /cleanup-image /restorehealth" to ensure all Windows subsystems are synchronized.'
          },
          {
            title: 'Device Manager Hardware Audit',
            desc: 'Open Device Manager (devmgmt.msc) and scan for any devices marked with yellow alert icons indicating missing or halted drivers.'
          }
        ];
    }
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
          {/* Resolved Success Banner */}
          {resolvedSuccess && (
            <div className="bg-emerald-950/80 border border-emerald-500/80 rounded-xl p-4 flex items-center gap-3 text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-300 shadow-xl shadow-emerald-950/40">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-sm text-white">Incident Permanently Resolved</h4>
                <p className="text-xs text-emerald-300/90 mt-0.5">
                  This event has been cleared from active diagnostics. It will not reappear on rescans unless a new incident of this type occurs.
                </p>
              </div>
            </div>
          )}

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

          {/* 3. Recommended Fix Steps (Checklist with Secondary & Tertiary Flow) */}
          {incident.remediationSteps && incident.remediationSteps.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                  <Wrench className="w-4 h-4" />
                  <span>Recommended Fix Steps</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {Object.values(completedSteps).filter(Boolean).length} / {incident.remediationSteps.length} checked
                </span>
              </div>
              <div className="space-y-3">
                {incident.remediationSteps.map((step, idx) => {
                  const isDone = !!completedSteps[idx];
                  const resState = stepResolutionState[idx];

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isDone
                          ? 'bg-slate-900/90 border-slate-700/80 shadow-md'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 text-slate-200'
                      }`}
                    >
                      {/* Step Header / Checkbox row */}
                      <div
                        onClick={() => toggleStep(idx)}
                        className="flex items-start gap-3 p-3.5 cursor-pointer select-none"
                      >
                        <button
                          type="button"
                          className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 ${
                            isDone
                              ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm shadow-emerald-500/30'
                              : 'border border-slate-600 bg-slate-800 hover:border-slate-500'
                          }`}
                        >
                          {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm leading-snug font-medium ${isDone ? 'text-slate-200' : 'text-slate-300'}`}>
                            {step}
                          </span>
                        </div>
                      </div>

                      {/* SECONDARY BOX: Appears when step checkbox is checked */}
                      {isDone && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-800/80 bg-slate-950/60 animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Did this recommendation resolve the issue?</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Option 1: Yes, resolved */}
                            <button
                              type="button"
                              onClick={() => handleSelectResolved(idx, step)}
                              disabled={isResolving}
                              className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 group ${
                                resState === 'resolved'
                                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500'
                                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-700/80 hover:border-emerald-500/50 text-slate-200'
                              }`}
                            >
                              <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                                  Yes, this resolved the issue
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                                  Permanently clears this incident. Will not reappear on rescans.
                                </p>
                              </div>
                            </button>

                            {/* Option 2: No, need another recommendation */}
                            <button
                              type="button"
                              onClick={() => handleSelectNeedAnother(idx)}
                              disabled={isResolving}
                              className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 group ${
                                resState === 'need_another'
                                  ? 'bg-amber-950/40 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-700/80 hover:border-amber-500/50 text-slate-200'
                              }`}
                            >
                              <div className="p-1 rounded bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                                <ArrowRight className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                                  No, need another recommendation
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                                  Keep incident active and view advanced diagnostic guidance.
                                </p>
                              </div>
                            </button>
                          </div>

                          {/* TERTIARY BOX: Appears if "No, need another recommendation" is selected */}
                          {resState === 'need_another' && (
                            <div className="mt-3 p-4 bg-amber-950/20 border border-amber-500/40 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                                  <span>Advanced Diagnostic Guidance & Alternative Steps</span>
                                </div>
                                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60">
                                  Tertiary Options
                                </span>
                              </div>

                              <p className="text-xs text-slate-300 leading-relaxed">
                                Since step #{idx + 1} did not fully alleviate the symptoms, continue with the following targeted secondary interventions:
                              </p>

                              <div className="space-y-2 pt-1">
                                {getTertiaryRecommendations(incident.category, idx).map((rec, rIdx) => (
                                  <div key={rIdx} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                                    <div className="font-bold text-amber-200 flex items-center gap-1.5">
                                      <CornerDownRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>{rec.title}</span>
                                    </div>
                                    <p className="text-slate-400 mt-1 pl-5 text-[11px] leading-relaxed">
                                      {rec.desc}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {idx + 1 < incident.remediationSteps.length && (
                                <div className="mt-2 p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between gap-3 text-xs">
                                  <span className="text-cyan-200 text-[11px]">
                                    👉 <strong>Next Fix Available:</strong> Check Step #{idx + 2} above: <em>"{incident.remediationSteps[idx + 1].slice(0, 50)}..."</em>
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-between items-center">
          <span className="text-[11px] text-slate-500 font-mono">
            ID: {incident.id}
          </span>
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
