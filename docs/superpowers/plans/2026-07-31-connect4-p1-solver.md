# connect4 P1：求解器与真值地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建出 connect4 的位棋盘 + 完美求解器 + 开局库 + 20 级 AI 阶梯，并让它通过 Allis 1988 的**外部地面真值门禁**（空盘先手必胜 / 第 3、5 列开局和棋 / 外侧四列后手必胜）。

**Architecture:** 纯 node 可测的逻辑层，零 DOM。每列一个 6 位掩码（列内位运算，天然不跨列串味）→ 着法生成 → negamax + αβ + 置换表 + 中路优先排序 → 离线预算开局库 → `aiMove(position, tier, seed)`。**求解器是本产品全部承诺的地基：地面真值对不上，后面所有功能都是系统性谎言**（规格 §2.2）。

**Tech Stack:** 纯 JS（无框架无 bundler），node 跑测试；双导出惯例（`module.exports` / 全局），照 `games/blockblast/js/dealer.js`。

**规格：** `games/connect4/DESIGN.md`（权威，改核心前必查）。本计划只覆盖规格的 §1.1 / §2 / §3.1 / §9.1 / §9.2。
**不在 P1 范围**：Pop Out（§1.2，P1b 独立计划——它有环，是另一套搜索）、界面与手感（§6，P2）、提示/复盘/精准度（§3.2-3.4、§4，P3）、课程（§5，P4）、元游戏与变现（§7-8，P5）。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `games/connect4/js/bitboard.js` | 棋盘表示与原子操作：建盘/可否落子/落子/胜负/满盘/手数列表互转。**不含搜索** |
| `games/connect4/js/rules-classic.js` | 标准盘的着法生成与终局判定（把 bitboard 包成求解器要的接口） |
| `games/connect4/js/solver.js` | negamax + αβ + 置换表 + 排序。**唯一知道「分数」含义的地方** |
| `games/connect4/js/book.js` | 开局库读取（运行时）。搜索命中即返回，不落库不影响正确性 |
| `games/connect4/js/ai.js` | `aiMove(position, tier, seed)` —— 20 级阶梯。**签名里没有玩家状态** |
| `games/connect4/tools/bench-solver.js` | 性能基准（定开局库深度 N） |
| `games/connect4/tools/gen-book.js` | 离线预算开局库 |
| `games/connect4/tools/test-truth.js` | ⭐ 地面真值门禁（慢，不进 `npm test`，进包前必跑） |
| `games/connect4/tools/sim-ai.js` | 20 级胜率校准（蒙特卡洛） |
| `games/connect4/tests/test-*.js` | 快速单测，进 `npm test` |

---

## Task 1: 目录骨架 + 把测试挂进 npm（先立门禁）

> ⚠ root `CLAUDE.md`：**新游戏必须把 `test:<name>` 挂进 `package.json` 的 `test`**，否则它的测试永远不会被跑到（`npm test` 是手写串联，不是自动发现）。**所以先挂，再写代码。**

**Files:**
- Create: `games/connect4/tests/test-smoke.js`
- Modify: `package.json`（`scripts.test` 与新增 `scripts.test:c4`）

- [ ] **Step 1: 建目录与冒烟测试**

Create `games/connect4/tests/test-smoke.js`:

```js
const assert = require('assert');
assert.strictEqual(1 + 1, 2);
console.log('test-smoke: connect4 测试已接入 npm test OK');
```

- [ ] **Step 2: 挂进 package.json**

在 `scripts` 里新增一行（放在 `test:sol` 之后）：

```json
"test:c4": "node games/connect4/tests/test-smoke.js"
```

并把 `test` 的串联末尾加上 `&& npm run test:c4`：

```json
"test": "npm run test:mines && npm run test:snake && npm run test:abyss && npm run test:block && npm run test:sol && npm run test:c4"
```

⚠ **改 `package.json` 前先 `git status`**——本仓多会话并行，root 文件可能有别的会话的未提交改动（root `CLAUDE.md` 协作坑第 1 条）。

- [ ] **Step 3: 跑起来验证接入**

Run: `npm run test:c4`
Expected: `test-smoke: connect4 测试已接入 npm test OK`

- [ ] **Step 4: 提交**

⛔ 只 add 精确路径，**禁止 `git add -A`**（root CLAUDE.md）。

```bash
git add games/connect4/tests/test-smoke.js package.json
git commit -m "connect4: 建目录骨架 + test:c4 挂进 npm test"
```

---

## Task 2: `js/bitboard.js` —— 位棋盘与原子操作

**表示决策（规格 §9.1）**：**每列一个 6 位掩码**（`bit r` = 该列第 r 行，`r=0` 是最底行）。
选它的理由：所有位运算都在**列内**完成、全部落在 32 位安全区、**斜线不可能跨越棋盘边缘**（结构性免疫，不是靠边界检查）。`tools/bench-solver.js`（Task 5）会实测它够不够快，不够再换。

**Files:**
- Create: `games/connect4/js/bitboard.js`
- Create: `games/connect4/tests/test-bitboard.js`
- Modify: `package.json`（`test:c4` 加上新测试）

- [ ] **Step 1: 先写失败的测试**

Create `games/connect4/tests/test-bitboard.js`:

