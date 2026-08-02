// ════════════════════════════════════════
// e2e-p2b-t6.cjs —— P2b **Task 6** 的端到端门禁：
//   · DESIGN §6.8 **减弱动态**（三态：跟随系统 / 强制开 / 强制关）+ **舒适模式**（大字 + 更大点击窗）
//   · DESIGN §6.6 **让「输」不疼**（版面与措辞那一半 + 零搜索的「你差一手就赢了」）
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b / t4 / t5 同一条纪律：**一次都不许调 `dispatch()` / `applyMove()`**，
//   落子与点开关一律 `page.mouse`，落点一律按热区的 action 名取（⛔ 零绝对坐标）。
//
// ⭐⭐ 本文件的核心判据是**像素与帧**，不是标志位：
//   「减弱动态开着」这个布尔量绿了什么都不说明 —— 要证的是**画面真的不动了**：
//   连拍多帧量棋子的 y / 连线的可见长度 / 光环的 ink，
//   并且**每一条都配一条反向对照**（关掉时它们确实在动 —— 否则「不动」是恒真的）。
//
// 覆盖：
//   ① 加载零报错 · 新字段的默认值（reduceMotion='auto' · comfort=false）都在 defaults 里
//   ② ⭐⭐ **落子动画**：减弱动态开 ⇒ 连拍 12 帧棋子 y **纹丝不动**且第一帧就在格心；
//        ⛔ 反向对照：同一列、同一份代码，关掉时那 12 帧确实在往下掉
//   ③ ⭐⭐ **赢局动画**：开 ⇒ 第一帧连线就是**整条**、overReady 立刻为真、连拍 8 帧长度不变；
//        ⛔ 反向对照：关掉时长度逐帧在长
//        ⭐ 必要反馈没被一起关掉：赢的四枚**发光**、其余**变暗**（同一帧的亮度对比）
//   ④ ⭐⭐ **双威胁光环**：开 ⇒ 那两格 ink 回到空井水平（连拍 8 帧都是）；
//        ⛔ 反向对照：关掉时同一局面同一两格 ink ≫ 0
//        ⭐ **fork 音照响**（⛔ 减弱动态针对的是视觉运动，不许顺手把音一起关掉）
//   ⑤ ⭐ **威胁标记不吃这个门**（render.js drawThreat 那段 ⭐⭐）：减弱动态开着时 ▲/◇ 仍然在
//        —— 同一个局面、同一份设置，只有 threatHints 不同的两次实验
//   ⑥ ⭐⭐ **三态**：emulateMedia 把系统设成 reduce，'auto' 跟着开、**'off' 压过系统**（真落一子看 y）
//   ⑦ ⭐ **持久化**：三态每一档 + comfort 都过一次**真的刷新**，判据一律取**非默认值**方向
//   ⑧ ⭐ **舒适模式**：像素量字号确实变大 + 热区确实变高 +
//        **真实鼠标点一个「普通模式下不属于这个按钮」的像素**，舒适模式下必须点得中
//   ⑨ ⭐ **§6.6 让输不疼**：HUD 上没有「你输了」· 结算多出精准度/转折点的**留位** ·
//        ［从那一步重来］是 disabled 的留位（⛔ 不注册热区 = 不是假按钮）·
//        ⭐ 「你差一手就赢了」只在**真的成立**时才出现（两个确定性夹具正反对照 + 像素）
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script（进 `npm run test:c4:p2b`），⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2b\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const Th = require('../js/threats.js');
const AI = require('../js/ai.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8336;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2b');

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  \u2717 ' + m); failed++; } else console.log('  \u2713 ' + m); };
const n3 = v => (Math.round(v * 1000) / 1000).toFixed(3);

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

// ─────────── node 侧夹具（⛔ 手搓掩码不算数，一律 bitboard 重放）───────────
// 斜线四连（e2e-p2b 用的同一条）：⑧ 的赢局帧要一条**斜线**——竖线上相邻两枚的缝只有
// 0.09 格宽，连线的白芯几乎全被棋子盖住，量不出「画到哪儿了」。
const DIAG = [0, 1, 1, 2, 3, 2, 2, 3, 4, 3];
const DIAG_WIN = 3;
// 双威胁（t5 的同一个夹具）：X 的三连两端都开着 ⇒ (1,1) 与 (5,1) 两个落点。
const FIX_FORK = [1, 2, 2, 4, 4, 3, 3, 4, 5];
// ⭐ §6.6②「你差一手就赢了」的**正反两个**确定性夹具（同机双人局，逐手真实鼠标）：
//   NEAR：X 底行 1/2/3 三连、两端都开着，第 7 手他却去了第 5 列 ⇒ 输方确实差过一手
//   NONE：同样是 O 赢，但 X 的三连是在**最后一手**才连起来的 ⇒ 他从没站在制胜点前面
//         （⚠ 这一局的**终局盘**上 winningMoves 非空 —— 正是「少了 terminal 前置」会说假话的地方）
const FIX_NEAR = [1, 6, 2, 6, 3, 6, 5, 6];
const FIX_NONE = [2, 0, 4, 0, 6, 0, 3, 0];

// ═══════════ node 侧：怎么**故意输掉**一局（⑨ 要一张真的人机输局结算帧）═══════════
// ⚠ 与 e2e-p2b ⑬ 同一套：人这一侧「⛔ 绝不自己连四 → 优先送给 AI 一个立刻能连四的机会」，
//   AI 的回答是纯函数 ⇒ 整条线离线就能验完，⛔ 不靠「多打几局总会输」的运气。
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const legal = bd => ORDER.filter(c => B.canPlay(bd, c));
function dfsLose(moves, depth, human, tier, seed, st) {
  const bd = B.fromMoves(moves);
  const cand = legal(bd).map(c => {
    const b1 = B.fromMoves(moves.concat([c]));
    return { c: c, self: B.winner(b1) === human, gift: R.winningMoves(b1).length };
  }).filter(x => !x.self).sort((a, b) => b.gift - a.gift);
  for (const x of cand) {
    const m1 = moves.concat([x.c]);
    if (B.isFull(B.fromMoves(m1))) continue;
    if (++st.n > st.budget) return null;
    const m2 = m1.concat([AI.aiMove(m1, tier, seed)]);
    const w = B.winner(B.fromMoves(m2));
    if (w !== null && w !== human) return [x.c];
    if (w !== null || B.isFull(B.fromMoves(m2)) || depth === 1) continue;
    const rest = dfsLose(m2, depth - 1, human, tier, seed, st);
    if (rest) return [x.c].concat(rest);
  }
  return null;
}
function planLoss(moves, tier, seed, human) {
  for (let d = 2; d <= 6; d++) {
    const st = { n: 0, budget: 60000 };
    const r = dfsLose(moves, d, human, tier, seed, st);
    if (r) return r[0];
    if (st.n > st.budget) break;
  }
  const bd = B.fromMoves(moves);
  const ls = legal(bd);
  for (const c of ls) if (B.winner(B.fromMoves(moves.concat([c]))) !== human) return c;
  return ls[0];
}

