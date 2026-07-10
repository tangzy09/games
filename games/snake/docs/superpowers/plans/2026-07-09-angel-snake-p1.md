# 天使贪吃蛇 P1(核心玩法 + AI,引擎集成版)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网页可玩的天使贪吃蛇核心版(接入 `Projects\games` monorepo 共享引擎):16×16 揭图玩法、苹果/连击/计分、死亡半长重生、按住加速、AI 代打(哈密顿回路+捷径+停滞保护,机器验证零死亡必通关),en+zh-CN 双语零硬编码文案。

**Architecture:** 引擎契约 = 全局脚本按序加载(无 bundler),游戏实现 `G` 状态对象 + 全局 `renderAll()`(每帧 clearHits→全量重画→addHit)+ `dispatch(action)`。纯逻辑模块(prng/core/ai)双导出(browser 全局 / node `module.exports`),node 直跑单测。引擎缺口在 `engine/` 补:`prng.js`(新模块)、`input.js` 加 opt-in `liveSwipe`。规格见 `games/snake/docs/superpowers/specs/2026-07-09-snake-angel-design.md`;引擎契约见 `engine/README.md`(先读它再动手)。

**Tech Stack:** vanilla JS(ES2019,无 TS 无打包)、引擎 canvas 2D 基建、node 内置 `assert`、素材 = language-study 的 webp 词图。

**约定(全部任务通用):**
- 仓库根 `c:\Users\tangz\Documents\Projects\games`(git main 分支),所有命令在仓库根执行。
- 纯逻辑文件结尾用双导出模板(engine 其余模块是浏览器全局脚本,不受影响):
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = X;
  else window.X = X;
  ```
- 测试:`node games/snake/tests/test-xxx.js`,断言失败即非零退出;文件末尾 `console.log('OK <名>')`。
- 本地跑游戏:仓库根 `python -m http.server 8000` → `http://localhost:8000/games/snake/`。
- 坐标系:`{x,y}`,x 向右 y 向下;格子线性索引 `i = y*cols + x`;方向 `'up'|'down'|'left'|'right'`(与引擎 onSwipe 一致)。
- P1 范围:果子只有苹果;皮肤固定云朵粉彩;无广告位/存档/音效(引擎 Ads/Sfx 仅按 boot 契约初始化,不接业务);语言只 en+zh-CN。

**File Structure(P1 全量):**

```
engine/prng.js                    # 新引擎模块:mulberry32 可注种子随机(双导出)
engine/input.js                   # 修改:加 opt-in liveSwipe(滑动即转向)
games/snake/index.html            # engine 加载序 + GAME_CONFIG + 游戏脚本
games/snake/css/game.css          # 云朵粉彩页面级样式(engine.css 之上)
games/snake/js/core.js            # 纯游戏状态机:移动/碰撞/揭图/苹果/连击/死亡重生/过关
games/snake/js/ai.js              # 哈密顿回路 + 安全捷径 + 停滞保护(纯函数)
games/snake/js/render.js          # renderAll 契约:布局/offscreen 底图+遮罩/HUD/棋盘/按钮/覆盖层
games/snake/js/main.js            # boot 契约、dispatch、rAF 固定步长循环、boost 按住、切后台暂停
games/snake/locales/en.json       # P1 文案(en 为基准)
games/snake/locales/zh-CN.json
games/snake/assets/angels/        # 24 张 webp + manifest.json(工具产出)
games/snake/tools/pick-images.js
games/snake/tests/test-prng.js  test-core.js  test-ai.js
```

---

### Task 1: engine/prng.js — 可注种子 PRNG

**Files:**
- Create: `engine/prng.js`
- Test: `games/snake/tests/test-prng.js`

- [ ] **Step 1: 写失败测试**

```js
// games/snake/tests/test-prng.js
const assert = require('assert');
const PRNG = require('../../../engine/prng.js');

const a = PRNG.create(42), b = PRNG.create(42), c = PRNG.create(7);
const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
assert.deepStrictEqual(seqA, seqB, '同种子序列必须一致');
assert.notDeepStrictEqual(seqA, [c(), c(), c()], '不同种子序列应不同');
for (let i = 0; i < 1000; i++) { const v = PRNG.create(i)(); assert(v >= 0 && v < 1, '值域 [0,1)'); }
console.log('OK test-prng');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node games/snake/tests/test-prng.js`
Expected: FAIL(Cannot find module '../../../engine/prng.js')

- [ ] **Step 3: 最小实现**

```js
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
```

(浏览器里顶层 `const PRNG` 即全局词法作用域,后续 `<script>` 可直接引用,与引擎其他模块一致;不需要挂 window。)

- [ ] **Step 4: 跑测试确认通过**

Run: `node games/snake/tests/test-prng.js` → `OK test-prng`

- [ ] **Step 5: 在 engine/README.md 的模块表登记**

在 `engine/README.md` 「各模块提供的全局」表末尾追加一行:

```markdown
| prng.js | `PRNG` | 可注种子随机(mulberry32);测试/每日种子/AI 验证用,替代 Math.random |
```

- [ ] **Step 6: Commit**

```bash
git add engine/prng.js engine/README.md games/snake/tests/test-prng.js
git commit -m "feat(engine): prng.js 可注种子随机模块(snake 首用)"
```

---

### Task 2: core.js — 状态机骨架:移动/撞墙/撞自己/身体渐长

**Files:**
- Create: `games/snake/js/core.js`
- Test: `games/snake/tests/test-core.js`

- [ ] **Step 1: 写失败测试**

```js
// games/snake/tests/test-core.js
const assert = require('assert');
const Core = require('../js/core.js');

// --- 初始状态 ---
let g = Core.createGame({ seed: 1 });
assert.strictEqual(g.cols, 16); assert.strictEqual(g.rows, 16);
assert.strictEqual(g.snake.length, 1, '开局只有蛇头');
assert.strictEqual(g.targetLen, 3);
assert(!g.dead);

// --- 移动:头前进,身体渐长到 targetLen ---
g = Core.createGame({ seed: 1 });
const h0 = { ...g.snake[0] };
Core.step(g);
assert.strictEqual(g.snake[0].x, h0.x + 1, '默认向右');
Core.step(g); Core.step(g); Core.step(g);
assert.strictEqual(g.snake.length, 3, '长到 targetLen 后不再涨');

// --- 撞墙死 ---
g = Core.createGame({ seed: 1 });
for (let i = 0; i < 20 && !g.dead; i++) Core.step(g);
assert(g.dead, '一直向右必撞墙');
assert.strictEqual(g.deaths, 1);

// --- 180° 禁转(len>1)与撞自己 ---
g = Core.createGame({ seed: 1 });
Core.step(g); Core.step(g); Core.step(g);          // len=3, dir right
Core.setDir(g, 'left');                             // 应被忽略
Core.step(g);
assert(!g.dead, '180° 掉头被忽略,不应死');
// 绕小圈撞自己
g = Core.createGame({ seed: 1 });
for (let i = 0; i < 6; i++) Core.step(g);           // len=3 直行
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'left'); Core.step(g);
Core.setDir(g, 'up');   Core.step(g);               // 撞回自己身体
assert(g.dead, '撞自己应死');
console.log('OK test-core(骨架)');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node games/snake/tests/test-core.js` → FAIL(Cannot find module '../js/core.js')

