import React from 'react';
import type { Scenario, RadarAlert } from '../types';

interface Props {
  scenario:    Scenario;
  isPaused:    boolean;
  alerts:      RadarAlert[];
  onScenario:  (s: Scenario) => void;
  onPause:     () => void;
  onResume:    () => void;
  onReset:     () => void;
  onFalseAlarm:() => void;
  onReport:    () => void;
}

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'STANDARD_MONITORING', label: 'STANDARD MONITORING' },
  { id: 'AUTHORIZED_ENTRY',    label: 'AUTHORIZED ENTRY'    },
  { id: 'UNKNOWN_PERSON',      label: 'UNKNOWN PERSON'      },
  { id: 'WILDLIFE',            label: 'WILDLIFE'            },
  { id: 'MULTI_SENSOR',        label: 'MULTI-SENSOR EVENT'  },
];

export default function ScenarioControls({
  scenario, isPaused, alerts,
  onScenario, onPause, onResume, onReset, onFalseAlarm, onReport
}: Props) {
  const activeCount = alerts.filter(a => !a.dismissed).length;

  return (
    <div className="border-t border-gray-700/50 bg-gray-950/80 px-3 py-2 flex flex-wrap items-center gap-2">
      {/* Scenario buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[8px] text-gray-600 font-bold tracking-widest mr-1">SCENARIO:</span>
        {SCENARIOS.map(s => (
          <button key={s.id}
            onClick={() => onScenario(s.id)}
            className={`btn text-[9px] py-1 px-2 ${s.id === scenario ? 'btn-active border-cyan-400 text-cyan-300 bg-cyan-900/40' : 'btn-cyan'}`}
          >{s.label}</button>
        ))}
      </div>

      <div className="h-5 w-px bg-gray-700 mx-1" />

      {/* Controls */}
      <button onClick={isPaused ? onResume : onPause}
        className={`btn text-[9px] py-1 px-2 ${isPaused ? 'btn-green' : 'btn-amber'}`}>
        {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
      </button>
      <button onClick={onReset} className="btn-gray btn text-[9px] py-1 px-2">↺ RESET</button>
      <button onClick={onFalseAlarm} className="btn-amber btn text-[9px] py-1 px-2">⚡ FALSE ALARM TEST</button>
      <button onClick={onReport} className="btn-cyan btn text-[9px] py-1 px-2">📄 INCIDENT REPORT</button>

      {/* Status */}
      <div className="ml-auto flex items-center gap-3">
        {activeCount > 0 && (
          <span className="text-[9px] text-red-400 font-bold blink-alert">{activeCount} ACTIVE ALERT{activeCount > 1 ? 'S' : ''}</span>
        )}
        <span className={`text-[9px] font-bold ${isPaused ? 'text-amber-400' : 'text-green-400'}`}>
          {isPaused ? '⏸ PAUSED' : '● SCANNING'}
        </span>
      </div>
    </div>
  );
}
