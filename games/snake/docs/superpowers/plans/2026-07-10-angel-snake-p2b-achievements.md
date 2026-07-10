# 天使贪吃蛇 P2b(存档 + 120 成就)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 版本化存档(引擎 Platform 门面,含当局快照续玩)+ 设计 §6 的全部 120 个成就(单局 20 + 累计 100,阶梯族)+ 成就墙 UI + AI 代打限制(不判单局/不刷纪录),en+zh-CN 文案齐全。

**Architecture:**
- **core 事件流**:`s.events`(每步清空重填)承载吃果/护盾/穿身/过关/死亡等类型化事件,成就引擎与音效统一消费,替代散落 flag(`shieldJustUsed`/`lastSpecialEaten` 保留兼容)。
- **storage.js**:单 JSON 存档挂 `CFG.key('save')`,经引擎 `Platform.storage`(web=localStorage、Capacitor=Preferences,boot 时 hydrate);后端可注入以便 node 单测。
- **achievements.js**:数据驱动——100 个累计成就由 20 个「阶梯族」定义展开;20 个单局成就由每关 tracker 判定;全部纯逻辑双导出可单测。
- **UI**:成就墙用 **DOM 浮层**(120 徽章需要滚动,canvas 手搓不值),`game.css` 样式;解锁 toast 也是 DOM;canvas 游戏层不动。
- **AI 代打限制**(设计 §4):累计计数照常、图鉴照常(P2c),但单局成就不判定、历史纪录(最高连击/最长蛇)不刷新、aiClears 单独计数。

**Tech Stack:** 同 P2a(vanilla/引擎/node assert/playwright)。

**约定:** 同 P2a 计划(仓库根跑命令、禁 `git add -A`、提交尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`、时间一律游戏时钟 `G.nowMs`/`o.nowMs`)。现状必读:`games/snake/js/core.js`(P2a 果子版)、`main.js`(gameMs 游戏时钟)、设计 §6/§11(`.../specs/2026-07-09-snake-angel-design.md`)。

**File Structure(P2b 全量):**

```
games/snake/js/core.js            # 增:s.events 事件流 + stats.meteorsCaught/ghostPassed
games/snake/js/storage.js         # 新:版本化存档(注入式后端)+ 当局快照序列化
games/snake/js/achievements.js    # 新:阶梯族展开/单局 tracker/判定引擎(纯逻辑)
games/snake/js/main.js            # 增:事件消费/存档触发/续玩/AI 局限制/toast
games/snake/js/render.js          # 微改:无(成就 UI 走 DOM);仅在 HUD 无改动
games/snake/index.html            # 增:storage/achievements script + 成就浮层容器 div
games/snake/css/game.css          # 增:浮层/徽章墙/toast 样式
games/snake/locales/{en,zh-CN}.json  # 增:~140 key(120 成就名+UI 文案)
games/snake/tests/test-storage.js
games/snake/tests/test-achievements.js
games/snake/tests/e2e-p1.js       # 增:成就解锁/存档 reload 断言
```

---

### Task 1: core.js 事件流 + 补充统计

**Files:** Modify `games/snake/js/core.js`;Test 追加 `games/snake/tests/test-fruits.js`

- [ ] **Step 1: 失败测试**(test-fruits.js 追加)

```js
// --- 事件流:每步清空重填,类型化事件 ---
{
  const g = Core.createGame({ seed: 21 });
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.apple = { x: h.x + d.x, y: h.y + d.y };
  Core.step(g, { nowMs: 1000 });
  assert(Array.isArray(g.events), 'events 数组存在');
  assert(g.events.some(e => e.t === 'apple'), '吃苹果事件');
  Core.step(g, { nowMs: 1100 });
  assert(!g.events.some(e => e.t === 'apple'), '下一步清空');
  // 特殊果事件带类型
  const d2 = Core.DIRS[g.nextDir], h2 = g.snake[0];
  g.special = { type: 'gold', x: h2.x + d2.x, y: h2.y + d2.y, expiresAt: 99999 };
  Core.step(g, { nowMs: 1200 });
  assert(g.events.some(e => e.t === 'special' && e.type === 'gold'), 'special 事件含类型');
}
// --- ghostPassed / meteorsCaught 统计 ---
{
  const g = Core.createGame({ seed: 22 });
  g.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g, { nowMs: 1000 + i });
  Core.setDir(g, 'down'); Core.step(g, { nowMs: 2000 });
  Core.setDir(g, 'left'); Core.step(g, { nowMs: 2001 });
  Core.applyFruit(g, 'halo', 2002, {});
  Core.setDir(g, 'up'); Core.step(g, { nowMs: 2003 });   // 穿进身体
  assert.strictEqual(g.stats.ghostPassed, 1, '穿身格计数');
  assert(g.events.some(e => e.t === 'ghostPass'), 'ghostPass 事件');
  const g2 = Core.createGame({ seed: 23 });
  const dd = Core.DIRS[g2.nextDir], hh = g2.snake[0];
  g2.meteor = { x: hh.x + dd.x, y: hh.y + dd.y, dx: 1, dy: 1, nextAt: 99999999 };
  g2.apple = { x: 0, y: 15 };
  Core.step(g2, { nowMs: 3000 });
  assert.strictEqual(g2.stats.meteorsCaught, 1, '流星追上计数');
  assert(g2.events.some(e => e.t === 'meteorCatch'), 'meteorCatch 事件');
}
console.log('OK test-fruits(事件流)');
```

- [ ] **Step 2: 实现**(core.js 改动点)

a) createGame 的 state 增:`events: [],`;stats 增 `meteorsCaught: 0, ghostPassed: 0`。
b) step 顶部(`s.shieldJustUsed = false; ...` 处)加 `s.events = [];`。
c) 埋点(每处一行 `s.events.push(...)`):
   - `gainApple` 末尾:`s.events.push({ t: 'apple' });`(主/副苹果共用);eatAt 副苹果分支在 gainApple 后追加 `s.events.push({ t: 'extra', batch: <该副苹果的 batch> })` —— 见 d);
   - eatAt special 分支:`s.events.push({ t: 'special', type: t });`
   - eatAt meteor 分支:`s.stats.meteorsCaught++; s.events.push({ t: 'meteorCatch' });`
   - 护盾成功转向处:`s.events.push({ t: 'shield' });`
   - step 中蛇头移入身体格且 ghost 生效时(hitSelf 判定处需先算出「本格是否身体格」再看 ghost):`s.stats.ghostPassed++; s.events.push({ t: 'ghostPass' });` —— 实现:把 isLethalCell 中的身体命中拆出 `bodyAt(s,x,y)`(不含尾让位逻辑的复用),step 里 `if (ghost && bodyAtStrict) {...}`;注意尾让位格不算穿身;
   - completeLevel 末尾:`s.events.push({ t: 'level' });`;die 末尾:`s.events.push({ t: 'death' });`;checkMilestone 触发处:`s.events.push({ t: 'milestone' });`
d) **twin 批次**(单局成就「双倍快乐」需要):applyFruit twin 分支改为 `const batch = ++s.twinBatch || (s.twinBatch = 1)` 式自增(state 加 `twinBatch: 0`),`s.extraApples.push({ x: c.x, y: c.y, batch, at: now })`;eatAt 副苹果分支 push `{ t: 'extra', batch: a.batch }`(a 为被吃的副苹果对象)。twin 事件本身:`s.events.push({ t: 'twinSpawn', batch, at: now })`。
e) 磁力 drift 与渲染不受 extraApples 对象多字段影响(只读 x/y),确认无需改。

- [ ] **Step 3: 全量回归**:test-fruits/test-core/test-ai 全绿(events 为增量,不改既有行为)。

- [ ] **Step 4: Commit**

```bash
git add games/snake/js/core.js games/snake/tests/test-fruits.js
git commit -m "feat(snake): core 事件流——类型化事件/穿身与流星统计/twin批次"
```

---

### Task 2: storage.js 版本化存档 + 当局快照

**Files:** Create `games/snake/js/storage.js`;Test `games/snake/tests/test-storage.js`;Modify `games/snake/index.html`(script 标签,ai.js 之后 render.js 之前)

- [ ] **Step 1: 失败测试**

```js
// games/snake/tests/test-storage.js
const assert = require('assert');
const Storage = require('../js/storage.js');
const Core = require('../js/core.js');

