const assert = require('assert');
const Pieces = require('../js/pieces.js');

// --- 块表结构 ---
assert.strictEqual(new Set(Pieces.PIECES.map(p => p.id)).size, Pieces.PIECES.length, 'id 唯一');
assert(Pieces.PIECES.every(p => p.cells.length === p.size));
assert(Pieces.PIECES.every(p => p.cells.every(([r, c]) => r >= 0 && c >= 0)), 'cells 相对左上、非负');
assert(Pieces.PIECES.every(p => p.cells.some(([r]) => r === 0) && p.cells.some(([, c]) => c === 0)),
  'bounding box 贴左上（否则放置坐标会有隐形偏移）');
assert(Pieces.PIECES.every(p => p.h <= 8 && p.wdt <= 8), '不超过棋盘');
// cells 不重复
for (const p of Pieces.PIECES) {
  assert.strictEqual(new Set(p.cells.map(c => c.join(','))).size, p.size, `${p.id} 无重复格`);
}
console.log(`test-pieces: ${Pieces.PIECES.length} 块，结构 OK`);

// --- 权重表：档位合计必须正好 25 / 55 / 20（这是印在游戏内「公平」页里的公开承诺）---
const sum = cls => Pieces.PIECES.filter(p => p.cls === cls).reduce((a, p) => a + p.w, 0);
assert.strictEqual(Math.round(sum('S') * 100) / 100, 25, '小档合计 25');
assert.strictEqual(Math.round(sum('M') * 100) / 100, 55, '中档合计 55');
assert.strictEqual(Math.round(sum('L') * 100) / 100, 20, '大档合计 20');
assert.strictEqual(Math.round(Pieces.TOTAL_W), 100);
console.log('test-pieces: 权重档位 25/55/20 OK');

// --- 抽样分布 ≈ 声明分布（±1%）---
// 无 DDA、无重抽 ⇒ 玩家实际经历的分布 = 权重表声明的分布。
// （v3 的 rejection sampling 会扭曲声明权重 —— 那正是砍掉它的理由之一。）
const Dealer = require('../js/dealer.js');
const CNT = {};
const TRIALS = 200000;
for (let i = 0; i < TRIALS; i++) {
  const p = Dealer.stream(12345, i);
  CNT[p.id] = (CNT[p.id] || 0) + 1;
}
for (const p of Pieces.PIECES) {
  const actual = (CNT[p.id] || 0) / TRIALS * 100;
  assert(Math.abs(actual - p.w) < 1.0,
    `${p.id}: 实际 ${actual.toFixed(2)}% vs 声明 ${p.w}% —— 偏差必须 <1%`);
}
console.log('test-pieces: 20 万次抽样分布 ≈ 声明权重（±1%）OK');
