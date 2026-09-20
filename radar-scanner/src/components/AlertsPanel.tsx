import React from 'react';
import type { RadarAlert } from '../types';
import { formatTime } from '../utils/radar';

interface Props {
  alerts: RadarAlert[];
  onAcknowledge: (id: string) => void;
  onDismiss:     (id: string) => void;
}

export default function AlertsPanel({ alerts, onAcknowledge, onDismiss }: Props) {
  const active    = alerts.filter(a => !a.dismissed);
  const critical  = active.filter(a => a.severity === 'CRITICAL');

  return (
    <div className="panel flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-bold tracking-widest text-cyan-400">SIMULATED SECURITY ALERTS</span>
        {critical.length > 0 && (
          <span className="text-[9px] bg-red-900/50 text-red-400 border border-red-700/50 rounded px-1.5 py-0.5 blink-alert font-bold">
            {critical.length} CRITICAL
          </span>
        )}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {active.length === 0 && (
          <div className="flex items-center justify-center h-20 text-gray-600 text-[9px]">NO ACTIVE ALERTS</div>
        )}
        {active.map(a => {
          const borderColor =
            a.severity === 'CRITICAL' ? 'border-l-red-500'  :
            a.severity === 'WARNING'  ? 'border-l-amber-500': 'border-l-green-500';
          const bgColor =
            a.severity === 'CRITICAL' ? 'bg-red-950/30'   :
            a.severity === 'WARNING'  ? 'bg-amber-950/30' : 'bg-green-950/20';
          const textColor =
            a.severity === 'CRITICAL' ? 'text-red-400'    :
            a.severity === 'WARNING'  ? 'text-amber-400'  : 'text-green-400';

          return (
            <div key={a.id} className={`border-b border-gray-800/60 border-l-2 ${borderColor} ${bgColor} px-3 py-2`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`text-[9px] font-bold ${textColor} ${a.severity === 'CRITICAL' && !a.acknowledged ? 'blink-alert' : ''}`}>
                    [{a.severity}] {a.message}
                  </div>
                  <div className="text-[8px] text-gray-500 mt-0.5">{a.detail}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[7px] text-gray-600">{formatTime(a.timestamp)}</span>
                    {a.acknowledged && <span className="text-[7px] text-green-600 font-bold">✓ ACKNOWLEDGED</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {!a.acknowledged && (
                    <button onClick={() => onAcknowledge(a.id)}
                      className="text-[7px] px-1.5 py-0.5 border border-cyan-700 text-cyan-400 rounded hover:bg-cyan-900/30 font-bold">
                      ACK
                    </button>
                  )}
                  <button onClick={() => onDismiss(a.id)}
                    className="text-[7px] px-1.5 py-0.5 border border-gray-700 text-gray-500 rounded hover:bg-gray-800/40 font-bold">
                    DISMISS
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="px-3 py-2 border-t border-gray-700/40">
        <p className="text-[7px] text-gray-600 leading-tight">
          SIMULATION ONLY — NOT CONNECTED TO REAL CAMERAS, BIOMETRIC SYSTEMS, OR SECURITY NETWORKS.
        </p>
      </div>
    </div>
  );
}
