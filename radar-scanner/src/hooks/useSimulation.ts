import { useState, useEffect, useRef, useCallback } from 'react';
import type { Track, Scenario } from '../types';
import { buildScenarioTracks, stepTrack } from '../utils/scenarios';
import { PERIMETER_M } from '../utils/radar';

const TICK_MS = 120;

export function useSimulation(
  personnelIds: string[],
  onPerimeterBreach: (track: Track) => void
) {
  const [scenario, setScenarioState] = useState<Scenario>('STANDARD_MONITORING');
  const [tracks, setTracks] = useState<Track[]>(() => buildScenarioTracks('STANDARD_MONITORING', personnelIds));
  const [sweepAngle, setSweepAngle] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const pausedRef = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  // Sweep animation — always runs even when "paused" (only slow it down)
  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) {
        setSweepAngle(a => (a + dt * 90) % 360); // 90°/s = 24 RPM
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Physics tick
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => {
      setTracks(prev => prev.map(t => {
        const next = stepTrack(t, TICK_MS / 1000);
        // Fire alert on perimeter entry
        if (!t.insidePerimeter && next.insidePerimeter && !t.alertFired) {
          onPerimeterBreach({ ...next, alertFired: true });
          return { ...next, alertFired: true };
        }
        return next;
      }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isPaused, onPerimeterBreach]);

  const setScenario = useCallback((s: Scenario) => {
    setScenarioState(s);
    setTracks(buildScenarioTracks(s, personnelIds));
  }, [personnelIds]);

  const pause = useCallback(() => { pausedRef.current = true;  setIsPaused(true);  }, []);
  const resume= useCallback(() => { pausedRef.current = false; setIsPaused(false); }, []);

  const reset = useCallback(() => {
    setTracks(buildScenarioTracks(scenario, personnelIds));
    setIsPaused(false);
    pausedRef.current = false;
  }, [scenario, personnelIds]);

  return { tracks, sweepAngle, isPaused, scenario, setScenario, pause, resume, reset };
}
