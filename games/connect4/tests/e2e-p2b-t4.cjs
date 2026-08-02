// ════════════════════════════════════════
// e2e-p2b-t4.cjs —— P2b **Task 4** 的端到端门禁：威胁高亮（DESIGN §6.4 上半）+ 设置持久化。
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b 同一条纪律：**一次都不许调 `dispatch()` / `applyMove()`**，
//   落子与点开关一律 `page.mouse`，落点一律按热区的 action 名取（⛔ 零绝对坐标）。
//
// 覆盖（每一条都配了会红的反向对照）：
//   ① 加载零报错 · 新手默认**开**（DESIGN §6.4）
//   ② ⭐ **像素正向**：确定性局面 → 标记真的画在了那几格（ink 覆盖率），
//      且格子集合与 node 侧独立复算逐格相同
//   ③ ⭐ **反向对照**：同一局刚走到第 4 手（**没有**威胁）时，所有空格的 ink ≈ 0
//      ⛔ 只断言「有威胁时画了东西」是不够的：一个「每个空格都画一个记号」的实现照样绿
//   ④ ⭐ **灰度可辨**（§6.2 的同一条判据，8% 的男性有色觉障碍）：
//      两个标记之间、标记与棋子之间的**剪影 IoU** 必须低；空心/实心中心判据必须成立
//   ⑤ ⭐ 同一格两方都能赢 ⇒ **两个标记都画**（ink 明显高于单标记）
//   ⑥ ⭐ 关掉开关 ⇒ 同一个局面上标记**全部消失**（ink 回到空井水平）
//   ⑦ ⭐⭐ **零搜索**：整局人机跑完，`EngineClient.scores` 调用 **0 次**
//      （同时 `EngineClient.ai` > 0 ⇒ 引擎通道确实在用，只是威胁这条路没碰它；
//        并且途中 `G.threats` 确实非空过 ⇒ 这条路真的跑了，⛔ 不是恒真）
//   ⑧ ⭐ **持久化**：关 → **真的刷新页面** → 仍然是关，且 `=== false`（⛔ 不是「假值」：
//      字段被 merge 丢掉时读到 undefined，用 `!x` 判会恒绿 —— 那正是 snake 踩过的坑）
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

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8334;
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
// A：先手底行 1/2/3 三连 + 后手第 6 列竖三连 ⇒ 先手两个威胁格、后手一个
//    ⚠ 前 4 手（1,6,2,6）故意是**没有任何威胁**的 —— 那就是 ③ 的反向对照，同一局同一帧路径。
const FIX_A = [1, 6, 2, 6, 3, 6];
const FIX_A_PRE = FIX_A.slice(0, 4);
// B：⭐ 同一格**两方都能赢**（随机对局搜出来的真实局面，逐手合法、无中途终局）
const FIX_B = [2, 0, 2, 0, 3, 0, 0, 1, 3, 1, 3, 1, 6, 0, 6, 2];

const truth = mv => Th.cells(B.fromMoves(mv));

