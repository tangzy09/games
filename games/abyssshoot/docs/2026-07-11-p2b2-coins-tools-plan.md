# Abyss Shooter P2b-2 —— 金币 + 三道具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补上这游戏最大的体感缺陷——**盘面走坏时你完全无能为力，只能眼睁睁被顶死**。给三个救场道具（🔨 锤子砸块 / 🔀 交换两列 / ↩ 撤销上一发）+ 金币经济。金币也是后面「每日盘送币」与「看激励广告换币」的地基。

**Architecture:** 新增纯逻辑模块 `tools.js`（三个道具的状态变更，双导出可单测）；`core.js` 加**可复现 RNG 游标**（撤销要精确回退随机数，见下）；`storage.js` 加 `coins` + 撤销快照，`SAVE_V` bump；`main.js` 加道具模式状态机与消费；`render.js` 画金币/道具栏/选中态。

**⚠ 三个必须守住的东西**

1. **🔨 锤子砸完必须立刻 `gravityUp`**（`CLAUDE.md` 棋盘模型段早就标了）：棋盘的「**每列从 index0 起密实、无内部空洞**」是**横向连通判定的前提**——`findComponents` 靠「相邻列同 index = 同一绝对行」，而这只有在每列都贴顶密实时才成立。砸出一个空洞不压实 → **连通判定全乱、合并出错，且悄无声息**。砸完还要 `resolve`（移除格子会制造新的相邻，可能触发连锁！）。
2. **撤销必须精确回退随机数**：否则「撤销 → 重射」就能**刷出不同的弹药**（save-scum）。我们的 `rand` 是闭包，读不出内部状态 → 解法：**记 `s.rolls`（rand 被调用的次数）**，撤销时用 `PRNG.create(seed)` 重建并**空转 rolls 次**快进到原位。精确、开销可忽略（一局才几百次）。
   - **顺带白拿一个改进**：`storage.snapshotRun` 现在靠**换新种子**恢复，意味着**刷新页面就能重摇弹药**（save-scum）。有了 `seed + rolls` 就能**精确恢复** → 刷新不再能刷弹药。一并改掉。
3. **`SAVE_V` bump 到 2**（加了 `coins`，且 run 快照结构变了）。旧档一律丢弃不迁移（root CLAUDE.md 铁律）。

**金币经济（蒙特卡洛定的，非拍脑袋）**
- **来源**：`合并数 × 1 + 连锁(chain≥2) × 5 + 梯顶游走 × 50`。
  - 为什么不用分数：分数是**指数级**的（`V×2^(N-1)`），高手一局能滚到 10 万分 → 用分数换币会让高手**暴富、道具免费**。实测跨水平差 **11 倍**；改用「合并/连锁」计价只差 **3 倍**，技巧仍被奖励但不失控。
- **定价**：撤销 **30** / 锤子 **60** / 交换 **80**。中位一局（随机瞎打的**下限**）攒 **130 币** → 够用约 2 次；金币**跨局累积**。
- 这些都是可调钮，写在 `tools.js` 顶部。

**必读**：`games/abyssshoot/CLAUDE.md`（**五条核心规则 + 棋盘密实不变式**）、`games/abyssshoot/js/{core,storage,main,render}.js`、`games/snake/js/main.js`（道具/模式态的 DOM+canvas 混合处理参考）。

**⚠ 改了 js → `index.html` 所有 `?v=4` 统一改 `?v=5`**（部署铁律）。

---

## 文件结构

- 修改 `games/abyssshoot/js/core.js` —— RNG 游标（`s.seed`/`s.rolls`/`restoreRand`）。
- 新建 `games/abyssshoot/js/tools.js` —— 三个道具的纯逻辑 + 价格 + 金币计算。双导出。
- 修改 `games/abyssshoot/js/storage.js` —— `coins`、`SAVE_V=2`、快照带 `seed/rolls`（精确恢复）。
- 修改 `games/abyssshoot/js/main.js` —— 道具模式状态机、金币结算、撤销快照。
- 修改 `games/abyssshoot/js/render.js` —— 金币 HUD、道具栏、选中/瞄准态。
- 新建 `games/abyssshoot/tests/test-tools.js` —— 道具单测（**含密实不变式硬断言**）。
- 修改 `games/abyssshoot/tests/test-core.js` —— RNG 游标可复现断言。
- 修改 `games/abyssshoot/tests/test-storage.js` —— SAVE_V=2、精确恢复。
- 修改 `games/abyssshoot/tests/e2e-p1b.cjs` —— 道具 UI 流程 + 截图。
- 修改 `games/abyssshoot/index.html`、`css/game.css`、`locales/{en,zh-CN}.json`、root `package.json`。

