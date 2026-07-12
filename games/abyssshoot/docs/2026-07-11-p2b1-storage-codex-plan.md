# Abyss Shooter P2b-1 —— 存档 + 最高分 + 鱼图鉴 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 兑现这个游戏的立身之本——**深海鱼图鉴**。合出过的鱼永久解锁进图鉴（17 档），配上版本化存档、最高分、中途关页续玩。存档是后面一切（金币/道具/每日盘/成就）的地基。

**Architecture:** 新增两个纯逻辑模块 `storage.js`（版本化存档，注入式后端，双导出）与 `codex.js`（图鉴数据函数），`main.js` 接线（boot 载档/恢复续玩、每发落盘、死亡结算最高分），`render.js` 显示最高分，DOM 浮层显示图鉴（canvas 只画游戏，17 格列表用 DOM 更合适——同 snake 的 gallery）。

**Tech Stack:** 纯 JS。存档后端走引擎 `Platform.storage`（同步门面，键须在 `Platform.hydrate([...])` 预声明）。图鉴 UI 是 DOM 浮层 `#panel`。

**必读**：`games/abyssshoot/CLAUDE.md`（五条核心规则、棋盘模型）、`games/snake/js/storage.js`（**存档模式与两个真实踩过的坑，逐字对照**）、`games/snake/js/main.js`（boot/persist 接线、`#panel` 浮层用法）、`games/snake/index.html` + `games/snake/css/game.css`（`#panel` 的 DOM 结构与样式，抄它）。

**⚠ 三个必须遵守的硬约束**

1. **浏览器里各 `<script>` 共享全局词法环境** —— `core.js` 已经声明了 `PRNG_` 和 `TILES_`，**storage.js / codex.js 里绝不能重名**（会 `SyntaxError: Identifier has already been declared`，整个游戏白屏）。用 `PRNG_S_` / `TILES_C_` 这类后缀区分（snake 就是这么干的，见其 storage.js 顶部注释）。
2. **保守合并的「开放 map」陷阱**（snake 的 Critical 级真实事故）：`merge()` 靠「defaults 里是空对象 `{}`」来判断某字段是「动态 key 的开放 map」并整体透传。**若给这类字段塞了非空默认值，就会退回逐 key 递归、每次 load 清空存档里的动态 key。** 本游戏的开放 map 字段必须保持 `{}` 默认。
3. **版本门控 + 形状校验，不匹配一律丢弃、绝不迁移**（root CLAUDE.md 铁律）：旧档带着畸形形状恢复 = 0×0 盘面 = 无报错白屏，全新档案的 E2E 测不出来。

**⚠ 改了 js → `index.html` 里所有 `?v=3` 统一改成 `?v=4`**（部署铁律）。

---

## 图鉴的解锁规则（先定清楚，别实现歪）

- **「见过即解锁」**：某个值只要在盘面上**真实存在过**（合出来的、射上去的、刷下来的都算），它对应的鱼就永久进图鉴。
- 实现：每发 `shoot` 之后，把**当前盘面所有值 + 当前弹药值**灌进 `save.codex.seen`（一个值的集合）。盘面才 5×9，开销可忽略。
- ⚠ **允许有洞**：指数合并规则下可以跳档（3 个 2 连 → 直接 8，跳过 4）。若某档真的从没出现过，图鉴就该**如实显示为未解锁**——这反而是完美主义者的收集动力（「我还差 4 号鱼」）。**不要**用「≤ maxTile 就全解锁」去填洞，那是撒谎。
- 梯顶（皇带鱼）游走清场**不影响解锁**：它出现过就已经记进 `seen` 了。

---

## 文件结构

- 新建 `games/abyssshoot/js/storage.js` —— 版本化存档（`SAVE_V`/`defaults`/`merge`/`load`/`save`/`snapshotRun`/`restoreRun`）。双导出。
- 新建 `games/abyssshoot/js/codex.js` —— 图鉴数据函数（`record`/`isSeen`/`progress`/`entries`）。双导出。
- 新建 `games/abyssshoot/tests/test-storage.js` —— 存档单测（版本门控/保守合并/开放 map/快照恢复/形状校验）。
- 新建 `games/abyssshoot/tests/test-codex.js` —— 图鉴单测（见过即解锁/允许有洞/进度统计）。
- 修改 `games/abyssshoot/js/main.js` —— boot 载档 + 恢复续玩、每发落盘、死亡结算最高分、图鉴面板开关。
- 修改 `games/abyssshoot/js/render.js` —— HUD/HOME/DEAD 显示最高分与新纪录。
- 修改 `games/abyssshoot/index.html` —— 加 `#panel` DOM、脚本加载顺序、`?v=4`。
- 修改 `games/abyssshoot/css/game.css` —— `#panel` 浮层与图鉴网格样式。
- 修改 `games/abyssshoot/locales/{en,zh-CN}.json` —— 17 条鱼名 + 图鉴 UI 文案。
- 修改 `package.json`（root）—— `test:abyss` 串上两个新测试。

---

## Task 1: storage.js —— 版本化存档

