import type { Track, Scenario } from '../types';
import { bearingDistToXY, xyToBearingDist, uid, PERIMETER_M } from './radar';

function mkTrack(
  type: Track['type'],
  bearing: number,
  distance: number,
  speed: number,
  heading: number,
  confidence: number,
  extra: Partial<Track> = {}
): Track {
  const { x, y } = bearingDistToXY(bearing, distance);
  const now = Date.now();
  return {
    id: `TRK-${uid()}`,
    type,
    x, y,
    bearing, distance, speed, heading, confidence,
    firstDetected: now,
    lastSeen: now,
    trail: [{ x, y }],
    insidePerimeter: distance <= PERIMETER_M,
    alertFired: false,
    ...extra,
  };
}

export function buildScenarioTracks(
  scenario: Scenario,
  personnelIds: string[]
): Track[] {
  const p0 = personnelIds[0] ?? '';
  const p1 = personnelIds[1] ?? '';
  const p2 = personnelIds[2] ?? '';

  switch (scenario) {
    case 'STANDARD_MONITORING':
      return [
        mkTrack('AUTHORIZED', 45,  180, 2.4, 225, 98, { personnelId: p0 }),
        mkTrack('AUTHORIZED', 310, 95,  1.1, 130, 97, { personnelId: p1 }),
        mkTrack('AUTHORIZED', 180, 310, 3.2, 10,  95, { personnelId: p2 }),
        mkTrack('ANIMAL',     75,  620, 4.8, 260, 82, { animalType: 'Deer' }),
        mkTrack('UNKNOWN_OBJECT', 200, 700, 0,  0,  60),
      ];

    case 'AUTHORIZED_ENTRY':
      return [
        mkTrack('AUTHORIZED', 0,   500, 3.5, 180, 99, { personnelId: p0 }),
        mkTrack('AUTHORIZED', 90,  200, 2.0, 270, 97, { personnelId: p1 }),
      ];

    case 'UNKNOWN_PERSON':
      return [
        mkTrack('UNKNOWN_PERSON', 315, 480, 5.2, 135, 88),
        mkTrack('AUTHORIZED',     45,  150, 1.8, 225, 99, { personnelId: p0 }),
        mkTrack('ANIMAL',         200, 600, 3.0, 50,  74, { animalType: 'Wild Boar' }),
      ];

    case 'WILDLIFE':
      return [
        mkTrack('ANIMAL', 30,  500, 6.0, 210, 91, { animalType: 'Deer' }),
        mkTrack('ANIMAL', 150, 380, 4.5, 330, 87, { animalType: 'Jackal' }),
        mkTrack('ANIMAL', 280, 620, 3.8, 100, 79, { animalType: 'Wild Boar' }),
        mkTrack('AUTHORIZED', 90, 200, 1.5, 0,  97, { personnelId: p0 }),
      ];

    case 'MULTI_SENSOR':
      return [
        mkTrack('AUTHORIZED',     15,  180, 2.2, 195, 99, { personnelId: p0 }),
        mkTrack('AUTHORIZED',     200, 280, 1.8, 20,  98, { personnelId: p1 }),
        mkTrack('UNKNOWN_PERSON', 290, 420, 4.8, 110, 85),
        mkTrack('UNKNOWN_PERSON', 60,  380, 5.5, 240, 79),
        mkTrack('ANIMAL',         130, 540, 5.2, 310, 88, { animalType: 'Deer' }),
        mkTrack('UNKNOWN_OBJECT', 350, 650, 0.5, 180, 55),
      ];

    default:
      return [];
  }
}

export function stepTrack(t: Track, dt: number): Track {
  const speedMs = t.speed / 3.6;
  const rad = (t.heading * Math.PI) / 180;
  const dx = speedMs * Math.sin(rad) * dt;
  const dy = speedMs * Math.cos(rad) * dt;
  const nx = t.x + dx;
  const ny = t.y + dy;
  const { bearing, distance } = xyToBearingDist(nx, ny);
  const trail = [...t.trail, { x: nx, y: ny }].slice(-14);
  return {
    ...t,
    x: nx, y: ny, bearing, distance,
    insidePerimeter: distance <= PERIMETER_M,
    lastSeen: Date.now(),
    trail,
  };
}