---

## Task 1: core —— 可复现 RNG 游标（撤销与精确续玩的地基）

**Files:**
- Modify: `games/abyssshoot/js/core.js`
- Test: `games/abyssshoot/tests/test-core.js`

- [ ] **Step 1: 写失败测试**

Append to `games/abyssshoot/tests/test-core.js`（在末尾 `console.log` 之前）：

```javascript
// ── P2b-2: 可复现 RNG 游标(撤销/精确续玩的地基) ──
// rand 是闭包,读不出内部状态。解法:记录 rand 被调用的次数(rolls),
// 需要回退时用同一个 seed 重建并空转 rolls 次,快进到原位。
s = Core.createGame({ seed: 7 });
assert.strictEqual(s.seed, 7, 'seed 存在 state 上');
assert.strictEqual(typeof s.rolls, 'number', 'rolls 计数存在');
const rolls0 = s.rolls;
assert(rolls0 > 0, 'createGame 里生成弹药/预览已经摇过随机数');

// 摇 5 次,rolls 应精确 +5
const before = s.rolls;
for (let k = 0; k < 5; k++) s.rand();
assert.strictEqual(s.rolls, before + 5, 'rand 每调一次 rolls 加一');

// 精确回退:重建到某个 rolls,后续序列必须与原轨迹逐个相同
const g1 = Core.createGame({ seed: 42 });
for (let k = 0; k < 13; k++) g1.rand();
const mark = g1.rolls;
const expect = [g1.rand(), g1.rand(), g1.rand()];      // 记下接下来 3 个数

const g2 = Core.createGame({ seed: 42 });
Core.restoreRand(g2, 42, mark);                        // 快进到同一位置
assert.strictEqual(g2.rolls, mark, 'restoreRand 后 rolls 对齐');
const got = [g2.rand(), g2.rand(), g2.rand()];
assert.deepStrictEqual(got, expect, '回退后的随机序列必须与原轨迹逐个相同(否则撤销能刷弹药)');

// 整局中途回退:盘面+rolls 一起还原,后续弹药必须完全一致
const a1 = Core.createGame({ seed: 5 });
for (let k = 0; k < 8; k++) Core.shoot(a1, k % a1.cols);
const snapRolls = a1.rolls, snapBoard = Core.snapBoard(a1), snapAmmo = a1.ammo, snapQueue = a1.queue.slice();
const nextAmmos = [];
for (let k = 0; k < 4; k++) { Core.shoot(a1, 0); nextAmmos.push(a1.ammo); }

const a2 = Core.createGame({ seed: 5 });
Core.restoreRand(a2, 5, snapRolls);
a2.board = snapBoard.map(c => c.slice()); a2.ammo = snapAmmo; a2.queue = snapQueue.slice();
const nextAmmos2 = [];
for (let k = 0; k < 4; k++) { Core.shoot(a2, 0); nextAmmos2.push(a2.ammo); }
assert.deepStrictEqual(nextAmmos2, nextAmmos, '回退到同一 rolls 后,后续弹药序列完全一致');
console.log('test-core: RNG 游标可复现 OK(撤销不能刷弹药)');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-core.js`
Expected: FAIL — `seed 存在 state 上` 或 `rolls 计数存在`

- [ ] **Step 3: 改 core.js**

(a) `createGame` 里，把 `rand` 换成**带计数的包装**（`seed` 已有，确认存下）：

```javascript
function createGame(opts = {}) {
  const cols = opts.cols || 5, rows = opts.rows || 9;
  const seed = opts.seed == null ? 1 : opts.seed;
  const s = {
    cols, rows, seed,
    rolls: 0,                       // rand 被调用的次数(撤销/精确续玩靠它回退)
    rand: null,
    board: Array.from({ length: cols }, () => []),
    score: 0, maxTile: 0,
    shots: 0, shotsSinceSpawn: 0,
    dead: false, events: [],
    ammo: 0, queue: [],
  };
  attachRand(s, seed, 0);
  s.ammo = genAmmo(s);
  for (let k = 0; k < PREVIEW; k++) s.queue.push(genAmmo(s));
  return s;
}
```

(b) 加两个函数（放在 `createGame` 上方）：

```javascript
// rand 是闭包,内部状态读不出来。所以记「调用次数」(rolls),
// 要回退时用同一 seed 重建、空转 rolls 次快进到原位 —— 精确,且一局才几百次,开销可忽略。
// ⚠ 没有这个,撤销就等于「重摇弹药」(save-scum);页面刷新续玩同理。
function attachRand(s, seed, rolls) {
  const base = PRNG_.create(seed);
  for (let k = 0; k < rolls; k++) base();     // 快进
  s.seed = seed;
  s.rolls = rolls;
  s.rand = () => { s.rolls++; return base(); };
}
function restoreRand(s, seed, rolls) { attachRand(s, seed, rolls); return s; }
```