```js
const assert = require('assert');
const B = require('../js/bitboard.js');

// --- 建盘 ---
let bd = B.newBoard();
assert.strictEqual(bd.n, 0);
assert.strictEqual(bd.turn, 0);
assert.strictEqual(B.winner(bd), null);
console.log('test-bitboard: 新盘 OK');

// --- 落子与列高 ---
bd = B.play(B.newBoard(), 3);
assert.strictEqual(bd.h[3], 1);
assert.strictEqual(bd.n, 1);
assert.strictEqual(bd.turn, 1, '落子后换手');
console.log('test-bitboard: 落子/列高/换手 OK');

// --- play 不改原棋盘（纯函数）---
const before = B.newBoard();
B.play(before, 0);
assert.strictEqual(before.n, 0, 'play 必须返回新盘，不许就地改');
console.log('test-bitboard: play 是纯函数 OK');

// --- 列满不可落 ---
let full = B.newBoard();
for (let i = 0; i < 6; i++) full = B.play(full, 0);
assert.strictEqual(B.canPlay(full, 0), false);
assert.strictEqual(B.canPlay(full, 1), true);
assert.strictEqual(B.canPlay(full, -1), false);
assert.strictEqual(B.canPlay(full, 7), false);
console.log('test-bitboard: 列满/越界 OK');

// --- 竖四连（先手 0 连成）---
assert.strictEqual(B.winner(B.fromMoves([3, 4, 3, 4, 3, 4, 3])), 0);
console.log('test-bitboard: 竖四连 OK');

// --- 横四连 ---
assert.strictEqual(B.winner(B.fromMoves([0, 0, 1, 1, 2, 2, 3])), 0);
console.log('test-bitboard: 横四连 OK');

// --- 斜 ↗ 四连 ---
// 先手占 (0,0)(1,1)(2,2)(3,3)
assert.strictEqual(B.winner(B.fromMoves([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])), 0);
console.log('test-bitboard: 斜↗ 四连 OK');

// --- 斜 ↘ 四连 ---
// 先手占 (3,0)(2,1)(1,2)(0,3)
assert.strictEqual(B.winner(B.fromMoves([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0])), 0);
console.log('test-bitboard: 斜↘ 四连 OK');

// --- ⭐ 斜线绝不许跨越棋盘边缘（结构性不变量）---
// 第 6 列和第 0 列的子不该被连成一条线
const wrap = B.fromMoves([6, 5, 6, 5, 6, 5, 0, 4, 0, 4, 0]);
assert.strictEqual(B.winner(wrap), null, '第 6 列与第 0 列不许被判成四连');
console.log('test-bitboard: 斜线不跨边缘 OK');

// --- 三连不算赢 ---
assert.strictEqual(B.winner(B.fromMoves([3, 4, 3, 4, 3])), null);
console.log('test-bitboard: 三连不算赢 OK');

// --- 满盘和：42 手无人连四 ---
// 每列按 2-2-2 交错填，构造无四连的满盘
const drawMoves = [];
const pat = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
for (let round = 0; round < 3; round++) for (const c of pat) drawMoves.push(c);
const drawBd = B.fromMoves(drawMoves.slice(0, 42));
assert.strictEqual(drawBd.n, 42);
assert.strictEqual(B.isFull(drawBd), true);
console.log('test-bitboard: 满盘 OK');

// --- fromMoves / toMoves 往返（存档靠它，规格 §9.3）---
const mv = [3, 3, 4, 2, 5, 1];
assert.deepStrictEqual(B.toMoves(B.fromMoves(mv)), mv);
console.log('test-bitboard: 手数列表往返 OK');

console.log('test-bitboard: 全部通过');
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node games/connect4/tests/test-bitboard.js`
Expected: FAIL — `Cannot find module '../js/bitboard.js'`

- [ ] **Step 3: 写实现**

Create `games/connect4/js/bitboard.js`:

```js
// connect4 位棋盘（标准 7×6）。
// 表示：每列一个 6 位掩码，bit r = 该列第 r 行（r=0 是最底行）。
// 所有位运算都在列内完成 ⇒ 斜线结构性不可能跨越棋盘边缘（不靠边界检查）。
(function (root) {
  const W = 7, H = 6, CELLS = W * H;

  /** @returns 新棋盘。a=先手各列掩码 b=后手 h=各列已有子数 turn=0|1 n=总手数 */
  function newBoard() {
    return { a: [0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0], h: [0, 0, 0, 0, 0, 0, 0], turn: 0, n: 0, mv: [] };
  }

  function clone(bd) {
    return { a: bd.a.slice(), b: bd.b.slice(), h: bd.h.slice(), turn: bd.turn, n: bd.n, mv: bd.mv.slice() };
  }

  function canPlay(bd, c) { return c >= 0 && c < W && bd.h[c] < H; }

  /** 纯函数：返回落子后的新棋盘，绝不就地修改（存档/撤销/复盘全靠这条）。 */
  function play(bd, c) {
    const nb = clone(bd);
    const bit = 1 << nb.h[c];
    if (nb.turn === 0) nb.a[c] |= bit; else nb.b[c] |= bit;
    nb.h[c]++; nb.n++; nb.mv.push(c); nb.turn ^= 1;
    return nb;
  }

  /** 某一方的列掩码数组是否含四连。 */
  function hasFour(m) {
    for (let c = 0; c < W; c++) {
      const v = m[c];
      if (v & (v >> 1) & (v >> 2) & (v >> 3)) return true;          // 竖
    }
    for (let c = 0; c + 3 < W; c++) {
      const m0 = m[c], m1 = m[c + 1], m2 = m[c + 2], m3 = m[c + 3];
      if (m0 & m1 & m2 & m3) return true;                            // 横
      if (m0 & (m1 >> 1) & (m2 >> 2) & (m3 >> 3)) return true;       // 斜 ↗
      if (m0 & (m1 << 1) & (m2 << 2) & (m3 << 3)) return true;       // 斜 ↘
    }
    return false;
  }

  /** @returns 0 | 1 | null（尚未分出胜负，含和局——和局用 isFull 另判） */
  function winner(bd) {
    if (hasFour(bd.a)) return 0;
    if (hasFour(bd.b)) return 1;
    return null;
  }

  function isFull(bd) { return bd.n >= CELLS; }

  /** 落这一子会不会当场赢（求解器热路径，避免建完整新盘）。 */
  function isWinningMove(bd, c) {
    if (!canPlay(bd, c)) return false;
    const m = (bd.turn === 0 ? bd.a : bd.b).slice();
    m[c] |= 1 << bd.h[c];
    return hasFour(m);
  }

  function fromMoves(moves) {
    let bd = newBoard();
    for (const c of moves) {
      if (!canPlay(bd, c)) throw new Error('非法着法：列 ' + c + ' 已满或越界');
      bd = play(bd, c);
    }
    return bd;
  }

  function toMoves(bd) { return bd.mv.slice(); }

  const API = { W, H, CELLS, newBoard, clone, canPlay, play, winner, isFull, isWinningMove, hasFour, fromMoves, toMoves };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Bitboard = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `node games/connect4/tests/test-bitboard.js`
Expected: 每行一个 OK，末行 `test-bitboard: 全部通过`

⚠ 若「斜↗/斜↘」两条失败，先手工画出 `fromMoves` 那串手数落成的盘面核对**是不是测试的手数写错了**，再怀疑 `hasFour`。别改 `hasFour` 去迁就一个写错的测试。

- [ ] **Step 5: 把测试挂进 test:c4 并提交**

`package.json` 的 `test:c4` 改成：

```json
"test:c4": "node games/connect4/tests/test-bitboard.js"
```

（`test-smoke.js` 的使命已完成，删掉它。）

```bash
rm games/connect4/tests/test-smoke.js
git add games/connect4/js/bitboard.js games/connect4/tests/test-bitboard.js package.json
git rm games/connect4/tests/test-smoke.js
git commit -m "connect4: 位棋盘（每列 6 位掩码，斜线结构性不跨边缘）"
```

---

## Task 3: `js/rules-classic.js` —— 着法生成与终局

把 bitboard 包成求解器要的三个问题：**有哪些着法可走**、**这局结束了吗**、**结局是什么**。求解器不直接碰 bitboard，将来 Pop Out 换一份 rules 即可复用搜索骨架。

**Files:**
- Create: `games/connect4/js/rules-classic.js`
- Create: `games/connect4/tests/test-rules.js`
- Modify: `package.json`

- [ ] **Step 1: 先写失败的测试**

Create `games/connect4/tests/test-rules.js`:

```js
const assert = require('assert');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');

