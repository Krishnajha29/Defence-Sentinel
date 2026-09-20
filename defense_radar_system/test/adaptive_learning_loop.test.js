/**
 * Automated Test: Suite J - Adaptive Learning Loop & Causal Decision Trace
 * Problem Statement: SIH26055 (Adaptive Scan Strategy for Electronic Warfare)
 * 
 * Verifies:
 * 1. MISS changes state (misses++, beta++, empiricalReward drops)
 * 2. HIT changes state (hits++, alpha++, empiricalReward increases)
 * 3. State changes score (Q(b) updates immediately)
 * 4. Score changes next decision (receiver switches to higher-scoring arm)
 * 5. All 10 per-band state quantities are present and valid.
 * 6. Decision trace captures decisionId, candidate scores vector, reasoning, and top factors.
 * 7. All 4 Ablation Modes (FULL_ADAPTIVE, UCB_ONLY, NO_EXPLORATION, OPEN_LOOP) exhibit distinct behaviors.
 */

const assert = require('assert');
const { RecencyAugmentedUCB1Scheduler, runHitMissLearningSequence } = require('../server/scheduler_engine');

console.log('🧪 RUNNING SUITE J: Adaptive Learning Loop, Per-Band State & Decision Traces (SIH26055)...');

const bands = [9.180, 9.310, 9.420, 9.675, 9.810];
const scheduler = new RecencyAugmentedUCB1Scheduler({
  bands,
  explorationConstant: 1.414,
  recencyLambda: 0.15,
  dwellMs: 180
});

// =============================================================================
// Part 1: Verification of 10-Attribute Per-Band State
// =============================================================================
console.log('  Testing 10-attribute per-band state schema:');
const perBandInitial = scheduler.getPerBandState(0);
assert.strictEqual(perBandInitial.length, 5, 'Must return state for all 5 bands');

const requiredFields = [
  'visits',
  'hits',
  'misses',
  'estimatedReward',
  'activityProbability',
  'uncertainty',
  'lastObserved',
  'aging',
  'explorationBonus',
  'currentScore'
];

perBandInitial.forEach(bState => {
  requiredFields.forEach(field => {
    assert.notStrictEqual(bState[field], undefined, `Field ${field} must be defined for band ${bState.band}`);
  });
});
console.log('    ✓ All 10 required fields verified across candidate bands');

// =============================================================================
// Part 2: Seed Initial Visits matching runHitMissLearningSequence()
// =============================================================================
// 5 visits to unpromising bands (0 hits)
[9.180, 9.310, 9.810].forEach(b => {
  for (let v = 0; v < 5; v++) scheduler.observeFeedback(b, false, 1.0 + v * 0.1);
});
// 4 visits to Band B (9.675 GHz) with 3 hits (empiricalReward = 0.750)
for (let v = 0; v < 4; v++) {
  scheduler.observeFeedback(9.675, v < 3, 2.0 + v * 0.1);
}
// 3 visits to Band A (9.420 GHz) with 2 hits (empiricalReward = 0.667)
for (let v = 0; v < 3; v++) {
  scheduler.observeFeedback(9.420, v < 2, 2.5 + v * 0.1);
}

// =============================================================================
// Part 3: Mandatory Proof: MISS -> State -> Score -> Decision Change
// =============================================================================
console.log('  Testing Causal Chain: MISS -> State -> Score -> Decision Change:');

// Step 1: Decision chooses 9.420 GHz because Q(9.420) ~ 2.106 > Q(9.675) ~ 2.002
const dec1 = scheduler.selectBand(3.0);
assert.strictEqual(dec1.selectedBand, 9.420, 'Initial decision must select Band 9.420 GHz');
const scoreA_before = dec1.candidateScores.find(c => c.band === 9.420).score;
const scoreB_before = dec1.candidateScores.find(c => c.band === 9.675).score;
assert.ok(scoreA_before > scoreB_before, `Score A (${scoreA_before}) must exceed Score B (${scoreB_before})`);
console.log(`    ✓ Step 1: Decision selects 9.420 GHz (Score: ${scoreA_before} vs 9.675 GHz: ${scoreB_before})`);

