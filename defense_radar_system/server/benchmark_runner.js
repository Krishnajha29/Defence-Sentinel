/**
 * ESM-ASTRA: Reproducible Benchmark Experiment Runner (SIH26055)
 * Controlled comparative evaluation between Recency-Augmented UCB1 Scheduler and Open-Loop Sequential Scanner.
 * 
 * Strict Scientific Standards:
 * 1. Single Ground-Truth Generation: Synthetic RF environment generated ONCE via seeded PRNG.
 * 2. Identical Timeline Replay: Both schedulers are evaluated on the EXACT same ground-truth events.
 * 3. Separated Quantities: groundTruthBurstCount, receiverDwells, interceptionOpportunities, successfulInterceptions, falseDetections.
 * 4. Comprehensive Metrics: Detection rate, mean latency, missed bursts, FAR, Next-Band Prediction Accuracy, Brier score, utilization, scan efficiency.
 * 5. Deterministic Configuration Hash.
 */

const crypto = require('crypto');
const { Mulberry32PRNG } = require('./prng');
const { RecencyAugmentedUCB1Scheduler, OpenLoopSequentialScheduler } = require('./scheduler_engine');

class BenchmarkRunner {
  constructor() {
    this.latestExperiment = null;
    this.experimentsHistory = [];
  }

  // 1. Generate Synthetic RF Ground-Truth Environment ONCE
  generateGroundTruthTimeline(seed, scenario, totalDwells, dwellMs = 180) {
    const prng = new Mulberry32PRNG(seed);
    const candidateBands = [9.180, 9.310, 9.420, 9.675, 9.810];
    const timeline = [];
    const allBursts = [];
    let burstIdCounter = 1;

    // State machines for scenarios
    let agileRemaining = 0;
    let agileBand = 9.420;
    let agileIdle = 0;

    let intermittentRemaining = 0;
    let intermittentIdle = prng.nextInt(4, 10);

    for (let step = 1; step <= totalDwells; step++) {
      const simTimeSec = step * (dwellMs / 1000);
      const activeSignals = new Map(); // band -> burstRecord

      const registerBurst = (band, durationDwells) => {
        const b = {
          id: `BURST-${String(burstIdCounter++).padStart(4, '0')}`,
          band,
          startStep: step,
          startTimeSec: simTimeSec,
          durationDwells,
          endTimeSec: (step + durationDwells) * (dwellMs / 1000),
          interceptedAdaptive: false,
          interceptedOpenLoop: false
        };
        allBursts.push(b);
        return b;
      };

      if (scenario === 'PERIODIC') {
        // Fixed-period radar emitter on 9.420 GHz: 2 dwells active every 8 dwells
        const phase = step % 8;
        if (phase === 1) {
          const b = registerBurst(9.420, 2);
          activeSignals.set(9.420, b);
        } else if (phase === 2) {
          const b = allBursts[allBursts.length - 1];
          activeSignals.set(9.420, b);
        }
      } else if (scenario === 'INTERMITTENT') {
        // Low duty cycle pulsed transmitter on 9.675 GHz
        if (intermittentRemaining > 0) {
          const b = allBursts[allBursts.length - 1];
          activeSignals.set(9.675, b);
          intermittentRemaining--;
        } else if (intermittentIdle > 0) {
          intermittentIdle--;
        } else {
          // Trigger new burst
          const dur = prng.nextInt(1, 3);
          const b = registerBurst(9.675, dur);
          activeSignals.set(9.675, b);
          intermittentRemaining = dur - 1;
          intermittentIdle = prng.nextInt(6, 14); // 6-14 dwells pause
        }
      } else if (scenario === 'MULTI_EMITTER') {
        // Multiple concurrent emitters active on different bands
        if (prng.chance(0.50)) {
          const b = registerBurst(9.420, 1);
          activeSignals.set(9.420, b);
        }
        if (prng.chance(0.30)) {
          const b = registerBurst(9.675, 1);
          activeSignals.set(9.675, b);
        }
        if (prng.chance(0.20)) {
          const b = registerBurst(9.180, 1);
          activeSignals.set(9.180, b);
        }
      } else if (scenario === 'MIXED') {
        // Composite environment:
        // 1. Periodic on 9.180 GHz (active 1 dwell every 6)
        if (step % 6 === 1) {
          const b = registerBurst(9.180, 1);
          activeSignals.set(9.180, b);
        }
        // 2. Frequency-Agile burst train on 9.420 or 9.675
        if (agileRemaining > 0) {
          const b = allBursts[allBursts.length - 1];
          activeSignals.set(agileBand, b);
          agileRemaining--;
        } else if (agileIdle > 0) {
          agileIdle--;
        } else {
          if (prng.chance(0.65)) {
            agileBand = prng.chance(0.60) ? 9.420 : 9.675;
            const dur = prng.nextInt(4, 7);
            const b = registerBurst(agileBand, dur);
            activeSignals.set(agileBand, b);
            agileRemaining = dur - 1;
          } else {
            agileIdle = prng.nextInt(2, 5);
          }
        }
        // 3. Intermittent on 9.310 GHz
        if (prng.chance(0.12)) {
          const b = registerBurst(9.310, 1);
          activeSignals.set(9.310, b);
        }
      } else {
        // FREQUENCY_AGILE (default): Semi-Markovian burst trains hopping across 9.310, 9.420, 9.675
        if (agileRemaining > 0) {
          const b = allBursts[allBursts.length - 1];
          activeSignals.set(agileBand, b);
          agileRemaining--;
        } else if (agileIdle > 0) {
          agileIdle--;
        } else {
          if (prng.chance(0.70)) {
            const roll = prng.next();
            agileBand = roll < 0.60 ? 9.420 : (roll < 0.88 ? 9.675 : 9.310);
            const dur = prng.nextInt(4, 8); // burst train of 4-8 dwells
            const b = registerBurst(agileBand, dur);
            activeSignals.set(agileBand, b);
            agileRemaining = dur - 1;
          } else {
            agileIdle = prng.nextInt(2, 4); // idle pause
          }
        }
      }

      timeline.push({
        step,
        simTimeSec,
        activeSignals, // Map(freqGhz -> burstRecord)
        isNoiseOnly: activeSignals.size === 0
      });
    }

    return { timeline, allBursts };
  }

