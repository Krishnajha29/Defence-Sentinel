import React, { useCallback } from 'react';
import type { Track } from '../types';
import { metersToSVG, SVG_SIZE, SVG_CX, SVG_CY, SVG_RADIUS, MAX_RANGE_M, PERIMETER_M } from '../utils/radar';

interface Props {
  tracks: Track[];
  sweepAngle: number;
  selectedId: string | null;
  isPaused: boolean;
  onSelect: (id: string | null) => void;
}

const RINGS = [100, 200, 300, 450, 600, 800];
const CARDINALS = [
  { deg: 0, label: 'N' }, { deg: 90, label: 'E' },
  { deg: 180, label: 'S' }, { deg: 270, label: 'W' },
];

function trackColor(type: Track['type']) {
  switch (type) {
    case 'AUTHORIZED':     return '#22c55e';
    case 'UNKNOWN_PERSON': return '#ef4444';
    case 'ANIMAL':         return '#f59e0b';
    case 'UNKNOWN_OBJECT': return '#06b6d4';
  }
}

function TrackDot({ track, selected, onSelect }: { track: Track; selected: boolean; onSelect: (id: string) => void }) {
  const { px, py } = metersToSVG(track.x, track.y);
  const color = trackColor(track.type);
  const r = selected ? 9 : 7;

  return (
    <g onClick={e => { e.stopPropagation(); onSelect(track.id); }} style={{ cursor: 'pointer' }}>
      {/* Trail */}
      {track.trail.length > 1 && (
        <polyline
          points={track.trail.map(p => { const sv = metersToSVG(p.x, p.y); return `${sv.px},${sv.py}`; }).join(' ')}
          fill="none" stroke={color} strokeWidth={1.5} opacity={0.25}
        />
      )}
      {/* Pulse ring for threats */}
      {track.type === 'UNKNOWN_PERSON' && track.insidePerimeter && (
        <circle cx={px} cy={py} r={r + 6} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} className="pulse-threat" />
      )}
      {/* Outer ring */}
      <circle cx={px} cy={py} r={r + 3} fill="none" stroke={color} strokeWidth={1.4} opacity={0.7} />
      {/* Fill */}
      <circle cx={px} cy={py} r={r - 2} fill={color} opacity={0.9} />
      {/* Selected brackets */}
      {selected && (
        <>
          <line x1={px - 14} y1={py - 14} x2={px - 14} y2={py - 8}  stroke="#18b8d6" strokeWidth={2} />
          <line x1={px - 14} y1={py - 14} x2={px - 8}  y2={py - 14} stroke="#18b8d6" strokeWidth={2} />
          <line x1={px + 14} y1={py - 14} x2={px + 14} y2={py - 8}  stroke="#18b8d6" strokeWidth={2} />
          <line x1={px + 14} y1={py - 14} x2={px + 8}  y2={py - 14} stroke="#18b8d6" strokeWidth={2} />
          <line x1={px - 14} y1={py + 14} x2={px - 14} y2={py + 8}  stroke="#18b8d6" strokeWidth={2} />
          <line x1={px - 14} y1={py + 14} x2={px - 8}  y2={py + 14} stroke="#18b8d6" strokeWidth={2} />
          <line x1={px + 14} y1={py + 14} x2={px + 14} y2={py + 8}  stroke="#18b8d6" strokeWidth={2} />
          <line x1={px + 14} y1={py + 14} x2={px + 8}  y2={py + 14} stroke="#18b8d6" strokeWidth={2} />
          {/* Label */}
          <rect x={px + 16} y={py - 20} width={90} height={40} fill="rgba(4,10,18,0.92)" stroke={color} strokeWidth={1} rx={2} />
          <text x={px + 20} y={py - 5}  fill={color}    fontSize={9}  fontFamily="JetBrains Mono,monospace" fontWeight={700}>{track.id}</text>
          <text x={px + 20} y={py + 7}  fill="#9cb1c5"  fontSize={8}  fontFamily="JetBrains Mono,monospace">{Math.round(track.distance)}m · {Math.round(track.bearing)}°</text>
          <text x={px + 20} y={py + 17} fill="#9cb1c5"  fontSize={8}  fontFamily="JetBrains Mono,monospace">{track.speed.toFixed(1)} km/h</text>
        </>
      )}
      {/* Small ID label */}
      {!selected && (
        <text x={px + 10} y={py - 3} fill={color} fontSize={8} fontFamily="JetBrains Mono,monospace" opacity={0.8}>{track.id.slice(-6)}</text>
      )}
    </g>
  );
}