// --- 着法顺序：中路优先（αβ 剪枝效率的关键）---
assert.deepStrictEqual(R.moves(B.newBoard()), [3, 2, 4, 1, 5, 0, 6]);
console.log('test-rules: 中路优先着法序 OK');

// --- 满列被排除 ---
let bd = B.newBoard();
for (let i = 0; i < 6; i++) bd = B.play(bd, 3);
assert.deepStrictEqual(R.moves(bd), [2, 4, 1, 5, 0, 6]);
console.log('test-rules: 满列被排除 OK');

// --- 终局判定 ---
assert.strictEqual(R.terminal(B.newBoard()), null, '开局不是终局');
assert.strictEqual(R.terminal(B.fromMoves([3, 4, 3, 4, 3, 4, 3])), 'WIN_0');
assert.strictEqual(R.terminal(B.fromMoves([0, 3, 0, 4, 0, 5, 1, 3, 1, 4, 1])), null);
console.log('test-rules: 终局判定 OK');

// --- 和局：满盘且无人四连 ---
const pat = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
const drawMoves = [];
for (let r = 0; r < 3; r++) for (const c of pat) drawMoves.push(c);
const drawBd = B.fromMoves(drawMoves.slice(0, 42));
assert.strictEqual(R.terminal(drawBd), 'DRAW');
console.log('test-rules: 和局 OK');

// --- 一手取胜可被识别 ---
const oneAway = B.fromMoves([3, 4, 3, 4, 3, 4]);   // 先手第 3 列已三连，轮先手
assert.strictEqual(oneAway.turn, 0);
assert.deepStrictEqual(R.winningMoves(oneAway), [3]);
console.log('test-rules: 一手取胜识别 OK');

console.log('test-rules: 全部通过');
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node games/connect4/tests/test-rules.js`
Expected: FAIL — `Cannot find module '../js/rules-classic.js'`

- [ ] **Step 3: 写实现**

Create `games/connect4/js/rules-classic.js`:

```js
// 标准 7×6 的规则层：着法生成 + 终局判定。求解器只依赖本层，不直接碰 bitboard，
// 将来 Pop Out 换一份 rules 即可复用同一套搜索骨架（⚠ 但 Pop Out 有环，见 DESIGN §1.2）。
(function (root) {
  const B = (typeof module !== 'undefined' && module.exports) ? require('./bitboard.js') : root.Bitboard;

  /** 中路优先——αβ 剪枝效率的关键，中列参与 13 条四连线、边列只有 3 条。 */
  const ORDER = [3, 2, 4, 1, 5, 0, 6];

  function moves(bd) { return ORDER.filter(c => B.canPlay(bd, c)); }

  /** @returns 'WIN_0' | 'WIN_1' | 'DRAW' | null（未终局） */
  function terminal(bd) {
    const w = B.winner(bd);
    if (w !== null) return 'WIN_' + w;
    return B.isFull(bd) ? 'DRAW' : null;
  }

  /** 当前行棋方一手就能赢的列（按中路优先序）。 */
  function winningMoves(bd) { return moves(bd).filter(c => B.isWinningMove(bd, c)); }

  const API = { ORDER, moves, terminal, winningMoves };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RulesClassic = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `node games/connect4/tests/test-rules.js`
Expected: 末行 `test-rules: 全部通过`

- [ ] **Step 5: 挂进 test:c4 并提交**

```json
"test:c4": "node games/connect4/tests/test-bitboard.js && node games/connect4/tests/test-rules.js"
```

```bash
git add games/connect4/js/rules-classic.js games/connect4/tests/test-rules.js package.json
git commit -m "connect4: 规则层（中路优先着法序 + 终局判定）"
```

---

## Task 4: `js/solver.js` —— negamax + αβ（先求正确，不求快）

**分数约定（唯一定义在本文件，⚠ 跨模块只许映射一次——solitaire 曾因 `'win'`/`'solvable'` 拼错让每个有解开局都被报成死局）：**

> 从**当前行棋方**视角：`score > 0` = 必胜，`score = 0` = 和，`score < 0` = 必败。
> 绝对值越大 = 分出胜负越早。**当场落子即赢 ⇒ `score = 42 - n`**（n = 落子前的手数）。

**Files:**
- Create: `games/connect4/js/solver.js`
- Create: `games/connect4/tests/test-solver.js`
- Modify: `package.json`

- [ ] **Step 1: 先写失败的测试**

Create `games/connect4/tests/test-solver.js`:

```js
const assert = require('assert');
const B = require('../js/bitboard.js');
const S = require('../js/solver.js');

// --- 一手取胜：分数 = 42 - n ---
const win1 = B.fromMoves([3, 4, 3, 4, 3, 4]);          // n=6，先手第 3 列三连，轮先手
assert.strictEqual(S.solve(win1).score, 42 - 6);
assert.deepStrictEqual(S.solve(win1).best, [3]);
console.log('test-solver: 一手取胜 OK');

// --- 对称：换到对手视角必须是等大的负数 ---
const lose1 = B.fromMoves([3, 4, 3, 4, 3]);            // n=5，轮后手，先手已三连
assert.ok(S.solve(lose1).score < 0, '被将死的一方分数必须为负');
console.log('test-solver: 必败为负 OK');

// --- 必须防守：不挡就输 ---
const mustBlock = S.solve(lose1);
assert.deepStrictEqual(mustBlock.best, [3], '唯一不立刻输的一手是挡第 3 列');
console.log('test-solver: 唯一防守手 OK');

// --- 和局残局：填满只剩最后一格且无人能四连 ---
const pat = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
const dm = [];
for (let r = 0; r < 3; r++) for (const c of pat) dm.push(c);
const near = B.fromMoves(dm.slice(0, 41));
assert.strictEqual(S.solve(near).score, 0, '只剩一格且无人能赢 ⇒ 和');
console.log('test-solver: 和局残局 OK');

// --- 确定性：同一局面解两次结果必须逐项相同 ---
const a = S.solve(win1), b = S.solve(win1);
assert.strictEqual(a.score, b.score);
assert.deepStrictEqual(a.best, b.best);
console.log('test-solver: 确定性 OK');

console.log('test-solver: 全部通过');
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node games/connect4/tests/test-solver.js`
Expected: FAIL — `Cannot find module '../js/solver.js'`

- [ ] **Step 3: 写实现**

Create `games/connect4/js/solver.js`:

```js
// connect4 完美求解器（标准盘）。negamax + αβ。
//
// ⭐ 分数约定（本仓唯一定义处，跨模块只许映射一次）：
//   从「当前行棋方」视角：>0 必胜 / =0 和 / <0 必败；绝对值越大 = 越早分胜负。
//   当场落子即赢 ⇒ score = 42 - n（n = 落子前手数）。
(function (root) {
  const isNode = (typeof module !== 'undefined' && module.exports);
  const B = isNode ? require('./bitboard.js') : root.Bitboard;
  const R = isNode ? require('./rules-classic.js') : root.RulesClassic;

  let nodes = 0;

  function negamax(bd, alpha, beta) {
    nodes++;
    if (B.isFull(bd)) return 0;                       // 满盘和

    for (const c of R.moves(bd)) {                    // 当场能赢就赢，不必再搜
      if (B.isWinningMove(bd, c)) return B.CELLS - bd.n;
    }

    // 上界：既然不能当场赢，最快也只能在「我方下一手」赢 ⇒ 42 - (n+3) + 1
    const max = B.CELLS - 2 - bd.n;
    if (beta > max) { beta = max; if (alpha >= beta) return beta; }

    for (const c of R.moves(bd)) {
      const score = -negamax(B.play(bd, c), -beta, -alpha);
      if (score >= beta) return score;                // 剪枝
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /**
   * @returns {{score:number, best:number[], nodes:number}}
   *   best = 所有并列最优的列（按中路优先序）；终局局面返回 best=[]。
   */
  function solve(bd) {
    nodes = 0;
    if (R.terminal(bd) !== null) return { score: 0, best: [], nodes: 0 };
    let bestScore = -Infinity, best = [];
    for (const c of R.moves(bd)) {
      const s = -negamax(B.play(bd, c), -B.CELLS, B.CELLS);
      if (s > bestScore) { bestScore = s; best = [c]; }
      else if (s === bestScore) best.push(c);
    }
    return { score: bestScore, best, nodes };
  }

  /** 每一列的精确分数（提示/精准度/妙手判定要用，P3 的输入）。 */
  function scoreAll(bd) {
    const out = {};
    for (const c of R.moves(bd)) out[c] = -negamax(B.play(bd, c), -B.CELLS, B.CELLS);
    return out;
  }

  const API = { solve, scoreAll, get nodes() { return nodes; } };
  if (isNode) module.exports = API; else root.Solver = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `node games/connect4/tests/test-solver.js`
Expected: 末行 `test-solver: 全部通过`

⚠ 这一版**只保证正确，不保证快**——它解不动空盘（那是 Task 5 的事）。测试里全部是浅残局，秒出。

- [ ] **Step 5: 挂进 test:c4 并提交**

```json
"test:c4": "node games/connect4/tests/test-bitboard.js && node games/connect4/tests/test-rules.js && node games/connect4/tests/test-solver.js"
```

```bash
git add games/connect4/js/solver.js games/connect4/tests/test-solver.js package.json
git commit -m "connect4: negamax+αβ 求解器（先求正确）"
```

---

## Task 5: 置换表 + 迭代加深，并用 `tools/bench-solver.js` 量出来

**Files:**
- Modify: `games/connect4/js/solver.js`
- Create: `games/connect4/tools/bench-solver.js`
- Modify: `package.json`（新增 `bench:c4`）

**置换表的 key 怎么来（关键推导，别自己发明）**：每列的状态可以编码成 7 位——`posCol[c] + mskCol[c] + 1`（+1 是该列的「底部哨兵位」，Pons 的经典技巧，保证不同局面不撞）。7 列 × 7 位 = **49 位 < 53 位** ⇒ **一个 JS Number 就能装下完整无损的 key**，不需要 Zobrist、不会有哈希碰撞误判。

- [ ] **Step 1: 先写基准脚本（先量再优化）**

Create `games/connect4/tools/bench-solver.js`:

```js
// 求解器基准：定开局库深度 N 的依据（DESIGN §9.1/§9.2）。
// 用法: node games/connect4/tools/bench-solver.js [每档局数]
const B = require('../js/bitboard.js');
const S = require('../js/solver.js');

const N = Number(process.argv[2] || 20);

// 确定性伪随机（禁 Math.random，本仓惯例：基准必须可复现）
let seed = 20260731;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

function randomBoard(plies) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let bd = B.newBoard(), ok = true;
    for (let i = 0; i < plies; i++) {
      const cs = [0, 1, 2, 3, 4, 5, 6].filter(c => B.canPlay(bd, c));
      if (!cs.length) { ok = false; break; }
      bd = B.play(bd, cs[Math.floor(rnd() * cs.length)]);
      if (B.winner(bd) !== null) { ok = false; break; }
    }
    if (ok) return bd;
  }
  throw new Error('造不出 ' + plies + ' 手的未终局局面');
}

