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
  Smartphone, RefreshCw, Calendar, Trash2, Info
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

  // Permanently clear an incident upon user confirmation of resolution
  const handleResolveIncident = async (incidentId, stepTitle) => {
    try {
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
            stepTitle,
            category: selectedIncident?.category || 'general'
          })
        });
      } catch (apiErr) {
        console.warn('Backend resolve API call failed, proceeding with client-side clearance:', apiErr);
      }

      // 2. Persist to localStorage
      const localResolved = JSON.parse(localStorage.getItem('sentinel_resolved_incidents') || '[]');
      if (!localResolved.includes(incidentId)) {
        localResolved.push(incidentId);
        localStorage.setItem('sentinel_resolved_incidents', JSON.stringify(localResolved));
      }

      // 3. Immediately clear from active data state & re-evaluate overall health
      setData(prev => {
        if (!prev) return prev;
        const remainingIncidents = (prev.incidents || []).filter(i => i.id !== incidentId);
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

      return true;
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      return false;
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
            {/* Host Offline Banner */}
            {isOffline && (
              <div className="bg-gradient-to-r from-rose-950/70 via-slate-900 to-amber-950/40 border border-rose-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl shadow-rose-950/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                    <Power className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">Host Offline — Showing Last Recorded Telemetry</h3>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        ThinkPad Powered Down
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your ThinkPad stopped communicating {offlineInfo?.ageMins ? `${offlineInfo.ageMins} minute(s) ago` : 'recently'} ({offlineInfo?.lastHeartbeat || 'Prior to shutdown'}).
                      {incidents.length > 0 && incidents[0].severity === 'critical' ? (
                        <span className="block mt-1 text-amber-300 font-medium">
                          Pre-Shutdown Incident: {incidents[0].title}
                        </span>
                      ) : (
                        ' Displaying preserved diagnostic state.'
                      )}
                    </p>
                  </div>
                </div>
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
