const assert = require('assert');
const Core = require('../js/core.js');
const Pieces = require('../js/pieces.js');
const Dealer = require('../js/dealer.js');

const P = id => Pieces.byId(id);
const blank = () => new Array(64).fill(0);
/** 把一行填到只剩 (r, holeC) 一个空格 */
function rowAlmostFull(board, r, holeC) {
  for (let c = 0; c < 8; c++) board[Core.idx(r, c)] = (c === holeC ? 0 : 1);
  return board;
}

// ════════ 新局 ════════
let s = Core.newGame(42);
assert.strictEqual(s.board.length, 64);
assert(s.board.every(v => v === 0), '开局空盘');
assert.strictEqual(s.score, 0);
assert.strictEqual(s.streak, 0);
assert.strictEqual(Core.tray(s).length, 3, '托盘 3 块');
assert.strictEqual(Core.nextHand(s).length, 3, '下一手预览 3 块');
assert(!s.over);
console.log('test-core: newGame OK');

// ════════ 放置合法性 ════════
s = Core.newGame(1);
assert(Core.canPlace(blank(), P('sq3'), 5, 5), '3×3 放在 (5,5) 合法');
assert(!Core.canPlace(blank(), P('sq3'), 6, 6), '3×3 放在 (6,6) 越界');
assert(!Core.canPlace(blank(), P('i5h'), 0, 4), '1×5 放在 col4 越界');
const occupied = blank(); occupied[Core.idx(3, 3)] = 1;
assert(!Core.canPlace(occupied, P('o4'), 2, 2), '与占用格重叠 → 非法');
assert.strictEqual(Core.placements(blank(), P('i1')).length, 64, '1×1 在空盘有 64 个落点');
console.log('test-core: 放置合法性 OK');

// ════════ 消行 + 消列 + 同时多条 ════════
s = Core.newGame(1);
s.board = rowAlmostFull(blank(), 0, 7);
s.placed = [true, true, false];                    // 只留 slot2
const piece2 = Core.tray(s)[2];
// 用一个 1×1 补上最后一格：手动构造，绕开随机块
s.board[Core.idx(0, 7)] = 0;
let before = Core.fillCount(s.board);
// 直接测纯函数 findFullLines
s.board[Core.idx(0, 7)] = 1;
let lines = Core.findFullLines(s.board);
assert.deepStrictEqual(lines.rows, [0], '整行填满被识别');
assert.deepStrictEqual(lines.cols, [], '没有整列');

// 行+列同时满（十字）
const cross = blank();
for (let c = 0; c < 8; c++) cross[Core.idx(4, c)] = 1;
for (let r = 0; r < 8; r++) cross[Core.idx(r, 4)] = 1;
lines = Core.findFullLines(cross);
assert.deepStrictEqual(lines.rows, [4]);
assert.deepStrictEqual(lines.cols, [4]);
console.log('test-core: 消行/消列/十字识别 OK');

// ════════ 计分公式（DESIGN §3）════════
assert.strictEqual(Core.comboTier(1), 1.0);
assert.strictEqual(Core.comboTier(2), 1.5);
assert.strictEqual(Core.comboTier(3), 2.2);
assert.strictEqual(Core.comboTier(5), 3.0, 'L≥4 一律 3.0');
// streakMult：7 连封顶 ×4（模拟校准：参考 AI 最长 streak 中位就是 7）
assert.strictEqual(Core.streakMult(1), 1.0);
assert.strictEqual(Core.streakMult(2), 1.5);
assert.strictEqual(Core.streakMult(7), 4.0, '7 连正好封顶');
assert.strictEqual(Core.streakMult(20), 4.0, '封顶后不再涨');
assert.strictEqual(Core.streakMult(0), 1.0);
// 消除分 = 20 × L × comboTier × streakMult
assert.strictEqual(Core.clearScore(1, 1), 20);
assert.strictEqual(Core.clearScore(2, 1), 60);      // 20×2×1.5×1
assert.strictEqual(Core.clearScore(3, 7), 528);     // 20×3×2.2×4
console.log('test-core: 计分公式 OK');

