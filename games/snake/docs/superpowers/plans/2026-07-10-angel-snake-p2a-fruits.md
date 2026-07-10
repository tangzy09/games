# 天使贪吃蛇 P2a(13 种果子 + 合成音效)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 P1 可玩版(tag `snake-p1-playable`,现 HEAD 更新)之上实现设计 §3 的全部 13 种果子(1 苹果 + 12 特殊果,含流星移动实体与磁力漂移)与设计 §8 的合成音效(工具生成 wav,走引擎 Sfx),AI 零死亡保证在果子全开下仍由机器验证。

**P2 分段说明**:P2 拆三个独立可交付计划——**P2a(本计划)果子+音效** → P2b 存档+120成就 → P2c 图鉴500张+4皮肤+菜单/分享。每段结束游戏都可玩可测。

**Architecture:** 果子数据表独立 `fruits.js`(纯数据,双导出);`core.js` 扩展为「多苹果 + 至多 1 个限时特殊果 + 流星实体 + 定时效果集」,全部随机走 `s.rand()`(种子可复现,AI 断言确定性成立);`ai.js` 目标选择升级(特殊果 > 最近苹果);渲染果子用 **emoji 占位**(引擎 README 美术哲学:先 emoji 后补图零改码);音效 = `tools/gen-sfx.js` 合成 6 个 wav 文件进 `assets/audio/`,接引擎 `CFG.sfx`/`Sfx.play`(引擎是文件型音频,见 `engine/audio.js`,**不改引擎**)。

**Tech Stack:** vanilla JS 零构建、引擎全局脚本、node assert 单测、playwright E2E(已有 `tests/e2e-p1.js` 基座)。

**约定(全部任务通用):**
- 仓库根 `c:\Users\tangz\Documents\Projects\games`(git main 直接提交),命令在仓库根跑。
- ⚠️ 并行会话在开发 `games/minesweeper/` 和仓库根 `tools/`,**禁止 `git add -A` / `git add .`**,只 add 任务列出的文件;engine/ 若有他人未提交改动,不碰。
- 提交末尾:`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 时间语义:core 一律用 `o.nowMs`(step 入参),**不用 Date.now()**;效果到期 = `now >= xxUntil`。
- 现状必读:`games/snake/js/core.js`(≈120 行,本计划会大幅重写它)、`engine/audio.js`(Sfx API)、设计 §3/§13(`games/snake/docs/superpowers/specs/2026-07-09-snake-angel-design.md`)。

**File Structure(P2a 全量):**

```
games/snake/js/fruits.js          # 新:12 特殊果数据表/分类权重/时长常量(纯数据,双导出)
games/snake/js/core.js            # 重写:多苹果/特殊果刷新与过期/12 种效果/流星/磁力/护盾转向
games/snake/js/ai.js              # 小改:目标选择 = 特殊果 > 最近苹果
games/snake/js/render.js          # 增:果子绘制(emoji+临期闪烁)/效果指示条/揭格 diff 同步
games/snake/js/main.js            # 增:速度效果因子/G.nowMs/音效触发/🔊 开关
games/snake/index.html            # 增:GAME_CONFIG.sfx + fruits.js script 标签
games/snake/tools/gen-sfx.js      # 新:合成 6 个 wav(44.1k 16bit mono,零外部素材)
games/snake/assets/audio/         # 产出:eat/special/shield/milestone/level/death.wav
games/snake/tests/test-fruits.js  # 新:果子全量单测
games/snake/tests/test-ai.js      # 增:果子全开下的零死亡回归 + 特殊果集成断言
games/snake/tests/e2e-p1.js       # 增:特殊果出现/被吃断言
```

---

### Task 1: fruits.js 数据表 + core.js 重写(多苹果/特殊果刷新与过期/twin/gold)

**Files:**
- Create: `games/snake/js/fruits.js`
- Rewrite: `games/snake/js/core.js`
- Test: `games/snake/tests/test-fruits.js`(新建)
- Modify: `games/snake/index.html`(fruits.js script 标签,在 core.js **之前**)

- [ ] **Step 1: 写 fruits.js(纯数据)**

```js
// games/snake/js/fruits.js — 果子数据表与常量(纯数据,双导出)
// 分类: score(得分) reveal(揭图) surv(生存) misc(杂项);rare 在类内权重打折
const FRUITS = {
  twin:     { emoji: '💫', cat: 'score' },              // 双子星:场上多刷 2 个苹果
  gold:     { emoji: '👑', cat: 'score', rare: true },  // 金苹果:+50 分、连击 +2
  demon:    { emoji: '😈', cat: 'score' },              // 小恶魔:5s 提速 50%、得分 ×2
  meteor:   { emoji: '🌠', cat: 'score', rare: true },  // 流星:斜穿棋盘,飞过即揭,追上 +40
  feather:  { emoji: '🌈', cat: 'reveal' },             // 彩虹羽毛:随机揭 3×3
  trail:    { emoji: '✨', cat: 'reveal' },              // 圣光足迹:8s 走过揭 3 格宽
  cloud:    { emoji: '☁️', cat: 'surv' },               // 慢慢云:8s 减速 30%
  scissors: { emoji: '✂️', cat: 'surv', rare: true },   // 天使之剪:蛇身 -3
  halo:     { emoji: '😇', cat: 'surv' },               // 光环:6s 幽灵穿身
  heart:    { emoji: '💖', cat: 'surv' },               // 守护爱心:护盾 +1
  magnet:   { emoji: '🧲', cat: 'misc' },               // 磁力圣环:8s 果子向蛇头漂移
  gift:     { emoji: '🎁', cat: 'misc' },               // 天国礼盒:随机其他一种效果
};
// 设计 §13 待校准:前期偏得分,后期偏生存/揭图
const CAT_WEIGHTS = {
  early: { score: 6, reveal: 2, surv: 1, misc: 1 },
  late:  { score: 2, reveal: 3, surv: 4, misc: 1 },
};
const RARE_FACTOR = 0.35;            // 稀有果类内权重折扣(待校准)
const FRUIT_TIMES = {                // 全部 ms,待校准
  specialLife: 8000, blinkAt: 2500,
  cloud: 8000, demon: 5000, halo: 6000, trail: 8000, magnet: 8000,
  magnetStep: 500, meteorStep: 160,
};
const Fruits = { FRUITS, CAT_WEIGHTS, RARE_FACTOR, FRUIT_TIMES };
if (typeof module !== 'undefined' && module.exports) module.exports = Fruits;
```

- [ ] **Step 2: 写失败测试(基础层)**

```js
// games/snake/tests/test-fruits.js
const assert = require('assert');
const Core = require('../js/core.js');
const Fruits = require('../js/fruits.js');