(c) 导出里加上：

```javascript
const Core = { createGame, attachRand, restoreRand, genAmmo, spawnTile, smallestTile, boardValues,
  pickFromBoard, gravityUp, findComponents, resolve, spawnRow, shoot, snapBoard,
  PREVIEW, SPAWN_EVERY, TILE_MIN, AMMO_BIAS, SPAWN_BIAS };
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-core.js`
Expected: PASS，含 `test-core: RNG 游标可复现 OK`

- [ ] **Step 5: 跑蒙特卡洛确认玩法没变**

Run: `node games/abyssshoot/tests/test-sim.js`
Expected: 局长分布与之前**基本一致**（中位 ~62）。若大变说明误改了规则。

- [ ] **Step 6: 提交**

```bash
git add games/abyssshoot/js/core.js games/abyssshoot/tests/test-core.js
git commit -m "feat(abyssshoot): core 可复现 RNG 游标(seed+rolls),撤销/续玩不能刷弹药"
```

---

## Task 2: tools.js —— 三个道具的纯逻辑（含密实不变式）

**Files:**
- Create: `games/abyssshoot/js/tools.js`
- Test: `games/abyssshoot/tests/test-tools.js`

- [ ] **Step 1: 写失败测试**

Create `games/abyssshoot/tests/test-tools.js`:

```javascript
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

console.log('test-tools OK');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-tools.js`
Expected: FAIL — `Cannot find module '../js/tools.js'`

- [ ] **Step 3: 写实现**

Create `games/abyssshoot/js/tools.js`:

```javascript
// tools.js — 三个救场道具 + 金币经济(纯逻辑,双导出)。
// ⚠ 命名:浏览器全局词法环境共享,core.js 已用 PRNG_/TILES_,storage 用 PRNG_S_,
//   codex 用 TILES_C_ —— 这里用 CORE_T_,别再撞。
const CORE_T_ = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;

// 价格(可调钮)。蒙特卡洛:随机瞎打中位一局攒 130 币 → 够用约 2 次;金币跨局累积。
const COST = { undo: 30, hammer: 60, swap: 80 };

// 金币来源(可调钮)。⚠ 不用分数计价:分数是指数级的(V×2^(N-1)),高手一局能滚到 10 万分,
// 用分数换币会让高手暴富、道具免费(实测跨水平差 11 倍)。改用「合并/连锁」只差 3 倍,
// 技巧仍被奖励但不失控。
const COIN = { merge: 1, chain: 5, escape: 50 };

function coinsFor(events) {
  let c = 0;
  for (const e of events || []) {
    if (e.t === 'merge') c += COIN.merge;
    else if (e.t === 'chain') c += COIN.chain;
    else if (e.t === 'escape') c += COIN.escape;
  }
  return c;
}

// 🔨 锤子:砸掉 (col, i) 那一格。
// ⚠⚠ 砸完必须立刻 gravityUp —— 棋盘的「每列从 index0 起密实、无空洞」是**横向连通判定的前提**
//    (findComponents 靠「相邻列同 index = 同一绝对行」,只有贴顶密实时才成立)。
//    砸出空洞不压实 → 连通判定全乱、合并出错,而且悄无声息。
// ⚠  砸完还要 resolve:移除格子会制造新的相邻,可能触发连锁(测试有断言)。
function hammer(s, col, i) {
  s.events = [];
  if (s.dead) return { ok: false };
  if (!(col >= 0 && col < s.cols)) return { ok: false };
  if (!(i >= 0 && i < s.board[col].length)) return { ok: false };
  const v = s.board[col][i];
  s.board[col][i] = 0;
  CORE_T_.gravityUp(s);                       // 密实不变式:必须立刻重压实
  s.events.push({ t: 'hammer', c: col, i, v });
  CORE_T_.resolve(s);                          // 移除可能制造新相邻 → 连锁
  return { ok: true, v };
}

// 🔀 交换两列(整列对调)。换完可能形成新的横向连通 → 必须 resolve。
function swap(s, a, b) {
  s.events = [];
  if (s.dead) return { ok: false };
  if (a === b) return { ok: false };
  if (!(a >= 0 && a < s.cols) || !(b >= 0 && b < s.cols)) return { ok: false };
  const t = s.board[a]; s.board[a] = s.board[b]; s.board[b] = t;
  s.events.push({ t: 'swap', a, b });
  CORE_T_.resolve(s);
  return { ok: true };
}

// ↩ 撤销:快照 / 回滚。
// ⚠ 必须连 RNG 游标(seed+rolls)一起存/还原,否则「撤销→重射」= 重摇弹药(save-scum)。
function snapshot(s) {
  return {
    board: CORE_T_.snapBoard(s),
    ammo: s.ammo, queue: s.queue.slice(),
    score: s.score, maxTile: s.maxTile,
    shots: s.shots, shotsSinceSpawn: s.shotsSinceSpawn,
    seed: s.seed, rolls: s.rolls,
  };
}
function undo(s, snap) {
  if (!snap) return { ok: false };
  s.board = snap.board.map(c => c.slice());
  s.ammo = snap.ammo; s.queue = snap.queue.slice();
  s.score = snap.score; s.maxTile = snap.maxTile;
  s.shots = snap.shots; s.shotsSinceSpawn = snap.shotsSinceSpawn;
  s.dead = false;
  s.events = [{ t: 'undo' }];
  CORE_T_.restoreRand(s, snap.seed, snap.rolls);   // 精确回退随机数
  return { ok: true };
}

const Tools = { COST, COIN, coinsFor, hammer, swap, snapshot, undo };
if (typeof module !== 'undefined' && module.exports) module.exports = Tools;
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-tools.js`
Expected: PASS — `test-tools OK`

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/tools.js games/abyssshoot/tests/test-tools.js
git commit -m "feat(abyssshoot): tools 三道具(锤子/交换列/撤销)+金币经济,含密实不变式断言"
```

---

## Task 3: storage —— coins + SAVE_V=2 + 精确恢复（顺带堵掉刷新刷弹药）

**Files:**
- Modify: `games/abyssshoot/js/storage.js`
- Test: `games/abyssshoot/tests/test-storage.js`

- [ ] **Step 1: 追加失败测试**

Append to `games/abyssshoot/tests/test-storage.js`（在末尾 `console.log` 之前）：

```javascript
// --- P2b-2: coins + SAVE_V=2 ---
assert.strictEqual(Storage.SAVE_V, 2, 'SAVE_V bump 到 2(加了 coins、快照结构变了)');
b = mem();
s = Storage.load(b, 'k');
assert.strictEqual(s.coins, 0, '新档金币为 0');
s.coins = 250;
Storage.save(b, 'k', s);
assert.strictEqual(Storage.load(b, 'k').coins, 250, '金币存得住');