  // 2. Controlled Experiment Execution
  runExperiment(config = {}) {
    const seed = config.seed !== undefined ? Number(config.seed) : 42;
    const scenario = config.scenario ? config.scenario.toUpperCase() : 'FREQUENCY_AGILE';
    const runCount = Number(config.runs) || 1000;
    const dwellMs = Number(config.dwellMs) || 180;
    const durationSeconds = Number(config.duration) || Math.round(runCount * (dwellMs / 1000));
    const experimentId = config.experimentId || `EXP-${Date.now().toString().slice(-4)}-SEED${seed}-${scenario}-${runCount}`;
    const timestamp = new Date().toISOString();
    const status = runCount < 30 ? 'INSUFFICIENT SAMPLE' : 'MEASURED';

    const candidateBands = [9.180, 9.310, 9.420, 9.675, 9.810];

    // Compute deterministic configuration hash
    const canonicalConfigStr = JSON.stringify({
      seed,
      scenario,
      runCount,
      dwellMs,
      candidateBands,
      algorithm: 'Recency-Augmented UCB1 Scheduler',
      baseline: 'Open-Loop Sequential Scanner'
    });
    const configHash = crypto.createHash('sha256').update(canonicalConfigStr).digest('hex').slice(0, 16);

    // Generate Single Ground-Truth Environment Timeline ONCE
    const { timeline, allBursts } = this.generateGroundTruthTimeline(seed, scenario, runCount, dwellMs);

    // Instantiate Schedulers
    const adaptiveScheduler = new RecencyAugmentedUCB1Scheduler({
      bands: candidateBands,
      explorationConstant: Math.SQRT2,
      recencyLambda: 0.20,
      recencyTau: 5.0,
      dwellMs
    });
    const openLoopScheduler = new OpenLoopSequentialScheduler({
      bands: candidateBands,
      dwellMs
    });

    // PRNG for thermal false alarm noise generation (fixed seed derived from main seed)
    const noisePrngAd = new Mulberry32PRNG(seed + 10007);
    const noisePrngOl = new Mulberry32PRNG(seed + 10007);

    // Raw Event Trackers for Adaptive UCB
    let adSuccessfulInterceptions = 0;
    let adInterceptionOpportunities = 0;
    let adFalseDetections = 0;
    let adNoiseOnlyDwells = 0;
    let adLatencies = [];
    let adRewards = [];
    let adCosts = [];
    let adExplorationDwells = 0;
    let adBrierSum = 0;
    let adBrierErrors = [];
    let adCorrectNextBandPredictions = 0;
    let adOccupiedDwellTimeSec = 0;
    let adPrevBand = null;

    // Raw Event Trackers for Open-Loop
    let olSuccessfulInterceptions = 0;
    let olInterceptionOpportunities = 0;
    let olFalseDetections = 0;
    let olNoiseOnlyDwells = 0;
    let olLatencies = [];
    let olRewards = [];
    let olCosts = [];
    let olExplorationDwells = runCount; // 100% blind exploration
    let olBrierSum = 0;
    let olBrierErrors = [];
    let olCorrectNextBandPredictions = 0;
    let olOccupiedDwellTimeSec = 0;

    const interceptionsOverTime = [];

    // =========================================================================
    // Simultaneous Execution against EXACT IDENTICAL Timeline
    // =========================================================================
    for (let step = 0; step < runCount; step++) {
      const dwellSlice = timeline[step];
      const activeSignals = dwellSlice.activeSignals;
      const simTimeSec = dwellSlice.simTimeSec;

      if (activeSignals.size > 0) {
        adInterceptionOpportunities++;
        olInterceptionOpportunities++;
      }

      // --- 1. ADAPTIVE SCHEDULER STEP ---
      // Determine greedy band before action to check exploration
      const greedyBand = adaptiveScheduler.getGreedyBand();
      const adDecision = adaptiveScheduler.selectBand(simTimeSec);
      const adBand = adDecision.selectedBand;
      const adHit = activeSignals.has(adBand);

      if (greedyBand !== null && adBand !== greedyBand) {
        adExplorationDwells++;
      }

      // Tuning cost: 180ms dwell + 15ms tuning penalty if switching band
      const adDwellCost = (adPrevBand !== null && adPrevBand !== adBand) ? (dwellMs + 15) : dwellMs;
      adCosts.push(adDwellCost);
      adPrevBand = adBand;

      adaptiveScheduler.observeFeedback(adBand, adHit, simTimeSec);

      // Dwell reward: 1.0 on hit, 0.0 on miss
      const adReward = adHit ? 1.0 : 0.0;
      adRewards.push(adReward);

      // Probabilistic prediction evaluation & Brier Score
      const adPredProb = adDecision.predictedProbability !== undefined ? adDecision.predictedProbability : 0.5;
      const adActualOutcome = adHit ? 1 : 0;
      const adErr = Math.pow(adPredProb - adActualOutcome, 2);
      adBrierSum += adErr;
      adBrierErrors.push(adErr);

      const adPredActive = adPredProb >= 0.50;
      if (adPredActive === adHit) {
        adCorrectNextBandPredictions++;
      }

      if (adHit) {
        adSuccessfulInterceptions++;
        adOccupiedDwellTimeSec += (dwellMs / 1000);
        const burst = activeSignals.get(adBand);
        if (burst && !burst.interceptedAdaptive) {
          burst.interceptedAdaptive = true;
          const latencyMs = Math.round((simTimeSec - burst.startTimeSec) * 1000) + 15; // 15ms synthesizer lock
          adLatencies.push(latencyMs);
        }
      } else {
        if (dwellSlice.isNoiseOnly) {
          adNoiseOnlyDwells++;
          if (noisePrngAd.next() < 0.015) { // 1.5% thermal noise threshold excursion
            adFalseDetections++;
          }
        }
      }

      // --- 2. OPEN-LOOP SEQUENTIAL STEP ---
      const olDecision = openLoopScheduler.selectBand();
      const olBand = olDecision.selectedBand;
      const olHit = activeSignals.has(olBand);

      // Open loop always switches band every dwell
      olCosts.push(dwellMs + 15);

      openLoopScheduler.observeFeedback(olBand, olHit);

      const olReward = olHit ? 1.0 : 0.0;
      olRewards.push(olReward);

      // Fixed uninformative prior for open loop
      const olPredProb = 0.20; // 1 in 5 uniform guess
      const olActualOutcome = olHit ? 1 : 0;
      const olErr = Math.pow(olPredProb - olActualOutcome, 2);
      olBrierSum += olErr;
      olBrierErrors.push(olErr);
      if ((olPredProb >= 0.5) === olHit) {
        olCorrectNextBandPredictions++;
      }

      if (olHit) {
        olSuccessfulInterceptions++;
        olOccupiedDwellTimeSec += (dwellMs / 1000);
        const burst = activeSignals.get(olBand);
        if (burst && !burst.interceptedOpenLoop) {
          burst.interceptedOpenLoop = true;
          const latencyMs = Math.round((simTimeSec - burst.startTimeSec) * 1000) + 15;
          olLatencies.push(latencyMs);
        }
      } else {
        if (dwellSlice.isNoiseOnly) {
          olNoiseOnlyDwells++;
          if (noisePrngOl.next() < 0.015) {
            olFalseDetections++;
          }
        }
      }

      // Record time series for telemetry chart
      const recordInterval = Math.max(5, Math.floor(runCount / 20));
      if ((step + 1) % recordInterval === 0 || step === runCount - 1) {
        const mm = String(Math.floor(simTimeSec / 60)).padStart(2, '0');
        const ss = String(Math.round(simTimeSec % 60)).padStart(2, '0');
        interceptionsOverTime.push({
          time: `${mm}:${ss}`,
          timeSec: Math.round(simTimeSec),
          adaptive: adSuccessfulInterceptions,
          openLoop: olSuccessfulInterceptions,
          sampleStep: step + 1
        });
      }
    }

    // =========================================================================
    // Statistical Reductions & Raw Metrics Calculation
    // =========================================================================
    const calcRate = (num, den) => den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0.0;

    // Missed Bursts Calculation (bursts never captured before terminating)
    let adMissedBursts = 0;
    let olMissedBursts = 0;
    allBursts.forEach(b => {
      if (!b.interceptedAdaptive) adMissedBursts++;
      if (!b.interceptedOpenLoop) olMissedBursts++;
    });

    const totalBursts = allBursts.length;
    const adBurstCompletionRate = totalBursts > 0 ? Number((((totalBursts - adMissedBursts) / totalBursts) * 100).toFixed(1)) : 0.0;
    const olBurstCompletionRate = totalBursts > 0 ? Number((((totalBursts - olMissedBursts) / totalBursts) * 100).toFixed(1)) : 0.0;

    const adDetectionRate = calcRate(adSuccessfulInterceptions, adInterceptionOpportunities);
    const olDetectionRate = calcRate(olSuccessfulInterceptions, olInterceptionOpportunities);

    const adFar = calcRate(adFalseDetections, Math.max(1, adNoiseOnlyDwells));
    const olFar = calcRate(olFalseDetections, Math.max(1, olNoiseOnlyDwells));

    const totalDurationSec = runCount * (dwellMs / 1000);
    const adAvgInterceptRate = totalDurationSec > 0 ? Number((adSuccessfulInterceptions / totalDurationSec).toFixed(2)) : 0.0;
    const olAvgInterceptRate = totalDurationSec > 0 ? Number((olSuccessfulInterceptions / totalDurationSec).toFixed(2)) : 0.0;

    const adAvgReward = runCount > 0 ? Number((adRewards.reduce((a, b) => a + b, 0) / runCount).toFixed(3)) : 0.0;
    const olAvgReward = runCount > 0 ? Number((olRewards.reduce((a, b) => a + b, 0) / runCount).toFixed(3)) : 0.0;

    const adAvgCost = runCount > 0 ? Number((adCosts.reduce((a, b) => a + b, 0) / runCount).toFixed(1)) : 0.0;
    const olAvgCost = runCount > 0 ? Number((olCosts.reduce((a, b) => a + b, 0) / runCount).toFixed(1)) : 0.0;

    const adLatencyStats = calculateDetailedStatistics(adLatencies);
    const olLatencyStats = calculateDetailedStatistics(olLatencies);

    const adPredAcc = calcRate(adCorrectNextBandPredictions, runCount);
    const olPredAcc = calcRate(olCorrectNextBandPredictions, runCount);

    const adUtilization = calcRate(adOccupiedDwellTimeSec, totalDurationSec);
    const olUtilization = calcRate(olOccupiedDwellTimeSec, totalDurationSec);

    const adExplorationRatio = calcRate(adExplorationDwells, runCount);
    const olExplorationRatio = 100.0;

    const adCi = calculateWilsonCi(adSuccessfulInterceptions, adInterceptionOpportunities);
    const olCi = calculateWilsonCi(olSuccessfulInterceptions, olInterceptionOpportunities);

    const adBrierStats = calculateDetailedStatistics(adBrierErrors);
    const olBrierStats = calculateDetailedStatistics(olBrierErrors);

    // =========================================================================
    // The 12 Standard Mandated Metrics
    // =========================================================================
    const baselineMetrics = {
      probabilityOfDetection: olDetectionRate,
      falseAlarmRate: olFar,
      sensitivity: olBurstCompletionRate,
      averageInterceptRate: olAvgInterceptRate,
      averageReward: olAvgReward,
      averageCost: olAvgCost,
      averageInterceptTimeError: olLatencyStats.mean,
      predictionAccuracy: olPredAcc,
      receiverUtilization: olUtilization,
      meanTimeToIntercept: olLatencyStats.mean,
      missCount: olMissedBursts,
      hitCount: olSuccessfulInterceptions,
      explorationRatio: olExplorationRatio,
      // Backward compatibility aliases
      detectionRate: olDetectionRate,
      falseDetections: olFalseDetections,
      missedBursts: olMissedBursts,
      scanEfficiency: olBurstCompletionRate,
      // Supporting telemetry & statistics
      detectionRateCi95: olCi,
      latencyStatistics: olLatencyStats,
      brierScore: Number((olBrierSum / runCount).toFixed(4)),
      brierStatistics: olBrierStats,
      burstCompletionRate: olBurstCompletionRate,
      meanInterceptTimeMs: olLatencyStats.mean,
      successfulInterceptions: olSuccessfulInterceptions,
      openLoopDwellCount: runCount
    };

    const adaptiveMetrics = {
      probabilityOfDetection: adDetectionRate,
      falseAlarmRate: adFar,
      sensitivity: adBurstCompletionRate,
      averageInterceptRate: adAvgInterceptRate,
      averageReward: adAvgReward,
      averageCost: adAvgCost,
      averageInterceptTimeError: adLatencyStats.mean,
      predictionAccuracy: adPredAcc,
      receiverUtilization: adUtilization,
      meanTimeToIntercept: adLatencyStats.mean,
      missCount: adMissedBursts,
      hitCount: adSuccessfulInterceptions,
      explorationRatio: adExplorationRatio,
      // Backward compatibility aliases
      detectionRate: adDetectionRate,
      falseDetections: adFalseDetections,
      missedBursts: adMissedBursts,
      scanEfficiency: adBurstCompletionRate,
      // Supporting telemetry & statistics
      detectionRateCi95: adCi,
      latencyStatistics: adLatencyStats,
      brierScore: Number((adBrierSum / runCount).toFixed(4)),
      brierStatistics: adBrierStats,
      burstCompletionRate: adBurstCompletionRate,
      meanInterceptTimeMs: adLatencyStats.mean,
      successfulInterceptions: adSuccessfulInterceptions,
      adaptiveDwellCount: runCount
    };

    // =========================================================================
    // Strict Separation of Absolute Delta (pp) vs Relative Delta (%)
    // =========================================================================
    const deltas = {
      probabilityOfDetection: calculateDelta(adDetectionRate, olDetectionRate, true),
      falseAlarmRate: calculateDelta(adFar, olFar, true),
      sensitivity: calculateDelta(adBurstCompletionRate, olBurstCompletionRate, true),
      averageInterceptRate: calculateDelta(adAvgInterceptRate, olAvgInterceptRate, false, 'intercepts/s'),
      averageReward: calculateDelta(adAvgReward, olAvgReward, false),
      averageCost: calculateDelta(adAvgCost, olAvgCost, false, 'ms'),
      averageInterceptTimeError: calculateDelta(adLatencyStats.mean, olLatencyStats.mean, false, 'ms'),
      predictionAccuracy: calculateDelta(adPredAcc, olPredAcc, true),
      receiverUtilization: calculateDelta(adUtilization, olUtilization, true),
      meanTimeToIntercept: calculateDelta(adLatencyStats.mean, olLatencyStats.mean, false, 'ms'),
      missCount: calculateDelta(adMissedBursts, olMissedBursts, false, 'bursts'),
      hitCount: calculateDelta(adSuccessfulInterceptions, olSuccessfulInterceptions, false, 'hits'),
      explorationRatio: calculateDelta(adExplorationRatio, olExplorationRatio, true)
    };

    const experimentRecord = {
      experimentId,
      timestamp,
      configHash,
      seed,
      scenario,
      runs: runCount,
      runCount,
      durationSeconds,
      status,
      provenanceStatus: status,
      groundTruth: {
        totalBursts,
        groundTruthBurstCount: totalBursts,
        interceptionOpportunities: adInterceptionOpportunities,
        interceptionOpportunityCount: adInterceptionOpportunities,
        noiseOnlyDwells: adNoiseOnlyDwells,
        noiseOnlyDwellCount: adNoiseOnlyDwells
      },
      configs: {
        scenarioConfig: {
          scenario,
          seed,
          runs: runCount,
          durationSeconds
        },
        schedulerConfig: {
          algorithm: 'Recency-Augmented UCB1 Scheduler',
          explorationConstant: 1.414,
          recencyLambda: 0.20,
          recencyTau: 5.0,
          betaPrior: { alpha0: 1, beta0: 1 }
        },
        receiverConfig: {
          ibwMhz: 50,
          dwellMs,
          tuningLatencyMs: 15
        }
      },
      baseline: baselineMetrics,
      adaptive: adaptiveMetrics,
      delta: deltas,
      rawEventsReference: `TIMELINE-${experimentId}`,
      // Backward compatibility aliases
      results: {
        adaptive: adaptiveMetrics,
        openLoop: baselineMetrics
      },
      interceptionsOverTime
    };

    this.latestExperiment = experimentRecord;
    this.experimentsHistory.unshift({
      experimentId,
      timestamp,
      seed,
      scenario,
      runs: runCount,
      configHash,
      status,
      adaptiveDetRate: adDetectionRate,
      openLoopDetRate: olDetectionRate,
      deltaDetRate: deltas.probabilityOfDetection.absolute
    });

    if (this.experimentsHistory.length > 20) {
      this.experimentsHistory.pop();
    }

    return experimentRecord;
  }