- [ ] **Step 3: 实现 core.js**

```js
// games/snake/js/core.js — 纯游戏状态机(无 DOM,双导出)
// 浏览器:PRNG 来自 engine/prng.js 全局;node:直接 require
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SNAKE_DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const COMBO_WINDOW_MS = 10000;   // 待校准(设计 §13)

function createGame(opts = {}) {
  const cols = opts.cols || 16, rows = opts.rows || 16;
  const s = {
    cols, rows,
    rand: PRNG_.create(opts.seed == null ? 1 : opts.seed),
    snake: [{ x: 3, y: 8 }],       // 头在前;身体随前进长出
    dir: 'right', nextDir: 'right',
    targetLen: 3,
    revealed: new Uint8Array(cols * rows), revealedCount: 0, milestones: 0,
    apple: null,
    score: 0, combo: 0, lastEatMs: -Infinity,
    level: 1, levelJustDone: false,
    dead: false, deaths: 0,
    stats: { apples: 0, steps: 0 },
  };
  revealCell(s, s.snake[0].x, s.snake[0].y);
  spawnApple(s);
  return s;
}

function idx(s, x, y) { return y * s.cols + x; }
function occupied(s, x, y) { return s.snake.some(c => c.x === x && c.y === y); }

function revealCell(s, x, y) {
  const i = idx(s, x, y);
  if (!s.revealed[i]) { s.revealed[i] = 1; s.revealedCount++; }
}

function spawnApple(s) {
  const free = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!occupied(s, x, y)) free.push({ x, y });
  s.apple = free.length ? free[Math.floor(s.rand() * free.length)] : null;
}

function setDir(s, dir) {
  if (!SNAKE_DIRS[dir]) return;
  if (s.snake.length > 1 && dir === OPP[s.dir]) return;
  s.nextDir = dir;
}

// o: {nowMs, freezeCombo, scoreScale, ghost} — 后两者供 AI 代打/光环(P2)用
function step(s, o = {}) {
  if (s.dead) return;
  s.levelJustDone = false;
  s.dir = s.nextDir;
  const d = SNAKE_DIRS[s.dir], head = s.snake[0];
  const nx = head.x + d.x, ny = head.y + d.y;
  if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) return die(s);
  const grow = s.snake.length < s.targetLen;
  const hitSelf = s.snake.some((c, i) => {
    if (!grow && i === s.snake.length - 1) return false;  // 尾巴同步让位
    return c.x === nx && c.y === ny;
  });
  if (hitSelf && !o.ghost) return die(s);
  s.snake.unshift({ x: nx, y: ny });
  if (!grow) s.snake.pop();
  s.stats.steps++;
  revealCell(s, nx, ny);
  checkMilestone(s, o);
  if (s.apple && s.apple.x === nx && s.apple.y === ny) eatApple(s, o);
  if (s.revealedCount === s.cols * s.rows) completeLevel(s, o);
}

function eatApple(s, o) {
  s.targetLen++; s.stats.apples++;
  const now = o.nowMs != null ? o.nowMs : s.stats.steps * 140;
  if (!o.freezeCombo && now - s.lastEatMs <= COMBO_WINDOW_MS) s.combo++;
  s.lastEatMs = now;
  s.score += Math.round(10 * (1 + 0.1 * s.combo) * (o.scoreScale || 1));
  spawnApple(s);
}

function checkMilestone(s, o) {
  const total = s.cols * s.rows;
  while (s.milestones < 3 && s.revealedCount / total >= (s.milestones + 1) * 0.25) {
    s.milestones++;
    s.score += Math.round(100 * (o.scoreScale || 1));
  }
}

function completeLevel(s, o) {
  s.score += Math.round(500 * (o.scoreScale || 1));
  s.level++; s.levelJustDone = true;
  s.revealed.fill(0); s.revealedCount = 0; s.milestones = 0;
  for (const c of s.snake) revealCell(s, c.x, c.y);  // 蛇站着的格子即时揭开
}

function die(s) { s.dead = true; s.deaths++; s.combo = 0; }

function respawn(s) {  // 半长重生:头置最空旷格,身体随前进长出
  const newLen = Math.max(3, Math.floor(s.snake.length / 2));
  let best = null, bestD = -1;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (s.apple && s.apple.x === x && s.apple.y === y) continue;
    let d = Infinity;
    for (const c of s.snake) d = Math.min(d, Math.abs(c.x - x) + Math.abs(c.y - y));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  s.snake = [best]; s.targetLen = newLen;
  s.dir = s.nextDir = (best.x < s.cols / 2 ? 'right' : 'left');
  s.dead = false;
  revealCell(s, best.x, best.y);
}

const Core = { createGame, setDir, step, respawn, DIRS: SNAKE_DIRS, COMBO_WINDOW_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
```

(浏览器里顶层 `const Core` 即全局;引擎 canvas.js 已占用 `T`/`ctx` 等名,本文件不与之冲突。)

- [ ] **Step 4: 跑测试确认通过**

Run: `node games/snake/tests/test-core.js` → `OK test-core(骨架)`

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/core.js games/snake/tests/test-core.js
git commit -m "feat(snake): core 状态机——移动/碰撞/渐长/180禁转"
```

---

### Task 3: core.js — 揭图/里程碑/过关/苹果/连击(测试补全)

代码在 Task 2 已就位,本任务用测试钉死行为,发现偏差就地修 core.js(不改测试意图)。

**Files:**
- Modify: `games/snake/tests/test-core.js`(追加)
- Modify: `games/snake/js/core.js`(仅当测试暴露 bug)

- [ ] **Step 1: 追加测试**

```js
// games/snake/tests/test-core.js 末尾追加(console.log 之前)
// --- 揭图:走过即揭,重复不计数 ---
g = Core.createGame({ seed: 2 });
const r0 = g.revealedCount;
Core.step(g);
assert.strictEqual(g.revealedCount, r0 + 1, '走一步揭一格');
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'left'); Core.step(g);
Core.setDir(g, 'up');   Core.step(g);
const rc = g.revealedCount;
Core.setDir(g, 'right'); Core.step(g);  // 回到已揭格(起点右一格)
assert(g.revealedCount === rc || g.revealedCount === rc + 1, '重走已揭格不重复计数');

