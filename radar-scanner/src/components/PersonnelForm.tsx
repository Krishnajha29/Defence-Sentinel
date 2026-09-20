import React, { useState } from 'react';
import type { Personnel, AccessLevel, PersonnelStatus } from '../types';
import { uid } from '../utils/radar';

interface Props {
  initial?: Personnel;
  onSave: (p: Omit<Personnel, 'id' | 'addedAt'>) => void;
  onClose: () => void;
}

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];
const LEVELS: AccessLevel[] = ['PUBLIC','RESTRICTED','CONFIDENTIAL','SECRET'];

export default function PersonnelForm({ initial, onSave, onClose }: Props) {
  const [name,        setName]       = useState(initial?.name        ?? '');
  const [employeeId,  setEmpId]      = useState(initial?.employeeId  ?? '');
  const [role,        setRole]       = useState(initial?.role        ?? '');
  const [department,  setDept]       = useState(initial?.department  ?? '');
  const [accessLevel, setAccess]     = useState<AccessLevel>(initial?.accessLevel ?? 'RESTRICTED');
  const [phone,       setPhone]      = useState(initial?.phone       ?? '');
  const [email,       setEmail]      = useState(initial?.email       ?? '');
  const [avatarColor, setAvatar]     = useState(initial?.avatarColor ?? '#22c55e');
  const [status,      setStatus]     = useState<PersonnelStatus>(initial?.status ?? 'ACTIVE');
  const [errors,      setErrors]     = useState<Record<string,string>>({});

  const validate = () => {
    const e: Record<string,string> = {};
    if (!name.trim())       e.name = 'Name is required';
    if (!employeeId.trim()) e.employeeId = 'Employee ID is required';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ name, employeeId, role, department, accessLevel, phone, email, avatarColor, status });
    onClose();
  };

  const inp = 'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 font-mono';
  const lbl = 'text-[9px] text-gray-500 font-bold tracking-widest mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-950 border border-cyan-800/50 rounded-lg p-5 w-[480px] max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-cyan-400 tracking-widest">
            {initial ? 'EDIT PERSONNEL' : 'ADD PERSONNEL'}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>FULL NAME *</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alice Johnson" />
            {errors.name && <p className="text-red-400 text-[9px] mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className={lbl}>EMPLOYEE ID *</label>
            <input className={inp} value={employeeId} onChange={e => setEmpId(e.target.value)} placeholder="EMP-001" />
            {errors.employeeId && <p className="text-red-400 text-[9px] mt-0.5">{errors.employeeId}</p>}
          </div>
          <div>
            <label className={lbl}>ACCESS LEVEL</label>
            <select className={inp} value={accessLevel} onChange={e => setAccess(e.target.value as AccessLevel)}>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>ROLE / TITLE</label>
            <input className={inp} value={role} onChange={e => setRole(e.target.value)} placeholder="Patrol Officer" />
          </div>
          <div>
            <label className={lbl}>DEPARTMENT / UNIT</label>
            <input className={inp} value={department} onChange={e => setDept(e.target.value)} placeholder="Alpha Company" />
          </div>
          <div>
            <label className={lbl}>PHONE</label>
            <input className={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91-98100-00000" />
          </div>
          <div>
            <label className={lbl}>EMAIL</label>
            <input className={inp} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@base.mil" />
          </div>
          <div>
            <label className={lbl}>STATUS</label>
            <select className={inp} value={status} onChange={e => setStatus(e.target.value as PersonnelStatus)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
          <div>
            <label className={lbl}>AVATAR COLOUR</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => setAvatar(c)}
                  style={{ background: c, border: c === avatarColor ? '2px solid #fff' : '2px solid transparent' }}
                  className="w-6 h-6 rounded-full transition-all"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="btn-gray">CANCEL</button>
          <button onClick={handleSave} className="btn-cyan">SAVE PERSONNEL</button>
        </div>
      </div>
    </div>
  );
}
