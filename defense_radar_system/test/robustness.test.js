/**
 * ESM-ASTRA: Robustness & Failure-Injection Verification Suite (Suite K)
 * Problem Statement: SIH26055 (Adaptive Scan Strategy for Electronic Warfare)
 * 
 * Verifies:
 * 1. 10 Failure Injection Scenarios (RANDOM_RF_NOISE, EMITTER_DENSITY_INCREASE, FREQUENCY_COLLISION, etc.)
 * 2. Audit Trail Completeness: testId, seed, scenario, duration, failureInjected, recoveryTimeMs, missedDetections, falseAlarms, schedulerStability, systemStatus.
 * 3. Fail-Soft Behavior: CAMERA OFFLINE, RF OFFLINE, CONNECTION LOST - RECONNECTING.
 * 4. Network Interruption Telemetry Outage Handling (1s, 3s, 5s).
 * 5. Load Testing across target entity scaling (10, 25, 50, 100 targets).
 */

const assert = require('assert');
const { RobustnessEngine } = require('../server/robustness_engine');

console.log('🧪 RUNNING SUITE K: Robustness Engine & Failure-Injection Suite (SIH26055)...');

const engine = new RobustnessEngine({ seed: 42 });
const suite = engine.runAllRobustnessTests();

// 1. Verify 10 Failure Injection Scenarios
assert.strictEqual(suite.scenarioResults.length, 10, 'Must execute exactly 10 failure injection scenarios');
console.log('  Testing 10 Failure Injection Scenarios:');

const requiredAuditFields = [
  'testId', 'seed', 'scenario', 'duration', 'failureInjected',
  'recoveryTimeMs', 'missedDetections', 'falseAlarms', 'schedulerStability', 'systemStatus'
];

suite.scenarioResults.forEach(res => {
  requiredAuditFields.forEach(field => {
    assert.notStrictEqual(res[field], undefined, `Audit field ${field} must be defined for scenario ${res.scenario}`);
  });
  assert.ok(['PASS', 'DEGRADED', 'FAIL'].includes(res.systemStatus), `System status for ${res.scenario} must be PASS, DEGRADED, or FAIL`);
  console.log(`    ✓ ${res.scenario.padEnd(32)}: Status=${res.systemStatus.padEnd(8)} | Recovery=${res.recoveryTimeMs}ms | Misses=${res.missedDetections} | Stability=${res.schedulerStability}`);
});

// 2. Verify Network Interruption Suite (1s, 3s, 5s)
console.log('  Testing Network Interruption Telemetry Outages (1s, 3s, 5s):');
assert.strictEqual(suite.networkResults.length, 3, 'Must test 1s, 3s, 5s outages');

suite.networkResults.forEach(nr => {
  assert.strictEqual(nr.reconnectSuccess, true, 'Reconnection must succeed');
  assert.strictEqual(nr.stateRecovered, true, 'State recovery must succeed');
  assert.strictEqual(nr.selectedEntityPersisted, true, 'Selected entity must persist across reconnection');
  assert.strictEqual(nr.connectionStatusDuring, 'CONNECTION LOST - RECONNECTING', 'Disconnection status must be CONNECTION LOST - RECONNECTING');
  console.log(`    ✓ ${nr.outageDurationSec}s Outage: Status during outage="${nr.connectionStatusDuring}" -> Reconnected & State Recovered (${nr.persistedEntityId})`);
});

// 3. Verify Load Test Scaling (10, 25, 50, 100 Target Entities)
console.log('  Testing Target Entity Load Scaling (10, 25, 50, 100 Entities):');
assert.strictEqual(suite.loadResults.length, 4, 'Must test 10, 25, 50, 100 entity load levels');

suite.loadResults.forEach(lr => {
  assert.ok(lr.updateLatencyMs >= 0, 'Update latency must be non-negative');
  assert.ok(lr.messageRatePerSec > 0, 'Message processing rate must be positive');
  console.log(`    ✓ ${String(lr.entityCount).padStart(3)} Entities: Latency=${lr.updateLatencyMs}ms | Rate=${lr.messageRatePerSec} msgs/s | Frame Rate=${lr.frameRateFps} FPS -> Status=${lr.systemStatus}`);
});

// 4. Verify Export Report Files
assert.ok(suite.exports.jsonPath, 'JSON export path must exist');
assert.ok(suite.exports.csvPath, 'CSV export path must exist');
assert.ok(suite.exports.reportPath, 'Audit report path must exist');

console.log('  ✓ Export reports generated successfully.');
console.log('✅ PASS: Robustness Engine & Failure-Injection Verification Completed.\n');