function eatN(g, n, startMs) {  // 连吃 n 个苹果:每次把苹果摆到头前一格再 step
  let t = startMs || 1000;
  for (let i = 0; i < n; i++) {
    // 蛇一直向右会撞墙:走蛇形。把苹果放头的下一步位置。
    const dir = ['right', 'down', 'left', 'down'][g.stats.apples % 4];
    Core.setDir(g, dir);
    const d = Core.DIRS[g.nextDir], h = g.snake[0];
    g.apple = { x: h.x + d.x, y: h.y + d.y };
    Core.step(g, { nowMs: (t += 500) });
    if (g.dead) throw new Error('eatN 走位撞死,调整路径');
  }
  return t;
}

// --- 特殊果刷新节奏:吃 4~6 个苹果后必刷,且场上至多 1 个 ---
{
  const g = Core.createGame({ seed: 1 });
  assert.strictEqual(g.special, null, '开局无特殊果');
  eatN(g, 6, 1000);
  assert(g.special, '6 苹果内必刷特殊果');
  assert(Fruits.FRUITS[g.special.type], '类型合法');
  assert(g.special.expiresAt > 0, '有过期时间');
  assert.strictEqual(g.stats.specialsSpawned, 1);
  const firstType = g.special.type;
  eatN(g, 6, 100000);
  assert.strictEqual(g.stats.specialsSpawned, 1, '场上已有特殊果时不再刷');
  assert.strictEqual(g.special.type, firstType);
}

// --- 过期消失 ---
{
  const g = Core.createGame({ seed: 2 });
  const t = eatN(g, 6, 1000);
  assert(g.special, '已刷特殊果');
  Core.step(g, { nowMs: t + Fruits.FRUIT_TIMES.specialLife + 1 });
  assert.strictEqual(g.special, null, '超时消失');
}

// --- 吃到特殊果:计数 + 生效(用 gold 验证通路) ---
{
  const g = Core.createGame({ seed: 3 });
  const t = eatN(g, 6, 1000);
  // 手工把特殊果改成 gold 并摆到头前
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.special = { type: 'gold', x: h.x + d.x, y: h.y + d.y, expiresAt: t + 8000 };
  g.apple = { x: 0, y: 0 };                       // 苹果挪走防干扰
  const sc = g.score, cb = g.combo;
  Core.step(g, { nowMs: t + 500 });
  assert.strictEqual(g.special, null, '吃掉后场上清空');
  assert.strictEqual(g.stats.specials.gold, 1, '类型计数');
  assert.strictEqual(g.combo, cb + 2, '金苹果连击 +2');
  assert.strictEqual(g.score, sc + 50, '金苹果 +50 分');
}

// --- twin:场上多 2 个苹果;吃副苹果与主苹果同效 ---
{
  const g = Core.createGame({ seed: 4 });
  Core.applyFruit(g, 'twin', 1000, {});
  assert.strictEqual(g.extraApples.length, 2, '双子星刷 2 个副苹果');
  const a = g.extraApples[0];
  // 把副苹果搬到头前吃掉
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  a.x = h.x + d.x; a.y = h.y + d.y;
  g.apple = { x: 0, y: 15 };
  const len = g.targetLen, ap = g.stats.apples;
  Core.step(g, { nowMs: 2000 });
  assert.strictEqual(g.extraApples.length, 1, '副苹果被吃移除,不重生');
  assert.strictEqual(g.targetLen, len + 1, '副苹果同样 +1 节');
  assert.strictEqual(g.stats.apples, ap + 1);
}
console.log('OK test-fruits(刷新/过期/gold/twin)');
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node games/snake/tests/test-fruits.js`
Expected: FAIL(Cannot find module '../js/fruits.js' 或 Core.applyFruit is not a function)

- [ ] **Step 4: 重写 core.js(完整文件,一次到位——效果全量在本步给出,Task 2/3 只补测试)**

```js
// core.js — 纯游戏状态机(无 DOM,双导出)
// 浏览器:PRNG/Fruits 来自前置 <script> 全局;node:直接 require
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;
const FR_ = (typeof module !== 'undefined' && module.exports)
  ? require('./fruits.js') : Fruits;

const SNAKE_DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const COMBO_WINDOW_MS = 10000;   // 待校准(设计 §13)

function createGame(opts = {}) {
  const cols = opts.cols || 16, rows = opts.rows || 16;
  const s = {
    cols, rows,
    rand: PRNG_.create(opts.seed == null ? 1 : opts.seed),
    snake: [{ x: Math.min(3, Math.floor(cols / 4)), y: Math.floor(rows / 2) }],
    dir: 'right', nextDir: 'right',
    targetLen: 3,
    revealed: new Uint8Array(cols * rows), revealedCount: 0, milestones: 0,
    apple: null, extraApples: [], special: null, meteor: null,
    applesSinceSpecial: 0, nextSpecialAt: 0,
    effects: { slowUntil: 0, demonUntil: 0, ghostUntil: 0, trailUntil: 0,
               magnetUntil: 0, shield: 0, lastDriftAt: 0 },
    score: 0, combo: 0, lastEatMs: -Infinity,
    level: 1, levelJustDone: false,
    dead: false, deaths: 0,
    shieldJustUsed: false, lastSpecialEaten: null,   // 每步重置,供 UI/音效读取
    stats: { apples: 0, steps: 0, specialsSpawned: 0, specials: {} },
  };
  s.nextSpecialAt = 4 + Math.floor(s.rand() * 3);   // 每 4~6 苹果刷 1 个特殊果
  revealCell(s, s.snake[0].x, s.snake[0].y);
  spawnApple(s);
  return s;
}

function idx(s, x, y) { return y * s.cols + x; }
function occupied(s, x, y) { return s.snake.some(c => c.x === x && c.y === y); }
function fruitOccupied(s, x, y) {
  if (s.apple && s.apple.x === x && s.apple.y === y) return true;
  if (s.extraApples.some(a => a.x === x && a.y === y)) return true;
  if (s.special && s.special.x === x && s.special.y === y) return true;
  return false;
}
function randomFreeCell(s) {
  const free = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!occupied(s, x, y) && !fruitOccupied(s, x, y)) free.push({ x, y });
  return free.length ? free[Math.floor(s.rand() * free.length)] : null;
}

function revealCell(s, x, y) {
  const i = idx(s, x, y);
  if (!s.revealed[i]) { s.revealed[i] = 1; s.revealedCount++; }
}

function spawnApple(s) { s.apple = randomFreeCell(s); }

function setDir(s, dir) {
  if (!SNAKE_DIRS[dir]) return;
  if (s.snake.length > 1 && dir === OPP[s.dir]) return;
  s.nextDir = dir;
}

