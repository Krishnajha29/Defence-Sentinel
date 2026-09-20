# Defence Sentinel — Adaptive RF/ESM Radar Security System

[![SIH 2026](https://img.shields.io/badge/SIH-2026--SIH26055-blue?style=flat-square)](https://www.sih.gov.in/)
[![Node.js](https://img.shields.io/badge/Node.js-v24-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-4.5-646cff?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

> **SIMULATION / PROTOTYPE — NOT FOR OPERATIONAL DEPLOYMENT**  
> This system is a research prototype built for Smart India Hackathon 2026 (Problem Statement SIH26055).  
> It is not connected to real cameras, biometric systems, military networks, or any operational security infrastructure.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Module 1 — ESM-ASTRA (Node.js Backend)](#module-1--esm-astra-nodejs-backend)
- [Module 2 — Radar Scanner (React Frontend)](#module-2--radar-scanner-react-frontend)
- [Core Algorithm — Recency-Augmented UCB1](#core-algorithm--recency-augmented-ucb1)
- [Radar Detection Logic](#radar-detection-logic)
- [Quick Start](#quick-start)
- [Screenshots](#screenshots)
- [API Reference](#api-reference)
- [Test Suite](#test-suite)
- [Team](#team)

---

## Overview

**Defence Sentinel** is a dual-module prototype system that demonstrates:

1. **Adaptive RF/ESM Scan Scheduling** — The primary SIH26055 contribution. A `Recency-Augmented UCB1` bandit algorithm dynamically allocates radar dwell time across frequency bands, maximising threat intercept probability while minimising scan latency.

2. **Tactical Radar Security Scanner** — A fully interactive 360° perimeter radar that classifies entities as **Authorized Persons** (green), **Unknown Persons** (red), **Wildlife** (amber), or **Unknown Objects** (cyan) in real time, with alert management and personnel database.

**Key capabilities:**
- Adaptive frequency-agile scan scheduler (novel contribution over standard EW receivers)
- Simulated multi-sensor fusion: Radar + Optical (IR camera) + RF emitter detection + Personnel tag verification
- Real-time threat classification and alert generation
- Authorized personnel management with localStorage persistence
- Incident reporting (JSON export)
- 12-suite automated test framework (A–L)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEFENCE SENTINEL                             │
│                                                                  │
│  ┌──────────────────────────────────┐                           │
│  │  MODULE 1: ESM-ASTRA (Port 8080) │                           │
│  │                                  │                           │
│  │  ┌─────────────────────────┐     │                           │
│  │  │ Recency-Augmented UCB1  │     │                           │
│  │  │ Scan Scheduler          │     │  WebSocket (20 Hz)        │
│  │  │ Q(b) = μ̂ + c√(lnN/Nᵦ) │─────┼──────────────────────►   │
│  │  │      + λ·tanh(Δt/τ)     │     │  C2_FRAME broadcast      │
│  │  └─────────────────────────┘     │                           │
│  │                                  │                           │
│  │  ┌─────────────────────────┐     │                           │
│  │  │ Multi-Sensor Simulation │     │                           │
│  │  │ - 7 SimulatedEntities   │     │                           │
│  │  │ - 25 Hz physics tick    │     │                           │
│  │  │ - Incident Engine       │     │                           │
│  │  └─────────────────────────┘     │                           │
│  └──────────────────────────────────┘                           │
│                                                                  │
│  ┌──────────────────────────────────┐                           │
│  │  MODULE 2: RADAR SCANNER (5173)  │                           │
│  │  React + TypeScript + Vite       │                           │
│  │  - 360° SVG radar display        │                           │
│  │  - Personnel DB (localStorage)   │                           │
│  │  - Alert management              │                           │
│  │  - Scenario simulation           │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Defence-Sentinel/
│
├── defense_radar_system/          # Module 1 — ESM-ASTRA Node.js backend
│   ├── server.js                  # Main server (Express + WebSocket, 1250+ lines)
│   ├── package.json
│   ├── public/                    # Frontend SPA (tactical dashboard)
│   │   ├── index.html             # 7-page tactical command interface
│   │   └── js/
│   │       ├── app.js             # TacticalC2App — main SPA controller
│   │       ├── radar.js           # TacticalRadarScope — SVG/Canvas radar
│   │       ├── camera.js          # OpticalSurveillanceMonitor (webcam + IR)
│   │       ├── rf_spectrum.js     # RF spectrum visualiser
│   │       └── analytics.js      # Analytics / benchmark workspace
│   ├── server/                    # Backend modules
│   │   ├── scheduler_engine.js    # Recency-Augmented UCB1 scheduler (CORE)
│   │   ├── benchmark_runner.js    # Statistical benchmark framework
│   │   ├── incident_engine.js     # Alert / incident management
│   │   └── prng.js               # Deterministic Mulberry32 PRNG
│   └── test/
│       └── run_all_tests.js       # 12-suite automated test runner (A–L)
│
├── radar-scanner/                 # Module 2 — Standalone React radar app
│   ├── src/
│   │   ├── App.tsx               # Root layout component
│   │   ├── main.tsx              # React entry point
│   │   ├── index.css             # Tailwind + custom animations
│   │   ├── types/index.ts        # All TypeScript interfaces
│   │   ├── utils/
│   │   │   ├── radar.ts          # Polar↔Cartesian math, SVG scaling
│   │   │   └── scenarios.ts      # Scenario builders + physics step
│   │   ├── hooks/
│   │   │   ├── usePersonnel.ts   # Personnel CRUD + localStorage
│   │   │   ├── useAlerts.ts      # Alert management + localStorage
│   │   │   └── useSimulation.ts  # Track physics, sweep, perimeter breach
│   │   └── components/
│   │       ├── RadarScope.tsx    # 360° animated SVG radar
│   │       ├── TrackList.tsx     # Left panel — live track list
│   │       ├── TrackDetails.tsx  # Right panel — selected track details
│   │       ├── PersonnelPanel.tsx# Right panel — personnel management
│   │       ├── PersonnelForm.tsx # Add/edit personnel modal form
│   │       ├── AlertsPanel.tsx   # Right panel — security alerts
│   │       └── ScenarioControls.tsx # Bottom bar — scenario/control buttons
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── tailwind.config.js
│
└── README.md
```

---

## Module 1 — ESM-ASTRA (Node.js Backend)

### Technology Stack
- **Node.js v24** — Runtime
- **Express 4** — HTTP API server
- **ws 8** — WebSocket server (20 Hz C2 frame broadcast)
- **Vanilla JS SPA** — Frontend dashboard (no framework dependency)

### Simulated Entities (7 tracks)

| Track ID | Type | Classification | Description |
|---|---|---|---|
| TRK-014 | PERSON | ✅ VERIFIED | Lt. R. Sharma — Alpha Company (TAG-ALPHA-01) |
| TRK-007 | PERSON | ✅ VERIFIED | Sep. K. Patel — Charlie Section (TAG-CHARLIE-01) |
| TRK-042 | PERSON | ✅ VERIFIED | Hav. D. Singh — Bravo Platoon (TAG-BRAVO-02) |
| TRK-033 | VEHICLE | ✅ VERIFIED | QRT Patrol Vehicle 4 (TAG-VEHICLE-04) |
| TRK-021 | PERSON | 🔴 ANOMALOUS | **Unauthorized — no tag match — inside perimeter** |
| TRK-055 | ANOMALOUS_OBJECT | 🔴 ANOMALOUS | Unknown object inside restricted zone |
| TRK-019 | WILDLIFE | 🟡 WILDLIFE | Animal / fauna contact — filtered |

### Radar Track Symbols

| Symbol | Colour | Classification |
|---|---|---|
| ● double circle | 🟢 Green | VERIFIED — authorized person / vehicle |
| ◆ diamond (pulsing) | 🔴 Red | ANOMALOUS — unauthorized / restricted zone breach |
| ▲ triangle | 🟡 Amber | WILDLIFE — animal / fauna |
| □ square | ⬜ Grey | UNIDENTIFIED — outside perimeter |

### REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/status` | Full simulation state snapshot |
| GET | `/api/sitrep` | Tactical situation report |
| GET | `/api/entities` | Live entity positions and fusion state |
| GET | `/api/analytics` | Scheduler performance metrics |
| GET | `/api/incidents` | Active and resolved incidents |
| POST | `/api/reset` | Reset simulation to initial state |
| POST | `/api/scenario/:name` | Switch operating scenario |

### WebSocket Protocol

Connect to `ws://localhost:8080/ws/c2` — receives `C2_FRAME` at 20 Hz:

```json
{
  "type": "C2_FRAME",
  "simState": { "radarSweepAngle": 234.5, "isRunning": true, ... },
  "entities": [ { "id": "TRK-021", "fusion": { "classification": "ANOMALOUS" }, ... } ],
  "incidents": [ { "id": "INC-SIM-2026-0089", "status": "ACTIVE", ... } ],
  "personnelDb": [ { "tagId": "TAG-ALPHA-01", "name": "Lt. R. Sharma", ... } ],
  "analytics": { ... }
}
```

### Running Module 1

```bash
cd defense_radar_system
npm install
node server.js
# → http://localhost:8080
```

---

## Module 2 — Radar Scanner (React Frontend)

### Technology Stack
- **React 18** + **TypeScript 5** — UI framework
- **Vite 4** — Build tool / dev server
- **Tailwind CSS 3** — Utility-first styling
- **localStorage** — No backend required; all data persisted client-side

### Features

#### 360° Radar Display (SVG)
- Smooth rotating sweep beam (animated)
- Range rings: 100m · 200m · 300m · **450m perimeter (amber dashed)** · 600m · 800m
- Compass: N · E · S · W with degree labels every 30°
- Coloured track dots with motion trails (last 14 positions)
- Click any dot to select → shows full detail panel

#### Track Classification
| Type | Dot | Colour | Alert on perimeter entry |
|---|---|---|---|
| Authorized Person | ● | 🟢 Green | ✅ Green info alert |
| Unknown Person | ◆ | 🔴 Red (pulsing) | 🚨 Critical alert — VERIFICATION REQUIRED |
| Wildlife / Animal | ▲ | 🟡 Amber | ⚠️ Amber alert — WILDLIFE DETECTED |
| Unknown Object | □ | 🔵 Cyan | ℹ️ Info alert — CLASSIFICATION PENDING |

#### Personnel Management
- Add, Edit, Deactivate, Delete personnel records
- Fields: Full Name, Employee ID, Role, Department, Access Level (PUBLIC / RESTRICTED / CONFIDENTIAL / SECRET), Phone, Email, Avatar Colour, Status
- Demo records pre-seeded (Alice Johnson, Rajesh Kumar, Priya Nair, David Chen)
- **Persists across page refresh** (localStorage key: `radar_personnel`)

#### Working Scenarios (bottom bar)
| Button | What happens |
|---|---|
| STANDARD MONITORING | 3 green patrols + distant wildlife |
| AUTHORIZED ENTRY | Green tracks approach and cross perimeter |
| UNKNOWN PERSON | Red track crosses 450m → critical alert fires |
| WILDLIFE | 3 animals cross perimeter → amber alerts |
| MULTI-SENSOR EVENT | All 4 track types simultaneously |
| ⏸ PAUSE | Freezes all movement and timestamps |
| ↺ RESET | Clears tracks and alerts |
| ⚡ FALSE ALARM TEST | Creates a dismissible test alert |
| 📄 INCIDENT REPORT | Downloads full JSON report of all tracks + alerts |

### Running Module 2

```bash
cd radar-scanner
npm install
npm run dev
# → http://localhost:5173
```

---

## Core Algorithm — Recency-Augmented UCB1

**File:** `defense_radar_system/server/scheduler_engine.js`

This is the primary research contribution for SIH26055. Standard UCB1 treats all past observations equally. Our **Recency-Augmented UCB1** adds an exponentially-decaying recency term that boosts recently-active frequency bands:

### Formula

$$Q(b) = \hat{\mu}_b + c \cdot \sqrt{\frac{\ln N}{N_b}} + \lambda \cdot \tanh\!\left(\frac{\Delta t_b}{\tau}\right)$$

| Symbol | Value | Description |
|---|---|---|
| $\hat{\mu}_b$ | computed | Bayesian posterior mean intercept rate for band $b$ |
| $c$ | $\sqrt{2} \approx 1.414$ | UCB exploration constant |
| $N$ | live | Total scan count across all bands |
| $N_b$ | live | Scan count for band $b$ |
| $\lambda$ | 0.20 | Recency weight — how much recent activity boosts score |
| $\Delta t_b$ | live | Seconds since band $b$ was last scanned |
| $\tau$ | 5.0 s | Recency time constant (half-life ≈ 5.5 s) |

### Why this works

In electronic warfare, threat emitters are **bursty** — they transmit in short pulses on a specific frequency then go silent. Standard UCB1 deprioritises a band that was recently missed, even if the emitter is likely to retransmit. The recency term $\lambda \cdot \tanh(\Delta t / \tau)$ re-elevates the priority of a band that hasn't been scanned recently, counteracting the under-exploration problem.

### Benchmark Results (seed 847219, 1000 simulated episodes)

| Metric | Recency-Augmented UCB1 | Open-Loop Sequential | Improvement |
|---|---|---|---|
| Mean intercept rate | 0.847 | 0.631 | **+34.2%** |
| Mean intercept time | 1.24 s | 2.18 s | **−43.1%** |
| Receiver utilisation | 91.3% | 78.4% | **+16.4%** |

---

## Radar Detection Logic

### Multi-Sensor Fusion (`updateFusionState()` in `server.js`)

Each entity is fused from 4 independent sensors:

```
Radar detection      → position, velocity, RCS estimate
Optical camera       → visual confirmation, bounding box
RF emitter           → frequency signature, ELINT fingerprint
Personnel RFID tag   → authorised-person tag match
```

**Classification rules (in priority order):**

```javascript
if (entity.personnel.matched && entity.type !== 'WILDLIFE') {
  → VERIFIED  (authorized person — green)
} else if (entity.type === 'WILDLIFE') {
  → WILDLIFE  (animal — amber)
} else if (entity.radar.range <= 450 && !entity.personnel.matched) {
  → ANOMALOUS (unauthorized inside perimeter — red)
} else {
  → UNIDENTIFIED (outside perimeter — grey)
}
```

### Incident Engine (`server/incident_engine.js`)

Evaluates every entity on every 25 Hz physics tick:
- Raises `SIMULATED SECURITY ALERT` for ANOMALOUS entities inside perimeter
- Dispatches `SIMULATED INCIDENT DISPATCH` for sustained breaches
- Maintains incident lifecycle: ACTIVE → ACKNOWLEDGED → RESOLVED
- Never claims connection to a real QRT, military command, or SMS gateway

---

## Quick Start

### Prerequisites
- Node.js ≥ 18 (tested on v24.19.0)
- npm ≥ 9

### Option A — ESM-ASTRA full dashboard

```bash
git clone https://github.com/sudhanshuuuu96-ux/Defence-Sentinel.git
cd Defence-Sentinel/defense_radar_system

npm install
node server.js
```

Open **http://localhost:8080**

### Option B — Standalone Radar Scanner

```bash
cd Defence-Sentinel/radar-scanner

npm install
npm run dev
```

Open **http://localhost:5173**

### Run Tests (Module 1)

```bash
cd defense_radar_system
node test/run_all_tests.js
```

Expected output: `12 / 12 suites PASSED`

---

## Screenshots

> The tactical dashboard showing the 360° radar with:
> - Green authorized-person tracks (●) inside the base
> - Red unauthorized-person track (◆) with pulsing threat ring crossing the 450m perimeter
> - Amber wildlife track (▲) in the outer sector
> - SIMULATED SECURITY ALERT panel with active incidents

---

## API Reference

### `GET /api/status`

Returns the complete simulation state:

```json
{
  "simState": {
    "isRunning": true,
    "radarSweepAngle": 276.5,
    "operatingMode": "TACTICAL MONITORING",
    "rfCurrentScanGhz": 9.420,
    "rfNextScanGhz": 9.675
  },
  "entitiesCount": 7,
  "incidentsCount": 3
}
```

### `GET /api/sitrep`

Tactical situation report with scheduler attribution and entity summary.

### `POST /api/reset`

Resets simulation kinematics to initial seed positions.

### `POST /api/scenario/:name`

Valid scenario names: `STANDARD`, `WILDLIFE`, `INTRUSION`, `VEHICLE_PATROL`

---

## Test Suite

**File:** `defense_radar_system/test/run_all_tests.js`

| Suite | Name | Tests |
|---|---|---|
| A | PRNG Determinism | 5 |
| B | Scheduler UCB Formula | 8 |
| C | Recency Decay | 4 |
| D | Bayesian Posterior | 6 |
| E | Benchmark Runner | 7 |
| F | Hit/Miss Learning | 5 |
| G | Entity Kinematics | 6 |
| H | Fusion Classification | 8 |
| I | Incident Engine | 6 |
| J | REST API | 7 |
| K | WebSocket Protocol | 4 |
| L | Alert Engine | 6 |
| **Total** | | **72 assertions / 12 suites** |

---

## Disclaimer

This system is a **simulation prototype** built for academic and hackathon demonstration purposes under Smart India Hackathon 2026 (Problem Statement SIH26055).

- **Not connected** to real radar hardware, cameras, biometric systems, or military networks
- All entity positions, RF measurements, and incidents are **simulated**
- Personnel records are **fictional** demo data
- Alert labels include **"SIMULATED SECURITY ALERT"** and **"SIMULATED INCIDENT DISPATCH"** to make the simulation nature explicit
- Do not claim this system is operational or connected to any real security infrastructure

---

## Team

Built for **Smart India Hackathon 2026** — Problem Statement **SIH26055**  
*Adaptive Scan Strategy for Electronic Warfare Receivers*

---

## License

MIT License — see [LICENSE](LICENSE) for details.
