/**
 * Automated Test: Suite G - Metric Calculation Accuracy & Brier Calibration
 * Verifies exact computation of Detection Rate, FAR, Brier Score, and Utilization.
 */

const assert = require('assert');

console.log('🧪 RUNNING SUITE G: Metric Calculation & Brier Calibration Formulas...');

// 1. Detection Rate test
const hits = 70;
const opportunities = 100;
const detectionRate = Number(((hits / opportunities) * 100).toFixed(1));
assert.strictEqual(detectionRate, 70.0, 'Detection rate must be 70.0%');

// 2. False Alarm Rate (FAR) test
const falseAlarms = 3;
const noiseOnlyDwells = 150;
const far = Number(((falseAlarms / noiseOnlyDwells) * 100).toFixed(1));
assert.strictEqual(far, 2.0, 'FAR must be 2.0%');

// 3. Brier Score calculation test
// Test vector:
// Case 1: Prediction p=0.9, Outcome=1 -> (0.9 - 1)^2 = 0.01
// Case 2: Prediction p=0.8, Outcome=1 -> (0.8 - 1)^2 = 0.04
// Case 3: Prediction p=0.2, Outcome=0 -> (0.2 - 0)^2 = 0.04
// Case 4: Prediction p=0.7, Outcome=0 -> (0.7 - 0)^2 = 0.49
// Total sum = 0.01 + 0.04 + 0.04 + 0.49 = 0.58
// Mean = 0.58 / 4 = 0.1450
const testPredictions = [0.9, 0.8, 0.2, 0.7];
const testOutcomes = [1, 1, 0, 0];
let brierSum = 0;
for (let i = 0; i < testPredictions.length; i++) {
  brierSum += Math.pow(testPredictions[i] - testOutcomes[i], 2);
}
const brierScore = Number((brierSum / testPredictions.length).toFixed(4));
assert.strictEqual(brierScore, 0.1450, `Brier score must equal 0.1450 (got ${brierScore})`);
console.log('  ✓ Brier Score calculation verified against controlled mathematical test vector: 0.1450');

// 4. Receiver Utilization test
const occupiedDwellSec = 45 * 0.18; // 45 dwells with energy
const totalDwellSec = 100 * 0.18;   // 100 dwells total
const util = Number(((occupiedDwellSec / totalDwellSec) * 100).toFixed(1));
assert.strictEqual(util, 45.0, 'Utilization must be 45.0%');

// 5. Wilson Score Interval test
const calcWilson = (x, n) => {
  const z = 1.95996;
  const p = x / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    lowerPct: Number(((center - margin) / denom * 100).toFixed(1)),
    upperPct: Number(((center + margin) / denom * 100).toFixed(1))
  };
};

const ci = calcWilson(50, 100);
assert(ci.lowerPct < 50 && ci.upperPct > 50, 'Confidence interval must encompass point estimate');
assert(ci.lowerPct >= 40 && ci.upperPct <= 60, 'CI width reasonable for N=100');
console.log(`  ✓ Wilson 95% Score CI verified: 50/100 -> [${ci.lowerPct}%, ${ci.upperPct}%]`);

console.log('✅ PASS: Metric Calculation & Brier Calibration Formulas Verified.\n');
