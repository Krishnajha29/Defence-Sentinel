import { useState, useCallback } from 'react';
import type { RadarAlert, Track } from '../types';
import { uid, formatTime } from '../utils/radar';

const KEY = 'radar_alerts';

function load(): RadarAlert[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /**/ }
  return [];
}
function save(a: RadarAlert[]) { localStorage.setItem(KEY, JSON.stringify(a)); }

export function useAlerts() {
  const [alerts, setAlerts] = useState<RadarAlert[]>(load);

  const persist = (next: RadarAlert[]) => { save(next); setAlerts(next); };

  const fireAlert = useCallback((track: Track) => {
    const severity = track.type === 'UNKNOWN_PERSON' ? 'CRITICAL' :
                     track.type === 'ANIMAL'         ? 'WARNING'  : 'INFO';
    const message  = track.type === 'AUTHORIZED'     ? `AUTHORIZED PERSON ENTERED PERIMETER` :
                     track.type === 'UNKNOWN_PERSON' ? `UNKNOWN PERSON — VERIFICATION REQUIRED` :
                     track.type === 'ANIMAL'         ? `WILDLIFE DETECTED` : `UNKNOWN OBJECT DETECTED`;
    const detail   = `Track ${track.id} · ${Math.round(track.distance)}m · ${formatTime(track.lastSeen)}`;
    const alert: RadarAlert = {
      id: uid(), trackId: track.id, type: track.type,
      severity, message, detail,
      timestamp: Date.now(),
      acknowledged: false, dismissed: false,
    };
    setAlerts((prev: RadarAlert[]) => {
      const next = [alert, ...prev].slice(0, 50);
      save(next);
      return next;
    });

  }, []);

  const addFalseAlarm = useCallback(() => {
    const alert: RadarAlert = {
      id: uid(), trackId: 'TEST-000', type: 'UNKNOWN_PERSON',
      severity: 'WARNING',
      message: 'FALSE ALARM TEST — DISMISS THIS ALERT',
      detail: `System test · ${formatTime(Date.now())} · Operator verification required`,
      timestamp: Date.now(),
      acknowledged: false, dismissed: false,
    };
    setAlerts(prev => { const next = [alert, ...prev]; save(next); return next; });
  }, []);

  const acknowledge = useCallback((id: string) => {
    setAlerts(prev => { const n = prev.map(a => a.id === id ? { ...a, acknowledged: true } : a); save(n); return n; });
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts(prev => { const n = prev.map(a => a.id === id ? { ...a, dismissed: true } : a); save(n); return n; });
  }, []);

  const clearAll = useCallback(() => { save([]); setAlerts([]); }, []);

  return { alerts, fireAlert, addFalseAlarm, acknowledge, dismiss, clearAll };
}
