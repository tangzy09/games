const assert = require('assert');
const Dealer = require('../js/dealer.js');
const Core = require('../js/core.js');

// --- 纯函数：同 (seed, i) 恒等 ---
for (let i = 0; i < 50; i++) {
  assert.strictEqual(Dealer.stream(777, i).id, Dealer.stream(777, i).id);
}
assert.deepStrictEqual(Dealer.hand(9, 0).map(p => p.id), Dealer.hand(9, 0).map(p => p.id));
console.log('test-dealer: 同种子同序列（可复现）OK');

// --- 随机访问 = 顺序生成（撤销回滚 streamIndex 后必须重现同样的块）---
const seqA = [];
for (let i = 0; i < 30; i++) seqA.push(Dealer.stream(555, i).id);
const seqB = [10, 11, 12, 3, 4, 5].map(i => Dealer.stream(555, i).id);
assert.deepStrictEqual(seqB, [seqA[10], seqA[11], seqA[12], seqA[3], seqA[4], seqA[5]],
  '任意跳读 = 顺序读的同一位置（撤销天然免疫「刷块」）');
console.log('test-dealer: 随机访问一致 OK');

// --- 不同种子给出不同块流 ---
const s1 = Array.from({ length: 30 }, (_, i) => Dealer.stream(1, i).id).join();
const s2 = Array.from({ length: 30 }, (_, i) => Dealer.stream(2, i).id).join();
assert.notStrictEqual(s1, s2);
console.log('test-dealer: 不同种子不同块流 OK');

// ════════════════════════════════════════
// ⚠ 公平承诺的可执行版（DESIGN §2 承诺 2）：
//   「发牌不读取任何玩家状态：不看棋盘、不看分数、不看是否接近纪录、不看是否付过费。」
//
// 签名层面：stream(seed, i) 只有两个参数 —— 想作弊都没有入口。
// 行为层面：把棋盘/分数/付费状态怎么改都行，同 seed 的块流必须逐块不变。
// ════════════════════════════════════════
const baseline = Array.from({ length: 60 }, (_, i) => Dealer.stream(2024, i).id);

// 造一个「玩家快破纪录了、盘面很干净、还没付过钱」的极端状态——最有动机作弊的时刻
const s = Core.newGame(2024);
s.score = 999999;
s.board = s.board.map((_, i) => (i % 3 === 0 ? 1 : 0));
s.stats.maxStreak = 50;
globalThis.__isPaidUser = false;
globalThis.__bestScore = 1000000;

const after = Array.from({ length: 60 }, (_, i) => Dealer.stream(2024, i).id);
assert.deepStrictEqual(after, baseline, '块流与棋盘/分数/付费状态完全无关');
assert.strictEqual(Dealer.stream.length, 2, 'stream 的签名里没有棋盘/分数的位置');
console.log('test-dealer: 公平承诺 —— 块流不读取任何玩家状态 OK');

// --- 每日谜题：同一天全球同一条块流 ---
const d1 = new Date(2026, 6, 13, 8, 0, 0);
const d2 = new Date(2026, 6, 13, 23, 59, 59);   // 同一天的另一个时刻
const d3 = new Date(2026, 6, 14, 8, 0, 0);      // 第二天
assert.strictEqual(Dealer.dailySeed(d1), Dealer.dailySeed(d2), '同一天 = 同一种子');
assert.notStrictEqual(Dealer.dailySeed(d1), Dealer.dailySeed(d3), '换天 = 换种子');
console.log('test-dealer: 每日谜题种子 OK');
