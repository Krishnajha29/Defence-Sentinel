import React, { useState } from 'react';
import type { Personnel } from '../types';
import PersonnelForm from './PersonnelForm';

interface Props {
  personnel: Personnel[];
  onAdd:        (p: Omit<Personnel,'id'|'addedAt'>) => void;
  onUpdate:     (id: string, patch: Partial<Personnel>) => void;
  onRemove:     (id: string) => void;
  onDeactivate: (id: string) => void;
}

export default function PersonnelPanel({ personnel, onAdd, onUpdate, onRemove, onDeactivate }: Props) {
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<Personnel | undefined>();
  const [showAll,    setShowAll]    = useState(false);

  const active   = personnel.filter(p => p.status === 'ACTIVE');
  const inactive = personnel.filter(p => p.status === 'INACTIVE');

  const handleEdit = (p: Personnel) => { setEditTarget(p); setShowForm(true); };
  const handleSave = (data: Omit<Personnel,'id'|'addedAt'>) => {
    if (editTarget) onUpdate(editTarget.id, data);
    else            onAdd(data);
    setEditTarget(undefined);
  };

  const renderRow = (p: Personnel, mini = false) => (
    <div key={p.id} className={`flex items-center gap-2 py-2 border-b border-gray-800/60 ${mini ? 'px-0' : 'px-3'}`}>
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
           style={{ background: p.avatarColor }}>
        {p.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-white truncate">{p.name}</span>
          <span className={`text-[7px] px-1 rounded font-bold ${p.status === 'ACTIVE' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            {p.status}
          </span>
        </div>
        <div className="text-[8px] text-gray-500 truncate">{p.employeeId} · {p.role}</div>
        {!mini && <div className="text-[8px] text-cyan-600 truncate">{p.department} · {p.accessLevel}</div>}
      </div>
      {!mini && (
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => handleEdit(p)} className="text-[8px] text-cyan-500 hover:text-cyan-300 px-1">EDIT</button>
          <button onClick={() => onDeactivate(p.id)} className="text-[8px] text-amber-500 hover:text-amber-300 px-1">DEACT</button>
          <button onClick={() => onRemove(p.id)} className="text-[8px] text-red-500 hover:text-red-300 px-1">DEL</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="panel flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
          <span className="text-xs font-bold tracking-widest text-cyan-400">AUTHORIZED PERSONNEL</span>
          <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-700/40 rounded px-1.5 py-0.5">
            {active.length} ACTIVE
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-3 py-2 border-b border-gray-700/40">
          <button onClick={() => { setEditTarget(undefined); setShowForm(true); }} className="btn-cyan flex-1 text-center text-[9px]">+ ADD PERSONNEL</button>
          <button onClick={() => setShowAll(true)} className="btn-gray flex-1 text-center text-[9px]">VIEW ALL ({personnel.length})</button>
        </div>

        {/* Active list (compact) */}
        <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
          {active.slice(0, 5).map(p => renderRow(p, true))}
          {active.length === 0 && <div className="text-[9px] text-gray-600 px-3 py-3">No active personnel</div>}
        </div>
      </div>

      {/* Add/Edit form modal */}
      {showForm && (
        <PersonnelForm
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(undefined); }}
        />
      )}

      {/* View All modal */}
      {showAll && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowAll(false)}>
          <div className="bg-gray-950 border border-cyan-800/50 rounded-lg w-[560px] max-h-[80vh] flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-sm font-bold text-cyan-400 tracking-widest">ALL PERSONNEL ({personnel.length})</span>
              <button onClick={() => setShowAll(false)} className="text-gray-500 hover:text-white text-lg">×</button>
            </div>
            <div className="overflow-y-auto px-4 divide-y divide-gray-800">
              {active.length > 0 && (
                <>
                  <div className="text-[9px] text-green-500 font-bold py-2 tracking-widest">ACTIVE ({active.length})</div>
                  {active.map(p => renderRow(p))}
                </>
              )}
              {inactive.length > 0 && (
                <>
                  <div className="text-[9px] text-gray-500 font-bold py-2 tracking-widest">INACTIVE ({inactive.length})</div>
                  {inactive.map(p => renderRow(p))}
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => { setShowAll(false); setEditTarget(undefined); setShowForm(true); }} className="btn-cyan text-[10px]">+ ADD NEW</button>
              <button onClick={() => setShowAll(false)} className="btn-gray text-[10px]">CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
