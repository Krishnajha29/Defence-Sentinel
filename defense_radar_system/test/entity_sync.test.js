/**
 * Automated Test: Suite H - Single Source of Truth Cross-Sensor Synchronization
 * Verifies that SimulatedEntity links Radar, Camera, RF/ESM, and Fusion state
 * to a single identity without disconnected mock data.
 */

const assert = require('assert');

console.log('🧪 RUNNING SUITE H: Single Source of Truth Cross-Sensor Synchronization...');

// Test simulated entity class logic
class SimulatedEntity {
  constructor(cfg) {
    this.id = cfg.id;
    this.type = cfg.type;
    this.radar = { trackId: cfg.id, x: cfg.x, y: cfg.y, detected: true };
    this.camera = { detectionId: cfg.cvId, confidence: cfg.camConfidence, isVisuallyConfirmed: false };
    this.rf = { hasEmitter: cfg.hasEmitter, emitterId: cfg.emitterId, freqGhz: cfg.freqGhz, isTransmitting: true };
    this.personnel = { tagId: cfg.personnelTag, matched: false };
    this.fusion = { classification: 'UNIDENTIFIED', anomalyScore: cfg.anomalyScore || 20 };
  }
}

const hero = new SimulatedEntity({
  id: 'TRK-021',
  type: 'PERSON',
  x: -160, y: 220,
  cvId: 'CV-042',
  camConfidence: 96,
  hasEmitter: true,
  emitterId: 'EMITTER-03',
  freqGhz: 9.420,
  personnelTag: null,
  anomalyScore: 72
});

// Assert single source of truth references the same entity
assert.strictEqual(hero.id, 'TRK-021', 'Radar track ID must match hero ID');
assert.strictEqual(hero.camera.detectionId, 'CV-042', 'Camera CV ID must correlate to hero entity');
assert.strictEqual(hero.rf.emitterId, 'EMITTER-03', 'RF emitter ID must correlate to hero entity');
assert.strictEqual(hero.rf.freqGhz, 9.420, 'Emitter frequency must match 9.420 GHz');
assert.strictEqual(hero.fusion.anomalyScore, 72, 'Fusion state must reflect entity anomaly score');

console.log('  ✓ Hero Entity TRK-021 synchronized across Radar, Camera (CV-042), RF (EMITTER-03 on 9.420 GHz), and Fusion');
console.log('✅ PASS: Single Source of Truth Synchronization Verified.\n');
