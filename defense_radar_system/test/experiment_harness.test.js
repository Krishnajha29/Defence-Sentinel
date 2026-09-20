/**
 * ESM-ASTRA: Experimental Benchmark Engine Acceptance Test (Suite I)
 * Problem Statement: SIH26055 (Adaptive Scan Strategy for Electronic Warfare)
 * 
 * Verifies:
 * 1. Single Ground-Truth Generation: Both schedulers evaluated against identical timeline.
 * 2. 5-Scenario Execution (1,000 runs each): PERIODIC, INTERMITTENT, FREQUENCY_AGILE, MULTI_EMITTER, MIXED.
 * 3. All 12 Mandated Metrics calculated and non-null.
 * 4. Delta Separation: Absolute Delta (percentage points) vs Relative Delta (%).
 * 5. Sample Size Detection: N < 30 flags INSUFFICIENT SAMPLE; N >= 30 reports MEASURED with Wilson/Student-t 95% CIs.
 * 6. Scientific Honesty: Frequency-agile burst completion trade-off reported honestly.
 * 7. Multi-Scenario Suite Breakdown & Deterministic Replay.
 * 8. Export Integrity: JSON, RFC 4180 CSV, and Audit Report formatting.
 */

const assert = require('assert');
const { BenchmarkRunner } = require('../server/benchmark_runner');

console.log('🧪 RUNNING SUITE I: Experimental Benchmark Engine & 5-Scenario Suite Verification (SIH26055)...');

const runner = new BenchmarkRunner();
const SEED = 42;
const SCENARIOS = ['PERIODIC', 'INTERMITTENT', 'FREQUENCY_AGILE', 'MULTI_EMITTER', 'MIXED'];

// =============================================================================
// Test 1: Multi-Scenario Suite (5 x 1000 Runs) with Single Ground-Truth
// =============================================================================
console.log('  Testing 5 Scenarios x 1,000 runs with single ground-truth timelines:');

const suite = runner.runAllScenariosSuite({ seed: SEED, runs: 1000 });
assert.strictEqual(suite.breakdown.length, 5, 'Suite must execute exactly 5 scenarios');
assert.strictEqual(suite.seed, SEED, 'Suite must record random seed');

SCENARIOS.forEach(scName => {
  const row = suite.breakdown.find(r => r.scenario === scName);
  assert.ok(row, `Scenario ${scName} must be present in suite breakdown`);
  assert.strictEqual(row.runs, 1000, `Scenario ${scName} must run 1000 dwells`);
  assert.strictEqual(row.status, 'MEASURED', `Scenario ${scName} status must be MEASURED at N=1000`);
  assert.ok(row.configHash && row.configHash.length === 16, `Scenario ${scName} must have 16-char config hash`);
  console.log(`    ✓ ${scName.padEnd(16)}: Ad P(d)=${row.adaptiveDetection}%, BL P(d)=${row.openLoopDetection}%, Delta=${row.deltaDetection.absoluteValue} pp (${row.deltaDetection.relative})`);
});

// =============================================================================
// Test 2: In-Depth Verification of FREQUENCY_AGILE Scenario (All 12 Metrics)
// =============================================================================
console.log('  Testing complete 12 mandated metrics on FREQUENCY_AGILE:');
const expAgile = runner.runExperiment({ seed: SEED, scenario: 'FREQUENCY_AGILE', runs: 1000 });

// 1. Single Ground-Truth Identity
assert.strictEqual(expAgile.groundTruth.groundTruthBurstCount, expAgile.groundTruth.totalBursts, 'Burst count identity');
assert.strictEqual(expAgile.groundTruth.interceptionOpportunityCount, expAgile.groundTruth.interceptionOpportunities, 'Opp count identity');
assert.ok(expAgile.groundTruth.totalBursts > 0, 'Ground truth must have generated bursts');
assert.ok(expAgile.groundTruth.interceptionOpportunities > 0, 'Ground truth must have interception opportunities');