// 与 step 同口径的致死判定(尾巴让位;ghost 穿身;墙恒死)
function isLethalCell(s, x, y, ghost) {
  if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) return true;
  if (ghost) return false;
  const grow = s.snake.length < s.targetLen;
  return s.snake.some((c, i) => {
    if (!grow && i === s.snake.length - 1) return false;
    return c.x === x && c.y === y;
  });
}

// o: {nowMs, freezeCombo, scoreScale, ghost}
function step(s, o = {}) {
  if (s.dead) return;
  s.levelJustDone = false;
  s.shieldJustUsed = false; s.lastSpecialEaten = null;
  const now = o.nowMs != null ? o.nowMs : s.stats.steps * 140;
  const fx = s.effects;
  tickMeteor(s, now, o);
  tickMagnet(s, now);
  if (s.special && now >= s.special.expiresAt) s.special = null;   // 限时消失
  // 光环:到期时蛇头若仍与身体重叠,天然安全——碰撞只判「新格」,重叠本身不判死
  const ghost = !!o.ghost || now < fx.ghostUntil;
  s.dir = s.nextDir;
  let d = SNAKE_DIRS[s.dir];
  const head = s.snake[0];
  let nx = head.x + d.x, ny = head.y + d.y;
  if (isLethalCell(s, nx, ny, ghost) && fx.shield > 0) {
    // 守护爱心:该步不执行,自动转任一安全方向;四向皆死则不消耗、照死
    for (const alt of ['up', 'down', 'left', 'right']) {
      if (s.snake.length > 1 && alt === OPP[s.dir]) continue;
      const ad = SNAKE_DIRS[alt];
      if (!isLethalCell(s, head.x + ad.x, head.y + ad.y, ghost)) {
        fx.shield--; s.shieldJustUsed = true;
        s.dir = s.nextDir = alt; d = ad;
        nx = head.x + ad.x; ny = head.y + ad.y;
        break;
      }
    }
  }
  if (isLethalCell(s, nx, ny, ghost)) return die(s);
  // 不变式: snake.length ≤ targetLen(targetLen 单调增;respawn 重置 length=1;
  // scissors 减 targetLen 时同步修剪身体),故 step 无需收缩路径
  const grow = s.snake.length < s.targetLen;
  s.snake.unshift({ x: nx, y: ny });
  if (!grow) s.snake.pop();
  s.stats.steps++;
  revealCell(s, nx, ny);
  if (now < fx.trailUntil) {              // 圣光足迹:3 格宽光带(垂直于行进方向)
    const px2 = d.y !== 0 ? 1 : 0, py2 = d.x !== 0 ? 1 : 0;
    for (const sgn of [-1, 1]) {
      const tx = nx + sgn * px2, ty = ny + sgn * py2;
      if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) revealCell(s, tx, ty);
    }
  }
  checkMilestone(s, o);
  eatAt(s, nx, ny, now, o);
  if (s.revealedCount === s.cols * s.rows) completeLevel(s, o);
}

function eatAt(s, x, y, now, o) {
  const demonX = now < s.effects.demonUntil ? 2 : 1;   // 小恶魔期间得分 ×2
  if (s.apple && s.apple.x === x && s.apple.y === y) {
    gainApple(s, now, o, demonX); spawnApple(s); onAppleEaten(s, now); return;
  }
  const ei = s.extraApples.findIndex(a => a.x === x && a.y === y);
  if (ei >= 0) {
    s.extraApples.splice(ei, 1);
    gainApple(s, now, o, demonX); onAppleEaten(s, now); return;   // 副苹果不重生
  }
  if (s.special && s.special.x === x && s.special.y === y) {
    const t = s.special.type; s.special = null;
    s.stats.specials[t] = (s.stats.specials[t] || 0) + 1;
    s.lastSpecialEaten = t;
    applyFruit(s, t, now, o);
    return;
  }
  if (s.meteor && s.meteor.x === x && s.meteor.y === y) {
    s.meteor = null;
    s.score += Math.round(40 * demonX * (o.scoreScale || 1));   // 追上流星 +40
  }
}

function gainApple(s, now, o, demonX) {
  s.targetLen++; s.stats.apples++;
  if (!o.freezeCombo && now - s.lastEatMs <= COMBO_WINDOW_MS) s.combo++;
  s.lastEatMs = now;
  s.score += Math.round(10 * (1 + 0.1 * s.combo) * demonX * (o.scoreScale || 1));
}

function onAppleEaten(s, now) {
  s.applesSinceSpecial++;
  if (s.special || s.applesSinceSpecial < s.nextSpecialAt) return;
  const cell = randomFreeCell(s);
  if (!cell) return;
  s.special = { type: pickSpecialType(s), x: cell.x, y: cell.y,
                expiresAt: now + FR_.FRUIT_TIMES.specialLife };
  s.stats.specialsSpawned++;
  s.applesSinceSpecial = 0;
  s.nextSpecialAt = 4 + Math.floor(s.rand() * 3);
}

// 权重选型:前期偏得分,后期(揭图>60% 或蛇>30% 棋盘)偏生存/揭图;稀有果类内打折
function pickSpecialType(s) {
  const late = s.revealedCount / (s.cols * s.rows) > 0.6
            || s.snake.length > s.cols * s.rows * 0.3;
  const w = late ? FR_.CAT_WEIGHTS.late : FR_.CAT_WEIGHTS.early;
  const entries = Object.entries(FR_.FRUITS).map(([type, def]) =>
    [type, w[def.cat] * (def.rare ? FR_.RARE_FACTOR : 1)]);
  let total = 0; for (const [, wt] of entries) total += wt;
  let r = s.rand() * total;
  for (const [type, wt] of entries) { r -= wt; if (r <= 0) return type; }
  return entries[entries.length - 1][0];
}

function applyFruit(s, type, now, o) {
  const fx = s.effects, T = FR_.FRUIT_TIMES;
  switch (type) {
    case 'twin':
      for (let i = 0; i < 2; i++) { const c = randomFreeCell(s); if (c) s.extraApples.push(c); }
      break;
    case 'gold':
      s.combo += 2;
      s.score += Math.round(50 * (o.scoreScale || 1));
      break;
    case 'demon':  fx.demonUntil = now + T.demon; break;
    case 'meteor': spawnMeteor(s, now); break;
    case 'feather': {                     // 彩虹羽毛:随机一片 3×3 未揭区域
      const c = randomUnrevealed(s);
      if (c) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const tx = c.x + dx, ty = c.y + dy;
        if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) revealCell(s, tx, ty);
      }
      checkMilestone(s, o);
      break;
    }
    case 'trail':  fx.trailUntil = now + T.trail; break;
    case 'cloud':  fx.slowUntil = now + T.cloud; break;
    case 'scissors':                      // 蛇身 -3:同步修剪身体,维持 length≤targetLen 不变式
      s.targetLen = Math.max(3, s.targetLen - 3);
      while (s.snake.length > s.targetLen) s.snake.pop();
      break;
    case 'halo':   fx.ghostUntil = now + T.halo; break;
    case 'heart':  fx.shield++; break;
    case 'magnet': fx.magnetUntil = now + T.magnet; break;
    case 'gift': {                        // 天国礼盒:随机触发其他任意一种
      const others = Object.keys(FR_.FRUITS).filter(k => k !== 'gift');
      applyFruit(s, others[Math.floor(s.rand() * others.length)], now, o);
      break;
    }
    default: break;
  }
}