// --- ⚠ 快照带 seed+rolls → 精确恢复(刷新页面不能重摇弹药) ---
const gg = Core.createGame({ seed: 11 });
for (let k = 0; k < 5; k++) Core.shoot(gg, k % gg.cols);
const snap2 = Storage.snapshotRun(gg);
assert.strictEqual(snap2.seed, gg.seed, '快照带 seed');
assert.strictEqual(snap2.rolls, gg.rolls, '快照带 rolls');
const rr = Storage.restoreRun(JSON.parse(JSON.stringify(snap2)));
assert.strictEqual(rr.rolls, gg.rolls, '恢复后 rolls 对齐');
// 恢复后继续射,弹药序列必须与「没保存过」完全一致
const gg2 = Core.createGame({ seed: 11 });
for (let k = 0; k < 5; k++) Core.shoot(gg2, k % gg2.cols);
const amA = [], amB = [];
for (let k = 0; k < 4; k++) { Core.shoot(gg2, 1); amA.push(gg2.ammo); }
for (let k = 0; k < 4; k++) { Core.shoot(rr, 1); amB.push(rr.ammo); }
assert.deepStrictEqual(amB, amA,
  '续玩后的弹药序列必须与没存过一模一样 —— 否则刷新页面就能重摇弹药(save-scum)');
