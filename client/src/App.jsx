import React, { useState, useEffect, useMemo } from 'react';
import StatusHeader from './components/StatusHeader';
import MetricsBar from './components/MetricsBar';
import IncidentCard from './components/IncidentCard';
import DiagnosisModal from './components/DiagnosisModal';
import HardwareStatusCard from './components/HardwareStatusCard';
import DevicePairingModal from './components/DevicePairingModal';
import MemoryDetailsModal from './components/MemoryDetailsModal';
import {
  Search, CheckCircle2, AlertCircle, Power, Lock,
  Smartphone, RefreshCw, Calendar, Trash2, Info,
  Flame, ZapOff, Radio, RotateCw
} from 'lucide-react';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Top Memory Processes Modal State
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);

  // Device Pairing & Modal State
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);

  // Cloud & Offline Detection State
  const [isOffline, setIsOffline] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  // Live SSE Stream & Shutdown Intent Tracking
  const [shutdownIntent, setShutdownIntent] = useState(() => {
    try {
      const stored = localStorage.getItem('sentinel_shutdown_intent');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && (Date.now() - new Date(parsed.timestamp).getTime() < 600000)) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectedToast, setReconnectedToast] = useState(null);

  // Security PIN State
  const [userPin, setUserPin] = useState(() => localStorage.getItem('pc_sentinel_pin') || '');
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Filters
  const [activeCategory, setActiveCategory] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [daysFilter, setDaysFilter] = useState(14);

  const fetchDeviceInfo = async () => {
    try {
      const res = await fetch('/api/device/info');
      if (res.ok) {
        const json = await res.json();
        setDeviceInfo(json);
        if (json.deviceId) {
          localStorage.setItem('sentinel_device_id', json.deviceId);
        }
        if (json.firebaseConfig?.projectId) {
          localStorage.setItem('sentinel_firebase_project', json.firebaseConfig.projectId);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch device info:', e);
    }
  };

  const fetchDiagnostics = async (forceRefresh = false, activePin = userPin) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/diagnostics?days=${daysFilter}${forceRefresh ? '&refresh=true' : ''}`;
      const headers = {};
      if (activePin) {
        headers['x-sentinel-pin'] = activePin;
      }

      let res;
      try {
        res = await fetch(url, { headers });
      } catch (networkErr) {
        console.warn('Local host unreachable, checking cloud / offline cache...', networkErr);

        // 1. Try Firebase Firestore Cloud Relay if configured
        const projectId = localStorage.getItem('sentinel_firebase_project') || deviceInfo?.firebaseConfig?.projectId;
        const deviceId = localStorage.getItem('sentinel_device_id') || deviceInfo?.deviceId;
        if (projectId && deviceId) {
          try {
            const fbRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices/${deviceId}`);
            if (fbRes.ok) {
              const fbDoc = await fbRes.json();
              const telemetryStr = fbDoc.fields?.telemetryJson?.stringValue;
              if (telemetryStr) {
                const parsed = JSON.parse(telemetryStr);
                localStorage.setItem('sentinel_offline_cache', JSON.stringify(parsed));
                const hbTime = parsed.scanTime;
                const ageMins = hbTime ? Math.max(1, Math.round((Date.now() - new Date(hbTime).getTime()) / 60000)) : 0;
                setIsOffline(true);
                setOfflineInfo({
                  lastHeartbeat: hbTime ? new Date(hbTime).toLocaleTimeString() : 'Prior to shutdown',
                  ageMins
                });
                setData(parsed);
                setPinRequired(false);
                return;
              }
            }
          } catch (fbErr) {
            console.warn('Firestore fetch failed:', fbErr);
          }
        }

        // 2. Fallback to Local Offline Cache (shows full app even if completely offline)
        const cachedRaw = localStorage.getItem('sentinel_offline_cache');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const hbTime = cached.scanTime;
          const ageMins = hbTime ? Math.max(1, Math.round((Date.now() - new Date(hbTime).getTime()) / 60000)) : 0;
          setIsOffline(true);
          setOfflineInfo({
            lastHeartbeat: hbTime ? new Date(hbTime).toLocaleTimeString() : 'Prior to shutdown',
            ageMins
          });
          setData(cached);
          setPinRequired(false);
          return;
        }

        throw networkErr;
      }

      if (res.status === 401) {
        setPinRequired(true);
        setData(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const json = await res.json();

      // Filter out any locally resolved incidents
      const localResolved = new Set(JSON.parse(localStorage.getItem('sentinel_resolved_incidents') || '[]'));
      if (localResolved.size > 0 && Array.isArray(json.incidents)) {
        json.incidents = json.incidents.filter(i => !localResolved.has(i.id));
        const hasCritical = json.incidents.some(i => i.severity === 'critical');
        const hasWarning = json.incidents.some(i => i.severity === 'warning');
        if (!hasCritical) {
          json.overallHealth = hasWarning ? {
            status: 'warning',
            label: 'Minor Warnings Detected',
            color: 'amber',
            summary: 'System is running, but warnings were detected.'
          } : {
            status: 'healthy',
            label: 'All Systems Normal',
            color: 'emerald',
            summary: 'No critical crashes, unexpected power cuts, or hardware disconnects detected.'
          };
        }
      }

      // Cache latest successful scan
      localStorage.setItem('sentinel_offline_cache', JSON.stringify(json));
      setPinRequired(false);
      setIsOffline(false);
      setOfflineInfo(null);
      setData(json);
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err);

      // Check offline cache on error
      const cachedRaw = localStorage.getItem('sentinel_offline_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const localResolved = new Set(JSON.parse(localStorage.getItem('sentinel_resolved_incidents') || '[]'));
        if (localResolved.size > 0 && Array.isArray(cached.incidents)) {
          cached.incidents = cached.incidents.filter(i => !localResolved.has(i.id));
        }
        const hbTime = cached.scanTime;
        const ageMins = hbTime ? Math.max(1, Math.round((Date.now() - new Date(hbTime).getTime()) / 60000)) : 0;
        setIsOffline(true);
        setOfflineInfo({
          lastHeartbeat: hbTime ? new Date(hbTime).toLocaleTimeString() : 'Prior to shutdown',
          ageMins
        });
        setData(cached);
        setPinRequired(false);
        setError(null);
        return;
      }

      setError('Unable to communicate with PC Sentinel Server. Ensure the desktop application is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if opened via pairing link (?pair=SENT-XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const pairCode = urlParams.get('pair');
    if (pairCode) {
      localStorage.setItem('sentinel_device_id', pairCode);
    }
    fetchDeviceInfo();
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [daysFilter]);

  // Live Server-Sent Events (SSE) Stream for real-time heartbeat and shutdown interceptor
  useEffect(() => {
    if (pinRequired) return;

    let eventSource = null;
    let pollTimer = null;
    let isConnecting = false;

    const connectSSE = () => {
      if (isConnecting) return;
      isConnecting = true;

      const pinParam = userPin ? `?pin=${encodeURIComponent(userPin)}` : '';
      const sseUrl = `/api/stream${pinParam}`;

      try {
        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('connected', () => {
          isConnecting = false;
          setIsOffline(false);
          setReconnectAttempt(0);
        });

        eventSource.addEventListener('heartbeat', () => {
          setIsOffline(false);
          setReconnectAttempt(0);
        });

        eventSource.addEventListener('shutdown_intent', (e) => {
          try {
            const intent = JSON.parse(e.data);
            console.warn('[Sentinel SSE] 🚨 Intercepted impending shutdown:', intent);
            setShutdownIntent(intent);
            localStorage.setItem('sentinel_shutdown_intent', JSON.stringify(intent));
          } catch (err) {}
        });

        eventSource.onerror = () => {
          isConnecting = false;
          setIsOffline(true);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          // Start polling /api/health to automatically reconnect when host completes reboot
          if (!pollTimer) {
            pollTimer = setInterval(async () => {
              setReconnectAttempt(prev => prev + 1);
              try {
                const testRes = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
                if (testRes.ok) {
                  clearInterval(pollTimer);
                  pollTimer = null;
                  setShutdownIntent(null);
                  localStorage.removeItem('sentinel_shutdown_intent');
                  setIsOffline(false);
                  setReconnectAttempt(0);
                  setReconnectedToast('ThinkPad back online! Live telemetry refreshed.');
                  setTimeout(() => setReconnectedToast(null), 6000);
                  fetchDiagnostics(true);
                  connectSSE();
                }
              } catch (e) {
                // Host still booting/offline
              }
            }, 2500);
          }
        };
      } catch (err) {
        isConnecting = false;
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [pinRequired, userPin]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        setPinError(resData.message || 'Incorrect Security PIN. Please try again.');
        return;
      }

      localStorage.setItem('pc_sentinel_pin', pinInput);
      setUserPin(pinInput);
      setPinRequired(false);
      fetchDiagnostics(false, pinInput);
    } catch (err) {
      setPinError('Failed to verify PIN. Check server connection.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const incidents = data?.incidents || [];

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      // Category filter
      if (activeCategory !== 'all' && inc.category !== activeCategory) {
        return false;
      }
      // Severity filter
      if (severityFilter !== 'all' && inc.severity !== severityFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (inc.title || '').toLowerCase().includes(q);
        const matchDesc = (inc.description || '').toLowerCase().includes(q);
        const matchCause = (inc.likelyCauses || []).some(c => c.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchCause) return false;
      }
      return true;
    });
  }, [incidents, activeCategory, severityFilter, searchQuery]);

  // Category counts across full spectrum
  const categoryCounts = useMemo(() => {
    const counts = {
      all: incidents.length,
      power: 0,
      thermal: 0,
      gpu: 0,
      hardware: 0,
      bsod: 0,
      storage: 0,
      app: 0,
      system: 0,
      network: 0,
      security: 0
    };
    for (const inc of incidents) {
      if (counts[inc.category] !== undefined) {
        counts[inc.category]++;
      } else {
        counts.system = (counts.system || 0) + 1;
      }
    }
    return counts;
  }, [incidents]);

  // Severity counts
  const severityCounts = useMemo(() => {
    return {
      all: incidents.length,
      critical: incidents.filter(i => i.severity === 'critical').length,
      warning: incidents.filter(i => i.severity === 'warning').length,
      info: incidents.filter(i => i.severity === 'info').length
    };
  }, [incidents]);

  // Map to count identical events across the active feed
  const identicalCountMap = useMemo(() => {
    const counts = {};
    for (const inc of incidents) {
      const isTargetPnPOrEvent = inc.technicalDetails?.eventId && inc.technicalDetails?.provider;
      const key = isTargetPnPOrEvent
        ? `${inc.technicalDetails.provider}:${inc.technicalDetails.eventId}:${inc.title}`
        : `${inc.title}:${inc.category}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [incidents]);

  const getIdenticalCount = (inc) => {
    if (!inc) return 1;
    const isTargetPnPOrEvent = inc.technicalDetails?.eventId && inc.technicalDetails?.provider;
    const key = isTargetPnPOrEvent
      ? `${inc.technicalDetails.provider}:${inc.technicalDetails.eventId}:${inc.title}`
      : `${inc.title}:${inc.category}`;
    return identicalCountMap[key] || 1;
  };

  // 1-Click Jump to Latest Critical Event or Warning
  const jumpToLatestIncident = () => {
    if (!incidents || incidents.length === 0) return;

    // 1. Look for latest critical incident
    let target = incidents.find(i => i.severity === 'critical');

    // 2. If no critical present, look for latest warning incident
    if (!target) {
      target = incidents.find(i => i.severity === 'warning');
    }

    // 3. Fallback to latest incident of any severity
    if (!target) {
      target = incidents[0];
    }

    if (target) {
      setSearchQuery('');
      setActiveCategory('all');
      setSeverityFilter('all');

      setTimeout(() => {
        const el = document.getElementById(`incident-${target.id}`) || document.getElementById('incidents-feed');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);

      setSelectedIncident(target);
    }
  };

  // Permanently clear an incident and all identical events upon user confirmation of resolution
  const handleResolveIncident = async (incidentId, stepTitle, targetIncident) => {
    try {
      const inc = targetIncident || (data?.incidents || []).find(i => i.id === incidentId);
      const isTargetPnPOrEvent = inc?.technicalDetails?.eventId && inc?.technicalDetails?.provider;

      // Find all identical incidents currently present
      const matchingIncidents = (data?.incidents || []).filter(other => {
        if (other.id === incidentId) return true;
        if (!inc) return false;
        if (isTargetPnPOrEvent) {
          return (
            other.technicalDetails?.eventId === inc.technicalDetails.eventId &&
            other.technicalDetails?.provider === inc.technicalDetails.provider &&
            other.title === inc.title
          );
        }
        return other.title === inc.title && other.category === inc.category;
      });

      const matchingIds = matchingIncidents.map(m => m.id);

      const headers = { 'Content-Type': 'application/json' };
      if (userPin) {
        headers['x-sentinel-pin'] = userPin;
      }

      // 1. Persist to server/resolvedIncidents.json via API
      try {
        await fetch('/api/incidents/resolve', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            incidentId,
            matchingIds,
            clearIdentical: true,
            stepTitle,
            category: inc?.category || 'general'
          })
        });
      } catch (apiErr) {
        console.warn('Backend resolve API call failed, proceeding with client-side clearance:', apiErr);
      }

      // 2. Persist all matching IDs to localStorage
      const localResolved = JSON.parse(localStorage.getItem('sentinel_resolved_incidents') || '[]');
      const updatedResolved = Array.from(new Set([...localResolved, ...matchingIds]));
      localStorage.setItem('sentinel_resolved_incidents', JSON.stringify(updatedResolved));

      // 3. Immediately clear all matching events from active data state & re-evaluate overall health
      const matchingIdsSet = new Set(matchingIds);
      setData(prev => {
        if (!prev) return prev;
        const remainingIncidents = (prev.incidents || []).filter(i => !matchingIdsSet.has(i.id));
        const hasCritical = remainingIncidents.some(i => i.severity === 'critical');
        const hasWarning = remainingIncidents.some(i => i.severity === 'warning');

        const updatedHealth = hasCritical ? {
          status: 'critical',
          label: 'Action Needed',
          color: 'rose',
          summary: 'Critical events detected (unexpected shutdown, BSOD, or hardware fault). Review diagnostic actions below.'
        } : hasWarning ? {
          status: 'warning',
          label: 'Minor Warnings Detected',
          color: 'amber',
          summary: 'System is running, but warnings were detected (driver recoveries, throttling, or high wear).'
        } : {
          status: 'healthy',
          label: 'All Systems Normal',
          color: 'emerald',
          summary: 'No critical crashes, unexpected power cuts, or hardware disconnects detected.'
        };

        const updatedData = {
          ...prev,
          incidents: remainingIncidents,
          overallHealth: updatedHealth
        };

        localStorage.setItem('sentinel_offline_cache', JSON.stringify(updatedData));
        return updatedData;
      });

      return { success: true, clearedCount: matchingIds.length };
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      return { success: false, clearedCount: 1 };
    }
  };

  // State & Handler to Clear All Informational Logs
  const [showClearInfoModal, setShowClearInfoModal] = useState(false);
  const [isClearingInfo, setIsClearingInfo] = useState(false);

  const handleClearAllInfoLogs = async () => {
    setIsClearingInfo(true);
    try {
      const infoIncidents = (data?.incidents || []).filter(i => i.severity === 'info');
      const infoIds = infoIncidents.map(i => i.id);

      const headers = { 'Content-Type': 'application/json' };
      if (userPin) {
        headers['x-sentinel-pin'] = userPin;
      }

      // 1. Call backend API to record batch clearance
      try {
        await fetch('/api/incidents/clear-all-info', {
          method: 'POST',
          headers
        });
      } catch (apiErr) {
        console.warn('Backend clear-all-info API call failed, continuing with client-side clearance:', apiErr);
      }

      // 2. Persist to localStorage resolved incidents set
      const localResolved = JSON.parse(localStorage.getItem('sentinel_resolved_incidents') || '[]');
      const updatedResolved = Array.from(new Set([...localResolved, ...infoIds]));
      localStorage.setItem('sentinel_resolved_incidents', JSON.stringify(updatedResolved));

      // 3. Immediately clear from active in-memory data state
      setData(prev => {
        if (!prev) return prev;
        const remainingIncidents = (prev.incidents || []).filter(i => i.severity !== 'info');
        const updatedData = {
          ...prev,
          incidents: remainingIncidents
        };
        localStorage.setItem('sentinel_offline_cache', JSON.stringify(updatedData));
        return updatedData;
      });

      setShowClearInfoModal(false);
    } catch (err) {
      console.error('Failed to clear info logs:', err);
    } finally {
      setIsClearingInfo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white pb-16">
      {/* 1. Header */}
      <StatusHeader
        overallHealth={data?.overallHealth}
        systemSummary={data?.systemSummary}
        loading={loading}
        onRefresh={() => fetchDiagnostics(true)}
        lastScanTime={data?.scanTime}
        onOpenRemoteAccess={() => setIsPairingModalOpen(true)}
        isOffline={isOffline}
        onJumpToIncident={jumpToLatestIncident}
      />

      {/* 2. Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full mt-6 space-y-6 flex-1">
        {/* PIN Authentication Required Screen */}
        {pinRequired ? (
          <div className="max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Security PIN Required</h2>
              <p className="text-xs text-slate-400 mt-2">
                This PC Sentinel dashboard is being accessed remotely and is protected by a security PIN. Enter the PIN configured on the host machine to continue.
              </p>
            </div>

            {pinError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-lg flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN"
                autoFocus
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
              <button
                type="submit"
                disabled={isVerifyingPin}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
              >
                {isVerifyingPin ? 'Verifying...' : 'Unlock Dashboard'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Reconnected Toast Alert */}
            {reconnectedToast && (
              <div className="bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3 shadow-xl shadow-emerald-950/40 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="text-sm font-bold text-white">{reconnectedToast}</span>
                </div>
                <button
                  onClick={() => setReconnectedToast(null)}
                  className="text-xs px-2.5 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Smart Context-Aware Offline & Pre-Shutdown Banner */}
            {isOffline && (
              <div className="space-y-3">
                {shutdownIntent?.state === 'rebooting' ? (
                  /* User / Windows Update Restart */
                  <div className="bg-gradient-to-r from-sky-950/90 via-slate-900 to-cyan-950/70 border border-cyan-500/70 rounded-2xl p-5 shadow-2xl shadow-cyan-950/50">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                        <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-extrabold text-white text-base tracking-tight">
                            {shutdownIntent.title || 'Host Reboot in Progress: User-Initiated Restart'}
                          </h3>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono animate-pulse">
                            Rebooting ThinkPad
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {shutdownIntent.message || 'Your ThinkPad is currently restarting. Connection will restore momentarily as Windows finishes booting.'}
                        </p>
                        <div className="pt-2 flex items-center gap-3 text-xs text-cyan-300/90 font-mono flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                            <span>Auto-reconnecting (Attempt #{reconnectAttempt})...</span>
                          </div>
                          <span>•</span>
                          <span>Dashboard will automatically reload when Windows services resume</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : shutdownIntent?.state === 'thermal_trip' ? (
                  /* ACPI Thermal Shutdown */
                  <div className="bg-gradient-to-r from-rose-950/90 via-slate-900 to-red-950/80 border border-rose-500/80 rounded-2xl p-5 shadow-2xl shadow-rose-950/60">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                        <Flame className="w-6 h-6 text-rose-400 animate-bounce" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-extrabold text-white text-base tracking-tight">
                            {shutdownIntent.title || 'Emergency Thermal Shutdown in Progress'}
                          </h3>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 font-mono">
                            ACPI Critical Limit Trip
                          </span>
                        </div>
                        <p className="text-xs text-rose-200/95 leading-relaxed">
                          {shutdownIntent.message || 'An emergency thermal shutdown was triggered to protect processor silicon. The ThinkPad will stay powered off until temperatures normalize.'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono mt-1">
                          Elevate laptop underside and ensure fan exhausts are unblocked before powering back on.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : shutdownIntent?.state === 'powering_off' ? (
                  /* Clean Power Off */
                  <div className="bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950/70 border border-purple-500/60 rounded-2xl p-5 shadow-2xl shadow-purple-950/50">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                        <Power className="w-6 h-6 text-purple-400" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-extrabold text-white text-base tracking-tight">
                            {shutdownIntent.title || 'Clean System Shutdown: User-Initiated Power Off'}
                          </h3>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-700 font-mono">
                            Powered Off
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {shutdownIntent.message || 'Your ThinkPad was cleanly shut down by the user. System will remain offline until manually powered on.'}
                        </p>
                        <div className="pt-2 flex items-center gap-2 text-xs text-purple-300/80 font-mono">
                          <span>Polling host for next power-on (Attempt #{reconnectAttempt})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Abrupt Loss / Hard Crash (No shutdown signal received) */
                  <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-rose-950/60 border border-amber-500/60 rounded-2xl p-5 shadow-2xl shadow-amber-950/40">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                        <ZapOff className="w-6 h-6 text-amber-400 animate-pulse" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-extrabold text-white text-base tracking-tight">
                            Abrupt Connection Loss — No Shutdown Signal Received
                          </h3>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                            Sudden Drop
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Your ThinkPad severed communication abruptly with zero orderly shutdown intent received. Likely causes: Sudden power loss (unplugged or drained battery), instant kernel freeze (BSOD), or local Wi-Fi router drop.
                        </p>
                        <div className="pt-2 flex items-center gap-3 text-xs text-amber-300/90 font-mono flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                            <span>Monitoring for reboot (Attempt #{reconnectAttempt})...</span>
                          </div>
                          <span>•</span>
                          <span>Full forensic crash analysis will execute automatically upon reconnection</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-300 text-sm">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <div className="flex-1">
                  <strong>Connection Issue: </strong>
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => fetchDiagnostics(true)}
                  className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded text-xs font-semibold text-rose-200 border border-rose-500/40"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Telemetry Metrics Bar */}
            <MetricsBar
              overallHealth={data?.overallHealth}
              incidents={incidents}
              systemSummary={data?.systemSummary}
              storageData={data?.storageData}
              onJumpToIncident={jumpToLatestIncident}
              onOpenMemoryModal={() => setIsMemoryModalOpen(true)}
            />

            {/* 3. Main Dashboard Layout (2 Columns: Incident Timeline + Hardware Specs) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left / Main Column: Incidents Feed (2 cols on lg) */}
              <div className="lg:col-span-2 space-y-4" id="incidents-feed">
                {/* Filter & Search Bar */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3 backdrop-blur-sm">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search crashes, events, services, drivers, or symptoms..."
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                      />
                    </div>

                    {/* Days Filter */}
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Range:
                      </span>
                      <select
                        value={daysFilter}
                        onChange={(e) => setDaysFilter(Number(e.target.value))}
                        className="bg-slate-950/80 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-cyan-500 font-medium"
                      >
                        <option value={7}>Last 7 Days</option>
                        <option value={14}>Last 14 Days</option>
                        <option value={30}>Last 30 Days</option>
                      </select>
                    </div>
                  </div>

                  {/* Severity Filter Quick Pills */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-xs overflow-x-auto">
                      <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mr-1">Severity:</span>
                      {[
                        { id: 'all', label: 'All', count: severityCounts.all, color: 'bg-cyan-500 text-slate-950' },
                        { id: 'critical', label: 'Critical', count: severityCounts.critical, color: 'bg-rose-500 text-white' },
                        { id: 'warning', label: 'Warnings', count: severityCounts.warning, color: 'bg-amber-500 text-slate-950' },
                        { id: 'info', label: 'Info Logs', count: severityCounts.info, color: 'bg-blue-500 text-white' }
                      ].map(sev => (
                        <button
                          key={sev.id}
                          onClick={() => setSeverityFilter(sev.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                            severityFilter === sev.id
                              ? `${sev.color} shadow-sm font-bold`
                              : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 border border-slate-800'
                          }`}
                        >
                          <span>{sev.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                            severityFilter === sev.id ? 'bg-black/20' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {sev.count}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Clear All Info Logs Button */}
                    {severityCounts.info > 0 && (
                      <button
                        onClick={() => setShowClearInfoModal(true)}
                        disabled={isClearingInfo}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-500/60 shrink-0 shadow-sm active:scale-95"
                        title="Clear all routine informational events"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Clear All Info Logs ({severityCounts.info})</span>
                      </button>
                    )}
                  </div>

                  {/* Category Filter Pills (Full Spectrum) */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                    {[
                      { id: 'all', label: 'All Logs', count: categoryCounts.all },
                      { id: 'power', label: 'Power & Sleep', count: categoryCounts.power },
                      { id: 'thermal', label: 'Thermals', count: categoryCounts.thermal },
                      { id: 'hardware', label: 'Hardware & USB', count: categoryCounts.hardware },
                      { id: 'gpu', label: 'GPU & Display', count: categoryCounts.gpu },
                      { id: 'bsod', label: 'Blue Screens', count: categoryCounts.bsod },
                      { id: 'storage', label: 'Storage', count: categoryCounts.storage },
                      { id: 'app', label: 'Applications', count: categoryCounts.app },
                      { id: 'system', label: 'System & Services', count: categoryCounts.system },
                      { id: 'network', label: 'Network', count: categoryCounts.network },
                      { id: 'security', label: 'Security', count: categoryCounts.security }
                    ].filter(tab => tab.id === 'all' || tab.count > 0).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveCategory(tab.id)}
                        className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 text-xs ${
                          activeCategory === tab.id
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                            : 'bg-slate-950/50 hover:bg-slate-800 text-slate-400 border border-slate-800/80'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          activeCategory === tab.id ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Incident Cards List */}
                <div className="space-y-3">
                  {/* Informational Logs Context Banner with Clear Action */}
                  {severityFilter === 'info' && severityCounts.info > 0 && (
                    <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                      <div className="flex items-center gap-2.5 text-blue-200">
                        <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                          <Info className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-white">Routine Operational Info Logs ({filteredIncidents.length})</div>
                          <span className="text-[11px] text-blue-300/80">
                            Modern Standby sleep/wake transitions, uptime markers, and Windows Update events.
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowClearInfoModal(true)}
                        disabled={isClearingInfo}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Clear All ({severityCounts.info}) Info Logs</span>
                      </button>
                    </div>
                  )}

                  {loading && !data ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
                      <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm">Inspecting Windows Event Logs & Hardware Telemetry...</p>
                    </div>
                  ) : filteredIncidents.length === 0 ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-white">No Incidents Found</h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {searchQuery
                          ? 'No events matched your search query. Try clearing the filter.'
                          : `Your system has logged zero ${activeCategory === 'all' ? '' : activeCategory} issues within the selected ${daysFilter}-day window.`}
                      </p>
                    </div>
                  ) : (
                    filteredIncidents.map(inc => (
                      <IncidentCard
                        key={inc.id}
                        incident={inc}
                        identicalCount={getIdenticalCount(inc)}
                        onSelect={setSelectedIncident}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Hardware & Storage Live Monitor */}
              <div className="space-y-6">
                <HardwareStatusCard
                  deviceStatus={data?.deviceStatus}
                  storageData={data?.storageData}
                  systemSummary={data?.systemSummary}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* 4. Full Diagnosis & Fix Modal */}
      {selectedIncident && (
        <DiagnosisModal
          incident={selectedIncident}
          allIncidents={data?.incidents || []}
          onClose={() => setSelectedIncident(null)}
          onResolveIncident={handleResolveIncident}
        />
      )}

      {/* 5. Memory RAM Analysis Modal */}
      <MemoryDetailsModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        systemSummary={data?.systemSummary}
      />

      {/* 6. Device Pairing & Companion App Modal */}
      {isPairingModalOpen && (
        <DevicePairingModal
          onClose={() => setIsPairingModalOpen(false)}
          onRegenerate={(newInfo) => setDeviceInfo(newInfo)}
        />
      )}

      {/* 7. Clear All Info Logs Confirmation Modal */}
      {showClearInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Clear All Informational Logs?</h3>
                <p className="text-xs text-slate-400">Permanently dismiss routine telemetry</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-2">
              <p>
                This will dismiss all <strong>{severityCounts.info}</strong> informational logs (Modern Standby power transitions, periodic uptime milestones, service state transitions).
              </p>
              <p className="text-[11px] text-slate-400">
                🔒 <strong>Note:</strong> Critical crash events and hardware warnings will remain untouched. Cleared events will not reappear on rescans.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearInfoModal(false)}
                disabled={isClearingInfo}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllInfoLogs}
                disabled={isClearingInfo}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-lg shadow-rose-900/30 flex items-center gap-2 disabled:opacity-50"
              >
                {isClearingInfo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Clear All ({severityCounts.info})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