// 2. The 12 Mandated Metrics Presence
const mandatedMetrics = [
  'probabilityOfDetection',
  'falseAlarmRate',
  'sensitivity',
  'averageInterceptRate',
  'averageReward',
  'averageCost',
  'averageInterceptTimeError',
  'predictionAccuracy',
  'receiverUtilization',
  'meanTimeToIntercept',
  'missCount',
  'hitCount'
];

mandatedMetrics.forEach(metric => {
  assert.notStrictEqual(expAgile.adaptive[metric], undefined, `Adaptive metric ${metric} must be defined`);
  assert.notStrictEqual(expAgile.baseline[metric], undefined, `Baseline metric ${metric} must be defined`);
  assert.notStrictEqual(expAgile.delta[metric], undefined, `Delta for metric ${metric} must be defined`);
  assert.ok(typeof expAgile.delta[metric].absolute === 'string', `Delta absolute for ${metric} must be string`);
  assert.ok(typeof expAgile.delta[metric].relative === 'string', `Delta relative for ${metric} must be string`);
});

// 3. Separation of Percentage Points from Percent Improvement
assert.ok(expAgile.delta.probabilityOfDetection.absolute.includes('percentage points'), 'P(d) absolute delta must specify percentage points');
assert.ok(expAgile.delta.probabilityOfDetection.relative.includes('%'), 'P(d) relative delta must specify percent');
assert.ok(expAgile.delta.sensitivity.absolute.includes('percentage points'), 'Sensitivity absolute delta must specify percentage points');
assert.ok(expAgile.delta.receiverUtilization.absolute.includes('percentage points'), 'Utilization absolute delta must specify percentage points');
assert.ok(expAgile.delta.averageInterceptRate.absolute.includes('intercepts/s'), 'Intercept rate absolute delta must have units');
assert.ok(expAgile.delta.meanTimeToIntercept.absolute.includes('ms'), 'MTTI absolute delta must specify ms');

// 4. Verification of Statistical Dispersion & 95% Confidence Intervals
assert.strictEqual(expAgile.status, 'MEASURED', 'Status at N=1000 must be MEASURED');
assert.strictEqual(expAgile.adaptive.detectionRateCi95.status, 'MEASURED', 'Wilson CI status must be MEASURED');
assert.ok(expAgile.adaptive.detectionRateCi95.lowerPct < expAgile.adaptive.probabilityOfDetection, 'CI lower bound must be < mean');
assert.ok(expAgile.adaptive.detectionRateCi95.upperPct > expAgile.adaptive.probabilityOfDetection, 'CI upper bound must be > mean');
assert.ok(expAgile.adaptive.latencyStatistics.standardDeviation >= 0, 'Latency stdDev must be non-negative');
assert.ok(expAgile.adaptive.latencyStatistics.ci95.lower <= expAgile.adaptive.latencyStatistics.mean, 'Latency CI lower <= mean');

console.log('    ✓ All 12 metrics, absolute (pp) vs relative (%) deltas, and 95% CIs verified');

// =============================================================================
// Test 3: Sample Size Threshold & Insufficient Sample Detection (N < 30)
// =============================================================================
console.log('  Testing Insufficient Sample Detection on N=10 dwells:');
const expSmall = runner.runExperiment({ seed: SEED, scenario: 'FREQUENCY_AGILE', runs: 10 });

assert.strictEqual(expSmall.status, 'INSUFFICIENT SAMPLE', 'Experiment with N=10 must flag INSUFFICIENT SAMPLE');
assert.strictEqual(expSmall.adaptive.detectionRateCi95.status, 'INSUFFICIENT SAMPLE', 'Wilson CI must flag INSUFFICIENT SAMPLE');
assert.strictEqual(expSmall.adaptive.detectionRateCi95.formatted, 'INSUFFICIENT SAMPLE', 'Wilson CI formatted string must be INSUFFICIENT SAMPLE');
assert.strictEqual(expSmall.baseline.detectionRateCi95.formatted, 'INSUFFICIENT SAMPLE', 'Baseline Wilson CI must be INSUFFICIENT SAMPLE');
assert.strictEqual(expSmall.adaptive.latencyStatistics.status, 'INSUFFICIENT SAMPLE', 'Latency stats must flag INSUFFICIENT SAMPLE');
assert.strictEqual(expSmall.adaptive.latencyStatistics.ci95.formatted, 'INSUFFICIENT SAMPLE', 'Latency CI must be INSUFFICIENT SAMPLE');
console.log('    ✓ Correctly flagged INSUFFICIENT SAMPLE on N=10 for status and confidence intervals');