console.log('test-storage: coins + 精确恢复 OK');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-storage.js`
Expected: FAIL — `SAVE_V bump 到 2`

- [ ] **Step 3: 改 storage.js**

- `const SAVE_V = 2;`
- `defaults()` 里加 `coins: 0,`（放在 `best` 之后）。
- `snapshotRun(s)`：把 `seed2: Math.floor(Math.random()*...)` **删掉**，改成带 `seed: s.seed, rolls: s.rolls`。
- `restoreRun(snap)`：校验 `Number.isFinite(snap.seed) && Number.isFinite(snap.rolls) && snap.rolls >= 0`，不合格返回 `null`；构造返回对象时用 `CORE_S_.attachRand(obj, snap.seed, snap.rolls)` 精确恢复（需要在 storage.js 顶部引入 core，命名避开已用的：`const CORE_S_ = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : Core;`）。
  - ⚠ 浏览器加载顺序：`core.js` 在 `storage.js` **之前**（见 index.html），所以浏览器里 `Core` 全局已存在，安全。

> 注：删掉 `seed2` 后 `snapshotRun` 里就**不再有 `Math.random`**——这也顺手把「唯一豁免」那条特例消掉了。

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-storage.js`
Expected: PASS，含 `test-storage: coins + 精确恢复 OK`

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/storage.js games/abyssshoot/tests/test-storage.js
git commit -m "feat(abyssshoot): storage coins + SAVE_V=2 + 精确恢复(刷新不能重摇弹药)"
```

---

## Task 4: locales —— 道具文案

**Files:**
- Modify: `games/abyssshoot/locales/en.json`、`locales/zh-CN.json`

- [ ] **Step 1: 两个 locale 都加 `tools` 块**（嵌套结构！）

en:
```json
  "tools": {
    "coins": "Coins",
    "hammer": "Smash",
    "swap": "Swap",
    "undo": "Undo",
    "hammerHint": "Tap a fish to smash it",
    "swapHint": "Tap two columns to swap them",
    "needCoins": "Not enough coins",
    "cancel": "Cancel"
  }
```
zh-CN:
```json
  "tools": {
    "coins": "金币",
    "hammer": "锤子",
    "swap": "换列",
    "undo": "撤销",
    "hammerHint": "点一条鱼把它砸掉",
    "swapHint": "点两列交换它们",
    "needCoins": "金币不够",
    "cancel": "取消"
  }
```

- [ ] **Step 2: 校验**

Run: `node tools/check-locales.js games/abyssshoot/locales`
Expected: `0 fail`

- [ ] **Step 3: 提交**

```bash
git add games/abyssshoot/locales/en.json games/abyssshoot/locales/zh-CN.json
git commit -m "feat(abyssshoot): locales 道具文案"
```

---

## Task 5: main.js —— 道具模式状态机 + 金币结算 + 撤销快照

**Files:**
- Modify: `games/abyssshoot/js/main.js`

- [ ] **Step 1: G 加道具状态**

```javascript
  tool: null,        // null | 'hammer' | 'swap'  —— 道具瞄准模式
  swapFirst: null,   // 交换列:已选的第一列
  undoSnap: null,    // 上一发之前的快照(撤销用)
```

`newGame()` 里重置这三个（`G.tool = null; G.swapFirst = null; G.undoSnap = null;`）。

- [ ] **Step 2: 金币结算接进 afterShot**

```javascript
function afterShot() {
  if (!G.save) return;
  G.save.coins += Tools.coinsFor(G.s.events);      // 合并×1 + 连锁×5 + 梯顶游走×50
  Codex.record(G.save, G.s);
  ...（其余不变）
}
```

- [ ] **Step 3: SHOOT 之前存撤销快照**

```javascript
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      if (G.tool) break;                            // 道具瞄准中,不许射击
      G.undoSnap = Tools.snapshot(G.s);             // 射击前快照(撤销用)
      Core.shoot(G.s, data.col);
      afterShot();
      startAnim(G.s.events);
      return;
    }
```

- [ ] **Step 4: 道具动作**

```javascript
    // 点道具按钮:进入瞄准模式(撤销是即时的,不用瞄准)
    case 'TOOL': {
      if (G.phase !== 'PLAYING' || G.anim) break;
      const k = data.k;
      if (G.save.coins < Tools.COST[k]) { toast(T('tools.needCoins')); break; }
      if (k === 'undo') {
        if (!G.undoSnap) break;                     // 还没射过,没得撤
        Tools.undo(G.s, G.undoSnap);
        G.undoSnap = null;                          // 单步撤销:用掉就没了
        G.save.coins -= Tools.COST.undo;
        Sfx.play('undo'); persist();
        break;
      }
      G.tool = (G.tool === k) ? null : k;           // 再点一次取消
      G.swapFirst = null;
      break;
    }
    // 瞄准模式下点格子/列
    case 'TOOL_CELL': {                             // 锤子:点一条鱼
      if (G.tool !== 'hammer') break;
      const r = Tools.hammer(G.s, data.c, data.i);
      if (!r.ok) break;
      G.save.coins -= Tools.COST.hammer;
      G.tool = null;
      afterToolUse();
      return;
    }
    case 'TOOL_COL': {                              // 交换:点两列
      if (G.tool !== 'swap') break;
      if (G.swapFirst == null) { G.swapFirst = data.col; break; }
      if (G.swapFirst === data.col) { G.swapFirst = null; break; }
      const r = Tools.swap(G.s, G.swapFirst, data.col);
      G.swapFirst = null;
      if (!r.ok) break;
      G.save.coins -= Tools.COST.swap;
      G.tool = null;
      afterToolUse();
      return;
    }
    case 'TOOL_CANCEL': G.tool = null; G.swapFirst = null; break;
