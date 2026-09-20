import React from 'react';
import type { Track, Personnel, RadarAlert } from '../types';
import { formatBearing, formatTime } from '../utils/radar';

interface Props {
  track: Track | null;
  personnel: Personnel[];
  alerts: RadarAlert[];
  onAcknowledge: (alertId: string) => void;
  onDismiss:     (alertId: string) => void;
}

function Row({ label, value, valueClass = '' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="grid grid-cols-2 gap-1 py-0.5">
      <span className="text-[8px] text-gray-500 font-bold tracking-wide">{label}</span>
      <span className={`text-[8px] font-bold ${valueClass || 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

export default function TrackDetails({ track, personnel, alerts, onAcknowledge, onDismiss }: Props) {
  if (!track) {
    return (
      <div className="panel flex items-center justify-center h-40 text-gray-600 text-[9px] tracking-widest">
        SELECT A TRACK ON THE RADAR
      </div>
    );
  }

  const p = track.personnelId ? personnel.find(x => x.id === track.personnelId) : null;
  const trackAlerts = alerts.filter(a => a.trackId === track.id && !a.dismissed);

  const headerColor =
    track.type === 'AUTHORIZED'     ? 'text-green-400 border-green-700/50' :
    track.type === 'UNKNOWN_PERSON' ? 'text-red-400 border-red-700/50'     :
    track.type === 'ANIMAL'         ? 'text-amber-400 border-amber-700/50' : 'text-cyan-400 border-cyan-700/50';

  const typeLabel =
    track.type === 'AUTHORIZED'     ? '✓ AUTHORIZED PERSON'     :
    track.type === 'UNKNOWN_PERSON' ? '⚠ UNKNOWN — VERIFICATION REQUIRED' :
    track.type === 'ANIMAL'         ? '▲ WILDLIFE DETECTED'     : '□ CLASSIFICATION PENDING';

  return (
    <div className={`panel border-l-2 ${track.type === 'AUTHORIZED' ? 'border-l-green-600' : track.type === 'UNKNOWN_PERSON' ? 'border-l-red-600' : track.type === 'ANIMAL' ? 'border-l-amber-600' : 'border-l-cyan-600'}`}>
      {/* Header */}
      <div className={`px-3 py-2 border-b ${headerColor}`}>
        <div className={`text-[9px] font-bold tracking-widest ${headerColor.split(' ')[0]}`}>{typeLabel}</div>
        <div className="text-white font-bold text-xs mt-0.5">{track.id}</div>
      </div>

      {/* Track kinematic data */}
      <div className="px-3 py-2 border-b border-gray-700/40">
        <div className="text-[8px] text-gray-500 font-bold tracking-widest mb-1">TRACK DATA</div>
        <Row label="DISTANCE"        value={`${Math.round(track.distance)} m`} />
        <Row label="BEARING"         value={formatBearing(track.bearing)} />
        <Row label="SPEED"           value={`${track.speed.toFixed(1)} km/h`} />
        <Row label="HEADING"         value={`${Math.round(track.heading)}°`} />
        <Row label="CONFIDENCE"      value={`${track.confidence}%`} />
        <Row label="PERIMETER"       value={track.insidePerimeter ? 'INSIDE' : 'OUTSIDE'} valueClass={track.insidePerimeter ? 'text-amber-400' : 'text-gray-400'} />
        <Row label="FIRST DETECTED"  value={formatTime(track.firstDetected)} />
        <Row label="LAST SEEN"       value={formatTime(track.lastSeen)} />
      </div>

      {/* Authorized person full record */}
      {track.type === 'AUTHORIZED' && p && (
        <div className="px-3 py-2 border-b border-gray-700/40">
          <div className="text-[8px] text-green-500 font-bold tracking-widest mb-2">AUTHORIZED PERSONNEL RECORD</div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                 style={{ background: p.avatarColor }}>
              {p.name.split(' ').map(w => w[0]).join('').slice(0,2)}
            </div>
            <div>
              <div className="text-white font-bold text-[11px]">{p.name}</div>
              <div className="text-green-400 text-[8px]">{p.employeeId}</div>
            </div>
          </div>
          <Row label="ROLE"         value={p.role} />
          <Row label="DEPARTMENT"   value={p.department} />
          <Row label="ACCESS LEVEL" value={p.accessLevel} valueClass={p.accessLevel === 'SECRET' ? 'text-red-400' : p.accessLevel === 'CONFIDENTIAL' ? 'text-amber-400' : 'text-cyan-400'} />
          <Row label="PHONE"        value={p.phone} />
          <Row label="EMAIL"        value={p.email} />
          <Row label="STATUS"       value={p.status} valueClass={p.status === 'ACTIVE' ? 'text-green-400' : 'text-gray-500'} />
        </div>
      )}

      {/* Unknown person */}
      {track.type === 'UNKNOWN_PERSON' && (
        <div className="px-3 py-2 border-b border-gray-700/40">
          <div className="text-[8px] text-red-400 font-bold tracking-widest mb-1 blink-alert">⚠ UNKNOWN — NO TAG MATCH</div>
          <Row label="RISK"    value="VERIFICATION REQUIRED" valueClass="text-red-400 font-bold" />
          <Row label="ACTION"  value="Operator review needed" valueClass="text-amber-300" />
        </div>
      )}

      {/* Animal */}
      {track.type === 'ANIMAL' && (
        <div className="px-3 py-2 border-b border-gray-700/40">
          <div className="text-[8px] text-amber-400 font-bold tracking-widest mb-1">FAUNA IDENTIFICATION</div>
          <Row label="TYPE"   value={track.animalType ?? 'Unknown Animal'} valueClass="text-amber-300" />
          <Row label="FILTER" value="FAUNA — NO THREAT" valueClass="text-green-400" />
        </div>
      )}

      {/* Unknown object */}
      {track.type === 'UNKNOWN_OBJECT' && (
        <div className="px-3 py-2 border-b border-gray-700/40">
          <div className="text-[8px] text-cyan-400 font-bold tracking-widest mb-1">OBJECT CLASSIFICATION</div>
          <Row label="STATUS" value="CLASSIFICATION PENDING" valueClass="text-cyan-300" />
        </div>
      )}

      {/* Active alerts for this track */}
      {trackAlerts.length > 0 && (
        <div className="px-3 py-2">
          <div className="text-[8px] text-gray-500 font-bold tracking-widest mb-1">ACTIVE ALERTS ({trackAlerts.length})</div>
          {trackAlerts.map(a => (
            <div key={a.id} className="flex items-center justify-between mb-1">
              <span className={`text-[8px] ${a.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`}>{a.message}</span>
              <div className="flex gap-1">
                {!a.acknowledged && <button onClick={() => onAcknowledge(a.id)} className="text-[7px] text-cyan-400 border border-cyan-800 rounded px-1 hover:bg-cyan-900/30">ACK</button>}
                <button onClick={() => onDismiss(a.id)} className="text-[7px] text-gray-500 border border-gray-700 rounded px-1 hover:bg-gray-800">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