// ════════ SWEEP 梯度（DESIGN §4）════════
// 奖励挂钩「落子前的已占格数」before ⇒ 清空盘的价值随盘面涨
assert.strictEqual(Core.sweepOf(9, 40), null, '剩 9 格：不触发');
assert.strictEqual(Core.sweepOf(8, 40).kind, 'sweep');
assert.strictEqual(Core.sweepOf(4, 40).kind, 'deep');
assert.strictEqual(Core.sweepOf(0, 40).kind, 'perfect');
assert.strictEqual(Core.sweepOf(0, 40).score, 40 * 30 + 300, 'PERFECT = before×30 + 300');
// ⚠ 开局白嫖必须被堵死：盘面不到 16 格时一律不给 SWEEP。
// （没有这道门槛时：开局空盘顺手清掉 8 格 = 8×30+300 = 540 分 ≈ 中位一局总分的 1/3，
//   是可稳定复现的刷分套路 —— 这条断言就是当初抓出它的那条。）
assert.strictEqual(Core.sweepOf(0, 8), null, '开局小盘清空：不给奖励');
assert.strictEqual(Core.sweepOf(0, 15), null, '盘面 15 格：仍在门槛下');
assert(Core.sweepOf(0, 16), '盘面 16 格起：才算壮举');
assert(Core.sweepOf(0, 48).score > Core.sweepOf(0, 16).score * 2,
  '清一个满盘 ≫ 清一个刚过门槛的盘');
console.log('test-core: SWEEP 梯度 + 开局白嫖门槛 OK');

// ════════ PERFECT CLEAR 必须**真的可达**（不能是永远拿不到的成就）════════
// 模拟跑 1200 局，参考 AI 一次都没触发过 PERFECT（SWEEP_FLOOR=16 挡掉了「开局小盘白嫖」之后，
// 真正的清空极其稀有）。所以必须用构造盘面证明：它是稀有，不是死代码。
{
  const s = Core.newGame(1);
  // 造一个 before ≥ 16、且一步能全清的盘面：
  // 第 0 行填满 7 格（差 (0,7)）、第 7 列填满 7 格（差 (0,7)）—— 它们共用那一个空格。
  // 放下 1×1 到 (0,7) ⇒ 第 0 行 + 第 7 列同时满 ⇒ 两条一起消 ⇒ 盘面清空。
  const b = blank();
  for (let c = 0; c < 7; c++) b[Core.idx(0, c)] = 1;      // 行 0：7 格
  for (let r = 1; r < 8; r++) b[Core.idx(r, 7)] = 1;      // 列 7：7 格
  s.board = b;
  const before = Core.fillCount(s.board);
  assert.strictEqual(before, 14, '构造盘 14 格');
  // 14 < SWEEP_FLOOR(16) ⇒ 该门槛下不给奖励。再加两格垫高到 16，且不破坏「一步全清」：
  // 放在行0/列7 上即可（它们都会被消掉）——但行0只剩 (0,7) 一个空位。
  // 改用：把 (1,7)…(7,7) 之外再垫 2 格在第 0 行是不行的（已满）。
  // ⇒ 正解：让被消的两条线更长——用行 0 + 行 1 + 列 7 三条线交汇。
  const b2 = blank();
  for (let c = 0; c < 7; c++) { b2[Core.idx(0, c)] = 1; b2[Core.idx(1, c)] = 1; }   // 行0/行1：各 7 格
  for (let r = 2; r < 8; r++) b2[Core.idx(r, 7)] = 1;                                // 列7：6 格
  // 还差 (0,7) 和 (1,7) 两格 —— 用一个 2×1 竖条一次补上 ⇒ 行0、行1、列7 三条同时满 ⇒ 全清
  s.board = b2;
  const before2 = Core.fillCount(s.board);
  assert.strictEqual(before2, 20, '构造盘 20 格（已过 SWEEP_FLOOR）');
  const piece = P('i2v');                                  // 2×1 竖条
  assert(Core.canPlace(s.board, piece, 0, 7), '竖条能放进 (0,7)');
  // 直接走消除+SWEEP 的判定逻辑（不经 tray，因为块流未必给我们这块）
  const test = s.board.slice();
  for (const [dr, dc] of piece.cells) test[Core.idx(0 + dr, 7 + dc)] = 1;
  const f = Core.findFullLines(test);
  assert.strictEqual(f.rows.length + f.cols.length, 3, '行0+行1+列7 三条同时满');
  for (const r of f.rows) for (let c = 0; c < 8; c++) test[Core.idx(r, c)] = 0;
  for (const c of f.cols) for (let r = 0; r < 8; r++) test[Core.idx(r, c)] = 0;
  const left = Core.fillCount(test);
  assert.strictEqual(left, 0, '盘面被清空');
  const sw = Core.sweepOf(left, before2);
  assert(sw && sw.kind === 'perfect', 'PERFECT CLEAR 可达（稀有，但不是死代码）');
  assert.strictEqual(sw.score, 20 * 30 + 300);
  console.log('test-core: PERFECT CLEAR 可达性 OK（构造盘面证明）');
}

