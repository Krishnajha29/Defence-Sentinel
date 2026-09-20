import React, { useState, useCallback, useEffect } from 'react';
import type { Scenario } from './types';
import { usePersonnel }  from './hooks/usePersonnel';
import { useAlerts }     from './hooks/useAlerts';
import { useSimulation } from './hooks/useSimulation';
import RadarScope        from './components/RadarScope';
import TrackList         from './components/TrackList';
import PersonnelPanel    from './components/PersonnelPanel';
import AlertsPanel       from './components/AlertsPanel';
import TrackDetails      from './components/TrackDetails';
import ScenarioControls  from './components/ScenarioControls';
import { formatTime }    from './utils/radar';
import type { Track }    from './types';

function Clock() {
  const [time, setTime] = useState(formatTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-cyan-400 font-bold tabular-nums">{time}</span>;
}

export default function App() {
  const { personnel, addPersonnel, updatePersonnel, removePersonnel, deactivatePersonnel } = usePersonnel();
  const { alerts, fireAlert, addFalseAlarm, acknowledge, dismiss, clearAll } = useAlerts();
  const personnelIds = personnel.filter(p => p.status === 'ACTIVE').map(p => p.id);

  const handleBreach = useCallback((track: Track) => {
    fireAlert(track);
  }, [fireAlert]);

  const { tracks, sweepAngle, isPaused, scenario, setScenario, pause, resume, reset } = useSimulation(personnelIds, handleBreach);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  const selectedTrack = tracks.find(t => t.id === selectedId) ?? null;

  const handleReset = useCallback(() => {
    reset();
    clearAll();
    setSelectedId(null);
  }, [reset, clearAll]);

  const handleReport = useCallback(() => {
    const report = {
      generated: new Date().toISOString(),
      scenario,
      totalTracks: tracks.length,
      activeAlerts: alerts.filter(a => !a.dismissed).length,
      tracks: tracks.map(t => ({
        id: t.id, type: t.type, distance: Math.round(t.distance),
        bearing: Math.round(t.bearing), speed: t.speed,
        insidePerimeter: t.insidePerimeter, confidence: t.confidence,
        firstDetected: new Date(t.firstDetected).toISOString(),
      })),
      alerts: alerts.map(a => ({
        id: a.id, severity: a.severity, message: a.message,
        timestamp: new Date(a.timestamp).toISOString(),
        acknowledged: a.acknowledged, dismissed: a.dismissed,
      })),
      disclaimer: 'SIMULATION ONLY — NOT CONNECTED TO REAL CAMERAS, BIOMETRIC SYSTEMS, OR SECURITY NETWORKS.',
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `incident-report-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [tracks, alerts, scenario]);

  const activeAlerts = alerts.filter(a => !a.dismissed);

  return (
    <div className="h-screen flex flex-col bg-gray-950 font-mono overflow-hidden">
      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60 bg-gray-950 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm font-bold tracking-[0.15em] text-cyan-300">RADAR SECURITY SCANNER</span>
          <span className="text-[8px] border border-gray-700 text-gray-500 px-2 py-0.5 rounded">SIMULATION</span>
        </div>
        <div className="text-[8px] text-red-500/80 font-bold tracking-wide text-center flex-1 mx-4">
          ⚠ SIMULATION ONLY — NOT CONNECTED TO REAL CAMERAS, BIOMETRIC SYSTEMS, OR SECURITY NETWORKS
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-gray-500">SCENARIO: <span className="text-cyan-400 font-bold">{scenario.replace('_', ' ')}</span></span>
          <Clock />
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden gap-2 p-2">
        {/* LEFT — Track List */}
        <div className="w-52 flex-shrink-0 flex flex-col overflow-hidden">
          <TrackList tracks={tracks} selectedId={selectedId} onSelect={handleSelect} />
        </div>

        {/* CENTRE — Radar */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="panel w-full h-full flex items-center justify-center" style={{ minHeight: 0 }}>
            <RadarScope
              tracks={tracks}
              sweepAngle={sweepAngle}
              selectedId={selectedId}
              isPaused={isPaused}
              onSelect={handleSelect}
            />
          </div>
        </div>

        {/* RIGHT — Personnel + Alerts + TrackDetails */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
          {/* Track detail (shown when selected) */}
          {selectedTrack && (
            <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '40%' }}>
              <TrackDetails
                track={selectedTrack}
                personnel={personnel}
                alerts={alerts}
                onAcknowledge={acknowledge}
                onDismiss={dismiss}
              />
            </div>
          )}

          {/* Personnel panel */}
          <div className="flex-shrink-0">
            <PersonnelPanel
              personnel={personnel}
              onAdd={addPersonnel}
              onUpdate={updatePersonnel}
              onRemove={removePersonnel}
              onDeactivate={deactivatePersonnel}
            />
          </div>

          {/* Alerts panel */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <AlertsPanel
              alerts={alerts}
              onAcknowledge={acknowledge}
              onDismiss={dismiss}
            />
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ──────────────────────────────────────────────────────── */}
      <ScenarioControls
        scenario={scenario}
        isPaused={isPaused}
        alerts={alerts}
        onScenario={setScenario}
        onPause={pause}
        onResume={resume}
        onReset={handleReset}
        onFalseAlarm={addFalseAlarm}
        onReport={handleReport}
      />
    </div>
  );
}
