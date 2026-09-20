import React from 'react';
import type { Track } from '../types';
import { formatBearing } from '../utils/radar';

interface Props {
  tracks: Track[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function dot(type: Track['type']) {
  switch (type) {
    case 'AUTHORIZED':     return 'bg-green-500';
    case 'UNKNOWN_PERSON': return 'bg-red-500';
    case 'ANIMAL':         return 'bg-amber-500';
    case 'UNKNOWN_OBJECT': return 'bg-cyan-500';
  }
}
function label(type: Track['type']) {
  switch (type) {
    case 'AUTHORIZED':     return { text: 'AUTHORIZED',  cls: 'text-green-400' };
    case 'UNKNOWN_PERSON': return { text: 'UNKNOWN',     cls: 'text-red-400 blink-alert' };
    case 'ANIMAL':         return { text: 'WILDLIFE',    cls: 'text-amber-400' };
    case 'UNKNOWN_OBJECT': return { text: 'OBJECT',      cls: 'text-cyan-400' };
  }
}

export default function TrackList({ tracks, selectedId, onSelect }: Props) {
  return (
    <div className="panel flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-bold tracking-widest text-cyan-400">LIVE TRACKS</span>
        <span className="text-xs bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 rounded px-2 py-0.5">
          {tracks.length.toString().padStart(2, '0')} ACTIVE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-gray-600 text-xs">NO ACTIVE TRACKS</div>
        )}
        {tracks.map(t => {
          const lbl = label(t.type);
          const isSel = t.id === selectedId;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-800/60 transition-colors
                ${isSel ? 'bg-cyan-900/20 border-l-2 border-l-cyan-500' : 'hover:bg-gray-800/40'}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${dot(t.type)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{t.id.slice(-8)}</span>
                  <span className={`text-[9px] font-bold ${lbl.cls}`}>{lbl.text}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 mt-0.5">
                  <span className="text-[9px] text-gray-500">Dist: <b className="text-gray-300">{Math.round(t.distance)}m</b></span>
                  <span className="text-[9px] text-gray-500">Spd: <b className="text-gray-300">{t.speed.toFixed(1)}kph</b></span>
                  <span className="text-[9px] text-gray-500">Brg: <b className="text-gray-300">{formatBearing(t.bearing)}</b></span>
                  <span className="text-[9px] text-gray-500">Conf: <b className="text-gray-300">{t.confidence}%</b></span>
                </div>
                {t.insidePerimeter && (
                  <div className={`text-[8px] mt-0.5 font-bold ${t.type === 'UNKNOWN_PERSON' ? 'text-red-400 blink-alert' : t.type === 'ANIMAL' ? 'text-amber-400' : 'text-green-400'}`}>
                    ⬤ INSIDE PERIMETER
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="border-t border-gray-700/40 px-3 py-2 grid grid-cols-2 gap-1">
        {[['AUTHORIZED','bg-green-500'],['UNKNOWN','bg-red-500'],['WILDLIFE','bg-amber-500'],['OBJECT','bg-cyan-500']].map(([l,c])=>(
          <div key={l} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${c}`} />
            <span className="text-[8px] text-gray-500">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