// ════════ 落子 → 消行 → 计分 全流程 ════════
s = Core.newGame(1);
s.board = rowAlmostFull(blank(), 0, 0);            // 第 0 行只差 (0,0)
s.placed = [false, false, false];
// 找一个 1×1 塞进 tray：直接改块流不现实 ⇒ 用 place() 的前置条件测：
// 造一个能一步消掉整行的情形：把 tray[0] 换成已知块需要改 Dealer，
// 所以这里改用「构造盘面 + 用 tray 里真实的块」来测 —— 找到能落进 (0,0) 的块
let s2 = Core.newGame(1);
s2.board = blank();
const t0 = Core.tray(s2)[0];
const evs = Core.place(s2, 0, 0, 0);
assert(evs, '合法落子返回事件');
assert.strictEqual(evs[0].t, 'place');
assert.strictEqual(s2.score, t0.size, '落子分 = 格子数');
assert.strictEqual(Core.fillCount(s2.board), t0.size);
assert.strictEqual(Core.tray(s2)[0], null, '放过的槽位变空');
// 非法落子：同一位置再放一次
assert.strictEqual(Core.place(s2, 1, 0, 0) === null || Core.canPlace(s2.board, Core.tray(s2)[1], 0, 0), true);
console.log('test-core: 落子流程 OK');

// ════════ streak 断裂需要「连续 2 次零消除」（DESIGN §3 的容错）════════
s = Core.newGame(7);
s.streak = 5; s.dryTurns = 0;
s.board = blank();
// 手工模拟：第 1 次零消除 → streak 保持；第 2 次 → 归零
s.dryTurns = 1;                                     // 相当于刚经历 1 次零消除
assert.strictEqual(s.streak, 5, '宽限中：streak 保持不变');
s.dryTurns = 2;
if (s.dryTurns >= 2) s.streak = 0;
assert.strictEqual(s.streak, 0, '连续 2 次零消除 → 断');
// 用真实 place 验一遍（找一个不会消行的空盘落子）
let s3 = Core.newGame(3);
s3.streak = 4;
Core.place(s3, 0, 0, 0);                            // 空盘落子必不消行
assert.strictEqual(s3.dryTurns, 1);
assert.strictEqual(s3.streak, 4, '第 1 次零消除：streak 不变（宽限）');
Core.place(s3, 1, 4, 4);                            // 再一次零消除
assert.strictEqual(s3.dryTurns, 2);
assert.strictEqual(s3.streak, 0, '第 2 次零消除：streak 归零');
console.log('test-core: streak 宽限与断裂 OK');

// ════════ 补牌：三块全放完才补（唯一时机）════════
s = Core.newGame(11);
const idx0 = s.streamIndex;
Core.place(s, 0, 0, 0);
assert.strictEqual(s.streamIndex, idx0, '放 1 块不补牌');
assert.strictEqual(Core.remaining(s).length, 2);
// 放完剩下两块（找合法位置）
for (const slot of [1, 2]) {
  const p = Core.tray(s)[slot];
  const ps = Core.placements(s.board, p);
  assert(ps.length, '应有落点');
  Core.place(s, slot, ps[0][0], ps[0][1]);
}
assert.strictEqual(s.streamIndex, idx0 + 3, '三块全放完 → 补下一手');
assert.strictEqual(Core.remaining(s).length, 3, '新的一手 3 块');
console.log('test-core: 补牌时机 OK');

// ════════ game over = 剩余的**每一块**都无处可放（不是「任一块」！）════════
// ⚠ 这条最初写错了：写成「任一块放不下就结束」。真实玩法里，托盘剩 2 块、一块能放一块不能时，
//   玩家有权先放能放的那块 —— 那一步可能消掉一行、腾出空间，卡住的块就又能放了。
s = Core.newGame(5);
s.board = blank();
s.placed = [true, true, false];
assert(!Core.isOver(s), '空盘上还剩一块放得下 → 不结束');
s.placed = [true, true, true];
assert(!Core.isOver(s), '刚好全放完（等补牌）→ 不是 game over');