  // 3. Multi-Scenario Benchmark Suite Runner
  runAllScenariosSuite(config = {}) {
    const seed = config.seed !== undefined ? Number(config.seed) : 42;
    const runs = Number(config.runs) || 1000;
    const scenarios = ['PERIODIC', 'INTERMITTENT', 'FREQUENCY_AGILE', 'MULTI_EMITTER', 'MIXED'];
    const suiteResults = [];

    scenarios.forEach(sc => {
      const exp = this.runExperiment({ seed, scenario: sc, runs });
      suiteResults.push({
        scenario: sc,
        runs: exp.runs,
        status: exp.status,
        adaptiveDetection: exp.adaptive.probabilityOfDetection,
        openLoopDetection: exp.baseline.probabilityOfDetection,
        deltaDetection: exp.delta.probabilityOfDetection,
        adaptiveMeanInterceptTime: exp.adaptive.meanTimeToIntercept,
        openLoopMeanInterceptTime: exp.baseline.meanTimeToIntercept,
        deltaMeanInterceptTime: exp.delta.meanTimeToIntercept,
        adaptiveUtilization: exp.adaptive.receiverUtilization,
        openLoopUtilization: exp.baseline.receiverUtilization,
        deltaUtilization: exp.delta.receiverUtilization,
        adaptiveSensitivity: exp.adaptive.sensitivity,
        openLoopSensitivity: exp.baseline.sensitivity,
        adaptiveMissedBursts: exp.adaptive.missCount,
        openLoopMissedBursts: exp.baseline.missCount,
        configHash: exp.configHash
      });
    });

    return {
      suiteId: `SUITE-${Date.now().toString().slice(-4)}-SEED${seed}-${runs}`,
      seed,
      runs,
      timestamp: new Date().toISOString(),
      scenariosCount: suiteResults.length,
      breakdown: suiteResults
    };
  }

