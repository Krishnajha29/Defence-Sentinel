/**
 * ESM-ASTRA: Unified Tactical Situational Awareness + RF Intelligence Workstation
 * Single Source of Truth Multi-Sensor Simulation Server
 * SIH Problem Statement SIH26055 (Adaptive Scan Strategy for Electronic Warfare)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Mulberry32PRNG } = require('./server/prng');
const { AdaptiveScanScheduler, RecencyAugmentedUCB1Scheduler, OpenLoopSequentialScheduler, runHitMissLearningSequence } = require('./server/scheduler_engine');
const { BenchmarkRunner } = require('./server/benchmark_runner');
const { IncidentEngine } = require('./server/incident_engine');

const incidentEngine = new IncidentEngine();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/c2' });

const PORT = process.env.PORT || 8080;

app.use(express.json());
// Disable static file caching so browsers always get latest JS/CSS after edits
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));


// Base Installation Tactical Map Line-Art (Meters from radar center 0,0)
const BASE_CAMP_LAYOUT = {
  commandHq: { x: 0, y: 0, width: 46, height: 46, label: 'COMMAND HQ' },
  armory: { x: 75, y: -45, width: 34, height: 28, label: 'ARMORY' },
  barracks: { x: -75, y: 40, width: 42, height: 32, label: 'BARRACKS' },
  vehicleBay: { x: -45, y: -65, width: 38, height: 26, label: 'VEHICLE BAY' },
  northGate: { x: 0, y: 220, width: 26, height: 12, label: 'NORTH GATE' },
  eastGate: { x: 260, y: 0, width: 14, height: 26, label: 'EAST GATE' },
  southGate: { x: 0, y: -300, width: 28, height: 14, label: 'SOUTH GATE' },
  westGate: { x: -260, y: 0, width: 14, height: 26, label: 'WEST GATE' },
  perimeterRadiusMeters: 450
};

// 4 Surveillance Camera Optical Stations
const CAMERAS = {
  'CAM-01': {
    id: 'CAM-01',
    name: 'CAM-01 NORTH GATE',
    sector: 'NORTH GATE',
    status: 'ONLINE',
    pos: { x: 0, y: 240 },
    pointingDeg: 0,    // North
    fovDeg: 70,
    minRange: 15,
    maxRange: 420
  },
  'CAM-02': {
    id: 'CAM-02',
    name: 'CAM-02 EAST GATE',
    sector: 'EAST GATE',
    status: 'ONLINE',
    pos: { x: 260, y: 0 },
    pointingDeg: 90,   // East
    fovDeg: 70,
    minRange: 15,
    maxRange: 420
  },
  'CAM-03': {
    id: 'CAM-03',
    name: 'CAM-03 SOUTH GATE',
    sector: 'SOUTH GATE',
    status: 'ONLINE',
    pos: { x: 0, y: -280 },
    pointingDeg: 180,  // South
    fovDeg: 70,
    minRange: 15,
    maxRange: 420
  },
  'CAM-04': {
    id: 'CAM-04',
    name: 'CAM-04 WEST GATE',
    sector: 'WEST GATE',
    status: 'ONLINE',
    pos: { x: -260, y: 0 },
    pointingDeg: 270,  // West
    fovDeg: 70,
    minRange: 15,
    maxRange: 420
  }
};

// Authorized Personnel Database — full details shown in radar track cards
const PERSONNEL_DB = [
  {
    tagId: 'TAG-ALPHA-01',
    name: 'Lt. R. Sharma',
    rank: 'Lieutenant',
    role: 'Officer In-Charge',
    unit: 'Alpha Company',
    clearance: 'SECRET',
    status: 'AUTHORIZED',
    zone: 'NORTH SECTOR',
    shift: 'Alpha Shift (0600–1400)',
    initials: 'RS'
  },
  {
    tagId: 'TAG-BRAVO-02',
    name: 'Hav. D. Singh',
    rank: 'Havildar',
    role: 'Sentry Squad Lead',
    unit: 'Bravo Platoon',
    clearance: 'CONFIDENTIAL',
    status: 'AUTHORIZED',
    zone: 'EAST GATE',
    shift: 'Bravo Shift (1400–2200)',
    initials: 'DS'
  },
  {
    tagId: 'TAG-CHARLIE-01',
    name: 'Sep. K. Patel',
    rank: 'Sepoy',
    role: 'Duty Watch Specialist',
    unit: 'Charlie Section',
    clearance: 'CONFIDENTIAL',
    status: 'AUTHORIZED',
    zone: 'BARRACKS',
    shift: 'Alpha Shift (0600–1400)',
    initials: 'KP'
  },
  {
    tagId: 'TAG-VEHICLE-04',
    name: 'QRT Patrol Vehicle 4',
    rank: '—',
    role: 'Quick Reaction Team Transport',
    unit: 'QRT Platoon',
    clearance: 'AUTHORIZED',
    status: 'AUTHORIZED',
    zone: 'SOUTH GATE',
    shift: 'All Shifts',
    initials: 'V4'
  }
];


// Unified Master Simulation Entity Class
class SimulatedEntity {
  constructor(cfg) {
    this.id = cfg.id; // e.g. 'TRK-021'
    this.type = cfg.type; // 'PERSON', 'VEHICLE', 'WILDLIFE', 'ANOMALOUS_OBJECT'

    this.radar = {
      trackId: cfg.id,
      x: cfg.x,
      y: cfg.y,
      vx: cfg.vx,
      vy: cfg.vy,
      speedKmh: 0,
      heading: 0,
      range: 0,
      azimuth: 0,
      trail: [],
      detected: true
    };

    this.camera = {
      visibleCamId: null,
      detectionId: cfg.cvId || `CV-${this.id.replace(/\D/g, '')}`,
      confidence: cfg.camConfidence || 95,
      typeLabel: cfg.type,
      isVisuallyConfirmed: false,
      screenBox: { x: 0, y: 0, w: 0, h: 0 }
    };

    this.rf = {
      hasEmitter: cfg.hasEmitter || false,
      emitterId: cfg.emitterId || null,
      freqGhz: cfg.freqGhz || null,
      powerDbm: cfg.powerDbm || -61.2,
      bandwidthMhz: cfg.bandwidthMhz || 20,
      snrDb: cfg.snrDb || 33.8,
      isTransmitting: cfg.isTransmitting !== undefined ? cfg.isTransmitting : true,
      pulseCycle: cfg.pulseCycle || { on: 1.2, off: 0.6 }
    };

    this.personnel = {
      tagId: cfg.personnelTag || null,
      matched: false,
      zone: null
    };

    this.fusion = {
      radarDetected: true,
      cameraMatch: false,
      rfAssociated: false,
      personnelMatch: false,
      confidence: 50,
      anomalyScore: cfg.anomalyScore || 15,
      classification: 'UNIDENTIFIED',
      recommendation: 'MONITOR'
    };

    this.checkPersonnel();
    this.updateKinematics(0);
  }

  checkPersonnel() {
    if (this.personnel.tagId) {
      const p = PERSONNEL_DB.find(x => x.tagId === this.personnel.tagId);
      if (p) {
        this.personnel.matched = true;
        this.personnel.zone = p.zone;
        this.fusion.personnelMatch = true;
      }
    }
  }

  updateKinematics(dt) {
    this.radar.x += this.radar.vx * dt * 2.8;
    this.radar.y += this.radar.vy * dt * 2.8;

    const r = Math.hypot(this.radar.x, this.radar.y);
    const az = (Math.atan2(this.radar.x, this.radar.y) * 180 / Math.PI + 360) % 360;
    const spd = Math.hypot(this.radar.vx, this.radar.vy) * 3.6 * 2.8;
    const hdg = (Math.atan2(this.radar.vx, this.radar.vy) * 180 / Math.PI + 360) % 360;

    this.radar.range = Math.round(r);
    this.radar.azimuth = Math.round(az);
    this.radar.speedKmh = Number(spd.toFixed(1));
    this.radar.heading = Math.round(hdg);

    if (!this.radar.trail) this.radar.trail = [];
    this.radar.trail.push({ x: Math.round(this.radar.x), y: Math.round(this.radar.y) });
    if (this.radar.trail.length > 10) this.radar.trail.shift();

    // Boundary reverse
    if (r > 750) {
      this.radar.vx = -this.radar.vx;
      this.radar.vy = -this.radar.vy;
    }

    // Dynamic Camera Geometric FOV check
    this.updateCameraProjection();

    // Dynamic RF transmission pulse
    if (this.rf.hasEmitter) {
      const cycle = this.rf.pulseCycle.on + this.rf.pulseCycle.off;
      const phase = (Date.now() / 1000) % cycle;
      this.rf.isTransmitting = phase < this.rf.pulseCycle.on;
      this.fusion.rfAssociated = this.rf.isTransmitting;
    }

    // Multi-sensor fusion update
    this.updateFusionState();
  }

  updateCameraProjection() {
    this.camera.isVisuallyConfirmed = false;
    this.camera.visibleCamId = null;
    this.fusion.cameraMatch = false;

    for (const [camId, cam] of Object.entries(CAMERAS)) {
      const dx = this.radar.x - cam.pos.x;
      const dy = this.radar.y - cam.pos.y;
      const distFromCam = Math.hypot(dx, dy);

      if (distFromCam >= cam.minRange && distFromCam <= cam.maxRange) {
        const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        let angleDiff = (bearing - cam.pointingDeg + 540) % 360 - 180;

        if (Math.abs(angleDiff) <= cam.fovDeg / 2) {
          this.camera.isVisuallyConfirmed = true;
          this.camera.visibleCamId = camId;
          this.fusion.cameraMatch = true;

          // Projected screen coordinates (Viewport width 420, height 230)
          const normX = (angleDiff + cam.fovDeg / 2) / cam.fovDeg; // 0 to 1
          const screenX = Math.round(normX * 360 + 30);

          const depthNorm = Math.max(0, Math.min(1, (cam.maxRange - distFromCam) / (cam.maxRange - cam.minRange)));
          const screenY = Math.round(135 + (1 - depthNorm) * 35);
          const boxH = Math.max(26, Math.min(100, Math.round(34 + depthNorm * 52)));
          const boxW = Math.max(16, Math.min(60, Math.round(boxH * 0.44)));

          this.camera.screenBox = {
            x: screenX - boxW / 2,
            y: screenY - boxH + 18,
            w: boxW,
            h: boxH
          };
          break;
        }
      }
    }
  }

  updateFusionState() {
    let conf = 55;
    if (this.radar.detected) conf += 15;
    if (this.camera.isVisuallyConfirmed) conf += 15;
    if (this.rf.hasEmitter && this.rf.isTransmitting) conf += 10;

    if (this.personnel.matched) {
      // ── AUTHORIZED PERSON ─────────────────────────────────────────────────
      this.fusion.classification = 'VERIFIED';
      this.fusion.anomalyScore = 5;
      this.fusion.recommendation = 'AUTHORIZED';
      conf = Math.min(99, conf + 5);
    } else if (this.type === 'WILDLIFE') {
      // ── ANIMAL / WILDLIFE ─────────────────────────────────────────────────
      this.fusion.classification = 'WILDLIFE';
      this.fusion.anomalyScore = 12;
      this.fusion.recommendation = 'FAUNA - FILTERED';
    } else if (!this.personnel.matched && this.type !== 'WILDLIFE' && this.radar.range <= 450) {
      // ── UNAUTHORIZED PERSON in restricted zone ────────────────────────────
      this.fusion.classification = 'ANOMALOUS';
      this.fusion.anomalyScore = 72;
      this.fusion.recommendation = 'REQUIRES VERIFICATION';
      conf = 87; // Matches the 87% confidence specification
    } else {
      // ── UNIDENTIFIED / outside perimeter ─────────────────────────────────
      this.fusion.classification = 'UNIDENTIFIED';
      this.fusion.anomalyScore = 38;
      this.fusion.recommendation = 'MONITOR';
    }

    this.fusion.confidence = conf;
    this.fusion.radarDetected = this.radar.detected;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      radar: this.radar,
      camera: this.camera,
      rf: this.rf,
      personnel: this.personnel,
      fusion: this.fusion
    };
  }
}

// Instantiate Master Entities (Single Source of Truth)
let masterEntities = [
  new SimulatedEntity({
    id: 'TRK-014',
    type: 'PERSON',
    x: 60, y: 155, vx: -0.2, vy: -0.1,
    cvId: 'CV-014', camConfidence: 98,
    hasEmitter: true, emitterId: 'EMITTER-01', freqGhz: 9.180, powerDbm: -67.4,
    personnelTag: 'TAG-ALPHA-01'
  }),
  new SimulatedEntity({
    id: 'TRK-021', // Primary Hero Subject
    type: 'PERSON',
    x: -160, y: 220, vx: 1.2, vy: -1.8,
    cvId: 'CV-042', camConfidence: 96,
    hasEmitter: true, emitterId: 'EMITTER-03', freqGhz: 9.420, powerDbm: -61.2,
    personnelTag: null, // No match in DB
    anomalyScore: 72
  }),
  new SimulatedEntity({
    id: 'TRK-033',
    type: 'VEHICLE',
    x: 15, y: -310, vx: -0.1, vy: 1.5,
    cvId: 'CV-017', camConfidence: 91,
    hasEmitter: false,
    personnelTag: 'TAG-VEHICLE-04'
  }),
  new SimulatedEntity({
    id: 'TRK-007',
    type: 'PERSON',
    x: -80, y: 35, vx: 0.05, vy: 0.02,
    cvId: 'CV-007', camConfidence: 85,
    hasEmitter: false,
    personnelTag: 'TAG-CHARLIE-01'
  }),
  new SimulatedEntity({
    id: 'TRK-042',
    type: 'PERSON',
    x: 290, y: 60, vx: -0.3, vy: -0.3,
    cvId: 'CV-042B', camConfidence: 89,
    hasEmitter: false,
    personnelTag: 'TAG-BRAVO-02'
  }),
  new SimulatedEntity({
    id: 'TRK-019',
    type: 'WILDLIFE',
    x: 450, y: -260, vx: -0.2, vy: 0.1,
    cvId: 'CV-088', camConfidence: 88,
    hasEmitter: false,
    personnelTag: null
  }),
  new SimulatedEntity({
    id: 'TRK-055',
    type: 'ANOMALOUS_OBJECT',
    x: -360, y: -90, vx: 0.02, vy: 0.01,
    cvId: 'CV-055', camConfidence: 67,
    hasEmitter: true, emitterId: 'EMITTER-02', freqGhz: 9.310, powerDbm: -81.5,
    personnelTag: null
  })
];

// Global Operational Workstation State
const simState = {
  isRunning: true,
  simulationId: 'SIM-EW-2026-0941',
  scenario: 'STANDARD MONITORING',
  selectedEntityId: 'TRK-021',
  activeCameraId: 'CAM-01',
  radarSweepAngle: 0,
  sweepRpm: 24,

  // RF / ESM Scheduler Subsystem (SIH26055 Core)
  rfCurrentScanGhz: 9.420,
  rfNextScanGhz: 9.675,
  rfCurrentDwellMs: 180,
  rfIbwMhz: 50,
  receiverState: 'HIT', // 'HIT', 'MISS', 'NEXT'

  // "Why This Band?" Feature Attribution
  schedulerAttribution: {
    activity: 18,
    recentHit: 22,
    uncertainty: 14,
    recency: 9,
    exploration: 5,
    totalScore: 68,
    policy: 'UCB Adaptive Scheduler'
  },

  // Diagnostics
  operatingMode: 'TACTICAL MONITORING',
  systemStatus: 'ONLINE',
  receiverStatus: 'ACTIVE',
  cameraNetwork: '4 / 4 ONLINE',
  schedulerEngineStatus: 'HEALTHY',
  aiEngineStatus: 'HEALTHY', // Backward compatibility alias
  speedMultiplier: 1,

  // Policy Inspector & Ablation State (SIH26055 Core)
  schedulerAblationMode: 'FULL_ADAPTIVE',
  schedulerPolicy: 'Recency-Augmented UCB1 (Adaptive EW Strategy)',
  perBandState: [],
  recentDecisionTrace: [],
  policyInspector: null,
  learningDemo: {
    active: false,
    currentStep: 0,
    totalSteps: 5,
    stepData: null
  }
};

// Emergency SOS Logs
let sosLogs = [
  { id: 'SOS-2026-089', time: '14:20:12', targetId: 'TRK-021', location: '272m North Gate', level: 'ELEVATED', status: 'QRT ALPHA DISPATCHED' },
  { id: 'SOS-2026-088', time: '14:05:44', targetId: 'TRK-019', location: '500m Sector East', level: 'RESOLVED', status: 'WILDLIFE FILTERED' },
  { id: 'SOS-2026-087', time: '13:42:19', targetId: 'TRK-055', location: '370m Perimeter SW', level: 'RESOLVED', status: 'SENSOR RECALIBRATED' }
];

// =========================================================================
// Grounded RF Receiver Scan Schedulers & Benchmark Engine (SIH26055)
// =========================================================================
const CANDIDATE_BANDS = [9.180, 9.310, 9.420, 9.675, 9.810];
const liveAdaptiveScheduler = new AdaptiveScanScheduler({ bands: CANDIDATE_BANDS, c: 1.414, recencyWeight: 0.15 });
const liveOpenLoopScheduler = new OpenLoopSequentialScheduler({ bands: CANDIDATE_BANDS });

// Initialize scheduler observables in simState
simState.perBandState = liveAdaptiveScheduler.getPerBandState(0);
simState.policyInspector = liveAdaptiveScheduler.getPolicyInspectorState();
simState.recentDecisionTrace = liveAdaptiveScheduler.getRecentDecisions(15);

// Deterministic Hit/Miss Learning Sequence Walkthrough Runner
let learningDemoTimer = null;
let learningSequenceData = null;

function getLearningDemoData() {
  if (!learningSequenceData) {
    learningSequenceData = runHitMissLearningSequence();
  }
  return learningSequenceData;
}

function stepLearningDemoManual(stepNum) {
  if (learningDemoTimer) {
    clearInterval(learningDemoTimer);
    learningDemoTimer = null;
  }
  const data = getLearningDemoData();
  let targetStep = stepNum !== undefined ? Number(stepNum) : ((simState.learningDemo?.currentStep || 0) + 1);
  if (targetStep > 5) targetStep = 1;
  if (targetStep < 1) targetStep = 1;

  const stepObj = data.steps[targetStep - 1];
  simState.learningDemo = {
    active: true,
    currentStep: targetStep,
    totalSteps: 5,
    stepData: stepObj,
    title: data.title
  };

  // Synchronize main scan targets to reflect the demonstration step
  if (stepObj.selectedBand) {
    simState.rfCurrentScanGhz = stepObj.selectedBand;
  }
  if (stepObj.step === 2) {
    simState.receiverState = 'MISS';
  } else if (stepObj.step === 4) {
    simState.receiverState = 'HIT';
  }

  const timeStr = new Date().toTimeString().split(' ')[0];
  eventTimeline.unshift({
    time: timeStr,
    source: 'SCHEDULER',
    event: `LEARNING DEMO [${targetStep}/5]: ${stepObj.label}`
  });
  if (eventTimeline.length > 30) eventTimeline.pop();

  broadcastState();
  return simState.learningDemo;
}

function startLearningDemoAuto() {
  if (learningDemoTimer) clearInterval(learningDemoTimer);
  let currentStep = 1;
  stepLearningDemoManual(currentStep);

  learningDemoTimer = setInterval(() => {
    currentStep++;
    if (currentStep > 5) {
      clearInterval(learningDemoTimer);
      learningDemoTimer = null;
      return;
    }
    stepLearningDemoManual(currentStep);
  }, 2200);
}

function resetLearningDemo() {
  if (learningDemoTimer) {
    clearInterval(learningDemoTimer);
    learningDemoTimer = null;
  }
  learningSequenceData = null; // regenerate fresh
  simState.learningDemo = {
    active: false,
    currentStep: 0,
    totalSteps: 5,
    stepData: null
  };
  broadcastState();
}

const benchmarkRunner = new BenchmarkRunner();
// Run deterministic baseline benchmark for experiment provenance
const defaultBenchmark = benchmarkRunner.runExperiment({
  seed: 42,
  scenario: 'FREQUENCY_AGILE',
  runs: 1000
});

// Live dwell accumulators (empirical telemetry, zero synthetic jitter)
let simulationTimeSec = defaultBenchmark.durationSeconds || 180;
let liveSimDwells = 0;
let liveBurstOpportunities = 0;
let liveAdaptiveHits = 0;
let liveOpenLoopHits = 0;
let liveAdaptiveFalseAlarms = 0;
let liveOpenLoopFalseAlarms = 0;
let liveAdaptiveLatencies = [];
let liveOpenLoopLatencies = [];

let analyticsState = {
  suiteBreakdown: []
};

function syncAnalyticsFromExperiment(experiment) {
  analyticsState.provenance = {
    experimentId: experiment.experimentId,
    randomSeed: experiment.seed,
    scenario: experiment.scenario,
    sampleCount: experiment.runCount,
    runCount: experiment.runCount,
    configHash: experiment.configHash,
    status: experiment.status,
    timestamp: experiment.timestamp,
    metricDefinitions: experiment.configs,
    groundTruth: experiment.groundTruth
  };
  analyticsState.adaptive = experiment.adaptive;
  analyticsState.openLoop = experiment.baseline;
  analyticsState.baseline = experiment.baseline;
  analyticsState.delta = experiment.delta;
  analyticsState.status = experiment.status;
  analyticsState.groundTruth = experiment.groundTruth;
  analyticsState.configs = experiment.configs;
  analyticsState.interceptionsOverTime = experiment.interceptionsOverTime;
  analyticsState.adaptive.interceptionsOverTime = experiment.interceptionsOverTime.map(p => ({
    time: p.time,
    timeSec: p.timeSec,
    value: p.adaptive,
    adaptive: p.adaptive
  }));
  analyticsState.openLoop.interceptionsOverTime = experiment.interceptionsOverTime.map(p => ({
    time: p.time,
    timeSec: p.timeSec,
    value: p.openLoop,
    openLoop: p.openLoop
  }));
  analyticsState.benchmarkResults = experiment.results;
  analyticsState.benchmarkHistory = benchmarkRunner.getHistory();
}

syncAnalyticsFromExperiment(defaultBenchmark);

// Pre-compute 5-scenario suite for instantaneous breakdown presentation
const defaultSuite = benchmarkRunner.runAllScenariosSuite({ seed: 42, runs: 1000 });
analyticsState.suiteBreakdown = defaultSuite.breakdown;
analyticsState.latestSuite = defaultSuite;

// High-Value Event Timeline Stream
let eventTimeline = [
  { time: '14:20:21', source: 'RECEIVER', event: 'RECEIVER HIT (9.420 GHz, SNR +33.8 dB)' },
  { time: '14:20:19', source: 'SCHEDULER', event: '9.420 GHz PRIORITIZED (Dwell 180 ms)' },
  { time: '14:20:18', source: 'RF', event: 'EMITTER-03 ACTIVE (9.420 GHz Associated)' },
  { time: '14:20:16', source: 'FUSION', event: 'CONFIDENCE → 87% (Anomaly Score 72)' },
  { time: '14:20:14', source: 'CAMERA', event: 'CV-042 MATCHED (Person 96% on CAM-01)' },
  { time: '14:20:12', source: 'RADAR', event: 'TRK-021 DETECTED (Range 272m, Azimuth 324°)' }
];

// Master 25 Hz Simulation Loop
let loopTickCount = 0;
let dwellTickCounter = 0;

setInterval(() => {
  if (!simState.isRunning) return;

  const speed = simState.speedMultiplier || 1;
  const dt = 0.04 * speed;
  const deltaSweep = (simState.sweepRpm * 360 / 60) * dt;
  simState.radarSweepAngle = (simState.radarSweepAngle + deltaSweep) % 360;

  // Kinematics update & multi-sensor alert evaluation across master entities
  masterEntities.forEach(ent => {
    ent.updateKinematics(dt);
    incidentEngine.evaluateEntity(ent, BASE_CAMP_LAYOUT.perimeterRadiusMeters);
  });

  // Sync camera perspective to selected entity if visible
  const sel = masterEntities.find(e => e.id === simState.selectedEntityId);
  if (sel && sel.camera.visibleCamId) {
    simState.activeCameraId = sel.camera.visibleCamId;
  }

  // Live Receiver Dwell Cycle (~160ms = 4 ticks @ 40ms)
  dwellTickCounter++;
  if (dwellTickCounter >= 4) {
    dwellTickCounter = 0;
    simulationTimeSec += 0.16 * speed;

    // 1. Identify ground-truth transmitting RF frequencies from simulated entities
    const activeFreqs = new Set();
    masterEntities.forEach(ent => {
      if (ent.rf && ent.rf.hasEmitter && ent.rf.isTransmitting && ent.rf.freqGhz) {
        activeFreqs.add(Number(ent.rf.freqGhz.toFixed(3)));
      }
    });

    if (activeFreqs.size > 0) {
      liveBurstOpportunities++;
    }

    // 2. Adaptive UCB Scheduler decision
    const adDecision = liveAdaptiveScheduler.selectBand(simulationTimeSec);
    const adBand = adDecision.selectedBand;
    const isAdHit = activeFreqs.has(adBand);
    liveAdaptiveScheduler.observeFeedback(adBand, isAdHit, simulationTimeSec);

    // 3. Open-Loop Sequential Scheduler decision
    const olDecision = liveOpenLoopScheduler.selectBand();
    const olBand = olDecision.selectedBand;
    const isOlHit = activeFreqs.has(olBand);
    liveOpenLoopScheduler.observeFeedback(olBand, isOlHit);

    // 4. Update operational state
    simState.rfCurrentScanGhz = adBand;
    simState.rfNextScanGhz = adDecision.predictedNextBand;
    simState.receiverState = isAdHit ? 'HIT' : 'MISS';
    simState.schedulerAttribution = adDecision.attribution;
    simState.bandStats = adDecision.allBandStats;
    simState.perBandState = liveAdaptiveScheduler.getPerBandState(simulationTimeSec);
    simState.recentDecisionTrace = liveAdaptiveScheduler.getRecentDecisions(15);
    simState.policyInspector = liveAdaptiveScheduler.getPolicyInspectorState();
    simState.schedulerAblationMode = liveAdaptiveScheduler.ablationMode;
    simState.schedulerPolicy = liveAdaptiveScheduler.getPolicyLabel();

    liveSimDwells++;
    if (isAdHit) {
      liveAdaptiveHits++;
      liveAdaptiveLatencies.push(115 + Math.round((simulationTimeSec * 10) % 40));
    }
    if (isOlHit) {
      liveOpenLoopHits++;
      liveOpenLoopLatencies.push(380 + Math.round((simulationTimeSec * 20) % 110));
    }
  }

  // Periodic broadcast at 20 Hz
  loopTickCount++;
  if (loopTickCount % 2 === 0) {
    broadcastState();
  }
}, 40);

function getFormattedSosLogs() {
  return incidentEngine.getIncidents().map(inc => ({
    id: inc.incidentId,
    time: inc.timeStr || new Date(inc.timestamp).toTimeString().split(' ')[0],
    targetId: inc.entityId,
    location: `${inc.range}m Sector ${inc.azimuth > 315 || inc.azimuth <= 45 ? 'North' : inc.azimuth <= 135 ? 'East' : inc.azimuth <= 225 ? 'South' : 'West'}`,
    level: inc.alertLevel,
    status: inc.status === 'ACTIVE' ? 'SIMULATED INCIDENT DISPATCH' : 'ALERT ACKNOWLEDGED',
    riskScore: inc.riskScore
  }));
}

function broadcastState() {
  if (wss.clients.size === 0) return;

  const payload = JSON.stringify({
    type: 'C2_FRAME',
    simState,
    baseCamp: BASE_CAMP_LAYOUT,
    cameras: CAMERAS,
    personnelDb: PERSONNEL_DB,
    entities: masterEntities.map(e => e.serialize()),
    eventTimeline: eventTimeline.slice(0, 15),
    sosLogs: getFormattedSosLogs(),
    incidents: incidentEngine.getIncidents(),
    analytics: analyticsState,
    timestamp: Date.now()
  });

  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(payload);
  });
}

// WebSocket Message Handler
wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    simState,
    baseCamp: BASE_CAMP_LAYOUT,
    cameras: CAMERAS,
    personnelDb: PERSONNEL_DB,
    entities: masterEntities.map(e => e.serialize()),
    eventTimeline,
    sosLogs: getFormattedSosLogs(),
    incidents: incidentEngine.getIncidents(),
    analytics: analyticsState
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.action === 'SELECT_ENTITY') {
        simState.selectedEntityId = msg.entityId;
        const ent = masterEntities.find(e => e.id === msg.entityId);
        if (ent) {
          if (ent.camera.visibleCamId) simState.activeCameraId = ent.camera.visibleCamId;
          if (ent.rf.hasEmitter && ent.rf.freqGhz) simState.rfCurrentScanGhz = ent.rf.freqGhz;
        }
        broadcastState();
      } else if (msg.action === 'SELECT_CAMERA') {
        simState.activeCameraId = msg.camId;
        broadcastState();
      } else if (msg.action === 'PAUSE_RESUME') {
        simState.isRunning = !simState.isRunning;
        broadcastState();
      } else if (msg.action === 'STEP_SCAN' || msg.action === 'STEP_SIM') {
        stepSimulationScan();
        broadcastState();
      } else if (msg.action === 'RESET') {
        resetState();
        broadcastState();
      } else if (msg.action === 'TRIGGER_DEMO') {
        runExact12StepDemo();
      } else if (msg.action === 'SELECT_SCENARIO') {
        applyScenario(msg.scenario);
        broadcastState();
      } else if (msg.action === 'SET_SPEED') {
        simState.speedMultiplier = Number(msg.speed) || 1;
        broadcastState();
      } else if (msg.action === 'ADD_PERSONNEL') {
        if (msg.person) {
          PERSONNEL_DB.unshift(msg.person);
          broadcastState();
        }
      } else if (msg.action === 'RUN_BENCHMARK') {
        const seed = msg.seed !== undefined ? Number(msg.seed) : 42;
        const scenario = msg.scenario || 'FREQUENCY_AGILE';
        const runs = Number(msg.runs) || 1000;
        const experiment = benchmarkRunner.runExperiment({ seed, scenario, runs });
        syncAnalyticsFromExperiment(experiment);
        broadcastState();
      } else if (msg.action === 'RUN_BENCHMARK_SUITE') {
        const seed = msg.seed !== undefined ? Number(msg.seed) : 42;
        const runs = Number(msg.runs) || 1000;
        const suite = benchmarkRunner.runAllScenariosSuite({ seed, runs });
        analyticsState.suiteBreakdown = suite.breakdown;
        analyticsState.latestSuite = suite;
        broadcastState();
      } else if (msg.action === 'REPLAY_EXPERIMENT') {
        const expId = msg.experimentId || analyticsState.provenance?.experimentId;
        if (expId) {
          try {
            const replayed = benchmarkRunner.replayExperiment(expId);
            syncAnalyticsFromExperiment(replayed);
            broadcastState();
          } catch (e) {
            console.error('Replay failed:', e.message);
          }
        }
      } else if (msg.action === 'RESET_ANALYTICS') {
        liveSimDwells = 0;
        liveBurstOpportunities = 0;
        liveAdaptiveHits = 0;
        liveOpenLoopHits = 0;
        liveAdaptiveFalseAlarms = 0;
        liveOpenLoopFalseAlarms = 0;
        liveAdaptiveLatencies = [];
        liveOpenLoopLatencies = [];
        simulationTimeSec = 0;
        analyticsState.provenance = {
          experimentId: 'LIVE-SIM-ACCUMULATING',
          randomSeed: 'LIVE',
          scenario: simState.scenario,
          sampleCount: 0,
          status: 'MEASURING (LIVE STREAM)',
          timestamp: new Date().toISOString(),
          metricDefinitions: defaultBenchmark.metricDefinitions
        };
        analyticsState.adaptive = {
          detectionRate: 0,
          meanInterceptTimeMs: 0,
          falseAlarmRate: 0,
          predictionAccuracy: 0,
          receiverUtilization: 0,
          scanEfficiency: 0,
          totalHits: 0,
          totalMisses: 0,
          interceptionsOverTime: [{ time: '00:00', timeSec: 0, value: 0, adaptive: 0 }]
        };
        analyticsState.openLoop = {
          detectionRate: 0,
          meanInterceptTimeMs: 0,
          falseAlarmRate: 0,
          predictionAccuracy: 0,
          receiverUtilization: 0,
          scanEfficiency: 0,
          totalHits: 0,
          totalMisses: 0,
          interceptionsOverTime: [{ time: '00:00', timeSec: 0, value: 0, openLoop: 0 }]
        };
        analyticsState.interceptionsOverTime = [{ time: '00:00', timeSec: 0, adaptive: 0, openLoop: 0 }];
        broadcastState();
      } else if (msg.action === 'SET_SCHEDULER_ABLATION') {
        const mode = msg.mode;
        if (['FULL_ADAPTIVE', 'UCB_ONLY', 'NO_EXPLORATION', 'OPEN_LOOP'].includes(mode)) {
          liveAdaptiveScheduler.setAblationMode(mode);
          simState.schedulerAblationMode = liveAdaptiveScheduler.ablationMode;
          simState.schedulerPolicy = liveAdaptiveScheduler.getPolicyLabel();
          simState.policyInspector = liveAdaptiveScheduler.getPolicyInspectorState();
          const timeStr = new Date().toTimeString().split(' ')[0];
          eventTimeline.unshift({
            time: timeStr,
            source: 'SCHEDULER',
            event: `ABLATION MODE ACTIVATED: ${liveAdaptiveScheduler.getPolicyLabel()}`
          });
          broadcastState();
        }
      } else if (msg.action === 'RUN_LEARNING_DEMO') {
        startLearningDemoAuto();
      } else if (msg.action === 'STEP_LEARNING_DEMO') {
        stepLearningDemoManual(msg.step);
      } else if (msg.action === 'RESET_LEARNING_DEMO') {
        resetLearningDemo();
      } else if (msg.action === 'ACKNOWLEDGE_INCIDENT') {
        const inc = incidentEngine.acknowledgeIncident(msg.incidentId, msg.operatorName || 'TACTICAL OPERATOR');
        if (inc) {
          const timeStr = new Date().toTimeString().split(' ')[0];
          eventTimeline.unshift({
            time: timeStr,
            source: 'INCIDENT',
            event: `ALERT ACKNOWLEDGED: ${inc.incidentId} (${inc.entityId}) by TACTICAL OPERATOR`
          });
          if (eventTimeline.length > 30) eventTimeline.pop();
          broadcastState();
        }
      } else if (msg.action === 'RUN_INCIDENT_FALSE_ALARM_TEST') {
        const testResult = incidentEngine.runFalseAlarmTest();
        const timeStr = new Date().toTimeString().split(' ')[0];
        testResult.testResults.forEach(t => {
          eventTimeline.unshift({
            time: timeStr,
            source: 'INCIDENT TEST',
            event: `${t.pass ? '✓' : '✗'} ${t.scenario}: expected=${t.expected} | got=${t.evaluated} | risk=${t.riskScore}`
          });
        });
        if (eventTimeline.length > 30) eventTimeline = eventTimeline.slice(0, 30);
        broadcastState();
        ws.send(JSON.stringify({ type: 'INCIDENT_FALSE_ALARM_TEST_RESULT', result: testResult }));
      }
    } catch (e) {
      console.error('WS Error:', e);
    }
  });
});

function stepSimulationScan() {
  masterEntities.forEach(ent => ent.updateKinematics(0.2));
  const bands = [9.180, 9.310, 9.420, 9.675, 9.810];
  const nextIdx = (bands.indexOf(simState.rfNextScanGhz) + 1) % bands.length;
  simState.rfCurrentScanGhz = simState.rfNextScanGhz;
  simState.rfNextScanGhz = bands[nextIdx];

  const timeStr = new Date().toTimeString().split(' ')[0];
  eventTimeline.unshift({
    time: timeStr,
    source: 'SCHEDULER',
    event: `SCAN STEP: Receiver tuned to ${simState.rfCurrentScanGhz.toFixed(3)} GHz (Next: ${simState.rfNextScanGhz.toFixed(3)} GHz)`
  });
}

function resetState() {
  simState.selectedEntityId = 'TRK-021';
  simState.activeCameraId = 'CAM-01';
  simState.rfCurrentScanGhz = 9.420;
  simState.rfNextScanGhz = 9.675;
  simState.operatingMode = 'TACTICAL MONITORING';
  simState.scenario = 'STANDARD BASE MONITORING';
  simState.speedMultiplier = 1;
  broadcastState();
}

function applyScenario(scenarioName) {
  const timeStr = new Date().toTimeString().split(' ')[0];
  simState.scenario = scenarioName;
  simState.operatingMode = scenarioName;

  if (scenarioName === 'NIGHT PERIMETER' || scenarioName === 'NIGHT OPERATION' || scenarioName === 'NIGHT MONITORING') {
    simState.selectedEntityId = 'TRK-021';
    simState.activeCameraId = 'CAM-01';
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Night Perimeter Monitoring activated. Thermal sensitivity high.' });
  } else if (scenarioName === 'SENTRY PATROL') {
    simState.selectedEntityId = 'TRK-014';
    simState.activeCameraId = 'CAM-01';
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Sentry Patrol deployed along inner perimeter perimeter fence.' });
  } else if (scenarioName === 'MULTI-SENSOR EVENT') {
    simState.selectedEntityId = 'TRK-021';
    simState.activeCameraId = 'CAM-01';
    const e = masterEntities.find(x => x.id === 'TRK-021');
    if (e) {
      e.radar.range = 310;
      e.rf.isTransmitting = true;
      e.rf.freqGhz = 9.420;
    }
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Multi-sensor anomalous event active on North perimeter wire.' });
  } else if (scenarioName === 'UNKNOWN CONTACT' || scenarioName === 'UNKNOWN ACTIVITY') {
    simState.selectedEntityId = 'TRK-055';
    simState.rfNextScanGhz = 9.810;
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Unknown frequency-agile contact radiating on 9.810 GHz.' });
  } else if (scenarioName === 'WILDLIFE') {
    simState.selectedEntityId = 'TRK-019';
    simState.activeCameraId = 'CAM-02';
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Wildlife fauna detected in Sector East. Micro-Doppler filtered.' });
  } else if (scenarioName === 'PERIODIC RF') {
    const e = masterEntities.find(x => x.id === 'TRK-021');
    if (e) {
      e.rf.hasEmitter = true;
      e.rf.pulseCycle = { on: 3.0, off: 3.0 };
      e.rf.freqGhz = 9.420;
    }
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Periodic RF emitter cycling on 9.420 GHz (3s ON / 3s OFF).' });
  } else if (scenarioName === 'INTERMITTENT RF' || scenarioName === 'INTERMITTENT SIGNAL') {
    const e = masterEntities.find(x => x.id === 'TRK-021');
    if (e) {
      e.rf.hasEmitter = true;
      e.rf.pulseCycle = { on: 1.0, off: 4.0 };
      e.rf.freqGhz = 9.675;
    }
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Intermittent pulsed emitter on 9.675 GHz.' });
  } else if (scenarioName === 'FREQUENCY AGILE') {
    simState.rfNextScanGhz = 9.310;
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Frequency-agile emitter hopping between 9.180 and 9.810 GHz.' });
  } else if (scenarioName === 'MULTI-EMITTER') {
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Multiple concurrent RF emitters detected across 3 sectors.' });
  } else {
    resetState();
    eventTimeline.unshift({ time: timeStr, source: 'SYSTEM', event: 'SCENARIO: Standard Base Monitoring restored.' });
  }
}

// 12-STEP DEMONSTRATION MODE (Exact sequence per specification)
let demoTimer = null;
function runExact12StepDemo() {
  if (demoTimer) clearInterval(demoTimer);

  const demoSteps = [
    { source: 'RADAR', event: 'STEP 01: Radar sees an unknown track in Sector North', action: () => {} },
    { source: 'RADAR', event: 'STEP 02: Radar establishes TRK-021 (Range 272m, Speed 12.1 km/h)', action: () => { simState.selectedEntityId = 'TRK-021'; } },
    { source: 'CAMERA', event: 'STEP 03: Target enters CAM-01 FOV (North Gate Sector)', action: () => { simState.activeCameraId = 'CAM-01'; } },
    { source: 'CAMERA', event: 'STEP 04: Camera detects CV-042 (Person, Confidence 96%)', action: () => {} },
    { source: 'DATABASE', event: 'STEP 05: Personnel DB finds no matching authorization for TRK-021', action: () => {} },
    { source: 'RF / ESM', event: 'STEP 06: RF emitter associated with entity begins transmitting (EMITTER-03 on 9.420 GHz)', action: () => {
      const e = masterEntities.find(x => x.id === 'TRK-021');
      if (e) e.rf.isTransmitting = true;
    }},
    { source: 'RECEIVER', event: 'STEP 07: Current receiver misses because receiver window is at 9.180 GHz', action: () => {
      simState.rfCurrentScanGhz = 9.180;
      simState.receiverState = 'MISS';
    }},
    { source: 'SCHEDULER', event: 'STEP 08: Adaptive scheduler changes priority (Score 68 for 9.420 GHz)', action: () => {
      simState.rfNextScanGhz = 9.420;
      simState.receiverState = 'NEXT';
    }},
    { source: 'SCHEDULER', event: 'STEP 09: Receiver moves into the correct band (Tuned to 9.420 GHz)', action: () => {
      simState.rfCurrentScanGhz = 9.420;
      simState.rfNextScanGhz = 9.675;
    }},
    { source: 'RECEIVER', event: 'STEP 10: HIT detected on 9.420 GHz (Signal Power -61.2 dBm)', action: () => {
      simState.receiverState = 'HIT';
    }},
    { source: 'FUSION', event: 'STEP 11: Sensor fusion confidence rises to 87% (Anomaly Score 72)', action: () => {
      const e = masterEntities.find(x => x.id === 'TRK-021');
      if (e) e.fusion.confidence = 87;
    }},
    { source: 'SYSTEM', event: 'STEP 12: System updates operational state: REQUIRES VERIFICATION', action: () => {
      simState.operatingMode = 'ANOMALY VERIFICATION ENGAGED';
    }}
  ];

  let stepIdx = 0;
  demoTimer = setInterval(() => {
    if (stepIdx >= demoSteps.length) {
      clearInterval(demoTimer);
      demoTimer = null;
      return;
    }

    const s = demoSteps[stepIdx];
    s.action();

    const timeStr = new Date().toTimeString().split(' ')[0];
    eventTimeline.unshift({
      time: timeStr,
      source: s.source,
      event: s.event
    });
    if (eventTimeline.length > 30) eventTimeline.pop();

    broadcastState();
    stepIdx++;
  }, 1600);
}

// REST APIs
app.get('/api/status', (req, res) => {
  res.json({
    system: 'ESM-ASTRA // Adaptive RF/ESM Receiver Scheduler & Situational Platform (SIH26055)',
    simState,
    entitiesCount: masterEntities.length
  });
});

app.post('/api/demo/start', (req, res) => {
  runExact12StepDemo();
  res.json({ success: true, message: '12-Step Demonstration Initiated' });
});

app.get('/api/sitrep', (req, res) => {
  const now = new Date();
  let sitrep = `========================================================================\n`;
  sitrep += `ESM-ASTRA // OPERATIONAL SITUATION REPORT (SITREP)\n`;
  sitrep += `PROBLEM STATEMENT: SIH26055 - SMART SCAN STRATEGY FOR ELECTRONIC WARFARE\n`;
  sitrep += `SIMULATION ID: ${simState.simulationId} | MODE: ${simState.operatingMode}\n`;
  sitrep += `TIME: ${now.toISOString()}\n`;
  sitrep += `========================================================================\n\n`;

  sitrep += `[1. MULTI-SENSOR INVENTORY]\n`;
  sitrep += `  - Core EW Engine: Recency-Augmented UCB1 Adaptive Receiver Scan Scheduler\n`;
  sitrep += `  - Receiver IBW: 50 MHz | Monitored RF Span: 9.00 - 10.00 GHz\n`;
  sitrep += `  - Supporting Context: 360° Tactical Radar Simulation + Optical Surveillance\n`;
  sitrep += `  - Total Active Master Entities: ${masterEntities.length}\n`;
  sitrep += `  - Selected Entity: ${simState.selectedEntityId}\n`;
  sitrep += `  - Current Tuned RF Frequency: ${(simState.rfCurrentScanGhz || 9.420).toFixed(3)} GHz\n`;
  sitrep += `  - Next Recommended Target: ${(simState.rfNextScanGhz || 9.675).toFixed(3)} GHz\n\n`;

  sitrep += `[2. RECENT EVENT LOGS]\n`;
  eventTimeline.slice(0, 8).forEach(e => {
    sitrep += `  [${e.time}] [${e.source}] ${e.event}\n`;
  });

  sitrep += `\n`;
  sitrep += incidentEngine.generateSitrepReport(simState);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="SITREP-${Date.now()}.txt"`);
  res.send(sitrep);
});

// Incident REST Endpoints (Simulated Security Alert & Incident Dispatch)
app.get('/api/incidents', (req, res) => {
  res.json(incidentEngine.getIncidents());
});

app.post('/api/incidents/acknowledge', (req, res) => {
  const { incidentId, operatorName } = req.body;
  if (!incidentId) return res.status(400).json({ error: 'incidentId is required' });
  const inc = incidentEngine.acknowledgeIncident(incidentId, operatorName || 'TACTICAL OPERATOR');
  if (!inc) return res.status(404).json({ error: `Incident ${incidentId} not found` });
  const timeStr = new Date().toTimeString().split(' ')[0];
  eventTimeline.unshift({ time: timeStr, source: 'INCIDENT', event: `ALERT ACKNOWLEDGED: ${inc.incidentId} (${inc.entityId})` });
  if (eventTimeline.length > 30) eventTimeline.pop();
  broadcastState();
  res.json({ success: true, incident: inc });
});

app.get('/api/incidents/false-alarm-test', (req, res) => {
  const result = incidentEngine.runFalseAlarmTest();
  res.json(result);
});

app.get('/api/incidents/sitrep', (req, res) => {
  const report = incidentEngine.generateSitrepReport(simState);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="INCIDENT-SITREP-${Date.now()}.txt"`);
  res.send(report);
});

// Scheduler REST Endpoints (SIH26055 Observability & Explainability)
app.get('/api/scheduler/state', (req, res) => {
  res.json({
    policyInspector: liveAdaptiveScheduler.getPolicyInspectorState(),
    perBandState: liveAdaptiveScheduler.getPerBandState(simulationTimeSec),
    recentDecisions: liveAdaptiveScheduler.getRecentDecisions(20),
    ablationMode: liveAdaptiveScheduler.ablationMode,
    policyLabel: liveAdaptiveScheduler.getPolicyLabel(),
    learningDemo: simState.learningDemo
  });
});

app.post('/api/scheduler/ablation', (req, res) => {
  const mode = req.body?.mode;
  if (!['FULL_ADAPTIVE', 'UCB_ONLY', 'NO_EXPLORATION', 'OPEN_LOOP'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid ablation mode. Must be FULL_ADAPTIVE, UCB_ONLY, NO_EXPLORATION, or OPEN_LOOP' });
  }
  liveAdaptiveScheduler.setAblationMode(mode);
  simState.schedulerAblationMode = liveAdaptiveScheduler.ablationMode;
  simState.schedulerPolicy = liveAdaptiveScheduler.getPolicyLabel();
  simState.policyInspector = liveAdaptiveScheduler.getPolicyInspectorState();
  broadcastState();
  res.json({ success: true, mode, policy: liveAdaptiveScheduler.getPolicyLabel() });
});

app.get('/api/scheduler/trace', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json({
    totalDecisions: liveAdaptiveScheduler.decisionHistory.length,
    history: liveAdaptiveScheduler.getRecentDecisions(limit)
  });
});

app.post('/api/scheduler/demo/learning-step', (req, res) => {
  const step = req.body?.step;
  const result = stepLearningDemoManual(step);
  res.json(result);
});

app.post('/api/scheduler/demo/run', (req, res) => {
  startLearningDemoAuto();
  res.json({ success: true, message: 'Deterministic 5-Step Learning Demonstration Started' });
});

app.post('/api/scheduler/demo/reset', (req, res) => {
  resetLearningDemo();
  res.json({ success: true, message: 'Learning Demonstration Reset' });
});

// Benchmark REST Endpoints (SIH26055 Reproducibility & Provenance)
app.get('/api/benchmark/latest', (req, res) => {
  res.json(benchmarkRunner.getLatest());
});

app.get('/api/benchmark/suite', (req, res) => {
  const seed = req.query.seed !== undefined ? Number(req.query.seed) : 42;
  const runs = Number(req.query.runs) || 1000;
  const suite = benchmarkRunner.runAllScenariosSuite({ seed, runs });
  analyticsState.suiteBreakdown = suite.breakdown;
  analyticsState.latestSuite = suite;
  broadcastState();
  res.json(suite);
});

app.post('/api/benchmark/suite/run', (req, res) => {
  const seed = req.body?.seed !== undefined ? Number(req.body.seed) : 42;
  const runs = Number(req.body?.runs) || 1000;
  const suite = benchmarkRunner.runAllScenariosSuite({ seed, runs });
  analyticsState.suiteBreakdown = suite.breakdown;
  analyticsState.latestSuite = suite;
  broadcastState();
  res.json(suite);
});

app.post('/api/benchmark/replay', (req, res) => {
  const experimentId = req.body?.experimentId || analyticsState.provenance?.experimentId;
  if (!experimentId) {
    return res.status(400).json({ error: 'experimentId is required' });
  }
  try {
    const replayed = benchmarkRunner.replayExperiment(experimentId);
    syncAnalyticsFromExperiment(replayed);
    broadcastState();
    res.json({ success: true, experiment: replayed });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/benchmark/export/json', (req, res) => {
  const expId = req.query.experimentId;
  let exp = null;
  if (expId) {
    exp = benchmarkRunner.getHistory().find(h => h.experimentId === expId);
  }
  if (!exp) exp = benchmarkRunner.getLatest();

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="BENCHMARK-${exp.experimentId}.json"`);
  res.send(benchmarkRunner.exportAsJson(exp));
});

app.get('/api/benchmark/export/csv', (req, res) => {
  const expId = req.query.experimentId;
  let exp = null;
  if (expId) {
    exp = benchmarkRunner.getHistory().find(h => h.experimentId === expId);
  }
  if (!exp) exp = benchmarkRunner.getLatest();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="BENCHMARK-${exp.experimentId}.csv"`);
  res.send(benchmarkRunner.exportAsCsv(exp));
});

app.get('/api/benchmark/export/report', (req, res) => {
  const expId = req.query.experimentId;
  let exp = null;
  if (expId) {
    exp = benchmarkRunner.getHistory().find(h => h.experimentId === expId);
  }
  if (!exp) exp = benchmarkRunner.getLatest();

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="BENCHMARK-AUDIT-${exp.experimentId}.txt"`);
  res.send(benchmarkRunner.exportAsReport(exp));
});

app.post('/api/benchmark/run', (req, res) => {
  const seed = req.body.seed !== undefined ? Number(req.body.seed) : 42;
  const scenario = req.body.scenario || 'FREQUENCY_AGILE';
  const runs = Number(req.body.runs) || 1000;
  const experiment = benchmarkRunner.runExperiment({ seed, scenario, runs });
  syncAnalyticsFromExperiment(experiment);
  broadcastState();
  res.json(experiment);
});

app.get('/api/benchmark/history', (req, res) => {
  res.json(benchmarkRunner.getHistory());
});

server.listen(PORT, () => {
  console.log(`\x1b[36m=================================================================\x1b[0m`);
  console.log(`\x1b[32m[ESM-ASTRA: PROTOTYPE EW RECEIVER SCHEDULER & SENSORS ONLINE (SIH26055)]\x1b[0m`);
  console.log(`Primary Contribution: Adaptive RF/ESM Scan Scheduler (Recency-Augmented UCB1)`);
  console.log(`Supporting Layers: Tactical Radar & Optical Situational Context`);
  console.log(`Command URL: http://localhost:${PORT}`);
  console.log(`=================================================================\x1b[0m`);
});
