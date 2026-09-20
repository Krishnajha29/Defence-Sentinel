/**
 * Automated Test: Benchmark Reproducibility & Performance Superiority
 * SIH26055: Smart Scan Strategy for Electronic Warfare
 */

const assert = require('assert');
const { BenchmarkRunner } = require('../server/benchmark_runner');

console.log('🧪 RUNNING TEST: Benchmark Reproducibility & Performance Comparison...');

const runner1 = new BenchmarkRunner();
const exp1 = runner1.runExperiment({ seed: 42, scenario: 'FREQUENCY_AGILE', runs: 500 });

// 1. Re-run identical experiment with seed=42
const runner2 = new BenchmarkRunner();
const exp2 = runner2.runExperiment({ seed: 42, scenario: 'FREQUENCY_AGILE', runs: 500 });

// Assert exact mathematical reproducibility
assert.strictEqual(exp1.results.adaptive.totalHits, exp2.results.adaptive.totalHits, 'Total adaptive hits must match identically');
assert.strictEqual(exp1.results.openLoop.totalHits, exp2.results.openLoop.totalHits, 'Total open-loop hits must match identically');
assert.strictEqual(exp1.results.adaptive.detectionRate, exp2.results.adaptive.detectionRate, 'Adaptive detection rate must match identically');
assert.strictEqual(exp1.results.openLoop.detectionRate, exp2.results.openLoop.detectionRate, 'Open-loop detection rate must match identically');

console.log(`  ✓ Seed 42 reproduced exact results:`);
console.log(`    Adaptive Detection Rate: ${exp1.results.adaptive.detectionRate}% (Hits: ${exp1.results.adaptive.totalHits}/500)`);
console.log(`    Open-Loop Detection Rate: ${exp1.results.openLoop.detectionRate}% (Hits: ${exp1.results.openLoop.totalHits}/500)`);

// 2. Assert Adaptive UCB statistically outperforms Open-Loop Sequential on agile emitters
assert(
  exp1.results.adaptive.detectionRate > exp1.results.openLoop.detectionRate + 15,
  'Adaptive UCB must outperform Open-Loop Sequential scanner by at least 15% on frequency agile emitters'
);
console.log(`  ✓ Performance superiority confirmed: Adaptive lead = +${(exp1.results.adaptive.detectionRate - exp1.results.openLoop.detectionRate).toFixed(1)}%`);

// 3. Verify provenance metadata exists
assert(exp1.experimentId, 'Must have experiment ID');
assert.strictEqual(exp1.randomSeed, 42, 'Must record random seed');
assert(exp1.metricDefinitions.detectionRate, 'Must record metric definition');
console.log('  ✓ Experiment provenance metadata fully verified');

console.log('✅ PASS: Benchmark Reproducibility & Metric Superiority Verified.\n');