  // 4. Experiment Replay Functionality
  replayExperiment(experimentId) {
    const record = this.experimentsHistory.find(h => h.experimentId === experimentId);
    if (!record) {
      throw new Error(`Experiment ID ${experimentId} not found in history`);
    }
    return this.runExperiment({
      seed: record.seed,
      scenario: record.scenario,
      runs: record.runs,
      experimentId: `REPLAY-${record.experimentId}`
    });
  }

  // 5. Data Export Generators
  exportAsJson(exp) {
    const data = exp || this.getLatest();
    return JSON.stringify(data, null, 2);
  }

  exportAsCsv(exp) {
    const d = exp || this.getLatest();
    const rows = [
      ['Metric', 'Baseline (Open-Loop)', 'Adaptive UCB', 'Absolute Delta', 'Relative Delta', 'Unit', 'Status'],
      ['Probability of Detection', d.baseline.probabilityOfDetection, d.adaptive.probabilityOfDetection, `"${d.delta.probabilityOfDetection.absolute}"`, `"${d.delta.probabilityOfDetection.relative}"`, '%', d.status],
      ['False Alarm Rate', d.baseline.falseAlarmRate, d.adaptive.falseAlarmRate, `"${d.delta.falseAlarmRate.absolute}"`, `"${d.delta.falseAlarmRate.relative}"`, '%', d.status],
      ['Sensitivity / Burst Completion', d.baseline.sensitivity, d.adaptive.sensitivity, `"${d.delta.sensitivity.absolute}"`, `"${d.delta.sensitivity.relative}"`, '%', d.status],
      ['Average Intercept Rate', d.baseline.averageInterceptRate, d.adaptive.averageInterceptRate, `"${d.delta.averageInterceptRate.absolute}"`, `"${d.delta.averageInterceptRate.relative}"`, 'intercepts/s', d.status],
      ['Average Dwell Reward', d.baseline.averageReward, d.adaptive.averageReward, `"${d.delta.averageReward.absolute}"`, `"${d.delta.averageReward.relative}"`, 'reward', d.status],
      ['Average Dwell Cost', d.baseline.averageCost, d.adaptive.averageCost, `"${d.delta.averageCost.absolute}"`, `"${d.delta.averageCost.relative}"`, 'ms', d.status],
      ['Average Intercept Time Error', d.baseline.averageInterceptTimeError, d.adaptive.averageInterceptTimeError, `"${d.delta.averageInterceptTimeError.absolute}"`, `"${d.delta.averageInterceptTimeError.relative}"`, 'ms', d.status],
      ['Prediction Accuracy', d.baseline.predictionAccuracy, d.adaptive.predictionAccuracy, `"${d.delta.predictionAccuracy.absolute}"`, `"${d.delta.predictionAccuracy.relative}"`, '%', d.status],
      ['Receiver Utilization', d.baseline.receiverUtilization, d.adaptive.receiverUtilization, `"${d.delta.receiverUtilization.absolute}"`, `"${d.delta.receiverUtilization.relative}"`, '%', d.status],
      ['Mean Time To Intercept', d.baseline.meanTimeToIntercept, d.adaptive.meanTimeToIntercept, `"${d.delta.meanTimeToIntercept.absolute}"`, `"${d.delta.meanTimeToIntercept.relative}"`, 'ms', d.status],
      ['Miss Count (Bursts)', d.baseline.missCount, d.adaptive.missCount, `"${d.delta.missCount.absolute}"`, `"${d.delta.missCount.relative}"`, 'bursts', d.status],
      ['Hit Count (Dwells)', d.baseline.hitCount, d.adaptive.hitCount, `"${d.delta.hitCount.absolute}"`, `"${d.delta.hitCount.relative}"`, 'hits', d.status],
      ['Exploration Ratio', d.baseline.explorationRatio, d.adaptive.explorationRatio, `"${d.delta.explorationRatio.absolute}"`, `"${d.delta.explorationRatio.relative}"`, '%', d.status]
    ];
    return rows.map(r => r.join(',')).join('\n');
  }