**Files:**
- Create: `games/abyssshoot/js/storage.js`
- Test: `games/abyssshoot/tests/test-storage.js`

- [ ] **Step 1: 写失败测试**

Create `games/abyssshoot/tests/test-storage.js`:

```javascript
const assert = require('assert');
const Storage = require('../js/storage.js');
const Core = require('../js/core.js');

// 内存后端(测试用)
function mem() {
  const m = {};
  return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, _m: m };
}

// --- 空档 → defaults ---
let b = mem();
let s = Storage.load(b, 'k');
assert.strictEqual(s.v, Storage.SAVE_V);
assert.strictEqual(s.best.score, 0);
assert.strictEqual(s.best.maxTile, 0);
assert.deepStrictEqual(s.codex.seen, []);
assert.strictEqual(s.run, null);

// --- 存 → 读回 ---
s.best.score = 1234; s.best.maxTile = 256; s.codex.seen = [2, 4, 8];
Storage.save(b, 'k', s);
let s2 = Storage.load(b, 'k');
assert.strictEqual(s2.best.score, 1234);
assert.deepStrictEqual(s2.codex.seen, [2, 4, 8]);

// --- 版本不匹配 → 整份丢弃回 defaults(绝不迁移) ---
b = mem();
b.set('k', JSON.stringify({ v: 999, best: { score: 9e9 }, codex: { seen: [2] } }));
s = Storage.load(b, 'k');
assert.strictEqual(s.best.score, 0, '版本不匹配必须整份丢弃,不许把旧数据带进来');

// --- 保守合并:老档缺字段 → 用 default 补齐(同版本) ---
b = mem();
b.set('k', JSON.stringify({ v: Storage.SAVE_V, best: { score: 500 } }));   // 缺 maxTile/codex/run
s = Storage.load(b, 'k');
assert.strictEqual(s.best.score, 500, '存档里有的保留');
assert.strictEqual(s.best.maxTile, 0, '存档里缺的用 default 补');
assert.deepStrictEqual(s.codex.seen, [], '缺的整块用 default');

// --- ⚠ 开放 map:defaults 里是空对象的字段必须整体透传(动态 key 不许被清空) ---
b = mem();
b.set('k', JSON.stringify({ v: Storage.SAVE_V, stats: { fishSeenCount: { 256: 3, 512: 1 } } }));
s = Storage.load(b, 'k');
assert.deepStrictEqual(s.stats.fishSeenCount, { 256: 3, 512: 1 },
  '开放 map 的动态 key 必须原样保住(snake 的 Critical:塞非空默认会让它每次 load 被清空)');

// --- 当局快照 → 恢复 ---
const g = Core.createGame({ seed: 42 });
Core.shoot(g, 0); Core.shoot(g, 1); Core.shoot(g, 2);
const snap = Storage.snapshotRun(g);
const json = JSON.parse(JSON.stringify(snap));      // 必须可 JSON 化(rand 是函数,要剥掉)
const r = Storage.restoreRun(json);
assert.deepStrictEqual(r.board, g.board, '盘面原样恢复');
assert.strictEqual(r.score, g.score);
assert.strictEqual(r.maxTile, g.maxTile);
assert.strictEqual(r.shots, g.shots);
assert.strictEqual(r.ammo, g.ammo);
assert.deepStrictEqual(r.queue, g.queue);
assert.strictEqual(typeof r.rand, 'function', '恢复后必须有可用的 rand(换新种子,不影响公平)');
Core.shoot(r, 0);                                    // 恢复后能继续玩,不炸
assert(r.shots === g.shots + 1);

// --- ⚠ 形状校验:畸形快照一律丢弃(否则恢复成 0×0 盘面 = 无报错白屏) ---
assert.strictEqual(Storage.restoreRun(null), null);
assert.strictEqual(Storage.restoreRun({ v: 999, board: [[], [], [], [], []] }), null, '版本不符 → 丢弃');
assert.strictEqual(Storage.restoreRun({ v: Storage.SAVE_V, board: [[], []] }), null, '列数不符 → 丢弃');
assert.strictEqual(Storage.restoreRun({ v: Storage.SAVE_V, board: 'nope' }), null, '盘面不是数组 → 丢弃');

console.log('test-storage OK');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-storage.js`
Expected: FAIL — `Cannot find module '../js/storage.js'`

- [ ] **Step 3: 写实现**

Create `games/abyssshoot/js/storage.js`:

```javascript
// storage.js — 版本化存档(注入式后端,双导出)
// 后端 = { get(k)→string|null, set(k,v) };浏览器用引擎 Platform.storage(键须先 hydrate)。
// ⚠ 命名:浏览器里各 <script> 共享全局词法环境,core.js 已声明 PRNG_/TILES_,这里必须换名。
const PRNG_S_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SAVE_V = 1;
const COLS = 5;   // 形状校验用(与 core 的默认一致)

function defaults() {
  return {
    v: SAVE_V,
    best: { score: 0, maxTile: 0 },
    codex: { seen: [] },              // 见过的鱼(值的数组,升序);「见过即解锁」
    stats: {
      // ⚠ fishSeenCount 是「开放 map」(动态 key = 鱼的值):默认必须保持空对象 {}。
      //   merge 对空对象整体透传;塞了非空默认就会退回逐 key 递归、每次 load 清空动态 key
      //   (snake 的 Critical 事故,勿重蹈)。以后新增开放 map 字段也照此保持 {}。
      fishSeenCount: {},
      runs: 0, shots: 0, merges: 0, escapes: 0,
    },
    run: null,                        // 当局快照(可续玩)
  };
}

// 保守合并:default 里有而 saved 缺 → 补;类型不符 → 用 default
function merge(def, saved) {
  if (saved == null || typeof saved !== 'object') return def;
  // ⚠ 开放 map 整体透传——判据是「defaults 里是空对象」。见上方注释。
  if (!Array.isArray(def) && Object.keys(def).length === 0)
    return (saved && typeof saved === 'object' && !Array.isArray(saved)) ? { ...saved } : def;
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
  // 版本门控:不匹配一律整份丢弃,绝不迁移(root CLAUDE.md 铁律)
  if (!parsed || parsed.v !== SAVE_V) return defaults();
  const s = merge(defaults(), parsed);
  s.v = SAVE_V;
  return s;
}

function save(backend, key, s) {
  try { backend.set(key, JSON.stringify(s)); } catch (e) {}
}

// 当局快照:core state 里除 rand(函数)外全部可 JSON 化。
// 续玩换新种子(seed2)——弹药是从盘面抽样的,换种子不影响公平;盘面/分数/图鉴才是要保的。
function snapshotRun(s) {
  return {
    v: SAVE_V,
    board: JSON.parse(JSON.stringify(s.board)),
    cols: s.cols, rows: s.rows,
    ammo: s.ammo, queue: s.queue.slice(),
    score: s.score, maxTile: s.maxTile,
    shots: s.shots, shotsSinceSpawn: s.shotsSinceSpawn,
    seed2: Math.floor(Math.random() * 2147483647),   // 唯一允许用 Math.random 的地方(不在 core 里)
  };
}

// 恢复:形状不对一律返回 null(调用方丢弃重开)。
// ⚠ 畸形快照恢复成 0×0 盘面 = 无报错白屏,全新档案的 E2E 测不出来(root CLAUDE.md 铁律)。
function restoreRun(snap) {
  if (!snap || typeof snap !== 'object') return null;
  if (snap.v !== SAVE_V) return null;
  if (!Array.isArray(snap.board) || snap.board.length !== (snap.cols || COLS)) return null;
  if (!snap.board.every(col => Array.isArray(col) && col.every(v => v > 0))) return null;
  if (!(snap.rows > 0) || !Array.isArray(snap.queue)) return null;
  return {
    cols: snap.cols || COLS, rows: snap.rows,
    seed: snap.seed2 || 1,
    rand: PRNG_S_.create(snap.seed2 || 1),
    board: JSON.parse(JSON.stringify(snap.board)),
    score: snap.score || 0, maxTile: snap.maxTile || 0,
    shots: snap.shots || 0, shotsSinceSpawn: snap.shotsSinceSpawn || 0,
    dead: false, events: [],
    ammo: snap.ammo, queue: snap.queue.slice(),
  };
}

const Storage = { SAVE_V, defaults, merge, load, save, snapshotRun, restoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-storage.js`
Expected: PASS — `test-storage OK`

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/storage.js games/abyssshoot/tests/test-storage.js
git commit -m "feat(abyssshoot): storage 版本化存档(保守合并/开放map/形状校验/快照续玩)"
```

---

## Task 2: codex.js —— 鱼图鉴数据

**Files:**
- Create: `games/abyssshoot/js/codex.js`
- Test: `games/abyssshoot/tests/test-codex.js`

- [ ] **Step 1: 写失败测试**

Create `games/abyssshoot/tests/test-codex.js`:

```javascript
const assert = require('assert');
const Codex = require('../js/codex.js');
const Storage = require('../js/storage.js');
const Tiles = require('../js/tiles.js');
const Core = require('../js/core.js');

// --- 见过即解锁:盘面上真实存在过的值 + 当前弹药 ---
let sv = Storage.defaults();
const g = Core.createGame({ seed: 1 });
g.board = [[2, 4], [8], [], [], []];
g.ammo = 16;
Codex.record(sv, g);
assert.deepStrictEqual(sv.codex.seen, [2, 4, 8, 16], '盘面值 + 弹药值都算见过,且升序');
assert(Codex.isSeen(sv, 2) && Codex.isSeen(sv, 16));
assert(!Codex.isSeen(sv, 32), '没出现过的不算');

// --- 幂等:重复 record 不产生重复项 ---
Codex.record(sv, g);
assert.deepStrictEqual(sv.codex.seen, [2, 4, 8, 16], '重复 record 不重复计入');

// --- 计数:每见一次累加(开放 map,动态 key) ---
assert.strictEqual(sv.stats.fishSeenCount[2], 2, '见过两次(两轮 record)');

