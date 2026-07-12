const assert = require('assert');
const Tools = require('../js/tools.js');
const Core = require('../js/core.js');
const Tiles = require('../js/tiles.js');

// 密实不变式检查器:每列必须从 index0 起连续、无 0/空洞
function assertDense(s, msg) {
  for (let c = 0; c < s.cols; c++) {
    for (const v of s.board[c]) {
      assert(Number.isFinite(v) && v > 0,
        `${msg}: 列${c} 出现空洞/非法值 ${v} —— 密实不变式破了,连通判定会全乱`);
    }
  }
}

// --- 价格表存在且为正 ---
assert(Tools.COST.undo > 0 && Tools.COST.hammer > 0 && Tools.COST.swap > 0);

// --- 金币计算:合并×1 + 连锁×5 + 梯顶游走×50 ---
let ev = [{ t: 'merge' }, { t: 'merge' }, { t: 'merge' }];
assert.strictEqual(Tools.coinsFor(ev), 3, '3 次合并 = 3 币');
ev = [{ t: 'merge' }, { t: 'merge' }, { t: 'chain', n: 2 }];
assert.strictEqual(Tools.coinsFor(ev), 2 + 5, '合并2 + 连锁1×5');
ev = [{ t: 'escape', n: 2 }];
assert.strictEqual(Tools.coinsFor(ev), 50, '梯顶游走 = 50 币');

// --- 🔨 锤子:砸掉一格 ---
let s = Core.createGame({ seed: 1 });
s.board = [[2, 8, 4], [16], [], [], []];
let r = Tools.hammer(s, 0, 1);                 // 砸掉列0 的 index1(那个 8)
assert(r.ok, '砸掉合法格子应成功');
assert.deepStrictEqual(s.board[0], [2, 4], '8 被移除,上下自动压实(无空洞)');
assertDense(s, '锤子后');
assert(s.events.some(e => e.t === 'hammer'), '发 hammer 事件');

// --- ⚠ 锤子必须触发 resolve:移除会制造新的相邻,可能连锁 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 8, 4], [], [], [], []];         // 砸掉中间的 8 → 两个 4 相邻 → 合成 8
Tools.hammer(s, 0, 1);
assert.deepStrictEqual(s.board[0], [8], '砸掉隔在中间的 8 后,两个 4 相邻并合成 8(连锁必须触发)');
assertDense(s, '锤子连锁后');

// --- 锤子:越界/空列 不炸 ---
s = Core.createGame({ seed: 1 });
s.board = [[2], [], [], [], []];
assert(!Tools.hammer(s, 9, 0).ok, '越界列 → 失败,不炸');
assert(!Tools.hammer(s, 1, 0).ok, '空列 → 失败,不炸');
assert(!Tools.hammer(s, 0, 5).ok, '越界 index → 失败,不炸');

// --- 🔀 交换两列 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 4], [8], [], [], []];
r = Tools.swap(s, 0, 1);
assert(r.ok);
assert.deepStrictEqual(s.board[0], [8], '列0 变成原列1');
assert.deepStrictEqual(s.board[1], [2, 4], '列1 变成原列0');
assertDense(s, '交换后');
assert(s.events.some(e => e.t === 'swap'), '发 swap 事件');

// --- ⚠ 交换必须触发 resolve:换完可能形成新的横向连通 ---
s = Core.createGame({ seed: 1 });
s.board = [[16], [2], [16], [], []];           // 换列1和列2 → 列0=[16] 列1=[16] 同 index 横邻 → 合
Tools.swap(s, 1, 2);
assert(s.board.flat().includes(32), '交换后形成横向同值 → 必须合成 32');
assertDense(s, '交换连锁后');

// --- 交换:同列/越界 不炸 ---
s = Core.createGame({ seed: 1 });
assert(!Tools.swap(s, 0, 0).ok, '同一列 → 失败');
assert(!Tools.swap(s, 0, 9).ok, '越界 → 失败');