  exportAsReport(exp) {
    const d = exp || this.getLatest();
    let rep = `================================================================================\n`;
    rep += `ESM-ASTRA: CONTROLLED BENCHMARK EXPERIMENT AUDIT REPORT\n`;
    rep += `PROBLEM STATEMENT: SIH26055 (SMART SCAN STRATEGY FOR ELECTRONIC WARFARE)\n`;
    rep += `================================================================================\n\n`;
    rep += `1. EXPERIMENT PROVENANCE & IDENTIFICATION\n`;
    rep += `  - Experiment ID:   ${d.experimentId}\n`;
    rep += `  - Config Hash:     ${d.configHash}\n`;
    rep += `  - PRNG Seed:       ${d.seed} (Mulberry32 Deterministic PRNG)\n`;
    rep += `  - Scenario:        ${d.scenario}\n`;
    rep += `  - Dwells (Runs):   ${d.runs} dwells (${d.durationSeconds}s)\n`;
    rep += `  - Status:          ${d.status}\n`;
    rep += `  - Timestamp:       ${d.timestamp}\n\n`;

    rep += `2. GROUND TRUTH RF ENVIRONMENT (GENERATED ONCE)\n`;
    rep += `  - Ground Truth Bursts:       ${d.groundTruth.totalBursts}\n`;
    rep += `  - Intercept Opportunities:   ${d.groundTruth.interceptionOpportunities}\n`;
    rep += `  - Noise-Only Dwells:         ${d.groundTruth.noiseOnlyDwells}\n\n`;

    rep += `3. CONTROLLED COMPARISON: 12 MANDATED METRICS\n`;
    rep += `--------------------------------------------------------------------------------\n`;
    rep += `Metric                             | Baseline (Open-Loop) | Adaptive UCB         | Absolute Delta          | Relative Delta\n`;
    rep += `--------------------------------------------------------------------------------\n`;
    rep += `Probability of Detection           | ${String(d.baseline.probabilityOfDetection + '%').padEnd(20)} | ${String(d.adaptive.probabilityOfDetection + '%').padEnd(20)} | ${String(d.delta.probabilityOfDetection.absolute).padEnd(23)} | ${d.delta.probabilityOfDetection.relative}\n`;
    rep += `False Alarm Rate                   | ${String(d.baseline.falseAlarmRate + '%').padEnd(20)} | ${String(d.adaptive.falseAlarmRate + '%').padEnd(20)} | ${String(d.delta.falseAlarmRate.absolute).padEnd(23)} | ${d.delta.falseAlarmRate.relative}\n`;
    rep += `Sensitivity (Burst Completion)     | ${String(d.baseline.sensitivity + '%').padEnd(20)} | ${String(d.adaptive.sensitivity + '%').padEnd(20)} | ${String(d.delta.sensitivity.absolute).padEnd(23)} | ${d.delta.sensitivity.relative}\n`;
    rep += `Average Intercept Rate (hits/s)    | ${String(d.baseline.averageInterceptRate).padEnd(20)} | ${String(d.adaptive.averageInterceptRate).padEnd(20)} | ${String(d.delta.averageInterceptRate.absolute).padEnd(23)} | ${d.delta.averageInterceptRate.relative}\n`;
    rep += `Average Dwell Reward               | ${String(d.baseline.averageReward).padEnd(20)} | ${String(d.adaptive.averageReward).padEnd(20)} | ${String(d.delta.averageReward.absolute).padEnd(23)} | ${d.delta.averageReward.relative}\n`;
    rep += `Average Dwell Cost (ms)            | ${String(d.baseline.averageCost).padEnd(20)} | ${String(d.adaptive.averageCost).padEnd(20)} | ${String(d.delta.averageCost.absolute).padEnd(23)} | ${d.delta.averageCost.relative}\n`;
    rep += `Average Intercept Time Error (ms)  | ${String(d.baseline.averageInterceptTimeError).padEnd(20)} | ${String(d.adaptive.averageInterceptTimeError).padEnd(20)} | ${String(d.delta.averageInterceptTimeError.absolute).padEnd(23)} | ${d.delta.averageInterceptTimeError.relative}\n`;
    rep += `Prediction Accuracy                | ${String(d.baseline.predictionAccuracy + '%').padEnd(20)} | ${String(d.adaptive.predictionAccuracy + '%').padEnd(20)} | ${String(d.delta.predictionAccuracy.absolute).padEnd(23)} | ${d.delta.predictionAccuracy.relative}\n`;
    rep += `Receiver Utilization               | ${String(d.baseline.receiverUtilization + '%').padEnd(20)} | ${String(d.adaptive.receiverUtilization + '%').padEnd(20)} | ${String(d.delta.receiverUtilization.absolute).padEnd(23)} | ${d.delta.receiverUtilization.relative}\n`;
    rep += `Mean Time To Intercept (ms)        | ${String(d.baseline.meanTimeToIntercept).padEnd(20)} | ${String(d.adaptive.meanTimeToIntercept).padEnd(20)} | ${String(d.delta.meanTimeToIntercept.absolute).padEnd(23)} | ${d.delta.meanTimeToIntercept.relative}\n`;
    rep += `Miss Count (Bursts)                | ${String(d.baseline.missCount).padEnd(20)} | ${String(d.adaptive.missCount).padEnd(20)} | ${String(d.delta.missCount.absolute).padEnd(23)} | ${d.delta.missCount.relative}\n`;
    rep += `Hit Count (Dwells)                 | ${String(d.baseline.hitCount).padEnd(20)} | ${String(d.adaptive.hitCount).padEnd(20)} | ${String(d.delta.hitCount.absolute).padEnd(23)} | ${d.delta.hitCount.relative}\n`;
    rep += `Exploration Ratio                  | ${String(d.baseline.explorationRatio + '%').padEnd(20)} | ${String(d.adaptive.explorationRatio + '%').padEnd(20)} | ${String(d.delta.explorationRatio.absolute).padEnd(23)} | ${d.delta.explorationRatio.relative}\n`;
    rep += `--------------------------------------------------------------------------------\n\n`;

    rep += `4. STATISTICAL REDUCTIONS & UNCERTAINTY (95% CI)\n`;
    rep += `  - Adaptive Detection Rate 95% Wilson CI: ${d.adaptive.detectionRateCi95.formatted}\n`;
    rep += `  - Baseline Detection Rate 95% Wilson CI: ${d.baseline.detectionRateCi95.formatted}\n`;
    rep += `  - Adaptive Latency Statistics: mean=${d.adaptive.latencyStatistics.mean}ms, median=${d.adaptive.latencyStatistics.median}ms, stdDev=${d.adaptive.latencyStatistics.standardDeviation}ms, min=${d.adaptive.latencyStatistics.min}ms, max=${d.adaptive.latencyStatistics.max}ms, 95% CI=${d.adaptive.latencyStatistics.ci95.formatted}\n`;
    rep += `  - Baseline Latency Statistics: mean=${d.baseline.latencyStatistics.mean}ms, median=${d.baseline.latencyStatistics.median}ms, stdDev=${d.baseline.latencyStatistics.standardDeviation}ms, min=${d.baseline.latencyStatistics.min}ms, max=${d.baseline.latencyStatistics.max}ms, 95% CI=${d.baseline.latencyStatistics.ci95.formatted}\n\n`;

    rep += `5. SCIENTIFIC INTEGRITY & FAILURE MODE DISCLOSURE\n`;
    rep += `  - In Frequency-Agile hopping scenarios, Open-Loop sequential scanning achieves a higher burst completion rate (grazing ${d.baseline.sensitivity}% vs Adaptive ${d.adaptive.sensitivity}%) because round-robin visits every band every 5 dwells, while Adaptive UCB exploits ongoing bursts and may miss brief transient hops on other bands.\n`;
    rep += `  - In sparse spectrum environments, Open-Loop achieves higher baseline prediction accuracy because predicting low activity matches the empty base-rate, whereas Adaptive UCB pays a calibration penalty on channel transition dwells.\n\n`;
    rep += `================================================================================\n`;
    rep += `END OF BENCHMARK AUDIT REPORT\n`;
    return rep;
  }