// 注入内存后端
function memBackend() {
  const m = {};
  return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, _m: m };
}

// --- 空后端 → 默认档 ---
{
  const be = memBackend();
  const s = Storage.load(be, 'snake_save');
  assert.strictEqual(s.v, 1);
  assert.deepStrictEqual(s.ach.unlocked, []);
  assert.strictEqual(s.stats.apples, 0);
  assert.strictEqual(s.run, null);
}
// --- 写读闭环 ---
{
  const be = memBackend();
  const s = Storage.load(be, 'k');
  s.stats.apples = 42; s.ach.unlocked.push('img_1');
  Storage.save(be, 'k', s);
  const s2 = Storage.load(be, 'k');
  assert.strictEqual(s2.stats.apples, 42);
  assert.deepStrictEqual(s2.ach.unlocked, ['img_1']);
}
// --- 坏档/旧版本 → 不崩,回默认(字段保守合并) ---
{
  const be = memBackend();
  be.set('k', '{broken json');
  const s = Storage.load(be, 'k');
  assert.strictEqual(s.v, 1, '坏档回默认');
  be.set('k', JSON.stringify({ v: 0, stats: { apples: 7 } }));
  const s2 = Storage.load(be, 'k');
  assert.strictEqual(s2.v, 1, '旧版本升到当前');
  assert.strictEqual(s2.stats.apples, 7, '已有字段保留');
  assert(Array.isArray(s2.ach.unlocked), '缺失字段补默认');
}
// --- 当局快照:序列化 core state → 恢复后逐字段一致且可继续 step ---
{
  const g = Core.createGame({ seed: 33 });
  for (let i = 0; i < 30; i++) {
    Core.setDir(g, ['right', 'down', 'left', 'down'][i % 4]);
    Core.step(g, { nowMs: 1000 + i * 100 });
    if (g.dead) Core.respawn(g);
  }
  const snap = Storage.snapshotRun(g, 5, 12345);      // (state, imgPos, gameMs)
  const r = Storage.restoreRun(snap);
  assert.strictEqual(r.imgPos, 5);
  assert.strictEqual(r.gameMs, 12345);
  const h = r.state;
  assert.deepStrictEqual(h.snake, g.snake);
  assert.strictEqual(h.revealedCount, g.revealedCount);
  assert.strictEqual(h.score, g.score);
  assert.strictEqual(h.targetLen, g.targetLen);
  assert.deepStrictEqual(Array.from(h.revealed), Array.from(g.revealed));
  assert.deepStrictEqual(h.effects, g.effects);
  Core.step(h, { nowMs: 99999 });                     // 恢复态可继续跑
  assert(!isNaN(h.score));
}
console.log('OK test-storage');
```

- [ ] **Step 2: 实现**

```js
// games/snake/js/storage.js — 版本化存档(注入式后端,双导出)
// 后端 = { get(k)→string|null, set(k,v) };浏览器用引擎 Platform.storage(先 hydrate)。
const CoreS_ = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;

const SAVE_V = 1;

function defaults() {
  return {
    v: SAVE_V,
    settings: { theme: 'cloud' },
    gallery: { unlocked: [], imgPos: 0 },            // unlocked: 图片文件名列表(P2c 消费)
    ach: { unlocked: [] },
    stats: {                                          // 累计计数(成就引擎消费)
      apples: 0, specials: {}, cellsRevealed: 0, steps: 0,
      deaths: 0, shieldSaves: 0, levelsCleared: 0, levelsStarted: 0,
      totalScore: 0, noDeathClears: 0, speedClears: 0, aiClears: 0,
      revives: 0, meteorsCaught: 0, ghostPassed: 0, setsDone: 0,
      playtimeMs: 0, langSwitched: 0, skinClears: {},
      maxCombo: 0, maxLen: 0,                         // 历史纪录(AI 局不刷)
      lastPlayDay: '', streakDays: 0, dayClears: 0, dayClearsDate: '',
      day5Done: 0,
    },
    run: null,                                        // 当局快照(可续玩)
  };
}

// 保守合并:default 里有而 saved 缺 → 补;类型不符 → 用 default
function merge(def, saved) {
  if (saved == null || typeof saved !== 'object') return def;
  const out = Array.isArray(def) ? saved : { ...def };
  if (!Array.isArray(def)) {
    for (const k of Object.keys(def)) {
      const dv = def[k], sv = saved[k];
      if (sv === undefined) continue;
      out[k] = (dv !== null && typeof dv === 'object' && !Array.isArray(dv))
        ? merge(dv, sv)
        : (Array.isArray(dv) ? (Array.isArray(sv) ? sv : dv) : sv);
    }
  }
  return out;
}

function load(backend, key) {
  let raw = null;
  try { raw = backend.get(key); } catch (e) {}
  if (!raw) return defaults();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return defaults(); }
  const s = merge(defaults(), parsed);
  s.v = SAVE_V;
  return s;
}

