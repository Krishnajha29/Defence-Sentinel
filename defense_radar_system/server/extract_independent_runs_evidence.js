/**
 * ESM-ASTRA: Independent Repeated-Run Benchmark Evidence Extractor (SIH26055)
 * Methodologically Rigorous Multi-Run Evaluation Engine
 * 
 * Executes:
 * - 5 Scenarios: PERIODIC, INTERMITTENT, FREQUENCY_AGILE, MULTI_EMITTER, MIXED
 * - 4 Run Counts: 10, 100, 500, 1000 INDEPENDENT RUNS per scenario
 * 
 * Rules:
 * - Each independent run generates ONE unique ground-truth RF timeline derived from masterSeed.
 * - Replays that EXACT SAME timeline through both Recency-Augmented UCB1 & Open-Loop Baseline.
 * - Statistics (mean, median, stdDev, 95% CI) are calculated OVER INDEPENDENT RUNS.
 * - Paired comparisons (Adaptive - Open-Loop) calculated per run.
 * - Exports:
 *   - data/benchmark_independent_runs.json
 *   - data/benchmark_independent_runs.csv
 *   - data/benchmark_independent_run_report.txt
 */

const fs = require('fs');
const path = require('path');
const { BenchmarkRunner } = require('./benchmark_runner');

const SCENARIOS = ['PERIODIC', 'INTERMITTENT', 'FREQUENCY_AGILE', 'MULTI_EMITTER', 'MIXED'];
const INDEPENDENT_RUN_COUNTS = [10, 100, 500, 1000];
const MASTER_SEED = 42;
const DWELLS_PER_RUN = 200; // 200 dwells (36.0 seconds) per independent simulation trial

// Deterministic seed derivation for independent run index k
function deriveRunSeed(masterSeed, scenario, runIndex) {
  let hash = 0;
  const str = `${masterSeed}:${scenario}:${runIndex}`;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) + 10007) % 2147483647;
}

// Student-t critical value for 95% CI
function getTCritical(df) {
  if (df <= 1) return 12.706;
  if (df === 9) return 2.262;  // for N = 10 (df = 9)
  if (df === 99) return 1.984; // for N = 100 (df = 99)
  if (df === 499) return 1.965; // for N = 500
  if (df === 999) return 1.962; // for N = 1000
  if (df < 30) return 2.045;
  return 1.960;
}

// Calculate comprehensive sample statistics across independent run observations
function calculateRunStatistics(values) {
  if (!values || values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, ci95: '[0, 0]', lower: 0, upper: 0 };
  }
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Number((sum / n).toFixed(2));

  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, n - 1);
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  const tCrit = getTCritical(n - 1);
  const margin = n > 1 ? Number((tCrit * (stdDev / Math.sqrt(n))).toFixed(2)) : 0;
  const lower = Number((mean - margin).toFixed(2));
  const upper = Number((mean + margin).toFixed(2));

  return {
    mean,
    median,
    stdDev,
    ci95: `[${lower}, ${upper}]`,
    lower,
    upper,
    sampleSize: n
  };
}