(async () => {
  // ─── 夹具自证（⛔ 别让夹具坏了被读成被测代码坏了）───
  for (const mv of [DIAG, FIX_FORK]) {
    if (R.terminal(B.fromMoves(mv)) !== null) throw new Error('夹具必须非终局：' + JSON.stringify(mv));
  }
  const TF = Th.forkOf(B.fromMoves(FIX_FORK.slice(0, -1)), B.fromMoves(FIX_FORK));
  if (!TF) throw new Error('FIX_FORK 最后一手必须形成双威胁');
  for (const mv of [FIX_NEAR, FIX_NONE]) {
    if (R.terminal(B.fromMoves(mv)) !== R.WIN[1]) throw new Error('夹具必须是后手赢：' + JSON.stringify(mv));
    for (let i = 1; i < mv.length; i++) {
      if (R.terminal(B.fromMoves(mv.slice(0, i))) !== null) throw new Error('夹具中途终局：' + JSON.stringify(mv));
    }
  }
  const NEAR_T = Th.missedWin(FIX_NEAR, 0);
  if (!NEAR_T || NEAR_T.ply !== 7) throw new Error('FIX_NEAR 的输方必须在第 7 手差一手就赢');
  if (Th.missedWin(FIX_NONE, 0) !== null) throw new Error('FIX_NONE 的输方必须从没差过一手');
  if (R.winningMoves(B.fromMoves(FIX_NONE)).length === 0) {
    throw new Error('FIX_NONE 的**终局盘**上必须仍有「制胜手」—— 那正是要挡的陷阱，否则这条对照太软');
  }
  console.log('夹具：NEAR 输方第 ' + NEAR_T.ply + ' 手有制胜列 ' + JSON.stringify(NEAR_T.cols)
    + ' · NONE 输方全程没有过（但终局盘上 winningMoves='
    + JSON.stringify(R.winningMoves(B.fromMoves(FIX_NONE))) + ' —— 陷阱在）');
  console.log('      FORK 两格 ' + JSON.stringify(TF.cells.map(c => [c.c, c.r])));

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  async function pt(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action !== a.action) continue;
        if (a.key !== null && h.data[a.key] !== a.val) continue;
        return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action + (key ? ' ' + key + '=' + val : ''));
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }
  const rectOf = async action => {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        if (hitAreas[i].action === a) {
          const h = hitAreas[i];
          return { x: h.x, y: h.y, w: h.w, h: h.h };
        }
      }
      return null;
    }, action);
    if (!r) throw new Error('找不到热区 action=' + action);
    return r;
  };
  const hasHit = action => page.evaluate(a => hitAreas.some(h => h.action === a), action);
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };

  async function playCol(col, timeout) {
    const before = await page.evaluate(() => G.g.moves.length);
    await clickAt(await pt('COL', 'col', col));
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: timeout || 6000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  }
  /** ⚠ 走完把鼠标挪到盘外并重画：悬停高亮/落点虚影会污染像素判据。 */
  async function settle() {
    await page.mouse.move(5, 5);
    await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await clickAt(await pt('HOME'));
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function newHumanGame() {
    await goHome();
    await clickAt(await pt('PLAY_HUMAN'));
    await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human' && G.g.moves.length === 0,
      null, { timeout: 4000 });
  }
  /** ⚠ 一律用**真实鼠标**点那一行设置（⛔ 不许 C4Settings.set 抄近路：那样测的就不是 UI 了）。 */
  async function setMotion(target) {
    await goHome();
    for (let i = 0; i < 4; i++) {
      if (await page.evaluate(() => C4Settings.get('reduceMotion')) === target) return;
      await clickAt(await pt('CYCLE_MOTION'));
    }
    throw new Error('点不到 reduceMotion=' + target);
  }
  async function setComfort(on) {
    await goHome();
    if (await page.evaluate(() => C4Settings.get('comfort')) !== on) {
      await clickAt(await pt('TOGGLE_COMFORT'));
    }
    if (await page.evaluate(() => C4Settings.get('comfort')) !== on) throw new Error('点不到 comfort=' + on);
  }
  async function setHints(on) {
    await goHome();
    if (await page.evaluate(() => C4Settings.get('threatHints')) !== on) {
      await clickAt(await pt('TOGGLE_HINTS'));
    }
    if (await page.evaluate(() => C4Settings.get('threatHints')) !== on) throw new Error('点不到 hints=' + on);
  }

  // ⭐⭐ 采样器 A：连拍 N 帧，量某一列里**深色像素的质心 y**（先手是近墨黑的实心六边形，
  //   gray≈27；井 90 / 盘体 114 / 页面 240 ⇒ 阈值 45 只圈得住它）。
  //   ⚠ 每一帧都**强制 renderAll 重画**：不重画的话「y 不再变」是恒真的（那是反向对照，不能恒真）。
  const dropSampler = a => new Promise(resolve => {
    const col = a.col, frames = a.frames;
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const x0 = Math.round((L.cellX(col) + L.cell * 0.2) * dpr);
    const w = Math.max(1, Math.round(L.cell * 0.6 * dpr));
    const y0 = Math.round(L.drop.y * dpr);
    const h = Math.round((L.boardY + L.boardH - L.drop.y) * dpr);
    const out = [];
    function tick() {
      renderAll();
      const d = g2.getImageData(x0, y0, w, h).data;
      let n = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (g < 45) { n++; sy += Math.floor((i / 4) / w); }
      }
      out.push({ y: n ? Math.round(((y0 + sy / n) / dpr) * 100) / 100 : null,
                 done: C4Fx.done(), active: C4Fx.active() });
      if (out.length >= frames) { resolve({ out: out, rest: L.center(col, 0).y, cell: L.cell }); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // ⭐⭐ 采样器 B：连拍 N 帧，量赢局连线的**可见长度**（沿线取样、扔掉落在棋子里的点）
  //   + 每个赢局格与其余棋子格的最大亮度（⇒ 「发光」与「变暗」在同一帧里能对比）。
  const winSampler = frames => new Promise(resolve => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const line = G.result.line;
    const A = L.center(line[0].c, line[0].r);
    const Z = L.center(line[line.length - 1].c, line[line.length - 1].r);
    const X0 = Math.round(L.boardX * dpr), Y0 = Math.round(L.boardY * dpr);
    const WP = Math.round(L.boardW * dpr), HP = Math.round(L.boardH * dpr);
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const u = i / 160;
      const x = A.x + (Z.x - A.x) * u, y = A.y + (Z.y - A.y) * u;
      const inPiece = line.some(p => {
        const q = L.center(p.c, p.r);
        return Math.hypot(q.x - x, q.y - y) < L.cell * 0.62;
      });
      if (!inPiece) pts.push({ x: x, y: y });
    }
    const maxGray = (buf, cx, cy, rad) => {
      const px = Math.round(cx * dpr) - X0, py = Math.round(cy * dpr) - Y0;
      let mx = 0;
      for (let yy = py - rad; yy <= py + rad; yy++) {
        if (yy < 0 || yy >= HP) continue;
        for (let xx = px - rad; xx <= px + rad; xx++) {
          if (xx < 0 || xx >= WP) continue;
          const i = (yy * WP + xx) * 4;
          const g = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
          if (g > mx) mx = g;
        }
      }
      return mx;
    };
    const t0 = performance.now();
    const out = [];
    function tick() {
      if (C4Fx.done()) renderAll();          // ⭐ 反向对照：播完/根本没播时必须强制重画
      const buf = g2.getImageData(X0, Y0, WP, HP).data;
      let k = 0;
      while (k < pts.length && maxGray(buf, pts[k].x, pts[k].y, 2) > 170) k++;
      out.push({
        t: Math.round(performance.now() - t0),
        len: Math.round(k / pts.length * 1000) / 1000,
        done: C4Fx.done(), ready: G.overReady
      });
      if (out.length >= frames) { resolve({ out: out, n: pts.length }); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // ⭐ 探针：给定几格，量它们与「其余空格」的 ink 覆盖率（圆盘窗口，同 t4/t5 那一套）。
  const probeCells = cells => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const S = Math.round(L.cell * dpr);
    const RAD = 0.43 * L.cell * dpr;
    const GRAY = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const inDisc = new Uint8Array(S * S);
    let discN = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5;
      if (dx * dx + dy * dy <= RAD * RAD) { inDisc[y * S + x] = 1; discN++; }
    }
    const cellGray = (c, r) => {
      const d = g2.getImageData(Math.round(L.cellX(c) * dpr), Math.round(L.cellY(r) * dpr), S, S).data;
      const out = new Float64Array(S * S);
      for (let i = 0; i < S * S; i++) out[i] = GRAY(d, i * 4);
      return out;
    };
    const bd = C4State.boardOf(G.g);
    const isPick = (c, r) => a.cells.some(q => q.c === c && q.r === r);
    const picks = [], empties = [];
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      if (C4Render.cellOwner(bd, c, r) >= 0) continue;
      (isPick(c, r) ? picks : empties).push([c, r]);
    }
    let sum = 0, n = 0;
    for (const [c, r] of empties) {
      const m = cellGray(c, r);
      for (let i = 0; i < S * S; i++) if (inDisc[i]) { sum += m[i]; n++; }
    }
    const bg = n ? sum / n : 90;
    const inkOf = (c, r) => {
      const m = cellGray(c, r);
      let k = 0;
      for (let i = 0; i < S * S; i++) if (inDisc[i] && Math.abs(m[i] - bg) > 25) k++;
      return k / discN;
    };
    return {
      bg: bg,
      pick: picks.map(([c, r]) => ({ c: c, r: r, ink: inkOf(c, r) })),
      emptyMax: empties.reduce((mx, [c, r]) => Math.max(mx, inkOf(c, r)), 0)
    };
  }, { cells: cells });

  /** 悬停带（drop 那条）里有多少「深于页面底色」的像素 —— §6.6 那句提示在不在。
   *  ⚠ 只量**中间那条**（15%..72%）：盘体的投影（shadowBlur 18 / offsetY 6）会向上糊进
   *    这条带的下沿，灰度 ≈183 —— 不避开的话「没有提示时也有 ink」，反向对照就恒假了。
   *  ⚠ 阈值 170：提示的文字是 #264a3d（gray≈62），投影 ≈183 ⇒ 两者之间留了余量。 */
  const bandInk = () => page.evaluate(() => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(L.drop.x * dpr), Math.round((L.drop.y + L.drop.h * 0.15) * dpr),
                              Math.round(L.drop.w * dpr), Math.round(L.drop.h * 0.57 * dpr)).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 170) ink++;
    }
    return ink / (d.length / 4);
  });

  /** ⭐ 盘面的**逐格平均灰度签名**（42 个数）：把两帧「本该一模一样的终态」直接对拍。
   *  ⛔ 别用整屏截图 diff —— HUD 文案与按钮焦点态本来就可能不同，那不是这条要证的东西。 */
  const boardSig = () => page.evaluate(() => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const S = Math.round(L.cell * dpr);
    const out = [];
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      const d = g2.getImageData(Math.round(L.cellX(c) * dpr), Math.round(L.cellY(r) * dpr), S, S).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      out.push(Math.round(s / (d.length / 4) * 100) / 100);
    }
    return out;
  });
  const sigDiff = (a, b) => a.reduce((mx, v, i) => Math.max(mx, Math.abs(v - b[i])), 0);

  /** 按钮里**文字的墨迹高度**（设备像素）：⭐ 舒适模式「字确实变大」的像素判据。
   *  ⚠ 左右各内缩 15% 避开圆角 —— 圆角外露出来的页面底色也是近白，会被算成文字。 */
  const textInk = rc => page.evaluate(r => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const x = Math.round((r.x + r.w * 0.15) * dpr), w = Math.round(r.w * 0.70 * dpr);
    const y = Math.round((r.y + 3) * dpr), h = Math.round((r.h - 6) * dpr);
    const d = g2.getImageData(x, y, w, h).data;
    let top = -1, bot = -1, px = 0;
    for (let yy = 0; yy < h; yy++) {
      let any = false;
      for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4;
        if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) { any = true; px++; }
      }
      if (any) { if (top < 0) top = yy; bot = yy; }
    }
    return { h: top < 0 ? 0 : bot - top + 1, px: px, dpr: dpr };
  }, rc);

  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(
    () => window.G && window.C4Render && window.C4Fx && window.C4Settings && window.C4Threats
       && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  await page.waitForTimeout(200);

  // 音效改成**记录**（headless 里本来也发不出声，但「fork 音在减弱动态下照样响」正是要验的）
  await page.evaluate(() => {
    window.__sfx = []; window.__hap = [];
    const op = Sfx.play;
    Sfx.play = function (n) { window.__sfx.push({ n: n, t: performance.now() }); return op.call(Sfx, n); };
    Haptics.light = () => window.__hap.push('light');
    Haptics.medium = () => window.__hap.push('medium');
    Haptics.heavy = () => window.__hap.push('heavy');
  });
  const clearSfx = () => page.evaluate(() => { window.__sfx.length = 0; window.__hap.length = 0; });

  console.log('\n① 加载 / 新字段的默认值');
  ok(errs.length === 0, '打开页面零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));
  const def = await page.evaluate(() => ({
    keys: C4Settings.KEYS.slice(), motion: C4Settings.get('reduceMotion'),
    comfort: C4Settings.get('comfort'), sysReduced: reduceMotion(),
    mDef: C4Settings.DEFAULTS.reduceMotion, cDef: C4Settings.DEFAULTS.comfort
  }));
  ok(def.keys.indexOf('reduceMotion') >= 0 && def.keys.indexOf('comfort') >= 0,
    '⭐⭐ 两个新字段**都在 defaults 里**（⛔ 漏了的话用户的显式选择存进去也会被 merge 丢掉，'
    + '全程零报错）：KEYS=' + JSON.stringify(def.keys));
  ok(def.motion === 'auto' && def.mDef === 'auto',
    '⭐ 减弱动态默认**跟随系统**（' + def.motion + '）—— §6.8：系统里勾过的人不该再勾一次');
  ok(def.comfort === false && def.cDef === false, '舒适模式默认关（' + def.comfort + '）');
  ok(def.sysReduced === false,
    '基线：headless 的系统偏好是 no-preference ⇒ 现在**不**减弱动态（' + def.sysReduced + '）');
  console.log('   ' + (await shot('p2b-t6-00-home-normal.png')) + '（HOME：三行设置）');

  // ═══════════ ② ⭐⭐ 落子动画：开 ⇒ 不动；关 ⇒ 在动 ═══════════
  console.log('\n② ⭐⭐ 落子动画（DESIGN §6.3 → §6.8「跳过一切非必要动画」）');
  const COL = 0;
  await newHumanGame();
  await clickAt(await pt('COL', 'col', COL));
  const SoffRaw = await page.evaluate(dropSampler, { col: COL, frames: 12 });
  const ysOff = SoffRaw.out.map(s => s.y);
  console.log('   【关闭减弱动态】12 帧 y = ' + JSON.stringify(ysOff));
  ok(ysOff.every(y => y !== null), '每一帧都量到了棋子');
  const spanOff = Math.max.apply(null, ysOff) - Math.min.apply(null, ysOff);
  ok(spanOff > SoffRaw.cell * 2,
    '⛔ 反向对照：关掉时那 12 帧棋子**确实在往下掉**（极差 ' + spanOff.toFixed(1) + ' px > 2 格 = '
    + (SoffRaw.cell * 2).toFixed(0) + ' px）—— 少了这条，下面那句「不动」是恒真的');
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });

  await setMotion('on');
  await newHumanGame();
  await clearSfx();
  await clickAt(await pt('COL', 'col', COL));
  const Son = await page.evaluate(dropSampler, { col: COL, frames: 12 });
  const ysOn = Son.out.map(s => s.y);
  console.log('   【开启减弱动态】12 帧 y = ' + JSON.stringify(ysOn));
  const spanOn = Math.max.apply(null, ysOn) - Math.min.apply(null, ysOn);
  ok(ysOn.every(y => y !== null), '每一帧都量到了棋子（⇒ 棋子确实落上了，不是消失了）');
  ok(spanOn < 0.5,
    '⭐⭐ **开启后棋子的 y 纹丝不动**（12 帧极差 ' + spanOn.toFixed(2) + ' px < 0.5，'
    + '而关掉时是 ' + spanOff.toFixed(1) + ' px）');
  ok(Math.abs(ysOn[0] - Son.rest) < Son.cell * 0.25,
    '⭐ 而且**第一帧就在落点格心**（y=' + ysOn[0] + '，格心 ' + Son.rest.toFixed(1)
    + '）⇒ 是「直接落定」，⛔ 不是「停在半空不动了」');
  const idle = await page.evaluate(() => ({ raf: G.rafId, active: C4Fx.active(), done: C4Fx.done() }));
  ok(idle.raf === null && idle.active === 0 && idle.done,
    '⭐ 连 rAF 都没起过（' + JSON.stringify(idle) + '）⇒ ⛔ 不是「动画照跑、只是看不见」');
  const dropSfx = await page.evaluate(() => ({ sfx: window.__sfx.map(x => x.n), hap: window.__hap.slice() }));
  ok(dropSfx.sfx.some(n => /^land/.test(n)) && dropSfx.hap.length === 1,
    '⭐ **必要反馈没被一起关掉**：落定音 ' + JSON.stringify(dropSfx.sfx) + ' + 震动 '
    + JSON.stringify(dropSfx.hap) + ' 照旧');
  await settle();
  console.log('   ' + (await shot('p2b-t6-01-drop-reduced.png')) + '（减弱动态下的落子结果）');

  // ═══════════ ③ ⭐⭐ 赢局动画：开 ⇒ 静态终态；关 ⇒ 逐段画出 ═══════════
  console.log('\n③ ⭐⭐ 赢局那 3 秒（§6.3）在减弱动态下应当**一步到位**，⛔ 但终态不许丢');
  // ── 反向对照先跑：关掉时连线是逐段长出来的；⭐ 庆祝**播完之后**那一帧留作基准 ──
  await setMotion('off');
  await newHumanGame();
  for (const c of DIAG) await playCol(c);
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });
  await settle();
  const sigPre = await boardSig();                     // ⭐ 灵敏度对照：赢**之前**那一帧
  await clickAt(await pt('COL', 'col', DIAG_WIN));
  const WoffS = await page.evaluate(winSampler, 60);
  const lensOff = WoffS.out.map(s => s.len);
  console.log('   【关闭】连线可见长度逐帧 = ' + JSON.stringify(lensOff));
  const grew = lensOff.filter((v, i) => i > 0 && v > lensOff[i - 1]).length;
  ok(lensOff[0] < 0.05, '⛔ 反向对照：关掉时**第一帧连线还没开始画**（len=' + lensOff[0] + '）');
  ok(grew >= 3, '⛔ 反向对照：关掉时连线**逐帧在长**（' + grew + ' 次变长）');
  await page.waitForFunction(() => C4Fx.done() && G.overReady, null, { timeout: 8000 }).catch(() => {});
  await settle();
  const sigAnimEnd = await boardSig();                 // ⭐ 正常模式**庆祝播完**之后的终态帧

  await setMotion('on');
  await newHumanGame();
  for (const c of DIAG) await playCol(c);
  await clickAt(await pt('COL', 'col', DIAG_WIN));
  await page.waitForFunction(() => G.phase === 'OVER', null, { timeout: 4000 });
  const winNow = await page.evaluate(() => ({
    ready: G.overReady, ms: Math.round(G.readyAt - G.overAt),
    poseWin: C4Fx.poseWin(), active: C4Fx.active(), raf: G.rafId
  }));
  ok(winNow.poseWin === null && winNow.active === 0 && winNow.raf === null,
    '⭐ 一个庆祝动画都没起（poseWin=' + JSON.stringify(winNow.poseWin) + ' active=' + winNow.active + '）');
  ok(winNow.ready === true && winNow.ms <= 5,
    '⭐⭐ 结算**立刻**就位（终局 → 主 CTA 焦点态 ' + winNow.ms + ' ms）'
    + ' —— ⛔ 不许因为没动画就没结算');
  await settle();
  const Won = await page.evaluate(winSampler, 8);
  const lensOn = Won.out.map(s => s.len);
  console.log('   【开启】连线可见长度逐帧 = ' + JSON.stringify(lensOn));
  ok(lensOn[0] >= 0.99, '⭐ **第一帧连线就是整条**（len=' + lensOn[0] + '）⇒ 一步到位');
  ok(Math.max.apply(null, lensOn) - Math.min.apply(null, lensOn) < 0.001,
    '⭐⭐ 连拍 8 帧（每帧强制重画）长度**完全不变**：' + JSON.stringify(lensOn));
  // ⭐⭐ 「必要反馈没被一起关掉」最硬的问法：**和正常模式庆祝播完之后的那一帧逐格对拍**。
  //   两者必须是同一个终态（连线整条 + 四枚发光 + 其余变暗），⛔ 不是各画各的。
  await settle();
  const sigReduced = await boardSig();
  const dEnd = sigDiff(sigAnimEnd, sigReduced), dPre = sigDiff(sigPre, sigReduced);
  console.log('   盘面逐格灰度签名：与「正常模式庆祝播完那一帧」最大差 ' + n3(dEnd)
    + '；与「赢之前那一帧」最大差 ' + n3(dPre));
  ok(dEnd < 1,
    '⭐⭐ **必要反馈一个都没丢**：减弱动态下的赢局帧与正常模式**庆祝播完**之后的那一帧'
    + '逐格灰度最大差 ' + n3(dEnd) + ' < 1 ⇒ 连线、四枚发光、其余变暗**三件终态全在**，'
    + '丢掉的只是「逐段画出」这个过程');
  ok(dPre > 20,
    '⛔ 灵敏度对照：这个签名**分得出**画面变没变（与赢之前那一帧差 ' + n3(dPre)
    + ' > 20）—— 少了这条，上面那个「差 < 1」可能只是签名恒等');
  ok(await hasHit('AGAIN'), '［再来一局］照常可点');
  console.log('   ' + (await shot('p2b-t6-02-win-reduced.png')) + '（减弱动态下的静态赢局帧）');

  // ═══════════ ④ ⭐⭐ 双威胁光环：开 ⇒ 不放；⭐ 但 fork 音照响 ═══════════
  console.log('\n④ ⭐⭐ 双威胁光环（§6.4 下半）在减弱动态下不放，⛔ 但音必须照响');
  await setHints(false);           // ⚠ 隔离 ▲/◇ 对 ink 的污染（⑤ 再把它开回来单独验）
  // ── 反向对照：关掉减弱动态时，同一局面同一两格确实有光环 ──
  await setMotion('off');
  await newHumanGame();
  for (const c of FIX_FORK.slice(0, -1)) await playCol(c);
  await settle();
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => null; });
  const bef = await page.evaluate(() => G.g.moves.length);
  await clickAt(await pt('COL', 'col', FIX_FORK[FIX_FORK.length - 1]));
  await page.waitForFunction(k => window.G.g.moves.length > k, bef, { timeout: 4000 });
  await settle();
  const lead = await page.evaluate(() => (C4Fx.poseFork() || {}).lead);
  await page.evaluate(t => { const p = C4Fx.poseFork(); if (p && t > p.t) C4Fx.step(t - p.t); renderAll(); }, lead + 90);
  const PBoff = await probeCells(TF.cells);
  const inkOffMin = Math.min.apply(null, PBoff.pick.map(x => x.ink));
  console.log('   【关闭】那两格 ink = ' + PBoff.pick.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · '));
  ok(inkOffMin > 0.10, '⛔ 反向对照：关掉时两个落点确实各有一圈光环（最小 ink ' + n3(inkOffMin) + '）');
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; });

  await setMotion('on');
  await newHumanGame();
  await clearSfx();
  for (const c of FIX_FORK.slice(0, -1)) await playCol(c);
  await settle();
  // ⭐⭐ **与上面那半条同一个取帧方式**：先把 rAF 换成空操作再落最后一手。
  //   ⛔ 少了这一步，光环会在 `playCol` 等 `C4Fx.done()` 的那几百毫秒里自己播完 ——
  //     于是「那两格是干净的」变成**恒真**：变异实验当场抓到（把三个门控全拆掉，
  //     ②③ 一片红而 ④ 照样全绿）。这是本仓「加了断言但抓不住」的第七次未遂。
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => null; });
  const bef2 = await page.evaluate(() => G.g.moves.length);
  await clickAt(await pt('COL', 'col', FIX_FORK[FIX_FORK.length - 1]));
  await page.waitForFunction(k => window.G.g.moves.length > k, bef2, { timeout: 4000 });
  await settle();
  const forkOn = await page.evaluate(() => ({
    n: G.forkCount, pose: C4Fx.poseFork(), active: C4Fx.active(), raf: G.rafId,
    sfx: window.__sfx.filter(x => x.n === 'fork').length
  }));
  ok(forkOn.n === 1, '前提：判据照常认出了这次双威胁（forkCount=' + forkOn.n + '）');
  ok(forkOn.pose === null && forkOn.active === 0 && forkOn.raf === null,
    '⭐ 光环一个都没起（poseFork=null，active=' + forkOn.active + '）');
  ok(forkOn.sfx === 1,
    '⭐⭐ **`fork` 音照响一次**（' + forkOn.sfx + ' 次）—— ⛔ 减弱动态针对的是**视觉运动**，'
    + '声音不引起晕动症；而 fork 音是这个事件在关掉动效后**唯一**的载体');
  // ⭐ 把时钟推到「本来该炸开」的那一刻（与关掉时量的**完全同一时刻**）：
  //   没有动画在跑 ⇒ 什么都不会变；⛔ 门控被拆掉的话这里就是一整圈光环。
  await page.evaluate(t => { const p = C4Fx.poseFork(); if (p && t > p.t) C4Fx.step(t - p.t); renderAll(); },
                      lead + 90);
  const P4 = await probeCells(TF.cells);
  const inkOnMax = Math.max.apply(null, P4.pick.map(x => x.ink));
  console.log('   【开启】那两格 ink = ' + P4.pick.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · ')
    + '（其余空格最大 ' + n3(P4.emptyMax) + '）');
  ok(inkOnMax < 0.02,
    '⭐⭐ 同一个局面、同一份设置（威胁提示都关着）、**同一个时刻 t=lead+90**，只有减弱动态不同'
    + ' ⇒ 那两格 ink 从 ' + n3(inkOffMin) + ' 掉到 ' + n3(inkOnMax) + ' < 0.02');

  // ⛔ 不许「先闪一下再消失」：每一帧都把时钟往前推 60 ms 再量
  const framesInk = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { C4Fx.step(60); renderAll(); });
    framesInk.push((await probeCells(TF.cells)).pick.map(x => x.ink));
  }
  ok(framesInk.every(f => Math.max.apply(null, f) < 0.02),
    '⭐ 再往前推 6 帧（每帧 +60 ms 并强制重画）那两格一直是干净的：'
    + JSON.stringify(framesInk.map(f => Math.max.apply(null, f).toFixed(3))));
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; });

  // ═══════════ ⑤ ⭐ 威胁标记**不吃**这个门 ═══════════
  console.log('\n⑤ ⭐ 威胁标记是**信息**不是动效 ⇒ ⛔ 不该被减弱动态门控（关掉动效的人更需要它）');
  await setHints(true);
  await newHumanGame();
  for (const c of FIX_FORK) await playCol(c);
  await settle();
  const P5 = await page.evaluate(() => ({ motion: reduceMotion(), threats: (G.threats || []).slice() }));
  ok(P5.motion === true, '前提：这一帧减弱动态仍然是**开**着的');
  const marked = TF.cells.filter(q => P5.threats.some(t => t.c === q.c && t.r === q.r));
  ok(marked.length === TF.cells.length,
    '⭐ 那两格仍然被标记（G.threats 覆盖 ' + marked.length + '/' + TF.cells.length + '）');
  const P5ink = await probeCells(TF.cells);
  const p5min = Math.min.apply(null, P5ink.pick.map(x => x.ink));
  console.log('   减弱动态开着、威胁提示开着：那两格 ink = '
    + P5ink.pick.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · '));
  ok(p5min > 0.10,
    '⭐⭐ **像素上标记确实还在画**（最小 ink ' + n3(p5min) + ' > 0.10；④ 里同样两格、同样的'
    + '减弱动态、只是提示关着时是 ' + n3(inkOnMax) + '）⇒ 关掉的只有光环');
  console.log('   ' + (await shot('p2b-t6-03-fork-reduced-hints-on.png'))
    + '（⭐ 减弱动态开 + 提示开：▲ 在、光环不在）');

  // ═══════════ ⑥ ⭐⭐ 三态：系统说要减，「强制关」必须压过它 ═══════════
  console.log('\n⑥ ⭐⭐ 三态（跟随系统 / 强制开 / 强制关）—— ⛔ 做成布尔就没有这一节');
  await setMotion('auto');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => renderAll());
  const auto1 = await page.evaluate(() => ({ sys: sysReduceMotion(), eff: reduceMotion() }));
  ok(auto1.sys === true && auto1.eff === true,
    '⭐ 系统设成 reduce + 档位「跟随系统」⇒ 减弱动态**跟着开**（sys=' + auto1.sys + '）');
  await setMotion('off');
  const forced = await page.evaluate(() => ({ sys: sysReduceMotion(), eff: reduceMotion() }));
  ok(forced.sys === true && forced.eff === false,
    '⭐⭐ **系统仍然说要减，档位「强制关」⇒ 不减**（sys=' + forced.sys + ' eff=' + forced.eff + '）'
    + ' —— 这一格就是「三态不是布尔」的全部理由');
  // ⛔ 别只信那个布尔：真落一子看画面
  await newHumanGame();
  await clickAt(await pt('COL', 'col', COL));
  const Sforce = await page.evaluate(dropSampler, { col: COL, frames: 12 });
  const ysF = Sforce.out.map(s => s.y);
  const spanF = Math.max.apply(null, ysF) - Math.min.apply(null, ysF);
  console.log('   【系统 reduce + 强制关】12 帧 y = ' + JSON.stringify(ysF));
  ok(spanF > Sforce.cell * 2,
    '⭐⭐ 而且**画面真的还在动**（极差 ' + spanF.toFixed(1) + ' px）⇒ ⛔ 不是只有那个布尔翻了');
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setMotion('on');
  const forcedOn = await page.evaluate(() => ({ sys: sysReduceMotion(), eff: reduceMotion() }));
  ok(forcedOn.sys === false && forcedOn.eff === true,
    '⭐ 反过来：系统没要求 + 档位「强制开」⇒ 照样减（sys=' + forcedOn.sys + ' eff=' + forcedOn.eff + '）');

  // ═══════════ ⑦ ⭐ 持久化：三态每一档 + comfort，判据一律取**非默认值**方向 ═══════════
  console.log('\n⑦ ⭐ 持久化（⚠ 判据必须是**非默认值**那个方向：T4 实锤「开→刷新仍是开」在'
    + '持久化坏掉时照样绿）');
  const reloadReady = async () => {
    await page.reload();
    await page.waitForFunction(
      () => window.G && window.C4Settings && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
      null, { timeout: 10000 });
  };
  for (const v of ['on', 'off', 'auto']) {
    await setMotion(v);
    const raw = await page.evaluate(() => localStorage.getItem(CFG.key('settings')));
    ok(!!raw && JSON.parse(raw).reduceMotion === v, '「' + v + '」**立刻**落盘了：' + raw);
    await reloadReady();
    const got = await page.evaluate(() => ({ v: C4Settings.get('reduceMotion'),
                                             has: Object.prototype.hasOwnProperty.call(C4Settings.all(), 'reduceMotion') }));
    ok(got.v === v && got.has,
      '⭐ reduceMotion="' + v + '" 活过了一次**真的刷新**（读回 ' + JSON.stringify(got.v)
      + '）⚠ 判据是 `=== "' + v + '"`，⛔ 不是「真值」');
  }
  await setComfort(true);
  const rawC = await page.evaluate(() => localStorage.getItem(CFG.key('settings')));
  ok(!!rawC && JSON.parse(rawC).comfort === true, 'comfort=true 立刻落盘：' + rawC);
  await reloadReady();
  ok(await page.evaluate(() => C4Settings.get('comfort')) === true,
    '⭐ comfort=**true**（非默认值）活过了一次真的刷新');

  // ═══════════ ⑧ ⭐ 舒适模式：字更大 + 点击窗更大（⛔ 不许只断言 flag）═══════════
  console.log('\n⑧ ⭐ 舒适模式（§6.8「大字 + 更大点击窗」，用户画像 4 岁到 80 岁）');
  await goHome();
  const rcOn = await rectOf('PLAY_AI');
  const tkOn = await textInk(rcOn);
  console.log('   ' + (await shot('p2b-t6-04-home-comfort.png')) + '（HOME · 舒适模式开）');
  await setComfort(false);
  const rcOff = await rectOf('PLAY_AI');
  const tkOff = await textInk(rcOff);
  console.log('   ［对战电脑］按钮：普通 ' + JSON.stringify(rcOff) + ' 文字墨迹高 ' + tkOff.h + 'px'
    + '  vs  舒适 ' + JSON.stringify(rcOn) + ' 文字墨迹高 ' + tkOn.h + 'px（dpr=' + tkOn.dpr + '）');
  ok(tkOff.h > 4 && tkOn.h > tkOff.h * 1.15,
    '⭐ **像素上字确实变大**：墨迹高 ' + tkOff.h + ' → ' + tkOn.h + ' 设备像素（'
    + (tkOn.h / Math.max(1, tkOff.h)).toFixed(2) + '×）⛔ 不是只翻了个 flag');
  ok(tkOn.px > tkOff.px * 1.2,
    '⭐ 字的墨迹面积也跟着涨（' + tkOff.px + ' → ' + tkOn.px + ' 像素）');
  ok(rcOn.h > rcOff.h * 1.15,
    '⭐ **点击窗确实变高**：' + rcOff.h + ' → ' + rcOn.h + ' px（'
    + (rcOn.h / rcOff.h).toFixed(2) + '×）');

  // ⭐⭐ 光有数字还不够：找一个「普通模式下不属于这个按钮」的像素，舒适模式下真实鼠标点它。
  //   ⚠ h 变大 ⇒ 舒适的 y 区间不可能是普通的子集 ⇒ 这样的像素**一定存在**（找不到就该红）。
  let probeY = -1;
  for (let y = Math.ceil(rcOn.y); y <= Math.floor(rcOn.y + rcOn.h); y++) {
    if (y < rcOff.y || y > rcOff.y + rcOff.h) { probeY = y; break; }
  }
  ok(probeY >= 0, '找得到一个「只在舒适模式下才属于［对战电脑］」的 y（' + probeY + '）');
  const px = Math.round(rcOn.x + rcOn.w / 2);
  const offHit = await page.evaluate(p => { const h = hitTest(p.x, p.y); return h ? h.action : null; },
                                     { x: px, y: probeY });
  ok(offHit !== 'PLAY_AI',
    '⭐ 普通模式下 (' + px + ',' + probeY + ') **不属于**［对战电脑］（那里是 '
    + JSON.stringify(offHit) + '）');
  await setComfort(true);
  const onHit = await page.evaluate(p => { const h = hitTest(p.x, p.y); return h ? h.action : null; },
                                    { x: px, y: probeY });
  ok(onHit === 'PLAY_AI', '舒适模式下同一个像素属于［对战电脑］（' + JSON.stringify(onHit) + '）');
  await page.mouse.move(px, probeY); await page.mouse.down(); await page.mouse.up();
  const started = await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai',
    null, { timeout: 4000 }).then(() => true, () => false);
  ok(started,
    '⭐⭐ **真实鼠标点那个像素，舒适模式下真的开了局** —— ⛔ 「点击窗变大」不是一个数字，'
    + '是这一下点得中');
  await settle();
  console.log('   ' + (await shot('p2b-t6-05-play-comfort.png')) + '（对局中 · 舒适模式）');
  await setComfort(false);
  await setMotion('auto');

  // ═══════════ ⑨ ⭐ §6.6 让「输」不疼 ═══════════
  console.log('\n⑨ ⭐ §6.6 让「输」不疼：⛔ 没有「你输了」的大字，⭐ 留位 + 「你差一手就赢了」');
  ok(await page.evaluate(() => T('game.lose') === 'game.lose'),
    '⭐ 「你输了」这条文案**已经从 locales 里拿掉了**（T 取不到 ⇒ 回落成 key）'
    + ' —— ⛔ 留着它迟早会被某处再用上');

  // ── ⑨a 「你差一手就赢了」：两个确定性夹具，正反对照（同机双人局，逐手真实鼠标）──
  for (const [name, mv, want] of [['NEAR', FIX_NEAR, NEAR_T.ply], ['NONE', FIX_NONE, null]]) {
    await newHumanGame();
    for (const c of mv) await playCol(c);
    await page.waitForFunction(() => G.phase === 'OVER', null, { timeout: 6000 });
    await settle();
    const got = await page.evaluate(() => ({
      nearWin: G.result.nearWin, winner: G.result.winner, moves: G.g.moves.slice()
    }));
    const truth = Th.missedWin(got.moves, got.winner ^ 1);
    ok(JSON.stringify(got.moves) === JSON.stringify(mv) && got.winner === 1,
      '[' + name + '] 前提：这一局照夹具走完且后手赢（' + JSON.stringify(got.moves) + '）');
    ok((got.nearWin ? got.nearWin.ply : null) === want
       && (truth ? truth.ply : null) === want,
      '[' + name + '] ⭐ 浏览器算出的 nearWin=' + JSON.stringify(got.nearWin)
      + '，与 node 侧独立复算一致，且等于夹具的期望（' + JSON.stringify(want) + '）');
    const ink = await bandInk();
    if (want === null) {
      ok(ink < 0.005,
        '[' + name + '] ⭐⭐ **反向对照**：不成立时悬停带上一个字都没有（ink ' + n3(ink)
        + ' < 0.005）—— ⛔ 「反正说一句安慰话」的实现在这里红');
    } else {
      ok(ink > 0.02,
        '[' + name + '] ⭐ 成立时那句话**真的画出来了**（悬停带 ink ' + n3(ink) + ' > 0.02）');
    }
    console.log('   ' + (await shot('p2b-t6-06-nearwin-' + name.toLowerCase() + '.png'))
      + '（悬停带 ink=' + n3(ink) + '）');
  }

  // ── ⑨b 人机输局的结算屏 ──
  await goHome();
  await page.waitForFunction(() => EngineClient.state().worker !== 'starting', null, { timeout: 20000 });
  ok(await page.evaluate(() => EngineClient.state().worker === 'alive'), '前置：求解器 Worker 活着');
  await clickAt(await pt('TIER', 'tier', 3));
  await clickAt(await pt('PLAY_AI'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 4000 });
  const gi = await page.evaluate(() => ({ seed: G.g.seed, tier: G.g.tier, human: C4State.humanPlayer(G.g) }));
  for (let it = 0; it < 42; it++) {
    const s = await page.evaluate(() => ({ phase: G.phase, moves: G.g.moves.slice(),
                                           mine: C4State.isHumanTurn(G.g) }));
    if (s.phase === 'OVER') break;
    if (!s.mine) {
      await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
        s.moves.length, { timeout: 25000 });
      continue;
    }
    await playCol(planLoss(s.moves, gi.tier, gi.seed, gi.human), 8000);
  }
  await page.waitForFunction(() => G.phase === 'OVER' && G.overReady, null, { timeout: 9000 }).catch(() => {});
  await settle();
  const L9 = await page.evaluate(() => ({
    phase: G.phase, winner: G.result.winner, human: C4State.humanPlayer(G.g),
    moves: G.g.moves.slice(), left: hudInfo(G.g).left, lost: isLoss(),
    roundOver: T('game.roundOver'), win: T('game.win'), nearWin: G.result.nearWin
  }));
  ok(L9.phase === 'OVER' && L9.winner !== null && L9.winner !== L9.human,
    '前提：**玩家真的输了**这一局（' + L9.moves.length + ' 手，winner=' + L9.winner + '）');
  ok(L9.lost === true, 'isLoss() 认出了这是一次输局');
  ok(L9.left === L9.roundOver && L9.left !== L9.win,
    '⭐⭐ HUD 上那一行是中性的「' + L9.left + '」—— ⛔ 不是判决式的「你输了」大字（§6.6 第一条）');
  ok((L9.nearWin ? L9.nearWin.ply : null) === (Th.missedWin(L9.moves, L9.human) || {}).ply
     || (L9.nearWin === null && Th.missedWin(L9.moves, L9.human) === null),
    '⭐ 「差一手就赢了」与 node 侧独立复算一致（nearWin=' + JSON.stringify(L9.nearWin) + '）');
  ok(!(await hasHit('REVIEW')) && !(await hasHit('REPLAY_FROM')),
    '⭐ ［复盘］与［从那一步重来］都是 **disabled 的留位** ⇒ **一个热区都没注册**'
    + ' —— ⛔ 假按钮（点了没反应）比没按钮更伤');
  // ⭐ 数据条真的画出来了：主 CTA 上方那一条卡片里必须有「精准度 / 转折点」的字
  const again = await rectOf('AGAIN');
  const strip = await page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(a.x * dpr), Math.round((a.y - 12 - a.h * 0.8) * dpr),
                              Math.round(a.w * dpr), Math.round(a.h * 0.8 * dpr)).data;
    let card = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g > 245) card++;
      if (g < 160) ink++;
    }
    return { card: card / (d.length / 4), ink: ink / (d.length / 4) };
  }, { x: 14, y: again.y, w: again.w / 0.6, h: again.h });
  ok(strip.card > 0.5 && strip.ink > 0.005,
    '⭐ 主 CTA 上方那条**数据条**在（白卡占比 ' + n3(strip.card) + '、文字墨迹 ' + n3(strip.ink)
    + '）—— §6.6 的「精准度 % + 转折点」留在这里，P3 把两个「—」换成真值即可');
  console.log('   ' + (await shot('p2b-t6-07-lose-settle.png'))
    + '（⭐⭐ 人机输局结算 —— ⛔ 这张必须肉眼看：没有失败横幅、有留位、有那句「差一手」）');

  ok(errs.length === 0, '全程零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  console.log('  · p2b-t6-00-home-normal.png / 04-home-comfort.png（⭐ 三行设置 · 舒适模式对照）');
  console.log('  · p2b-t6-01-drop-reduced.png（减弱动态下落子的结果帧）');
  console.log('  · p2b-t6-02-win-reduced.png（⭐ 静态赢局帧：连线整条 + 四枚发光 + 其余变暗）');
  console.log('  · p2b-t6-03-fork-reduced-hints-on.png（⭐ 光环不放、▲ 还在）');
  console.log('  · p2b-t6-05-play-comfort.png（对局中 · 舒适模式的字与按钮）');
  console.log('  · p2b-t6-06-nearwin-near.png / -none.png（⭐ 「差一手就赢了」正反两帧）');
  console.log('  · p2b-t6-07-lose-settle.png（⭐⭐ 输局结算 —— §6.6 的版面）');
  console.log(failed === 0 ? '\ne2e-p2b-t6: 全部通过' : '\ne2e-p2b-t6: ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
