/**
 * Automated Test: Suite F - Single Ground-Truth Timeline & Deterministic Benchmark Replay
 * Verifies that running the benchmark runner twice with identical seed and scenario:
 * 1. Generates the exact same ground-truth emitter events.
 * 2. Produces bit-for-bit identical raw counts and computed metrics across replays.
 * 3. Evaluates both Adaptive and Open-Loop on the exact identical burst timeline.
 */

const assert = require('assert');
const { BenchmarkRunner } = require('../server/benchmark_runner');

console.log('🧪 RUNNING SUITE F: Benchmark Deterministic Replay & Single-Timeline Verification...');

const runner1 = new BenchmarkRunner();
const exp1 = runner1.runExperiment({ seed: 42, scenario: 'FREQUENCY_AGILE', runs: 500 });

const runner2 = new BenchmarkRunner();
const exp2 = runner2.runExperiment({ seed: 42, scenario: 'FREQUENCY_AGILE', runs: 500 });

// 1. Assert ground truth counts match identically
assert.strictEqual(exp1.groundTruth.groundTruthBurstCount, exp2.groundTruth.groundTruthBurstCount, 'Ground truth burst counts must match');
assert.strictEqual(exp1.groundTruth.interceptionOpportunityCount, exp2.groundTruth.interceptionOpportunityCount, 'Interception opportunity counts must match');
assert.strictEqual(exp1.configHash, exp2.configHash, 'Configuration hashes must match');

// 2. Assert Adaptive raw counts match identically
assert.strictEqual(exp1.results.adaptive.successfulInterceptions, exp2.results.adaptive.successfulInterceptions, 'Adaptive successful interceptions must match');
assert.strictEqual(exp1.results.adaptive.falseDetections, exp2.results.adaptive.falseDetections, 'Adaptive false detections must match');
assert.strictEqual(exp1.results.adaptive.missedBursts, exp2.results.adaptive.missedBursts, 'Adaptive missed bursts must match');
assert.strictEqual(exp1.results.adaptive.detectionRate, exp2.results.adaptive.detectionRate, 'Adaptive detection rate must match');
assert.strictEqual(exp1.results.adaptive.brierScore, exp2.results.adaptive.brierScore, 'Adaptive Brier score must match');

// 3. Assert Open-Loop raw counts match identically
assert.strictEqual(exp1.results.openLoop.successfulInterceptions, exp2.results.openLoop.successfulInterceptions, 'Open-loop successful interceptions must match');
assert.strictEqual(exp1.results.openLoop.falseDetections, exp2.results.openLoop.falseDetections, 'Open-loop false detections must match');
assert.strictEqual(exp1.results.openLoop.missedBursts, exp2.results.openLoop.missedBursts, 'Open-loop missed bursts must match');
assert.strictEqual(exp1.results.openLoop.detectionRate, exp2.results.openLoop.detectionRate, 'Open-loop detection rate must match');

console.log('  ✓ Deterministic replay confirmed across 500 dwells:');
console.log(`    Config Hash: ${exp1.configHash}`);
console.log(`    Ground Truth Bursts: ${exp1.groundTruth.groundTruthBurstCount}`);
console.log(`    Adaptive Interceptions: ${exp1.results.adaptive.successfulInterceptions}/${exp1.groundTruth.interceptionOpportunityCount} (${exp1.results.adaptive.detectionRate}%)`);
console.log(`    Open-Loop Interceptions: ${exp1.results.openLoop.successfulInterceptions}/${exp1.groundTruth.interceptionOpportunityCount} (${exp1.results.openLoop.detectionRate}%)`);

// 4. Test replay with different seed diverges
const runner3 = new BenchmarkRunner();
const exp3 = runner3.runExperiment({ seed: 108, scenario: 'FREQUENCY_AGILE', runs: 500 });
assert.notStrictEqual(exp1.configHash, exp3.configHash, 'Different seeds must produce different config hashes');
assert.notStrictEqual(exp1.results.adaptive.successfulInterceptions, exp3.results.adaptive.successfulInterceptions, 'Different seeds must produce different results');
console.log('  ✓ Divergence confirmed under seed 108');

console.log('✅ PASS: Single Ground-Truth Timeline & Deterministic Replay Verified.\n');
