import { useState, useCallback, useEffect } from 'react';
import type { Personnel, AccessLevel, PersonnelStatus } from '../types';
import { uid } from '../utils/radar';

const KEY = 'radar_personnel';

const DEMO: Personnel[] = [
  { id: uid(), name: 'Alice Johnson', employeeId: 'EMP-001', role: 'Security Manager',    department: 'Alpha Company',  accessLevel: 'SECRET',       status: 'ACTIVE',   phone: '+91-98100-00001', email: 'alice.j@base.mil',   avatarColor: '#22c55e', addedAt: Date.now() - 86400000 * 5 },
  { id: uid(), name: 'Rajesh Kumar',  employeeId: 'EMP-002', role: 'Patrol Officer',      department: 'Bravo Unit',     accessLevel: 'CONFIDENTIAL', status: 'ACTIVE',   phone: '+91-98100-00002', email: 'rajesh.k@base.mil',  avatarColor: '#3b82f6', addedAt: Date.now() - 86400000 * 4 },
  { id: uid(), name: 'Priya Nair',    employeeId: 'EMP-003', role: 'Gate Supervisor',     department: 'Charlie Gate',   accessLevel: 'RESTRICTED',   status: 'ACTIVE',   phone: '+91-98100-00003', email: 'priya.n@base.mil',   avatarColor: '#f59e0b', addedAt: Date.now() - 86400000 * 3 },
  { id: uid(), name: 'David Chen',    employeeId: 'EMP-004', role: 'QRT Commander',       department: 'Delta Force',    accessLevel: 'SECRET',       status: 'INACTIVE', phone: '+91-98100-00004', email: 'david.c@base.mil',   avatarColor: '#8b5cf6', addedAt: Date.now() - 86400000 * 2 },
];

function load(): Personnel[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Personnel[];
  } catch { /* ignore */ }
  const demo = DEMO;
  localStorage.setItem(KEY, JSON.stringify(demo));
  return demo;
}

function save(p: Personnel[]) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<Personnel[]>(load);

  const persist = useCallback((next: Personnel[]) => {
    save(next);
    setPersonnel(next);
  }, []);

  const addPersonnel = useCallback((p: Omit<Personnel, 'id' | 'addedAt'>) => {
    persist([...personnel, { ...p, id: uid(), addedAt: Date.now() }]);
  }, [personnel, persist]);

  const updatePersonnel = useCallback((id: string, patch: Partial<Personnel>) => {
    persist(personnel.map(p => p.id === id ? { ...p, ...patch } : p));
  }, [personnel, persist]);

  const removePersonnel = useCallback((id: string) => {
    persist(personnel.filter(p => p.id !== id));
  }, [personnel, persist]);

  const deactivatePersonnel = useCallback((id: string) => {
    persist(personnel.map(p => p.id === id ? { ...p, status: 'INACTIVE' as PersonnelStatus } : p));
  }, [personnel, persist]);

  return { personnel, addPersonnel, updatePersonnel, removePersonnel, deactivatePersonnel };
}

export type { AccessLevel };
