/**
 * Automated Test: Seeded PRNG Determinism & Range Sanity
 * Verifies Mulberry32PRNG produces identical sequences from identical seeds,
 * diverges under different seeds, and produces valid [0, 1) bounds.
 * (Note: Does not claim to prove statistical independence; verifies deterministic replay).
 */

const assert = require('assert');
const { Mulberry32PRNG } = require('../server/prng');

console.log('🧪 RUNNING SUITE A: PRNG Determinism & Range Sanity...');

// 1. Same seed must yield identical outputs
const prng1 = new Mulberry32PRNG(42);
const prng2 = new Mulberry32PRNG(42);

const seqA1 = [];
const seqA2 = [];
for (let i = 0; i < 500; i++) {
  const v1 = prng1.next();
  const v2 = prng2.next();
  assert(v1 >= 0 && v1 < 1, 'PRNG output must be in [0, 1)');
  seqA1.push(v1);
  seqA2.push(v2);
}

assert.deepStrictEqual(seqA1, seqA2, 'Seed 42 must produce identical sequence A across independent instances');
console.log('  ✓ Seed 42 -> Sequence A reproduced identically across instances (500 draws)');

// 2. Seed 108 must yield divergent sequence B
const prngB = new Mulberry32PRNG(108);
const seqB = [];
for (let i = 0; i < 500; i++) {
  seqB.push(prngB.next());
}
assert.notDeepStrictEqual(seqA1, seqB, 'Seed 108 must produce sequence B != sequence A');
console.log('  ✓ Seed 108 -> Sequence B diverged from Sequence A (A !== B)');

// 3. Reseed must replay identical sequence
prng1.reseed(42);
const seqReplayed = [];
for (let i = 0; i < 500; i++) {
  seqReplayed.push(prng1.next());
}
assert.deepStrictEqual(seqA1, seqReplayed, 'Reseeding to 42 must replay exact sequence A');
console.log('  ✓ Reseed(42) replayed exact sequence A');

console.log('✅ PASS: PRNG Determinism & Range Sanity Verified.\n');