// 关键用例：一块放得下、一块放不下 ⇒ **不能**判死
{
  const t = Core.newGame(5);
  const b = blank();
  // 填成只剩第 7 行的 8 个格子是空的（其余全满）：1×1 放得下，3×3 放不下
  for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) b[Core.idx(r, c)] = 1;
  t.board = b;
  assert(Core.canPlaceAnywhere(t.board, P('i1')), '1×1 放得下');
  assert(!Core.canPlaceAnywhere(t.board, P('sq3')), '3×3 放不下');
  // 手工构造「剩余 = [1×1, 3×3]」的局面并直接考察规则函数
  const remOk = [P('i1'), P('sq3')];
  const allStuck = remOk.every(p => !Core.canPlaceAnywhere(t.board, p));
  assert(!allStuck, '一块能放一块不能 ⇒ 还没结束（要让玩家先放能放的那块）');
}

// 真死：所有剩余块都放不下
{
  const t = Core.newGame(5);
  const b = blank().fill(1);
  b[Core.idx(0, 0)] = 0;                            // 全满，只剩一个孤格
  t.board = b;
  const rem = [P('sq3'), P('o4'), P('i2h')];        // 三块都塞不进那一个孤格
  assert(rem.every(p => !Core.canPlaceAnywhere(t.board, p)), '所有块都放不下 ⇒ 才是 game over');
}

// 端到端：消行会「救活」卡住的块 —— 放下能放的那块 → 消掉一行 → 原本放不下的块又能放了
{
  const t = Core.newGame(5);
  const b = blank();
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) b[Core.idx(r, c)] = 1;  // 前 6 行填满
  for (let c = 1; c < 8; c++) b[Core.idx(6, c)] = 1;                              // 第 6 行差 (6,0)
  t.board = b;
  assert(!Core.canPlaceAnywhere(t.board, P('sq3')), '此刻 3×3 放不下');
  // 放一个 1×1 到 (6,0) → 第 6 行满 → 消掉 → 腾出一整行
  for (const [dr, dc] of P('i1').cells) t.board[Core.idx(6 + dr, 0 + dc)] = 1;
  const f = Core.findFullLines(t.board);
  for (const r of f.rows) for (let c = 0; c < 8; c++) t.board[Core.idx(r, c)] = 0;
  assert(Core.canPlaceAnywhere(t.board, P('sq3')), '消行腾出空间后，3×3 又放得下了 —— 提前判死就是错杀');
}
console.log('test-core: game-over 判定（全部放不下才算死 + 消行能救活卡住的块）OK');

// ════════ 撤销：精确复原，且**不能刷块**（撤销必须回滚 streamIndex）════════
s = Core.newGame(2024);
// 走几步
for (let k = 0; k < 4; k++) {
  const t = Core.tray(s);
  const slot = t.findIndex(Boolean);
  const p = t[slot];
  const ps = Core.placements(s.board, p);
  if (!ps.length) break;
  Core.place(s, slot, ps[0][0], ps[0][1]);
}
const snap = Core.snapshot(s);
const trayBefore = Core.tray(s).map(p => p && p.id);
// 再走一步（可能触发补牌）
const t = Core.tray(s);
const slot = t.findIndex(Boolean);
const ps = Core.placements(s.board, t[slot]);
Core.place(s, slot, ps[0][0], ps[0][1]);
// 撤销
assert(Core.undo(s), '撤销成功');
assert.deepStrictEqual(s.board, snap.board, '棋盘精确复原');
assert.strictEqual(s.score, snap.score, '分数复原');
assert.strictEqual(s.streak, snap.streak, 'streak 复原');
assert.strictEqual(s.dryTurns, snap.dryTurns);
assert.strictEqual(s.streamIndex, snap.streamIndex, '⚠ streamIndex 复原（否则撤销 = 刷块外挂）');
assert.deepStrictEqual(Core.tray(s).map(p => p && p.id), trayBefore, '撤销后托盘是同样的块，不是新抽的');
console.log('test-core: 撤销精确复原（含 streamIndex，不能刷块）OK');