// --- 吃苹果:得分/长度/连击窗口 ---
g = Core.createGame({ seed: 3 });
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 1000 });
assert.strictEqual(g.stats.apples, 1);
assert.strictEqual(g.targetLen, 4, '吃苹果 targetLen+1');
assert.strictEqual(g.combo, 0, '第一个苹果 combo=0');
assert.strictEqual(g.score, 10, '10 × (1+0) = 10');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 3000 });                       // 窗口内
assert.strictEqual(g.combo, 1, '窗口内连击+1');
assert.strictEqual(g.score, 10 + 11, '10×1.1=11');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 3000 + Core.COMBO_WINDOW_MS + 1 }); // 超窗
assert.strictEqual(g.combo, 1, '超窗连击不涨也不清');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
const cb = g.combo;
Core.step(g, { nowMs: g.lastEatMs + 100, freezeCombo: true });
assert.strictEqual(g.combo, cb, '加速期间连击冻结');

// --- AI 代打减分:scoreScale=0.5 ---
g = Core.createGame({ seed: 6 });
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 1000, scoreScale: 0.5 });
assert.strictEqual(g.score, 5, 'AI 代打得分减半');

// --- 过关:揭满触发,重置遮罩保留蛇 ---
g = Core.createGame({ seed: 4 });
g.revealed.fill(1); g.revealedCount = 16 * 16 - 1;
{
  const hx = g.snake[0].x + 1, hy = g.snake[0].y;
  g.revealed[hy * 16 + hx] = 0;         // 头右侧设为唯一未揭格
  g.apple = { x: 0, y: 0 };
  const lv = g.level, sc = g.score;
  Core.step(g);
  assert(g.levelJustDone, '揭满触发过关');
  assert.strictEqual(g.level, lv + 1);
  assert(g.score >= sc + 500, '过关奖励入账');
  assert.strictEqual(g.revealedCount, g.snake.length, '重置后仅蛇身格已揭');
}
console.log('OK test-core(揭图/苹果/连击/过关)');
```

- [ ] **Step 2: 跑测试**

Run: `node games/snake/tests/test-core.js` → 全过

- [ ] **Step 3: Commit**

```bash
git add games/snake/tests/test-core.js games/snake/js/core.js
git commit -m "test(snake): 揭图/连击窗口/冻结/AI减分/过关行为钉死"
```

---

### Task 4: core.js — 死亡半长重生(测试)

**Files:**
- Modify: `games/snake/tests/test-core.js`(追加)

- [ ] **Step 1: 追加测试**

```js
// games/snake/tests/test-core.js 追加
g = Core.createGame({ seed: 5 });
g.targetLen = 12;
// 蛇形走位把身体养长,然后掉头撞死
for (let i = 0; i < 14 && !g.dead; i++) {
  Core.setDir(g, ['right','down','left','down'][i % 4]); Core.step(g);
}
if (!g.dead) { Core.setDir(g, 'up'); while (!g.dead) Core.step(g); }
const lenBefore = g.snake.length;
const revBefore = g.revealedCount;
Core.respawn(g);
assert(!g.dead);
assert.strictEqual(g.snake.length, 1, '重生只有蛇头');
assert.strictEqual(g.targetLen, Math.max(3, Math.floor(lenBefore / 2)), '半长重生');
assert(g.revealedCount >= revBefore, '揭图进度保留');
assert.strictEqual(g.combo, 0, '死亡清连击');
console.log('OK test-core(重生)');
```

- [ ] **Step 2: 跑测试**

Run: `node games/snake/tests/test-core.js` → 全过(偏差就修 core.js)

- [ ] **Step 3: Commit**

```bash
git add games/snake/tests/test-core.js games/snake/js/core.js
git commit -m "test(snake): 半长重生/进度保留/连击清零"
```

---

### Task 5: ai.js — 哈密顿回路生成

**Files:**
- Create: `games/snake/js/ai.js`
- Test: `games/snake/tests/test-ai.js`

- [ ] **Step 1: 写失败测试**

```js
// games/snake/tests/test-ai.js
const assert = require('assert');
const AI = require('../js/ai.js');
const Core = require('../js/core.js');

const cyc = AI.buildCycle(16, 16);
assert.strictEqual(cyc.order.length, 256, '回路覆盖全部 256 格');
const seen = new Set(cyc.order.map(c => c.y * 16 + c.x));
assert.strictEqual(seen.size, 256, '每格恰好一次');
for (let i = 0; i < 256; i++) {
  const a = cyc.order[i], b = cyc.order[(i + 1) % 256];
  assert.strictEqual(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1,
    `第 ${i} 步必须相邻(含首尾闭合)`);
}
assert.strictEqual(cyc.indexOf[cyc.order[7].y * 16 + cyc.order[7].x], 7, 'indexOf 反查');
console.log('OK test-ai(回路)');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node games/snake/tests/test-ai.js` → FAIL(Cannot find module '../js/ai.js')

- [ ] **Step 3: 实现回路**

```js
// games/snake/js/ai.js — 哈密顿回路 + 捷径 + 停滞保护(纯函数,双导出)
const CoreRef = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;
const AIDIRS = CoreRef.DIRS;
const STALL_STEPS = 40;   // 待校准(设计 §13)

// S 形闭合回路:第 0 行通铺,1..rows-1 行在 x∈[1,cols-1] 蛇形,x=0 列收尾回起点
function buildCycle(cols, rows) {
  const order = [];
  for (let x = 0; x < cols; x++) order.push({ x, y: 0 });
  for (let y = 1; y < rows; y++) {
    if (y % 2 === 1) for (let x = cols - 1; x >= 1; x--) order.push({ x, y });
    else             for (let x = 1; x < cols; x++)      order.push({ x, y });
  }
  for (let y = rows - 1; y >= 1; y--) order.push({ x: 0, y });
  const indexOf = new Int32Array(cols * rows);
  order.forEach((c, i) => { indexOf[c.y * cols + c.x] = i; });
  return { order, indexOf, n: cols * rows };
}

const AI = { buildCycle, STALL_STEPS };
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
```

- [ ] **Step 4: 跑测试确认通过** → `OK test-ai(回路)`

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/ai.js games/snake/tests/test-ai.js
git commit -m "feat(snake): 哈密顿闭合回路生成+全覆盖断言"
```

---

### Task 6: ai.js — nextMove:纯回路跟随即通关