// Step 2: EXACTLY ONE Dwell on 9.420 GHz yields MISS at t = 3.2s
const armA_misses_before = scheduler.arms[9.420].misses;
const armA_beta_before = scheduler.arms[9.420].beta;
const armA_reward_before = scheduler.arms[9.420].empiricalReward;

scheduler.observeFeedback(9.420, false, 3.2);

// Assert 1: MISS changes state (single dwell invariant)
assert.strictEqual(scheduler.arms[9.420].misses, armA_misses_before + 1, 'MISS must increment misses count by exactly 1');
assert.strictEqual(scheduler.arms[9.420].beta, armA_beta_before + 1, 'MISS must increment beta parameter by exactly 1');
assert.ok(scheduler.arms[9.420].empiricalReward < armA_reward_before, 'MISS must decrease empirical reward');
console.log(`    ✓ Step 2 (State Change): misses=${scheduler.arms[9.420].misses}, beta=${scheduler.arms[9.420].beta}, reward=${scheduler.arms[9.420].empiricalReward.toFixed(3)}`);

// Assert 2: Single MISS drops score A and flips the decision to Band B
const dec2 = scheduler.selectBand(3.4);
const scoreA_after = dec2.candidateScores.find(c => c.band === 9.420).score;
const scoreB_after = dec2.candidateScores.find(c => c.band === 9.675).score;

assert.ok(scoreA_after < scoreA_before, `Score A must drop (${scoreA_before} -> ${scoreA_after})`);
assert.ok(scoreB_after > scoreA_after, `Score B (${scoreB_after}) must now exceed Score A (${scoreA_after})`);
assert.strictEqual(dec2.selectedBand, 9.675, 'New decision must switch to Band 9.675 GHz without extra synthetic dwells');
console.log(`    ✓ Step 3 (Score & Decision Change): Score A dropped to ${scoreA_after}. New decision switches to 9.675 GHz (Score: ${scoreB_after})`);

// =============================================================================
// Part 4: Mandatory Proof: HIT -> State -> Score -> Reinforcement
// =============================================================================
console.log('  Testing Causal Chain: HIT -> State -> Score -> Reinforcement:');

const armB_hits_before = scheduler.arms[9.675].hits;
const armB_alpha_before = scheduler.arms[9.675].alpha;
const armB_reward_before = scheduler.arms[9.675].empiricalReward;

// Step 4: EXACTLY ONE Dwell on 9.675 GHz yields HIT at t = 3.6s
scheduler.observeFeedback(9.675, true, 3.6);

// Assert 3: HIT changes state (single dwell invariant)
assert.strictEqual(scheduler.arms[9.675].hits, armB_hits_before + 1, 'HIT must increment hits count by exactly 1');
assert.strictEqual(scheduler.arms[9.675].alpha, armB_alpha_before + 1, 'HIT must increment alpha parameter by exactly 1');
assert.ok(scheduler.arms[9.675].empiricalReward > armB_reward_before, 'HIT must increase empirical reward');
console.log(`    ✓ Step 4 (State Change): hits=${scheduler.arms[9.675].hits}, alpha=${scheduler.arms[9.675].alpha}, reward=${scheduler.arms[9.675].empiricalReward.toFixed(3)}`);

// Assert 4: Estimated value increases and reinforces next decision
const dec3 = scheduler.selectBand(3.8);
const candB = dec3.candidateScores.find(c => c.band === 9.675);
const candA = dec3.candidateScores.find(c => c.band === 9.420);
assert.ok(candB.estimatedReward > armB_reward_before, `Estimated reward must rise (${armB_reward_before} -> ${candB.estimatedReward})`);
assert.ok(candB.score > candA.score, `Score B (${candB.score}) must exceed Score A (${candA.score})`);
assert.strictEqual(dec3.selectedBand, 9.675, 'Policy must reinforce 9.675 GHz as top target');
console.log(`    ✓ Step 5 (Estimated Value Increase & Reinforcement): Estimated reward rose to ${candB.estimatedReward}. Next decision reinforces 9.675 GHz`);