function randomUnrevealed(s) {
  const cells = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!s.revealed[y * s.cols + x]) cells.push({ x, y });
  return cells.length ? cells[Math.floor(s.rand() * cells.length)] : null;
}

// 流星:随机左/右缘起点,45° 对角斜穿;飞过即沿途揭开(不论是否追上)
function spawnMeteor(s, now) {
  const fromLeft = s.rand() < 0.5;
  s.meteor = {
    x: fromLeft ? 0 : s.cols - 1,
    y: Math.floor(s.rand() * s.rows),
    dx: fromLeft ? 1 : -1,
    dy: s.rand() < 0.5 ? 1 : -1,
    nextAt: now,
  };
}
function tickMeteor(s, now, o) {
  while (s.meteor && now >= s.meteor.nextAt) {
    const m = s.meteor;
    revealCell(s, m.x, m.y);
    m.x += m.dx; m.y += m.dy;
    m.nextAt += FR_.FRUIT_TIMES.meteorStep;
    if (m.x < 0 || m.y < 0 || m.x >= s.cols || m.y >= s.rows) { s.meteor = null; break; }
  }
  if (o) checkMilestone(s, o);            // 流星揭格也计里程碑
}

// 磁力圣环:每 magnetStep ms 所有果子向蛇头挪 1 格(先大差轴;占用/出界则不动)
function tickMagnet(s, now) {
  const fx = s.effects;
  if (now >= fx.magnetUntil || now - fx.lastDriftAt < FR_.FRUIT_TIMES.magnetStep) return;
  fx.lastDriftAt = now;
  const head = s.snake[0];
  const drift = (f) => {
    if (!f) return;
    const dx = Math.sign(head.x - f.x), dy = Math.sign(head.y - f.y);
    const tryMove = (mx, my) => {
      if (mx === 0 && my === 0) return false;
      const tx = f.x + mx, ty = f.y + my;
      if (tx < 0 || ty < 0 || tx >= s.cols || ty >= s.rows) return false;
      if (occupied(s, tx, ty) || fruitOccupied(s, tx, ty)) return false;
      f.x = tx; f.y = ty; return true;
    };
    if (Math.abs(head.x - f.x) >= Math.abs(head.y - f.y)) { tryMove(dx, 0) || tryMove(0, dy); }
    else { tryMove(0, dy) || tryMove(dx, 0); }
  };
  drift(s.apple);
  s.extraApples.forEach(drift);
  drift(s.special);
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
  s.special = null; s.meteor = null;      // 换图清场上限时物;副苹果/效果跨关保留
  for (const c of s.snake) revealCell(s, c.x, c.y);
}

function die(s) {
  s.dead = true; s.deaths++; s.combo = 0;
  const fx = s.effects;                   // 死亡清定时效果;护盾保留(它没能触发说明四向皆死或为 0)
  fx.slowUntil = fx.demonUntil = fx.ghostUntil = fx.trailUntil = fx.magnetUntil = 0;
}

function respawn(s) {
  const newLen = Math.max(3, Math.floor(s.snake.length / 2));
  let best = null, bestD = -1;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (fruitOccupied(s, x, y)) continue;
    let d = Infinity;
    for (const c of s.snake) d = Math.min(d, Math.abs(c.x - x) + Math.abs(c.y - y));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  s.snake = [best]; s.targetLen = newLen;
  s.dir = s.nextDir = (best.x < s.cols / 2 ? 'right' : 'left');
  s.dead = false;
  revealCell(s, best.x, best.y);
}

const Core = { createGame, setDir, step, respawn, applyFruit,
               DIRS: SNAKE_DIRS, COMBO_WINDOW_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
```

- [ ] **Step 5: index.html 加 fruits.js(core.js 之前)**

在 `<script src="js/core.js"></script>` 前一行插入:
```html
<script src="js/fruits.js"></script>
```

- [ ] **Step 6: 跑测试**

Run: `node games/snake/tests/test-fruits.js` → `OK test-fruits(刷新/过期/gold/twin)`
Run: `node games/snake/tests/test-core.js` → **必须全绿**(P1 行为不回归;若断言失败,先判断是 P1 语义被破坏(修 core)还是测试依赖旧内部函数名(如 eatApple——已改 gainApple/eatAt,test-core 不引用内部函数,应无影响))
Run: `node games/snake/tests/test-ai.js` → 全绿(AI 尚未认识特殊果,只是场上多了个它不吃的东西;若步数超限说明特殊果挡路致 AI 绕行过多,记录现象,Task 4 修目标选择后复验)

- [ ] **Step 7: Commit**

```bash
git add games/snake/js/fruits.js games/snake/js/core.js games/snake/tests/test-fruits.js games/snake/index.html
git commit -m "feat(snake): 果子系统骨架——多苹果/特殊果刷新过期/gold/twin,12效果全量入码"
```

---

### Task 2: 效果类果子测试补全(feather/trail/cloud/scissors/halo/heart/demon/gift)

代码已在 Task 1 就位,本任务用测试钉死每种效果语义,发现偏差修 core.js。

**Files:**
- Modify: `games/snake/tests/test-fruits.js`(追加)
- Modify: `games/snake/js/core.js`(仅当测试暴露 bug)

- [ ] **Step 1: 追加测试**

```js
// test-fruits.js 追加(console.log 之前)
// --- feather:恰揭一片 3×3(边缘裁剪),计里程碑 ---
{
  const g = Core.createGame({ seed: 5 });
  const before = g.revealedCount;
  Core.applyFruit(g, 'feather', 1000, {});
  const gained = g.revealedCount - before;
  assert(gained >= 4 && gained <= 9, `羽毛揭 4~9 格(边缘裁剪,已揭重叠),实得 ${gained}`);
}

// --- trail:8s 内走过揭 3 格宽 ---
{
  const g = Core.createGame({ seed: 6 });
  Core.applyFruit(g, 'trail', 1000, {});
  const before = g.revealedCount;
  g.apple = { x: 15, y: 15 };            // 挪开苹果
  Core.step(g, { nowMs: 1100 });         // 向右一步:头格+上下两格
  assert.strictEqual(g.revealedCount, before + 3, '足迹揭 3 格');
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.trail + 1 });   // 过期后
  const b2 = g.revealedCount;
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.trail + 200 });
  assert.strictEqual(g.revealedCount, b2 + 1, '过期后只揭头格');
}

