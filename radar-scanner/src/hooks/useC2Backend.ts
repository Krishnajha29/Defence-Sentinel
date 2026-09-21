import { useState, useEffect, useRef, useCallback } from 'react';
import type { Track, TrackType, Scenario } from '../types';

interface C2BackendHook {
  isConnected: boolean;
  tracks: Track[];
  scenario: string;
  isPaused: boolean;
  sweepAngle: number;
  selectScenario: (sc: Scenario | string) => void;
  togglePause: () => void;
  selectEntity: (id: string) => void;
  resetSim: () => void;
}

function mapEntityToTrack(ent: any): Track {
  const isAuth = Boolean(ent.personnel?.matched || ent.displayName?.includes('Staff') || ent.displayName?.includes('Operator') || ent.displayName?.includes('Guard') || ent.displayName?.includes('Officer') || ent.id === 'TRK-014');
  
  let trackType: TrackType = 'UNKNOWN_OBJECT';
  if (isAuth) {
    trackType = 'AUTHORIZED';
  } else if (ent.type === 'WILDLIFE') {
    trackType = 'ANIMAL';
  } else if (ent.type === 'PERSON') {
    trackType = 'UNKNOWN_PERSON';
  } else if (ent.type === 'ANOMALOUS_OBJECT') {
    trackType = 'UNKNOWN_OBJECT';
  } else {
    trackType = 'UNKNOWN_OBJECT';
  }

  const x = ent.radar?.x ?? 0;
  const y = ent.radar?.y ?? 0;
  const dist = ent.radar?.range ?? Math.round(Math.hypot(x, y));
  const insidePerimeter = dist <= 450;

  return {
    id: ent.id,
    type: trackType,
    x,
    y,
    bearing: ent.radar?.azimuth ?? 0,
    distance: dist,
    speed: ent.radar?.speedKmh ?? 0,
    heading: ent.radar?.heading ?? 0,
    confidence: ent.fusion?.fusedConfidence ?? ent.camera?.confidence ?? 95,
    firstDetected: Date.now() - Math.round(dist * 100),
    lastSeen: Date.now(),
    trail: (ent.radar?.trail && ent.radar.trail.length > 0) ? ent.radar.trail : [{ x, y }],
    personnelId: ent.personnel?.details?.id || ent.personnel?.tagId || undefined,
    animalType: ent.type === 'WILDLIFE' ? 'Wildlife Target' : undefined,
    insidePerimeter
  };
}

export function useC2Backend(
  onPerimeterBreach: (track: Track) => void
): C2BackendHook {
  const [isConnected, setIsConnected] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [scenario, setScenario] = useState<string>('STANDARD BASE MONITORING');
  const [isPaused, setIsPaused] = useState(false);
  const [sweepAngle, setSweepAngle] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const prevInsideRef = useRef<Map<string, boolean>>(new Map());

  // Sweep animation smooth local interpolation if paused/waiting
  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!isPaused) {
        setSweepAngle(a => (a + dt * 90) % 360);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isPaused]);

  useEffect(() => {
    let unmounted = false;
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (unmounted) return;
      try {
        const url = `ws://${window.location.hostname || 'localhost'}:8080/ws/c2`;
        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'C2_FRAME' || data.type === 'INIT_STATE') {
              if (data.entities && Array.isArray(data.entities)) {
                const mappedTracks: Track[] = data.entities.map(mapEntityToTrack);

                // Perimeter breach detection
                mappedTracks.forEach(t => {
                  const wasInside = prevInsideRef.current.get(t.id);
                  if (wasInside === false && t.insidePerimeter) {
                    onPerimeterBreach(t);
                  }
                  prevInsideRef.current.set(t.id, t.insidePerimeter);
                });

                setTracks(mappedTracks);
              }

              if (data.simState) {
                if (data.simState.scenario) {
                  setScenario(data.simState.scenario);
                }
                if (data.simState.isRunning !== undefined) {
                  setIsPaused(!data.simState.isRunning);
                }
                if (data.simState.radarSweepAngle !== undefined) {
                  // Synchronize sweep if provided
                  setSweepAngle(data.simState.radarSweepAngle);
                }
              }
            }
          } catch (e) {
            console.error('Error parsing C2 WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setIsConnected(false);
          retryTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        if (!unmounted) {
          setIsConnected(false);
          retryTimer = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [onPerimeterBreach]);

  const selectScenario = useCallback((sc: Scenario | string) => {
    setScenario(sc);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario: sc }));
    }
  }, []);

  const togglePause = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
    }
  }, []);

  const selectEntity = useCallback((id: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SELECT_ENTITY', entityId: id }));
    }
  }, []);

  const resetSim = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'RESET' }));
    }
  }, []);

  return {
    isConnected,
    tracks,
    scenario,
    isPaused,
    sweepAngle,
    selectScenario,
    togglePause,
    selectEntity,
    resetSim
  };
}