console.log('plies | 局数 | 中位耗时 | 最慢 | 中位节点数');
for (const plies of [28, 24, 20, 16, 12, 8, 4]) {
  const times = [], nodes = [];
  for (let i = 0; i < N; i++) {
    const bd = randomBoard(plies);
    const t0 = process.hrtime.bigint();
    const r = S.solve(bd);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    nodes.push(r.nodes);
  }
  times.sort((x, y) => x - y); nodes.sort((x, y) => x - y);
  const med = a => a[Math.floor(a.length / 2)];
  console.log(
    String(plies).padStart(5), '|', String(N).padStart(4), '|',
    (med(times).toFixed(1) + 'ms').padStart(8), '|',
    (times[times.length - 1].toFixed(1) + 'ms').padStart(9), '|',
    med(nodes).toLocaleString().padStart(12)
  );
  if (med(times) > 60000) { console.log('  （更浅的档太慢，停止）'); break; }
}
```

- [ ] **Step 2: 跑基准，记下优化前的数字**

Run: `node games/connect4/tools/bench-solver.js 10`
Expected: 一张表。**28/24 手很快，越浅越慢**；12 手以内大概率慢到分钟级——**这就是需要置换表和开局库的证据**。把这张表贴进提交信息，它是 Task 6 定 N 的依据。

- [ ] **Step 3: 给 solver.js 加置换表 + 迭代加深空窗搜索**

在 `js/solver.js` 里，把 `negamax` 之前的部分替换为（新增 key 计算与置换表，`negamax` 内部加存取）：

```js
  const TT_BITS = 22, TT_SIZE = 1 << TT_BITS;
  const ttKey = new Float64Array(TT_SIZE);   // 完整 49 位 key（0 = 空槽）
  const ttVal = new Int8Array(TT_SIZE);      // 存 score + 偏移，防 0 与空槽混淆
  function ttReset() { ttKey.fill(0); ttVal.fill(0); }

  /** 局面唯一 key：每列 (己方掩码 + 全体掩码 + 1) 占 7 位，7 列共 49 位 < 53 位安全整数。 */
  function keyOf(bd) {
    const me = bd.turn === 0 ? bd.a : bd.b;
    let k = 0;
    for (let c = B.W - 1; c >= 0; c--) k = k * 128 + (me[c] + (bd.a[c] | bd.b[c]) + 1);
    return k;
  }