// --- ⚠ 允许有洞:指数合并可跳档,没出现过的档位就该如实显示未解锁 ---
sv = Storage.defaults();
const g2 = Core.createGame({ seed: 1 });
g2.board = [[2], [8], [], [], []];     // 从没出现过 4
g2.ammo = 2;
Codex.record(sv, g2);
assert(Codex.isSeen(sv, 8), '8 见过');
assert(!Codex.isSeen(sv, 4), '4 从没出现过 → 如实未解锁(不许用「≤maxTile 就全解锁」去填洞撒谎)');

// --- 进度统计 ---
const p = Codex.progress(sv);
assert.strictEqual(p.total, Tiles.TILES.length, '总数 = 鱼梯档数');
assert.strictEqual(p.seen, 2, '见过 2 条(2 和 8)');

// --- entries: 给 UI 用的完整列表(每档:值/鱼id/是否解锁),顺序 = 鱼梯顺序 ---
const es = Codex.entries(sv);
assert.strictEqual(es.length, Tiles.TILES.length);
assert.strictEqual(es[0].v, 2);
assert.strictEqual(es[0].fish, Tiles.TILES[0].fish);
assert.strictEqual(es[0].seen, true, '2 见过');
assert.strictEqual(es[1].v, 4);
assert.strictEqual(es[1].seen, false, '4 未见过');
assert.strictEqual(es[2].seen, true, '8 见过');

// --- 真实一局跑下来,图鉴应该攒起来 ---
sv = Storage.defaults();
const g3 = Core.createGame({ seed: 77 });
let n = 0;
while (!g3.dead && n < 500) { Core.shoot(g3, n % g3.cols); Codex.record(sv, g3); n++; }
assert(Codex.progress(sv).seen >= 3, '一整局下来至少见过 3 档鱼,实为 ' + Codex.progress(sv).seen);

console.log('test-codex OK');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-codex.js`
Expected: FAIL — `Cannot find module '../js/codex.js'`

- [ ] **Step 3: 写实现**

Create `games/abyssshoot/js/codex.js`:

```javascript
// codex.js — 深海鱼图鉴(纯数据函数,双导出)。
// ⚠ 命名:浏览器全局词法环境共享,core.js 已用 TILES_,这里换名 TILES_C_。
const TILES_C_ = (typeof module !== 'undefined' && module.exports)
  ? require('./tiles.js') : Tiles;

// 「见过即解锁」:盘面上**真实存在过**的值(合出来的/射上去的/刷下来的)+ 当前弹药。
// ⚠ 允许有洞:指数合并规则可跳档(3 个 2 连 → 直接 8,跳过 4)。若某档真的从没出现过,
//   图鉴就该**如实显示未解锁**——这是完美主义者的收集动力,别用「≤maxTile 全解锁」去填洞撒谎。
// 梯顶皇带鱼游走清场不影响:它出现过就已记进 seen。
function record(save, s) {
  const seen = new Set(save.codex.seen);
  const vals = [];
  for (let c = 0; c < s.cols; c++) for (const v of s.board[c]) vals.push(v);
  if (s.ammo) vals.push(s.ammo);
  for (const v of vals) {
    if (TILES_C_.tierOf(v) < 0) continue;                 // 超纲值(理论上不该有)不进图鉴
    seen.add(v);
    save.stats.fishSeenCount[v] = (save.stats.fishSeenCount[v] || 0) + 1;
  }
  save.codex.seen = [...seen].sort((a, b) => a - b);
  return save;
}

function isSeen(save, v) { return save.codex.seen.indexOf(v) >= 0; }

function progress(save) {
  return { seen: save.codex.seen.length, total: TILES_C_.TILES.length };
}

// 给 UI 的完整列表(鱼梯顺序):{ v, fish, seen, count }
function entries(save) {
  return TILES_C_.TILES.map(t => ({
    v: t.v, fish: t.fish,
    seen: isSeen(save, t.v),
    count: save.stats.fishSeenCount[t.v] || 0,
  }));
}

const Codex = { record, isSeen, progress, entries };
if (typeof module !== 'undefined' && module.exports) module.exports = Codex;
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-codex.js`
Expected: PASS — `test-codex OK`

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/codex.js games/abyssshoot/tests/test-codex.js
git commit -m "feat(abyssshoot): codex 鱼图鉴(见过即解锁,允许有洞不撒谎)"
```

---

## Task 3: locales —— 17 条鱼名 + 图鉴文案

**Files:**
- Modify: `games/abyssshoot/locales/en.json`
- Modify: `games/abyssshoot/locales/zh-CN.json`

> ⚠ **必须嵌套结构**（`{"fish":{"clownfish":"Clownfish"}}`）——扁平写法查不到且 console 零报错（snake 实踩）。

- [ ] **Step 1: en.json 追加**

在 `games/abyssshoot/locales/en.json` 里，与 `abyss` 同级追加两块：

