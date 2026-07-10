const assert = require('assert');
const PRNG = require('../../../engine/prng.js');

const a = PRNG.create(42), b = PRNG.create(42), c = PRNG.create(7);
const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
assert.deepStrictEqual(seqA, seqB, '同种子序列必须一致');
assert.notDeepStrictEqual(seqA, [c(), c(), c()], '不同种子序列应不同');
for (let i = 0; i < 1000; i++) { const v = PRNG.create(i)(); assert(v >= 0 && v < 1, '值域 [0,1)'); }
console.log('OK test-prng');
