/**
 * Automated Test: Adaptive Scan Scheduler (UCB-1 / Bayesian) Math & Convergence
 * SIH26055: Smart Scan Strategy for Electronic Warfare
 */

const assert = require('assert');
const { AdaptiveScanScheduler, OpenLoopSequentialScheduler } = require('../server/scheduler_engine');

console.log('🧪 RUNNING TEST: Scheduler Convergence & Attribution...');

const bands = [9.180, 9.310, 9.420, 9.675, 9.810];
const scheduler = new AdaptiveScanScheduler({ bands });

// 1. Initial State verification
const initialState = scheduler.getState();
assert.strictEqual(initialState.arms.length, 5, 'Must initialize 5 arms');
console.log('  ✓ 5 candidate bands initialized');

// 2. Simulate heavy rewards on Band 9.420 GHz (simulate 80% burst rate) vs Band 9.810 GHz (10% burst rate)
for (let step = 0; step < 100; step++) {
  const decision = scheduler.selectBand(step * 0.18);
  const tuned = decision.selectedBand;

  // Band 9.420 has 80% burst probability, others have 10%
  const isHit = tuned === 9.420 ? (step % 5 !== 0) : (step % 10 === 0);
  scheduler.observeFeedback(tuned, isHit, step * 0.18);
}

const stateAfter = scheduler.getState();
const arm942 = stateAfter.arms.find(a => a.freqGhz === 9.420);
const arm981 = stateAfter.arms.find(a => a.freqGhz === 9.810);

assert(arm942.visits > arm981.visits, 'Band 9.420 must receive significantly more dwell allocations than band 9.810');
assert(arm942.empiricalReward > arm981.empiricalReward, 'Empirical reward on 9.420 must be higher');
console.log(`  ✓ UCB allocated ${arm942.visits} dwells to 9.420 GHz vs ${arm981.visits} dwells to 9.810 GHz`);

// 3. Verify OpenLoop Sequential Scanner cycles deterministically
const openLoop = new OpenLoopSequentialScheduler({ bands });
const sequence = [];
for (let i = 0; i < 10; i++) {
  sequence.push(openLoop.selectBand().selectedBand);
}
assert.deepStrictEqual(sequence, [...bands, ...bands], 'Open loop scanner must cycle deterministically');
console.log('  ✓ Open-loop sequential scanner cycled deterministically through all bands');

console.log('✅ PASS: Scheduler Mathematical Convergence Verified.\n');