function save(backend, key, s) {
  try { backend.set(key, JSON.stringify(s)); } catch (e) {}
}

// 当局快照:core state 里除 rand(函数)外全部可 JSON 化;revealed 转普通数组
function snapshotRun(state, imgPos, gameMs) {
  const { rand, revealed, ...rest } = state;
  return { imgPos, gameMs, seed2: Math.floor(Math.random() * 2147483647),
           state: { ...JSON.parse(JSON.stringify(rest)), revealed: Array.from(revealed) } };
}
// 恢复:重建 Uint8Array 与新 rand(续玩换新种子不影响公平性——揭图进度/蛇/分数才是要保的)
function restoreRun(snap) {
  const st = JSON.parse(JSON.stringify(snap.state));
  st.revealed = new Uint8Array(st.revealed);
  st.rand = (typeof module !== 'undefined' && module.exports
    ? require('../../../engine/prng.js') : PRNG).create(snap.seed2 || 1);
  return { state: st, imgPos: snap.imgPos, gameMs: snap.gameMs };
}

const Storage = { SAVE_V, defaults, load, save, snapshotRun, restoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
```

注意 `snapshotRun` 用了 `Math.random()`(换新种子)——这是**唯一**允许的非 PRNG 随机(不影响任何测试确定性,快照测试不断言 seed2)。

- [ ] **Step 3: index.html** 在 `js/ai.js` 之后插 `<script src="js/storage.js"></script>`。

- [ ] **Step 4: 跑测试** → `OK test-storage`;`node --check` 过。

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/storage.js games/snake/tests/test-storage.js games/snake/index.html
git commit -m "feat(snake): 版本化存档——注入后端/保守合并/坏档兜底/当局快照续玩"
```

---

### Task 3: achievements.js 引擎 + 120 定义

**Files:** Create `games/snake/js/achievements.js`;Test `games/snake/tests/test-achievements.js`;Modify `games/snake/index.html`(storage.js 之后)

#### 数据:20 个阶梯族 → 100 个累计成就

族展开规则:族 `id` + 阈值数组 → 成就 id `<族id>_1..n`,locale key `ach.<成就id>`。counter 取 `stats[counter]`;`specials` 族按果子类型取 `stats.specials[type]`。

```js
// 累计成就:20 族 → 100 个(阈值与名字严格对应设计 §6.2)
const FAMILIES = [
  { id: 'img',    counter: 'levelsCleared', tiers: [1, 5, 10, 25, 50, 75, 100, 200, 350, 500] },
  { id: 'set',    counter: 'setsDone',      tiers: [1, 3, 5, 10, 15, 25] },
  { id: 'games',  counter: 'levelsStarted', tiers: [10, 50, 100, 500, 1000] },
  { id: 'score',  counter: 'totalScore',    tiers: [10000, 100000, 500000, 1000000, 5000000] },
  { id: 'apple',  counter: 'apples',        tiers: [100, 500, 1000, 5000, 10000] },
  // 12 特殊果 ×2 档:常见 50/500,稀有(gold/meteor/scissors)20/100
  { id: 'f_twin',     counter: 'specials.twin',     tiers: [50, 500] },
  { id: 'f_feather',  counter: 'specials.feather',  tiers: [50, 500] },
  { id: 'f_cloud',    counter: 'specials.cloud',    tiers: [50, 500] },
  { id: 'f_halo',     counter: 'specials.halo',     tiers: [50, 500] },
  { id: 'f_demon',    counter: 'specials.demon',    tiers: [50, 500] },
  { id: 'f_heart',    counter: 'specials.heart',    tiers: [50, 500] },
  { id: 'f_magnet',   counter: 'specials.magnet',   tiers: [50, 500] },
  { id: 'f_trail',    counter: 'specials.trail',    tiers: [50, 500] },
  { id: 'f_gift',     counter: 'specials.gift',     tiers: [50, 500] },
  { id: 'f_gold',     counter: 'specials.gold',     tiers: [20, 100] },
  { id: 'f_meteor',   counter: 'specials.meteor',   tiers: [20, 100] },
  { id: 'f_scissors', counter: 'specials.scissors', tiers: [20, 100] },
  { id: 'cell',   counter: 'cellsRevealed', tiers: [1000, 10000, 50000, 128000] },
  { id: 'dist',   counter: 'steps',         tiers: [10000, 100000, 500000, 1000000] },
  { id: 'death',  counter: 'deaths',        tiers: [1, 10, 100, 1000] },
  { id: 'save',   counter: 'shieldSaves',   tiers: [1, 10, 100] },
  { id: 'noD',    counter: 'noDeathClears', tiers: [1, 10, 50] },
  { id: 'fast',   counter: 'speedClears',   tiers: [1, 10, 50] },
  { id: 'aic',    counter: 'aiClears',      tiers: [1, 10, 100] },
  { id: 'rev',    counter: 'revives',       tiers: [1, 10] },
  { id: 'cmb',    counter: 'maxCombo',      tiers: [10, 30, 50] },
  { id: 'len',    counter: 'maxLen',        tiers: [50, 100, 150] },
  { id: 'day',    counter: 'streakDays',    tiers: [3, 7, 30, 100] },
  { id: 'time',   counter: 'playtimeMs',    tiers: [3600000, 36000000, 180000000] },
  // 4 皮肤各通关 1 次(P2c 皮肤上线前 counter 恒 0,先定义)
  { id: 'sk_cloud',  counter: 'skinClears.cloud',   tiers: [1] },
  { id: 'sk_star',   counter: 'skinClears.star',    tiers: [1] },
  { id: 'sk_candy',  counter: 'skinClears.candy',   tiers: [1] },
  { id: 'sk_heaven', counter: 'skinClears.heaven',  tiers: [1] },
  { id: 'lang',   counter: 'langSwitched',  tiers: [1] },
  { id: 'day5',   counter: 'day5Done',      tiers: [1] },
];
// 展开数恰 100:10+6+5+5+5+(9*2+3*2)+4+4+4+3+3+3+3+2+3+3+4+3+(4*1)+1+1 = 100
```

(实现里加一行运行时断言:`if (CUM_DEFS.length !== 100) throw ...`,测试也断言。)

#### 数据:20 个单局成就(tracker 判定)

tracker 每关(遮罩重置→揭满)累积,字段:`scoreGained, deathsInLevel, kindsEaten:Set, survEaten, comboMax, lenMax, meteorsCaught, ghostPassMax(单次halo), magnetMax(单次magnet), demonMax(单次demon 吃果数), twinFast(bool), shieldAt(gameMs|null), clutch(bool), ring(连续边格数), edgeDone(bool), lastBite(bool), startMs, aiRun(bool)`。

```js
const RUN_ACHS = [
  { id: 'r_score1',  check: t => t.scoreGained >= 1000 },
  { id: 'r_score2',  check: t => t.scoreGained >= 5000 },
  { id: 'r_speed3',  check: t => t.clearMs - t.startMs < 180000 },
  { id: 'r_speed2',  check: t => t.clearMs - t.startMs < 120000 },
  { id: 'r_perfect', check: t => t.deathsInLevel === 0 },
  { id: 'r_naked',   check: t => t.deathsInLevel === 0 && t.survEaten === 0 },
  { id: 'r_vegan',   check: t => t.kindsEaten.size === 0 },
  { id: 'r_feast',   check: t => t.kindsEaten.size >= 8 },
  { id: 'r_combo20', check: t => t.comboMax >= 20 },
  { id: 'r_combo50', check: t => t.comboMax >= 50 },
  { id: 'r_len50',   check: t => t.lenMax >= 50 },
  { id: 'r_len100',  check: t => t.lenMax >= 100 },
  { id: 'r_demon3',  check: t => t.demonMax >= 3 },
  { id: 'r_meteor2', check: t => t.meteorsCaught >= 2 },
  { id: 'r_magnet4', check: t => t.magnetMax >= 4 },
  { id: 'r_twinfast',check: t => t.twinFast },
  { id: 'r_ghost5',  check: t => t.ghostPassMax >= 5 },
  { id: 'r_clutch',  check: t => t.clutch },
  { id: 'r_edge',    check: t => t.edgeDone },
  { id: 'r_lastbite',check: t => t.lastBite },
];
```

判定时机:`level` 事件(揭满)那一步,`t.clearMs = 当前 gameMs`,依次 check 未解锁项;**aiRun 为 true 的关不判定任何单局成就**。survEaten = cloud/scissors/halo/heart 计数。

#### 引擎 API(纯逻辑,双导出)

```js
// Ach.newTracker(gameMs, aiRun) → tracker
// Ach.onStep(tracker, runState, events, gameMs)   // 每 tick 调:更新 tracker(读 events + runState)
// Ach.onLevelClear(tracker, save, gameMs, extra)  // extra = { aiRun }
//    → { unlocked: [id...] }  同时更新 save.stats(levelsCleared/noDeathClears/speedClears/aiClears/day系列)
// Ach.accumulate(save, runState, events, ctx)     // 每 tick 调:累计计数(apples/specials/steps/cells/deaths/shieldSaves/meteorsCaught/ghostPassed/totalScoreDelta)
//    ctx = { aiRun, scoreDelta }  纪录类(maxCombo/maxLen)仅 !aiRun 时刷新
// Ach.checkCum(save) → { unlocked: [id...] }      // 扫累计族,新过阈值的入 save.ach.unlocked
// Ach.getCounter(save, path)                      // 'specials.gold' 点路径取数
// Ach.ALL_IDS / Ach.FAMILIES / Ach.RUN_ACHS / Ach.tierInfo(id)  // UI 用
```

tracker 具体更新规则(onStep 内,全部由 events + runState 推导):
- `scoreGained += ctx.scoreDelta`(由 main 传本 tick score 差);`comboMax = max(, run.combo)`;`lenMax = max(, run.snake.length)`;
- `events: apple/extra/special` → 若 special:`kindsEaten.add(type)`,surv 类(cloud/scissors/halo/heart)`survEaten++`;
- demon 窗口:special demon 事件时记 `demonWinStart=gameMs, demonWinEats=0`;此后 gameMs < demonWinStart+5000 期间每个 apple/extra/special 事件 `demonWinEats++`,`demonMax=max(...)`;magnet 同理(8000 窗口,`magnetMax`);
- `meteorCatch` → `meteorsCaught++`;`ghostPass` → 当前 halo 段计数 `ghostRun++`(halo special 事件重置为 0),`ghostPassMax=max(...)`;非 ghostPass 步不清零(蛇可能在身外绕);halo 结束(effects.ghostUntil < gameMs)后 ghostRun 清 0;
- twinFast:`twinSpawn` 事件记 `twinBatches[batch]={at, left:2}`;`extra` 事件对应 batch `left--`,若 `left===0 && gameMs - at <= 10000` → `twinFast=true`;
- `shield` 事件 → `shieldAt = gameMs`;level 事件时 `clutch = shieldAt !== null && gameMs - shieldAt <= 30000`;
- edge:每步头在最外圈(x===0||y===0||x===15||y===15)则 `ring++` 否则 `ring=0`;`ring >= 60` → `edgeDone=true`(16×16 周长 60,连续沿圈 60 步必为整圈——蛇不能 180°,在圈上只能顺走或离开);
- lastBite:level 事件与 (apple|extra|special) 事件同步出现 → true;
- `death` 事件 → `deathsInLevel++`(tracker **不重置**——单局=一张图,死亡重生仍算同一局)。

accumulate 具体(save.stats):apples/specials[type]/steps(每步+1)/cellsRevealed(revealedCount 增量,由 main 传 delta 或 events 里 milestone 不够——直接由 main 传 `ctx.revealDelta`)/deaths/shieldSaves/meteorsCaught/ghostPassed/totalScore += scoreDelta;`!aiRun` 时 `maxCombo/maxLen` 取 max。
onLevelClear 里:`levelsCleared++`;`aiRun ? aiClears++ : (deathsInLevel===0 && noDeathClears++, 用时<180000 && speedClears++)`;日期系列:`today=new Date().toDateString()`,与 lastPlayDay 比对更新 streakDays(相邻天+1,断档=1),dayClearsDate/dayClears 当日通关数,≥5 → day5Done=1。playtimeMs 由 main 每 tick 加 interval(在 accumulate 里 `+= ctx.dtMs`)。levelsStarted 在 main 的 enterReady 处 `stats.levelsStarted++`(每张图开局算一局)。

- [ ] **Step 1: 失败测试**(test-achievements.js,全文)

```js
const assert = require('assert');
const Ach = require('../js/achievements.js');
const Storage = require('../js/storage.js');

// --- 定义完整性:恰 100 累计 + 20 单局,id 无重复 ---
{
  assert.strictEqual(Ach.CUM_DEFS.length, 100, '累计成就恰 100');
  assert.strictEqual(Ach.RUN_ACHS.length, 20, '单局成就恰 20');
  const ids = [...Ach.CUM_DEFS.map(d => d.id), ...Ach.RUN_ACHS.map(d => d.id)];
  assert.strictEqual(new Set(ids).size, 120, 'id 无重复');
}
// --- 累计族:过阈值解锁一次、不重复 ---
{
  const s = Storage.defaults();
  s.stats.apples = 99;
  assert.deepStrictEqual(Ach.checkCum(s).unlocked, [], '99 苹果不解锁');
  s.stats.apples = 100;
  const r1 = Ach.checkCum(s);
  assert(r1.unlocked.includes('apple_1'), '100 苹果解锁 apple_1');
  assert.deepStrictEqual(Ach.checkCum(s).unlocked, [], '不重复解锁');
  s.stats.apples = 10000;
  const r2 = Ach.checkCum(s);
  assert(['apple_2','apple_3','apple_4','apple_5'].every(id => r2.unlocked.includes(id)), '跨档补齐');
}
// --- 点路径计数(specials)与稀有档 ---
{
  const s = Storage.defaults();
  s.stats.specials = { gold: 20 };
  assert(Ach.checkCum(s).unlocked.includes('f_gold_1'), 'specials.gold 点路径生效');
}
// --- 纪录类 AI 局不刷 ---
{
  const s = Storage.defaults();
  Ach.accumulate(s, { combo: 40, snake: { length: 60 }, stats: {} }, [], { aiRun: true, scoreDelta: 0, revealDelta: 0, dtMs: 100 });
  assert.strictEqual(s.stats.maxCombo, 0, 'AI 局不刷 maxCombo');
  Ach.accumulate(s, { combo: 40, snake: { length: 60 }, stats: {} }, [], { aiRun: false, scoreDelta: 0, revealDelta: 0, dtMs: 100 });
  assert.strictEqual(s.stats.maxCombo, 40, '人工局刷新');
  assert.strictEqual(s.stats.maxLen, 60);
}
// --- 单局 tracker:完美/速通/连击/素食 ---
{
  const t = Ach.newTracker(1000, false);
  t.scoreGained = 1200; t.comboMax = 21;   // 直接注入(tracker 是纯数据)
  const s = Storage.defaults();
  const r = Ach.onLevelClear(t, s, 1000 + 60000, { aiRun: false });
  assert(r.unlocked.includes('r_score1'), '1000 分');
  assert(r.unlocked.includes('r_perfect'), '无死亡');
  assert(r.unlocked.includes('r_speed3'), '3 分钟内');
  assert(r.unlocked.includes('r_speed2'), '2 分钟内');
  assert(r.unlocked.includes('r_combo20'), '连击 20');
  assert(r.unlocked.includes('r_vegan'), '素食(没吃特殊果)');
  assert(!r.unlocked.includes('r_score2'), '5000 分未到');
  assert.strictEqual(s.stats.levelsCleared, 1);
  assert.strictEqual(s.stats.noDeathClears, 1);
  assert.strictEqual(s.stats.speedClears, 1);
}
// --- AI 局:图计数照常,单局不判 ---
{
  const t = Ach.newTracker(0, true);
  t.scoreGained = 99999;
  const s = Storage.defaults();
  const r = Ach.onLevelClear(t, s, 30000, { aiRun: true });
  assert.deepStrictEqual(r.unlocked.filter(id => id.startsWith('r_')), [], 'AI 局零单局成就');
  assert.strictEqual(s.stats.levelsCleared, 1, '图计数照常');
  assert.strictEqual(s.stats.aiClears, 1);
  assert.strictEqual(s.stats.noDeathClears, 0, 'AI 局不计无死亡');
}
// --- onStep 事件消费:demon 窗口/twin 限时/边圈/lastBite ---
{
  const t = Ach.newTracker(0, false);
  const run = { combo: 0, snake: { length: 3 }, effects: { ghostUntil: 0 } };
  const st = (events, ms, head) => {
    run.snake[0] = head || { x: 1, y: 1 };
    Ach.onStep(t, run, events, ms);
  };
  st([{ t: 'special', type: 'demon' }], 1000);
  st([{ t: 'apple' }], 2000); st([{ t: 'apple' }], 3000); st([{ t: 'apple' }], 4000);
  assert(t.demonMax >= 3, 'demon 窗口 3 吃');
  st([{ t: 'twinSpawn', batch: 1, at: 5000 }], 5000);
  st([{ t: 'extra', batch: 1 }], 6000);
  st([{ t: 'extra', batch: 1 }], 9000);
  assert(t.twinFast, 'twin 10s 内吃完');
  // 边圈:喂 60 个连续边格头位置
  const t2 = Ach.newTracker(0, false);
  const run2 = { combo: 0, snake: [{ x: 0, y: 0 }], effects: { ghostUntil: 0 } };
  run2.snake.length = 1;
  const per = [];
  for (let x = 0; x < 16; x++) per.push({ x, y: 0 });
  for (let y = 1; y < 16; y++) per.push({ x: 15, y });
  for (let x = 14; x >= 0; x--) per.push({ x, y: 15 });
  for (let y = 14; y >= 1; y--) per.push({ x: 0, y });
  per.forEach((h, i) => { run2.snake[0] = h; Ach.onStep(t2, run2, [], i * 100); });
  assert(t2.edgeDone, '连续 60 边格 = 整圈');
  // lastBite
  const t3 = Ach.newTracker(0, false);
  Ach.onStep(t3, run2, [{ t: 'level' }, { t: 'apple' }], 100);
  assert(t3.lastBite, '揭满同步吃果');
}
// --- 阶梯 UI 数据:tierInfo ---
{
  const info = Ach.tierInfo('apple_3');
  assert.strictEqual(info.threshold, 1000);
  assert.strictEqual(info.counter, 'apples');
}
console.log('OK test-achievements');
```

- [ ] **Step 2: 实现 achievements.js**(按上文 API/规则;`CUM_DEFS` 由 FAMILIES 展开并断言 100;`getCounter` 支持点路径;`onStep`/`onLevelClear`/`accumulate`/`checkCum` 按规则实现;tracker 为纯对象)。头部双导出:node `require('./storage.js')` 不需要(save 由调用方传),零内部依赖。

- [ ] **Step 3: index.html** storage.js 之后插 `<script src="js/achievements.js"></script>`。

- [ ] **Step 4: 跑测试全绿;Commit**

```bash
git add games/snake/js/achievements.js games/snake/tests/test-achievements.js games/snake/index.html
git commit -m "feat(snake): 成就引擎——20族展开100累计+20单局tracker/AI局限制/日期系列"
```

---

### Task 4: locale——120 成就名 + UI 文案(en/zh-CN)

**Files:** Modify `games/snake/locales/en.json`、`games/snake/locales/zh-CN.json`

key 规范:`ach.<id>`(名字;不做长描述,徽章 hover/详情 P3 再说)+ `achui.*`(界面)。zh 名字**严格照设计 §6**;en 意译。全部 key 加进两文件(嵌套:`"ach": { "img_1": "初见天使", ... }`)。

zh 完整清单(照抄进 zh-CN.json;en 由实现者按下表英文列写入 en.json):

| 族/id | zh(依次) | en(依次) |
|---|---|---|
| img_1..10 | 初见天使/小小收藏家/启程/渐入佳境/半百画廊/执着藏家/百图斩/藏家之魂/博物馆级/天国全图鉴 | First Angel / Little Collector / Setting Off / Getting Good / Fifty Gallery / Devoted Collector / Hundred Slash / Collector's Soul / Museum Grade / Heaven's Full Gallery |
| set_1..6 | 初集达成/三集连载/五集精选/十全十美/十五志/大满贯 | First Set / Triple Feature / Five Picks / Perfect Ten / Fifteen Chronicles / Grand Slam |
| games_1..5 | 新手上路/常客/百战/千锤百炼/一千零一局 | Rookie Road / Regular / Hundred Battles / Battle-Forged / 1001 Games |
| score_1..5 | 小有积蓄/腰缠万贯/分数大亨/百万富翁/五百万传说 | Pocket Change / Loaded / Score Tycoon / Millionaire / 5M Legend |
| apple_1..5 | 开胃小菜/吃货入门/千果盛宴/苹果园主/万苹之王 | Appetizer / Foodie / Thousand-Fruit Feast / Orchard Owner / Apple King |
| f_twin_1..2 | 双星初现/双星收割机 | Twin Debut / Twin Harvester |
| f_feather_1..2 | 初拾彩羽/彩虹画师 | First Feather / Rainbow Painter |
| f_cloud_1..2 | 慢云初乘/云端慢生活 | Cloud Rider / Slow Cloud Life |
| f_halo_1..2 | 初戴光环/光环行者 | First Halo / Halo Walker |
| f_demon_1..2 | 初遇恶魔/与魔共舞 | Imp Encounter / Dance with Imps |
| f_heart_1..2 | 初获守护/爱心满仓 | First Guard / Full of Hearts |
| f_magnet_1..2 | 初试磁力/万有引力 | Magnetic Debut / Universal Gravity |
| f_trail_1..2 | 初踏圣光/光之铺路人 | First Light Step / Light Paver |
| f_gift_1..2 | 初开礼盒/开盒狂魔 | First Gift / Unboxing Maniac |
| f_gold_1..2 | 初见金果/点石成金 | First Gold / Midas Touch |
| f_meteor_1..2 | 初捕流星/追星大师 | Meteor Catcher / Star Chaser |
| f_scissors_1..2 | 初试剪刀/理发师天使 | First Snip / Barber Angel |
| cell_1..4 | 千格之路/万格画布/五万格/一格不落 | Thousand Cells / Ten-K Canvas / Fifty-K / Every Last Cell |
| dist_1..4 | 千里之行/十万八千格/长途旅者/百万爬行 | Long March / 108K Cells / Long Hauler / Million Crawl |
| death_1..4 | 第一次跌倒/越挫越勇/百折不挠/不倒翁 | First Fall / Bounce Back / Unbreakable / Tumbler |
| save_1..3 | 有惊无险/护盾常客/爱心守护神 | Close Call / Shield Regular / Guardian of Hearts |
| noD_1..3 | 首次完美/完美主义者/零失误传说 | First Perfect / Perfectionist / Flawless Legend |
| fast_1..3 | 快枪手/速通爱好者/闪电天使 | Quick Draw / Speedrunner / Lightning Angel |
| aic_1..3 | 监工/甩手掌柜/全自动化 | Supervisor / Hands-Off Boss / Fully Automated |
| rev_1..2 | 再来一次/九命蛇 | One More Try / Nine-Lived Snake |
| cmb_1..3 | 连击新星/连击高手/连击之魂 | Combo Rookie / Combo Pro / Combo Soul |
| len_1..3 | 大蛇/巨蟒传说/贪吃真龙 | Big Snake / Python Legend / True Dragon |
| day_1..4 | 三日之约/周常天使/月度守护/百日陪伴 | Three-Day Promise / Weekly Angel / Monthly Guardian / 100 Days Together |
| time_1..3 | 初识/沉浸/资深玩家 | Acquainted / Immersed / Veteran |
| sk_cloud_1 / sk_star_1 / sk_candy_1 / sk_heaven_1 | 云端漫步/星夜巡游/糖果之旅/花园礼赞 | Cloud Stroll / Starry Patrol / Candy Trip / Garden Ode |
| lang_1 | 环游世界 | Around the World |
| day5_1 | 今日大丰收 | Big Harvest Day |
| r_score1/r_score2 | 初露锋芒/高分表演 | First Sparkle / High Score Show |
| r_speed3/r_speed2 | 速通天使/极速圣光 | Speedy Angel / Lightspeed Halo |
| r_perfect/r_naked/r_vegan/r_feast | 完美无瑕/裸奔通关/素食主义/全果宴 | Flawless / Bare Run / Vegan Run / Full Fruit Feast |
| r_combo20/r_combo50 | 连击大师/连击之神 | Combo Master / Combo God |
| r_len50/r_len100 | 巨蟒/神龙 | Python / Divine Dragon |
| r_demon3/r_meteor2/r_magnet4/r_twinfast | 贴地飞行/追星人/大丰收/双倍快乐 | Ground Flight / Star Chaser / Big Harvest / Double Joy |
| r_ghost5/r_clutch/r_edge/r_lastbite | 极限逃生/千钧一发/边缘行者/收尾艺术 | Great Escape / Clutch Save / Edge Walker / Finishing Art |

UI 文案(`achui`):`title`(Achievements/成就)、`tabRun`(Per-Level/单局)、`tabCum`(Lifetime/累计)、`locked`(Locked/未解锁)、`progress`("{cur}/{max}")、`close`(Close/关闭)、`unlocked`(Unlocked!/达成!)。另 `menu.achievements`(Achievements/成就)——顶栏按钮 title 用。

- [ ] **Step 1: 写入两文件;`node tools/check-locales.js games/snake/locales` → 0 fail(key 数应为 22+120+7+1=150)。**
- [ ] **Step 2: Commit**

```bash
git add games/snake/locales
git commit -m "feat(snake): 120 成就名+成就墙文案(en/zh-CN)"
```

---

### Task 5: main.js 集成——事件消费/存档/续玩/toast

**Files:** Modify `games/snake/js/main.js`、`games/snake/index.html`(toast 容器)、`games/snake/css/game.css`(toast 样式)

- [ ] **Step 1: main.js 改动**

a) G 增:`save: null, tracker: null, saveKey: null`。
b) boot:`Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('save')])`;hydrate 后:

```js
    G.saveKey = CFG.key('save');
    G.save = Storage.load(Platform.storage, G.saveKey);
```

c) **续玩**:boot 里 createGame 前——

```js
    if (G.save.run) {                       // 有当局快照 → 恢复续玩
      try {
        const r = Storage.restoreRun(G.save.run);
        G.run = r.state; G.imgPos = r.imgPos;
        loopState.gameMs = r.gameMs || 0;
      } catch (e) { console.error('restore failed', e); G.run = null; }
    }
    if (!G.run) G.run = Core.createGame({ seed: G.seed });
```

(loadImage 用 G.imgPos ✓ 已有;tracker 新建:`G.tracker = Ach.newTracker(loopState.gameMs, G.ai);`——放 enterReady 前。)
d) `enterReady()` 里:`G.save.stats.levelsStarted++; G.tracker = Ach.newTracker(loopState.gameMs, G.ai); persist();`
e) tick 内(step 之后,音效判定改为**事件驱动**并追加成就消费):

```js
  const ev = run.events || [];
  const scoreDelta = run.score - before.score;          // before 增加 score/revealedCount 字段
  const revealDelta = run.revealedCount - before.revealed;
  if (ev.some(e => e.t === 'apple')) Sfx.play('eat');
  if (ev.some(e => e.t === 'special')) Sfx.play('special');
  if (ev.some(e => e.t === 'shield')) { Sfx.play('shield'); Haptics.light(); }
  if (ev.some(e => e.t === 'milestone') && !run.levelJustDone) Sfx.play('milestone');
  Ach.onStep(G.tracker, run, ev, nowMs);
  Ach.accumulate(G.save, run, ev, { aiRun: G.ai, scoreDelta, revealDelta, dtMs: interval });
  // interval 从 frame 传入:tick(gameMs, interval)
  let newly = [];
  if (run.levelJustDone) {
    const r1 = Ach.onLevelClear(G.tracker, G.save, nowMs, { aiRun: G.ai });
    newly = r1.unlocked;
  }
  newly = newly.concat(Ach.checkCum(G.save).unlocked);
  if (newly.length) { showAchToasts(newly); Sfx.play('milestone'); }
  if (run.levelJustDone) {
    Sfx.play('level'); G.phase = 'LEVEL_DONE'; revealAllMask();
    G.save.run = null; persist(); return;
  }
  if (run.dead) { Sfx.play('death'); Haptics.medium(); G.phase = 'DEAD'; persist(); }
```

