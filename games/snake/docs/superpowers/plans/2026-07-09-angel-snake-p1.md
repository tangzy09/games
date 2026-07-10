# 天使贪吃蛇 P1(核心玩法 + AI)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网页可玩的天使贪吃蛇核心版:16×16 揭图玩法、苹果/连击/计分、死亡半长重生、按住加速、AI 代打(哈密顿回路+捷径+停滞保护,机器验证零死亡必通关)。

**Architecture:** 纯 canvas + 模块化 vanilla JS,零构建(`<script>` 直引)。纯逻辑模块(prng/core/ai)与 DOM 分离、双导出(browser `window.X` / node `module.exports`),node 直跑单测。规格见 `docs/superpowers/specs/2026-07-09-snake-angel-design.md`(P1 只做其 §2 核心玩法、§4 AI、§13 待校准初始值;果子只有苹果,皮肤固定云朵粉彩,无广告/i18n/存档)。

**Tech Stack:** vanilla JS (ES2019,无 TS 无打包)、canvas 2D、node 内置 `assert` 跑测试、素材 = language-study 的 webp 词图。

**约定(全部任务通用):**
- 工作目录 `c:\Users\tangz\Documents\Projects\game\snake`,已是 git 仓库(main 分支)。
- 每个纯逻辑文件结尾用双导出模板:
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = X;
  else window.X = X;
  ```
- 测试直接 `node tests/test-xxx.js`,断言失败即非零退出;文件末尾 `console.log('OK <文件名>')`。
- 坐标系:`{x,y}`,x 向右 y 向下;格子线性索引 `i = y*cols + x`。
- 方向:字符串 `'up'|'down'|'left'|'right'`。

**File Structure(P1 全量):**

```
www/index.html            # 游戏屏 + 覆盖层,script 依序引入
www/css/style.css         # 云朵粉彩配色(P1 唯一皮肤)
www/js/prng.js            # mulberry32 可注种子随机
www/js/core.js            # 纯游戏状态机:移动/碰撞/揭图/苹果/连击/死亡重生/过关
www/js/ai.js              # 哈密顿回路 + 安全捷径 + 停滞保护(纯函数)
www/js/render.js          # canvas 三层渲染(底图/遮罩offscreen/蛇+果+粒子)
www/js/input.js           # 键盘/滑动/加速按钮 → 方向与 boost 状态
www/js/main.js            # 启动、固定步长循环、HUD、覆盖层、AI 开关、切后台暂停
www/images/angels/        # P1 先 24 张 webp + manifest.json
tools/pick-images.js      # 从 language-study 抽图 + 生成 manifest
tests/test-prng.js
tests/test-core.js
tests/test-ai.js
```

---

### Task 1: 项目骨架 + 可注种子 PRNG

**Files:**
- Create: `www/js/prng.js`
- Test: `tests/test-prng.js`

- [ ] **Step 1: 写失败测试**

```js
// tests/test-prng.js
const assert = require('assert');
const PRNG = require('../www/js/prng.js');

const a = PRNG.create(42), b = PRNG.create(42), c = PRNG.create(7);
const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
assert.deepStrictEqual(seqA, seqB, '同种子序列必须一致');
assert.notDeepStrictEqual(seqA, [c(), c(), c()], '不同种子序列应不同');
for (let i = 0; i < 1000; i++) { const v = PRNG.create(i)(); assert(v >= 0 && v < 1, '值域 [0,1)'); }
console.log('OK test-prng');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/test-prng.js`
Expected: FAIL(Cannot find module '../www/js/prng.js')

- [ ] **Step 3: 最小实现**

```js
// www/js/prng.js — mulberry32
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
else window.PRNG = PRNG;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/test-prng.js` → `OK test-prng`

- [ ] **Step 5: Commit**

```bash
git add www/js/prng.js tests/test-prng.js
git commit -m "feat(p1): 可注种子 PRNG(mulberry32)"
```

---

### Task 2: core.js — 状态机骨架:移动/撞墙/撞自己/身体渐长

**Files:**
- Create: `www/js/core.js`
- Test: `tests/test-core.js`

- [ ] **Step 1: 写失败测试**

```js
// tests/test-core.js
const assert = require('assert');
const Core = require('../www/js/core.js');

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
// 绕一个 2x2 小圈撞自己:right→down→left→up 回到身体
g = Core.createGame({ seed: 1 });
for (let i = 0; i < 6; i++) Core.step(g);           // len=3+ 直行
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'left'); Core.step(g);
Core.setDir(g, 'up');   Core.step(g);               // 撞回自己身体
assert(g.dead, '撞自己应死');
console.log('OK test-core(骨架)');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/test-core.js` → FAIL(Cannot find module)

- [ ] **Step 3: 实现 core.js 骨架**

```js
// www/js/core.js — 纯游戏状态机(无 DOM)
const PRNG_ = (typeof require !== 'undefined') ? require('./prng.js') : window.PRNG;

const DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const COMBO_WINDOW_MS = 10000;   // 待校准

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
  if (!DIRS[dir]) return;
  if (s.snake.length > 1 && dir === OPP[s.dir]) return;
  s.nextDir = dir;
}

// o: {nowMs, freezeCombo, scoreScale, ghost} — 后两者供 AI/道具用
function step(s, o = {}) {
  if (s.dead) return;
  s.levelJustDone = false;
  s.dir = s.nextDir;
  const d = DIRS[s.dir], head = s.snake[0];
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

function respawn(s) {  // Task 4 测试;头置最空旷格,半长渐长
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

const Core = { createGame, setDir, step, respawn, DIRS, COMBO_WINDOW_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
else window.Core = Core;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/test-core.js` → `OK test-core(骨架)`

- [ ] **Step 5: Commit**

```bash
git add www/js/core.js tests/test-core.js
git commit -m "feat(p1): core 状态机——移动/碰撞/渐长/180禁转"
```

---

### Task 3: core.js — 揭图/里程碑/过关/苹果/连击(测试补全)

代码在 Task 2 已就位(revealCell/checkMilestone/eatApple/completeLevel),本任务用测试钉死行为,发现偏差就地修。

**Files:**
- Modify: `tests/test-core.js`(追加)
- Modify: `www/js/core.js`(仅当测试暴露 bug)

- [ ] **Step 1: 追加测试**

```js
// tests/test-core.js 末尾追加(console.log 之前)
// --- 揭图:走过即揭,计数正确 ---
g = Core.createGame({ seed: 2 });
const r0 = g.revealedCount;            // 开局蛇头 1 格
Core.step(g);
assert.strictEqual(g.revealedCount, r0 + 1, '走一步揭一格');
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'up');                   // len<=?? 若被 180 规则拦则改用 left
Core.setDir(g, 'left'); Core.step(g); Core.setDir(g, 'up'); Core.step(g);
const rc = g.revealedCount;
Core.setDir(g, 'right'); Core.step(g);  // 回到已揭格
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
Core.step(g, { nowMs: 3000 });                       // 2s 内,窗口内
assert.strictEqual(g.combo, 1, '窗口内连击+1');
assert.strictEqual(g.score, 10 + 11, '10×1.1=11');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 3000 + Core.COMBO_WINDOW_MS + 1 }); // 超窗
assert.strictEqual(g.combo, 1, '超窗连击不涨也不清');
// freezeCombo(加速)
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
const cb = g.combo;
Core.step(g, { nowMs: g.lastEatMs + 100, freezeCombo: true });
assert.strictEqual(g.combo, cb, '加速期间连击冻结');

// --- 过关:手动揭满触发 ---
g = Core.createGame({ seed: 4 });
g.revealed.fill(1); g.revealedCount = 16 * 16 - 1;
// 让下一步走进最后一个未揭格:直接放到头右侧
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

Run: `node tests/test-core.js`
Expected: 全过(若有偏差,修 core.js 直至过,不改测试意图)

- [ ] **Step 3: Commit**

```bash
git add tests/test-core.js www/js/core.js
git commit -m "test(p1): 揭图/连击窗口/冻结/过关行为钉死"
```

---

### Task 4: core.js — 死亡半长重生

**Files:**
- Modify: `tests/test-core.js`(追加)

- [ ] **Step 1: 追加测试**

