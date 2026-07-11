const assert = require('assert');
const Core = require('../js/core.js');

// --- 初始状态 ---
let s = Core.createGame({ seed: 1 });
assert.strictEqual(s.cols, 5);
assert.strictEqual(s.rows, 9);
assert.strictEqual(s.board.length, 5, '5 列');
assert(s.board.every(col => Array.isArray(col) && col.length === 0), '开局空盘');
assert.strictEqual(s.score, 0);
assert.strictEqual(s.maxTile, 0);
assert(!s.dead);
assert(Number.isInteger(Math.log2(s.ammo)) && s.ammo >= 2, 'ammo 是 >=2 的 2 的幂');
assert.strictEqual(s.queue.length, 3, '预览 3 发');
assert(s.queue.every(v => Number.isInteger(Math.log2(v)) && v >= 2));

// --- 同种子可复现 ---
const a = Core.createGame({ seed: 42 });
const b = Core.createGame({ seed: 42 });
assert.strictEqual(a.ammo, b.ammo);
assert.deepStrictEqual(a.queue, b.queue);

console.log('test-core: createGame OK');