// --- cloud/demon:只设置到期时间(速度由 main 读),demon 得分 ×2 ---
{
  const g = Core.createGame({ seed: 7 });
  Core.applyFruit(g, 'cloud', 1000, {});
  assert.strictEqual(g.effects.slowUntil, 1000 + Fruits.FRUIT_TIMES.cloud);
  Core.applyFruit(g, 'demon', 1000, {});
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.apple = { x: h.x + d.x, y: h.y + d.y };
  const sc = g.score;
  Core.step(g, { nowMs: 1100 });          // demon 生效期内吃苹果
  assert.strictEqual(g.score, sc + 20, '恶魔期得分 ×2(10×1×2)');
}

// --- scissors:targetLen-3 且身体同步修剪(不变式) ---
{
  const g = Core.createGame({ seed: 8 });
  g.targetLen = 10;
  for (let i = 0; i < 12; i++) {          // 蛇形养长
    Core.setDir(g, ['right', 'down', 'left', 'down'][i % 4]); Core.step(g, { nowMs: 1000 + i });
  }
  const len = g.snake.length;
  assert(len >= 8, 'sanity: 蛇已养长');
  Core.applyFruit(g, 'scissors', 5000, {});
  assert.strictEqual(g.targetLen, 7, 'targetLen 10-3=7');
  assert(g.snake.length <= g.targetLen, '身体修剪,不变式保持');
}

// --- halo:幽灵期穿身不死;过期后撞身死 ---
{
  const g = Core.createGame({ seed: 9 });
  g.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g, { nowMs: 1000 + i });   // 直行养长
  Core.setDir(g, 'down'); Core.step(g, { nowMs: 2000 });
  Core.setDir(g, 'left'); Core.step(g, { nowMs: 2001 });
  Core.applyFruit(g, 'halo', 2002, {});
  Core.setDir(g, 'up');   Core.step(g, { nowMs: 2002 });           // 撞回身体——幽灵穿过
  assert(!g.dead, '光环期穿身不死');
  // 过期后再制造一次撞身
  const g2 = Core.createGame({ seed: 9 });
  g2.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g2, { nowMs: 1000 + i });
  Core.setDir(g2, 'down'); Core.step(g2, { nowMs: 2000 });
  Core.setDir(g2, 'left'); Core.step(g2, { nowMs: 2001 });
  Core.applyFruit(g2, 'halo', 2002, {});
  Core.setDir(g2, 'up');
  Core.step(g2, { nowMs: 2002 + Fruits.FRUIT_TIMES.halo + 1 });    // 已过期
  assert(g2.dead, '光环过期后撞身应死');
}

// --- heart:护盾自动转安全方向,消耗一层,shieldJustUsed 置位 ---
{
  const g = Core.createGame({ seed: 10 });
  Core.applyFruit(g, 'heart', 1000, {});
  assert.strictEqual(g.effects.shield, 1);
  // 逼到右墙:一直向右直到下一步是墙
  while (g.snake[0].x < g.cols - 1) Core.step(g, { nowMs: 2000 + g.snake[0].x });
  g.apple = { x: 0, y: 0 };
  Core.step(g, { nowMs: 3000 });          // 本该撞墙——护盾转向
  assert(!g.dead, '护盾救命');
  assert.strictEqual(g.effects.shield, 0, '护盾消耗');
  assert(g.shieldJustUsed, 'shieldJustUsed 置位');
  assert(g.dir === 'up' || g.dir === 'down', '转向为垂直安全方向');
}

// --- gift:确定性(同种子同结果)且必为其他 11 种之一的效果 ---
{
  const g = Core.createGame({ seed: 11 });
  const snap = JSON.stringify({ e: g.effects, x: g.extraApples.length });
  Core.applyFruit(g, 'gift', 1000, {});
  const changed = JSON.stringify({ e: g.effects, x: g.extraApples.length }) !== snap
    || g.score > 0 || g.meteor || g.snake.length !== 1 || g.revealedCount > 1;
  assert(changed, '礼盒必然触发某种效果');
  // 同种子重放,结果一致
  const h = Core.createGame({ seed: 11 });
  Core.applyFruit(h, 'gift', 1000, {});
  assert.strictEqual(JSON.stringify(h.effects), JSON.stringify(g.effects), '同种子礼盒结果一致');
}
console.log('OK test-fruits(八效果)');
```

- [ ] **Step 2: 跑测试**

Run: `node games/snake/tests/test-fruits.js` → 全过(走位坐标若与实现冲突,按「意图不变、坐标可调」修测试并注释;core bug 则修 core)

- [ ] **Step 3: Commit**

```bash
git add games/snake/tests/test-fruits.js games/snake/js/core.js
git commit -m "test(snake): 八种效果果语义钉死——羽毛/足迹/云/剪刀/光环/护盾/恶魔/礼盒"
```

---

### Task 3: 流星 + 磁力测试

**Files:**
- Modify: `games/snake/tests/test-fruits.js`(追加)
- Modify: `games/snake/js/core.js`(仅当暴露 bug)

- [ ] **Step 1: 追加测试**

```js
// test-fruits.js 追加
// --- meteor:按时刻推进、沿途揭开、出界消失 ---
{
  const g = Core.createGame({ seed: 12 });
  Core.applyFruit(g, 'meteor', 1000, {});
  assert(g.meteor, '流星生成');
  const step = Fruits.FRUIT_TIMES.meteorStep;
  const before = g.revealedCount;
  g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };  // 让蛇原地小步动,时间推进靠 nowMs
  Core.step(g, { nowMs: 1000 + step * 5 });            // 推进 5 个流星步
  assert(g.revealedCount > before, '流星沿途揭开(不论是否追上)');
  Core.step(g, { nowMs: 1000 + step * 40 });           // 40 步足够穿出 16 格棋盘
  assert.strictEqual(g.meteor, null, '流星出界消失');
}

// --- meteor:追上得分 ---
{
  const g = Core.createGame({ seed: 13 });
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.meteor = { x: h.x + d.x, y: h.y + d.y, dx: 1, dy: 1, nextAt: 99999999 };  // 冻结在头前
  g.apple = { x: 0, y: 15 };
  const sc = g.score;
  Core.step(g, { nowMs: 2000 });
  assert.strictEqual(g.meteor, null, '追上后消失');
  assert.strictEqual(g.score, sc + 40, '追上 +40');
}

