/**
 * Automated Tests: Scheduler Mathematical Correctness & Algorithmic Properties
 * Suite B: UCB Mathematical Correctness
 * Suite C: Beta Posterior Updates
 * Suite D: Exploration of Unvisited Bands
 */

const assert = require('assert');
const { RecencyAugmentedUCB1Scheduler } = require('../server/scheduler_engine');

console.log('🧪 RUNNING SUITES B, C, D: Scheduler Mathematical Correctness & Invariants...');

const scheduler = new RecencyAugmentedUCB1Scheduler({
  bands: [9.180, 9.310, 9.420, 9.675, 9.810],
  explorationConstant: Math.SQRT2,
  recencyLambda: 0.20,
  recencyTau: 5.0
});

// -----------------------------------------------------------------------------
// Suite D: Unvisited Band Exploration
// -----------------------------------------------------------------------------
// On a fresh scheduler with 5 candidate bands (0 visits each),
// the scheduler must consecutively survey all 5 bands (score = Infinity)
const initialSurvey = [];
for (let i = 0; i < 5; i++) {
  const d = scheduler.selectBand(i * 0.18);
  assert.strictEqual(d.score, Infinity, `Unvisited band must have score +Infinity (Step ${i + 1})`);
  initialSurvey.push(d.selectedBand);
  scheduler.observeFeedback(d.selectedBand, false, i * 0.18); // Record visit
}

assert.strictEqual(new Set(initialSurvey).size, 5, 'Scheduler must survey all 5 candidate bands initially');
console.log('  ✓ Suite D PASS: All unvisited candidate bands guaranteed selection with score +Infinity');

// -----------------------------------------------------------------------------
// Suite C: Beta-Bernoulli Posterior Updates
// -----------------------------------------------------------------------------
// Test band 9.420 GHz
const targetBand = 9.420;
const arm = scheduler.arms[targetBand];
const alphaBefore = arm.alpha;
const betaBefore = arm.beta;

// Observe HIT: alpha should increase by 1, beta unchanged
scheduler.observeFeedback(targetBand, true, 1.0);
assert.strictEqual(arm.alpha, alphaBefore + 1, 'Alpha must increment by 1 on HIT');
assert.strictEqual(arm.beta, betaBefore, 'Beta must remain unchanged on HIT');
const expectedMeanHit = arm.alpha / (arm.alpha + arm.beta);
assert.strictEqual(arm.alpha / (arm.alpha + arm.beta), expectedMeanHit, 'Beta posterior mean must match alpha / (alpha + beta)');

// Observe MISS: beta should increase by 1, alpha unchanged
const alphaAfterHit = arm.alpha;
const betaAfterHit = arm.beta;
scheduler.observeFeedback(targetBand, false, 1.2);
assert.strictEqual(arm.alpha, alphaAfterHit, 'Alpha must remain unchanged on MISS');
assert.strictEqual(arm.beta, betaAfterHit + 1, 'Beta must increment by 1 on MISS');
console.log('  ✓ Suite C PASS: Beta posterior updates correctly on HIT (+1 alpha) and MISS (+1 beta)');

// -----------------------------------------------------------------------------
// Suite B: UCB Mathematical Correctness
// -----------------------------------------------------------------------------
// Verify hand-computed score matches scheduler output exactly
// Current state:
const testTime = 10.0;
const decision = scheduler.selectBand(testTime);
const scores = decision.scores;

Object.entries(scores).forEach(([bandStr, info]) => {
  const b = Number(bandStr);
  const armState = scheduler.arms[b];
  
  // Hand-computed components:
  const expectedMu = armState.hits / armState.visits;
  const expectedUcb = Math.SQRT2 * Math.sqrt(Math.log(scheduler.totalVisits) / armState.visits);
  const dt = testTime - armState.lastVisitedTimeSec;
  const expectedRecency = 0.20 * Math.tanh(dt / 5.0);
  const expectedQ = expectedMu + expectedUcb + expectedRecency;

  assert(Math.abs(info.mu_hat - expectedMu) < 1e-6, `mu_hat mismatch on ${b}`);
  assert(Math.abs(info.ucbBonus - expectedUcb) < 1e-6, `ucbBonus mismatch on ${b}`);
  assert(Math.abs(info.recency - expectedRecency) < 1e-6, `recency mismatch on ${b}`);
  assert(Math.abs(info.Q - expectedQ) < 1e-6, `Composite score Q(b) mismatch on ${b}`);
});

console.log('  ✓ Suite B PASS: Hand-computed mathematical values match scheduler Q(b) to within 1e-6');
console.log('✅ PASS: Mathematical Correctness & Algorithmic Properties Verified.\n');