```json
  "codex": {
    "title": "Fish Codex",
    "open": "Codex",
    "progress": "{cur} / {max} discovered",
    "locked": "???",
    "hint": "Merge a fish to discover it",
    "close": "Close"
  },
  "fish": {
    "clownfish": "Clownfish",
    "blenny": "Blenny",
    "butterflyfish": "Butterflyfish",
    "angelfish": "Angelfish",
    "blackspottedpuffer": "Blackspotted Puffer",
    "barracuda": "Barracuda",
    "blacktipreefshark": "Blacktip Reef Shark",
    "anglerfish": "Anglerfish",
    "barreleye": "Barreleye",
    "coelacanth": "Coelacanth",
    "greatwhiteshark": "Great White Shark",
    "whaleshark": "Whale Shark",
    "belugawhale": "Beluga Whale",
    "orca": "Orca",
    "humpbackwhale": "Humpback Whale",
    "spermwhale": "Sperm Whale",
    "oarfish": "Oarfish"
  }
```

并在 `abyss` 块里追加最高分文案：

```json
    "best": "Best",
    "newRecord": "New Record!"
```

- [ ] **Step 2: zh-CN.json 追加同样的 key**

```json
  "codex": {
    "title": "深海鱼图鉴",
    "open": "图鉴",
    "progress": "已发现 {cur} / {max}",
    "locked": "？？？",
    "hint": "合出这条鱼即可解锁",
    "close": "关闭"
  },
  "fish": {
    "clownfish": "小丑鱼",
    "blenny": "鳚鱼",
    "butterflyfish": "蝴蝶鱼",
    "angelfish": "神仙鱼",
    "blackspottedpuffer": "黑点河豚",
    "barracuda": "梭鱼",
    "blacktipreefshark": "黑鳍礁鲨",
    "anglerfish": "鮟鱇",
    "barreleye": "管眼鱼",
    "coelacanth": "腔棘鱼",
    "greatwhiteshark": "大白鲨",
    "whaleshark": "鲸鲨",
    "belugawhale": "白鲸",
    "orca": "虎鲸",
    "humpbackwhale": "座头鲸",
    "spermwhale": "抹香鲸",
    "oarfish": "皇带鱼"
  }
```

`abyss` 块里追加：

```json
    "best": "最高",
    "newRecord": "新纪录！"
```

- [ ] **Step 3: 校验**

Run: `node tools/check-locales.js games/abyssshoot/locales`
Expected: `0 fail`

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/locales/en.json games/abyssshoot/locales/zh-CN.json
git commit -m "feat(abyssshoot): locales 17 条鱼名 + 图鉴/最高分文案"
```

---

## Task 4: index.html + css —— 图鉴 DOM 浮层

**Files:**
- Modify: `games/abyssshoot/index.html`
- Modify: `games/abyssshoot/css/game.css`

canvas 只画游戏；17 格图鉴列表用 DOM 浮层（同 snake 的 `#panel`，抄它的结构）。

- [ ] **Step 1: index.html 加 DOM + 脚本 + bump ?v=4**

在 `<div id="controls"></div>` 之后加浮层：

```html
<div id="panel" class="hidden">
  <div id="panel-card">
    <div id="panel-head"><span id="panel-title"></span><button id="panel-close" type="button">✕</button></div>
    <div id="panel-sub"></div>
    <div id="panel-body"></div>
  </div>
</div>
```

脚本加载顺序里，在 `core.js` 之后、`render.js` 之前插入（**load-bearing**：storage/codex 依赖 tiles，render/main 依赖它们）：

```html
<script src="js/storage.js?v=4"></script>
<script src="js/codex.js?v=4"></script>
```

**并把 `index.html` 里所有 `?v=3` 统一改成 `?v=4`。**

- [ ] **Step 2: grep 验证 bump 生效（本仓静默失败过四次）**

Run: `grep -c "?v=4" games/abyssshoot/index.html && (grep -c "?v=3" games/abyssshoot/index.html || echo "?v=3 已清零 ✅")`
Expected: `?v=4` 出现 18 次（2 css + 16 js），`?v=3` 为 0。

- [ ] **Step 3: css/game.css 追加浮层样式**

