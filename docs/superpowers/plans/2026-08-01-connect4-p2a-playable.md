# connect4 P2a：可玩本体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让人**第一次真的能用手指下这盘棋**——打开页面、和 20 级 AI 或另一个人对一局、看到自己赢在哪。

**Architecture:** 纯 canvas + 引擎全局脚本（无框架无 bundler）。P1 的求解器**整体搬进 Web Worker**（主线程只画画和收输入），开局库在 Worker 里懒加载。棋盘状态 `G` 是单一可变对象，存档只存 `seed + 手数列表`（§9.3），撤销 = 重放。

**Tech Stack:** 引擎 `engine/*.js`（canvas/i18n/input/controls/audio/ads/platform）· Web Worker（`new Worker('js/solver.worker.js')` + `importScripts`，照 `games/solitaire/js/prover.worker.js` 的先例）· Playwright E2E。

**规格：** `games/connect4/DESIGN.md`（权威）。**动手前必读 §11b 的五条交接** + §6.1/§6.2 + §9.2 的断崖与产品判断 + §9.3 存档。

---

## ⚠️ 开工前必须知道的两条风险（它们塑造了整个任务拆分）

### 风险 1：`engine/input.js` 没有「按住预览」的概念，而且会**静默吞掉**慢手

现有契约（`engine/input.js:25-33`）：只在**松手**时判 `dist < 10 && dt < 500` 才发 `onAction`。

⇒ 两个后果：
1. **没有任何「指针正悬在第 N 列」的信号** —— DESIGN §6.1 的「按住预览、松手才落」在现契约下**做不了**。
2. ⛔ **按住超过 500 ms 这一手会被静默丢掉** —— 而四子棋玩家盯着盘面想两秒再松手是**常态**。这不是新功能的问题，是现有契约对本品类**本来就是坏的**。

⇒ **必须改 `engine/input.js`**（Task 3），⚠ 而它是**六个游戏共用**的文件。约束：
- **纯增量、opt-in**，照 `liveSwipe` 的先例（`engine/input.js:44-45` 明写「不传 liveSwipe 的游戏（回合制）完全不受影响」）
- ⛔ **绝不改现有分支的行为**；改完 `npm test` 六个游戏必须全绿
- ⚠ 改根级/engine 文件前**先 `git status`**（本仓多会话并行，root `CLAUDE.md` 协作坑第 1 条）

### 风险 2：Worker 少 import 一个依赖 = 看起来「慢/降级」，不是「坏了」

solitaire 实锤（`games/solitaire/js/prover.worker.js:21` 上方注释）：漏了一个 `importScripts` 依赖 ⇒ Worker 一 `new` 就抛 TypeError ⇒ `onerror` 把结果兜成 `unknown` ⇒ **看起来像「算不出来」，其实是证明器从没跑起来过**，E2E 才抓出来。