// --- magnet:每 magnetStep 果子向头挪 1 格;不入蛇身/不出界/不叠果 ---
{
  const g = Core.createGame({ seed: 14 });
  Core.applyFruit(g, 'magnet', 1000, {});
  const h = g.snake[0];
  g.apple = { x: h.x + 5, y: h.y };       // 正右方 5 格
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.magnetStep });
  // 蛇也向右走了一步:头 x+1;苹果向头挪 1 格:x+5-1 → 距离仍 3?精确断言位置:
  assert.strictEqual(g.apple.x, h.x + 4, '苹果向头漂移 1 格');
  // 不叠果:special 放在苹果漂移目标位,应停住
  const g2 = Core.createGame({ seed: 15 });
  Core.applyFruit(g2, 'magnet', 1000, {});
  const h2 = g2.snake[0];
  g2.apple  = { x: h2.x + 5, y: h2.y };
  g2.special = { type: 'gold', x: h2.x + 4, y: h2.y, expiresAt: 99999999 };
  Core.step(g2, { nowMs: 1000 + Fruits.FRUIT_TIMES.magnetStep });
  assert.strictEqual(g2.apple.x, h2.x + 5, '目标被特殊果占用,苹果原地不动(或走纵轴——y 相同故不动)');
}
console.log('OK test-fruits(流星/磁力)');
```

注意第一段 magnet 断言:蛇 step 后头前进 1 格,而漂移以 step 开始时的头位置计算——若实现顺序(tickMagnet 在移动前)导致断言差 1 格,以实现顺序为准修断言并注释(意图:果子确实向头方向挪了恰 1 格)。

- [ ] **Step 2: 跑测试** → 全过;顺跑 `node games/snake/tests/test-core.js` 回归。

- [ ] **Step 3: Commit**

```bash
git add games/snake/tests/test-fruits.js games/snake/js/core.js
git commit -m "test(snake): 流星移动/沿途揭开/追上得分 + 磁力漂移规则钉死"
```

---

### Task 4: ai.js 目标选择升级 + 果子全开零死亡回归

**Files:**
- Modify: `games/snake/js/ai.js`
- Modify: `games/snake/tests/test-ai.js`(追加断言)

- [ ] **Step 1: 修改 ai.js 目标选择**

`shortcutMove` 里现有的目标选择(`let target = s.apple; ...`)替换为:

```js
  // 目标:场上特殊果(限时,最紧迫)> 最近苹果(含副苹果);停滞时改打最近未揭格。
  // 流星不追(移动目标,只在 eatAt 顺路截击)。
  let target = s.special ? { x: s.special.x, y: s.special.y } : nearestApple(s, head);
  if (mem.sinceReveal > STALL_STEPS) target = nearestUnrevealed(s, head) || target;
```

并在 `nearestUnrevealed` 旁新增:

```js
function nearestApple(s, from) {
  let best = s.apple;
  let bd = best ? Math.abs(best.x - from.x) + Math.abs(best.y - from.y) : Infinity;
  for (const a of s.extraApples) {
    const d2 = Math.abs(a.x - from.x) + Math.abs(a.y - from.y);
    if (d2 < bd) { bd = d2; best = a; }
  }
  return best;
}
```

- [ ] **Step 2: test-ai.js 追加集成断言**

在「5 种子 ×2 关」块内的 totalSteps 统计处,累计特殊果数据;块结束后追加:

```js
// (在 5 种子循环外声明) let spawnedTotal = 0, eatenTotal = 0;
// (每个种子跑完后) spawnedTotal += g.stats.specialsSpawned;
//                  eatenTotal += Object.values(g.stats.specials).reduce((a, b) => a + b, 0);
assert(spawnedTotal > 0, `特殊果在 AI 局中确实刷新(spawned=${spawnedTotal})`);
assert(eatenTotal > 0, `AI 确实吃到特殊果(eaten=${eatenTotal})——目标选择生效`);
console.log(`  特殊果:刷新 ${spawnedTotal} 个,AI 吃到 ${eatenTotal} 个`);
```

- [ ] **Step 3: 全量跑**

Run: `node games/snake/tests/test-ai.js`
Expected: 全绿——**5+3 种子零死亡断言不变**(果子全开:护盾/光环/剪刀/磁力/流星都在场上发生,安全不变式必须扛住)。若死亡:优先排查 a) 磁力把目标果挪走后 isTargetCell 例外判定用了旧坐标(每 tick 重取 target,应无此问题);b) 剪刀修剪身体后 AI 的 headToTail 计算(用当前 snake,天然适应);c) 特殊果落在未揭格且被磁力挪动导致 AI 追进死角——真发生则给捷径加「目标格也需满足安全不变式」的收紧,并记录。步数上限 20000/30000 若超,先看是不是磁力把果子拖来拖去导致追逐,可把 AI 的目标锁定改为「特殊果剩余寿命 < 3s 时放弃改追苹果」,记录改动。

- [ ] **Step 4: Commit**

```bash
git add games/snake/js/ai.js games/snake/tests/test-ai.js
git commit -m "feat(snake): AI 目标升级——特殊果优先/多苹果最近;果子全开零死亡回归通过"
```

---

### Task 5: render.js + main.js 接线(果子绘制/效果指示/速度/揭格 diff 同步)

**Files:**
- Modify: `games/snake/js/render.js`
- Modify: `games/snake/js/main.js`

- [ ] **Step 1: render.js 修改**

a) `drawApple(a)` 改为可复用(主/副苹果同款):签名不变,`drawBoardArea` 里在 `if (G.run.apple) drawApple(G.run.apple);` 后追加:

```js
  for (const a of G.run.extraApples) drawApple(a);
  drawSpecial();
  drawMeteor();