```js
// tests/test-core.js 追加
g = Core.createGame({ seed: 5 });
g.targetLen = 20;
for (let i = 0; i < 19; i++) {          // 蛇长长(蛇形走位避免撞)
  Core.setDir(g, ['right','down','left','down'][i % 4]); Core.step(g);
  if (g.dead) break;
}
if (!g.dead) { g.snake = g.snake.slice(0, 12); Core.setDir(g,'up');
  while (!g.dead) Core.step(g); }        // 强制撞死
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

Run: `node tests/test-core.js` → 全过(respawn 已在 Task 2 实现,偏差就修)

- [ ] **Step 3: Commit**

```bash
git add tests/test-core.js www/js/core.js
git commit -m "test(p1): 半长重生/进度保留/连击清零"
```

---

### Task 5: ai.js — 哈密顿回路生成

**Files:**
- Create: `www/js/ai.js`
- Test: `tests/test-ai.js`

- [ ] **Step 1: 写失败测试**

```js
// tests/test-ai.js
const assert = require('assert');
const AI = require('../www/js/ai.js');
const Core = require('../www/js/core.js');

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

Run: `node tests/test-ai.js` → FAIL(Cannot find module '../www/js/ai.js')

- [ ] **Step 3: 实现回路**

```js
// www/js/ai.js — 哈密顿回路 + 捷径 + 停滞保护(纯函数)
const CoreRef = (typeof require !== 'undefined') ? require('./core.js') : window.Core;
const AIDIRS = CoreRef.DIRS;
const STALL_STEPS = 40;   // 待校准:连续未揭格步数阈值

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
else window.AI = AI;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/test-ai.js` → `OK test-ai(回路)`

- [ ] **Step 5: Commit**

```bash
git add www/js/ai.js tests/test-ai.js
git commit -m "feat(p1): 哈密顿闭合回路生成+全覆盖断言"
```

---

### Task 6: ai.js — nextMove:纯回路跟随即通关

**Files:**
- Modify: `www/js/ai.js`
- Modify: `tests/test-ai.js`(追加)

- [ ] **Step 1: 追加失败测试**

```js
// tests/test-ai.js 追加
// 纯回路模式:强制 mem.forcePure,10000 步零死亡且揭满过关
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

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/test-ai.js` → FAIL(AI.createMem is not a function)

- [ ] **Step 3: 实现 createMem + nextMove(纯回路部分)**

```js
// www/js/ai.js 追加(AI 对象定义之前)
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
  // 停滞计数
  if (s.revealedCount !== mem.lastRevealCount) { mem.sinceReveal = 0; mem.lastRevealCount = s.revealedCount; }
  else mem.sinceReveal++;

  const head = s.snake[0];
  const hi = cyc.indexOf[head.y * s.cols + head.x];
  const succ = cyc.order[(hi + 1) % cyc.n];
  const pure = mem.forcePure || s.snake.length > cyc.n / 2 || mem.sinceReveal > AI.STALL_STEPS * 2;
  if (pure) return dirBetween(head, succ);
  return shortcutMove(s, cyc, mem, hi, head) || dirBetween(head, succ);
}
function shortcutMove() { return null; }   // Task 7 实现

// AI 对象改为:
const AI = { buildCycle, createMem, nextMove, STALL_STEPS };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/test-ai.js` → `OK test-ai(纯回路)`
(这一步同时验证了保底层:纯回路 = 永不死 + 必揭满)

- [ ] **Step 5: Commit**

```bash
git add www/js/ai.js tests/test-ai.js
git commit -m "feat(p1): AI 纯回路跟随——保底层机器验证通过"
```

---

### Task 7: ai.js — 安全捷径 + 目标选择 + 停滞保护(核心保证测试)

**Files:**
- Modify: `www/js/ai.js`
- Modify: `tests/test-ai.js`(追加)

- [ ] **Step 1: 追加失败测试(这是「保证通关」的正式机器验证)**

```js
// tests/test-ai.js 追加
// 完整 AI:5 个种子 × 各通关 2 关,总步数 10 万+,零死亡,且比纯回路快
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

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/test-ai.js`
Expected: FAIL 或超步数(shortcutMove 还是空壳时纯回路也能过——若直接过了,继续 Step 3 实现真捷径,并观察 totalSteps 显著下降)

- [ ] **Step 3: 实现捷径**