connect4 的失败模式一模一样、而且更毒：Worker 挂掉 ⇒ 提示/AI 落子走降级路径 ⇒ 玩家看到的是「有点慢」，而**产品的全部卖点（数学真值）已经悄悄不在了**。
⇒ Task 4 必须有一条**「Worker 真的活着」的断言**，不许只测「有没有返回结果」。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `games/connect4/index.html` | 引擎脚本按序 + 本游戏 js（`?v=N`）；`GAME_CONFIG` |
| `games/connect4/css/game.css` | 主题变量覆盖 + 本游戏样式 |
| `games/connect4/js/solver.worker.js` | Worker 壳：`importScripts` P1 五个模块 + 引擎 prng；懒加载开局库；`postMessage` 协议 |
| `games/connect4/js/engine-client.js` | 主线程侧的 Worker 门面：请求排队/超时/降级/**活性探针** |
| `games/connect4/js/state.js` | `G` 的形状、`SAVE_VERSION`、存档（seed + 手数列表）、撤销=重放 |
| `games/connect4/js/render.js` | `renderAll()` 契约：`clearHits()` → 重画 → `addHit()`；棋子**形状+颜色双编码** |
| `games/connect4/js/main.js` | boot 流程 + `dispatch(action, data)` + 悬停预览的状态机 |
| `games/connect4/locales/{en,zh-CN}.json` | **零硬编码文案**，嵌套结构 |
| `games/connect4/tests/test-state.js` | 存档/撤销/交替先手的纯逻辑单测 |
| `games/connect4/tests/test-noclone.js` | ⛔ 商标词门禁 |
| `games/connect4/tests/e2e-p2a.cjs` | Playwright **真实鼠标**端到端 |
| `engine/input.js`（改） | 新增 opt-in 的 `onHold`/`onHoldMove`/`onHoldEnd` |

---

## Task 1：目录骨架 + 空白页能起来 + 门禁挂钩

**Files:** Create `games/connect4/index.html` · `css/game.css` · `js/main.js` · `locales/en.json` · `locales/zh-CN.json`；Modify `package.json`

- [ ] **Step 1：写 `locales/en.json`（基准）**

⚠ 本仓铁律：**locale 必须是嵌套结构**，扁平写法 `{"a.b":"x"}` 查不到、满屏 key 原文且 **console 零报错**（snake 实踩）。

```json
{
  "app": { "title": "Four in a Row" },
  "menu": { "vsAI": "Play vs Computer", "vsHuman": "Two Players", "tier": "Opponent" },
  "game": { "yourTurn": "Your turn", "thinking": "Thinking…", "win": "You win", "lose": "You lose", "draw": "Draw", "again": "Play again" }
}
```

⛔ **`zh-CN.json` 必须键集完全相同**（`node tools/check-locales.js games/connect4/locales` 必须 0 fail）。

- [ ] **Step 2：写 `index.html`**

⚠ 加载顺序是 load-bearing（`engine/README.md`），照 `games/_demo/index.html` 抄，尾部换成本游戏的 js：

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<title>Four in a Row</title>
<link rel="stylesheet" href="../../engine/engine.css">
<link rel="stylesheet" href="css/game.css?v=1">
</head>
<body>
<canvas id="game-canvas"></canvas>
<div id="controls"></div>

<script>
  window.GAME_CONFIG = { id: 'c4', languages: ['en', 'zh-CN'] };
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
<script src="js/main.js?v=1"></script>
</body>
</html>
```

⚠ ⛔ **`GAME_CONFIG.id` 决定所有存储键前缀**，定了就别改（改了老玩家存档全丢）。

- [ ] **Step 3：写最小 `js/main.js`（只证明引擎接通）**

```js
// connect4 主循环。⚠ G 用 var 不用 const —— 顶层 const 不挂 window，E2E/调试要 window.G（snake 实踩）。
var G = { phase: 'HOME' };

function dispatch(action, data) {
  switch (action) {
    case 'START': G.phase = 'PLAYING'; break;
    case 'HOME': G.phase = 'HOME'; break;
    default: break;
  }
  renderAll();
}

function renderAll() {
  clearHits();
  const { SW, SH } = GameGlobal;
  ctx.clearRect(0, 0, SW, SH);
  txt(T('app.title'), SW / 2, SH * 0.3, '#0a6a8a', 'bold 28px sans-serif');
  fillRR(SW / 2 - 90, SH * 0.5, 180, 48, 12, '#0a84ff');
  txt(T(G.phase === 'HOME' ? 'menu.vsAI' : 'game.again'), SW / 2, SH * 0.5 + 24, '#fff', 'bold 16px sans-serif');
  addHit(SW / 2 - 90, SH * 0.5, 180, 48, G.phase === 'HOME' ? 'START' : 'HOME', {});
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  Input.bind({ onAction: dispatch });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();
}

boot();
```

- [ ] **Step 4：起本地服务肉眼确认页面真的出来了**

Run: `npx http-server -p 8080`（⚠ **必须 http**——locale 走 `fetch`，`file://` 白屏）
打开 `http://localhost:8080/games/connect4/`，**肉眼确认**：标题是英文的、按钮点了会变文案、切语言变中文。

⛔ **别跳过肉眼这一步**（本仓 blockblast 实锤：脚本报「生成成功」毫无意义，截图逐张肉眼验才抓出三个真 UI bug）。

- [ ] **Step 5：locale 门禁 + 提交**

Run: `node tools/check-locales.js games/connect4/locales` → 必须 **0 fail**

```bash
git add games/connect4/index.html games/connect4/css/game.css games/connect4/js/main.js games/connect4/locales package.json
git commit -m "connect4 P2a: 页面骨架接通引擎（零硬编码文案）"
```

---

## Task 2：`js/state.js` —— `G` 的形状、存档、撤销、交替先手

**Files:** Create `games/connect4/js/state.js` · `games/connect4/tests/test-state.js`；Modify `package.json`

**设计（DESIGN §9.3）**：⭐ **存档存「先后手 + 手数列表」，不存局面快照栈。** 一个决定同时白送：撤销（重放到 n−1）· 中断恢复 · 「从第 N 步重来」· 一条 URL 分享整局。⚠ 代价：**手搓的局面不可撤销**。

- [ ] **Step 1：先写失败的测试**

Create `games/connect4/tests/test-state.js`：

```js
const assert = require('assert');
const B = require('../js/bitboard.js');
const St = require('../js/state.js');

// --- 新局：交替先手（DESIGN §1.1 第 2 条）---
{
  const a = St.newGame({ mode: 'human', gameNo: 0 });
  const b = St.newGame({ mode: 'human', gameNo: 1 });
  assert.strictEqual(a.humanFirst, true);
  assert.strictEqual(b.humanFirst, false, '⛔ 同机双人必须每局交替先手——零运气对局里先手是硬优势');
}

// --- 落子 → 手数列表增长；盘面由手数列表重建 ---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  g = St.play(g, 3); g = St.play(g, 3); g = St.play(g, 4);
  assert.deepStrictEqual(g.moves, [3, 3, 4]);
  assert.strictEqual(St.boardOf(g).n, 3);
}

// --- ⭐ 撤销 = 重放到 n-1，不是快照栈 ---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4, 4, 2]) g = St.play(g, c);
  const before = JSON.stringify(St.boardOf(g));
  g = St.undo(g);
  assert.deepStrictEqual(g.moves, [3, 3, 4, 4]);
  g = St.play(g, 2);
  assert.strictEqual(JSON.stringify(St.boardOf(g)), before, '撤销后重走同一列必须回到同一个盘面');
}
{
  const g = St.newGame({ mode: 'human', gameNo: 0 });
  assert.deepStrictEqual(St.undo(g).moves, [], '空局撤销必须是 no-op，不许炸也不许出负数');
}

// --- ⭐ 从第 N 步重来（复盘的「从这一步重来」，DESIGN §3.3）---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4, 4, 2, 2]) g = St.play(g, c);
  const g2 = St.rewindTo(g, 3);
  assert.deepStrictEqual(g2.moves, [3, 3, 4]);
  assert.strictEqual(g2.humanFirst, g.humanFirst, '重来不许改先后手');
}

// --- 存档往返 ---
{
  let g = St.newGame({ mode: 'ai', tier: 12, gameNo: 5 });
  for (const c of [3, 3, 4]) g = St.play(g, c);
  const s = St.serialize(g);
  assert.strictEqual(typeof s, 'string');
  const back = St.deserialize(s);
  assert.deepStrictEqual(back.moves, g.moves);
  assert.strictEqual(back.tier, 12);
  assert.strictEqual(back.humanFirst, g.humanFirst);
  assert.strictEqual(back.seed, g.seed, 'seed 必须存，否则 AI 重放不出同一局');
}

// --- ⛔ 版本不符必须丢弃，绝不迁移（root CLAUDE.md 铁律）---
{
  const s = JSON.parse(St.serialize(St.newGame({ mode: 'ai', tier: 8, gameNo: 0 })));
  s.v = St.SAVE_VERSION + 1;
  assert.strictEqual(St.deserialize(JSON.stringify(s)), null, '版本不符必须返回 null（丢弃），不许迁移');
  assert.strictEqual(St.deserialize('not json'), null);
  assert.strictEqual(St.deserialize(JSON.stringify({ v: St.SAVE_VERSION, moves: [99] })), null,
    '非法手数列表必须整份丢弃（fromMoves 会抛，别让它逃出去）');
}

// --- ⭐ 参数表指纹要进存档（DESIGN §11b 第 4 条）---
{
  const g = St.newGame({ mode: 'ai', tier: 12, gameNo: 0 });
  assert.ok(g.paramsHash, '存档必须记 AI.paramsDigest().hash —— 否则换过难度参数后复盘会静默对不上');
  const back = St.deserialize(St.serialize(g));
  assert.strictEqual(back.paramsHash, g.paramsHash);
}

console.log('test-state: 全部通过');
```

- [ ] **Step 2：跑测试确认它失败**

Run: `node games/connect4/tests/test-state.js`
Expected: FAIL — `Cannot find module '../js/state.js'`

- [ ] **Step 3：写实现**

⚠ 双导出（node 可单测 + 浏览器全局），照 P1 五个模块的写法。
⚠ **`AI` 在浏览器里是裸标识符 `ConnectAI`**（P1 终审实锤：`engine/prng.js` 那类 `const X = {}` 是词法绑定不是 `self` 属性；本游戏模块用 `root.X = API` 所以是属性——**两种混在一个加载序列里，别记混**）。

关键点：
- `newGame({mode,tier,gameNo})` → `{ v, mode, tier, gameNo, humanFirst: gameNo % 2 === 0, seed, moves: [], paramsHash }`
- `boardOf(g)` = `B.fromMoves(g.moves)`（**每次重建，不缓存**；42 手以内成本可忽略，缓存反而会和撤销打架）
- `undo(g)` = `rewindTo(g, g.moves.length - 1)`，⚠ 下界夹 0
- `serialize/deserialize` 带 `v`，⛔ **版本不符直接返回 `null`**（丢弃，绝不迁移——root CLAUDE.md 铁律：老玩家「恢复」成畸形状态 = 无报错白屏）
- `deserialize` 要 `try/catch` 包住 `B.fromMoves`（P1 给它加了整数列号与合法性守卫，会抛）

- [ ] **Step 4：跑测试确认全绿；挂进 `test:c4`；提交**

```bash
git add games/connect4/js/state.js games/connect4/tests/test-state.js package.json
git commit -m "connect4 P2a: 状态层（存 seed+手数列表，撤销=重放）"
```

---

## Task 3：⚠ 改 `engine/input.js` —— 新增 opt-in 的「按住预览」

⛔ **这是六个游戏共用的文件。改前先 `git status` 看别的会话有没有未提交改动，并先读当前内容**（root CLAUDE.md 协作坑第 1 条：input.js 曾因替换旧版内容被贴进孤儿代码）。

**Files:** Modify `engine/input.js`；Modify `engine/README.md`（契约文档）

- [ ] **Step 1：读当前内容，确认没有别的会话在改**

Run: `git status --short engine/` （应为空）
Run: `git log --oneline -3 -- engine/input.js`

- [ ] **Step 2：加 opt-in 三件套，⛔ 不动任何现有分支**

照 `liveSwipe` 的先例（同文件 44-45 行明写「不传的游戏完全不受影响」）。在 `bind` 里新增：

```js
    // ⭐ onHold* 三件套（opt-in，回合制/落子类游戏用）：
    //   onHold(x,y)      按下
    //   onHoldMove(x,y)  按住移动（每次移动都发，游戏自己节流）
    //   onHoldEnd(x,y)   松手
    // ⚠ 为什么必须新加而不是复用 onAction：onAction 只在 `dist<10 && dt<500` 时才发，
    //   而「按住预览、松手才落」按定义 dt 会是好几秒 ⇒ **那一手会被静默丢掉**。
    //   四子棋玩家盯着盘面想两秒再松手是常态，这不是新功能的问题，是现契约对该品类本来就是坏的。
    // ⛔ 不传这三个的游戏一行行为都不变（同 liveSwipe 的纪律）。
    const hold = !!(H.onHold || H.onHoldMove || H.onHoldEnd);
```

在 `start()` 末尾加 `if (H.onHold) H.onHold(x, y);`
在 `end()` **最前面**（`clearTimeout` 之后、`lpFired` 判断之前）加：
```js
      if (hold) { if (H.onHoldEnd) H.onHoldEnd(x, y); if (!H.onAction) return; }
```
⚠ **`onHoldEnd` 要在 `lpFired` 之前发**——否则长按会把松手事件吞掉，玩家按久了棋子落不下去。

在两个 `touchmove` 之外新增一个（`passive: true`）与 `mousemove`，都只在 `hold` 时发 `onHoldMove`。

- [ ] **Step 3：⛔ 回归——六个游戏必须全绿**

Run: `npm test`
Expected: **exit 0**，六个游戏（mines/snake/abyss/block/sol/c4）全跑

⚠ 若任何一个红了，**先回退 engine 改动再查**——engine 是所有线上游戏的公共地基。

Run: `npm run test:mines:e2e` 与 `npm run test:block:e2e`（有真实点击的两套，最能抓输入层回归）

- [ ] **Step 4：更新 `engine/README.md` 的契约表**

在 `input.js` 那一行补 `onHold/onHoldMove/onHoldEnd（opt-in，按住预览类玩法；⚠ onAction 的 dt<500 窗口对它不适用）`。

- [ ] **Step 5：提交**

```bash
git add engine/input.js engine/README.md
git commit -m "engine/input: 新增 opt-in 的 onHold 三件套（按住预览；不传的游戏零影响）"
```

---

## Task 4：`js/solver.worker.js` + `js/engine-client.js` —— 求解器搬进 Worker

⚠ **这一步决定产品的卖点在不在**。DESIGN §9.2：`n=10..15` 的 `scoreAll` 中位 **1.7 秒**，跑在主线程 = 整个页面冻住。

**Files:** Create `games/connect4/js/solver.worker.js` · `games/connect4/js/engine-client.js`

- [ ] **Step 1：写 Worker**

```js
// solver.worker.js —— P1 求解器的 Worker 壳。
// ⚠⚠ **importScripts 少一个依赖 = Worker 一 new 就抛，onerror 把结果兜成「降级」**
//    ⇒ 玩家看到的是「有点慢」，而产品的全部卖点（数学真值）已经悄悄不在了。
//    solitaire 实锤过同款（prover.worker.js:21 上方）：漏了 cards.js ⇒ 证明器从没跑起来过，
//    看起来却像「算不出来」。⇒ 主线程侧必须有**活性探针**（见 engine-client.js），
//    不许只测「有没有返回结果」。
// ⚠ 顺序 = 依赖顺序。prng 在最前（ai.js 要它）。
importScripts('../../../engine/prng.js', 'bitboard.js', 'rules-classic.js', 'solver.js', 'book.js', 'ai.js');
```

协议（`postMessage`）：`{id, op}` → `{id, ok, ...}`。`op` 至少要有：
- `ping` → 立刻回 `{pong:true, ready:Book.status().state}` （**活性探针**）
- `book` → 懒加载开局库（`fetch('data/book-classic.bin')` → `Book.load(buf)`），回 `{state}`
- `ai` `{moves, tier, seed}` → `{col}`
- `scores` `{moves}` → `{scores}`（P3 的提示/复盘要用，P2a 先通协议）

⚠ **Worker 里开 `Solver.setKeepTable(true)`**（DESIGN §9.2 结构性缓解：同一局连续局面重叠极大）。⛔ 但 P1 的门禁一律关着跑，别把这行抄进任何测试。

- [ ] **Step 2：写主线程门面 `engine-client.js`**

必须做到（照 `games/solitaire/js/prover.js:10-40` 的容错骨架）：
- `new Worker('js/solver.worker.js')` 包 `try/catch`
- `worker.onerror` ⇒ 记 `state='dead'`，**并让 UI 如实显示降级**（DESIGN §2.4：⛔ 绝不谎报真值）
- ⭐ **启动时先 `ping`**，超时（比如 3s）没回 ⇒ `state='dead'`
- 请求带 `id`、只认最新一次（玩家连点时旧结果必须丢弃）
- 开局库**懒加载**：首屏不等它；未就位时 `usesSolver` 的那一手显示「计算中」

- [ ] **Step 3：⭐ 写「Worker 真的活着」的断言（不是「有没有返回结果」）**

在 E2E（Task 8）里，⚠ 但先在这里定判据：
- `ping` 必须在 3s 内回 `pong`
- 拿一个**已知答案**的局面问 `ai`，答案必须等于 node 侧同参数的结果（⇒ 证明 Worker 里跑的是真的求解器，不是降级路径）
- ⛔ **故意把 `importScripts` 少写一个依赖，确认活性探针当场报 dead**（别只是加了条断言）

- [ ] **Step 4：提交**

```bash
git add games/connect4/js/solver.worker.js games/connect4/js/engine-client.js
git commit -m "connect4 P2a: 求解器搬进 Worker + 活性探针（漏 import 会伪装成降级）"
```

---

## Task 5：`js/render.js` —— 画盘面，棋子**形状+颜色双编码**

⭐ DESIGN §6.2：四子棋的**全部信息**压在「这枚是我的还是他的」一个色差上，约 **8% 的男性**有色觉障碍。**验收判据是「转成灰度也必须一眼分清」。**
⭐ 它同时避开 Hasbro 的 trade dress（红黄同形圆片 + 蓝框）与 4.3 的克隆嫌疑——**一个设计决定解三个问题**（§0.2、§6.2）。

**Files:** Create `games/connect4/js/render.js`

- [ ] **Step 1：实现 `renderAll()`**

契约（`engine/README.md`）：每帧 `clearHits()` → 从 `G` 重画整屏 → 每个可点区域 `addHit(x,y,w,h,action,data)`。

必须有：
- 7×6 网格 + 列的点击热区（**整列一个热区**，不是每格）
- 两方棋子**两种不同造型**（⛔ 不是同一形状换色）
- 悬停预览：半透明棋子悬在列上方 + **落点虚影**（显示会掉到哪一格）
- 赢局：四枚发光 + **画出那条连线** + 其余变暗（§6.3：玩家必须看清自己赢在哪）
- ⚠ HUD 必须落在 `safeTop` 之下（solitaire 实踩：画在 safeTop 之上被 `#controls`（fixed, top:8px right:8px, z-index 20）压住 ⇒ 唯一入口点不动）

- [ ] **Step 2：⭐ 灰度可辨的验收（写成脚本，不靠肉眼说了算）**

写一个临时脚本：把画好的 canvas 转灰度，取两方棋子中心区域的平均亮度与形状轮廓，断言**两者可区分**。
⚠ 也**必须肉眼看一眼灰度截图**——本仓 blockblast 实锤：消行预览画在背景层被完全挡住，功能测试全绿，「本作最重要的一个 UI」坏了没人发现。

- [ ] **Step 3：提交**

---

## Task 6：`js/main.js` 补全 —— 状态机 + 悬停预览 + 双人/AI 对局

**Files:** Modify `games/connect4/js/main.js`

- [ ] **Step 1：`G.phase` 状态机**

`HOME` → `PLAYING` → `OVER`。⚠ AI 思考中要有独立标志（不是 phase），否则玩家在 AI 思考时点击会被吞。

- [ ] **Step 2：悬停预览接 `onHold` 三件套**

⚠ **低档必须仍然秒出**（DESIGN §11b 第 3 条）：第 1-5 级根本不调求解器（实测中位 0.0022 ms）。⛔ 别让共用的「思考中」态把轻松档也拖成 1.7 秒——那会让「轻松」显得比顶档还重。用 `AI.usesSolver(position, tier)` 判这一手要不要转菊花。

- [ ] **Step 3：双人同机——每局自动交替先手 + 猜先**

⚠ DESIGN §1.1：零运气对局里先手是硬优势，连打几局必有人觉得不公平，**而这游戏没有运气可以背锅**。

- [ ] **Step 4：肉眼玩一整局**（人 vs 轻松档、人 vs 人各一局）

- [ ] **Step 5：提交**

---

## Task 7：`tests/test-noclone.js` —— ⛔ 商标词门禁

**Files:** Create `games/connect4/tests/test-noclone.js`；Modify `package.json`

⛔ DESIGN §0.1：`Connect 4` / `Connect Four` 是**孩之宝活跃注册商标**，**一个字都不许出现**在任何面向用户的地方。⚠ **绝不能援引 solitaire 的先例**（那是几百年的公有品类，这是品牌）。

- [ ] **Step 1：写门禁**

扫 `locales/*.json` + `index.html` + `css/*.css` + 将来的 `capacitor.config.json` 与 review-notes 模板，断言不含 `/connect\s*-?\s*(4|four)/i`。
⚠ **内部代号 `connect4` 只许出现在目录名和代码里**——门禁要能区分「路径/require」与「面向用户的串」。

- [ ] **Step 2：自己塞一个 `Connect 4` 进 locale，确认门禁当场红**（别只是加了条断言）

- [ ] **Step 3：挂进 `test:c4`；提交**

---

## Task 8：`tests/e2e-p2a.cjs` —— Playwright 真实鼠标端到端

⛔ 本仓铁律：**E2E 用 `dispatch()` 绕过真实点击 = 假绿**（blockblast 实锤：菜单里每次点击都抛 TypeError，而 E2E 报「零 error」）。**必须 `page.mouse.click`。**
⛔ E2E 点击一律**按 hitAreas 的 action 名找坐标**，别用绝对坐标（本仓 15 套测试在布局大改版下零适配全绿的原因）。

**Files:** Create `games/connect4/tests/e2e-p2a.cjs`；Modify `package.json`

- [ ] **Step 1：起服务 + 打开页面 + 断言无 console error**
- [ ] **Step 2：⭐ Worker 活性**：`ping` 回来、且一个已知局面的 AI 落子等于 node 侧同参数结果
- [ ] **Step 3：真实鼠标下完一整局**（人 vs 第 1 级），断言终局判定正确、连线画出来了
- [ ] **Step 4：⭐ 按住预览**：`mouse.down` → `mouse.move` 到另一列 → 断言预览跟着走 → `mouse.up` → 断言落在**松手那一列**
- [ ] **Step 5：⭐ 按住 > 500 ms 再松手，那一手必须落下**（这是 Task 3 存在的理由，⛔ 必须有这条）
- [ ] **Step 6：撤销 / 刷新恢复 / 交替先手**
- [ ] **Step 7：挂进 `package.json`（⚠ E2E 单独跑，不进 `npm test`，照本仓惯例）；提交**

---

## Task 9：收尾——`?v=N` 纪律、README、DESIGN 回填

- [ ] **Step 1：⛔ 改过 js/css ⇒ `index.html` 里所有 `?v=N` 统一 +1**（root CLAUDE.md 铁律：忘了 = 老玩家拿到新旧混装的 JS）
- [ ] **Step 2：`DESIGN.md` 抬头改成「P2a 已交付：可以玩了」**，并把「⚠ 游戏现在还不能玩」那段撤掉/改写
- [ ] **Step 3：root `CLAUDE.md` / `README.md` 的 connect4 行更新**
- [ ] **Step 4：`npm test` / `npm run test:c4` / E2E 全绿**；提交

---

## P2a 完成判据

- [ ] `npm test` 整仓 exit 0（⚠ **含另外五个游戏**——Task 3 动过 engine）
- [ ] `npm run test:c4` exit 0（含 test-state / test-noclone）
- [ ] E2E exit 0，且**按住 >500ms 那一手确实落下**
- [ ] `node tools/check-locales.js games/connect4/locales` 0 fail
- [ ] ⭐ **一个人能打开页面、和 AI 下完一局、和另一个人下完一局、看到自己赢在哪**
- [ ] ⭐ **灰度截图里两方棋子一眼可分**
- [ ] ⭐ **故意漏一个 `importScripts` 依赖，活性探针当场报 dead**（不是伪装成降级）
- [ ] 商标门禁：塞一个 `Connect 4` 进 locale 会当场红

## 不在 P2a 范围（→ P2b）

物理下落与音效震动 · 威胁高亮与双威胁特效 · 结算节奏（≤5s）· 儿童档/让子/对坐/猜先动画 · 舒适模式/减弱动态 · 竖屏留白利用 · 限时模式。
**→ P3**：提示 / 赛后复盘 / 精准度 / 妙手（协议在 Task 4 已预留 `scores`）。