f) `persist()`:

```js
function persist() {
  if (G.phase === 'PLAYING' || G.phase === 'READY')
    G.save.run = Storage.snapshotRun(G.run, G.imgPos, loopState.gameMs);
  Storage.save(Platform.storage, G.saveKey, G.save);
}
```

调用点:enterReady/死亡/过关(上文)/`visibilitychange` hidden 时(暂停前先 persist)/dispatch AI_TOGGLE。**不要每 tick 写盘**。
g) `dispatch('RESPAWN')` 后也 `persist()`。
h) 语言切换计数:boot 的 `I18N.onChange(...)` 里 `if (G.save && !G.save.stats.langSwitched) { G.save.stats.langSwitched = 1; const u = Ach.checkCum(G.save).unlocked; if (u.length) showAchToasts(u); persist(); }`。
i) toast:

```js
function showAchToasts(ids) {
  const host = document.getElementById('toasts');
  if (!host) return;
  for (const id of ids.slice(0, 3)) {                 // 一次最多叠 3 条
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.textContent = `🏅 ${T('achui.unlocked')} ${T('ach.' + id)}`;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
  }
}
```

- [ ] **Step 2: index.html** `<div id="controls"></div>` 后加 `<div id="toasts"></div>`;frame 的 tick 调用处传 interval:`tick(loopState.gameMs, interval)`(tick 签名 `function tick(nowMs, interval)`)。