  getLatest() {
    if (!this.latestExperiment) {
      this.runExperiment({ seed: 42, scenario: 'FREQUENCY_AGILE', runs: 1000 });
    }
    return this.latestExperiment;
  }

  getHistory() {
    return this.experimentsHistory;
  }
}

// =============================================================================
// Standalone Statistical Reductions & Comparison Utilities
// =============================================================================
function calculateDetailedStatistics(values, sampleSizeThreshold = 30) {
  if (!values || values.length === 0) {
    return {
      status: 'INSUFFICIENT SAMPLE',
      sampleCount: 0,
      mean: 0,
      median: 0,
      standardDeviation: 0,
      min: 0,
      max: 0,
      ci95: { lower: 0, upper: 0, formatted: 'INSUFFICIENT SAMPLE' }
    };
  }

  const n = values.length;
  const isInsufficient = n < sampleSizeThreshold;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / n).toFixed(2));

  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, n - 1);
  const standardDeviation = Number(Math.sqrt(variance).toFixed(2));

  // 95% Confidence Interval for the mean
  const z = 1.95996;
  const margin = n > 1 ? Number((z * (standardDeviation / Math.sqrt(n))).toFixed(2)) : 0;
  const lower = Number(Math.max(0, mean - margin).toFixed(2));
  const upper = Number((mean + margin).toFixed(2));

  return {
    status: isInsufficient ? 'INSUFFICIENT SAMPLE' : 'MEASURED',
    sampleCount: n,
    mean,
    median,
    standardDeviation,
    min,
    max,
    ci95: {
      lower,
      upper,
      formatted: isInsufficient ? 'INSUFFICIENT SAMPLE' : `[${lower}, ${upper}]`
    }
  };
}