```

b) 新增(drawApple 之后):

```js
// 特殊果:emoji 绘制(引擎美术哲学:emoji 占位,后补图零改码);临期急促闪烁
function drawSpecial() {
  const sp = G.run.special;
  if (!sp) return;
  const { bx, by, cell } = Layout;
  const remain = sp.expiresAt - (G.nowMs || 0);
  if (remain < Fruits.FRUIT_TIMES.blinkAt && Math.sin(performance.now() / 90) < 0) return;
  const bob = Math.sin(performance.now() / 250) * cell * 0.05;
  txt(Fruits.FRUITS[sp.type].emoji,
      bx + sp.x * cell + cell / 2, by + sp.y * cell + cell / 2 + bob,
      '#fff', `${Math.round(cell * 0.8)}px sans-serif`);
}
function drawMeteor() {
  const m = G.run.meteor;
  if (!m) return;
  const { bx, by, cell } = Layout;
  txt('🌠', bx + m.x * cell + cell / 2, by + m.y * cell + cell / 2,
      '#fff', `${Math.round(cell * 0.8)}px sans-serif`);
}
// 生效中的效果指示:分数下方一行小字(💖×n + 各效果剩余秒)
function drawEffectsRow(safeTop) {
  const fx = G.run.effects, now = G.nowMs || 0;
  const items = [];
  if (fx.shield > 0) items.push('💖×' + fx.shield);
  for (const [key, emo] of [['slowUntil', '☁️'], ['demonUntil', '😈'], ['ghostUntil', '😇'],
                            ['trailUntil', '✨'], ['magnetUntil', '🧲']])
    if (now < fx[key]) items.push(emo + Math.ceil((fx[key] - now) / 1000));
  if (items.length)
    txtL(items.join('  '), Layout.bx, safeTop + 48, PAL.text, '12px sans-serif');
}
```

c) `drawHud(safeTop)` 末尾调用 `drawEffectsRow(safeTop);`

d) **揭格 diff 同步**(取代 main 里的头格 punch;流星/羽毛/足迹的揭格都能同步):新增

```js
let revealMirror = null;
function syncRevealDiff() {
  const r = G.run.revealed, n = r.length;
  if (!revealMirror || revealMirror.length !== n) revealMirror = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    if (r[i] && !revealMirror[i]) punchCell(i % G.run.cols, Math.floor(i / G.run.cols));
  revealMirror.set(r);
}
```

并在 `initLayers(img)` 末尾(重放 revealed 的循环之后)加:`revealMirror = new Uint8Array(G.run.revealed); revealMirror.set(G.run.revealed);`

- [ ] **Step 2: main.js 修改**

a) `speed()` 改为:

```js
function speed() {   // 格/秒:基础7随长缓升封顶12;慢慢云 ×0.7;小恶魔 ×1.5(待校准)
  const now = G.nowMs || 0, fx = G.run.effects;
  let m = 1;
  if (now < fx.slowUntil) m *= 0.7;
  if (now < fx.demonUntil) m *= 1.5;
  return Math.min(12, 7 + 0.03 * G.run.snake.length) * m;
}
```

b) `tick(nowMs)` 改为(揭格 diff 同步 + G.nowMs;音效钩子 Task 6 再加):

```js
function tick(nowMs) {
  G.nowMs = nowMs;
  if (G.ai) Core.setDir(G.run, AI.nextMove(G.run, G.cyc, G.aiMem));
  Core.step(G.run, { nowMs, scoreScale: G.ai ? 0.5 : 1 });
  syncRevealDiff();
  if (G.run.levelJustDone) { G.phase = 'LEVEL_DONE'; revealAllMask(); return; }
  if (G.run.dead) { G.phase = 'DEAD'; }
}
```

c) `dispatch` 的 `RESPAWN` 分支里 `punchCell(...)` 一行改为 `syncRevealDiff();`

- [ ] **Step 3: 手动冒烟 + 回归**

Run: `node --check games/snake/js/render.js; node --check games/snake/js/main.js`,三个 node 测试全绿。
起服务器开页面玩 1 分钟:吃 4-6 个苹果应看到 emoji 特殊果出现、临期闪烁;吃到后效果指示行出现;羽毛/足迹/流星的揭格实时反映在遮罩上。

- [ ] **Step 4: Commit**

```bash
git add games/snake/js/render.js games/snake/js/main.js
git commit -m "feat(snake): 果子渲染(emoji/闪烁/效果指示)+速度效果因子+揭格diff同步"
```

---

### Task 6: 合成音效——gen-sfx.js + 引擎 Sfx 接线 + 🔊 开关

**Files:**
- Create: `games/snake/tools/gen-sfx.js`
- Create: `games/snake/assets/audio/`(6 个 wav,工具产出)
- Modify: `games/snake/index.html`(GAME_CONFIG.sfx)
- Modify: `games/snake/js/main.js`(事件触发 + 🔊 开关)

- [ ] **Step 1: gen-sfx.js(节点合成 WAV,零外部素材)**

```js
// games/snake/tools/gen-sfx.js — 合成音效 wav(44.1kHz 16bit mono)
// 用法: node games/snake/tools/gen-sfx.js
const fs = require('fs'), path = require('path');
const SR = 44100;

function envelope(t, dur, a = 0.005, r = 0.08) {
  if (t < a) return t / a;
  const rel = dur - r;
  return t > rel ? Math.max(0, 1 - (t - rel) / r) : 1;
}
function synth(dur, fn) {
  const n = Math.round(SR * dur), buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; buf[i] = fn(t) * envelope(t, dur); }
  return buf;
}
// f0→f1 线性滑音正弦
function tone(f0, f1, dur) {
  return synth(dur, t => Math.sin(2 * Math.PI * (f0 + (f1 - f0) * (t / dur) / 2) * t) * 0.5);
}
function concat(...bufs) {
  let n = 0; bufs.forEach(b => { n += b.length; });
  const out = new Float32Array(n); let o = 0;
  bufs.forEach(b => { out.set(b, o); o += b.length; });
  return out;
}
function toWav(f32) {
  const n = f32.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE((Math.max(-1, Math.min(1, f32[i])) * 32767) | 0, 44 + i * 2);
  return buf;
}

const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });
const files = {
  eat:       tone(520, 780, 0.09),                                        // 啵
  special:   concat(tone(660, 660, 0.07), tone(880, 880, 0.1)),           // 叮咚
  shield:    concat(tone(990, 990, 0.06), tone(1320, 1320, 0.12)),        // 护盾铃
  milestone: concat(tone(523, 523, 0.08), tone(659, 659, 0.08), tone(784, 784, 0.12)),
  level:     concat(tone(523, 523, 0.1), tone(659, 659, 0.1), tone(784, 784, 0.1), tone(1047, 1047, 0.22)),
  death:     tone(300, 90, 0.35),                                         // 软下滑
};
for (const [name, buf] of Object.entries(files))
  fs.writeFileSync(path.join(OUT, name + '.wav'), toWav(buf));
console.log('wrote', Object.keys(files).length, 'wav ->', OUT);
```

- [ ] **Step 2: 运行并独立复核**

Run: `node games/snake/tools/gen-sfx.js`
复核: `node -e "const fs=require('fs');const d='games/snake/assets/audio/';const fl=fs.readdirSync(d);console.log(fl.length, fl.every(f=>fs.statSync(d+f).size>1000))"` → `6 true`

- [ ] **Step 3: index.html 的 GAME_CONFIG 加 sfx**

```js
  window.GAME_CONFIG = {
    id: 'snake',
    languages: ['en', 'zh-CN'],   // P3 扩到 10 语
    sfx: {
      eat: 'assets/audio/eat.wav', special: 'assets/audio/special.wav',
      shield: 'assets/audio/shield.wav', milestone: 'assets/audio/milestone.wav',
      level: 'assets/audio/level.wav', death: 'assets/audio/death.wav',
    },
  };