// ════════ 撤销后重放同样的操作 → 结果逐字节一致 ════════
s = Core.newGame(99);
const path = [];
for (let k = 0; k < 6; k++) {
  const tr = Core.tray(s);
  const sl = tr.findIndex(Boolean);
  const pl = Core.placements(s.board, tr[sl]);
  if (!pl.length) break;
  path.push([sl, pl[0][0], pl[0][1]]);
  Core.place(s, sl, pl[0][0], pl[0][1]);
}
const finalBoard = s.board.slice(), finalScore = s.score, finalIdx = s.streamIndex;
// 重来一局，走同样的路径
let s4 = Core.newGame(99);
for (const [sl, r, c] of path) Core.place(s4, sl, r, c);
assert.deepStrictEqual(s4.board, finalBoard, '同种子 + 同操作 = 同棋盘');
assert.strictEqual(s4.score, finalScore, '同种子 + 同操作 = 同分数');
assert.strictEqual(s4.streamIndex, finalIdx);
console.log('test-core: 同种子同操作完全可复现 OK');

// ════════ 🧱 礼包手（激励视频「送三个单格块」）════════
// ⛔ 最重要的一条：它**绝不碰块流** —— 用完之后从原来那一块继续，一块不差、一块不换。
{
  const s = Core.newGame(31337);
  const streamBefore = [];
  for (let i = 0; i < 24; i++) streamBefore.push(Dealer.stream(31337, i).id);
  const idxBefore = s.streamIndex;

  assert(Core.grantBonusHands(s, 2), '无尽局可以领礼包手');
  assert.strictEqual(s.bonusHands, 2);
  const tray = Core.tray(s);
  assert.strictEqual(tray.length, 3);
  for (const p of tray) assert.strictEqual(p.id, Core.BONUS_PIECE, '礼包手三格全是 1×1');
  assert.strictEqual(s.streamIndex, idxBefore, '领礼包手不推进块流');

  // 放完第一手礼包 ⇒ bonusHands--，streamIndex 仍不动
  Core.place(s, 0, 0, 0); Core.place(s, 1, 0, 1); Core.place(s, 2, 0, 2);
  assert.strictEqual(s.bonusHands, 1);
  assert.strictEqual(s.streamIndex, idxBefore, '礼包手用掉一手，块流依然一动不动');
  // 放完第二手 ⇒ 回到真实块流，且**正是原来那一手**
  Core.place(s, 0, 1, 0); Core.place(s, 1, 1, 1); Core.place(s, 2, 1, 2);
  assert.strictEqual(s.bonusHands, 0);
  assert.strictEqual(s.streamIndex, idxBefore, '礼包手用完，回到原来那一块');
  assert.deepStrictEqual(Core.tray(s).map(p => p.id),
    [0, 1, 2].map(i => Dealer.stream(31337, idxBefore + i).id),
    '⛔ 礼包手结束后拿到的，正是当初那一手 —— 块流一块没被吃掉');

  const streamAfter = [];
  for (let i = 0; i < 24; i++) streamAfter.push(Dealer.stream(31337, i).id);
  assert.deepStrictEqual(streamAfter, streamBefore, '⛔ 公平承诺：stream(seed,i) 逐块不变');
  console.log('test-core: 礼包手不动块流 OK');
}

// ════════ 礼包手：撤销要回滚、每日/挑战禁用 ════════
{
  const s = Core.newGame(99);
  Core.grantBonusHands(s, 2);
  Core.place(s, 0, 0, 0);
  assert(Core.undo(s), '礼包手期间可以撤销');
  assert.strictEqual(s.bonusHands, 2, '撤销必须把礼包手一起回滚（否则撤销能刷出更多礼包手）');

  const d = Core.newGame(5); d.daily = 20260802;
  assert.strictEqual(Core.grantBonusHands(d, 2), false, '⛔ 每日谜题禁用（同种子分数必须可比）');
  const c = Core.newGame(5); c.challenge = true;
  assert.strictEqual(Core.grantBonusHands(c, 2), false, '⛔ 种子挑战同理');

  // 换一手：礼包手期间只消耗礼包手，同样不推进块流
  const r = Core.newGame(7);
  const i0 = r.streamIndex;
  Core.grantBonusHands(r, 2);
  Core.refreshHand(r);
  assert.strictEqual(r.bonusHands, 1);
  assert.strictEqual(r.streamIndex, i0, '礼包手期间换手不吃块流');
  console.log('test-core: 礼包手的撤销/禁用/换手 OK');
}

