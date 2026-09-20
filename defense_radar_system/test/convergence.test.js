/**
 * Automated Test: Suite E - Stationary Convergence & Exploration Non-Starvation
 * Verifies that under a controlled stationary environment where one band has constant
 * high reward (p=1.0) and other bands have noise only (p=0.0):
 * 1. The optimal band receives the majority of dwells (convergence).
 * 2. Non-optimal bands still receive non-zero dwell visits (exploration non-starvation).
 */

const assert = require('assert');
const { RecencyAugmentedUCB1Scheduler } = require('../server/scheduler_engine');

console.log('🧪 RUNNING SUITE E: Stationary Convergence & Exploration Non-Starvation...');

const scheduler = new RecencyAugmentedUCB1Scheduler({
  bands: [9.180, 9.310, 9.420, 9.675, 9.810],
  explorationConstant: Math.SQRT2,
  recencyLambda: 0.20,
  recencyTau: 5.0
});

const optimalBand = 9.420;
const totalSteps = 200;

for (let step = 1; step <= totalSteps; step++) {
  const simTimeSec = step * 0.18;
  const decision = scheduler.selectBand(simTimeSec);
  const tunedBand = decision.selectedBand;

  // Ground truth stationary reward: optimalBand always gives HIT, others always give MISS
  const isHit = (tunedBand === optimalBand);
  scheduler.observeFeedback(tunedBand, isHit, simTimeSec);
}

const state = scheduler.getState();
const armMap = {};
state.arms.forEach(a => { armMap[a.freqGhz] = a; });

// 1. Assert optimal band received more visits than any other single band
const optimalVisits = armMap[optimalBand].visits;
console.log(`  Stationary Allocation across ${totalSteps} dwells:`);
state.arms.forEach(a => {
  console.log(`    Band ${a.freqGhz.toFixed(3)} GHz: ${a.visits} dwells, ${a.hits} hits (reward: ${a.empiricalReward})`);
  if (a.freqGhz !== optimalBand) {
    assert(optimalVisits > a.visits, `Optimal band ${optimalBand} (${optimalVisits} visits) must exceed non-optimal band ${a.freqGhz} (${a.visits} visits)`);
    // 2. Assert no band was permanently starved
    assert(a.visits > 0, `Non-optimal band ${a.freqGhz} must not be permanently starved (received ${a.visits} visits)`);
  }
});

assert(optimalVisits > totalSteps * 0.50, `Optimal band should receive over 50% of total dwells (received ${optimalVisits}/${totalSteps})`);
console.log('  ✓ Suite E PASS: Convergence to optimal band verified with guaranteed non-starvation of alternative bands');
console.log('✅ PASS: Stationary Convergence Verified.\n');