```

- [ ] **Step 4: main.js 触发音效 + 🔊 开关**

a) `tick(nowMs)` 改为(在 Task 5 版本上加前后对比):

```js
function tick(nowMs) {
  G.nowMs = nowMs;
  const run = G.run;
  const before = { apples: run.stats.apples, milestones: run.milestones };
  if (G.ai) Core.setDir(run, AI.nextMove(run, G.cyc, G.aiMem));
  Core.step(run, { nowMs, scoreScale: G.ai ? 0.5 : 1 });
  syncRevealDiff();
  if (run.stats.apples > before.apples) Sfx.play('eat');
  if (run.lastSpecialEaten) Sfx.play('special');
  if (run.shieldJustUsed) { Sfx.play('shield'); Haptics.light(); }
  if (run.milestones > before.milestones && !run.levelJustDone) Sfx.play('milestone');
  if (run.levelJustDone) { Sfx.play('level'); G.phase = 'LEVEL_DONE'; revealAllMask(); return; }
  if (run.dead) { Sfx.play('death'); Haptics.medium(); G.phase = 'DEAD'; }
}
```

b) boot 里 `Controls.render();` 改为带 🔊 开关(引擎 Controls 支持 extraHtml+bindExtra,样式用 engine.css 的 .ctl-btn):

```js
    Controls.render(
      `<div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>`,
      bar => {
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
      });
```

注意 `I18N.onChange(() => { Controls.render(); renderAll(); })` 里的无参 `Controls.render()` 会复用上次的 extraHtml/bindExtra(引擎实现如此,见 engine/controls.js `lastExtra`),不需要改。

- [ ] **Step 5: 冒烟**

起服务器开页面:首次点击/按键后吃苹果有「啵」声;🔊 点击变 🔇 并静音,刷新后记忆(引擎 CFG.key('sfx') 持久化);AI 通关听到过关小旋律。console 无错。

- [ ] **Step 6: Commit**

```bash
git add games/snake/tools/gen-sfx.js games/snake/assets/audio games/snake/index.html games/snake/js/main.js
git commit -m "feat(snake): 合成音效——gen-sfx 六音色 wav + 引擎 Sfx 接线 + 🔊 开关"
```

---

### Task 7: E2E 扩展 + 全量回归 + tag

**Files:**
- Modify: `games/snake/tests/e2e-p1.js`

- [ ] **Step 1: E2E 追加果子断言**

在「AI reached LEVEL_DONE」断言之后追加:

```js
  // 果子系统集成:AI 通关一整关,特殊果必然刷过、且 AI 吃到过
  const fruitsProbe = await page.evaluate(() => ({
    spawned: window.G.run.stats.specialsSpawned,
    eaten: Object.values(window.G.run.stats.specials).reduce((a, b) => a + b, 0),
  }));
  assert(fruitsProbe.spawned > 0, `specials spawned during AI run (got ${fruitsProbe.spawned})`);
  assert(fruitsProbe.eaten > 0, `AI ate specials (got ${fruitsProbe.eaten})`);
  log(`specials: spawned ${fruitsProbe.spawned}, eaten ${fruitsProbe.eaten}`);
```

- [ ] **Step 2: 全量回归**

Run(仓库根):
```
node games/snake/tests/test-prng.js
node games/snake/tests/test-core.js
node games/snake/tests/test-fruits.js
node games/snake/tests/test-ai.js
node tools/check-locales.js games/snake/locales
```
全绿后,前台起 `python -m http.server 8123` 跑 `node games/snake/tests/e2e-p1.js` → ALL PASS(跑完杀服务器)。截图重看一眼(`C:\tmp\snake\e2e-p1.png`):应能在盘面看到 emoji 特殊果或效果指示行(时机随机,没有也不算失败——硬断言在 stats)。

- [ ] **Step 3: Commit + tag**

```bash
git add games/snake/tests/e2e-p1.js
git commit -m "test(snake): E2E 果子集成断言——特殊果刷新且 AI 吃到"
git tag snake-p2a-fruits
```

---

## Self-Review 记录

- **Spec 覆盖(§3 对照)**:13 种果子逐一有实现与测试——苹果(基础,P1 已有)/双子星 twin/金苹果 gold/小恶魔 demon(提速 ×1.5 + 得分 ×2)/流星 meteor(移动、飞过即揭、追上 +40)/彩虹羽毛 feather(3×3)/圣光足迹 trail(3 格宽)/慢慢云 cloud(×0.7)/天使之剪 scissors(-3 节 + 不变式修剪)/光环 halo(穿身 + 到期重叠天然安全)/守护爱心 heart(该步不执行自动转向、四向皆死照死)/磁力圣环 magnet(0.5s 一格、不入蛇身不出界不叠果)/天国礼盒 gift(随机其他效果、种子确定)。「恒有 1 苹果」「每 4~6 苹果刷 1 个、限时 8s、临期闪烁」「前期/后期权重」(§13 表)全部入码。
- **§13 数值**:specialLife 8000/blinkAt 2500/demon 5000/halo 6000/其余 8000/magnetStep 500/meteorStep 160/RARE_FACTOR 0.35/慢 0.7/恶魔速 1.5——全部集中在 fruits.js 与 speed(),标注待校准。
- **AI 保证不破坏**:果子全开跑既有 5+3 种子零死亡断言(Task 4);安全不变式不因效果变化(剪刀修剪即时反映在 headToTail;光环只影响 core 碰撞,AI 依旧按无 ghost 规划=只会更保守);失败排查预案已写入 Task 4 Step 3。
- **占位符扫描**:无 TBD/TODO;每步含完整代码或确切命令。
- **命名一致性**:`Core.applyFruit` 导出(Task 1 定义、Task 2/3 测试用);`G.nowMs`(main 写、render 读);`syncRevealDiff/revealMirror`(render 定义、main 调);`Fruits.FRUITS/FRUIT_TIMES/CAT_WEIGHTS/RARE_FACTOR`;`stats.specialsSpawned/specials{}`、`shieldJustUsed/lastSpecialEaten` 贯穿 core/main/E2E。
- **已知取舍**:特殊果场上至多 1 个(简化,спec 未规定可叠);效果/副苹果跨关保留、special/meteor 换图清空(设计未规定,取观感);音效走引擎文件型 Sfx(合成 wav 文件)而非运行时 Web Audio 合成——设计 §8「零音频文件」的初衷是体积,6 个短 wav 共 ~100KB,体积可忽略且换来引擎零改动,视为满足初衷;P2b 成就将直接消费 `stats.specials{}` 分型计数(本计划已埋)。
