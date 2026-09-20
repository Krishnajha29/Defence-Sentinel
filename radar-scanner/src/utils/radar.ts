export const MAX_RANGE_M = 850;
export const PERIMETER_M = 450;
export const SVG_SIZE = 700;
export const SVG_CX = 350;
export const SVG_CY = 350;
export const SVG_RADIUS = 320;

export function metersToSVG(x: number, y: number) {
  const scale = SVG_RADIUS / MAX_RANGE_M;
  return { px: SVG_CX + x * scale, py: SVG_CY - y * scale };
}

export function bearingDistToXY(bearing: number, distance: number) {
  const rad = (bearing * Math.PI) / 180;
  return { x: distance * Math.sin(rad), y: distance * Math.cos(rad) };
}

export function xyToBearingDist(x: number, y: number) {
  const distance = Math.hypot(x, y);
  const bearing = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { bearing, distance };
}

export function formatBearing(deg: number): string {
  return `${Math.round(deg).toString().padStart(3, '0')}°`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toTimeString().split(' ')[0];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
