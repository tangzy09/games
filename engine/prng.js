// ════════════════════════════════════════
// prng.js — seedable PRNG (mulberry32). Games needing reproducible randomness
// (tests, daily seeds, AI verification) use PRNG.create(seed) instead of Math.random.
// Dual-export: browser global `PRNG` / node module.exports (pure module, no DOM).
// ════════════════════════════════════════
const PRNG = {
  create(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = PRNG;