export default function RadarScope({ tracks, sweepAngle, selectedId, isPaused, onSelect }: Props) {
  const handleBg = useCallback(() => onSelect(null), [onSelect]);

  // Sweep gradient sector (40° wide)
  const sweepRad = ((sweepAngle - 90) * Math.PI) / 180;
  const trailRad = sweepRad - (40 * Math.PI) / 180;
  const sweepX2 = SVG_CX + Math.cos(sweepRad) * SVG_RADIUS;
  const sweepY2 = SVG_CY + Math.sin(sweepRad) * SVG_RADIUS;
  const trailX2 = SVG_CX + Math.cos(trailRad) * SVG_RADIUS;
  const trailY2 = SVG_CY + Math.sin(trailRad) * SVG_RADIUS;

  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        width="100%" height="100%"
        style={{ maxWidth: 660, maxHeight: 660 }}
        onClick={handleBg}
      >
        <defs>
          <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#18b8d6" stopOpacity="0.35" />
            <stop offset="70%"  stopColor="#18b8d6" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#18b8d6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#071624" />
            <stop offset="100%" stopColor="#030a10" />
          </radialGradient>
        </defs>

        {/* Background */}
        <circle cx={SVG_CX} cy={SVG_CY} r={SVG_RADIUS + 12} fill="url(#bgGrad)" />
        <circle cx={SVG_CX} cy={SVG_CY} r={SVG_RADIUS + 12} fill="none" stroke="#0f2233" strokeWidth={2} />

        {/* Range rings */}
        {RINGS.map(rm => {
          const rPx = (rm / MAX_RANGE_M) * SVG_RADIUS;
          const isPerimeter = rm === PERIMETER_M;
          return (
            <g key={rm}>
              <circle
                cx={SVG_CX} cy={SVG_CY} r={rPx}
                fill="none"
                stroke={isPerimeter ? '#d97706' : '#0d2535'}
                strokeWidth={isPerimeter ? 1.5 : 1}
                strokeDasharray={isPerimeter ? '6 4' : undefined}
                opacity={isPerimeter ? 0.7 : 0.6}
              />
              <text
                x={SVG_CX + 5} y={SVG_CY - rPx + 11}
                fill={isPerimeter ? '#d97706' : '#2a4a5a'}
                fontSize={isPerimeter ? 9 : 8}
                fontFamily="JetBrains Mono,monospace"
                fontWeight={isPerimeter ? 700 : 400}
              >
                {rm}m{isPerimeter ? ' PERIMETER' : ''}
              </text>
            </g>
          );
        })}

        {/* Cross hairs */}
        <line x1={SVG_CX - SVG_RADIUS} y1={SVG_CY} x2={SVG_CX + SVG_RADIUS} y2={SVG_CY} stroke="#0d2535" strokeWidth={1} />
        <line x1={SVG_CX} y1={SVG_CY - SVG_RADIUS} x2={SVG_CX} y2={SVG_CY + SVG_RADIUS} stroke="#0d2535" strokeWidth={1} />

        {/* Degree ticks */}
        {Array.from({ length: 72 }, (_, i) => i * 5).map(deg => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const isMajor = deg % 30 === 0;
          const isCard  = deg % 90 === 0;
          const rIn  = SVG_RADIUS - (isCard ? 12 : isMajor ? 8 : 4);
          const rOut = SVG_RADIUS;
          return (
            <g key={deg}>
              <line
                x1={SVG_CX + Math.cos(rad) * rIn}  y1={SVG_CY + Math.sin(rad) * rIn}
                x2={SVG_CX + Math.cos(rad) * rOut} y2={SVG_CY + Math.sin(rad) * rOut}
                stroke={isCard ? '#18b8d6' : isMajor ? '#1e4060' : '#122030'}
                strokeWidth={isCard ? 2 : 1}
              />
              {isMajor && !isCard && (
                <text
                  x={SVG_CX + Math.cos(rad) * (SVG_RADIUS + 14)}
                  y={SVG_CY + Math.sin(rad) * (SVG_RADIUS + 14)}
                  fill="#2a5068" fontSize={8} fontFamily="JetBrains Mono,monospace"
                  textAnchor="middle" dominantBaseline="middle"
                >{deg}°</text>
              )}
            </g>
          );
        })}

        {/* Cardinal labels */}
        {CARDINALS.map(({ deg, label }) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          return (
            <text key={label}
              x={SVG_CX + Math.cos(rad) * (SVG_RADIUS + 26)}
              y={SVG_CY + Math.sin(rad) * (SVG_RADIUS + 26)}
              fill="#18b8d6" fontSize={13} fontWeight={700}
              fontFamily="JetBrains Mono,monospace"
              textAnchor="middle" dominantBaseline="middle"
            >{label}</text>
          );
        })}

        {/* Sweep trail sector */}
        {!isPaused && (
          <path
            d={`M ${SVG_CX} ${SVG_CY} L ${trailX2} ${trailY2} A ${SVG_RADIUS} ${SVG_RADIUS} 0 0 1 ${sweepX2} ${sweepY2} Z`}
            fill="url(#sweepGrad)"
          />
        )}

        {/* Sweep line */}
        <line
          x1={SVG_CX} y1={SVG_CY}
          x2={SVG_CX + Math.cos(sweepRad) * SVG_RADIUS}
          y2={SVG_CY + Math.sin(sweepRad) * SVG_RADIUS}
          stroke="#18b8d6" strokeWidth={1.8} opacity={isPaused ? 0.3 : 1}
        />

        {/* Tracks */}
        {tracks.map(t => (
          <TrackDot key={t.id} track={t} selected={t.id === selectedId} onSelect={onSelect} />
        ))}

        {/* Centre reticle */}
        <circle cx={SVG_CX} cy={SVG_CY} r={4} fill="none" stroke="#18b8d6" strokeWidth={1.5} />
        <line x1={SVG_CX - 8} y1={SVG_CY} x2={SVG_CX + 8} y2={SVG_CY} stroke="#18b8d6" strokeWidth={1.5} />
        <line x1={SVG_CX} y1={SVG_CY - 8} x2={SVG_CX} y2={SVG_CY + 8} stroke="#18b8d6" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
