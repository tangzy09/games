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

// --- gravityUp: 每列去零、保持顺序、向 index 0 压实 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 0, 4, 0], [0, 0, 8], [], [16], [0]];
Core.gravityUp(s);
assert.deepStrictEqual(s.board[0], [2, 4], '列0 去零保序');
assert.deepStrictEqual(s.board[1], [8], '列1 去零');
assert.deepStrictEqual(s.board[2], [], '列2 空');
assert.deepStrictEqual(s.board[3], [16], '列3 不变');
assert.deepStrictEqual(s.board[4], [], '列4 全零→空');
console.log('test-core: gravityUp OK');
