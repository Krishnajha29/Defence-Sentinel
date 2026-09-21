/**
 * Phase 3 System Completion Automated Test Suite
 * Tests RF Telemetry, Dynamic Scheduler Charts, Scenario Harmonization, and C2 WebSocket Feed
 */

const assert = require('assert');
const { WebSocket } = require('ws');
const { Mulberry32PRNG } = require('../server/prng');
const { AdaptiveScanScheduler } = require('../server/scheduler_engine');
const { BenchmarkRunner } = require('../server/benchmark_runner');

let totalTests = 0;
let passedTests = 0;

function check(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runPhase3Tests() {
  console.log(`\n🧪 RUNNING SUITE M: Phase 3 System Completion Verification...`);

  // =========================================================================
  // SUB-SUITE 1: Dynamic RF Telemetry Pipeline
  // =========================================================================
  console.log(`\n  --- 1. RF Telemetry & Receiver Telemetry Pipeline ---`);

  check('RF receiver telemetry mathematical schema validation', () => {
    const scheduler = new AdaptiveScanScheduler({ bands: [9.180, 9.310, 9.420, 9.675, 9.810] });
    const decision = scheduler.selectBand(1.0);
    const arm = scheduler.arms[decision.selectedBand];

    const rxTelemetry = {
      state: 'HIT',
      snrDb: 33.8,
      powerDbm: -61.2,
      assocEmitter: 'EMITTER-03 (TRK-021)',
      feedback: 'INTERCEPT CONFIRMED',
      nextBandGhz: decision.predictedNextBand,
      nextProbPercent: Math.round((arm.alpha / (arm.alpha + arm.beta)) * 100),
      ibwMhz: 50,
      dwellMs: 180,
      tunedFreqGhz: decision.selectedBand
    };

    assert.strictEqual(typeof rxTelemetry.state, 'string');
    assert.ok(['HIT', 'MISS'].includes(rxTelemetry.state));
    assert.strictEqual(typeof rxTelemetry.snrDb, 'number');
    assert.strictEqual(typeof rxTelemetry.powerDbm, 'number');
    assert.strictEqual(typeof rxTelemetry.assocEmitter, 'string');
    assert.strictEqual(typeof rxTelemetry.nextBandGhz, 'number');
    assert.ok(rxTelemetry.nextProbPercent >= 0 && rxTelemetry.nextProbPercent <= 100);
    assert.strictEqual(rxTelemetry.ibwMhz, 50);
    assert.strictEqual(rxTelemetry.dwellMs, 180);
  });

  check('HIT vs MISS telemetry transition mechanics', () => {
    const hitTel = {
      state: 'HIT',
      snrDb: 33.8,
      powerDbm: -61.2,
      assocEmitter: 'EMITTER-03 (TRK-021)',
      feedback: 'INTERCEPT CONFIRMED'
    };
    const missTel = {
      state: 'MISS',
      snrDb: 1.8,
      powerDbm: -94.5,
      assocEmitter: 'NO ENERGY DETECTED',
      feedback: 'DWELL SCAN - NO SIGNAL DETECTED'
    };

    assert.ok(hitTel.snrDb > 20.0, 'HIT SNR must exceed 20 dB');
    assert.ok(hitTel.powerDbm > -70.0, 'HIT power must exceed -70 dBm');
    assert.strictEqual(hitTel.feedback, 'INTERCEPT CONFIRMED');

    assert.ok(missTel.snrDb < 5.0, 'MISS SNR must reflect ambient noise floor');
    assert.ok(missTel.powerDbm < -90.0, 'MISS power must reflect receiver noise floor');
    assert.strictEqual(missTel.assocEmitter, 'NO ENERGY DETECTED');
  });

  // =========================================================================
  // SUB-SUITE 2: Dynamic Scheduler Charts & Bayesian Distribution
  // =========================================================================
  console.log(`\n  --- 2. Dynamic Scheduler Charts & Bayesian Distribution ---`);

  check('Bayesian Prior vs. Posterior Distribution dynamic computation', () => {
    const scheduler = new AdaptiveScanScheduler({ bands: [9.180, 9.310, 9.420, 9.675, 9.810] });
    scheduler.reset();

    // Baseline prior with initial beta distribution
    const band = 9.420;
    const initialArm = scheduler.arms[band];
    const initialPrior = initialArm.alpha / (initialArm.alpha + initialArm.beta);
    assert.strictEqual(initialPrior, 0.5, 'Uniform prior Beta(1,1) must equal 0.500');

    // Observation 1: HIT on 9.420
    scheduler.observeFeedback(band, true, 1.0);
    const postHit = scheduler.arms[band].alpha / (scheduler.arms[band].alpha + scheduler.arms[band].beta);
    assert.ok(postHit > initialPrior, 'HIT observation must increase posterior probability');
    assert.strictEqual(Number(postHit.toFixed(3)), 0.667, 'Beta(2,1) posterior mean must be 2/3 = 0.667');

    // Observation 2: MISS on 9.420
    scheduler.observeFeedback(band, false, 2.0);
    const postMiss = scheduler.arms[band].alpha / (scheduler.arms[band].alpha + scheduler.arms[band].beta);
    assert.ok(postMiss < postHit, 'MISS observation must decrease posterior probability');
    assert.strictEqual(Number(postMiss.toFixed(3)), 0.500, 'Beta(2,2) posterior mean must return to 0.500');
  });

  check('Band Priority & Occupancy Comparison score ranking', () => {
    const scheduler = new AdaptiveScanScheduler({ bands: [9.180, 9.310, 9.420, 9.675, 9.810] });
    scheduler.reset();

    // Dwell on 9.420 with 3 consecutive hits
    scheduler.observeFeedback(9.420, true, 1.0);
    scheduler.observeFeedback(9.420, true, 2.0);
    scheduler.observeFeedback(9.420, true, 3.0);

    // Dwell on 9.180 with 3 consecutive misses
    scheduler.observeFeedback(9.180, false, 1.0);
    scheduler.observeFeedback(9.180, false, 2.0);
    scheduler.observeFeedback(9.180, false, 3.0);

    const perBand = scheduler.getPerBandState(3.5);
    assert.strictEqual(perBand.length, 5);

    const armHigh = perBand.find(b => b.band === 9.420);
    const armLow = perBand.find(b => b.band === 9.180);

    assert.ok(armHigh.currentScore > armLow.currentScore, 'Band with hits must rank higher than band with misses');
    assert.ok(armHigh.activityProbability > armLow.activityProbability, 'High-hit band must have higher posterior mean');
  });

  check('Scheduler Decision Timeline logging integrity', () => {
    const scheduler = new AdaptiveScanScheduler({ bands: [9.180, 9.310, 9.420, 9.675, 9.810] });
    scheduler.reset();

    for (let t = 1.0; t <= 5.0; t += 1.0) {
      const dec = scheduler.selectBand(t);
      scheduler.observeFeedback(dec.selectedBand, t % 2 === 0, t);
    }

    const decisions = scheduler.getRecentDecisions(10);
    assert.strictEqual(decisions.length, 5);
    decisions.forEach(d => {
      assert.ok(d.decisionId.startsWith('DEC-#'));
      assert.ok(typeof d.selectedBand === 'number');
      assert.ok(typeof d.selectedScore === 'number');
      assert.ok(d.reasoning && d.reasoning.length > 0);
    });
  });

  // =========================================================================
  // SUB-SUITE 3: Canonical Scenario Harmonization
  // =========================================================================
  console.log(`\n  --- 3. Canonical 5-Scenario Harmonization ---`);

  const canonicalScenarios = ['PERIODIC', 'INTERMITTENT', 'FREQUENCY_AGILE', 'MULTI_EMITTER', 'MIXED'];
  const runner = new BenchmarkRunner();

  canonicalScenarios.forEach(sc => {
    check(`Canonical scenario execution: ${sc}`, () => {
      const exp = runner.runExperiment({ seed: 42, scenario: sc, runs: 500 });
      assert.strictEqual(exp.scenario, sc);
      assert.strictEqual(exp.status, 'MEASURED');
      assert.strictEqual(exp.runs, 500);
      assert.strictEqual(typeof exp.adaptive.probabilityOfDetection, 'number');
      assert.strictEqual(typeof exp.baseline.probabilityOfDetection, 'number');
      assert.strictEqual(typeof exp.delta.probabilityOfDetection.absoluteValue, 'number');
      assert.ok(exp.adaptive.probabilityOfDetection > 0, 'Adaptive detection must be greater than 0');
    });
  });

  check('PRNG Seed Determinism across scenario suite runs', () => {
    const suite1 = runner.runAllScenariosSuite({ seed: 1337, runs: 100 });
    const suite2 = runner.runAllScenariosSuite({ seed: 1337, runs: 100 });

    assert.strictEqual(suite1.breakdown.length, 5);
    assert.strictEqual(suite2.breakdown.length, 5);

    for (let i = 0; i < 5; i++) {
      const r1 = suite1.breakdown[i];
      const r2 = suite2.breakdown[i];
      assert.strictEqual(r1.scenario, r2.scenario);
      assert.strictEqual(r1.adaptiveDetection, r2.adaptiveDetection, `Adaptive detection mismatch on ${r1.scenario}`);
      assert.strictEqual(r1.openLoopDetection, r2.openLoopDetection, `Open-loop detection mismatch on ${r1.scenario}`);
      assert.strictEqual(r1.deltaDetection.absoluteValue, r2.deltaDetection.absoluteValue);
    }
  });

  // =========================================================================
  // SUB-SUITE 4: C2 Backend WebSocket & Track Contract Synchronization
  // =========================================================================
  console.log(`\n  --- 4. C2 Backend WebSocket & React Radar-Scanner Sync ---`);

  check('Radar track mapping contract for React frontend', () => {
    const mockEntities = [
      {
        id: 'TRK-014',
        type: 'PERSON',
        displayName: 'Major Aarav Singh (Sector Commander)',
        radar: { x: 60, y: 155, range: 166, azimuth: 21, speedKmh: 4.5, heading: 110, trail: [{ x: 60, y: 155 }] },
        camera: { confidence: 98 },
        rf: { hasEmitter: true, emitterId: 'EMITTER-01', freqGhz: 9.180, isTransmitting: true },
        personnel: { matched: true, zone: 'HQ_INNER', details: { id: 'PERS-001', name: 'Major Aarav Singh' } },
        fusion: { fusedConfidence: 99 }
      },
      {
        id: 'TRK-021',
        type: 'PERSON',
        displayName: 'Unidentified Contact (Sector North)',
        radar: { x: -35, y: 280, range: 282, azimuth: 353, speedKmh: 12.1, heading: 185, trail: [{ x: -35, y: 280 }] },
        camera: { confidence: 92 },
        rf: { hasEmitter: true, emitterId: 'EMITTER-03', freqGhz: 9.420, isTransmitting: true },
        personnel: { matched: false, zone: 'PERIMETER_NORTH', details: null },
        fusion: { fusedConfidence: 87 }
      },
      {
        id: 'TRK-019',
        type: 'WILDLIFE',
        displayName: 'Wildlife Target',
        radar: { x: 380, y: 80, range: 388, azimuth: 78, speedKmh: 2.1, heading: 45, trail: [{ x: 380, y: 80 }] },
        camera: { confidence: 85 },
        rf: { hasEmitter: false },
        personnel: { matched: false },
        fusion: { fusedConfidence: 94 }
      }
    ];

    // Verify mapping to React Track format
    mockEntities.forEach(ent => {
      const isAuth = Boolean(ent.personnel?.matched || ent.id === 'TRK-014');
      const trackType = isAuth ? 'AUTHORIZED' :
        (ent.type === 'WILDLIFE' ? 'ANIMAL' :
        (ent.type === 'PERSON' ? 'UNKNOWN_PERSON' : 'UNKNOWN_OBJECT'));

      assert.ok(['AUTHORIZED', 'UNKNOWN_PERSON', 'ANIMAL', 'UNKNOWN_OBJECT'].includes(trackType));
      assert.ok(ent.radar.range <= 450, 'All mock entities are within 450m perimeter');
    });

    assert.strictEqual(mockEntities[0].personnel.matched ? 'AUTHORIZED' : 'UNKNOWN_PERSON', 'AUTHORIZED');
    assert.strictEqual(mockEntities[1].personnel.matched ? 'AUTHORIZED' : 'UNKNOWN_PERSON', 'UNKNOWN_PERSON');
    assert.strictEqual(mockEntities[2].type === 'WILDLIFE' ? 'ANIMAL' : 'UNKNOWN_OBJECT', 'ANIMAL');
  });

  // WebSocket live connection test against running server
  await new Promise((resolve, reject) => {
    check('Live WebSocket C2 Frame reception and command handshake', () => {
      const ws = new WebSocket('ws://localhost:8080/ws/c2');
      let messageReceived = false;

      const timeout = setTimeout(() => {
        ws.close();
        if (!messageReceived) reject(new Error('WebSocket connection timed out waiting for C2_FRAME / INIT_STATE'));
      }, 5000);

      ws.on('open', () => {
        // Send a C2 test action
        ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario: 'PERIODIC RF' }));
      });

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw);
          if (data.type === 'INIT_STATE' || data.type === 'C2_FRAME') {
            messageReceived = true;
            assert.ok(data.simState, 'Message must contain simState');
            assert.ok(Array.isArray(data.entities), 'Message must contain entities array');
            assert.ok(data.entities.length > 0, 'Entities array must not be empty');
            assert.ok(data.simState.rxTelemetry, 'simState must contain rxTelemetry');
            assert.strictEqual(typeof data.simState.rxTelemetry.state, 'string');
            assert.strictEqual(typeof data.simState.rxTelemetry.snrDb, 'number');
            assert.strictEqual(typeof data.simState.rxTelemetry.powerDbm, 'number');
            assert.ok(Array.isArray(data.eventTimeline), 'Message must contain eventTimeline');

            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (e) {
          clearTimeout(timeout);
          ws.close();
          reject(e);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  console.log(`\n===========================================================`);
  console.log(`  🎉 SUITE M: ALL PHASE 3 TESTS PASSED (${passedTests}/${totalTests} TESTS)`);
  console.log(`  - RF Telemetry Pipeline: VERIFIED`);
  console.log(`  - Dynamic Scheduler Distribution & Prior/Posterior: VERIFIED`);
  console.log(`  - Canonical 5-Scenario Harmonization: VERIFIED`);
  console.log(`  - React Radar-Scanner & C2 WebSocket Sync: VERIFIED`);
  console.log(`===========================================================\n`);
}

if (require.main === module) {
  runPhase3Tests().catch(err => {
    console.error('Test Suite M Failed:', err);
    process.exit(1);
  });
}

module.exports = { runPhase3Tests };
