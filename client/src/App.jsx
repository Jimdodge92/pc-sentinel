import React, { useState, useEffect, useMemo } from 'react';
import StatusHeader from './components/StatusHeader';
import MetricsBar from './components/MetricsBar';
import IncidentCard from './components/IncidentCard';
import DiagnosisModal from './components/DiagnosisModal';
import HardwareStatusCard from './components/HardwareStatusCard';
import RemoteAccessModal from './components/RemoteAccessModal';
import {
  Search, Filter, CheckCircle2, AlertCircle, ShieldAlert,
  Power, Monitor, HardDrive, Cpu, FileText, Calendar, Lock, Key, Globe, Github
} from 'lucide-react';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Network & Remote Access State
  const [networkInfo, setNetworkInfo] = useState(null);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);

  // Cloud Vault & Offline Detection State
  const [cloudStatus, setCloudStatus] = useState(null);
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

  const fetchNetworkInfo = async () => {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const json = await res.json();
        setNetworkInfo(json);
      }
    } catch (e) {
      console.warn('Failed to fetch network info:', e);
    }

    try {
      const cRes = await fetch('/api/cloud/status');
      if (cRes.ok) {
        const cJson = await cRes.json();
        setCloudStatus(cJson);
        if (cJson.gistId) {
          localStorage.setItem('sentinel_gist_id', cJson.gistId);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch cloud status:', e);
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
        console.warn('Local host unreachable, attempting Cloud Vault fallback...', networkErr);
        // Fallback to GitHub Cloud Vault
        const gistId = localStorage.getItem('sentinel_gist_id') || cloudStatus?.gistId;
        if (gistId) {
          const gistRes = await fetch(`https://api.github.com/gists/${gistId}`);
          if (gistRes.ok) {
            const gistData = await gistRes.json();
            const rawContent = gistData.files?.['sentinel_telemetry.json']?.content;
            if (rawContent) {
              const parsed = JSON.parse(rawContent);
              const hbTime = parsed.heartbeatTime || parsed.scanTime;
              const ageMins = hbTime ? Math.max(1, Math.round((Date.now() - new Date(hbTime).getTime()) / 60000)) : 0;
              setIsOffline(true);
              setOfflineInfo({
                lastHeartbeat: hbTime ? new Date(hbTime).toLocaleTimeString() : 'Unknown',
                ageMins
              });
              setData(parsed);
              setPinRequired(false);
              return;
            }
          }
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
      setPinRequired(false);
      setIsOffline(false);
      setOfflineInfo(null);
      setData(json);
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err);
      // Fallback to GitHub Cloud Vault on error
      const gistId = localStorage.getItem('sentinel_gist_id') || cloudStatus?.gistId;
      if (gistId) {
        try {
          const gistRes = await fetch(`https://api.github.com/gists/${gistId}`);
          if (gistRes.ok) {
            const gistData = await gistRes.json();
            const rawContent = gistData.files?.['sentinel_telemetry.json']?.content;
            if (rawContent) {
              const parsed = JSON.parse(rawContent);
              const hbTime = parsed.heartbeatTime || parsed.scanTime;
              const ageMins = hbTime ? Math.max(1, Math.round((Date.now() - new Date(hbTime).getTime()) / 60000)) : 0;
              setIsOffline(true);
              setOfflineInfo({
                lastHeartbeat: hbTime ? new Date(hbTime).toLocaleTimeString() : 'Unknown',
                ageMins
              });
              setData(parsed);
              setPinRequired(false);
              setError(null);
              return;
            }
          }
        } catch (cloudErr) {
          console.error('Cloud Vault fallback also failed:', cloudErr);
        }
      }
      setError('Unable to communicate with PC Sentinel Server. Ensure the backend is running or GitHub Cloud Vault is configured.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworkInfo();
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

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { all: incidents.length, power: 0, gpu: 0, bsod: 0, thermal: 0, storage: 0, app: 0 };
    for (const inc of incidents) {
      if (counts[inc.category] !== undefined) {
        counts[inc.category]++;
      }
    }
    return counts;
  }, [incidents]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white pb-16">
      {/* 1. Header */}
      <StatusHeader
        overallHealth={data?.overallHealth}
        systemSummary={data?.systemSummary}
        loading={loading}
        onRefresh={() => fetchDiagnostics(true)}
        lastScanTime={data?.scanTime}
        onOpenRemoteAccess={() => setIsRemoteModalOpen(true)}
        isOffline={isOffline}
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
            {/* Dead-Man's Switch Host Offline Banner */}
            {isOffline && (
              <div className="bg-gradient-to-r from-rose-950/70 via-slate-900 to-amber-950/40 border border-rose-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl shadow-rose-950/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                    <Power className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">Host Offline — Displaying Last Recorded Telemetry</h3>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        ThinkPad Powered Down
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your ThinkPad stopped sending heartbeats {offlineInfo?.ageMins ? `${offlineInfo.ageMins} minute(s) ago` : 'recently'} ({offlineInfo?.lastHeartbeat || 'Prior to shutdown'}).
                      {incidents.length > 0 && incidents[0].severity === 'critical' ? (
                        <span className="block mt-1 text-amber-300 font-medium">
                          Pre-Shutdown Incident: {incidents[0].title}
                        </span>
                      ) : (
                        ' System state preserved in GitHub Cloud Vault.'
                      )}
                    </p>
                  </div>
                </div>
                {cloudStatus?.gistUrl && (
                  <a
                    href={cloudStatus.gistUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-purple-300 border border-purple-800/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>View Cloud Gist</span>
                  </a>
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
        />

        {/* 3. Main Dashboard Layout (2 Columns: Incident Timeline + Hardware Specs) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Main Column: Incidents Feed (2 cols on lg) */}
          <div className="lg:col-span-2 space-y-4">
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
                    placeholder="Search crashes, drivers, GPU errors, or symptoms..."
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

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                {[
                  { id: 'all', label: 'All Incidents', count: categoryCounts.all },
                  { id: 'power', label: 'Shutdowns', count: categoryCounts.power },
                  { id: 'gpu', label: 'GPU & Display', count: categoryCounts.gpu },
                  { id: 'bsod', label: 'Blue Screens', count: categoryCounts.bsod },
                  { id: 'thermal', label: 'Thermals', count: categoryCounts.thermal },
                  { id: 'storage', label: 'Storage', count: categoryCounts.storage },
                  { id: 'app', label: 'App Crashes', count: categoryCounts.app }
                ].map(tab => (
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
        />
      )}

      {/* 5. Off-Network Remote Access & Port Forwarding Modal */}
      {isRemoteModalOpen && (
        <RemoteAccessModal
          networkInfo={networkInfo}
          onClose={() => setIsRemoteModalOpen(false)}
          onUpdateConfig={fetchNetworkInfo}
        />
      )}
    </div>
  );
}