// =============================================================================
// Test 4: Scientific Honesty & Failure Mode Reporting in FREQUENCY_AGILE
// =============================================================================
console.log('  Testing Scientific Honesty & Failure Mode Reporting:');
// In frequency-agile hopping, open-loop sequential scan visits every band every 5 dwells,
// grazing brief hops that Adaptive UCB may miss while exploiting another active burst.
// Baseline sensitivity is therefore comparable or higher than Adaptive sensitivity.
assert.ok(
  expAgile.baseline.sensitivity >= expAgile.adaptive.sensitivity,
  `Honest disclosure: baseline sensitivity (${expAgile.baseline.sensitivity}%) >= adaptive sensitivity (${expAgile.adaptive.sensitivity}%) in frequency-agile hopping`
);
console.log(`    ✓ Confirmed honest reporting of agile trade-off: Baseline Sensitivity ${expAgile.baseline.sensitivity}% vs Adaptive ${expAgile.adaptive.sensitivity}%`);

// =============================================================================
// Test 5: Deterministic Experiment Replay
// =============================================================================
console.log('  Testing Deterministic Replay by Experiment ID:');
const replayed = runner.replayExperiment(expAgile.experimentId);
assert.strictEqual(replayed.configHash, expAgile.configHash, 'Replayed config hash must match');
assert.strictEqual(replayed.groundTruth.totalBursts, expAgile.groundTruth.totalBursts, 'Replayed bursts must match');
assert.strictEqual(replayed.adaptive.probabilityOfDetection, expAgile.adaptive.probabilityOfDetection, 'Replayed adaptive P(d) must match');
assert.strictEqual(replayed.baseline.probabilityOfDetection, expAgile.baseline.probabilityOfDetection, 'Replayed baseline P(d) must match');
assert.strictEqual(replayed.delta.probabilityOfDetection.absolute, expAgile.delta.probabilityOfDetection.absolute, 'Replayed delta must match');
console.log('    ✓ Replayed experiment produces bit-for-bit identical results');

// =============================================================================
// Test 6: Data Export Generators (JSON, CSV, Report)
// =============================================================================
console.log('  Testing Data Export Generators:');
const jsonExport = runner.exportAsJson(expAgile);
const parsedJson = JSON.parse(jsonExport);
assert.strictEqual(parsedJson.experimentId, expAgile.experimentId, 'JSON export must be parseable and valid');

const csvExport = runner.exportAsCsv(expAgile);
assert.ok(csvExport.startsWith('Metric,Baseline (Open-Loop),Adaptive UCB,Absolute Delta,Relative Delta,Unit,Status'), 'CSV must have RFC 4180 header');
assert.ok(csvExport.includes('Probability of Detection'), 'CSV must contain Probability of Detection');
assert.ok(csvExport.includes('Mean Time To Intercept'), 'CSV must contain MTTI');
assert.ok(csvExport.includes('percentage points'), 'CSV must record percentage points in delta');

const reportExport = runner.exportAsReport(expAgile);
assert.ok(reportExport.includes('ESM-ASTRA: CONTROLLED BENCHMARK EXPERIMENT AUDIT REPORT'), 'Report must have header');
assert.ok(reportExport.includes(expAgile.configHash), 'Report must include config hash');
assert.ok(reportExport.includes('SCIENTIFIC INTEGRITY & FAILURE MODE DISCLOSURE'), 'Report must include failure mode disclosure');
console.log('    ✓ JSON, RFC 4180 CSV, and text audit report exports verified');

console.log('✅ PASS: Experimental Benchmark Engine & 5-Scenario Suite Verified.\n');