```

把 `negamax` 改成：

```js
  function negamax(bd, alpha, beta) {
    nodes++;
    if (B.isFull(bd)) return 0;

    for (const c of R.moves(bd)) {
      if (B.isWinningMove(bd, c)) return B.CELLS - bd.n;
    }

    let max = B.CELLS - 2 - bd.n;
    const key = keyOf(bd), ti = key % TT_SIZE;
    if (ttKey[ti] === key) max = ttVal[ti] + B.CELLS - 2 - bd.n;   // 存的是相对上界
    if (beta > max) { beta = max; if (alpha >= beta) return beta; }

    for (const c of R.moves(bd)) {
      const score = -negamax(B.play(bd, c), -beta, -alpha);
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }

    ttKey[ti] = key; ttVal[ti] = alpha - (B.CELLS - 2 - bd.n);     // 存相对值，塞得进 Int8
    return alpha;
  }
```

并在 `solve()` 与 `scoreAll()` 开头加 `ttReset();`（⚠ 不 reset 会跨局面串味——置换表存的是相对当前手数的值）。

- [ ] **Step 4: 重跑单测确认没改坏正确性**

Run: `node games/connect4/tests/test-solver.js && node games/connect4/tests/test-rules.js && node games/connect4/tests/test-bitboard.js`
Expected: 三个都 `全部通过`

⚠ **正确性优先于速度**。这里任何一条红了，先回退置换表再查——一个存错的上界会让求解器**悄悄给出错误结论**（不报错），那正是本产品最危险的失败模式。

- [ ] **Step 5: 重跑基准，确认提速**

Run: `node games/connect4/tools/bench-solver.js 10`
Expected: 同样的档位，中位节点数应下降**至少一个数量级**。若没有，说明 key 或 reset 写错了。

- [ ] **Step 6: 挂 npm 脚本并提交**

```json
"bench:c4": "node games/connect4/tools/bench-solver.js"
```

```bash
git add games/connect4/js/solver.js games/connect4/tools/bench-solver.js package.json
git commit -m "connect4: 置换表（49 位无损 key）+ 基准脚本"
```

---

## Task 6: ⭐ `tools/test-truth.js` —— 地面真值门禁

这是本产品最重要的一个测试（规格 §2.2）。Allis & Allen 1988 的结论是**外部可检验的真值**，和 solitaire 拿微软 FreeCell #11982 验发牌是同一个招式。

⚠ 它**慢**（要解到开局），所以**不进 `npm test`**，走独立 `npm run verify:c4truth`，**进包前必跑**（照 blockblast 的 `verify:levels` 先例）。

**Files:**
- Create: `games/connect4/tools/test-truth.js`
- Modify: `package.json`

- [ ] **Step 1: 写门禁脚本**

Create `games/connect4/tools/test-truth.js`:

```js
// ⭐ 地面真值门禁（DESIGN §2.2）。Allis & Allen 1988 / Tromp 1995：
//   标准 7×6，双方完美对弈 ——
//     正中列（第 4 列，0-indexed 的 3）开局 ⇒ 先手必胜
//     第 3 / 5 列（0-indexed 2 / 4）开局   ⇒ 和棋
//     外侧四列（0-indexed 0,1,5,6）开局    ⇒ 后手必胜
// 对不上 = 我们的求解器是假的，而整个产品压在它上面。
const B = require('../js/bitboard.js');
const S = require('../js/solver.js');

const CASES = [
  { col: 3, want: 'LOSS', why: '正中列开局 ⇒ 先手必胜（轮到后手时后手必败）' },
  { col: 2, want: 'DRAW', why: '紧邻中间开局 ⇒ 和棋' },
  { col: 4, want: 'DRAW', why: '紧邻中间开局 ⇒ 和棋' },
  { col: 0, want: 'WIN', why: '外侧列开局 ⇒ 后手必胜' },
  { col: 1, want: 'WIN', why: '外侧列开局 ⇒ 后手必胜' },
  { col: 5, want: 'WIN', why: '外侧列开局 ⇒ 后手必胜' },
  { col: 6, want: 'WIN', why: '外侧列开局 ⇒ 后手必胜' },
];

// 注意视角：solve() 是「当前行棋方」视角。先手落一子后轮后手，
// 所以「先手必胜」在这里表现为后手视角的 LOSS。
const label = s => (s > 0 ? 'WIN' : s < 0 ? 'LOSS' : 'DRAW');

