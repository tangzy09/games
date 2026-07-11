# Abyss Shooter P1b「可玩壳」—— render / main / index.html 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给已完成的 P1 纯逻辑内核（`js/core.js` + `js/tiles.js`）接上引擎、渲染与输入，做出**真能在浏览器里玩的壳**：5 列鱼阵 + 底部加农炮点列射击 + 连锁合并 + 计分 + 死亡/重开，并用 Playwright E2E 无头验证整局跑通。做完就能真上手感受「射鱼-连锁-被顶爆」。

**Architecture:** 严守本仓引擎契约（`engine/README.md`）：全局脚本按序加载共享命名空间、无模块无 bundler。游戏提供单一可变状态 `G` + `renderAll()`（每帧 `clearHits()` 重画全屏并 `addHit()` 可点区域）+ `dispatch(action, data)`。**本游戏是回合制**（一发 = 一个离散步），故**不需要 requestAnimationFrame 主循环**——`input → dispatch 改状态 → renderAll()` 即可（同 minesweeper 的立即模式，不同于 snake 的 RAF 循环）。P1b **不做**动画/音效/道具/图鉴/皮肤/成就/存档（那些在 P2/P3）。

**Tech Stack:** 纯 JS + canvas，无框架。引擎全局：`CFG` `Platform` `I18N`/`T` `Portal` `Ads` `Sfx`/`restoreAudioPrefs` `initCanvas`/`ctx`/`GameGlobal`/`clearHits`/`addHit`/`fillRR`/`txt`/`txtL`/`drawDim` `Input` `Controls`。测试用 Playwright（已是 devDependency）。

**读这些做参考**：`games/_demo/js/game.js`（引擎 boot 契约最小样板）、`games/_demo/index.html`、`games/minesweeper/index.html`（`?v=N` 缓存版本惯例）、`games/snake/locales/en.json`（locale 嵌套结构）、`games/abyssshoot/DESIGN.md`、`games/abyssshoot/CLAUDE.md`（棋盘模型与不变量）。

**已有的 core API（P1 已实现，不要改）：**
```js
Core.createGame({cols=5, rows=9, seed})  // → s
Core.shoot(s, col)                        // 唯一交互入口;清空重填 s.events
// s: { cols, rows, board(每列一栈,index0=顶/末尾=底), score, maxTile,
//      shots, shotsSinceSpawn, dead, events, ammo, queue(预览3发) }
// s.events: {t:'shoot'|'merge'|'chain'|'newMaxFish'|'spawn'|'death', ...}
Tiles.TILES  // [{v:2,fish:'clownfish'}, ...] 13 档
Tiles.tierOf(v) → 下标 | -1 ;  Tiles.fishOf(v) → 鱼 id | null ;  Tiles.fmt(v) → '8192'/'1M'
```

**关键渲染事实（来自棋盘模型，别搞反）：** 列 `index 0 = 顶`，往下长，**底 = 玩家侧/死线**。故格子 `(c, i)` 画在 `y = boardY + i*cell`——`i` 直接就是从上往下数的行号。列高 > `rows` 即死（第 10 个格子会越过死线，此时 `s.dead` 已为 true）。

---

## 文件结构

- 新建 `games/abyssshoot/locales/en.json`、`locales/zh-CN.json` —— 嵌套结构，en 为基准。
- 新建 `games/abyssshoot/css/game.css` —— body 背景（深海）+ 覆盖引擎 CSS 变量。
- 新建 `games/abyssshoot/js/render.js` —— `PAL` 调色板、`layout()` 布局计算、`renderAll()`（契约）。
- 新建 `games/abyssshoot/js/main.js` —— `G` + `dispatch` + `newGame` + `boot`。
- 新建 `games/abyssshoot/index.html` —— `GAME_CONFIG` + 引擎脚本按序加载 + 游戏脚本，全部带 `?v=1`。
- 新建 `games/abyssshoot/tests/e2e-p1b.cjs` —— Playwright 无头：整局跑通 + 截图。
- 修改 `package.json`（root）—— 加 `test:abyss:e2e`。

---

## Task 1: locales —— en + zh-CN（嵌套结构）