// =============================================================================
// Part 5: Decision Trace Inspection
// =============================================================================
console.log('  Testing Decision Trace logging:');
assert.ok(dec3.decisionRecord, 'Decision record must be attached');
assert.ok(dec3.decisionRecord.decisionId.startsWith('DEC-#'), 'Decision ID must have DEC-# prefix');
assert.ok(dec3.decisionRecord.candidateScores.length === 5, 'Must record candidate score vector for all 5 bands');
assert.ok(dec3.decisionRecord.topFactors.length > 0, 'Must record top factors');
assert.ok(dec3.decisionRecord.reasoning.length > 10, 'Must record reasoning sentence');
console.log(`    ✓ Logged: ${dec3.decisionRecord.decisionId} -> ${dec3.decisionRecord.reasoning}`);

// =============================================================================
// Part 6: Ablation Modes Verification
// =============================================================================
console.log('  Testing 4 Ablation Modes:');

// Mode A: NO_EXPLORATION
const schedGreedy = new RecencyAugmentedUCB1Scheduler({ bands, ablationMode: 'NO_EXPLORATION' });
bands.forEach(b => schedGreedy.observeFeedback(b, b === 9.180, 0.2));
const greedyDec = schedGreedy.selectBand(1.0);
assert.strictEqual(schedGreedy.arms[9.180].uncertainty, 0, 'Uncertainty exploration must be suppressed in NO_EXPLORATION');
assert.strictEqual(greedyDec.selectedBand, 9.180, 'Greedy scheduler must exploit 9.180 GHz without exploration');
console.log('    ✓ NO_EXPLORATION verified: locks onto greedy reward with 0 exploration bonus');

// Mode B: OPEN_LOOP
const schedOpenLoop = new RecencyAugmentedUCB1Scheduler({ bands, ablationMode: 'OPEN_LOOP' });
const ol1 = schedOpenLoop.selectBand(0);
const ol2 = schedOpenLoop.selectBand(0.2);
const ol3 = schedOpenLoop.selectBand(0.4);
assert.strictEqual(ol1.selectedBand, bands[0], 'Open loop must select band 0');
assert.strictEqual(ol2.selectedBand, bands[1], 'Open loop must select band 1');
assert.strictEqual(ol3.selectedBand, bands[2], 'Open loop must select band 2');
console.log('    ✓ OPEN_LOOP verified: strictly cycles through candidate channels sequentially');

// Mode C: UCB_ONLY vs FULL_ADAPTIVE (Recency Aging)
const schedUcbOnly = new RecencyAugmentedUCB1Scheduler({ bands, ablationMode: 'UCB_ONLY' });
const schedFull = new RecencyAugmentedUCB1Scheduler({ bands, ablationMode: 'FULL_ADAPTIVE' });
bands.forEach(b => {
  schedUcbOnly.observeFeedback(b, false, 0.2);
  schedFull.observeFeedback(b, false, 0.2);
});
// After 20 seconds of elapsed time:
const ucbState = schedUcbOnly.getPerBandState(20.0);
const fullState = schedFull.getPerBandState(20.0);
// Full adaptive must include recency aging in currentScore, while UCB_ONLY ignores time
assert.ok(fullState[0].currentScore > ucbState[0].currentScore, 'FULL_ADAPTIVE score must exceed UCB_ONLY due to recency aging term');
console.log(`    ✓ UCB_ONLY vs FULL_ADAPTIVE verified: aging term raises stale channel score from ${ucbState[0].currentScore} to ${fullState[0].currentScore}`);

// =============================================================================
// Part 7: Deterministic Learning Sequence Walkthrough
// =============================================================================
console.log('  Testing Deterministic Hit/Miss Learning Sequence Walkthrough:');
const seq = runHitMissLearningSequence();
assert.strictEqual(seq.steps.length, 5, 'Walkthrough sequence must contain exactly 5 steps');
assert.strictEqual(seq.steps[0].selectedBand, 9.420, 'Step 1 must select Band A (9.420 GHz)');
assert.strictEqual(seq.steps[2].selectedBand, 9.675, 'Step 3 must switch to Band B (9.675 GHz)');
assert.strictEqual(seq.steps[4].selectedBand, 9.675, 'Step 5 must reinforce Band B (9.675 GHz)');
console.log('    ✓ Deterministic learning walkthrough produced 5 verified stages');

console.log('✅ PASS: Adaptive Learning Loop & Causal Decision Trace Verified.\n');