// ⚡ 快速放置奖励（2026-08-04）——**纯增益**，四条红线写成测试
{
  // ⚠ 落点必须**真的合法**：place 对非法落子返回 null 且不改状态 ⇒ 手写坐标会让断言
  //   莫名其妙地挂（第一版就踩了）。统一用 placements 取第一个能放的位置。
  const put = (s, slot, now) => {
    const p = Core.tray(s)[slot];
    const ps = Core.placements(s.board, p);
    if (!ps.length) return null;
    return { evs: Core.place(s, slot, ps[0][0], ps[0][1], now), size: p.size };
  };

  // ① 不传 now ⇒ 一分不加、字段不动。这条保住了：模拟器 / 参考 AI / verify-levels
  //    / 所有老测试的行为**一个字节都没变**（sim 的中位分仍落在基线上）。
  const a = Core.newGame(11);
  put(a, 0);
  assert.strictEqual(a.speedChain, 0, '不传时钟 ⇒ 不进速度逻辑');
  const b = Core.newGame(11);
  const r0 = put(b, 0, 1000);
  assert.strictEqual(b.score, r0.size, '第一手没有「上一手」⇒ 只有落子分，不给速度分');

  // ② 连续快手递增；慢一手只是**归零** —— ⛔ 不扣分、不碰 streak
  const c = Core.newGame(12);
  let t = 10000;
  put(c, 0, t);
  const s0 = c.score;
  t += 500;
  const r1 = put(c, 1, t);                       // 快
  assert.strictEqual(c.speedChain, 1, '第二手在 2.5s 内 ⇒ 链 = 1');
  // ⚠ 直接查事件里的 bonus —— 拿 score 相减要扣掉落子分和可能的消行分,容易写成恒等式
  const sp1 = r1.evs.find(e => e.t === 'speed');
  assert.ok(sp1, '快手要发出 speed 事件');
  assert.strictEqual(sp1.bonus, Core.speedBonus(1), '加的分精确等于常量表');
  assert.strictEqual(sp1.chain, 1);

  const beforeStreak = c.streak, before = c.score;
  t += 9000;
  put(c, 2, t);                                   // 慢
  assert.strictEqual(c.speedChain, 0, '慢一手 ⇒ 链归零');
  assert.strictEqual(c.streak, beforeStreak, '⛔ 慢不许断 streak');
  assert.ok(c.score >= before, '⛔ 慢不许扣分（DESIGN §5：奖励快，不惩罚慢）');

  // ③ 撤销要把速度状态一起回滚，否则「撤销→重放」可无限刷分
  const d = Core.newGame(13);
  let dt = 5000;
  put(d, 0, dt);
  dt += 400; put(d, 1, dt);
  const chainAfter = d.speedChain, scoreAfter = d.score;
  assert.ok(chainAfter > 0, '前置：第二手确实吃到了速度分');
  Core.undo(d);
  assert.strictEqual(d.speedChain, 0, '撤销回滚 speedChain');
  dt += 400; put(d, 1, dt);
  assert.strictEqual(d.speedChain, chainAfter, '重放后链与撤销前一致（没被刷高）');
  assert.strictEqual(d.score, scoreAfter, '⛔ 撤销重放不许刷出更多分');

  // ④ ⛔ 每日 / 挑战局**永不给**速度分 —— 那两条赛道承诺「同种子分数可比」，
  //    掺进手速就不是同一道题了（与礼包手同一个先例）。
  for (const mk of [x => { x.daily = 20260804; }, x => { x.challenge = true; }]) {
    const e = Core.newGame(14); mk(e);
    let et = 3000;
    put(e, 0, et);
    const before2 = e.score;
    et += 300;
    const r2 = put(e, 1, et);
    assert.strictEqual(e.speedChain, 0, '每日/挑战：速度链恒 0');
    assert.strictEqual(e.score - before2, r2.size, '每日/挑战：分数里没有速度奖励');
  }
  console.log('test-core: ⚡ 快速放置奖励（纯增益 / 撤销不可刷 / 每日挑战禁用）OK');
}