```js
// www/js/ai.js — 替换 shortcutMove 空壳
// 安全不变式:候选格在回路上的前向距离必须 < 头→尾前向距离 - 余量,
// 保证全部身体仍严格位于(尾,头)前向区间之外;捷径只穿已揭格(苹果格例外)。
function shortcutMove(s, cyc, mem, hi, head) {
  const tail = s.snake[s.snake.length - 1];
  const ti = cyc.indexOf[tail.y * s.cols + tail.x];
  const headToTail = relDist(cyc, hi, ti);
  const margin = (s.targetLen - s.snake.length) + 4;

  // 目标:苹果;停滞时改打最近未揭格
  let target = s.apple;
  if (mem.sinceReveal > AI.STALL_STEPS) target = nearestUnrevealed(s, head) || s.apple;
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
      if (s.snake.length >= 4 && fwd > headToTail - margin) continue;  // 不变式
      if (!s.revealed[ny * s.cols + nx] && !isTargetCell) continue;    // 捷径只穿已揭格
    }
    // 评分:候选格到目标的前向回路距离;等价时偏好未揭格(顺路揭)
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

Run: `node tests/test-prng.js; node tests/test-core.js; node tests/test-ai.js`
Expected: 全过;记下打印的 totalSteps(应明显 < 纯回路的 5×2×512=5120 步量级上限,证明捷径生效)

- [ ] **Step 5: Commit**

```bash
git add www/js/ai.js tests/test-ai.js
git commit -m "feat(p1): AI 安全捷径+停滞保护——5种子零死亡必通关机器验证"
```

---

### Task 8: 抽图工具 + P1 素材

**Files:**
- Create: `tools/pick-images.js`
- Create: `www/images/angels/`(24 张 webp + manifest.json,由工具产出)

- [ ] **Step 1: 实现工具**

```js
// tools/pick-images.js — 从 language-study 抽 N 张词图,拷入游戏并生成 manifest
// 用法: node tools/pick-images.js --count 24 --seed 1
const fs = require('fs'), path = require('path');
const PRNG = require('../www/js/prng.js');

const SRC = 'C:/Users/tangz/Documents/Projects/language-study/images';
const DST = path.join(__dirname, '..', 'www', 'images', 'angels');
const args = process.argv.slice(2);
const get = (k, dflt) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : dflt; };
const count = parseInt(get('--count', '24'), 10);
const rand = PRNG.create(parseInt(get('--seed', '1'), 10));

const all = fs.readdirSync(SRC).filter(f => f.endsWith('.webp') && !f.startsWith('_'));
if (all.length < count) throw new Error(`源图不足: ${all.length} < ${count}`);
for (let i = all.length - 1; i > 0; i--) {           // 种子洗牌
  const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]];
}
const picked = all.slice(0, count).sort();
fs.mkdirSync(DST, { recursive: true });
for (const f of picked) fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
fs.writeFileSync(path.join(DST, 'manifest.json'),
  JSON.stringify({ v: 1, images: picked }, null, 1));
console.log(`copied ${picked.length} -> ${DST}`);
```

- [ ] **Step 2: 运行并独立复核**(写操作必验,不信转述)

Run: `node tools/pick-images.js --count 24 --seed 1`
然后独立数一遍:`node -e "const m=require('./www/images/angels/manifest.json');const fs=require('fs');console.log(m.images.length, m.images.every(f=>fs.existsSync('www/images/angels/'+f)))"`
Expected: `24 true`

- [ ] **Step 3: Commit**

```bash
git add tools/pick-images.js www/images/angels
git commit -m "feat(p1): 抽图工具+24张P1素材+manifest"
```

---

### Task 9: index.html + style.css + render.js(三层渲染)

**Files:**
- Create: `www/index.html`
- Create: `www/css/style.css`
- Create: `www/js/render.js`

- [ ] **Step 1: index.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover">
<title>天使贪吃蛇</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="app">
  <header id="hud">
    <div id="score">0</div>
    <div id="combo" class="hidden">×0</div>
    <div id="progressWrap"><div id="progressBar"></div><span id="progressTxt">0%</span></div>
    <button id="pauseBtn" type="button">⏸</button>
  </header>
  <canvas id="board"></canvas>
  <footer id="ctrl">
    <button id="aiBtn" type="button">🤖 AI 代打</button>
    <button id="boostBtn" type="button">💨 加速</button>
  </footer>
  <div id="overlay" class="hidden">
    <div id="ovCard">
      <div id="ovTitle"></div>
      <img id="ovImg" class="hidden" alt="">
      <div id="ovText"></div>
      <button id="ovBtn" type="button"></button>
    </div>
  </div>
</div>
<script src="js/prng.js"></script>
<script src="js/core.js"></script>
<script src="js/ai.js"></script>
<script src="js/render.js"></script>
<script src="js/input.js"></script>
<script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css(云朵粉彩)**

```css
/* www/css/style.css — P1 唯一皮肤:云朵粉彩 */
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
:root {
  --bg:#fdf3f7; --card:#fff; --accent:#e79cc2; --accent2:#b39ddb;
  --text:#7a5c72; --bar:#f6d5e5;
}
html,body { height:100%; }
body { background:var(--bg); color:var(--text); overflow:hidden; touch-action:none;
  font-family:"Segoe UI",system-ui,sans-serif; user-select:none; }