```

道具用完的收尾（与射击类似，但**不存撤销快照**——道具是深思熟虑的操作，且金币已花）：

```javascript
// 道具用完:道具本身可能触发连锁 → 走同一套动画/结算
function afterToolUse() {
  G.undoSnap = null;                 // 道具改了盘面,旧的射击快照作废(否则撤销会回到错误状态)
  if (G.save) {
    G.save.coins += Tools.coinsFor(G.s.events);   // 道具触发的连锁照常给币
    Codex.record(G.save, G.s);
    if (G.s.maxTile > G.save.best.maxTile) G.save.best.maxTile = G.s.maxTile;
    if (G.s.score > G.save.best.score) { G.save.best.score = G.s.score; G.newRecord = true; }
    persist();
  }
  startAnim(G.s.events);
}
```

> ⚠ **`G.undoSnap = null` 这行是必须的**：道具改了盘面之后，那份「上一发之前」的快照已经**对不上现在的状态**了；不清掉，玩家撤销就会回到一个**错误的过去**（盘面倒退但金币/道具效果还在）。

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/main.js
git commit -m "feat(abyssshoot): main 道具模式状态机+金币结算+撤销快照"
```

---

## Task 6: render.js —— 金币 HUD + 道具栏 + 瞄准态

**Files:**
- Modify: `games/abyssshoot/js/render.js`

- [ ] **Step 1: HUD 加金币；棋盘下方加三个道具按钮**

- HUD 右侧「最深」下面加一行 `🪙 {coins}`。
- 炮台行**下方**加一排三个按钮（锤子/换列/撤销），每个显示 **图标 + 价格**；金币不够时**画成灰色**且不 `addHit`（点不动）。
- `G.tool` 非空时：
  - **锤子模式**：每个鱼格 `addHit(..., 'TOOL_CELL', {c,i})`，并给所有鱼格画一层**可点高亮描边**；顶部显示 `T('tools.hammerHint')`。
  - **交换模式**：每列 `addHit(..., 'TOOL_COL', {col})`；已选的第一列画**高亮边框**；顶部显示 `T('tools.swapHint')`。
  - 屏幕任意其它位置 `addHit(...,'TOOL_CANCEL')` 兜底可取消。
  - ⚠ **瞄准模式下不要再 addHit 射击热区**（否则点一下既射击又用道具）。
- 布局要重算：`layout()` 的竖向预算从 `rows + 2.1` 改成 `rows + 3.1`（多一行道具栏），并保持 `Math.max(8, ...)` 下限。

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/render.js
git commit -m "feat(abyssshoot): render 金币 HUD + 道具栏 + 瞄准高亮"
```

---

## Task 7: 音效 + index.html + css

**Files:**
- Modify: `games/abyssshoot/tools/gen-sfx.js`（加 3 个音效）、`index.html`、`css/game.css`

- [ ] **Step 1: 加三个道具音效**

在 `tools/gen-sfx.js` 的 `SFX` 里加：
```javascript
  hammer:  mix(tone(180, 60, 0.18, 0.5), noise(0.08, 0.18)),   // 砸:闷响+碎裂
  swap:    concat(tone(400, 600, 0.08, 0.35), tone(600, 400, 0.08, 0.35)),  // 换:来回
  undo:    tone(520, 300, 0.16, 0.36),                          // 撤销:下滑
```
Run: `node games/abyssshoot/tools/gen-sfx.js`
Expected: 9 个 wav（原 6 + 新 3），每个 > 3KB。

- [ ] **Step 2: index.html**

- `GAME_CONFIG.sfx` 加 `hammer/swap/undo` 三项。
- 脚本加载顺序里，在 `codex.js` 之后、`render.js` 之前插入 `<script src="js/tools.js?v=5"></script>`（tools 依赖 core）。
- **所有 `?v=4` 统一改 `?v=5`**。

- [ ] **Step 3: grep 验证 bump（本仓静默失败过四次）**

Run: `grep -c "?v=5" games/abyssshoot/index.html && (grep -c "?v=4" games/abyssshoot/index.html || echo "?v=4 已清零 ✅")`
Expected: `?v=5` 出现 19 次，`?v=4` 为 0。

- [ ] **Step 4: css 加 toast（金币不够的提示）**

```css
#toasts { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%);
          z-index: 60; pointer-events: none; }