```css
/* ── 图鉴浮层(canvas 只画游戏,列表用 DOM) ── */
#panel { position: fixed; inset: 0; background: rgba(2,10,18,0.86); z-index: 50;
         display: flex; align-items: center; justify-content: center; padding: 16px; }
#panel.hidden { display: none; }
#panel-card { background: #0a1f33; border: 1px solid #1e3550; border-radius: 16px;
              width: 100%; max-width: 420px; max-height: 84vh; display: flex; flex-direction: column; }
#panel-head { display: flex; align-items: center; justify-content: space-between;
              padding: 14px 16px 8px; }
#panel-title { font-weight: 700; font-size: 18px; color: #cfe8f5; }
#panel-close { background: none; border: none; color: #6f9ab5; font-size: 20px; cursor: pointer; }
#panel-sub { padding: 0 16px 10px; color: #6f9ab5; font-size: 13px; }
#panel-body { overflow-y: auto; padding: 4px 12px 16px;
              display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cx-item { background: #0d2740; border-radius: 12px; padding: 8px 6px; text-align: center; }
.cx-item.locked { opacity: 0.55; }
.cx-item img { width: 100%; aspect-ratio: 1/1; object-fit: contain; display: block; }
.cx-item.locked img { filter: brightness(0) invert(0.28); }   /* 未解锁:灰剪影 */
.cx-name { font-size: 11px; color: #cfe8f5; margin-top: 4px;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cx-val { font-size: 11px; font-weight: 700; color: #2bb3c0; }
.cx-item.locked .cx-name, .cx-item.locked .cx-val { color: #4c7089; }
```

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/index.html games/abyssshoot/css/game.css
git commit -m "feat(abyssshoot): 图鉴 DOM 浮层 + 脚本接线 + bump ?v=4"
```

---

## Task 5: main.js —— boot 载档/续玩、每发落盘、最高分、图鉴面板

**Files:**
- Modify: `games/abyssshoot/js/main.js`

- [ ] **Step 1: G 加存档字段 + 落盘函数**

`G` 里加：

```javascript
  save: null,      // 存档(Storage.load 产出)
  saveKey: null,
  newRecord: false,   // 本局是否破了纪录(DEAD 画面用)
```

加落盘与结算：

```javascript
// 落盘。⚠ 只在「连锁结算完成的稳定盘」落——Core.shoot 返回时盘面已结算完毕,
// 动画只是视觉回放,不影响状态。绝不在动画中途落(否则续玩恢复成半截盘)。
function persist() {
  if (!G.save || !G.saveKey) return;
  G.save.run = (G.phase === 'PLAYING' && G.s && !G.s.dead) ? Storage.snapshotRun(G.s) : null;
  Storage.save(Platform.storage, G.saveKey, G.save);
}

// 每发之后:记图鉴 + 刷最高分
function afterShot() {
  if (!G.save) return;
  Codex.record(G.save, G.s);
  G.save.stats.shots++;
  for (const e of G.s.events) {
    if (e.t === 'merge') G.save.stats.merges++;
    if (e.t === 'escape') G.save.stats.escapes++;
  }
  if (G.s.maxTile > G.save.best.maxTile) G.save.best.maxTile = G.s.maxTile;
  if (G.s.score > G.save.best.score) { G.save.best.score = G.s.score; G.newRecord = true; }
  persist();
}
```

- [ ] **Step 2: dispatch 接线**

`SHOOT` 分支里 `Core.shoot` 之后、`startAnim` 之前调 `afterShot()`：

```javascript
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      Core.shoot(G.s, data.col);
      afterShot();                     // 图鉴/最高分/落盘(盘面此刻已是稳定态)
      startAnim(G.s.events);
      return;
    }
```

`newGame()` 里重置 `G.newRecord = false`，并 `G.save.stats.runs++` + `persist()`。

加图鉴开关动作：

```javascript
    case 'CODEX': openCodex(); break;
```

- [ ] **Step 3: 图鉴面板(DOM)**

```javascript
// 图鉴浮层:17 档鱼,未解锁显示灰剪影 + ???
function openCodex() {
  const panel = document.getElementById('panel');
  const p = Codex.progress(G.save);
  document.getElementById('panel-title').textContent = T('codex.title');
  document.getElementById('panel-sub').textContent =
    T('codex.progress', { cur: p.seen, max: p.total }) + ' · ' + T('codex.hint');
  document.getElementById('panel-body').innerHTML = Codex.entries(G.save).map(e => `
    <div class="cx-item${e.seen ? '' : ' locked'}">
      <img src="assets/fish/${e.fish}.webp" alt="" loading="lazy">
      <div class="cx-name">${e.seen ? T('fish.' + e.fish) : T('codex.locked')}</div>
      <div class="cx-val">${e.seen ? Tiles.fmt(e.v) : '—'}</div>
    </div>`).join('');
  document.getElementById('panel-close').onclick = () => panel.classList.add('hidden');
  panel.classList.remove('hidden');
}
```

- [ ] **Step 4: boot 接线(载档 + 恢复续玩 + 图鉴按钮)**

`boot()` 里，`Platform.hydrate` 加存档键，`initCanvas()` 之后载档并尝试恢复：

```javascript
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('save')]);
    ...
    initCanvas();
    G.saveKey = CFG.key('save');
    G.save = Storage.load(Platform.storage, G.saveKey);
    // 有当局快照 → 恢复续玩;形状不对 restoreRun 会返回 null,直接丢弃回 HOME
    const restored = G.save.run ? Storage.restoreRun(G.save.run) : null;
    if (restored) { G.s = restored; G.phase = 'PLAYING'; }
    else { G.s = Core.createGame({ seed: 1 }); G.phase = 'HOME'; G.save.run = null; }
```

`Controls.render(...)` 传入图鉴按钮：

```javascript
    Controls.render(
      `<div class="ctl-btn" id="codex-btn" title="${T('codex.open')}">🐟</div>
       <div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>`,
      bar => {
        const c = bar.querySelector('#codex-btn');
        if (c) c.onclick = () => dispatch('CODEX', {});
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
      });
```

切后台落盘：

```javascript
    document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