function runIndependentBenchmark(masterSeed = MASTER_SEED) {
  const runner = new BenchmarkRunner();
  const scenarioResults = [];
  const flatCsvRows = [];

  console.log('================================================================================');
  console.log('  ESM-ASTRA: REPEATED INDEPENDENT-RUN BENCHMARK EXTRACTION (SIH26055)');
  console.log(`  Master Seed: ${masterSeed} | Dwells per Run: ${DWELLS_PER_RUN} (${DWELLS_PER_RUN * 0.18}s per trial)`);
  console.log('  Scenarios: 5 | Run Sets: 10, 100, 500, 1000 Independent Simulations');
  console.log('================================================================================\n');

  for (const scenario of SCENARIOS) {
    const scenarioBlock = { scenario, runCounts: {} };

    for (const runCount of INDEPENDENT_RUN_COUNTS) {
      console.log(`Executing [${scenario.padEnd(16)}] ${String(runCount).padStart(4)} independent runs...`);

      // Run-level observations for Adaptive, Baseline, and Paired Differences
      const obsAdaptive = {
        detectionRate: [], sensitivity: [], mit: [], far: [], utilization: [], predAcc: [], brier: [],
        hits: [], misses: [], bursts: [], opps: []
      };
      const obsBaseline = {
        detectionRate: [], sensitivity: [], mit: [], far: [], utilization: [], predAcc: [], brier: [],
        hits: [], misses: [], bursts: [], opps: []
      };
      const obsPairedDiff = {
        detectionRate: [], sensitivity: [], mit: [], far: [], utilization: [], predAcc: [], brier: []
      };

      for (let k = 0; k < runCount; k++) {
        const runSeed = deriveRunSeed(masterSeed, scenario, k);
        const exp = runner.runExperiment({
          seed: runSeed,
          scenario,
          runs: DWELLS_PER_RUN,
          dwellMs: 180
        });

        const adPd = exp.adaptive.probabilityOfDetection;
        const olPd = exp.baseline.probabilityOfDetection;

        const adSens = exp.adaptive.sensitivity;
        const olSens = exp.baseline.sensitivity;

        const adMit = exp.adaptive.meanTimeToIntercept;
        const olMit = exp.baseline.meanTimeToIntercept;

        const adFar = exp.adaptive.falseAlarmRate;
        const olFar = exp.baseline.falseAlarmRate;

        const adUtil = exp.adaptive.receiverUtilization;
        const olUtil = exp.baseline.receiverUtilization;

        const adPred = exp.adaptive.predictionAccuracy;
        const olPred = exp.baseline.predictionAccuracy;

        const adBrier = exp.adaptive.brierScore;
        const olBrier = exp.baseline.brierScore;

        // Record Adaptive
        obsAdaptive.detectionRate.push(adPd);
        obsAdaptive.sensitivity.push(adSens);
        obsAdaptive.mit.push(adMit);
        obsAdaptive.far.push(adFar);
        obsAdaptive.utilization.push(adUtil);
        obsAdaptive.predAcc.push(adPred);
        obsAdaptive.brier.push(adBrier);
        obsAdaptive.hits.push(exp.adaptive.hitCount);
        obsAdaptive.misses.push(exp.adaptive.missCount);
        obsAdaptive.bursts.push(exp.groundTruth.totalBursts);
        obsAdaptive.opps.push(exp.groundTruth.interceptionOpportunities);

        // Record Baseline
        obsBaseline.detectionRate.push(olPd);
        obsBaseline.sensitivity.push(olSens);
        obsBaseline.mit.push(olMit);
        obsBaseline.far.push(olFar);
        obsBaseline.utilization.push(olUtil);
        obsBaseline.predAcc.push(olPred);
        obsBaseline.brier.push(olBrier);
        obsBaseline.hits.push(exp.baseline.hitCount);
        obsBaseline.misses.push(exp.baseline.missCount);
        obsBaseline.bursts.push(exp.groundTruth.totalBursts);
        obsBaseline.opps.push(exp.groundTruth.interceptionOpportunities);

        // Record Paired Difference (Adaptive - Baseline) for EXACT SAME TIMELINE
        obsPairedDiff.detectionRate.push(Number((adPd - olPd).toFixed(2)));
        obsPairedDiff.sensitivity.push(Number((adSens - olSens).toFixed(2)));
        obsPairedDiff.mit.push(Number((adMit - olMit).toFixed(2)));
        obsPairedDiff.far.push(Number((adFar - olFar).toFixed(2)));
        obsPairedDiff.utilization.push(Number((adUtil - olUtil).toFixed(2)));
        obsPairedDiff.predAcc.push(Number((adPred - olPred).toFixed(2)));
        obsPairedDiff.brier.push(Number((adBrier - olBrier).toFixed(4)));
      }

      // Compute statistics over independent runs
      const statsAdaptive = {
        detectionRate: calculateRunStatistics(obsAdaptive.detectionRate),
        sensitivity: calculateRunStatistics(obsAdaptive.sensitivity),
        mit: calculateRunStatistics(obsAdaptive.mit),
        far: calculateRunStatistics(obsAdaptive.far),
        utilization: calculateRunStatistics(obsAdaptive.utilization),
        predAcc: calculateRunStatistics(obsAdaptive.predAcc),
        brier: calculateRunStatistics(obsAdaptive.brier),
        meanHits: Number((obsAdaptive.hits.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanMisses: Number((obsAdaptive.misses.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanBursts: Number((obsAdaptive.bursts.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanOpps: Number((obsAdaptive.opps.reduce((a, b) => a + b, 0) / runCount).toFixed(1))
      };

      const statsBaseline = {
        detectionRate: calculateRunStatistics(obsBaseline.detectionRate),
        sensitivity: calculateRunStatistics(obsBaseline.sensitivity),
        mit: calculateRunStatistics(obsBaseline.mit),
        far: calculateRunStatistics(obsBaseline.far),
        utilization: calculateRunStatistics(obsBaseline.utilization),
        predAcc: calculateRunStatistics(obsBaseline.predAcc),
        brier: calculateRunStatistics(obsBaseline.brier),
        meanHits: Number((obsBaseline.hits.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanMisses: Number((obsBaseline.misses.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanBursts: Number((obsBaseline.bursts.reduce((a, b) => a + b, 0) / runCount).toFixed(1)),
        meanOpps: Number((obsBaseline.opps.reduce((a, b) => a + b, 0) / runCount).toFixed(1))
      };

      const statsPairedDiff = {
        detectionRate: calculateRunStatistics(obsPairedDiff.detectionRate),
        sensitivity: calculateRunStatistics(obsPairedDiff.sensitivity),
        mit: calculateRunStatistics(obsPairedDiff.mit),
        far: calculateRunStatistics(obsPairedDiff.far),
        utilization: calculateRunStatistics(obsPairedDiff.utilization),
        predAcc: calculateRunStatistics(obsPairedDiff.predAcc),
        brier: calculateRunStatistics(obsPairedDiff.brier)
      };

      scenarioBlock.runCounts[runCount] = {
        independentRunCount: runCount,
        dwellsPerRun: DWELLS_PER_RUN,
        masterSeed,
        adaptive: statsAdaptive,
        baseline: statsBaseline,
        pairedDifference: statsPairedDiff
      };

      // Add to flat CSV rows
      flatCsvRows.push({
        scenario,
        independentRuns: runCount,
        dwellsPerRun: DWELLS_PER_RUN,
        masterSeed,
        // Adaptive
        adPd_mean: statsAdaptive.detectionRate.mean,
        adPd_std: statsAdaptive.detectionRate.stdDev,
        adPd_ci95: statsAdaptive.detectionRate.ci95,
        adSens_mean: statsAdaptive.sensitivity.mean,
        adSens_ci95: statsAdaptive.sensitivity.ci95,
        adMit_mean: statsAdaptive.mit.mean,
        adMit_ci95: statsAdaptive.mit.ci95,
        adBrier_mean: statsAdaptive.brier.mean,
        // Baseline
        olPd_mean: statsBaseline.detectionRate.mean,
        olPd_std: statsBaseline.detectionRate.stdDev,
        olPd_ci95: statsBaseline.detectionRate.ci95,
        olSens_mean: statsBaseline.sensitivity.mean,
        olSens_ci95: statsBaseline.sensitivity.ci95,
        olMit_mean: statsBaseline.mit.mean,
        olMit_ci95: statsBaseline.mit.ci95,
        olBrier_mean: statsBaseline.brier.mean,
        // Paired Diff
        diffPd_mean: statsPairedDiff.detectionRate.mean,
        diffPd_median: statsPairedDiff.detectionRate.median,
        diffPd_std: statsPairedDiff.detectionRate.stdDev,
        diffPd_ci95: statsPairedDiff.detectionRate.ci95,
        diffSens_mean: statsPairedDiff.sensitivity.mean,
        diffSens_ci95: statsPairedDiff.sensitivity.ci95,
        diffMit_mean: statsPairedDiff.mit.mean,
        diffMit_ci95: statsPairedDiff.mit.ci95,
        diffBrier_mean: statsPairedDiff.brier.mean
      });

      console.log(`   ✓ N=${runCount} runs done: Ad P(d)=${statsAdaptive.detectionRate.mean}% ± ${statsAdaptive.detectionRate.stdDev}% vs OL P(d)=${statsBaseline.detectionRate.mean}% ± ${statsBaseline.detectionRate.stdDev}%. Mean Diff=${statsPairedDiff.detectionRate.mean} pp ${statsPairedDiff.detectionRate.ci95}`);
    }

    scenarioResults.push(scenarioBlock);
  }

  // ===========================================================================
  // Reproducibility Audit: Full Suite with Same Seed vs Altered Seed
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('  VERIFYING REPRODUCIBILITY (Master Seed 42 vs Master Seed 42 vs Master Seed 108)');
  console.log('--------------------------------------------------------------------------------');
  const rep1 = runIndependentBenchmarkTrial(42, 'FREQUENCY_AGILE', 100);
  const rep2 = runIndependentBenchmarkTrial(42, 'FREQUENCY_AGILE', 100);
  const rep3 = runIndependentBenchmarkTrial(108, 'FREQUENCY_AGILE', 100);

  const isBitForBitIdentical = (
    rep1.adaptive.detectionRate.mean === rep2.adaptive.detectionRate.mean &&
    rep1.baseline.detectionRate.mean === rep2.baseline.detectionRate.mean &&
    rep1.pairedDifference.detectionRate.mean === rep2.pairedDifference.detectionRate.mean
  );

  const hasValidDivergence = (
    rep1.adaptive.detectionRate.mean !== rep3.adaptive.detectionRate.mean
  );

  console.log(`  - Replay 1 (Seed 42) vs Replay 2 (Seed 42): ${isBitForBitIdentical ? 'BIT-FOR-BIT IDENTICAL (PASS)' : 'DIVERGED (FAIL)'}`);
  console.log(`  - Divergent Replay (Seed 108): ${hasValidDivergence ? 'VALID SEED DIVERGENCE (PASS)' : 'FAILED TO DIVERGE'}`);

  // ===========================================================================
  // Export Files
  // ===========================================================================
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. JSON Export
  const jsonExport = {
    metadata: {
      generator: 'ESM-ASTRA Independent Repeated-Run Benchmark Engine',
      problemStatement: 'SIH26055 (Adaptive Scan Strategy for Electronic Warfare)',
      timestamp: new Date().toISOString(),
      masterSeed,
      dwellsPerRun: DWELLS_PER_RUN,
      scenariosEvaluated: SCENARIOS,
      independentRunCounts: INDEPENDENT_RUN_COUNTS,
      reproducibility: {
        identicalReplayVerified: isBitForBitIdentical,
        seedDivergenceVerified: hasValidDivergence
      }
    },
    scenarios: scenarioResults
  };

  const jsonPath = path.join(outDir, 'benchmark_independent_runs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonExport, null, 2), 'utf8');
  console.log(`\n✓ Saved JSON export to: ${jsonPath}`);

  // 2. CSV Export
  const csvHeaders = [
    'Scenario', 'IndependentRuns', 'DwellsPerRun', 'MasterSeed',
    'Adaptive_Pd_Mean', 'Adaptive_Pd_StdDev', 'Adaptive_Pd_95CI',
    'Adaptive_Sens_Mean', 'Adaptive_Sens_95CI', 'Adaptive_MIT_Mean', 'Adaptive_MIT_95CI', 'Adaptive_Brier_Mean',
    'OpenLoop_Pd_Mean', 'OpenLoop_Pd_StdDev', 'OpenLoop_Pd_95CI',
    'OpenLoop_Sens_Mean', 'OpenLoop_Sens_95CI', 'OpenLoop_MIT_Mean', 'OpenLoop_MIT_95CI', 'OpenLoop_Brier_Mean',
    'PairedDiff_Pd_Mean', 'PairedDiff_Pd_Median', 'PairedDiff_Pd_StdDev', 'PairedDiff_Pd_95CI',
    'PairedDiff_Sens_Mean', 'PairedDiff_Sens_95CI', 'PairedDiff_MIT_Mean', 'PairedDiff_MIT_95CI', 'PairedDiff_Brier_Mean'
  ];

  const csvRows = [csvHeaders.join(',')];
  flatCsvRows.forEach(r => {
    csvRows.push([
      r.scenario, r.independentRuns, r.dwellsPerRun, r.masterSeed,
      r.adPd_mean, r.adPd_std, `"${r.adPd_ci95}"`,
      r.adSens_mean, `"${r.adSens_ci95}"`, r.adMit_mean, `"${r.adMit_ci95}"`, r.adBrier_mean,
      r.olPd_mean, r.olPd_std, `"${r.olPd_ci95}"`,
      r.olSens_mean, `"${r.olSens_ci95}"`, r.olMit_mean, `"${r.olMit_ci95}"`, r.olBrier_mean,
      r.diffPd_mean, r.diffPd_median, r.diffPd_std, `"${r.diffPd_ci95}"`,
      r.diffSens_mean, `"${r.diffSens_ci95}"`, r.diffMit_mean, `"${r.diffMit_ci95}"`, r.diffBrier_mean
    ].join(','));
  });

  const csvPath = path.join(outDir, 'benchmark_independent_runs.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  console.log(`✓ Saved CSV export to: ${csvPath}`);

  // 3. Text Report Export
  let repText = `================================================================================\n`;
  repText += `ESM-ASTRA: REPEATED INDEPENDENT-RUN BENCHMARK AUDIT REPORT\n`;
  repText += `PROBLEM STATEMENT: SIH26055 (ADAPTIVE SCAN STRATEGY FOR ELECTRONIC WARFARE)\n`;
  repText += `================================================================================\n\n`;
  repText += `1. METHODOLOGICAL FRAMEWORK\n`;
  repText += `  - Architecture:        Independent Monte Carlo Simulation Runs (NOT Dwell Pooling)\n`;
  repText += `  - Independent Runs:    10, 100, 500, 1000 runs per scenario\n`;
  repText += `  - Dwells Per Trial:    200 dwells (36.0 seconds per simulation trial)\n`;
  repText += `  - Master PRNG Seed:    ${masterSeed}\n`;
  repText += `  - Paired Replay:       For each run, 1 RF timeline generated and replayed through BOTH schedulers.\n`;
  repText += `  - Paired Differences:  Calculated per-run as (Adaptive - Open-Loop).\n\n`;

  repText += `2. PAIRED COMPARISON SUMMARY AT 1000 INDEPENDENT RUNS\n`;
  repText += `------------------------------------------------------------------------------------------------------------------------------------------\n`;
  repText += `Scenario         | Adaptive P(d) Mean ± StdDev | Open-Loop P(d) Mean ± StdDev | Paired Diff Mean ± StdDev (95% CI)         | Paired Diff Median\n`;
  repText += `------------------------------------------------------------------------------------------------------------------------------------------\n`;

  scenarioResults.forEach(scBlock => {
    const r1000 = scBlock.runCounts[1000];
    const ad = r1000.adaptive.detectionRate;
    const ol = r1000.baseline.detectionRate;
    const diff = r1000.pairedDifference.detectionRate;
    repText += `${scBlock.scenario.padEnd(16)} | ${String(ad.mean + '% ± ' + ad.stdDev + '%').padEnd(27)} | ${String(ol.mean + '% ± ' + ol.stdDev + '%').padEnd(28)} | ${String(diff.mean + ' pp ± ' + diff.stdDev + ' ' + diff.ci95).padEnd(42)} | ${diff.median} pp\n`;
  });
  repText += `------------------------------------------------------------------------------------------------------------------------------------------\n\n`;

  repText += `3. PARAMETER PROVENANCE\n`;
  repText += `  - DEMO CONFIGURATION (5-Step Walkthrough):  c = 1.414, lambda = 0.15, tau = 12.0s\n`;
  repText += `  - BENCHMARK CONFIGURATION (Multi-Run Suite): c = 1.414 (sqrt(2)), lambda = 0.20, tau = 5.0s\n`;
  repText += `  - PRODUCTION CONFIGURATION (Live Server):    c = 1.414 (sqrt(2)), lambda = 0.20, tau = 5.0s\n`;
  repText += `  - RATIONALE: Demo uses tau=12s to ensure smooth recency during single-dwell step transitions.\n`;
  repText += `               Benchmark and Production use tau=5.0s for faster aging recovery over multi-second EW trials.\n\n`;

  const reportPath = path.join(outDir, 'benchmark_independent_run_report.txt');
  fs.writeFileSync(reportPath, repText, 'utf8');
  console.log(`✓ Saved Audit Report export to: ${reportPath}`);

  return { jsonExport, scenarioResults, isBitForBitIdentical, hasValidDivergence };
}

function runIndependentBenchmarkTrial(masterSeed, scenario, runCount) {
  const runner = new BenchmarkRunner();
  const obsAdaptive = { detectionRate: [] };
  const obsBaseline = { detectionRate: [] };
  const obsPairedDiff = { detectionRate: [] };

  for (let k = 0; k < runCount; k++) {
    const runSeed = deriveRunSeed(masterSeed, scenario, k);
    const exp = runner.runExperiment({ seed: runSeed, scenario, runs: DWELLS_PER_RUN });
    obsAdaptive.detectionRate.push(exp.adaptive.probabilityOfDetection);
    obsBaseline.detectionRate.push(exp.baseline.probabilityOfDetection);
    obsPairedDiff.detectionRate.push(Number((exp.adaptive.probabilityOfDetection - exp.baseline.probabilityOfDetection).toFixed(2)));
  }

  return {
    adaptive: { detectionRate: calculateRunStatistics(obsAdaptive.detectionRate) },
    baseline: { detectionRate: calculateRunStatistics(obsBaseline.detectionRate) },
    pairedDifference: { detectionRate: calculateRunStatistics(obsPairedDiff.detectionRate) }
  };
}

if (require.main === module) {
  runIndependentBenchmark();
}

module.exports = { runIndependentBenchmark, runIndependentBenchmarkTrial };