.toast { background: rgba(4,18,31,0.92); border: 1px solid #2bb3c0; color: #cfe8f5;
         padding: 8px 16px; border-radius: 999px; font-size: 13px; margin-top: 6px;
         opacity: 1; transition: opacity .4s; }
.toast.out { opacity: 0; }
```
并在 `index.html` 的 `#panel` 前加 `<div id="toasts"></div>`；`main.js` 里加一个 8 行的 `toast(msg)`（追加节点，2s 后淡出移除）。

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/tools/gen-sfx.js games/abyssshoot/assets/audio games/abyssshoot/index.html games/abyssshoot/css/game.css games/abyssshoot/js/main.js
git commit -m "feat(abyssshoot): 道具音效 + 脚本接线 + toast + bump ?v=5"
```

---

## Task 8: 测试挂载 + E2E + 全量回归

**Files:**
- Modify: root `package.json`、`games/abyssshoot/tests/e2e-p1b.cjs`

> ⚠ 改根级文件前先 `git status`；只 `git add package.json`，禁 `git add -A`。

- [ ] **Step 1: package.json 的 `test:abyss` 串上 `test-tools.js`**（放在 `test-codex.js` 之后）

- [ ] **Step 2: E2E 加道具流程**

在「整局跑通」之前插入（用 `G.noAnim = true` 保持快）：

```javascript
  // ── 道具:锤子 ──
  await page.evaluate(() => { dispatch('RESTART', {}); G.noAnim = true;
                              for (let i = 0; i < 10; i++) dispatch('SHOOT', { col: i % 5 });
                              G.save.coins = 999; });
  const t0 = await page.evaluate(() => ({ coins: G.save.coins, tiles: G.s.board.flat().length }));
  await page.evaluate(() => dispatch('TOOL', { k: 'hammer' }));
  const aiming = await page.evaluate(() => G.tool);
  if (aiming !== 'hammer') throw new Error('点锤子应进入瞄准模式');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-tool-aim.png') });
  await page.evaluate(() => { const c = G.s.board.findIndex(col => col.length); dispatch('TOOL_CELL', { c, i: 0 }); });
  await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
  const t1 = await page.evaluate(() => ({ coins: G.save.coins, tiles: G.s.board.flat().length, tool: G.tool }));
  if (t1.coins !== t0.coins - 60) throw new Error(`锤子应扣 60 币,实为 ${t0.coins - t1.coins}`);
  if (t1.tool !== null) throw new Error('用完应退出瞄准模式');
  console.log(`OK 锤子:扣 60 币,格子 ${t0.tiles}→${t1.tiles}`);

  // ── 道具:撤销(精确回退,不能刷弹药) ──
  const u0 = await page.evaluate(() => {
    G.save.coins = 999;
    const before = { board: JSON.stringify(G.s.board), ammo: G.s.ammo, score: G.s.score };
    dispatch('SHOOT', { col: 0 });
    return before;
  });
  await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
  await page.evaluate(() => dispatch('TOOL', { k: 'undo' }));
  const u1 = await page.evaluate(() => ({ board: JSON.stringify(G.s.board), ammo: G.s.ammo, score: G.s.score, coins: G.save.coins }));
  if (u1.board !== u0.board) throw new Error('撤销后盘面应回到射击前');
  if (u1.ammo !== u0.ammo) throw new Error('撤销后弹药应回到射击前');
  if (u1.score !== u0.score) throw new Error('撤销后分数应回退');
  if (u1.coins !== 999 - 30) throw new Error('撤销应扣 30 币');
  console.log('OK 撤销:盘面/弹药/分数精确回退,扣 30 币');

  // ── 金币不够时:按钮点不动 ──
  await page.evaluate(() => { G.save.coins = 0; dispatch('TOOL', { k: 'hammer' }); });
  const poor = await page.evaluate(() => G.tool);
  if (poor !== null) throw new Error('金币不够时不该进入瞄准模式');
  console.log('OK 金币不够:道具点不动');