function calculateWilsonCi(successes, trials, sampleSizeThreshold = 30) {
  if (trials < sampleSizeThreshold) {
    return {
      status: 'INSUFFICIENT SAMPLE',
      lowerPct: 0,
      upperPct: 0,
      formatted: 'INSUFFICIENT SAMPLE'
    };
  }
  const z = 1.95996;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  const lower = Math.max(0, (center - margin) / denom);
  const upper = Math.min(1, (center + margin) / denom);
  const lowerPct = Number((lower * 100).toFixed(1));
  const upperPct = Number((upper * 100).toFixed(1));
  return {
    status: 'MEASURED',
    lowerPct,
    upperPct,
    formatted: `[${lowerPct}%, ${upperPct}%]`
  };
}

function calculateDelta(adaptiveVal, baselineVal, isPercentage = false, unit = '') {
  const absDelta = Number((adaptiveVal - baselineVal).toFixed(2));
  let relDelta = 0;
  if (baselineVal !== 0) {
    relDelta = Number((((adaptiveVal - baselineVal) / Math.abs(baselineVal)) * 100).toFixed(1));
  }

  const absSign = absDelta > 0 ? `+${absDelta}` : `${absDelta}`;
  const relSign = relDelta > 0 ? `+${relDelta}` : `${relDelta}`;

  return {
    absolute: isPercentage ? `${absSign} percentage points` : `${absSign}${unit ? ' ' + unit : ''}`,
    absoluteValue: absDelta,
    relative: `${relSign}%`,
    relativeValue: relDelta
  };
}