```

死亡时清快照：`finishAnim()` 里 `if (G.s.dead) { G.phase = 'DEAD'; persist(); }`（`persist` 会因 phase 非 PLAYING 而把 `run` 置 null）。

- [ ] **Step 5: 提交**

```bash
git add games/abyssshoot/js/main.js
git commit -m "feat(abyssshoot): main 接线存档/续玩/图鉴/最高分"
```

---

## Task 6: render.js —— 显示最高分与新纪录

**Files:**
- Modify: `games/abyssshoot/js/render.js`

- [ ] **Step 1: HUD 加最高分；DEAD 画面显示纪录**

HUD 右上角原来显示 `Deepest`，改为两行/或并列显示「最高分」。在 `renderAll` 的 HUD 段：

```javascript
  // HUD:左=当前分,右=最深鱼 + 历史最高分
  txtL(`${T('abyss.score')} ${s.score}`, PAD, L.hudY + L.hudH / 2 - 8, PAL.text, 'bold 18px sans-serif');
  const best = G.save ? G.save.best.score : 0;
  txtL(`${T('abyss.best')} ${best}`, PAD, L.hudY + L.hudH / 2 + 12, '#6f9ab5', '12px sans-serif');
  txtR(`${T('abyss.deepest')} ${s.maxTile ? Tiles.fmt(s.maxTile) : '—'}`,
       SW - PAD, L.hudY + L.hudH / 2, PAL.text, '14px sans-serif');
```

> `abyss.deepest` 现有文案是 `Deepest fish {v}` 带参数；HUD 这里需要一个不带参的短标签。若冲突，在 locale 的 `abyss` 里另加 `deepestShort`（en: `Deepest` / zh: `最深`），并同步两个 locale 文件 + 跑 check-locales。

DEAD 覆盖层里，若 `G.newRecord` 为真，在分数下方加一行：

```javascript
    if (G.newRecord)
      txt(T('abyss.newRecord'), SW / 2, SH * 0.545, '#fcd34d', 'bold 15px sans-serif');
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/render.js
git commit -m "feat(abyssshoot): HUD/DEAD 显示最高分与新纪录"
```

---

## Task 7: 测试挂载 + E2E + 全量回归

**Files:**
- Modify: `package.json`（root）
- Modify: `games/abyssshoot/tests/e2e-p1b.cjs`

> ⚠ 改根级文件前先 `git status`；只 `git add package.json`，禁 `git add -A`。

- [ ] **Step 1: package.json 串上新测试**

`test:abyss` 改为：

```json
    "test:abyss": "node games/abyssshoot/tests/test-tiles.js && node games/abyssshoot/tests/test-core.js && node games/abyssshoot/tests/test-storage.js && node games/abyssshoot/tests/test-codex.js && node games/abyssshoot/tests/test-anim.js && node games/abyssshoot/tests/test-sim.js",
```

- [ ] **Step 2: E2E 追加图鉴 + 续玩验证**

在 `e2e-p1b.cjs` 的「整局跑通」之后、`RESTART` 之前追加：

```javascript
  // ── 图鉴:打开、显示进度、未解锁灰剪影 ──
  await page.evaluate(() => dispatch('CODEX', {}));
  const cx = await page.evaluate(() => {
    const panel = document.getElementById('panel');
    const items = [...document.querySelectorAll('.cx-item')];
    return {
      open: !panel.classList.contains('hidden'),
      total: items.length,
      unlocked: items.filter(i => !i.classList.contains('locked')).length,
      sub: document.getElementById('panel-sub').textContent,
    };
  });
  if (!cx.open) throw new Error('图鉴面板应打开');
  if (cx.total !== 17) throw new Error('图鉴应有 17 档,实为 ' + cx.total);
  if (!(cx.unlocked >= 3)) throw new Error('整局跑完至少解锁 3 条鱼,实为 ' + cx.unlocked);
  if (cx.unlocked >= cx.total) throw new Error('不该一局就全解锁(否则收集没意义)');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-codex.png') });
  console.log(`OK 图鉴:${cx.unlocked}/${cx.total} 解锁 · "${cx.sub}"`);
  await page.evaluate(() => document.getElementById('panel-close').click());

  // ── 存档续玩:射几发 → 重新载入页面 → 盘面/分数原样恢复 ──
  await page.evaluate(() => { dispatch('RESTART', {}); G.noAnim = true;
                              for (let i = 0; i < 6; i++) dispatch('SHOOT', { col: i % 5 }); });
  const before = await page.evaluate(() => ({ board: JSON.stringify(G.s.board), score: G.s.score, shots: G.s.shots }));
  await page.reload();
  await page.waitForFunction(() => window.G && window.G.s);
  const after = await page.evaluate(() => ({ phase: G.phase, board: JSON.stringify(G.s.board), score: G.s.score, shots: G.s.shots }));
  if (after.phase !== 'PLAYING') throw new Error('重载后应恢复续玩(PLAYING),实为 ' + after.phase);
  if (after.board !== before.board) throw new Error('重载后盘面应原样恢复');
  if (after.score !== before.score || after.shots !== before.shots)
    throw new Error('重载后分数/发数应原样恢复');
  console.log(`OK 存档续玩:重载后盘面/分数(${after.score})/发数(${after.shots}) 原样恢复`);