**Files:**
- Create: `games/abyssshoot/locales/en.json`
- Create: `games/abyssshoot/locales/zh-CN.json`

> ⚠ **locale JSON 必须是嵌套结构**（`{"abyss":{"score":"Score"}}`）——`I18N.get` 按点路径逐层解析。写成扁平的 `{"abyss.score":"Score"}` 会**满屏 key 原文且 console 零报错**（snake P1 实踩过，check-locales 也查不出这个，它只比对 key 集合）。

- [ ] **Step 1: 建 en.json（基准）**

Create `games/abyssshoot/locales/en.json`:

```json
{
  "lang": { "name": "English", "toggle": "Language" },
  "ads": { "simWatch": "[Ad simulation] Watch a rewarded ad?", "simInterstitial": "[Ad simulation] Interstitial ad" },
  "abyss": {
    "title": "Abyss Shooter",
    "tagline": "Shoot fish up. Same numbers merge. Don't get crushed.",
    "start": "Dive In",
    "score": "Score",
    "best": "Deepest",
    "next": "Next",
    "gameOver": "Crushed!",
    "finalScore": "Score {n}",
    "deepest": "Deepest fish {v}",
    "restart": "Dive Again",
    "hint": "Tap a column to shoot"
  }
}
```

- [ ] **Step 2: 建 zh-CN.json（同 key 集）**

Create `games/abyssshoot/locales/zh-CN.json`:

```json
{
  "lang": { "name": "中文", "toggle": "语言" },
  "ads": { "simWatch": "[广告模拟] 观看激励广告？", "simInterstitial": "[广告模拟] 插屏广告" },
  "abyss": {
    "title": "深渊射手",
    "tagline": "把小鱼射上去，同数合并，别被压垮。",
    "start": "下潜",
    "score": "分数",
    "best": "最深",
    "next": "下一发",
    "gameOver": "被压垮了！",
    "finalScore": "得分 {n}",
    "deepest": "最深的鱼 {v}",
    "restart": "再次下潜",
    "hint": "点一列即可射击"
  }
}
```

- [ ] **Step 3: 跑 locale 校验**

Run: `node tools/check-locales.js games/abyssshoot/locales`
Expected: `0 fail`（key 集一致）

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/locales/en.json games/abyssshoot/locales/zh-CN.json
git commit -m "feat(abyssshoot): locales en+zh-CN(嵌套结构)"
```

---

## Task 2: css/game.css —— 深海底色

**Files:**
- Create: `games/abyssshoot/css/game.css`

- [ ] **Step 1: 写样式**

Create `games/abyssshoot/css/game.css`:

```css
/* 深海主题:覆盖引擎 CSS 变量 + body 底色。canvas 只画游戏,顶栏是引擎 DOM。 */
:root {
  --eng-menu-bg: #14263d;
  --eng-menu-hover: #1e3550;
  --eng-menu-sel-bg: #2bb3c0;
  --eng-menu-sel-text: #04121f;
}
body {
  background: #04121f;   /* 深渊底色,与 render.js 的 PAL.bg 保持一致 */
  color: #cfe8f5;
}
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/css/game.css
git commit -m "feat(abyssshoot): 深海主题 css"
```

---

## Task 3: js/render.js —— 调色板 + 布局 + renderAll 契约

**Files:**
- Create: `games/abyssshoot/js/render.js`

`renderAll()` 是引擎契约：每次调用 `clearHits()` → 从 `G` 重画整屏 → 每个可点区域 `addHit()`。本游戏可点区域 = **5 条整列竖条**（点列即射击，命中区从棋盘顶一直到炮台底，好点），外加 HOME 的开始按钮、DEAD 的重开按钮。

- [ ] **Step 1: 写 render.js**

Create `games/abyssshoot/js/render.js`:

```javascript
// render.js — 立即模式渲染(浏览器专用)。renderAll 契约:clearHits → 重画全屏 → addHit。
// 棋盘模型:列 index0=顶,往下长,底=玩家侧/死线。故格子(c,i)画在 y = boardY + i*cell。
const PAL = {
  bg: '#04121f',
  boardBg: '#0a1f33',
  colBg: '#0d2740',
  line: '#2bb3c0',        // 死线
  text: '#cfe8f5',
  dim: 'rgba(2,10,18,0.82)',
  btn: '#2bb3c0',
  btnText: '#04121f',
  // 按档位上色(浅礁→深渊,越深越冷艳);超出档位循环取
  tiers: ['#38bdf8', '#34d399', '#a3e635', '#fbbf24', '#fb923c',
          '#f87171', '#f472b6', '#c084fc', '#a78bfa', '#818cf8',
          '#60a5fa', '#22d3ee', '#e2e8f0'],
};