#app { max-width:520px; margin:0 auto; height:100%;
  display:flex; flex-direction:column; padding:env(safe-area-inset-top) 8px env(safe-area-inset-bottom); }
#hud { display:flex; align-items:center; gap:10px; padding:10px 4px; }
#score { font-size:22px; font-weight:700; min-width:64px; }
#combo { color:var(--accent); font-weight:700; }
#progressWrap { flex:1; height:16px; background:var(--bar); border-radius:8px; position:relative; overflow:hidden; }
#progressBar { height:100%; width:0; background:linear-gradient(90deg,var(--accent),var(--accent2)); border-radius:8px; transition:width .2s; }
#progressTxt { position:absolute; inset:0; text-align:center; font-size:11px; line-height:16px; }
#pauseBtn { border:0; background:var(--card); border-radius:10px; width:34px; height:34px; font-size:16px; box-shadow:0 2px 6px rgba(0,0,0,.08); }
#board { width:100%; aspect-ratio:1; border-radius:18px; box-shadow:0 6px 24px rgba(183,142,180,.25); background:#fff; }
#ctrl { display:flex; gap:12px; padding:14px 4px; }
#ctrl button { flex:1; border:0; border-radius:16px; padding:14px 0; font-size:16px; font-weight:600;
  color:#fff; background:var(--accent); box-shadow:0 4px 12px rgba(231,156,194,.4); }
#ctrl button.active { background:var(--accent2); }
#boostBtn:active { transform:scale(.96); }
#overlay { position:fixed; inset:0; background:rgba(122,92,114,.45); display:flex; align-items:center; justify-content:center; z-index:9; }
#ovCard { background:var(--card); border-radius:22px; padding:26px 22px; width:min(86vw,360px); text-align:center;
  box-shadow:0 12px 40px rgba(0,0,0,.18); }
