// ════════════════════════════════════════
// e2e-render.cjs —— 渲染层的门禁（P2a Task 5）。⭐ **核心是「灰度可辨」那一节**。
//
// 为什么必须是真浏览器 + 真像素：
//   DESIGN §6.2 那条「两方棋子转成灰度也必须一眼分清」是**验收判据**，不是建议。
//   判据只能量出来 —— 「我画了两种造型」这句话本身证明不了任何事，而它坏掉的方式是**静默**的
//   （某次调色/加高光把两枚都调成中灰、或把环填实，画面照样好看，色弱玩家一局就卸载）。
//   ⇒ 这里起真 Chromium、画真盘面、`getImageData` 取真像素、转灰度、**按形状**判定。
//
// ⭐⭐ 为什么不能只比平均亮度（本文件最容易被写坏的一处）：
//   双编码的重点是**形状**。「灰度均值差 200」只证明这一版配色对比强，
//   下一版换个皮肤（深色主题）就可能归零，而形状是永远在的。所以主判据是三条**形状**指标：
//     ① 覆盖率（ink 占格子的比例）：实心六边形 ≈ 0.54 vs 圆环 ≈ 0.30
//     ② 空心判据：圆环**中心是背景**（|Δbg| 小），六边形中心是实心（|Δbg| 大）
//     ③ 剪影 IoU：两枚棋子的 ink 掩码交并比必须低 —— **这一条与颜色完全无关**，
//        哪怕把两方调成同一个灰度值它也照样成立
//   亮度差只作为**冗余**断言（有当然更好），⛔ 不是它在承重。
//
// ⚠ E2E 性质（起浏览器）⇒ 照本仓惯例单独挂 script（`npm run test:c4:render`），
//   ⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2a\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8323;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2a');

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  \u2717 ' + m); failed++; } else console.log('  \u2713 ' + m); };
const n2 = v => (Math.round(v * 1000) / 1000).toFixed(3);

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, p);
      if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error('端口 ' + PORT + ' 被占用') : e));
    srv.listen(PORT, () => res(srv));
  });
}

// ─────────── node 侧夹具：盘面由**真 bitboard** 重放出来，⛔ 不手搓掩码 ───────────
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');

const MID  = [3, 3, 4, 2, 4, 5, 2, 1, 5, 4, 2, 6];             // 中局：两方各 6 子
const WIN  = [3, 0, 4, 1, 5, 0, 2];                             // 先手底行 2-5 横四连
const HOVER = MID;

/** 把盘面压成 render 只读的那三样（a/b/h），跨进程传给浏览器。 */
const wire = moves => { const bd = B.fromMoves(moves); return { a: bd.a, b: bd.b, h: bd.h, n: bd.n }; };

/** 暴力找出赢家的那四格（rules-classic 只回「谁赢了」，不回连线）。 */
function findWinLine(moves) {
  const bd = B.fromMoves(moves);
  const w = B.winner(bd);
  if (w === null) throw new Error('夹具 WIN 竟然没有赢家');
  const m = w === 0 ? bd.a : bd.b;
  const has = (c, r) => c >= 0 && c < 7 && r >= 0 && r < 6 && ((m[c] >> r) & 1);
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) for (const [dc, dr] of DIRS) {
    const cells = [0, 1, 2, 3].map(k => ({ c: c + dc * k, r: r + dr * k }));
    if (cells.every(p => has(p.c, p.r))) return { winner: w, line: cells };
  }
  throw new Error('找不到连线（winner 与掩码对不上？）');
}