const PAD = 12;

// 布局:HUD 在顶(避开引擎顶栏 safeTop),棋盘居中,炮台在棋盘正下方。
function layout(s) {
  const { SW, SH, safeTop } = GameGlobal;
  const hudY = safeTop + 8;
  const hudH = 44;
  const topY = hudY + hudH + 8;
  const bottomPad = 16;
  // 竖向要塞下 rows 行棋盘 + 1 行炮台
  const availH = SH - topY - bottomPad;
  const availW = SW - PAD * 2;
  const cell = Math.floor(Math.min(availW / s.cols, availH / (s.rows + 1.4)));
  const boardW = cell * s.cols;
  const boardH = cell * s.rows;
  const boardX = Math.round((SW - boardW) / 2);
  const boardY = topY;
  const cannonY = boardY + boardH + 10;   // 死线下方留 10px 再放炮台
  return { SW, SH, hudY, hudH, cell, boardW, boardH, boardX, boardY, cannonY };
}

// 画一个鱼格:圆角色块 + 数字(P1b 用纯色+数字占位,鱼图 P2 接 makeArt/drawArtIcon)
function drawTile(x, y, cell, v) {
  const t = Tiles.tierOf(v);
  const color = PAL.tiers[(t < 0 ? 0 : t) % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  fillRR(x + m, y + m, cell - m * 2, cell - m * 2, Math.round(cell * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.round(cell * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42));
  txt(label, x + cell / 2, y + cell / 2, '#04121f', `bold ${fs}px sans-serif`);
}

function renderAll() {
  clearHits();
  const s = G.s;
  const L = layout(s);
  const { SW, SH } = L;

  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, SW, SH);

  // ── HUD:分数 + 最深 ──
  txtL(`${T('abyss.score')} ${s.score}`, PAD, L.hudY + L.hudH / 2, PAL.text, 'bold 18px sans-serif');
  const best = s.maxTile ? Tiles.fmt(s.maxTile) : '—';
  txt(`${T('abyss.best')} ${best}`, SW - PAD - 60, L.hudY + L.hudH / 2, PAL.text, '14px sans-serif');

  // ── 棋盘底 + 列底 ──
  fillRR(L.boardX - 4, L.boardY - 4, L.boardW + 8, L.boardH + 8, 10, PAL.boardBg);
  for (let c = 0; c < s.cols; c++) {
    fillRR(L.boardX + c * L.cell + 2, L.boardY + 2, L.cell - 4, L.boardH - 4, 8, PAL.colBg);
  }

  // ── 鱼格:(c,i) → y = boardY + i*cell(index0 在顶) ──
  for (let c = 0; c < s.cols; c++) {
    const col = s.board[c];
    for (let i = 0; i < col.length && i < s.rows; i++) {
      drawTile(L.boardX + c * L.cell, L.boardY + i * L.cell, L.cell, col[i]);
    }
  }

  // ── 死线 ──
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(L.boardX, L.boardY + L.boardH + 1);
  ctx.lineTo(L.boardX + L.boardW, L.boardY + L.boardH + 1);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 炮台:每列一个 ▲,当前弹药画在中间列位置之外(独立一格居中显示) ──
  for (let c = 0; c < s.cols; c++) {
    const cx = L.boardX + c * L.cell + L.cell / 2;
    txt('▲', cx, L.cannonY + L.cell * 0.5, '#3b6a86', `${Math.round(L.cell * 0.34)}px sans-serif`);
  }
  // 当前弹药:画在炮台行正中
  if (!s.dead) {
    const ax = L.boardX + Math.floor(s.cols / 2) * L.cell;
    drawTile(ax, L.cannonY, L.cell, s.ammo);
  }
  // 下一发预览
  if (s.queue.length) {
    const nx = L.boardX + L.boardW - L.cell * 0.62;
    const ny = L.cannonY + L.cell * 0.5;
    txt(T('abyss.next'), nx, ny - L.cell * 0.34, '#5b87a3', '10px sans-serif');
    const sz = L.cell * 0.5;
    drawTile(nx - sz / 2, ny - sz / 2 + 4, sz, s.queue[0]);
  }

  // ── 可点区域:5 条整列竖条(棋盘顶 → 炮台底),点哪列射哪列 ──
  if (G.phase === 'PLAYING') {
    for (let c = 0; c < s.cols; c++) {
      addHit(L.boardX + c * L.cell, L.boardY, L.cell, L.boardH + L.cell + 10, 'SHOOT', { col: c });
    }
  }

  // ── 覆盖层 ──
  if (G.phase === 'HOME') {
    drawDim(PAL.dim);
    txt(T('abyss.title'), SW / 2, SH * 0.34, PAL.text, 'bold 30px sans-serif');
    txtLWrap(T('abyss.tagline'), SW / 2 - 130, SH * 0.42, 260, '#8ab6cd', '14px sans-serif', 18);
    const bw = 180, bh = 52, bx = SW / 2 - bw / 2, by = SH * 0.54;
    fillRR(bx, by, bw, bh, 14, PAL.btn);
    txt(T('abyss.start'), SW / 2, by + bh / 2, PAL.btnText, 'bold 18px sans-serif');
    addHit(bx, by, bw, bh, 'START', {});
    txt(T('abyss.hint'), SW / 2, by + bh + 28, '#5b87a3', '12px sans-serif');
  } else if (G.phase === 'DEAD') {
    drawDim(PAL.dim);
    txt(T('abyss.gameOver'), SW / 2, SH * 0.36, '#f87171', 'bold 28px sans-serif');
    txt(T('abyss.finalScore', { n: s.score }), SW / 2, SH * 0.44, PAL.text, 'bold 20px sans-serif');
    txt(T('abyss.deepest', { v: Tiles.fmt(s.maxTile || 0) }), SW / 2, SH * 0.50, '#8ab6cd', '14px sans-serif');
    const bw = 180, bh = 52, bx = SW / 2 - bw / 2, by = SH * 0.58;
    fillRR(bx, by, bw, bh, 14, PAL.btn);
    txt(T('abyss.restart'), SW / 2, by + bh / 2, PAL.btnText, 'bold 18px sans-serif');
    addHit(bx, by, bw, bh, 'RESTART', {});
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/render.js
git commit -m "feat(abyssshoot): render 立即模式渲染(棋盘/炮台/死线/覆盖层)"
```

---

## Task 4: js/main.js —— G + dispatch + boot

**Files:**
- Create: `games/abyssshoot/js/main.js`

> ⚠ `G` 用 **`var`**（非 `const`）——顶层 `const` 不会挂到 `window` 上，而 E2E/调试要能读 `window.G`（snake 实测验证过）。同理 `dispatch`/`renderAll` 用**函数声明**暴露为全局。
> ⚠ **回合制，无 RAF 主循环**：`dispatch` 改完状态直接 `renderAll()`（同 minesweeper 立即模式）。

- [ ] **Step 1: 写 main.js**

Create `games/abyssshoot/js/main.js`:

```javascript
// main.js — 引擎 boot 契约 + 相位机 + 交互分发(回合制,无 RAF 主循环)。
// 注:G 用 var(非 const)——顶层 const 不挂 window,E2E/调试要 window.G(snake 实测)。
var G = {
  phase: 'HOME',   // HOME | PLAYING | DEAD
  s: null,         // core 状态(Core.createGame 产出)
};

function newGame() {
  // 种子用真随机起(非 core 内部;core 自身禁 Date.now,但外部起局可以)
  G.s = Core.createGame({ seed: (Date.now() % 2147483647) });
  G.phase = 'PLAYING';
}

function dispatch(action, data) {
  switch (action) {
    case 'START':
    case 'RESTART':
      newGame();
      break;
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      Core.shoot(G.s, data.col);
      if (G.s.events.some(e => e.t === 'death')) G.phase = 'DEAD';
      break;
    }
    default: break;
  }
  renderAll();
}

async function boot() {
  try {
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
    restoreAudioPrefs();
    Portal.boot();
    await Ads.init();
    I18N.onChange(() => { Controls.render(); renderAll(); });
    await I18N.setLang(I18N.detect());
    initCanvas();
    G.s = Core.createGame({ seed: 1 });   // HOME 期先建一个空盘供渲染
    G.phase = 'HOME';
    Input.bind({ onAction: dispatch });
    window.addEventListener('resize', () => { initCanvas(); renderAll(); });
    Controls.render();
    renderAll();
    try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
  } catch (err) {
    // boot 异常不许静默白屏:能画就画到屏上
    console.error('abyssshoot boot failed:', err);
    if (typeof ctx !== 'undefined' && ctx) {
      ctx.fillStyle = '#cfe8f5';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Load failed: ' + err.message,
        (GameGlobal.SW || window.innerWidth) / 2, (GameGlobal.SH || window.innerHeight) / 2);
    }
  }
}

boot();
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/main.js
git commit -m "feat(abyssshoot): main 相位机+dispatch+引擎 boot(回合制无 RAF)"
```

---

## Task 5: index.html —— GAME_CONFIG + 脚本按序加载

**Files:**
- Create: `games/abyssshoot/index.html`

> ⚠ **加载顺序即依赖顺序**（load-bearing）：引擎脚本 → `prng` → `tiles` → `core` → `render` → `main`。
> ⚠ **所有 js/css 带 `?v=1`**（同 minesweeper 惯例）——以后改任何 js/css，**这个游戏 index.html 里所有 `?v=N` 统一 +1**（根 CLAUDE.md 部署铁律，忘了 = 老玩家拿到新旧混装 JS）。
> `GAME_CONFIG.id = 'abyss'` → 存储键前缀 `abyss_*`。P1b 暂不配 `adUnits`/`sfx`（P2/P4 再补）。

- [ ] **Step 1: 写 index.html**

Create `games/abyssshoot/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<title>Abyss Shooter</title>
<link rel="stylesheet" href="../../engine/engine.css?v=1">
<link rel="stylesheet" href="css/game.css?v=1">
</head>
<body>
<canvas id="game-canvas"></canvas>
<div id="controls"></div>

<script>
  window.GAME_CONFIG = {
    id: 'abyss',
    languages: ['en', 'zh-CN'],
  };
</script>
<script src="../../engine/config.js?v=1"></script>
<script src="../../engine/platform.js?v=1"></script>
<script src="../../engine/i18n.js?v=1"></script>
<script src="../../engine/portal.js?v=1"></script>
<script src="../../engine/ads.js?v=1"></script>
<script src="../../engine/audio.js?v=1"></script>
<script src="../../engine/canvas.js?v=1"></script>
<script src="../../engine/input.js?v=1"></script>
<script src="../../engine/controls.js?v=1"></script>
<script src="../../engine/prng.js?v=1"></script>
<script src="js/tiles.js?v=1"></script>
<script src="js/core.js?v=1"></script>
<script src="js/render.js?v=1"></script>
<script src="js/main.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 2: 手动起服看一眼（真验证，不许只看代码就说好）**

Run（仓库根）：`npx http-server -p 8123 &` 然后浏览器/或下一任务的 Playwright 打开 `http://localhost:8123/games/abyssshoot/`
Expected: 看到深海底色 + HOME 覆盖层（标题/副标题/下潜按钮）；console 无报错。

- [ ] **Step 3: 提交**

```bash
git add games/abyssshoot/index.html
git commit -m "feat(abyssshoot): index.html 引擎接线(?v=1 缓存版本)"
```

---

## Task 6: E2E —— Playwright 无头整局跑通 + 截图

**Files:**
- Create: `games/abyssshoot/tests/e2e-p1b.cjs`

自带静态服务器（不依赖外部先起服），Playwright 无头开页 → 断言 HOME → `dispatch('START')` → 连射直到死 → 断言分数/死亡/DEAD 相位 → 重开 → 截图存 `C:\tmp\abyssshoot\`。

> E2E 靠 `window.G` / `window.dispatch`（main.js 的 `var G` + 函数声明使其成为全局）。

- [ ] **Step 1: 写 E2E**

Create `games/abyssshoot/tests/e2e-p1b.cjs`:

```javascript
// e2e-p1b.cjs — Playwright 无头:整局跑通(HOME→射击→连锁→死亡→重开)+ 截图。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');   // 仓库根
const PORT = 8127;
const SHOT_DIR = 'C:\\tmp\\abyssshoot';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
               '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://localhost:${PORT}/games/abyssshoot/`);
  await page.waitForFunction(() => window.G && window.G.phase === 'HOME', { timeout: 8000 });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1-home.png') });
  console.log('OK HOME 渲染');

  // 开局
  await page.evaluate(() => dispatch('START', {}));
  let st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots }));
  if (st.phase !== 'PLAYING') throw new Error('START 后应进 PLAYING,实为 ' + st.phase);
  console.log('OK START → PLAYING');

  // 连射直到死(随机选列,上限保护)
  let guard = 0;
  while (guard++ < 3000) {
    const dead = await page.evaluate(() => {
      if (G.phase !== 'PLAYING') return true;
      dispatch('SHOOT', { col: Math.floor(Math.random() * G.s.cols) });
      return G.phase !== 'PLAYING';
    });
    if (dead) break;
  }
  st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots,
                                    score: G.s.score, maxTile: G.s.maxTile }));
  if (st.phase !== 'DEAD') throw new Error('连射到底应进 DEAD,实为 ' + st.phase);
  if (!st.dead) throw new Error('DEAD 相位下 core 应 dead');
  if (!(st.score > 0)) throw new Error('整局下来分数应 > 0,实为 ' + st.score);
  if (!(st.maxTile >= 4)) throw new Error('整局下来应至少合出过 4,实为 ' + st.maxTile);
  if (!(st.shots > 5)) throw new Error('局长应 > 5 发,实为 ' + st.shots);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-2-dead.png') });
  console.log(`OK 整局跑通:${st.shots} 发 / 分 ${st.score} / 最深 ${st.maxTile} → DEAD`);

  // 重开
  await page.evaluate(() => dispatch('RESTART', {}));
  st = await page.evaluate(() => ({ phase: G.phase, shots: G.s.shots, score: G.s.score }));
  if (st.phase !== 'PLAYING' || st.shots !== 0 || st.score !== 0)
    throw new Error('RESTART 应回到全新 PLAYING 局,实为 ' + JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-3-restart.png') });
  console.log('OK RESTART → 全新一局');

  if (errors.length) throw new Error('页面有 JS 错误:\n' + errors.join('\n'));

  await browser.close();
  srv.close();
  console.log(`e2e-p1b OK (截图在 ${SHOT_DIR})`);
})().catch(e => { console.error('e2e-p1b FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 2: 跑 E2E**

Run: `node games/abyssshoot/tests/e2e-p1b.cjs`
Expected: 依次打印 `OK HOME 渲染` / `OK START → PLAYING` / `OK 整局跑通:…` / `OK RESTART → 全新一局` / `e2e-p1b OK (截图在 C:\tmp\abyssshoot)`，退出码 0。
> 若报 playwright 缺浏览器：`npx playwright install chromium`。

- [ ] **Step 3: 看截图认账（地面真值，别只信日志）**

打开 `C:\tmp\abyssshoot\e2e-1-home.png` 和 `e2e-2-dead.png` 确认：HOME 有标题与按钮；死亡图里**能看到 5 列彩色数字鱼格、死线、炮台 ▲、弹药**，布局没错位/没溢出。若画面明显不对（空白、格子跑出棋盘、数字看不清），**回 Task 3 修 render**。

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/tests/e2e-p1b.cjs
git commit -m "test(abyssshoot): E2E 无头整局跑通(HOME→射击→死亡→重开)+截图"
```

---

## Task 7: 挂 E2E 进脚本 + 全量回归

**Files:**
- Modify: `package.json`（root）

> ⚠ 本仓多会话共用，改根级文件前先 `git status`；只 `git add package.json`，禁 `git add -A`。

- [ ] **Step 1: 加 test:abyss:e2e**

In root `package.json` scripts（放在 `test:abyss` 之后）：

```json
    "test:abyss:e2e": "node games/abyssshoot/tests/e2e-p1b.cjs",
```

> 不要把 e2e 串进顶层 `test`（同 mines/snake 的惯例：e2e 是单独命令，需要浏览器）。

- [ ] **Step 2: 跑单游戏 e2e**

Run: `npm run test:abyss:e2e`
Expected: `e2e-p1b OK`

- [ ] **Step 3: 跑全量 node 测试（确认 P1 逻辑没被碰坏、别的游戏没受影响）**

Run: `npm test`
Expected: mines + snake + abyss 全绿。

- [ ] **Step 4: locale 校验**

Run: `node tools/check-locales.js games/abyssshoot/locales`
Expected: `0 fail`

- [ ] **Step 5: 提交**

```bash
git add package.json
git commit -m "test(abyssshoot): 挂 test:abyss:e2e"
```

---

## Task 8: 更新游戏 CLAUDE.md 的状态段

**Files:**
- Modify: `games/abyssshoot/CLAUDE.md`

P1b 做完后，CLAUDE.md 里「当前状态」那段说的「无 render/main/index.html —— 不可玩」已过时，必须改，否则误导后来者。

- [ ] **Step 1: 改状态段**

把 `games/abyssshoot/CLAUDE.md` 的「## 当前状态（2026-07-10）」整段替换为：

```markdown
## 当前状态（2026-07-11）

**P1 纯逻辑内核 + P1b 可玩壳已完成 —— 浏览器里能真玩了**（仓库根起 http 服 → `http://localhost:8080/games/abyssshoot/`）。
已有：`js/{tiles,core,render,main}.js` + `index.html` + `css/game.css` + `locales/{en,zh-CN}.json`；测试：`npm run test:abyss`（单测+蒙特卡洛）、`npm run test:abyss:e2e`（Playwright 无头整局）。
**还没做**：动画/音效、道具（锤子/交换列/撤销）、图鉴、皮肤、成就、存档续玩、鱼图美术、iOS 壳 —— 见下方「DESIGN 里已定但未实现」与 DESIGN.md 的 P2/P3/P4。
```

同时把「## 验证」段补上 e2e 命令：

```bash
npm run test:abyss                          # 单测(tiles+core) + 蒙特卡洛冒烟,已挂进全量 npm test
npm run test:abyss:e2e                      # Playwright 无头:整局跑通 + 截图到 C:\tmp\abyssshoot
node games/abyssshoot/tests/test-core.js    # 单跑 core 单测
node games/abyssshoot/tests/test-sim.js     # 单跑蒙特卡洛(300 局)
node tools/check-locales.js games/abyssshoot/locales   # 必 0 fail
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/CLAUDE.md
git commit -m "docs(abyssshoot): CLAUDE.md 状态更新为「P1b 可玩」"
```

---

## Self-Review（写完自查）

- **Spec 覆盖**（DESIGN §8 P1b 隐含范围 + 引擎契约）：locales✓(T1)、css✓(T2)、renderAll 契约含 clearHits/addHit✓(T3)、G+dispatch+boot 契约✓(T4)、index.html 加载顺序+`?v=1`✓(T5)、E2E 真验证+截图认账✓(T6)、脚本挂载+全量回归✓(T7)、文档状态同步✓(T8)。P2/P3 的道具/图鉴/皮肤/成就/存档/音效明确不在本计划，非缺口。
- **占位扫描**：无 TBD/TODO/占位，每步含真实代码与确切命令/预期。
- **类型/命名一致**：`G.phase`(HOME/PLAYING/DEAD)、`G.s`(core 状态)、`dispatch(action,data)`、`renderAll()`、`newGame()`、`layout(s)`、`drawTile(x,y,cell,v)`、`PAL`、动作名 `START/RESTART/SHOOT{col}` 全程一致；core API 用的是 P1 已实现的真实签名（`Core.createGame`/`Core.shoot`/`Tiles.tierOf`/`Tiles.fmt`）。
- **契约风险点已显式标注**：`G` 必须 `var`（否则 E2E 读不到 `window.G`）、locale 必须嵌套（扁平会静默失败）、`?v=N` 铁律、加载顺序 load-bearing、回合制无 RAF。