let fail = 0;
for (const c of CASES) {
  const t0 = Date.now();
  const r = S.solve(B.fromMoves([c.col]));
  const got = label(r.score);
  const ok = got === c.want;
  if (!ok) fail++;
  console.log(
    `${ok ? '✅' : '❌'} 开局第 ${c.col + 1} 列 → 后手视角 ${got}`,
    `(期望 ${c.want}, score=${r.score}, ${r.nodes.toLocaleString()} 节点, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    ok ? '' : ' ← ' + c.why
  );
}

// 空盘：先手视角必须是 WIN
const t0 = Date.now();
const empty = S.solve(B.newBoard());
const emptyOk = empty.score > 0 && empty.best.includes(3);
if (!emptyOk) fail++;
console.log(
  `${emptyOk ? '✅' : '❌'} 空盘 → 先手视角 ${label(empty.score)}，最优列 ${empty.best.map(c => c + 1).join(',')}`,
  `(期望 WIN 且含第 4 列, ${empty.nodes.toLocaleString()} 节点, ${((Date.now() - t0) / 1000).toFixed(1)}s)`
);

console.log(fail === 0 ? '\n⭐ 地面真值门禁全绿：求解器与 Allis 1988 一致' : `\n💀 ${fail} 条对不上 —— 求解器是假的，禁止继续`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑门禁**

Run: `node games/connect4/tools/test-truth.js`
Expected: 8 行 ✅ + `⭐ 地面真值门禁全绿`，退出码 0。

Run: `node games/connect4/tools/test-truth.js; echo "exit=$?"`
Expected: `exit=0`（⚠ **用退出码裁决，不要只看输出文字**）

⚠ **这一步可能跑很久**（分钟到几十分钟量级，取决于 Task 5 的优化效果）。若单条超过 ~30 分钟，**先别改结论去迁就**——回到 Task 5 加强剪枝（可加：按「落子后给对手留几个安全着法」排序、以及空窗迭代加深），或先做 Task 7 的开局库再回来。

⚠ 若某条**结论对不上**（不是慢，是判错），⛔ **不许改期望值**——期望值来自外部文献，错的一定是我们。按这个顺序查：① `hasFour` 的四个方向 ② 置换表 key/reset ③ 分数约定的正负号。

- [ ] **Step 3: 挂 npm 脚本并提交**

```json
"verify:c4truth": "node games/connect4/tools/test-truth.js"
```

在 `games/connect4/DESIGN.md` 的 §10 测试门禁清单第 2 条后补一行命令 `npm run verify:c4truth`。

```bash
git add games/connect4/tools/test-truth.js games/connect4/DESIGN.md package.json
git commit -m "connect4: ⭐ 地面真值门禁（Allis 1988，退出码裁决）"
```

---

## Task 7: 开局库（离线预算 + 运行时读取）

**Files:**
- Create: `games/connect4/tools/gen-book.js`
- Create: `games/connect4/js/book.js`
- Create: `games/connect4/tests/test-book.js`
- Modify: `games/connect4/js/solver.js`（solve 先查库）
- Modify: `package.json`

**深度 N 怎么定**：看 Task 5 的基准表——取「中位耗时 ≤ 200ms」的那个 plies 值作为 N（200ms 是 Worker 里玩家不会觉得卡的上限）。基准表若显示 12 手就已 ≤200ms，则 `N = 12`。

- [ ] **Step 1: 写生成脚本**

Create `games/connect4/tools/gen-book.js`:

```js
// 离线预算开局库：穷举前 N 手的所有合法局面，存每个局面的精确分数。
// 用法: node games/connect4/tools/gen-book.js <N> > games/connect4/data/book-classic.json
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');

const N = Number(process.argv[2]);
if (!N || N < 1) { console.error('用法: gen-book.js <深度N>'); process.exit(1); }

const book = {};
let done = 0;

function keyOf(bd) {                       // 与 solver 内部同一套 key（49 位无损）
  const me = bd.turn === 0 ? bd.a : bd.b;
  let k = 0;
  for (let c = B.W - 1; c >= 0; c--) k = k * 128 + (me[c] + (bd.a[c] | bd.b[c]) + 1);
  return k;
}

function walk(bd, depth) {
  if (R.terminal(bd) !== null) return;
  if (depth === N) {
    const k = keyOf(bd);
    if (book[k] === undefined) { book[k] = S.solve(bd).score; if (++done % 200 === 0) console.error(done + ' 个局面已解…'); }
    return;
  }
  for (const c of R.moves(bd)) walk(B.play(bd, c), depth + 1);
}

walk(B.newBoard(), 0);
console.error('完成：' + Object.keys(book).length + ' 个局面');
process.stdout.write(JSON.stringify(book));
```

- [ ] **Step 2: 先用一个很浅的 N 验证脚本本身跑得通**

Run: `mkdir -p games/connect4/data && node games/connect4/tools/gen-book.js 4 > games/connect4/data/book-classic.json`
Expected: stderr 打出「完成：N 个局面」，`data/book-classic.json` 非空。

Run: `node -e "const b=require('./games/connect4/data/book-classic.json');console.log('条目',Object.keys(b).length)"`
Expected: 条目数 > 0

- [ ] **Step 3: 写 book.js 与它的测试**

Create `games/connect4/js/book.js`:

```js
// 开局库读取。命中即返回精确分数；未命中返回 null，交给搜索。
// ⚠ 开局库只影响速度，不影响正确性 —— 库缺失时游戏必须照常可玩（只是提示会慢）。
(function (root) {
  const isNode = (typeof module !== 'undefined' && module.exports);
  const B = isNode ? require('./bitboard.js') : root.Bitboard;

  let data = null;

  function load(obj) { data = obj || null; }
  function loaded() { return data !== null; }

  function keyOf(bd) {
    const me = bd.turn === 0 ? bd.a : bd.b;
    let k = 0;
    for (let c = B.W - 1; c >= 0; c--) k = k * 128 + (me[c] + (bd.a[c] | bd.b[c]) + 1);
    return k;
  }

  /** @returns number | null */
  function lookup(bd) {
    if (!data) return null;
    const v = data[keyOf(bd)];
    return v === undefined ? null : v;
  }

  const API = { load, loaded, lookup, keyOf };
  if (isNode) module.exports = API; else root.Book = API;
})(typeof self !== 'undefined' ? self : this);
```

Create `games/connect4/tests/test-book.js`:

```js
const assert = require('assert');
const B = require('../js/bitboard.js');
const S = require('../js/solver.js');
const Book = require('../js/book.js');

// --- 未加载时必须安全返回 null（库缺失游戏照常可玩）---
assert.strictEqual(Book.loaded(), false);
assert.strictEqual(Book.lookup(B.newBoard()), null);
console.log('test-book: 未加载时安全 OK');

// --- ⭐ 库里的分数必须与现场求解逐个一致（库一旦说谎，全部承诺跟着说谎）---
const data = require('../data/book-classic.json');
Book.load(data);
assert.strictEqual(Book.loaded(), true);

let checked = 0;
for (const moves of [[3, 3, 3, 3], [3, 2, 3, 2], [0, 3, 1, 3], [2, 3, 4, 3]]) {
  const bd = B.fromMoves(moves);
  const hit = Book.lookup(bd);
  if (hit === null) continue;                 // 深度不够就跳过，不算失败
  assert.strictEqual(hit, S.solve(bd).score, '开局库与现场求解不一致：' + moves.join(','));
  checked++;
}
console.log('test-book: 库分数与现场求解一致（校验 ' + checked + ' 个局面）OK');

console.log('test-book: 全部通过');
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `node games/connect4/tests/test-book.js`
Expected: 末行 `test-book: 全部通过`

⚠ 若「库分数与现场求解不一致」——⛔ **绝不许改测试放过它**。开局库说谎 = 提示、复盘、精准度、课程**全部一起说谎**（solitaire 的教训：规则一变，「已验证可解」立刻变成系统性谎言）。查 `keyOf` 两处实现是否逐字一致。

- [ ] **Step 5: 让 solve() 先查库**

在 `js/solver.js` 的 `solve()` 开头（`ttReset()` 之后）插入：

```js
    const hit = (isNode ? require('./book.js') : root.Book).lookup(bd);
    if (hit !== null) {
      // 库只存分数不存最优列 —— 最优列仍需一层浅搜（一层只有 ≤7 个子局面，极快）
      const best = [];
      for (const c of R.moves(bd)) if (-negamax(B.play(bd, c), -B.CELLS, B.CELLS) === hit) best.push(c);
      return { score: hit, best, nodes };
    }
```

- [ ] **Step 6: 全量回归**

Run: `npm run test:c4`
Expected: 全部 `全部通过`

- [ ] **Step 7: 用 Task 5 基准表定出的真实 N 重新生成，然后提交**

Run: `node games/connect4/tools/gen-book.js <N> > games/connect4/data/book-classic.json`（N 见本任务开头的定法）
Run: `node games/connect4/tests/test-book.js`
Run: `ls -la games/connect4/data/`  ← ⚠ **记下文件大小**，规格 §9.2 要求盯 iOS 包体；超过 5MB 就把 N 降一档重生成。

```json
"gen:c4book": "node games/connect4/tools/gen-book.js"
```

```bash
git add games/connect4/js/book.js games/connect4/tools/gen-book.js games/connect4/tests/test-book.js games/connect4/data/book-classic.json games/connect4/js/solver.js package.json
git commit -m "connect4: 开局库（离线预算 + 与现场求解一致性测试）"
```

---

## Task 8: `js/ai.js` —— 20 级明面阶梯

规格 §3.1。⭐ **签名 `aiMove(position, tier, seed)` 里没有玩家历史、没有胜负记录、没有自适应状态 —— 想作弊都没有入口。** 这句话要能印在公平页上，所以它必须**由测试守住**。

**Files:**
- Create: `games/connect4/js/ai.js`
- Create: `games/connect4/tests/test-ai-determinism.js`
- Modify: `package.json`

- [ ] **Step 1: 先写失败的测试**

Create `games/connect4/tests/test-ai-determinism.js`:

```js
const assert = require('assert');
const B = require('../js/bitboard.js');
const AI = require('../js/ai.js');

const bd = B.fromMoves([3, 3, 4]);

// --- 同 (position, tier, seed) ⇒ 同一手 ---
for (const tier of [1, 5, 10, 15, 20]) {
  const first = AI.aiMove(bd, tier, 12345);
  for (let i = 0; i < 20; i++) assert.strictEqual(AI.aiMove(bd, tier, 12345), first, 'tier ' + tier + ' 不确定');
}
console.log('test-ai: 同 (position,tier,seed) 恒等 OK');

// --- ⭐ 签名里没有玩家状态：改全局玩家档案不影响落子 ---
const before = AI.aiMove(bd, 12, 777);
global.G = { wins: 99, streak: 42, rank: 'master', noAds: true };
global.PlayerProfile = { level: 99, accuracy: 0.99 };
assert.strictEqual(AI.aiMove(bd, 12, 777), before, 'AI 读了它不该读的东西');
delete global.G; delete global.PlayerProfile;
console.log('test-ai: ⭐ 不读玩家状态 OK');

// --- ⭐ 撤销后不许改主意（DESIGN §2.3 推论二）---
// 走同一条路两次，逐手比对
function walk() {
  let b = B.newBoard(), out = [];
  for (let i = 0; i < 10 && B.winner(b) === null && !B.isFull(b); i++) {
    const c = AI.aiMove(b, 14, 999);
    out.push(c); b = B.play(b, c);
  }
  return out;
}
assert.deepStrictEqual(walk(), walk(), '撤销重走后 AI 改主意了 ⇒ 会被读成「它在偷看」');
console.log('test-ai: ⭐ 撤销后不改主意 OK');

// --- 顶档零失误：能赢必赢、该挡必挡 ---
const canWin = B.fromMoves([3, 4, 3, 4, 3, 4]);          // 轮先手，第 3 列可连四
assert.strictEqual(AI.aiMove(canWin, 20, 1), 3, '顶档必须抓住立即胜');
const mustBlock = B.fromMoves([3, 4, 3, 4, 3]);          // 轮后手，必须挡第 3 列
assert.strictEqual(AI.aiMove(mustBlock, 20, 1), 3, '顶档必须挡住立即负');
console.log('test-ai: 顶档零失误 OK');

// --- 所有档都绝不走「立即败招」（送对方连四）---
for (let tier = 1; tier <= 20; tier++) {
  for (let s = 0; s < 30; s++) {
    const c = AI.aiMove(mustBlock, tier, s);
    assert.ok(B.canPlay(mustBlock, c), 'tier ' + tier + ' 返回了非法列 ' + c);
  }
}
console.log('test-ai: 全档返回合法列 OK');

// --- 低档确实会失误（否则「阶梯」是假的）---
let mistakes = 0;
for (let s = 0; s < 60; s++) if (AI.aiMove(mustBlock, 1, s) !== 3) mistakes++;
assert.ok(mistakes > 0, '第 1 级从不失误 ⇒ 阶梯是假的');
console.log('test-ai: 低档会失误（阶梯真实）OK，60 次里失误 ' + mistakes + ' 次');

console.log('test-ai: 全部通过');
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node games/connect4/tests/test-ai-determinism.js`
Expected: FAIL — `Cannot find module '../js/ai.js'`

- [ ] **Step 3: 写实现**

Create `games/connect4/js/ai.js`:

```js
// connect4 的 20 级明面 AI 阶梯（DESIGN §3.1）。
//
// ⭐ 公平承诺写进类型签名：aiMove(position, tier, seed) -> column
//    入参里没有玩家历史、没有胜负记录、没有自适应状态 ⇒ 想作弊都没有入口。
//    ⛔ 永远不许给这个函数加第四个参数去读玩家状态（那会同时毁掉公平页、
//       复盘可重放、以及「撤销后不改主意」——tests/test-ai-determinism.js 守着）。
(function (root) {
  const isNode = (typeof module !== 'undefined' && module.exports);
  const B = isNode ? require('./bitboard.js') : root.Bitboard;
  const R = isNode ? require('./rules-classic.js') : root.RulesClassic;
  const S = isNode ? require('./solver.js') : root.Solver;

  /** 各级的「故意走次优」概率。第 20 级 = 0（完美），第 1 级 = 最菜。 */
  function slipRate(tier) {
    const t = Math.max(1, Math.min(20, tier | 0));
    if (t >= 20) return 0;
    return +(0.75 * Math.pow((20 - t) / 19, 1.5)).toFixed(4);
  }

  /** 确定性 PRNG（禁 Math.random —— 它会同时毁掉确定性与可重放）。 */
  function rngOf(bd, tier, seed) {
    let x = (seed >>> 0) ^ (tier * 2654435761) ^ (bd.n * 40503);
    for (let c = 0; c < B.W; c++) x = (x ^ (bd.a[c] * 73 + bd.b[c] * 19 + c)) >>> 0, x = (x * 1664525 + 1013904223) >>> 0;
    return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  }

  /**
   * @param {object} bd  位棋盘局面
   * @param {number} tier 1..20
   * @param {number} seed 本局种子
   * @returns {number} 列号 0..6
   */
  function aiMove(bd, tier, seed) {
    const legal = R.moves(bd);
    if (!legal.length) return -1;
    const t = Math.max(1, Math.min(20, tier | 0));
    const rnd = rngOf(bd, t, seed);

    // 低档（1-5）：只看两手 —— 能连四就连、对方要连四就挡，否则随机偏中路。
    if (t <= 5) {
      const mine = R.winningMoves(bd);
      if (mine.length) return mine[0];
      const oppBd = B.clone(bd); oppBd.turn ^= 1;
      const theirs = R.winningMoves(oppBd);
      if (theirs.length && rnd() > slipRate(t)) return theirs[0];
      return legal[Math.floor(rnd() * legal.length)];        // 偏中路由 R.ORDER 保证
    }

    // 中高档（6-20）：完美求解器 + 明面失误率。
    const scores = S.scoreAll(bd);
    const ranked = legal.slice().sort((x, y) => scores[y] - scores[x]);
    const best = ranked[0];
    if (rnd() >= slipRate(t)) return best;

    // 故意走次优 —— ⛔ 但绝不选「立即败招」（送对方当场连四）。
    const safe = ranked.slice(1).filter(c => {
      const after = B.play(bd, c);
      return R.winningMoves(after).length === 0;
    });
    return safe.length ? safe[Math.floor(rnd() * Math.min(2, safe.length))] : best;
  }

  const API = { aiMove, slipRate };
  if (isNode) module.exports = API; else root.AI = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `node games/connect4/tests/test-ai-determinism.js`
Expected: 末行 `test-ai: 全部通过`

- [ ] **Step 5: 挂进 test:c4 并提交**

```json
"test:c4": "node games/connect4/tests/test-bitboard.js && node games/connect4/tests/test-rules.js && node games/connect4/tests/test-solver.js && node games/connect4/tests/test-book.js && node games/connect4/tests/test-ai-determinism.js"
```

```bash
git add games/connect4/js/ai.js games/connect4/tests/test-ai-determinism.js package.json
git commit -m "connect4: 20 级明面 AI 阶梯（签名不含玩家状态，测试守死）"
```

---

## Task 9: `tools/sim-ai.js` —— 把失误率校准到目标胜率

规格 §3.1：`slipRate` 的曲线**必须由蒙特卡洛定，不是调参数试手感**（本仓惯例：数值靠模拟校准）。

**Files:**
- Create: `games/connect4/tools/sim-ai.js`
- Modify: `games/connect4/js/ai.js`（按结果调 `slipRate` 曲线）
- Modify: `package.json`

- [ ] **Step 1: 写模拟脚本**

Create `games/connect4/tools/sim-ai.js`:

```js
// 20 级 AI 胜率校准（DESIGN §3.1）。用「参考玩家」当尺子：
//   refPlayer = 会抓立即胜、会挡立即负、其余偏中路 —— 约等于一个懂规则的普通人。
// 目标曲线：第 1 级 ≈ 参考玩家 90% 胜；第 20 级 = 0%；中段（12 级左右）≈ 50%。
// 用法: node games/connect4/tools/sim-ai.js [每档局数]
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const AI = require('../js/ai.js');

const N = Number(process.argv[2] || 200);

function refPlayer(bd, rnd) {
  const mine = R.winningMoves(bd);
  if (mine.length) return mine[0];
  const opp = B.clone(bd); opp.turn ^= 1;
  const theirs = R.winningMoves(opp);
  if (theirs.length) return theirs[0];
  const legal = R.moves(bd);
  return legal[Math.floor(rnd() * Math.min(3, legal.length))];   // 偏中路
}

function mkRnd(s) { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

console.log('tier | 参考玩家胜 | 和 | 负 | slipRate');
for (let tier = 1; tier <= 20; tier++) {
  let win = 0, draw = 0, loss = 0;
  for (let g = 0; g < N; g++) {
    const rnd = mkRnd(1000 + g);
    let bd = B.newBoard();
    const playerFirst = g % 2 === 0;                 // 先后手各半，抵消先手优势
    while (true) {
      const t = R.terminal(bd);
      if (t !== null) {
        if (t === 'DRAW') draw++;
        else {
          const playerSide = playerFirst ? 0 : 1;
          if (t === 'WIN_' + playerSide) win++; else loss++;
        }
        break;
      }
      const playerTurn = (bd.turn === 0) === playerFirst;
      bd = B.play(bd, playerTurn ? refPlayer(bd, rnd) : AI.aiMove(bd, tier, 5000 + g));
    }
  }
  const pct = v => (100 * v / N).toFixed(0).padStart(3) + '%';
  console.log(String(tier).padStart(4), '|', pct(win).padStart(10), '|', pct(draw), '|', pct(loss), '|', AI.slipRate(tier));
}
```

- [ ] **Step 2: 跑模拟**

Run: `node games/connect4/tools/sim-ai.js 100`
Expected: 20 行，**参考玩家胜率应随 tier 单调下降**。

⚠ 高 tier 慢（每手要 `scoreAll`）。先用 `20` 局跑通形状，再用 `200` 局定值。

- [ ] **Step 3: 按数据调 `slipRate` 曲线**

若实测偏离目标（第 1 级 ~90% / 第 12 级 ~50% / 第 20 级 0%），改 `js/ai.js` 里 `slipRate` 的**指数 1.5** 和**系数 0.75**，重跑，直到三个锚点落位。

⛔ **不许改 `sim-ai.js` 的目标去迁就 AI**——目标是产品决策，曲线才是被校准的那个。

- [ ] **Step 4: 确认调完没破坏确定性**

Run: `node games/connect4/tests/test-ai-determinism.js`
Expected: `test-ai: 全部通过`

- [ ] **Step 5: 把定稿数值写回规格并提交**

在 `games/connect4/DESIGN.md` 的 §3.1 表格下补一行实测基线，例如：
`基线（sim-ai.js 200 局/档）：tier 1 参考玩家胜 XX% · tier 12 XX% · tier 20 0%`

```json
"sim:c4": "node games/connect4/tools/sim-ai.js"
```

```bash
git add games/connect4/tools/sim-ai.js games/connect4/js/ai.js games/connect4/DESIGN.md package.json
git commit -m "connect4: AI 阶梯胜率校准（蒙特卡洛定曲线，基线写回规格）"
```

---

## P1 完成判据

全部为真才算 P1 交付：

- [ ] `npm run test:c4` 全绿（bitboard / rules / solver / book / ai-determinism）
- [ ] `npm test` 全绿（connect4 已挂进串联，且没弄坏其他五个游戏）
- [ ] `node games/connect4/tools/test-truth.js; echo $?` → **exit=0**（⭐ 地面真值，用退出码裁决）
- [ ] `npm run bench:c4` 的表贴进了 Task 5 的提交信息，开局库深度 N 有据可依
- [ ] `games/connect4/data/book-classic.json` 大小已记录（>5MB 必须降档重生成）
- [ ] `npm run sim:c4` 的三个锚点落位，基线已写回 `DESIGN.md` §3.1

## 后续计划（各自独立成篇，不在本计划内）

| 计划 | 内容 |
|---|---|
| **P1b** | Pop Out 求解（规格 §1.2）——⚠ 有环，需重复判和 + 独立开局库，是另一套搜索，别塞进 P1 |
| **P2** | 可玩本体：`index.html`/`render.js`/`main.js` + §6 手感（按住预览松手才落、形状+颜色双编码、连线高亮、结算 ≤5s）+ i18n + E2E |
| **P3** | 提示 / 赛后复盘 / 精准度 / 妙手（规格 §3.2-3.4、§4）——全部读 `solver.scoreAll` |
| **P4** | 课程系统（规格 §5）：16 课 + 自动出题 + 自动判分 + 诊断推课 + `verify-lessons.js` |
| **P5** | 元游戏与变现（规格 §7-8）+ `test-noclone.js` + 上架素材 |