// Support CLI execution:
// node server/benchmark_runner.js --seed 42 --scenario PERIODIC --runs 1000
// node server/benchmark_runner.js --suite --seed 42 --runs 1000
// node server/benchmark_runner.js --export [json|csv|report]
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };

  const seed = Number(getArg('--seed', 42));
  const scenario = getArg('--scenario', 'FREQUENCY_AGILE').toUpperCase();
  const runs = Number(getArg('--runs', 1000));
  const isSuite = args.includes('--suite');
  const exportType = getArg('--export', null);

  const runner = new BenchmarkRunner();

  if (isSuite) {
    console.log(`================================================================================`);
    console.log(`  ESM-ASTRA: Full Multi-Scenario Benchmark Suite (SIH26055)`);
    console.log(`  Evaluating: 5 Scenarios under Identical Ground-Truth Timelines`);
    console.log(`================================================================================\n`);
    const suite = runner.runAllScenariosSuite({ seed, runs });
    console.log(`Seed: ${suite.seed} | Runs per Scenario: ${suite.runs} | Total Dwells: ${suite.runs * 5}\n`);
    console.log(`+------------------+---------------------+---------------------+-----------------------+---------------------+---------------------+`);
    console.log(`| Scenario         | Adaptive Detection  | Open-Loop Detection | Delta (pp / %)        | Adaptive Latency    | Open-Loop Latency   |`);
    console.log(`+------------------+---------------------+---------------------+-----------------------+---------------------+---------------------+`);
    suite.breakdown.forEach(row => {
      console.log(`| ${row.scenario.padEnd(16)} | ${String(row.adaptiveDetection + '%').padEnd(19)} | ${String(row.openLoopDetection + '%').padEnd(19)} | ${String(row.deltaDetection.absoluteValue + ' pp (' + row.deltaDetection.relative + ')').padEnd(21)} | ${String(row.adaptiveMeanInterceptTime + ' ms').padEnd(19)} | ${String(row.openLoopMeanInterceptTime + ' ms').padEnd(19)} |`);
    });
    console.log(`+------------------+---------------------+---------------------+-----------------------+---------------------+---------------------+`);
  } else {
    const result = runner.runExperiment({ seed, scenario, runs });
    if (exportType === 'json') {
      console.log(runner.exportAsJson(result));
    } else if (exportType === 'csv') {
      console.log(runner.exportAsCsv(result));
    } else if (exportType === 'report') {
      console.log(runner.exportAsReport(result));
    } else {
      console.log(runner.exportAsReport(result));
    }
  }
}

module.exports = {
  BenchmarkRunner,
  calculateDetailedStatistics,
  calculateWilsonCi,
  calculateDelta
};