- [ ] **Step 3: game.css 追加**

```css
#toasts { position: fixed; top: 52px; left: 50%; transform: translateX(-50%);
  z-index: 30; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.ach-toast { background: #fff; color: #7a5c72; border-radius: 14px; padding: 10px 18px;
  font: 600 14px/1.2 sans-serif; box-shadow: 0 6px 20px rgba(183,142,180,.35);
  animation: toastIn .3s ease; }
.ach-toast.out { opacity: 0; transition: opacity .4s; }
@keyframes toastIn { from { transform: translateY(-12px); opacity: 0; } }
```

- [ ] **Step 4: 回归**:node 全测绿 + 起服务器手动/无头确认第一次过关后 toast 出现(img_1「初见天使」+ death_1 若死过)。

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/main.js games/snake/index.html games/snake/css/game.css
git commit -m "feat(snake): 成就与存档接线——事件消费/续玩恢复/AI局限制/解锁toast"
```

---

### Task 6: 成就墙 UI(DOM 浮层)

**Files:** Modify `games/snake/index.html`、`games/snake/css/game.css`、`games/snake/js/main.js`

- [ ] **Step 1: index.html** toasts 后加:

```html
<div id="panel" class="hidden">
  <div id="panel-card">
    <div id="panel-head"><span id="panel-title"></span><button id="panel-close" type="button">✕</button></div>
    <div id="panel-tabs"></div>
    <div id="panel-body"></div>
  </div>