(async () => {
  // 前提写成断言：夹具必须真的是（非）终局，别让夹具坏了被读成被测代码坏了
  if (R.terminal(B.fromMoves(MID)) !== null) throw new Error('夹具 MID 必须是非终局');
  const wl = findWinLine(WIN);
  console.log('夹具：MID n=' + B.fromMoves(MID).n + ' 非终局；WIN 赢家=' + wl.winner
    + ' 连线=' + JSON.stringify(wl.line.map(p => [p.c, p.r])));

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  // ⚠ `GameGlobal` / `ctx` / `CFG` / `Input` 在 canvas.js 等文件里是**顶层 const/let**
  //   ⇒ 是全局**词法绑定**，不是 window 的属性：`window.GameGlobal` 恒 undefined，
  //   裸标识符 `GameGlobal` 才拿得到（与 tests/test-browser-globals.js 记的 PRNG 同一条坑，
  //   第一版这里写成 window.GameGlobal，表现是「等到超时」而不是报错）。
  //   反过来 `C4Render` 是 `root.X = API` ⇒ 必须走 window/裸名都行。
  await page.waitForFunction(() => window.C4Render && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0,
    null, { timeout: 8000 });

  // main.js 的 renderAll 会把标题屏重画上来（resize / i18n / dispatch 时）——
  // 本文件自己控制画面，先把它按住。⚠ 顶层 function 声明是 window 的属性，覆盖得掉。
  await page.evaluate(() => { window.__realRenderAll = window.renderAll; window.renderAll = () => {}; });

  // 画一帧的统一入口（每次都 clearHits + 从零重画，与引擎的立即模式契约一致）
  const paint = async spec => page.evaluate(s => {
    clearHits();
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    C4Render.drawBackground(L);
    C4Render.drawBoard(s.bd, Object.assign({ L }, s.opts));
    C4Render.drawHUD(s.hud, L);
    window.__L = L;
    return { hud: L.hud, drop: L.drop, cell: L.cell, boardX: L.boardX, boardY: L.boardY,
             boardW: L.boardW, boardH: L.boardH, safeTop: L.safeTop, ctrlH: L.ctrlH,
             colHits: L.colHits };
  }, spec);

  const shot = async name => { await page.screenshot({ path: path.join(SHOT_DIR, name) }); return name; };
  /** 把当前 canvas 转灰度另存一张（⭐ 肉眼验收那一张，也是判据量的那个空间）。 */
  const shotGray = async name => {
    const data = await page.evaluate(() => {
      const cv = document.getElementById(CFG.canvasId);
      const o = document.createElement('canvas');
      o.width = cv.width; o.height = cv.height;
      const c2 = o.getContext('2d');
      c2.filter = 'grayscale(1)';
      c2.drawImage(cv, 0, 0);
      return o.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(data.split(',')[1], 'base64'));
    return name;
  };

  // ═══════════ ① 布局：HUD 必须在 safeTop **和 #controls** 之下 ═══════════
  console.log('\n① 布局 / HUD 安全区');
  const L1 = await paint({
    bd: wire(MID),
    opts: { hoverCol: null },
    hud: { turn: 0, left: 'Your turn', right: 'Move 12' }
  });
  const ctrlBox = await page.evaluate(() => {
    const r = document.getElementById('controls').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  ok(L1.hud.y >= L1.safeTop, 'HUD 在 safeTop 之下（hud.y=' + L1.hud.y + ' >= safeTop=' + L1.safeTop + '）');
  // ⭐ 真正咬人的那条：右上角是 #controls（fixed / z-index 20）的地盘，画进去不但被盖住、
  //   **而且点不动**（solitaire 实踩）。这里拿**真实 DOM 的矩形**去比，不是比常数。
  const overlap = !(L1.hud.y >= ctrlBox.y + ctrlBox.h || L1.hud.y + L1.hud.h <= ctrlBox.y
                 || L1.hud.x >= ctrlBox.x + ctrlBox.w || L1.hud.x + L1.hud.w <= ctrlBox.x);
  ok(!overlap, 'HUD 与 DOM #controls 零重叠（controls y=' + Math.round(ctrlBox.y) + '..'
    + Math.round(ctrlBox.y + ctrlBox.h) + '，hud y=' + L1.hud.y + '..' + (L1.hud.y + L1.hud.h) + '）');
  ok(L1.boardY + L1.boardH <= 896, '盘体没掉出屏幕底（底边 ' + (L1.boardY + L1.boardH) + ' <= 896）');

  // 刘海机型（灵动岛 59）下同样成立 —— safeTop 写死 44 的实现会在这里露馅
  const notch = await page.evaluate(() => {
    GameGlobal.__forceSafeTop = 59;
    const st = Math.max(44, GameGlobal.__forceSafeTop);
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH, st, 0);
    delete GameGlobal.__forceSafeTop;
    return { hudY: L.hud.y, st, bottom: L.boardY + L.boardH };
  });
  ok(notch.hudY >= notch.st + L1.ctrlH, '灵动岛(safeTop=59)下 HUD 仍在顶栏之下（hud.y=' + notch.hudY + '）');
  ok(notch.bottom <= 896, '灵动岛下盘体仍不出屏（底边 ' + notch.bottom + '）');

  // ═══════════ ② 整列一个热区（⛔ 不是每格一个），且真实鼠标点得到 ═══════════
  console.log('\n② 列热区');
  const hits = await page.evaluate(() => {
    const L = window.__L;
    const out = [];
    for (let c = 0; c < 7; c++) {
      const r = L.colHits[c];
      const mid = hitTest(r.x + r.w / 2, r.y + r.h / 2);          // 悬停带 → 盘底 的中点
      const top = hitTest(r.x + r.w / 2, L.drop.y + 4);           // 悬停带里
      const bot = hitTest(r.x + r.w / 2, L.boardY + L.boardH - 4);// 盘体最底行
      out.push([mid && mid.action, mid && mid.data.col, top && top.data.col, bot && bot.data.col]);
    }
    return out;
  });
  let hitOK = true;
  for (let c = 0; c < 7; c++) {
    const h = hits[c];
    if (h[0] !== 'COL' || h[1] !== c || h[2] !== c || h[3] !== c) { hitOK = false; console.error('    列 ' + c + ' → ' + JSON.stringify(h)); }
  }
  ok(hitOK, '7 列各一个热区，列顶/中/底三点都命中同一列（action=COL, data.col=c）');

  // ⭐ 真实鼠标点击（不是模拟 hitTest）——「唯一入口点不动」这类事只有真点才抓得出来
  await page.evaluate(() => { window.__clicks = []; Input.bind({ onAction: (a, d) => window.__clicks.push(a + ':' + d.col) }); });
  for (const c of [0, 3, 6]) {
    const r = L1.colHits[c];
    await page.mouse.click(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
  }
  const clicks = await page.evaluate(() => Array.from(new Set(window.__clicks)));
  ok(JSON.stringify(clicks) === JSON.stringify(['COL:0', 'COL:3', 'COL:6']),
    '真实鼠标点击第 0/3/6 列 → ' + JSON.stringify(clicks));

  // ═══════════ ③ ⭐⭐ 灰度可辨（DESIGN §6.2 的验收判据） ═══════════
  console.log('\n③ ⭐ 双编码 / 灰度可辨');
  await paint({ bd: wire(MID), opts: {}, hud: { turn: 0, left: 'Your turn', right: 'Move 12' } });
  const shots = [];
  shots.push(await shot('01-midgame-color.png'));
  shots.push(await shotGray('02-midgame-gray.png'));

  const gm = await page.evaluate(bd => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = window.__L;
    const dpr = cv.width / GameGlobal.SW;              // getImageData 用的是设备像素
    const S = Math.round(L.cell * dpr);
    const GRAY = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

    /** 取一格的灰度矩阵（S×S）。 */
    function cellGray(c, r) {
      const x = Math.round(L.cellX(c) * dpr), y = Math.round(L.cellY(r) * dpr);
      const d = g2.getImageData(x, y, S, S).data;
      const out = new Float64Array(S * S);
      for (let i = 0; i < S * S; i++) out[i] = GRAY(d, i * 4);
      return out;
    }
    const owner = (c, r) => C4Render.cellOwner(bd, c, r);

    // 空格（井）的基准灰度：取所有空格的中心区均值
    let bgSum = 0, bgN = 0;
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      if (owner(c, r) !== -1) continue;
      const m = cellGray(c, r);
      for (let i = 0; i < S * S; i++) { bgSum += m[i]; bgN++; }
    }
    const bg = bgSum / bgN;
    const TH = 25;                                     // ink 阈值（抗抗锯齿）

    const res = {};
    for (const p of [0, 1]) {
      const cells = [];
      for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) if (owner(c, r) === p) cells.push([c, r]);
      const acc = new Float64Array(S * S);             // ink 命中次数
      let sum = 0, cover = 0, centerSum = 0;
      for (const [c, r] of cells) {
        const m = cellGray(c, r);
        for (let i = 0; i < S * S; i++) {
          sum += m[i];
          if (Math.abs(m[i] - bg) > TH) { acc[i]++; cover++; }
        }
        // 中心 3×3 的均值（空心判据）
        const mid = Math.floor(S / 2);
        let cs = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cs += m[(mid + dy) * S + mid + dx];
        centerSum += cs / 9;
      }
      const mask = new Uint8Array(S * S);              // 共识剪影：过半格子都是 ink
      let maskN = 0;
      for (let i = 0; i < S * S; i++) if (acc[i] * 2 > cells.length) { mask[i] = 1; maskN++; }
      // ⑤ 要拿它当「赢局那一帧里剪影有没有被光效吃掉」的参照 ⇒ 存下来
      (window.__ref = window.__ref || { S: S, bg: bg })[p] = Array.from(mask);
      res[p] = {
        n: cells.length,
        mean: sum / (cells.length * S * S),
        coverage: cover / (cells.length * S * S),
        center: centerSum / cells.length,
        mask, maskN
      };
    }
    let inter = 0, uni = 0;
    for (let i = 0; i < S * S; i++) {
      const a = res[0].mask[i], b = res[1].mask[i];
      if (a && b) inter++;
      if (a || b) uni++;
    }
    return {
      bg, S, dpr, iou: uni ? inter / uni : 1,
      p0: { n: res[0].n, mean: res[0].mean, coverage: res[0].coverage, center: res[0].center, maskFrac: res[0].maskN / (S * S) },
      p1: { n: res[1].n, mean: res[1].mean, coverage: res[1].coverage, center: res[1].center, maskFrac: res[1].maskN / (S * S) }
    };
  }, wire(MID));

  console.log('  实测（灰度 0..255，格 ' + gm.S + '×' + gm.S + ' 设备像素，空格基准 bg=' + n2(gm.bg) + '）：');
  console.log('    先手 六边形  n=' + gm.p0.n + ' 覆盖率=' + n2(gm.p0.coverage) + ' 中心=' + n2(gm.p0.center)
    + '(|Δbg|=' + n2(Math.abs(gm.p0.center - gm.bg)) + ') 均值=' + n2(gm.p0.mean));
  console.log('    后手 圆环    n=' + gm.p1.n + ' 覆盖率=' + n2(gm.p1.coverage) + ' 中心=' + n2(gm.p1.center)
    + '(|Δbg|=' + n2(Math.abs(gm.p1.center - gm.bg)) + ') 均值=' + n2(gm.p1.mean));
  console.log('    剪影 IoU=' + n2(gm.iou));

  const d0 = Math.abs(gm.p0.center - gm.bg), d1 = Math.abs(gm.p1.center - gm.bg);
  // ── 主判据：形状（与配色无关）──
  ok(gm.p0.coverage - gm.p1.coverage >= 0.15,
    '① 覆盖率差 ' + n2(gm.p0.coverage - gm.p1.coverage) + ' >= 0.15（实心 vs 中空）');
  ok(d1 < 25, '② 圆环**中心是背景**（|Δbg|=' + n2(d1) + ' < 25 ⇒ 真的是空心）');
  ok(d0 > 45, '② 六边形中心是实心（|Δbg|=' + n2(d0) + ' > 45）');
  ok(d0 > d1 * 3, '② 中心对比度差 ' + n2(d0 / Math.max(d1, 0.001)) + '× > 3×');
  ok(gm.iou < 0.60, '③ 剪影 IoU=' + n2(gm.iou) + ' < 0.60（**与颜色无关**：两方调成同一灰度也成立）');
  // ── 冗余判据：亮度（有更好，⛔ 不是它在承重）──
  ok(Math.abs(gm.p0.mean - gm.p1.mean) >= 40,
    '④ 冗余：灰度均值差 ' + n2(Math.abs(gm.p0.mean - gm.p1.mean)) + ' >= 40');
  ok(Math.abs(gm.p0.mean - gm.bg) >= 20 && Math.abs(gm.p1.mean - gm.bg) >= 20,
    '⑤ 两方都与空格拉得开（|Δbg| = ' + n2(Math.abs(gm.p0.mean - gm.bg)) + ' / '
    + n2(Math.abs(gm.p1.mean - gm.bg)) + ' >= 20 ⇒ 灰度下也看得出「有没有子」）');

  // ═══════════ ④ 悬停预览：半透明棋子 + 落点虚影 ═══════════
  console.log('\n④ 悬停预览（DESIGN §6.1）');
  const HCOL = 4;
  const landing = await page.evaluate(a => C4Render.landingRow(a.bd, a.c), { bd: wire(HOVER), c: HCOL });
  await paint({
    bd: wire(HOVER),
    opts: { hoverCol: HCOL, hoverPlayer: 0 },
    hud: { turn: 0, left: 'Hold to preview', right: 'Column 5' }
  });
  shots.push(await shot('03-hover.png'));
  // 判据（三条，⚠ 第二条最容易被写成假的）：
  //   a) 悬停带那一列真的多画了东西（对照同一帧的无悬停版本）
  //   b) ⭐ **落点虚影**：拿落点格与它**正上方那个同样空、同样被列高亮染过**的格子比 ——
  //      ⛔ 别拿「落点格 vs 无悬停版本」比：整列高亮本身就会让每个像素都变，那条断言
  //      在虚影被删掉之后**照样绿**（= 一条没验过的注释）。
  //   c) 别的列没被动
  const hoverDiff = await page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = window.__L;
    const dpr = cv.width / GameGlobal.SW;
    const grab = (x, y, w, h) => g2.getImageData(Math.round(x * dpr), Math.round(y * dpr), Math.round(w * dpr), Math.round(h * dpr)).data;
    const box = c => [L.cellX(c), L.drop.y, L.cell, L.drop.h];
    const cellBox = (c, r) => [L.cellX(c), L.cellY(r), L.cell, L.cell];
    const diff = (x, y) => { let n = 0; for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 8 || Math.abs(x[i + 1] - y[i + 1]) > 8 || Math.abs(x[i + 2] - y[i + 2]) > 8) n++; return n / (x.length / 4); };

    const withHover = {
      drop: grab(...box(a.c)), dropOther: grab(...box(a.other)),
      land: grab(...cellBox(a.c, a.r)), above: grab(...cellBox(a.c, a.r + 1))
    };
    // 重画一帧：同样的盘面、**不带** hoverCol（对照组）
    clearHits();
    const L2 = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    C4Render.drawBackground(L2); C4Render.drawBoard(a.bd, { L: L2 });
    const without = {
      drop: grab(...box(a.c)), dropOther: grab(...box(a.other)),
      land: grab(...cellBox(a.c, a.r)), above: grab(...cellBox(a.c, a.r + 1))
    };
    return {
      drop: diff(withHover.drop, without.drop),
      other: diff(withHover.dropOther, without.dropOther),
      ghost: diff(withHover.land, withHover.above),     // ⭐ 同一帧、同一列的两个空格
      ctrl: diff(without.land, without.above)           // 对照：没悬停时这两格应该几乎一样
    };
  }, { bd: wire(HOVER), c: HCOL, r: landing, other: (HCOL + 2) % 7 });
  ok(landing >= 0 && landing + 1 < 6, '第 ' + HCOL + ' 列的落点行 = ' + landing + '（h[c] 现算，不是猜的）');
  ok(hoverDiff.drop > 0.10, '悬停带该列画了半透明棋子（该列像素变化 ' + n2(hoverDiff.drop) + ' > 0.10）');
  ok(hoverDiff.ctrl < 0.03, '对照：不悬停时落点格与它上面那格几乎一样（' + n2(hoverDiff.ctrl) + ' < 0.03）');
  ok(hoverDiff.ghost > 0.15, '⭐ 落点格画了虚影（与同列上方空格差 ' + n2(hoverDiff.ghost)
    + ' > 0.15，且已排除整列高亮的影响）');
  ok(hoverDiff.other < 0.02, '别的列没被动（变化 ' + n2(hoverDiff.other) + ' < 0.02 ⇒ 预览确实只指这一列）');

  // ═══════════ ⑤ 赢局：连线 + 发光 + 其余变暗 ═══════════
  console.log('\n⑤ 赢局呈现（DESIGN §6.3）');
  await paint({
    bd: wire(WIN),
    opts: { winLine: wl.line, dim: true },
    hud: { turn: wl.winner, left: 'You win', right: 'Move 7' }
  });
  shots.push(await shot('04-win.png'));
  shots.push(await shotGray('05-win-gray.png'));
  const winMetrics = await page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = window.__L;
    const dpr = cv.width / GameGlobal.SW;
    const GRAY = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const meanOf = (c, r) => {
      const d = g2.getImageData(Math.round(L.cellX(c) * dpr), Math.round(L.cellY(r) * dpr),
                               Math.round(L.cell * dpr), Math.round(L.cell * dpr)).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += GRAY(d, i);
      return s / (d.length / 4);
    };
    const winCells = a.line.map(p => meanOf(p.c, p.r));
    // 参照：连线之外、**同一方**的一枚子（有的话），以及一个空格
    const others = [];
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      if (a.line.some(p => p.c === c && p.r === r)) continue;
      others.push({ c, r, own: C4Render.cellOwner(a.bd, c, r), g: meanOf(c, r) });
    }
    // 连线中点（两枚棋子**之间**的缝）应该被那条白线穿过
    const m0 = L.center(a.line[0].c, a.line[0].r), m1 = L.center(a.line[1].c, a.line[1].r);
    const mx = Math.round((m0.x + m1.x) / 2 * dpr), my = Math.round((m0.y + m1.y) / 2 * dpr);
    const seam = g2.getImageData(mx - 2, my - 2, 5, 5).data;
    let seamMax = 0; for (let i = 0; i < seam.length; i += 4) seamMax = Math.max(seamMax, GRAY(seam, i));
    // ⭐⭐ 赢的那四枚**剪影还在不在**（这一条是肉眼验收抓出来的 bug 固化成的门禁）：
    //   第一版把粗白连线和一圈**圆形**光晕画在棋子最上面 ⇒ 四枚六边形被完全盖住、
    //   还长得像四个圆环（对手的造型）。而当时的亮度类断言**全绿**——因为光效正好把亮度抬上去了。
    //   ⇒ 判据必须是**形状**：拿赢局那一帧里四枚的共识剪影，去比同一枚棋子在平时那一帧的剪影。
    const ref = window.__ref, S = ref.S, bgRef = ref.bg, TH = 25;
    const GR = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const acc = new Int32Array(S * S);
    for (const p of a.line) {
      const d = g2.getImageData(Math.round(L.cellX(p.c) * dpr), Math.round(L.cellY(p.r) * dpr), S, S).data;
      for (let i = 0; i < S * S; i++) if (Math.abs(GR(d, i * 4) - bgRef) > TH) acc[i]++;
    }
    const rm = ref[a.winner];
    let inter = 0, uni = 0;
    for (let i = 0; i < S * S; i++) {
      const w = acc[i] * 2 > a.line.length ? 1 : 0;
      if (w && rm[i]) inter++;
      if (w || rm[i]) uni++;
    }
    return { winCells, emptyDim: others.filter(o => o.own === -1).map(o => o.g), seamMax,
             shapeIoU: uni ? inter / uni : 0 };
  }, { bd: wire(WIN), line: wl.line, winner: wl.winner });
  const emptyDimAvg = winMetrics.emptyDim.reduce((a, b) => a + b, 0) / winMetrics.emptyDim.length;
  ok(emptyDimAvg < gm.bg - 15, '其余变暗了（赢局空格均值 ' + n2(emptyDimAvg) + ' < 平时 ' + n2(gm.bg) + ' − 15）');
  ok(winMetrics.seamMax > 200, '⭐ 连线画出来了（两枚赢子之间的缝里最亮 ' + n2(winMetrics.seamMax) + ' > 200）');
  ok(winMetrics.winCells.every(g => g > emptyDimAvg), '四枚赢子没被 dim 吃掉（各格均值 '
    + winMetrics.winCells.map(n2).join(' / ') + ' 都 > ' + n2(emptyDimAvg) + '）');
  ok(winMetrics.shapeIoU > 0.60, '⭐⭐ 赢的四枚**剪影还是它自己**（与平时那一帧的同款棋子 IoU='
    + n2(winMetrics.shapeIoU) + ' > 0.60）—— 连线/光晕不许把棋子盖掉或画成对手的造型');

  // ═══════════ ⑥ 页面零报错 ═══════════
  ok(errs.length === 0, '页面零 JS 报错' + (errs.length ? '：' + errs.join(' | ') : ''));

  await browser.close();
  srv.close();

  console.log('\n截图（肉眼逐张验收）：' + SHOT_DIR);
  shots.forEach(s => console.log('  · ' + s));
  if (failed) { console.error('\ne2e-render: ' + failed + ' 条断言失败'); process.exit(1); }
  console.log('\ne2e-render: 全部通过');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
