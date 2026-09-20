// ── All TypeScript types for the Radar Security Scanner ──────────────────────

export type TrackType = 'AUTHORIZED' | 'UNKNOWN_PERSON' | 'ANIMAL' | 'UNKNOWN_OBJECT';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type PersonnelStatus = 'ACTIVE' | 'INACTIVE';
export type AccessLevel = 'PUBLIC' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET';
export type Scenario =
  | 'STANDARD_MONITORING'
  | 'AUTHORIZED_ENTRY'
  | 'UNKNOWN_PERSON'
  | 'WILDLIFE'
  | 'MULTI_SENSOR';

export interface Personnel {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  department: string;
  accessLevel: AccessLevel;
  phone: string;
  email: string;
  avatarColor: string;
  status: PersonnelStatus;
  addedAt: number;
}

export interface TrailPoint { x: number; y: number; }

export interface Track {
  id: string;
  type: TrackType;
  x: number;           // metres from centre, East positive
  y: number;           // metres from centre, North positive
  bearing: number;     // degrees 0–360
  distance: number;    // metres from centre
  speed: number;       // km/h
  heading: number;     // direction of travel degrees
  confidence: number;  // 0–100
  firstDetected: number;
  lastSeen: number;
  trail: TrailPoint[];
  personnelId?: string;
  animalType?: string;
  insidePerimeter: boolean;
  alertFired?: boolean;
}

export interface RadarAlert {
  id: string;
  trackId: string;
  type: TrackType;
  severity: AlertSeverity;
  message: string;
  detail: string;
  timestamp: number;
  acknowledged: boolean;
  dismissed: boolean;
}
