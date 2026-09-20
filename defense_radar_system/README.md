# ESM-ASTRA: Adaptive Electronic Support & Tactical Situational Awareness
### Unified Multi-Sensor Defence Command & Control Workstation
**Smart India Hackathon 2026 | Problem Statement: SIH26055**

---

## 🎯 Executive Overview
**ESM-ASTRA** is an enterprise-grade multi-sensor defence command-and-control (C2) workstation developed for the Smart India Hackathon (SIH26055: *Smart Scan Strategy for Electronic Warfare*). 

Unlike isolated analytics tools or video-game HUDs, ESM-ASTRA integrates four core defence sensing subsystems into one unified, synchronized operational picture with a **strict Single Source of Truth**:

1. **Hero 360° Tactical PPI Radar (Center 59%):** Continuous 24 RPM sweep, concentric range rings (100m to 800m, 450m perimeter wire), military base installation line-art, historical track trails, velocity vectors, and target acquisition reticles.
2. **Realistic Optical Surveillance Camera (Right 24%):** Procedural night/IR perspective scenes across 4 gate sectors (North, East, South, West), 2.5D physical target avatars (personnel, vehicles, wildlife), and geometric CV bounding box projections derived directly from radar kinematics.
3. **RF / ESM Spectrum Analyzer (Bottom Dock 32%):** Continuous 9.00–10.00 GHz spectral monitoring, 50 MHz Instantaneous Bandwidth (IBW) receiver window, and active RF burst synthesis from transmitting emitters.
4. **Adaptive Scan Scheduler (Bottom Dock 34%):** Explainable AI scan scheduler with "Why this band?" score attribution (Recent Hits, Activity Probability, Uncertainty, Recency, Exploration).
5. **Left Multi-Sensor Panel (Left 17%):**
   - **Zone A:** Live Track Queue with status badges (`VERIFIED`, `AUTHORIZED`, `LOW CONFIDENCE`, `ANOMALOUS`).
   - **Zone B:** Multi-Sensor Fusion Inspector correlating Radar, Camera, RF/ESM, and Personnel DB for the selected track.
   - **Zone C:** Live Authorized Personnel Database.

---

## 🚀 Quick Start (How to Run)

### Method 1: Double-Click Batch File (Windows)
Double-click:
```
E:\SIH\defense_radar_system\run_radar.bat
```
This automatically installs dependencies, boots the server on port `8080`, and opens your default browser.

### Method 2: Command Line (Node.js)
```powershell
cd e:\SIH\defense_radar_system
npm.cmd install
node server.js
```
Then navigate to: **`http://localhost:8080`**

---

## 🔄 Single Source of Truth Architecture

Every panel in ESM-ASTRA references the identical underlying entity (`SimulatedEntity` class in `server.js`):

| Sensor / Subsystem | Master State Attribute | Visual Representation |
|---|---|---|
| **Radar Scope** | $(x, y)$, $(v_x, v_y)$, range, azimuth, heading | Phosphor blip, 10-point kinematic trail, velocity vector |
| **Optical Camera** | Angular bearing vs. camera pointing angle & sector FOV | 2.5D avatar + CV bounding box on matching camera tab |
| **RF / ESM** | `hasEmitter`, `freqGhz`, `isTransmitting`, `powerDbm` | Spectral peak in 9.0–10.0 GHz spectrum analyzer |
| **Personnel DB** | `tagId` match against `PERSONNEL_DB` | `VERIFIED` (Green) or `UNAUTHORIZED` (Red) status |
| **Fusion Inspector** | Multi-sensor confidence synthesis | Real-time confidence score & anomaly score breakdown |

Clicking an entity on the Radar, Camera feed, or Left Track Queue instantly focuses that target across all subsystems simultaneously.

---

## 🎬 Automated 12-Step Demonstration Mode

Click the amber button **`▶ DEMO: NIGHT PERIMETER MONITORING (12-STEP)`** on the simulation toolbar or POST to `/api/demo/start`. The system executes an exact 12-step synchronized operational scenario:

1. **Radar:** Detects unknown track in Sector North.
2. **Radar:** Establishes track `TRK-021` (Range 272m, Speed 12.1 km/h).
3. **Camera:** Target enters `CAM-01` FOV (North Gate Sector).
4. **Camera:** CV algorithm detects `CV-042` (Person, 96% confidence).
5. **Database:** Personnel DB finds no matching credentials for `TRK-021`.
6. **RF / ESM:** Associated transmitter activates (`EMITTER-03` on 9.420 GHz).
7. **Receiver:** Receiver initially misses signal (currently tuned to 9.180 GHz).
8. **Scheduler:** Adaptive scheduler prioritizes 9.420 GHz (Score 68).
9. **Scheduler:** Receiver retunes to 9.420 GHz.
10. **Receiver:** HIT detected on 9.420 GHz (-61.2 dBm).
11. **Fusion:** Multi-sensor confidence escalates to 87% (Anomaly Score 72).
12. **System:** Operational posture updates to **`REQUIRES VERIFICATION`**.

---

## 📡 REST & WebSocket APIs

- `GET /api/status`: Returns live JSON state of the simulation engine, active scenario, receiver tuning, and entity count.
- `GET /api/sitrep`: Downloads an official, timestamped Military Operational Situation Report (`.txt`).
- `POST /api/demo/start`: Triggers the automated 12-step demonstration scenario.
- `WebSocket /ws/c2`: High-frequency 25 Hz synchronized bidirectional telemetry stream.

---

## 📐 Technology Stack
- **Backend:** Node.js, Express, `ws` (native WebSocket protocol)
- **Frontend:** HTML5 Canvas (Hardware-accelerated custom rendering engines for PPI Radar, Optical Viewport, and RF Spectrum)
- **Styling:** Modular CSS3 with tactical defense design system (Inter, JetBrains Mono)
- **Zero Heavy Frameworks:** Ultra-fast, zero-latency 60 FPS client rendering without React/Vue overhead