</div>
```

- [ ] **Step 2: game.css 追加**(浮层+徽章墙;云朵粉彩配色):

```css
.hidden { display: none !important; }
#panel { position: fixed; inset: 0; background: rgba(122,92,114,.45); z-index: 20;
  display: flex; align-items: center; justify-content: center; }
#panel-card { background: #fff; border-radius: 22px; width: min(92vw, 420px); height: min(80vh, 640px);
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.18); }
#panel-head { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; font: 800 18px sans-serif; color: #7a5c72; }
#panel-close { border: 0; background: #f6d5e5; border-radius: 10px; width: 32px; height: 32px; font-size: 14px; }
#panel-tabs { display: flex; gap: 8px; padding: 0 18px 10px; }
.ptab { flex: 1; border: 0; border-radius: 12px; padding: 8px 0; font: 600 14px sans-serif;
  background: #f6d5e5; color: #7a5c72; }
.ptab.on { background: #e79cc2; color: #fff; }
#panel-body { flex: 1; overflow-y: auto; padding: 6px 14px 18px; }
.ach-item { display: flex; align-items: center; gap: 10px; padding: 8px 6px;
  border-bottom: 1px solid #f6d5e5; }
.ach-item .medal { font-size: 22px; filter: grayscale(1) opacity(.35); }
.ach-item.got .medal { filter: none; }
.ach-item .nm { font: 600 14px sans-serif; color: #7a5c72; }
.ach-item.got .nm { color: #d6336c; }
.ach-item .pg { margin-left: auto; font: 500 12px sans-serif; color: #b39ddb; white-space: nowrap; }
```

- [ ] **Step 3: main.js** 加浮层逻辑 + 顶栏 🏅 入口:

```js
function openAchievements(tab) {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('achui.title');
  const tabs = document.getElementById('panel-tabs');
  tabs.innerHTML = `<button class="ptab" data-t="run" type="button">${T('achui.tabRun')}</button>
                    <button class="ptab" data-t="cum" type="button">${T('achui.tabCum')}</button>`;
  tabs.querySelectorAll('.ptab').forEach(b => {
    b.onclick = () => renderAchTab(b.dataset.t);
  });
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  renderAchTab(tab || 'run');
  if (G.phase === 'PLAYING') dispatch('PAUSE');       // 看成就时暂停
}
function renderAchTab(tab) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const body = document.getElementById('panel-body');
  const got = new Set(G.save.ach.unlocked);
  const defs = tab === 'run' ? Ach.RUN_ACHS : Ach.CUM_DEFS;
  body.innerHTML = defs.map(d => {
    const has = got.has(d.id);
    let pg = '';
    if (tab === 'cum') {
      const info = Ach.tierInfo(d.id);
      const cur = Math.min(Ach.getCounter(G.save, info.counter), info.threshold);
      pg = T('achui.progress', { cur: Math.floor(cur), max: info.threshold });
    }
    return `<div class="ach-item${has ? ' got' : ''}">
      <span class="medal">🏅</span><span class="nm">${T('ach.' + d.id)}</span>
      <span class="pg">${pg}</span></div>`;
  }).join('');
}
```

顶栏入口:boot 的 `Controls.render` extraHtml 增加 `🏅` 按钮:

```js
    Controls.render(
      `<div class="ctl-btn" id="ach-btn" title="${T('menu.achievements')}">🏅</div>
       <div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>`,
      bar => {
        const a = bar.querySelector('#ach-btn');
        if (a) a.onclick = () => openAchievements();
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
      });
```

(playtimeMs 的时长档 `time_3`=50h 用 `Math.floor(cur)` 显示毫秒数太丑——tierInfo 里给 `fmt` 可选字段,time 族显示小时:`cur=Math.floor(cur/3600000)`,threshold 同除。实现时给 FAMILIES 的 time 族加 `div: 3600000`,tierInfo 返回带 div,UI 按 div 折算。)

- [ ] **Step 4: 回归 + 冒烟**(无头:打开页面 evaluate `openAchievements()`,截图确认双 tab 徽章墙渲染、进度数字;esc… 关闭按钮工作)。

- [ ] **Step 5: Commit**

```bash
git add games/snake/js/main.js games/snake/index.html games/snake/css/game.css
git commit -m "feat(snake): 成就墙 DOM 浮层——双tab/120徽章/族进度/顶栏入口"
```

---

### Task 7: E2E 扩展 + 全量回归 + tag

**Files:** Modify `games/snake/tests/e2e-p1.js`

- [ ] **Step 1: E2E 追加**(AI 通关断言后):

```js
  // 成就:AI 通关也解锁图鉴类累计成就(img_1),但单局成就为零
  const achProbe = await page.evaluate(() => ({
    unlocked: window.G.save.ach.unlocked.slice(),
    runAchs: window.G.save.ach.unlocked.filter(id => id.startsWith('r_')).length,
  }));
  assert(achProbe.unlocked.includes('img_1'), `img_1 unlocked after first clear (got ${achProbe.unlocked.join(',')})`);
  assert(achProbe.runAchs === 0, `AI run unlocks no per-level achievements (got ${achProbe.runAchs})`);
  // 存档续玩:reload 后 stats 保留
  const applesBefore = await page.evaluate(() => window.G.save.stats.apples);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const applesAfter = await page.evaluate(() => window.G.save.stats.apples);
  assert(applesAfter >= applesBefore && applesBefore > 0, `save persists across reload (${applesBefore} -> ${applesAfter})`);
  // 成就墙可打开
  await page.evaluate(() => openAchievements('cum'));
  const items = await page.evaluate(() => document.querySelectorAll('.ach-item').length);
  assert(items === 100, `cum tab renders 100 badges (got ${items})`);
  await page.evaluate(() => document.getElementById('panel-close').click());
```

注意:reload 断言使 E2E 有了**持久状态**——脚本开头(goto 之前)加 `await page.context().clearCookies();` 不够,localStorage 要清:goto 后立刻 `await page.evaluate(() => localStorage.clear());` 再 reload 一次,保证每次 E2E 从干净档开始(否则 img_1 断言在第二次跑时因已解锁而无法区分)。把这段加在最前面。

- [ ] **Step 2: 全量回归**:六个 node 测试(prng/core/fruits/ai/storage/achievements)+ check-locales + E2E ALL PASS。
- [ ] **Step 3: Commit + tag**

```bash
git add games/snake/tests/e2e-p1.js
git commit -m "test(snake): E2E——成就解锁/AI局零单局成就/存档跨reload/成就墙渲染"
git tag snake-p2b-achievements
```

---

## Self-Review 记录

- **Spec 覆盖**:§6.1 单局 20 条全部有 id+判定(阈值照 §6.1 修正版:贴地飞行 3、追星人 2、连击窗口语义沿用 core);§6.2 阶梯 20 族恰 100(展开断言);§6.3 皮肤解锁挂 img 族(P2c 消费);§4 AI 限制(单局不判/纪录不刷/aiClears);§11 存档结构(settings/gallery/ach/stats/run 快照)+ 坏档兜底 + Platform 门面。皮肤族/集齐族/复活族 counter 先建后用(P2c/P3),避免二次迁移。
- **占位符扫描**:无 TBD;成就 zh 名 120 个全部照 §6 抄录,en 全部给出。
- **命名一致性**:`Storage.load/save/snapshotRun/restoreRun/defaults`、`Ach.newTracker/onStep/onLevelClear/accumulate/checkCum/getCounter/tierInfo/CUM_DEFS/RUN_ACHS`、`G.save/G.tracker/persist()/showAchToasts/openAchievements` 贯穿。
- **已知取舍**:成就 UI 用 DOM 浮层(非 canvas)——120 项滚动列表的正确工程选择,与引擎「controls 是唯一 DOM」的惯例有出入,已在架构段声明;`snapshotRun` 的 seed2 用 Math.random(唯一豁免,注释说明);单局定义=一张图(死亡不重置 tracker);speedClears 用游戏时钟(暂停不作弊)。