**Files:**
- Modify: `games/snake/js/ai.js`
- Modify: `games/snake/tests/test-ai.js`(追加)

- [ ] **Step 1: 追加失败测试**

```js
// games/snake/tests/test-ai.js 追加
{
  const g = Core.createGame({ seed: 11 });
  const mem = AI.createMem();
  mem.forcePure = true;                  // 测试钩子:只走回路
  let levels = 0;
  for (let i = 0; i < 10000 && levels < 2; i++) {
    Core.setDir(g, AI.nextMove(g, cyc, mem));
    Core.step(g);
    assert(!g.dead, `纯回路第 ${i} 步不该死`);
    if (g.levelJustDone) levels++;
  }
  assert(levels >= 2, '纯回路 10000 步内至少通关 2 次');
}
console.log('OK test-ai(纯回路)');
```

- [ ] **Step 2: 跑测试确认失败** → FAIL(AI.createMem is not a function)

- [ ] **Step 3: 实现 createMem + nextMove(纯回路部分)**

```js
// games/snake/js/ai.js 追加(const AI = ... 之前),并把 AI 对象改为含新导出
function createMem() {
  return { sinceReveal: 0, lastRevealCount: -1, forcePure: false };
}
function relDist(cyc, a, b) { return (b - a + cyc.n) % cyc.n; }
function dirBetween(a, b) {
  if (b.x === a.x + 1) return 'right';
  if (b.x === a.x - 1) return 'left';
  if (b.y === a.y + 1) return 'down';
  return 'up';
}

function nextMove(s, cyc, mem) {
  if (s.revealedCount !== mem.lastRevealCount) { mem.sinceReveal = 0; mem.lastRevealCount = s.revealedCount; }
  else mem.sinceReveal++;

  const head = s.snake[0];
  const hi = cyc.indexOf[head.y * s.cols + head.x];
  const succ = cyc.order[(hi + 1) % cyc.n];
  const pure = mem.forcePure || s.snake.length > cyc.n / 2 || mem.sinceReveal > STALL_STEPS * 2;
  if (pure) return dirBetween(head, succ);
  return shortcutMove(s, cyc, mem, hi, head) || dirBetween(head, succ);
}
function shortcutMove() { return null; }   // Task 7 实现

const AI = { buildCycle, createMem, nextMove, STALL_STEPS };
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
```

(注意:Task 5 里已有一份 `const AI = { buildCycle, STALL_STEPS }` 与导出,替换为上面这份,文件里只保留一份。)