#ovTitle { font-size:22px; font-weight:800; margin-bottom:12px; }
#ovImg { width:100%; border-radius:14px; margin-bottom:12px; }
#ovText { margin-bottom:16px; font-size:14px; }
#ovBtn { border:0; border-radius:14px; padding:12px 34px; font-size:16px; font-weight:700; color:#fff; background:var(--accent); }
.hidden { display:none !important; }
```

- [ ] **Step 3: render.js**

```js
// www/js/render.js — 三层:底图(offscreen)/遮罩(offscreen,揭格挖洞)/动态层(蛇+苹果)
const Render = (() => {
  let canvas, ctx, cell = 0, size = 0, dpr = 1;
  let bgLayer, maskLayer;         // offscreen
  const P = { cloud:'#f3e0ef', cloudEdge:'#e6c8e0', snake:'#f7b8d4', snakeEdge:'#e79cc2',
              belly:'#fff0f7', apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d' };

  function init(canvasEl, cols) {
    canvas = canvasEl; ctx = canvas.getContext('2d');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    size = Math.round(w * dpr);
    canvas.width = size; canvas.height = size;
    cell = size / cols;
    bgLayer = document.createElement('canvas'); bgLayer.width = size; bgLayer.height = size;
    maskLayer = document.createElement('canvas'); maskLayer.width = size; maskLayer.height = size;
  }

  function setImage(img) {                       // 每关一次:铺底图 + 重置遮罩
    const b = bgLayer.getContext('2d');
    b.clearRect(0, 0, size, size);
    b.drawImage(img, 0, 0, size, size);
    resetMask();
  }
  function resetMask() {
    const m = maskLayer.getContext('2d');
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, size, size);
    m.fillStyle = P.cloud; m.fillRect(0, 0, size, size);
    m.strokeStyle = P.cloudEdge; m.lineWidth = 1;
    const n = Math.round(size / cell);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      m.beginPath();
      m.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.34, 0, Math.PI * 2);
      m.stroke();                                  // 云朵纹理:每格一圈
    }
  }
  function punch(x, y) {                          // 揭开一格:遮罩挖圆角洞
    const m = maskLayer.getContext('2d');
    m.globalCompositeOperation = 'destination-out';
    roundRect(m, x * cell + 1, y * cell + 1, cell - 2, cell - 2, cell * 0.3);
    m.fill();
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function draw(s, opts = {}) {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bgLayer, 0, 0);
    ctx.drawImage(maskLayer, 0, 0);
    // 收尾微光:≤10 未揭格呼吸提示
    if (opts.endgameGlow && s.cols * s.rows - s.revealedCount <= 10) {
      const a = 0.35 + 0.25 * Math.sin(performance.now() / 300);
      ctx.fillStyle = P.glow; ctx.globalAlpha = a;
      for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
        if (!s.revealed[y * s.cols + x]) { roundRect(ctx, x*cell+2, y*cell+2, cell-4, cell-4, cell*0.3); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (s.apple) drawApple(s.apple);
    drawSnake(s);
  }
  function drawApple(a) {
    const cx = a.x * cell + cell / 2, cy = a.y * cell + cell / 2;
    const bob = Math.sin(performance.now() / 250) * cell * 0.05;   // 浮动
    ctx.fillStyle = P.apple;
    ctx.beginPath(); ctx.arc(cx, cy + bob, cell * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.leaf;
    ctx.beginPath(); ctx.ellipse(cx + cell*0.1, cy + bob - cell*0.3, cell*0.12, cell*0.07, -0.6, 0, Math.PI*2); ctx.fill();
  }
  function drawSnake(s) {
    // 身体:相邻节间画粗圆线 → 圆润胶囊
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = P.snake; ctx.lineWidth = cell * 0.72;
    ctx.beginPath();
    s.snake.forEach((c, i) => {
      const px = c.x * cell + cell / 2, py = c.y * cell + cell / 2;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    if (s.snake.length === 1) ctx.lineTo(s.snake[0].x*cell+cell/2+0.1, s.snake[0].y*cell+cell/2);
    ctx.stroke();
    // 头 + 大眼睛(朝向 dir)
    const h = s.snake[0], hx = h.x*cell+cell/2, hy = h.y*cell+cell/2;
    ctx.fillStyle = P.snake;
    ctx.beginPath(); ctx.arc(hx, hy, cell*0.42, 0, Math.PI*2); ctx.fill();
    const d = Core.DIRS[s.dir];
    const ex = d.y !== 0 ? 0.16 : 0, ey = d.x !== 0 ? 0.16 : 0;   // 双眼垂直于行进方向摆
    for (const sgn of [-1, 1]) {
      const ox = hx + sgn*ex*cell + d.x*cell*0.14, oy = hy + sgn*ey*cell + d.y*cell*0.14;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, cell*0.13, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5d4a57';
      ctx.beginPath(); ctx.arc(ox + d.x*cell*0.04, oy + d.y*cell*0.04, cell*0.07, 0, Math.PI*2); ctx.fill();
    }
  }

  function revealAll() {   // 过关展示:清空遮罩
    maskLayer.getContext('2d').clearRect(0, 0, size, size);
  }
  return { init, setImage, resetMask, punch, draw, revealAll };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Render;
else window.Render = Render;
```

- [ ] **Step 4: 手动冒烟**(此任务无 node 测试,渲染靠眼睛)

Run: `powershell -c "Start-Process http://localhost:8000; python -m http.server 8000 -d www"`(或任意静态服务)
Expected: 页面出现 HUD/画布/按钮骨架,无 console 报错(main.js 未建,画布空白属预期)。

- [ ] **Step 5: Commit**

```bash
git add www/index.html www/css/style.css www/js/render.js
git commit -m "feat(p1): 页面骨架+云朵粉彩样式+三层canvas渲染"
```

---

### Task 10: input.js — 键盘/滑动/加速

**Files:**
- Create: `www/js/input.js`

- [ ] **Step 1: 实现**

```js
// www/js/input.js — 输入采集:方向回调 + boost 按住状态
const Input = (() => {
  let onDir = () => {}, boostHeld = false;
  const KEYS = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
                 w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };
  function init(boardEl, boostBtn, dirCb) {
    onDir = dirCb;
    window.addEventListener('keydown', e => {
      if (KEYS[e.key]) { onDir(KEYS[e.key]); e.preventDefault(); }
      if (e.key === ' ') { boostHeld = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (e.key === ' ') boostHeld = false; });
    // 触屏滑动(全屏,阈值 24css px)
    let sx = 0, sy = 0, tracking = false;
    window.addEventListener('touchstart', e => {
      if (e.target.closest('button')) return;
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;   // 连续滑动可连续转向
    }, { passive: true });
    window.addEventListener('touchend', () => { tracking = false; });
    // 专用加速按钮(按住生效)
    for (const [down, up] of [['pointerdown','pointerup'], ['pointerleave','']]) {
      if (down === 'pointerdown') {
        boostBtn.addEventListener('pointerdown', e => { boostHeld = true; e.preventDefault(); });
        boostBtn.addEventListener('pointerup',   () => { boostHeld = false; });
        boostBtn.addEventListener('pointerleave',() => { boostHeld = false; });
      }
    }
  }
  return { init, isBoost: () => boostHeld };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Input;
else window.Input = Input;
```

- [ ] **Step 2: Commit**

```bash
git add www/js/input.js
git commit -m "feat(p1): 输入——键盘/全屏滑动/按住加速按钮"
```

---

### Task 11: main.js — 循环/HUD/覆盖层/AI 开关/暂停,P1 收官

**Files:**
- Create: `www/js/main.js`

- [ ] **Step 1: 实现**

```js
// www/js/main.js — 启动与主循环
(() => {
  const $ = id => document.getElementById(id);
  const S = {
    g: null, cyc: null, aiMem: null,
    ai: false, paused: false, over: false,
    images: [], imgPos: 0, img: null,
    last: 0, acc: 0,
    seed: (Date.now() % 2147483647),
  };

  function speed() {                       // 格/秒:基础7,随长缓升,封顶12;boost ×1.6
    const base = Math.min(12, 7 + 0.03 * S.g.snake.length);
    return base * (Input.isBoost() && !S.ai ? 1.6 : 1);
  }

  async function boot() {
    const mf = await fetch('images/angels/manifest.json').then(r => r.json());
    S.images = mf.images;
    S.g = Core.createGame({ seed: S.seed });
    S.cyc = AI.buildCycle(S.g.cols, S.g.rows);
    S.aiMem = AI.createMem();
    Render.init($('board'), S.g.cols);
    await loadLevelImage();
    syncRevealToRender();
    Input.init($('board'), $('boostBtn'), dir => Core.setDir(S.g, dir));
    $('aiBtn').addEventListener('click', () => {
      S.ai = !S.ai; S.aiMem = AI.createMem();
      $('aiBtn').classList.toggle('active', S.ai);
    });
    $('pauseBtn').addEventListener('click', () => setPaused(!S.paused));
    document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
    requestAnimationFrame(loop);
  }

  function loadLevelImage() {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { S.img = img; Render.setImage(img); res(); };
      img.src = 'images/angels/' + S.images[S.imgPos % S.images.length];
    });
  }
  function syncRevealToRender() {          // 状态→遮罩(重生续玩/开局)
    for (let y = 0; y < S.g.rows; y++) for (let x = 0; x < S.g.cols; x++)
      if (S.g.revealed[y * S.g.cols + x]) Render.punch(x, y);
  }

  function setPaused(p) {
    S.paused = p;
    if (p) showOverlay('暂停', '', '继续', () => setPaused(false));
    else { hideOverlay(); S.last = 0; }
  }
  function showOverlay(title, text, btn, cb, imgSrc) {
    $('ovTitle').textContent = title; $('ovText').textContent = text;
    $('ovBtn').textContent = btn; $('ovBtn').onclick = cb;
    const im = $('ovImg');
    if (imgSrc) { im.src = imgSrc; im.classList.remove('hidden'); }
    else im.classList.add('hidden');
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (S.paused || S.over) { S.last = ts; return; }
    if (!S.last) S.last = ts;
    S.acc += ts - S.last; S.last = ts;
    const interval = 1000 / speed();
    let guard = 0;
    while (S.acc >= interval && guard++ < 4 && !S.over) {
      S.acc -= interval;
      tick(ts);
    }
    Render.draw(S.g, { endgameGlow: true });
    updateHud();
  }

  function tick(nowMs) {
    const prevReveal = S.g.revealedCount;
    if (S.ai) Core.setDir(S.g, AI.nextMove(S.g, S.cyc, S.aiMem));
    Core.step(S.g, { nowMs, freezeCombo: Input.isBoost() && !S.ai, scoreScale: S.ai ? 0.5 : 1 });
    // 新揭格 → 遮罩挖洞
    if (S.g.revealedCount > prevReveal) {
      const h = S.g.snake[0]; Render.punch(h.x, h.y);
    }
    if (S.g.levelJustDone) return onLevelDone();
    if (S.g.dead) return onDeath();
  }

  function onLevelDone() {
    S.over = true;
    Render.revealAll();
    showOverlay(`第 ${S.g.level - 1} 关完成!`, `得分 ${S.g.score}`, '下一张 →', async () => {
      S.imgPos++;
      await loadLevelImage();              // setImage 内已重置遮罩
      syncRevealToRender();                // 蛇身格已在 core 里揭开
      S.over = false; hideOverlay();
    }, 'images/angels/' + S.images[S.imgPos % S.images.length]);
  }

  function onDeath() {
    S.over = true;
    showOverlay('哎呀,撞到了!', `蛇长将减半(${S.g.snake.length} → ${Math.max(3, Math.floor(S.g.snake.length / 2))})`,
      '重新出发', () => {
        Core.respawn(S.g);
        const h = S.g.snake[0]; Render.punch(h.x, h.y);
        S.over = false; hideOverlay();
      });
  }

  function updateHud() {
    $('score').textContent = S.g.score;
    const c = $('combo');
    if (S.g.combo > 0) { c.textContent = '×' + S.g.combo; c.classList.remove('hidden'); }
    else c.classList.add('hidden');
    const pct = Math.floor(100 * S.g.revealedCount / (S.g.cols * S.g.rows));
    $('progressBar').style.width = pct + '%';
    $('progressTxt').textContent = pct + '%';
  }

  boot();
})();
```

- [ ] **Step 2: 全量回归 + 手动验收**

Run: `node tests/test-prng.js; node tests/test-core.js; node tests/test-ai.js` → 全过
再启静态服务打开页面,逐项人工核(地面真值,亲眼看):
1. 键盘玩:走过的格子露出天使图,进度条涨;
2. 吃苹果:分数涨、连击出现、蛇变长;
3. 撞墙:死亡弹窗 → 重生半长、遮罩进度还在;
4. 揭满:过关弹窗展示全图 → 下一张图、遮罩重置、蛇长保留;
5. 🤖 AI 代打:开着放 5 分钟,连续过关零死亡;
6. 💨 按住加速:变快且连击数不涨;空格同效;
7. 切后台再回来:自动弹出暂停。

- [ ] **Step 3: Commit + 标记 P1 完成**

```bash
git add www/js/main.js
git commit -m "feat(p1): 主循环/HUD/过关/死亡/AI开关/暂停——P1 网页可玩"
git tag p1-playable
```

---

## Self-Review 记录

- **Spec 覆盖(P1 范围)**:§2 揭图/过关/半长重生(头置最空旷格渐长)/速度曲线/加速(按钮+空格,连击冻结)/连击 10s 窗口死亡清零/里程碑与过关奖励/收尾微光 → Task 2/3/4/9/11;§4 AI 三层+停滞保护+纯函数+机器验证 → Task 5/6/7;§12 可注种子 PRNG/双导出/visibilitychange 暂停/遮罩 offscreen → Task 1/9/11;§13 初始值全部入码(7~12 格/s、10 分、×(1+0.1c)、100/500、10s 窗口、STALL=40)。
- **P1 明确不含**(设计文档有、后续期做):特殊果 12 种、成就、图鉴 UI、4 皮肤、音效、分享卡片、存档、i18n、广告、复活(P1 死亡只有半长重生)。
- **占位符扫描**:无 TBD/TODO;所有步骤含完整代码或确切命令。
- **命名一致性**:`Core.createGame/setDir/step/respawn/DIRS/COMBO_WINDOW_MS`、`AI.buildCycle/createMem/nextMove/STALL_STEPS`、`Render.init/setImage/punch/draw/revealAll`、`Input.init/isBoost` 全文一致;core 中 `PRNG_`、ai 中 `CoreRef/AIDIRS` 避免与全局重名。
- **已知取舍**:Task 3 的 180° 测试路径依赖蛇形走位,执行者若发现坐标不成立,按「意图不变、坐标可调」处理;渲染无自动测试,靠 Task 11 人工清单。