(async () => {
  // 夹具自证（⛔ 别让夹具坏了被读成被测代码坏了）
  for (const mv of [FIX_A, FIX_A_PRE, FIX_B]) {
    if (R.terminal(B.fromMoves(mv)) !== null) throw new Error('夹具必须非终局：' + JSON.stringify(mv));
  }
  const TA = truth(FIX_A), TB = truth(FIX_B);
  if (truth(FIX_A_PRE).length !== 0) throw new Error('反向对照夹具必须零威胁');
  if (!TA.some(t => t.players.length === 1 && t.players[0] === 0)
   || !TA.some(t => t.players.length === 1 && t.players[0] === 1)) throw new Error('夹具 A 必须两方各有威胁');
  if (!TB.some(t => t.players.length === 2)) throw new Error('夹具 B 必须有「两方同一格」');
  console.log('夹具：A=' + JSON.stringify(TA) + '\n      B=' + JSON.stringify(TB));

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };
  /** 灰度另存一张（⭐ 肉眼验收那一张，也是 ④ 的判据量的那个空间）。 */
  const shotGray = async n => {
    const data = await page.evaluate(() => {
      const cv = document.getElementById(CFG.canvasId);
      const o = document.createElement('canvas');
      o.width = cv.width; o.height = cv.height;
      const c2 = o.getContext('2d');
      c2.filter = 'grayscale(1)';
      c2.drawImage(cv, 0, 0);
      return o.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(SHOT_DIR, n), Buffer.from(data.split(',')[1], 'base64'));
    return n;
  };

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
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };

  /** 走一手真实鼠标并等它落稳（⚠ 等 moves 变长 + 动画播完，⛔ 不是等固定毫秒）。 */
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

  // ⭐⭐ 像素探针：按**格子中心的圆盘窗口**（半径 0.43 格）量灰度。
  //   ⛔ 别用整格方窗：井的圆角边框会被算成 ink，「空井 ink ≈ 0」那条反向对照就恒假了。
  //   分组：m0/m1 = 只属于一方的威胁格；both = 两方同一格；p0/p1 = 两方的棋子；empty = 空井。
  //   每组给：ink 覆盖率 · 中心 3×3 灰度（空心/实心判据）· **共识剪影**（过半格子都是 ink）。
  const probe = () => page.evaluate(() => {
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
    const th = G.threats || [];
    const at = (c, r) => th.find(t => t.c === c && t.r === r) || null;
    const groups = { m0: [], m1: [], both: [], p0: [], p1: [], empty: [] };
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      const o = C4Render.cellOwner(bd, c, r);
      if (o === 0) { groups.p0.push([c, r]); continue; }
      if (o === 1) { groups.p1.push([c, r]); continue; }
      const t = at(c, r);
      if (!t) groups.empty.push([c, r]);
      else if (t.players.length === 2) groups.both.push([c, r]);
      else groups['m' + t.players[0]].push([c, r]);
    }

    // 基准 bg：空井（**不含**威胁格）圆盘内的均值
    let bgSum = 0, bgN = 0;
    for (const [c, r] of groups.empty) {
      const m = cellGray(c, r);
      for (let i = 0; i < S * S; i++) if (inDisc[i]) { bgSum += m[i]; bgN++; }
    }
    const bg = bgN ? bgSum / bgN : 90;
    const TH = 25;                                    // ink 阈值（抗抗锯齿），与 e2e-render 同一套

    const res = {};
    for (const k of Object.keys(groups)) {
      const cells = groups[k];
      const acc = new Int32Array(S * S);
      let cover = 0, centerSum = 0;
      const per = [];
      for (const [c, r] of cells) {
        const m = cellGray(c, r);
        let one = 0;
        for (let i = 0; i < S * S; i++) {
          if (!inDisc[i]) continue;
          if (Math.abs(m[i] - bg) > TH) { acc[i]++; one++; }
        }
        cover += one;
        per.push({ c: c, r: r, ink: one / discN });
        const mid = Math.floor(S / 2);
        let cs = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cs += m[(mid + dy) * S + mid + dx];
        centerSum += cs / 9;
      }
      const mask = new Uint8Array(S * S);
      for (let i = 0; i < S * S; i++) if (acc[i] * 2 > cells.length) mask[i] = 1;
      res[k] = { n: cells.length, ink: cells.length ? cover / (cells.length * discN) : 0,
                 center: cells.length ? centerSum / cells.length : bg, per: per, mask: mask };
    }
    const iou = (a, b) => {
      let inter = 0, uni = 0;
      for (let i = 0; i < S * S; i++) {
        const x = res[a].mask[i], y = res[b].mask[i];
        if (x && y) inter++;
        if (x || y) uni++;
      }
      return uni ? inter / uni : 1;
    };
    const out = { bg: bg, S: S, cell: L.cell, threats: th,
                  iou: { m0m1: iou('m0', 'm1'), m0p0: iou('m0', 'p0'), m1p1: iou('m1', 'p1'),
                         m0p1: iou('m0', 'p1'), m1p0: iou('m1', 'p0'), p0p1: iou('p0', 'p1') } };
    for (const k of Object.keys(res)) out[k] = { n: res[k].n, ink: res[k].ink, center: res[k].center, per: res[k].per };
    return out;
  });

  /** ⭐ 「两方同一格」的专用探针：把那一格**左右两半**分开量。
   *  ⛔ 别拿「整格 ink 更高」当判据（第一版就是那样，当场红）：两个标记各缩到 0.62 之后
   *    面积之和跟一个满尺寸标记差不多，那条断言**方向都是错的**。
   *  真正要证的是「两个标记都在、而且各是各的形状」：
   *    左半中心必须是**实心**（三角的肚子）· 右半中心必须是**空心**（菱形的洞）· 两半都要有 ink。
   *  ⇒ 只画一个的实现：漏三角 ⇒ 左半没 ink；漏菱形 ⇒ 右半没 ink 且右半中心不空。 */
  const probeBoth = (c, r) => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const GRAY = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const p = L.center(a.c, a.r);
    const disc = (cx, cy, rad) => {
      const R0 = Math.round(rad * dpr);
      const x0 = Math.round(cx * dpr) - R0, y0 = Math.round(cy * dpr) - R0;
      const d = g2.getImageData(x0, y0, R0 * 2, R0 * 2).data;
      const out = [];
      for (let yy = 0; yy < R0 * 2; yy++) for (let xx = 0; xx < R0 * 2; xx++) {
        const dx = xx - R0 + 0.5, dy = yy - R0 + 0.5;
        if (dx * dx + dy * dy <= R0 * R0) out.push(GRAY(d, (yy * R0 * 2 + xx) * 4));
      }
      return out;
    };
    const mean = v => v.reduce((x, y) => x + y, 0) / v.length;
    const inkOf = (v, bg) => v.filter(g => Math.abs(g - bg) > 25).length / v.length;
    const dx = L.cell * 0.18;
    const bg = mean(disc(L.center(a.bgC, a.bgR).x, L.center(a.bgC, a.bgR).y, L.cell * 0.30));  // 一个干净空井
    return {
      bg: bg,
      leftCenter: mean(disc(p.x - dx, p.y, L.cell * 0.06)),
      rightCenter: mean(disc(p.x + dx, p.y, L.cell * 0.06)),
      leftInk: inkOf(disc(p.x - dx, p.y, L.cell * 0.22), bg),
      rightInk: inkOf(disc(p.x + dx, p.y, L.cell * 0.22), bg)
    };
  }, { c, r, bgC: c, bgR: r + 1 });

  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(
    () => window.G && window.C4Render && window.C4Threats && window.C4Settings
       && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  await page.waitForTimeout(200);

  // ⭐⭐ 计数器：`EngineClient` 的 API 对象**没有冻结**（engine-client.js 结尾），
  //   所以可以在这里包一层。⚠ 必须在开局**之前**装上，否则少数几次调用会漏计。
  await page.evaluate(() => {
    window.__scores = 0; window.__ai = 0;
    const os = EngineClient.scores, oa = EngineClient.ai;
    EngineClient.scores = function () { window.__scores++; return os.apply(EngineClient, arguments); };
    EngineClient.ai = function () { window.__ai++; return oa.apply(EngineClient, arguments); };
  });

  console.log('\n① 加载 / 默认值');
  ok(errs.length === 0, '打开页面零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));
  const defOn = await page.evaluate(() => ({
    on: C4Settings.get('threatHints'), def: C4Settings.DEFAULTS.threatHints,
    keys: C4Settings.KEYS.slice()
  }));
  ok(defOn.on === true && defOn.def === true,
    '⭐ 新手**默认开**（DESIGN §6.4「可开关，新手默认开」）：get=' + defOn.on + ' default=' + defOn.def);
  ok(defOn.keys.indexOf('threatHints') >= 0,
    '⭐ threatHints **在 defaults 里**（⛔ 闭合对象的字段漏了 = 用户的选择存进去也会被 merge 丢掉）：'
    + JSON.stringify(defOn.keys));
  console.log('   ' + (await shot('p2b-t4-00-home.png')) + '（HOME 的开关行 + 两个标记图例）');

  // ═══════════ ③ ⭐ 反向对照先做：**没有威胁**的局面上一个记号都不许有 ═══════════
  console.log('\n③ ⭐ 反向对照：同一局走到第 4 手（无威胁）时，所有空格的 ink ≈ 0');
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });
  for (const c of FIX_A_PRE) await playCol(c);
  await settle();
  const P0 = await probe();
  ok(JSON.stringify(P0.threats) === '[]',
    '前 4 手确实没有威胁（G.threats=' + JSON.stringify(P0.threats) + '）');
  const emptyMax0 = P0.empty.per.reduce((a, b) => Math.max(a, b.ink), 0);
  ok(emptyMax0 < 0.02,
    '⭐ 26 个空格里 ink 最大的也只有 ' + n3(emptyMax0) + ' < 0.02（⇒ 空井是干净的，'
    + '「每格都画个记号」的实现在这里就红了）');
  console.log('   ' + (await shot('p2b-t4-01-no-threat.png')));

  // ═══════════ ② ⭐ 像素正向 + 与 node 逐格对拍 ═══════════
  console.log('\n② ⭐ 威胁格真的被标出来了（像素判据 + node 侧独立复算对拍）');
  for (const c of FIX_A.slice(4)) await playCol(c);
  await settle();
  const P1 = await probe();
  const gotA = P1.threats.map(t => ({ c: t.c, r: t.r, players: t.players }));
  ok(JSON.stringify(gotA) === JSON.stringify(TA),
    '⭐ 浏览器里算出的威胁格与 node 侧逐格相同：' + JSON.stringify(gotA));
  ok(P1.m0.n === 2 && P1.m1.n === 1,
    '前提：这一帧上先手 2 个标记、后手 1 个（m0.n=' + P1.m0.n + ' m1.n=' + P1.m1.n + '）');
  console.log('   实测（灰度 0..255，格 ' + P1.S + '×' + P1.S + ' 设备像素，空井基准 bg=' + n3(P1.bg) + '）：');
  for (const k of ['m0', 'm1', 'p0', 'p1', 'empty']) {
    console.log('     ' + k.padEnd(6) + ' n=' + P1[k].n + ' ink=' + n3(P1[k].ink)
      + ' 中心=' + n3(P1[k].center) + '(|Δbg|=' + n3(Math.abs(P1[k].center - P1.bg)) + ')');
  }
  console.log('     剪影 IoU：' + Object.keys(P1.iou).map(k => k + '=' + n3(P1.iou[k])).join(' '));
  const m0min = Math.min.apply(null, P1.m0.per.map(x => x.ink));
  const m1min = Math.min.apply(null, P1.m1.per.map(x => x.ink));
  ok(m0min > 0.10 && m1min > 0.10,
    '⭐ 三个威胁格**每一个**都真的画上了东西（最小 ink：先手 ' + n3(m0min) + ' / 后手 ' + n3(m1min)
    + ' > 0.10，而空井是 ' + n3(P1.empty.ink) + '）');
  ok(P1.empty.per.reduce((a, b) => Math.max(a, b.ink), 0) < 0.02,
    '⭐ 同一帧里**没有威胁的空格仍然干净**（最大 ink ' + n3(P1.empty.per.reduce((a, b) => Math.max(a, b.ink), 0))
    + ' < 0.02 ⇒ 标记确实只画在那三格）');
  const shots = [];
  shots.push(await shot('p2b-t4-02-threats-on.png'));
  shots.push(await shotGray('p2b-t4-03-threats-gray.png'));

  // ═══════════ ④ ⭐ 灰度可辨（DESIGN §6.2 的同一条判据）═══════════
  console.log('\n④ ⭐ 灰度下：两个标记彼此可辨、且都不会被读成棋子或空井');
  ok(P1.iou.m0m1 < 0.35,
    '① 两个标记的**剪影 IoU**=' + n3(P1.iou.m0m1) + ' < 0.35（⭐ 与颜色完全无关：'
    + '两方调成同一个灰度值它照样成立）');
  const d0 = Math.abs(P1.m0.center - P1.bg), d1 = Math.abs(P1.m1.center - P1.bg);
  ok(d0 > 45, '② 三角是**实心**的（中心 |Δbg|=' + n3(d0) + ' > 45）');
  ok(d1 < 25, '② 菱形是**空心**的（中心 |Δbg|=' + n3(d1) + ' < 25 ⇒ 井底透出来，与圆环同一条规律）');
  ok(d0 > d1 * 3, '② 中心对比度差 ' + n3(d0 / Math.max(d1, 0.001)) + '× > 3×');
  ok(P1.iou.m0p0 < 0.55 && P1.iou.m1p1 < 0.55,
    '③ 标记不会被读成**自己那一方的棋子**（IoU 三角/六边形=' + n3(P1.iou.m0p0)
    + '，菱形/圆环=' + n3(P1.iou.m1p1) + '，都 < 0.55）');
  ok(P1.iou.m0p1 < 0.55 && P1.iou.m1p0 < 0.55,
    '③ 也不会被读成**对方的**棋子（IoU 三角/圆环=' + n3(P1.iou.m0p1)
    + '，菱形/六边形=' + n3(P1.iou.m1p0) + '）');
  ok(P1.m0.ink < P1.p0.ink * 0.75 && P1.m1.ink < P1.p1.ink * 0.95,
    '③ 标记比棋子**小一圈**（ink 三角 ' + n3(P1.m0.ink) + ' vs 六边形 ' + n3(P1.p0.ink)
    + '；菱形 ' + n3(P1.m1.ink) + ' vs 圆环 ' + n3(P1.p1.ink) + '）');
  ok(P1.m0.ink > 0.10 && P1.m1.ink > 0.10,
    '④ 两个标记都与**空井**拉得开（ink ' + n3(P1.m0.ink) + ' / ' + n3(P1.m1.ink)
    + ' ≫ 空井 ' + n3(P1.empty.ink) + '）');

  // ═══════════ ⑥ ⭐ 关掉开关 ⇒ 同一个局面上标记全部消失 ═══════════
  console.log('\n⑥ ⭐ 关掉开关：同一个局面重放一遍，标记必须全部消失');
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('TOGGLE_HINTS'));
  const off1 = await page.evaluate(() => C4Settings.get('threatHints'));
  ok(off1 === false, '点一下开关 ⇒ threatHints=' + off1);
  console.log('   ' + (await shot('p2b-t4-04-home-off.png')));
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 4000 });
  for (const c of FIX_A) await playCol(c);
  await settle();
  const P2 = await probe();
  ok(JSON.stringify(P2.threats) === '[]', '关掉之后 G.threats 是空的（⛔ 连算都不算）');
  const cellsA = TA.map(t => P2.empty.per.find(x => x.c === t.c && x.r === t.r));
  ok(cellsA.every(x => x && x.ink < 0.02),
    '⭐ 刚才那三格现在的 ink = ' + cellsA.map(x => n3(x ? x.ink : 9)).join(' / ')
    + '（全部 < 0.02 ⇒ 真的没画）');
  ok(P2.p0.n === 3 && P2.p1.n === 3,
    '前提：局面一样（棋子数 ' + P2.p0.n + '/' + P2.p1.n + '）—— 不是「盘子空了所以没标记」');
  console.log('   ' + (await shot('p2b-t4-05-threats-off.png')));

  // 开回去（后面几节要它是开的）
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('TOGGLE_HINTS'));
  ok(await page.evaluate(() => C4Settings.get('threatHints')) === true, '再点一下开回来');

  // ═══════════ ⑤ ⭐ 同一格两方都能赢 ⇒ 两个标记都画 ═══════════
  console.log('\n⑤ ⭐ 同一格两方都能赢：两个标记都要画出来（那是全局最关键的一格）');
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 4000 });
  for (const c of FIX_B) await playCol(c);
  await settle();
  const P3 = await probe();
  ok(JSON.stringify(P3.threats.map(t => ({ c: t.c, r: t.r, players: t.players }))) === JSON.stringify(TB),
    '⭐ 与 node 侧逐格相同：' + JSON.stringify(P3.threats));
  ok(P3.both.n === 1, '前提：这一帧上确实有一个「两方同一格」（both.n=' + P3.both.n + '）');
  const bc = TB.find(t => t.players.length === 2);
  const PB = await probeBoth(bc.c, bc.r);
  console.log('   那一格左右两半：bg=' + n3(PB.bg)
    + ' 左中心=' + n3(PB.leftCenter) + '(|Δ|=' + n3(Math.abs(PB.leftCenter - PB.bg)) + ') ink=' + n3(PB.leftInk)
    + ' · 右中心=' + n3(PB.rightCenter) + '(|Δ|=' + n3(Math.abs(PB.rightCenter - PB.bg)) + ') ink=' + n3(PB.rightInk));
  ok(PB.leftInk > 0.08 && PB.rightInk > 0.08,
    '⭐ 左右两半**都**画了东西（ink ' + n3(PB.leftInk) + ' / ' + n3(PB.rightInk)
    + ' > 0.08 ⇒ 两个标记都在，⛔ 不是只画了一个）');
  ok(Math.abs(PB.leftCenter - PB.bg) > 45,
    '⭐ 左半是**实心三角**（中心 |Δbg|=' + n3(Math.abs(PB.leftCenter - PB.bg)) + ' > 45）');
  ok(Math.abs(PB.rightCenter - PB.bg) < 25,
    '⭐ 右半是**空心菱形**（中心 |Δbg|=' + n3(Math.abs(PB.rightCenter - PB.bg)) + ' < 25）'
    + ' ⇒ 两个标记各是各的形状，灰度下也分得清谁能在这里赢');
  console.log('   ' + (await shot('p2b-t4-06-double-threat.png')));

  // ═══════════ ⑦ ⭐⭐ 零搜索：整局人机跑完，EngineClient.scores 调用 0 次 ═══════════
  console.log('\n⑦ ⭐⭐ 零搜索（DESIGN §9.2 的断崖：scoreAll 中位 1,678 ms，而威胁高亮每帧都要算）');
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await page.waitForFunction(() => EngineClient.state().worker !== 'starting', null, { timeout: 20000 });
  ok(await page.evaluate(() => EngineClient.state().worker === 'alive'),
    '前置：求解器 Worker 活着（否则 EngineClient.ai 的计数会是 0，这条就测不出东西）');
  await clickAt(await pt('TIER', 'tier', 3));       // 轻松档：不调求解器、秒出
  await clickAt(await pt('PLAY_AI'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 4000 });
  let sawThreat = 0, plies = 0;
  for (let it = 0; it < 45; it++) {
    const s = await page.evaluate(() => ({ phase: G.phase, moves: G.g.moves.slice(),
                                           mine: C4State.isHumanTurn(G.g), th: (G.threats || []).length }));
    if (s.phase === 'OVER') break;
    if (s.th > 0) sawThreat++;
    plies++;
    if (!s.mine) {
      await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
        s.moves.length, { timeout: 20000 });
      continue;
    }
    const bd = B.fromMoves(s.moves);
    const col = R.moves(bd).slice().sort((a, b) => a - b)[0];   // 确定性：最左的合法列
    await playCol(col, 8000);
  }
  const cnt = await page.evaluate(() => ({ scores: window.__scores, ai: window.__ai,
                                           phase: G.phase, moves: G.g.moves.length,
                                           forks: G.forkCount }));
  ok(cnt.phase === 'OVER', '这一局真的下完了（' + cnt.moves + ' 手，phase=' + cnt.phase + '）');
  ok(cnt.ai > 0, '前提：整局里 EngineClient.ai 被调了 ' + cnt.ai + ' 次 ⇒ 引擎通道确实在用');
  ok(sawThreat > 0, '前提：途中 ' + sawThreat + '/' + plies +
    ' 手上真的算出过威胁 ⇒ 威胁这条路跑过了（⛔ 否则「零调用」是恒真的）');
  ok(cnt.scores === 0,
    '⭐⭐ **整局跑完 EngineClient.scores 调用 ' + cnt.scores + ' 次**（必须是 0）'
    + ' —— 威胁判据只走 B.isWinningMove，⛔ 一次求解器都不许碰'
    // ⭐ P2b T5 接上来的一句：双威胁判据（C4Threats.forkOf）也在**同一局**里跑过，
    //   走的也是 isWinningMove ⇒ 这条「零调用」同时罩住 §6.4 的上下两半。
    //   ⚠ 这里只报数不断言 >0：某一局恰好没形成双威胁是完全正常的；
    //     「fork 那条路真的跑过」由 e2e-p2b-t5 用确定性夹具钉死。
    + '（本局双威胁触发 ' + cnt.forks + ' 次，走的是同一批 isWinningMove）');
  console.log('   ' + (await shot('p2b-t4-07-vs-ai-over.png')));

  // ═══════════ ⑧ ⭐ 持久化：关 → **真的刷新** → 仍然是关 ═══════════
  console.log('\n⑧ ⭐ 设置持久化（⛔ 这条要能真的失败：把 threatHints 从 defaults 里拿掉，它必须红）');
  await clickAt(await pt('HOME'));            // ⚠ 结算屏也有［菜单］热区，直接回 HOME
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('TOGGLE_HINTS'));
  const stored = await page.evaluate(() => ({
    now: C4Settings.get('threatHints'),
    raw: localStorage.getItem(CFG.key('settings'))
  }));
  ok(stored.now === false, '关掉（' + stored.now + '）');
  ok(!!stored.raw && JSON.parse(stored.raw).threatHints === false,
    '⭐ **立刻**落盘了（localStorage["' + 'c4_settings' + '"] = ' + stored.raw + '）');

  await page.reload();
  await page.waitForFunction(
    () => window.G && window.C4Settings && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0, null, { timeout: 10000 });
  const after = await page.evaluate(() => ({
    v: C4Settings.get('threatHints'), all: C4Settings.all(),
    has: Object.prototype.hasOwnProperty.call(C4Settings.all(), 'threatHints')
  }));
  ok(after.v === false,
    '⭐⭐ **刷新页面之后仍然是关的**（get=' + JSON.stringify(after.v) + '）'
    + ' —— ⚠ 判据是 `=== false` 不是「假值」：字段被 merge 丢掉时读到的是 undefined，'
    + '那也是假值，用 `!x` 判会恒绿（snake 的 reduceMotion 就这么丢过）');
  ok(after.has === true && after.all.threatHints === false,
    '⭐ 字段本身还在（all()=' + JSON.stringify(after.all) + '）');

  // 反向：开回去也要活过一次刷新（⛔ 别只测一个方向）
  await clickAt(await pt('TOGGLE_HINTS'));
  await page.reload();
  await page.waitForFunction(
    () => window.G && window.C4Settings && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  const back = await page.evaluate(() => C4Settings.get('threatHints'));
  ok(back === true, '⭐ 开回去之后刷新，仍然是开的（' + JSON.stringify(back) + '）');

  ok(errs.length === 0, '全程零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  console.log('  · p2b-t4-00-home.png / 04-home-off.png（开关行 + 图例）');
  console.log('  · p2b-t4-01-no-threat.png（反向对照：无威胁）');
  console.log('  · p2b-t4-02-threats-on.png / 03-threats-gray.png（⭐ 灰度那张）');
  console.log('  · p2b-t4-05-threats-off.png（同一局面，开关关掉）');
  console.log('  · p2b-t4-06-double-threat.png（两方同一格）');
  console.log(failed === 0 ? '\ne2e-p2b-t4: 全部通过' : '\ne2e-p2b-t4: ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