// --- ↩ 撤销:精确回到上一发之前(含 RNG,不能刷弹药) ---
s = Core.createGame({ seed: 5 });
for (let k = 0; k < 6; k++) Core.shoot(s, k % s.cols);
const snap = Tools.snapshot(s);                 // 射击前存档由 main 负责调用,这里直接测
const boardBefore = Core.snapBoard(s);
const ammoBefore = s.ammo, scoreBefore = s.score, shotsBefore = s.shots;
Core.shoot(s, 2);                               // 射一发
assert(s.shots === shotsBefore + 1);
Tools.undo(s, snap);                            // 撤销
assert.deepStrictEqual(s.board, boardBefore, '盘面回到射击前');
assert.strictEqual(s.ammo, ammoBefore, '弹药回到射击前');
assert.strictEqual(s.score, scoreBefore, '分数回退');
assert.strictEqual(s.shots, shotsBefore, '发数回退');
assertDense(s, '撤销后');
// 关键:撤销后再射同一列,结果必须与第一次**完全一样**(否则就是在刷弹药)
const s2 = Core.createGame({ seed: 5 });
for (let k = 0; k < 6; k++) Core.shoot(s2, k % s2.cols);
Core.shoot(s2, 2);
Core.shoot(s, 2);                               // 撤销后重射同一列
assert.deepStrictEqual(Core.snapBoard(s), Core.snapBoard(s2),
  '撤销后重射,盘面必须与没撤销时一模一样 —— 否则撤销 = 刷弹药(save-scum)');
assert.strictEqual(s.ammo, s2.ammo, '撤销后重射,下一发弹药也必须一样');

// ── P3a: 看广告复活 ──
// ⚠ 削掉每列**顶部**(index 0 侧)的 n 格,不是底部:
//    两者同样降低列高(同样远离死线),但顶部是最老的杂鱼、底部是玩家辛苦垒的大鱼。
//    削底部 = 毁掉玩家的成果;削顶部保住它。
assert.strictEqual(Tools.REVIVE_ROWS, 3, '每次复活削 3 格');
assert.strictEqual(Tools.MAX_REVIVES, 2, '每局限 2 次');

s = Core.createGame({ seed: 1 });
s.board = [[2, 4, 8, 16, 32], [64], [], [128, 256], []];
s.dead = true;
let rv = Tools.revive(s, 3);
assert(rv.ok);
assert(!s.dead, '复活后 dead 清除');
assert.deepStrictEqual(s.board[0], [16, 32], '列0 削掉顶部 3 格(2,4,8),保住底部的 16,32');
assert.deepStrictEqual(s.board[1], [], '列1 只有 1 格,全削掉');
assert.deepStrictEqual(s.board[3], [], '列3 只有 2 格,全削掉');
assertDense(s, '复活后');
assert(s.events.some(e => e.t === 'revive'), '发 revive 事件');

// ⚠ 复活必须 resolve:削掉顶部会制造新的相邻,可能连锁
// (⚠ 每列独立按 k 削顶,列1若比 k 短会被整列削空,不会剩下东西去横邻——
//  故这里让列0/列1**同形**,削顶后两列都剩 [8],才会在 index0 横邻合成 16。)
s = Core.createGame({ seed: 1 });
s.board = [[2, 2, 2, 8], [2, 2, 2, 8], [], [], []];   // 削掉顶部 3 格(2,2,2) → 列0=[8],列1=[8],横邻 → 合成 16
s.dead = true;
Tools.revive(s, 3);
assert(s.board.flat().includes(16), '削顶后形成横向同值 → 必须合成 16(连锁要触发)');
assertDense(s, '复活连锁后');

// 空盘/削光不炸
s = Core.createGame({ seed: 1 });
s.board = [[], [], [], [], []];
s.dead = true;
assert(Tools.revive(s, 3).ok, '空盘复活不炸');
assert(!s.dead);

// 广告金币常量
assert(Tools.AD_COINS > 0, '看广告给的金币为正');
console.log('test-tools: 复活 OK(削顶部保住大鱼/触发连锁/不炸)');

console.log('test-tools OK');