```

- [ ] **Step 3: 跑 E2E**

Run: `node games/abyssshoot/tests/e2e-p1b.cjs`
Expected: 全绿，含 `OK 图鉴:…` 与 `OK 存档续玩:…`，退出码 0。

- [ ] **Step 4: 看图鉴截图认账（地面真值）**

用 Read 工具真的看 `C:\tmp\abyssshoot\e2e-codex.png`：应看到 17 格鱼图鉴网格，**已解锁的显示彩色鱼 + 名字 + 数值，未解锁的是灰剪影 + ???**。若灰剪影没生效（未解锁的仍是彩色），说明 CSS filter 没起作用，回 Task 4 修。

- [ ] **Step 5: 全量回归 + locale 校验**

Run: `npm test`
Expected: mines + snake + abyss 全绿。

Run: `node tools/check-locales.js games/abyssshoot/locales`
Expected: `0 fail`

- [ ] **Step 6: 提交**

```bash
git add package.json games/abyssshoot/tests/e2e-p1b.cjs
git commit -m "test(abyssshoot): 挂 storage/codex 单测 + E2E 验图鉴与存档续玩"
```

---

## Task 8: 更新 CLAUDE.md

**Files:**
- Modify: `games/abyssshoot/CLAUDE.md`

- [ ] **Step 1: 改「当前状态」段**

反映 P2b-1 已完成（存档/最高分/图鉴已有；道具/皮肤/成就/每日盘/iOS 仍未做）。「验证」段补上新测试命令。

- [ ] **Step 2: 加一节存档纪律**

```markdown
## 存档（P2b-1）—— 三条别踩回去的坑

- **版本门控丢弃不迁移**：`SAVE_V` 不匹配 → 整份回 `defaults()`。改 `G`/存档形状必 bump。畸形快照恢复 = 0×0 盘面 = **无报错白屏**，全新档案的 E2E 测不出来。
- **保守合并的「开放 map」陷阱**（snake 的 Critical，勿重蹈）：`merge()` 靠「defaults 里是空对象 `{}`」判断某字段是动态-key 的开放 map 并**整体透传**。`stats.fishSeenCount` 必须保持 `{}` 默认——**塞了非空默认就会退回逐 key 递归、每次 load 清空动态 key**。以后新增开放 map 字段照此保持 `{}`。
- **只在稳定盘落盘**：`Core.shoot` 返回时盘面已结算完毕（动画只是视觉回放）。绝不在动画中途 `persist()`，否则续玩恢复成半截盘。
- **续玩换新种子**（`snapshotRun` 的 `seed2`，唯一允许用 `Math.random` 的地方，且不在 core 里）：弹药是从盘面抽样的，换种子不影响公平；盘面/分数/图鉴才是要保的。

## 图鉴（P2b-1）

**「见过即解锁」**：某个值只要在盘面上**真实存在过**（合出来的/射上去的/刷下来的）就永久进 `save.codex.seen`。
⚠ **允许有洞、不许撒谎**：指数合并可跳档（3 个 2 连 → 直接 8，跳过 4）。某档从没出现过就该**如实显示未解锁**——这是完美主义者的收集动力。**不要**用「≤ maxTile 就全解锁」去填洞。
```

- [ ] **Step 3: 提交**

```bash
git add games/abyssshoot/CLAUDE.md
git commit -m "docs(abyssshoot): 记录存档三坑与图鉴解锁规则"
```

---

## Self-Review（写完自查）

- **Spec 覆盖**：版本化存档✓(T1)、图鉴数据✓(T2)、鱼名/UI 文案✓(T3)、DOM 浮层+`?v=4`✓(T4)、boot 载档/续玩/图鉴面板/最高分接线✓(T5)、HUD/DEAD 显示✓(T6)、测试挂载+E2E+截图认账✓(T7)、文档✓(T8)。金币/道具/每日盘/皮肤/成就明确留给 P2b-2/P2b-3/P3，非本计划缺口。
- **占位扫描**：无 TBD/TODO，每步含真实代码与确切命令/预期。
- **命名冲突**：`PRNG_S_`（storage）、`TILES_C_`（codex）避开 core.js 已占的 `PRNG_`/`TILES_`——**浏览器全局词法环境共享，重名 = SyntaxError = 整个游戏白屏**。
- **类型/命名一致**：`save.{v,best{score,maxTile},codex{seen},stats{fishSeenCount,runs,shots,merges,escapes},run}`、`Storage.{SAVE_V,defaults,merge,load,save,snapshotRun,restoreRun}`、`Codex.{record,isSeen,progress,entries}`、动作 `CODEX`、`G.{save,saveKey,newRecord}` 全程一致。
- **契约风险已标注**：开放 map 空默认、版本门控、只在稳定盘落盘、locale 必须嵌套、`?v` bump、E2E 截图认账。