```

- [ ] **Step 3: 跑 E2E**

Run: `node games/abyssshoot/tests/e2e-p1b.cjs`
Expected: 全绿，含 `OK 锤子` / `OK 撤销` / `OK 金币不够`，退出码 0。

- [ ] **Step 4: 看瞄准态截图认账（地面真值）**

用 Read 工具真的看 `C:\tmp\abyssshoot\e2e-tool-aim.png`：应看到**底部三个道具按钮（带价格）**、**金币数**、锤子处于**选中态**、棋盘上的鱼有**可点高亮**、顶部有「点一条鱼把它砸掉」的提示。若道具栏没画出来/看不出瞄准态，回 Task 6 修。

- [ ] **Step 5: 全量回归**

Run: `npm test` → mines + snake + abyss 全绿（abyss 含新的 test-tools）。
Run: `node tools/check-locales.js games/abyssshoot/locales` → `0 fail`。
Run: `node games/abyssshoot/tests/test-sim.js` → 局长中位仍 ~62（道具不参与 bot，规则未变）。

- [ ] **Step 6: 提交**

```bash
git add package.json games/abyssshoot/tests/e2e-p1b.cjs
git commit -m "test(abyssshoot): 挂 test-tools + E2E 验锤子/撤销/金币门槛"
```

---

## Task 9: 更新 CLAUDE.md

**Files:**
- Modify: `games/abyssshoot/CLAUDE.md`

- [ ] **Step 1: 改「当前状态」段**（P2b-2 已完成：金币+三道具；仍缺：每日盘/成就/皮肤/广告/iOS）。「验证」段补 `test-tools.js`。

- [ ] **Step 2: 加一节道具纪律**

```markdown
## 道具（P2b-2）—— 三条别踩回去的坑

- **🔨 锤子砸完必须立刻 `gravityUp`**：棋盘的「每列从 index0 起密实、无空洞」是**横向连通判定的前提**（`findComponents` 靠「相邻列同 index = 同一绝对行」）。砸出空洞不压实 → **连通判定全乱、合并出错，且悄无声息**。砸完还要 `resolve`（移除会制造新相邻 → 连锁）。`test-tools.js` 有密实不变式硬断言守着。
- **撤销必须精确回退 RNG**：`rand` 是闭包读不出状态 → 记 `s.rolls`（调用次数），回退时用同一 `seed` 重建并空转 `rolls` 次快进。**没有这个，撤销 = 重摇弹药（save-scum）**。同理 `storage.snapshotRun` 也改成存 `seed+rolls` 精确恢复——**刷新页面也不能重摇弹药**了（顺手消掉了 core 里 `Math.random` 的最后一处豁免）。
- **道具用完必须清 `G.undoSnap`**：道具改了盘面后，那份「上一发之前」的快照已经对不上现在的状态；不清掉，玩家撤销会回到一个**错误的过去**。

## 金币经济（蒙特卡洛定的）

来源：`合并×1 + 连锁×5 + 梯顶游走×50`（`tools.js` 的 `COIN`）。价格：撤销 30 / 锤子 60 / 交换 80（`COST`）。
⚠ **不用分数计价**：分数是指数级的（`V×2^(N-1)`），高手一局能滚到 10 万分 → 用分数换币会让高手**暴富、道具免费**（实测跨水平差 **11 倍**）。改用「合并/连锁」只差 **3 倍**，技巧仍被奖励但不失控。随机瞎打中位一局攒 **130 币**（够用约 2 次），金币**跨局累积**。
```

- [ ] **Step 3: 提交**

```bash
git add games/abyssshoot/CLAUDE.md
git commit -m "docs(abyssshoot): 记录道具三坑与金币经济"
```

---

## Self-Review（写完自查）

- **Spec 覆盖**：RNG 游标✓(T1)、三道具纯逻辑+密实不变式✓(T2)、coins/SAVE_V=2/精确恢复✓(T3)、文案✓(T4)、模式状态机+金币结算+撤销快照✓(T5)、金币HUD+道具栏+瞄准态✓(T6)、音效+接线+`?v=5`✓(T7)、测试挂载+E2E+截图认账✓(T8)、文档✓(T9)。每日盘/成就/皮肤/广告明确留给 P2b-3/P3/P4。
- **占位扫描**：无 TBD/TODO，每步含真实代码与确切命令/预期。
- **命名冲突**（浏览器共享全局词法环境，重名 = SyntaxError = 白屏）：新模块 `tools.js` 用 `CORE_T_`，避开 core 的 `PRNG_`/`TILES_`、storage 的 `PRNG_S_`/`CORE_S_`、codex 的 `TILES_C_`。
- **类型/命名一致**：`Tools.{COST,COIN,coinsFor,hammer,swap,snapshot,undo}`、`Core.{attachRand,restoreRand}`、`s.{seed,rolls}`、`G.{tool,swapFirst,undoSnap}`、动作 `TOOL/TOOL_CELL/TOOL_COL/TOOL_CANCEL`、事件 `hammer/swap/undo` 全程一致。
- **不变量保护**：锤子的密实不变式有硬断言；撤销的「重射结果必须完全一致」有硬断言（防 save-scum）；蒙特卡洛守玩法规则未变。
