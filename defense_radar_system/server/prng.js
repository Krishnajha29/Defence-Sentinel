/**
 * ESM-ASTRA: Deterministic Pseudo-Random Number Generator (Mulberry32)
 * Ensures 100% reproducible benchmark experiments and emitter simulation sequences.
 * SIH26055: Smart Scan Strategy for Electronic Warfare
 */

class Mulberry32PRNG {
  constructor(seed = 42) {
    this.seed = seed;
    this.state = seed >>> 0;
  }

  reseed(seed) {
    this.seed = seed;
    this.state = seed >>> 0;
  }

  // Returns pseudo-random float in [0, 1)
  next() {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in [min, max] inclusive
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Returns boolean with probability p
  chance(p) {
    return this.next() < p;
  }

  // Returns random element from array
  choice(array) {
    if (!array || array.length === 0) return null;
    return array[this.nextInt(0, array.length - 1)];
  }
}

module.exports = { Mulberry32PRNG };