- [ ] **Step 4: 跑测试确认通过** → `OK test-ai(纯回路)`(保底层机器验证)

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/ai.js games/snake/tests/test-ai.js
git commit -m "feat(snake): AI 纯回路跟随——保底层机器验证通过"
```

---

### Task 7: ai.js — 安全捷径 + 目标选择 + 停滞保护(核心保证测试)

**Files:**
- Modify: `games/snake/js/ai.js`
- Modify: `games/snake/tests/test-ai.js`(追加)

- [ ] **Step 1: 追加失败测试(「保证通关」的正式机器验证)**

```js
// games/snake/tests/test-ai.js 追加
{
  let totalSteps = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = Core.createGame({ seed });
    const mem = AI.createMem();
    let levels = 0, steps = 0;
    while (levels < 2) {
      Core.setDir(g, AI.nextMove(g, cyc, mem));
      Core.step(g);
      steps++;
      assert(!g.dead, `seed=${seed} 第 ${steps} 步死亡——安全不变式被破坏`);
      assert(steps < 20000, `seed=${seed} 超 2 万步未通 2 关——揭图停滞`);
      if (g.levelJustDone) levels++;
    }
    totalSteps += steps;
    assert(g.stats.apples > 0, '捷径模式应吃到苹果');
  }
  assert(totalSteps >= 2048, 'sanity:至少走完理论下限');
  console.log(`  完整 AI 5 种子 ×2 关,总步数 ${totalSteps},零死亡`);
}
console.log('OK test-ai(捷径+保证通关)');
```

- [ ] **Step 2: 跑测试**

Run: `node games/snake/tests/test-ai.js`
Expected: 纯回路空壳下也可能过——记下 totalSteps 基线,Step 3 实现真捷径后应显著下降。

- [ ] **Step 3: 实现捷径(替换 shortcutMove 空壳)**

```js
// games/snake/js/ai.js — 替换 shortcutMove
// 安全不变式:候选格回路前向距离 < 头→尾前向距离 - 余量(身体全部留在前向区间之外);
// 捷径只穿已揭格(目标格例外);等价代价偏好未揭格(顺路揭,防停滞保险 a)。
function shortcutMove(s, cyc, mem, hi, head) {
  const tail = s.snake[s.snake.length - 1];
  const ti = cyc.indexOf[tail.y * s.cols + tail.x];
  const headToTail = relDist(cyc, hi, ti);
  const margin = (s.targetLen - s.snake.length) + 4;

  // 目标:苹果;停滞时改打最近未揭格(防停滞保险 b)
  let target = s.apple;
  if (mem.sinceReveal > STALL_STEPS) target = nearestUnrevealed(s, head) || s.apple;
  if (!target) return null;
  const tIdx = cyc.indexOf[target.y * s.cols + target.x];

  let best = null, bestScore = Infinity;
  for (const dir of ['up', 'down', 'left', 'right']) {
    const d = AIDIRS[dir];
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
    if (s.snake.some(c => c.x === nx && c.y === ny)) continue;   // 尾巴也保守视为占用
    const ni = cyc.indexOf[ny * s.cols + nx];
    const fwd = relDist(cyc, hi, ni);
    const isSucc = fwd === 1;
    const isTargetCell = nx === target.x && ny === target.y;
    if (!isSucc) {
      if (s.snake.length >= 4 && fwd > headToTail - margin) continue;  // 安全不变式
      if (!s.revealed[ny * s.cols + nx] && !isTargetCell) continue;    // 捷径只穿已揭格
    }
    const score = relDist(cyc, ni, tIdx) * 2 + (s.revealed[ny * s.cols + nx] ? 1 : 0);
    if (score < bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

function nearestUnrevealed(s, from) {
  let best = null, bestD = Infinity;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (s.revealed[y * s.cols + x]) continue;
    const d = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}
```

- [ ] **Step 4: 跑全部测试**

Run: `node games/snake/tests/test-prng.js; node games/snake/tests/test-core.js; node games/snake/tests/test-ai.js`
Expected: 全过;totalSteps 较 Step 2 基线明显下降(捷径生效)

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/ai.js games/snake/tests/test-ai.js
git commit -m "feat(snake): AI 安全捷径+停滞保护——5种子零死亡必通关机器验证"
```

---

### Task 8: 抽图工具 + P1 素材(24 张)

**Files:**
- Create: `games/snake/tools/pick-images.js`
- Create: `games/snake/assets/angels/`(工具产出)

- [ ] **Step 1: 实现工具**

```js
// games/snake/tools/pick-images.js — 从 language-study 抽 N 张词图 + 生成 manifest
// 用法: node games/snake/tools/pick-images.js --count 24 --seed 1
const fs = require('fs'), path = require('path');
const PRNG = require('../../../engine/prng.js');

const SRC = 'C:/Users/tangz/Documents/Projects/language-study/images';
const DST = path.join(__dirname, '..', 'assets', 'angels');
const args = process.argv.slice(2);
const get = (k, dflt) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : dflt; };
const count = parseInt(get('--count', '24'), 10);
const rand = PRNG.create(parseInt(get('--seed', '1'), 10));

const all = fs.readdirSync(SRC).filter(f => f.endsWith('.webp') && !f.startsWith('_'));
if (all.length < count) throw new Error(`源图不足: ${all.length} < ${count}`);
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]];
}
const picked = all.slice(0, count).sort();
fs.mkdirSync(DST, { recursive: true });
for (const f of picked) fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
fs.writeFileSync(path.join(DST, 'manifest.json'),
  JSON.stringify({ v: 1, images: picked }, null, 1));
console.log(`copied ${picked.length} -> ${DST}`);
```

- [ ] **Step 2: 运行并独立复核**(写操作必验)

Run: `node games/snake/tools/pick-images.js --count 24 --seed 1`
复核: `node -e "const m=require('./games/snake/assets/angels/manifest.json');const fs=require('fs');console.log(m.images.length, m.images.every(f=>fs.existsSync('games/snake/assets/angels/'+f)))"`
Expected: `24 true`

- [ ] **Step 3: Commit**

```bash
git add games/snake/tools/pick-images.js games/snake/assets/angels
git commit -m "feat(snake): 抽图工具+24张P1素材+manifest"
```

---

### Task 9: engine/input.js — opt-in liveSwipe(滑动即转向)

引擎现状:swipe 在 `touchend` 判定(抬手才转向),对回合制够用,实时贪吃蛇手感差。加 **opt-in** 扩展:`Input.bind({ liveSwipe:true, ... })` 时 `touchmove` 累计位移 ≥24px 即触发 `onSwipe` 并重锚(支持一次按住连续转向)。不传 `liveSwipe` 的游戏(2048/_demo)行为完全不变。

**Files:**
- Modify: `engine/input.js`
- Modify: `engine/README.md`(input 行说明)

- [ ] **Step 1: 修改 engine/input.js**

在 `bind()` 内做两处修改。

其一,`let sx = 0, sy = 0, st = 0;` 一行改为:

```js
    let sx = 0, sy = 0, st = 0, movedLive = false;
```

`function start(x, y)` 改为:

```js
    function start(x, y) { sx = x; sy = y; st = Date.now(); movedLive = false; }
```

`function end(x, y)` 的 tap 分支加 movedLive 防御(liveSwipe 拖动后抬手不应误判为 tap):

```js
      if (dist < 10 && dt < 500 && !movedLive) {
```

其二,在 `cv.addEventListener('touchend', ...)` 之后插入:

```js
    // liveSwipe(opt-in):touchmove 位移过阈值即转向并重锚,实时游戏用
    cv.addEventListener('touchmove', e => {
      if (!H.liveSwipe || !H.onSwipe) return;
      if (H.canSwipe && !H.canSwipe()) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      movedLive = true;
      H.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
```

- [ ] **Step 2: 更新 engine/README.md 模块表 input 行**

```markdown
| input.js | `Input` | tap→hitTest→onAction;滑动/方向键→onSwipe(canSwipe 门控);`liveSwipe:true` 时 touchmove 即触发 onSwipe(实时游戏,opt-in,回合制游戏不受影响)|
```

- [ ] **Step 3: 回归验证 _demo 未破坏**

Run: 仓库根 `python -m http.server 8000`,开 `http://localhost:8000/games/_demo/`
Expected: demo 的 tap(START/TAP/HOME)行为正常,console 无错。

- [ ] **Step 4: Commit**

```bash
git add engine/input.js engine/README.md
git commit -m "feat(engine): input liveSwipe opt-in——touchmove 即转向,tap 防误触"
```

---

### Task 10: index.html + game.css + locales(en/zh-CN)

**Files:**
- Create: `games/snake/index.html`
- Create: `games/snake/css/game.css`
- Create: `games/snake/locales/en.json`, `games/snake/locales/zh-CN.json`

- [ ] **Step 1: index.html(严格按引擎加载序)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<title>Angel Snake</title>
<link rel="stylesheet" href="../../engine/engine.css">
<link rel="stylesheet" href="css/game.css">
</head>
<body>
<canvas id="game-canvas"></canvas>
<div id="controls"></div>

<script>
  window.GAME_CONFIG = {
    id: 'snake',
    languages: ['en', 'zh-CN'],   // P3 扩到 10 语
  };
</script>
<script src="../../engine/config.js"></script>
<script src="../../engine/platform.js"></script>
<script src="../../engine/i18n.js"></script>
<script src="../../engine/portal.js"></script>
<script src="../../engine/ads.js"></script>
<script src="../../engine/audio.js"></script>
<script src="../../engine/canvas.js"></script>
<script src="../../engine/input.js"></script>
<script src="../../engine/controls.js"></script>
<script src="../../engine/prng.js"></script>
<script src="js/core.js"></script>
<script src="js/ai.js"></script>
<script src="js/render.js"></script>
<script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: game.css(云朵粉彩页面级;canvas 绘制色板在 render.js)**

```css
/* games/snake/css/game.css — 云朵粉彩(engine.css 之上的页面级覆盖) */
body { background: #fdf3f7; }
```

- [ ] **Step 3: locales(en 为基准,两文件 key 完全一致)**

```json
// games/snake/locales/en.json
{
  "lang.name": "English",
  "lang.toggle": "Language",
  "snake.score": "Score",
  "snake.combo": "×{n}",
  "snake.pause": "⏸",
  "snake.paused": "Paused",
  "snake.resume": "Resume",
  "snake.dead": "Oops, crashed!",
  "snake.deadHint": "Length {from} → {to}",
  "snake.respawn": "Go again",
  "snake.levelDone": "Level {n} clear!",
  "snake.scoreVal": "Score {n}",
  "snake.next": "Next angel →",
  "snake.ai": "🤖 AI Play",
  "snake.boost": "💨 Boost"
}
```

```json
// games/snake/locales/zh-CN.json
{
  "lang.name": "简体中文",
  "lang.toggle": "语言",
  "snake.score": "分数",
  "snake.combo": "×{n}",
  "snake.pause": "⏸",
  "snake.paused": "已暂停",
  "snake.resume": "继续",
  "snake.dead": "哎呀,撞到了!",
  "snake.deadHint": "蛇长 {from} → {to}",
  "snake.respawn": "重新出发",
  "snake.levelDone": "第 {n} 关完成!",
  "snake.scoreVal": "得分 {n}",
  "snake.next": "下一张天使 →",
  "snake.ai": "🤖 AI 代打",
  "snake.boost": "💨 加速"
}
```

- [ ] **Step 4: locale 校验**

Run: `node tools/check-locales.js games/snake/locales`
Expected: 0 fail

- [ ] **Step 5: Commit**

```bash
git add games/snake/index.html games/snake/css games/snake/locales
git commit -m "feat(snake): 页面骨架(引擎加载序)+en/zh-CN 文案"
```

---

### Task 11: render.js — renderAll 契约(布局/底图遮罩/HUD/棋盘/按钮/覆盖层)

**Files:**
- Create: `games/snake/js/render.js`

- [ ] **Step 1: 实现**

```js
// games/snake/js/render.js — renderAll 契约:每帧从 G 全量重画。
// 依赖引擎全局:ctx/GameGlobal/clearHits/addHit/fillRR/strokeRR/roundRect/txt/txtL/drawDim/T
// 依赖 main.js 全局:G(状态)
const PAL = { bg:'#fdf3f7', cloud:'#f3e0ef', cloudEdge:'#e6c8e0', snake:'#f7b8d4',
  accent:'#e79cc2', accent2:'#b39ddb', text:'#7a5c72', bar:'#f6d5e5', card:'#ffffff',
  apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#5d4a57', btnOn:'#b39ddb' };

const Layout = { bx:0, by:0, bsize:0, cell:0, btnAI:null, btnBoost:null, btnPause:null };
let bgLayer = null, maskLayer = null, layerPx = 0;

function layoutBoard() {
  const { SW, SH, safeTop } = GameGlobal;
  const hudH = 54, btnH = 78;
  const size = Math.floor(Math.min(SW - 16, SH - safeTop - hudH - btnH - 20));
  Layout.bsize = size; Layout.cell = size / G.run.cols;
  Layout.bx = Math.floor((SW - size) / 2);
  Layout.by = safeTop + hudH;
  const bw = (size - 12) / 2, byy = Layout.by + size + 14;
  Layout.btnAI    = { x: Layout.bx,           y: byy, w: bw, h: 52 };
  Layout.btnBoost = { x: Layout.bx + bw + 12, y: byy, w: bw, h: 52 };
  Layout.btnPause = { x: Layout.bx + size - 40, y: safeTop + 8, w: 40, h: 36 };
}

// 每关/每次 resize 调:重建底图+遮罩 offscreen,并按 G.run.revealed 同步已揭格
function initLayers(img) {
  layoutBoard();
  layerPx = Math.max(64, Math.round(Layout.bsize * (window.devicePixelRatio || 1)));
  bgLayer = document.createElement('canvas'); bgLayer.width = bgLayer.height = layerPx;
  if (img) bgLayer.getContext('2d').drawImage(img, 0, 0, layerPx, layerPx);
  maskLayer = document.createElement('canvas'); maskLayer.width = maskLayer.height = layerPx;
  resetMask();
  for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++)
    if (G.run.revealed[y * G.run.cols + x]) punchCell(x, y);
}

function resetMask() {
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, layerPx, layerPx);
  m.fillStyle = PAL.cloud; m.fillRect(0, 0, layerPx, layerPx);
  m.strokeStyle = PAL.cloudEdge; m.lineWidth = 1;
  for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++) {
    m.beginPath();
    m.arc(x * pc + pc / 2, y * pc + pc / 2, pc * 0.34, 0, Math.PI * 2);
    m.stroke();                       // 云朵纹理:每格一圈
  }
}

function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function punchCell(x, y) {           // 揭开一格:遮罩挖圆角洞
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'destination-out';
  rrPath(m, x * pc + 1, y * pc + 1, pc - 2, pc - 2, pc * 0.3);
  m.fill();
}
function revealAllMask() { maskLayer.getContext('2d').clearRect(0, 0, layerPx, layerPx); }

function renderAll() {
  if (!G || !G.run || !ctx) return;
  clearHits();
  const { SW, SH, safeTop } = GameGlobal;
  ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, SW, SH);
  drawHud(safeTop);
  drawBoardArea();
  drawButtons();
  if (G.phase === 'PAUSED') drawOverlay(T('snake.paused'), '', T('snake.resume'), 'RESUME', false);
  else if (G.phase === 'DEAD') {
    const from = G.run.snake.length, to = Math.max(3, Math.floor(from / 2));
    drawOverlay(T('snake.dead'), T('snake.deadHint', { from, to }), T('snake.respawn'), 'RESPAWN', false);
  } else if (G.phase === 'LEVEL_DONE')
    drawOverlay(T('snake.levelDone', { n: G.run.level - 1 }), T('snake.scoreVal', { n: G.run.score }), T('snake.next'), 'NEXT', true);
}

function drawHud(safeTop) {
  const y = safeTop + 26;
  txtL(`${T('snake.score')} ${G.run.score}`, Layout.bx, y, PAL.text, 'bold 18px sans-serif');
  if (G.run.combo > 0)
    txtL(T('snake.combo', { n: G.run.combo }), Layout.bx + 130, y, PAL.accent, 'bold 16px sans-serif');
  // 进度条
  const pw = Layout.bsize * 0.42, px = Layout.bx + Layout.bsize - pw - 48, ph = 14;
  const pct = G.run.revealedCount / (G.run.cols * G.run.rows);
  fillRR(px, y - ph / 2, pw, ph, 7, PAL.bar);
  if (pct > 0) fillRR(px, y - ph / 2, Math.max(ph, pw * pct), ph, 7, PAL.accent);
  txt(Math.floor(pct * 100) + '%', px + pw / 2, y, PAL.text, 'bold 10px sans-serif');
  // 暂停按钮
  const b = Layout.btnPause;
  fillRR(b.x, b.y, b.w, b.h, 10, PAL.card);
  txt(T('snake.pause'), b.x + b.w / 2, b.y + b.h / 2, PAL.text, '16px sans-serif');
  addHit(b.x, b.y, b.w, b.h, 'PAUSE', {});
}

function drawBoardArea() {
  const { bx, by, bsize, cell } = Layout;
  fillRR(bx - 4, by - 4, bsize + 8, bsize + 8, 18, PAL.card);       // 棋盘卡片底
  if (bgLayer) ctx.drawImage(bgLayer, bx, by, bsize, bsize);
  if (maskLayer) ctx.drawImage(maskLayer, bx, by, bsize, bsize);
  // 收尾微光:≤10 未揭格呼吸提示
  const left = G.run.cols * G.run.rows - G.run.revealedCount;
  if (left > 0 && left <= 10 && G.phase === 'PLAYING') {
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 300);
    ctx.fillStyle = PAL.glow;
    for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++)
      if (!G.run.revealed[y * G.run.cols + x]) {
        rrPath(ctx, bx + x * cell + 2, by + y * cell + 2, cell - 4, cell - 4, cell * 0.3);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  }
  if (G.run.apple) drawApple(G.run.apple);
  drawSnake();
}

function drawApple(a) {
  const { bx, by, cell } = Layout;
  const cx = bx + a.x * cell + cell / 2;
  const cy = by + a.y * cell + cell / 2 + Math.sin(performance.now() / 250) * cell * 0.05;
  ctx.fillStyle = PAL.apple;
  ctx.beginPath(); ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.leaf;
  ctx.beginPath(); ctx.ellipse(cx + cell * 0.1, cy - cell * 0.3, cell * 0.12, cell * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
}

function drawSnake() {
  const { bx, by, cell } = Layout;
  const s = G.run;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.snake; ctx.lineWidth = cell * 0.72;
  ctx.beginPath();
  s.snake.forEach((c, i) => {
    const px = bx + c.x * cell + cell / 2, py = by + c.y * cell + cell / 2;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  if (s.snake.length === 1) ctx.lineTo(bx + s.snake[0].x * cell + cell / 2 + 0.1, by + s.snake[0].y * cell + cell / 2);
  ctx.stroke();
  // 头 + 大眼睛(朝向 dir)
  const h = s.snake[0], hx = bx + h.x * cell + cell / 2, hy = by + h.y * cell + cell / 2;
  ctx.fillStyle = PAL.snake;
  ctx.beginPath(); ctx.arc(hx, hy, cell * 0.42, 0, Math.PI * 2); ctx.fill();
  const d = Core.DIRS[s.dir];
  const ex = d.y !== 0 ? 0.16 : 0, ey = d.x !== 0 ? 0.16 : 0;
  for (const sgn of [-1, 1]) {
    const ox = hx + sgn * ex * cell + d.x * cell * 0.14, oy = hy + sgn * ey * cell + d.y * cell * 0.14;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, cell * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.eye;
    ctx.beginPath(); ctx.arc(ox + d.x * cell * 0.04, oy + d.y * cell * 0.04, cell * 0.07, 0, Math.PI * 2); ctx.fill();
  }
}

function drawButtons() {
  const a = Layout.btnAI, b = Layout.btnBoost;
  fillRR(a.x, a.y, a.w, a.h, 14, G.ai ? PAL.btnOn : PAL.accent);
  txt(T('snake.ai'), a.x + a.w / 2, a.y + a.h / 2, '#fff', 'bold 15px sans-serif');
  addHit(a.x, a.y, a.w, a.h, 'AI_TOGGLE', {});
  fillRR(b.x, b.y, b.w, b.h, 14, G.boostHeld ? PAL.btnOn : PAL.accent);
  txt(T('snake.boost'), b.x + b.w / 2, b.y + b.h / 2, '#fff', 'bold 15px sans-serif');
  // 注意:boost 不 addHit——按住逻辑由 main.js 原生 pointer 事件按 Layout.btnBoost 矩形处理
}

function drawOverlay(title, sub, btnLabel, action, showImg) {
  const { SW, SH } = GameGlobal;
  drawDim('rgba(122,92,114,0.45)');
  const cw = Math.min(SW * 0.86, 360);
  const ch = showImg ? cw + 150 : 190;
  const cx = (SW - cw) / 2, cy = (SH - ch) / 2;
  fillRR(cx, cy, cw, ch, 22, PAL.card);
  txt(title, cx + cw / 2, cy + 34, PAL.text, 'bold 20px sans-serif');
  let by = cy + 64;
  if (showImg && G.img) {
    const iw = cw - 44;
    ctx.drawImage(G.img, cx + 22, cy + 52, iw, iw);
    by = cy + 52 + iw + 24;
  }
  if (sub) { txt(sub, cx + cw / 2, by, PAL.text, '14px sans-serif'); by += 30; }
  const bw2 = 180, bh2 = 46;
  fillRR(cx + (cw - bw2) / 2, by, bw2, bh2, 14, PAL.accent);
  txt(btnLabel, cx + cw / 2, by + bh2 / 2, '#fff', 'bold 15px sans-serif');
  addHit(cx + (cw - bw2) / 2, by, bw2, bh2, action, {});
}
```

- [ ] **Step 2: Commit**(页面尚缺 main.js,渲染验收放 Task 12)

```bash
git add games/snake/js/render.js
git commit -m "feat(snake): renderAll 契约渲染——offscreen 底图/遮罩/HUD/覆盖层"
```

---

### Task 12: main.js — boot/dispatch/固定步长循环/boost 按住/暂停,P1 收官

**Files:**
- Create: `games/snake/js/main.js`

- [ ] **Step 1: 实现**

```js
// games/snake/js/main.js — 引擎 boot 契约 + 游戏主循环
const G = {
  phase: 'LOADING',        // LOADING | PLAYING | PAUSED | DEAD | LEVEL_DONE
  run: null, cyc: null, aiMem: null,
  ai: false, boostHeld: false,
  img: null, imgList: [], imgPos: 0,
  seed: (Date.now() % 2147483647),
};
const loopState = { last: 0, acc: 0 };

function dispatch(action) {
  switch (action) {
    case 'PAUSE':  if (G.phase === 'PLAYING') G.phase = 'PAUSED'; break;
    case 'RESUME': if (G.phase === 'PAUSED') { G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'AI_TOGGLE': G.ai = !G.ai; G.aiMem = AI.createMem(); break;
    case 'RESPAWN':
      Core.respawn(G.run);
      punchCell(G.run.snake[0].x, G.run.snake[0].y);
      G.phase = 'PLAYING'; loopState.last = 0; break;
    case 'NEXT': nextLevel(); break;
    default: break;
  }
  renderAll();
}

function speed() {   // 格/秒:基础7,随长缓升,封顶12(待校准);boost ×1.6
  const base = Math.min(12, 7 + 0.03 * G.run.snake.length);
  return base * (G.boostHeld && !G.ai ? 1.6 : 1);
}

function loadImage() {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { G.img = img; res(); };
    img.onerror = () => { G.img = null; res(); };   // 缺图也能玩(遮罩下是白底)
    img.src = 'assets/angels/' + G.imgList[G.imgPos % G.imgList.length];
  });
}
async function nextLevel() {
  G.imgPos++;
  await loadImage();
  initLayers(G.img);
  G.phase = 'PLAYING'; loopState.last = 0;
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (G.phase !== 'PLAYING') { loopState.last = ts; renderAll(); return; }
  if (!loopState.last) loopState.last = ts;
  loopState.acc += ts - loopState.last; loopState.last = ts;
  const interval = 1000 / speed();
  let guard = 0;
  while (loopState.acc >= interval && guard++ < 4 && G.phase === 'PLAYING') {
    loopState.acc -= interval;
    tick(ts);
  }
  renderAll();
}

function tick(nowMs) {
  const prev = G.run.revealedCount;
  if (G.ai) Core.setDir(G.run, AI.nextMove(G.run, G.cyc, G.aiMem));
  Core.step(G.run, { nowMs, freezeCombo: G.boostHeld && !G.ai, scoreScale: G.ai ? 0.5 : 1 });
  if (G.run.revealedCount > prev && !G.run.levelJustDone)
    punchCell(G.run.snake[0].x, G.run.snake[0].y);
  if (G.run.levelJustDone) { G.phase = 'LEVEL_DONE'; revealAllMask(); return; }
  if (G.run.dead) { G.phase = 'DEAD'; }
}

// boost 按住:canvas 原生 pointer 事件(引擎 Input 不管 hold)+ 空格
function bindBoost() {
  const cv = document.getElementById(CFG.canvasId);
  const inBoost = (e) => {
    const b = Layout.btnBoost;
    return b && e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h;
  };
  cv.addEventListener('pointerdown', e => { if (inBoost(e)) G.boostHeld = true; });
  cv.addEventListener('pointerup',   () => { G.boostHeld = false; });
  cv.addEventListener('pointercancel', () => { G.boostHeld = false; });
  document.addEventListener('keydown', e => { if (e.key === ' ') { G.boostHeld = true; e.preventDefault(); } });
  document.addEventListener('keyup',   e => { if (e.key === ' ') G.boostHeld = false; });
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  const mf = await fetch('assets/angels/manifest.json').then(r => r.json());
  G.imgList = mf.images;
  G.run = Core.createGame({ seed: G.seed });
  G.cyc = AI.buildCycle(G.run.cols, G.run.rows);
  G.aiMem = AI.createMem();
  await loadImage();
  initLayers(G.img);
  Input.bind({
    liveSwipe: true,
    onAction: dispatch,
    onSwipe: d => { if (!G.ai && G.phase === 'PLAYING') Core.setDir(G.run, d); },
    canSwipe: () => G.phase === 'PLAYING',
  });
  bindBoost();
  document.addEventListener('visibilitychange', () => { if (document.hidden) dispatch('PAUSE'); });
  window.addEventListener('resize', () => { initCanvas(); if (G.run) initLayers(G.img); renderAll(); });
  Controls.render();
  G.phase = 'PLAYING';
  requestAnimationFrame(frame);
}

boot();
```

- [ ] **Step 2: 全量回归 + 人工验收清单**(地面真值,亲眼看)

Run: `node games/snake/tests/test-prng.js; node games/snake/tests/test-core.js; node games/snake/tests/test-ai.js` → 全过
再 `python -m http.server 8000`(仓库根),开 `http://localhost:8000/games/snake/`:
1. 键盘玩:走过的格子露出天使图,进度条涨;
2. 吃苹果:分数涨、连击 ×n 出现、蛇变长;
3. 撞墙:死亡卡片(蛇长 X→Y)→ 重新出发 → 半长、进度还在;
4. 揭满:过关卡片展示全图 → 下一张,遮罩重置、蛇长保留;
5. 🤖 AI 代打:开着放 5 分钟,连续过关零死亡,按钮态变紫;
6. 💨 按住加速(按钮/空格):变快且连击数不涨;
7. 触屏(devtools 手机模拟):滑动即转向,拖动后抬手不误触按钮;
8. 切后台再回来:自动暂停;右上 ⏸ 可暂停/继续;
9. 顶栏语言切到中文:全部文案变中文;
10. `http://localhost:8000/games/_demo/` 回归正常(引擎改动无破坏)。

- [ ] **Step 3: Commit + 标记 P1 完成**

```bash
git add games/snake/js/main.js
git commit -m "feat(snake): boot契约/主循环/boost按住/暂停——P1 网页可玩"
git tag snake-p1-playable
```

---

## Self-Review 记录

- **Spec 覆盖(P1 范围)**:§2 揭图/过关/半长重生(头置最空旷格渐长)/速度曲线/加速(canvas 按钮 hold+空格,连击冻结)/连击 10s 窗口死亡清零/里程碑与过关奖励/收尾微光 → Task 2/3/4/11/12;§4 AI 三层+停滞保护+纯函数+机器验证 → Task 5/6/7;§9 零硬编码文案 en+zh-CN + check-locales → Task 10;§12 引擎契约(G/renderAll/dispatch/boot 全流程)/引擎缺口在 engine 补(prng、liveSwipe)/可注种子/visibilitychange 暂停/offscreen 遮罩 → Task 1/9/11/12;§13 初始值全部入码。
- **P1 明确不含**:特殊果 12 种、成就、图鉴 UI、4 皮肤、音效业务、分享卡片、存档业务、广告位业务、复活(死亡只有半长重生)——引擎 Ads/Sfx 仅按契约初始化。
- **占位符扫描**:无 TBD/TODO;每步含完整代码或确切命令。
- **命名一致性**:`Core.createGame/setDir/step/respawn/DIRS/COMBO_WINDOW_MS`;`AI.buildCycle/createMem/nextMove/STALL_STEPS`;render 提供全局 `renderAll/initLayers/punchCell/revealAllMask/Layout`(main.js 使用);`G/dispatch` 契约名与引擎 README 一致;core 内部用 `SNAKE_DIRS`/`PRNG_`、ai 用 `CoreRef/AIDIRS` 避免与引擎全局(`T`/`ctx`/`canvas`)撞名。
- **引擎改动最小且向后兼容**:prng.js 纯新增;input.js liveSwipe 为 opt-in,tap 判定加 `movedLive` 防御,_demo/2048 行为不变(Task 12 验收含 _demo 回归)。
- **已知取舍**:渲染无自动测试,靠 Task 12 十项人工清单;Task 3 揭图测试的走位坐标若与实现有出入,按「意图不变、坐标可调」处理。
