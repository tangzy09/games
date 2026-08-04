// ════════════════════════════════════════
// e2e-p2b-t5.cjs —— P2b **Task 5** 的端到端门禁：双威胁的专属时刻（DESIGN §6.4 下半）。
//
// §6.4：「⭐ **形成双威胁的那一刻给专属特效 + 音效** —— 把整个游戏最精彩的战术瞬间
//        变成一个能看见能听见的事件。」
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b / e2e-p2b-t4 同一条纪律：**一次都不许调 `dispatch()` /
//   `applyMove()`**，落子一律 `page.mouse`，落点一律按热区的 action 名取（⛔ 零绝对坐标）。
//
// 覆盖（每一条都配了会红的反向对照）：
//   ① 加载零报错
//   ② ⭐ **事件层正向 + 反向对照**：同一局里前几手（盘上**已经有单威胁**）一次都不许触发，
//      最后一手形成双威胁 ⇒ 恰好触发一次；触发的两格与 node 侧独立复算逐格相同
//   ②b ⭐ **音画同步**：`fork` 音必须响在**那枚棋子落地之后**（fx 的 lead 就是这么算的），
//      ⛔ 不是松手那一刻 —— 那时棋子还在半空，声音早到 ~270 ms
//   ③ ⭐ **像素正向 + 两条反向对照**（⛔ 逐张肉眼验收，见文件尾）：
//      同一个局面、同一份设置，**只有时间不同**的两帧对比：
//        · 炸开那一帧：两个落点真的画上了光环（ink ≫ 0）
//        · 播完那一帧：同样两格 ink 回到空井水平 ⇒ 画的确实是这个特效，不是别的常驻东西
//      · 同一帧里**其余空格必须干净** ⇒ 「每个空格都画点什么」的实现在这里就红了
//      ⚠ 这一节故意把**威胁提示开关关掉**跑：① 隔离掉 ▲/◇ 对 ink 的污染；
//        ② 顺带钉死「特效不吃那个开关」（§6.4 把「常驻标记」与「事件」分成了两条）
//      ⭐⭐ 还有一条**剪影 IoU**：光环与两方棋子的剪影都必须拉得开（与颜色无关，§6.2）——
//        这条是被截图倒逼出来的，两版实现都栽在「那一格看起来像落了一枚棋子」上（见 render.js）
//   ③b 触发方是**后手**时的同一套（⭐ 后手那一路才是真会翻车的：圆环 = 后手棋子的造型）
//   ③c ⭐⭐ **默认设置**（威胁提示开着）下的那一帧：▲ 与光环画在同一格 —— 只有肉眼看得出糊没糊
//   ④ ⭐ **不刷屏**：连续两手都形成双威胁的真实局面（随机对局搜出来的），
//      node 侧先证明两手**都**满足判据，浏览器里必须只触发**一次**（⛔ 要能真的失败）
//   ⑤ ⭐ **同一局面只触发一次**：撤销 → 重下同一手 ⇒ 计数与音效都不许再涨
//   ⑥ ⭐⭐ **零搜索**：以上全程 `EngineClient.scores` 调用 **0 次**，而 fork 真的触发过
//      （⚠ 「整局人机跑完 0 次」那半条在 e2e-p2b-t4 ⑦，⛔ 不在这里重复写）
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
const PORT = 8335;
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
// FORK：教科书式的双威胁 —— X 的三连**两端都开着** ⇒ (1,1) 与 (5,1) 两个落点，
//   对方只堵得住一个。⭐⭐ 这个夹具选得**不随便**：第 6/7/8 手盘上**已经有单威胁**
//   （node 侧当场自证）却一次都不许触发 —— 那就是 ② 的反向对照，而且是同一局、
//   同一条帧路径。⛔ 换成一个前几手连威胁都没有的夹具，这条反向对照就退化成
//   「盘子太空所以什么都没有」，等于没测。
const FIX_FORK = [1, 2, 2, 4, 4, 3, 3, 4, 5];
// TWICE：⭐ 连续两手**都**形成双威胁（随机对局搜出来的真实局面，逐手合法、无中途终局）。
const FIX_TWICE = [4, 3, 4, 2, 4, 1, 3, 3, 1, 4];
// P1：⭐ 触发方是**后手**的夹具 —— 光环用的是触发方的**威胁标记**形状
//   （先手 ▲ / 后手 ◇，render.js drawFork 那段 ⭐⭐），两条分支都要有断言 + 截图。
//   ⚠ 后手这条尤其要测：它曾经被画成圆环（= 后手棋子的造型），灰度下就是「这格有子了」。
const FIX_P1 = [6, 2, 2, 4, 4, 3];
// ⭐ 同一个 FIX_FORK 的第 9 手，换成这一列会形成**另一个**双威胁（两格不同）——
//   ⑤ 用它证明「撤销之后冷却被松开了」，⛔ 不是靠重下同一手（那条被去重挡着，测不到冷却）。
const ALT_COL = 3;

/** 第 i 手（1-based）走完之后，判据说这是不是「形成双威胁」。 */
const forkAt = (mv, i) => Th.forkOf(B.fromMoves(mv.slice(0, i - 1)), B.fromMoves(mv.slice(0, i)));

(async () => {
  // 夹具自证（⛔ 别让夹具坏了被读成被测代码坏了）
  for (const mv of [FIX_FORK, FIX_TWICE, FIX_P1]) {
    if (R.terminal(B.fromMoves(mv)) !== null) throw new Error('夹具必须非终局：' + JSON.stringify(mv));
    for (let i = 1; i < mv.length; i++) {
      if (R.terminal(B.fromMoves(mv.slice(0, i))) !== null) throw new Error('夹具中途终局：' + JSON.stringify(mv));
    }
  }
  const TF = forkAt(FIX_FORK, FIX_FORK.length);
  if (!TF) throw new Error('FIX_FORK 最后一手必须形成双威胁');
  if (FIX_FORK.slice(0, -1).some((_, i) => forkAt(FIX_FORK, i + 1))) throw new Error('FIX_FORK 前几手必须都不触发');
  const T9 = forkAt(FIX_TWICE, 9), T10 = forkAt(FIX_TWICE, 10);
  if (!T9 || !T10) throw new Error('FIX_TWICE 的第 9、10 手必须**都**满足判据');
  const TP1 = forkAt(FIX_P1, FIX_P1.length);
  if (!TP1 || TP1.player !== 1) throw new Error('FIX_P1 的触发方必须是后手');
  const TALT = forkAt(FIX_FORK.slice(0, -1).concat([ALT_COL]), FIX_FORK.length);
  if (!TALT) throw new Error('ALT_COL 必须也形成双威胁');
  if (JSON.stringify(TALT.cells) === JSON.stringify(TF.cells)) throw new Error('ALT_COL 必须是**另一个**双威胁');
  // ⭐ 反向对照的**前提**也写成硬校验：前几手盘上确实有单威胁（否则那条对照是恒真的）
  const preThreatPlies = FIX_FORK.slice(0, -1)
    .map((_, i) => Th.cells(B.fromMoves(FIX_FORK.slice(0, i + 1))).length)
    .filter(n => n > 0).length;
  if (preThreatPlies < 2) throw new Error('FIX_FORK 前几手必须出现过单威胁，否则 ② 的反向对照恒真');
  console.log('夹具：FORK 第 ' + FIX_FORK.length + ' 手 player=' + TF.player
    + ' cells=' + JSON.stringify(TF.cells.map(c => [c.c, c.r]))
    + '（前 ' + (FIX_FORK.length - 1) + ' 手里有 ' + preThreatPlies + ' 手盘上已有单威胁却不触发）');
  console.log('      P1 第 ' + FIX_P1.length + ' 手 player=' + TP1.player
    + ' cells=' + JSON.stringify(TP1.cells.map(c => [c.c, c.r])));
  console.log('      TWICE 第 9 手 p' + T9.player + JSON.stringify(T9.cells.map(c => [c.c, c.r]))
    + ' · 第 10 手 p' + T10.player + JSON.stringify(T10.cells.map(c => [c.c, c.r]))
    + '  ⇒ ⭐ 判据说两手都算，浏览器里必须只响一次');

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
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };

  /** 走一手真实鼠标并等它落稳（⚠ 等 moves 变长 + 动画播完，⛔ 不是等固定毫秒）。 */
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await clickAt(await pt('COL', 'col', col));
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 6000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  }
  /** ⚠ 走完把鼠标挪到盘外并重画：悬停高亮/落点虚影会污染像素判据。 */
  async function settle() {
    await page.mouse.move(5, 5);
    await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
  }
  async function newHumanGame() {
    // ⚠ 已经在 HOME 上时**没有** HOME 热区（drawHome 不画［菜单］）⇒ 先问一句再点
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await clickAt(await pt('HOME'));
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
    await clickAt(await pt('PLAY_HUMAN'));
    await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human' && G.g.moves.length === 0,
      null, { timeout: 4000 });
  }

  // ⭐⭐ 像素探针：按**格子中心的圆盘窗口**（半径 0.43 格）量灰度覆盖率。
  //   ⛔ 别用整格方窗：井的圆角边框会被算成 ink，「空井 ink ≈ 0」那条反向对照就恒假了。
  //   基准 bg = **不含双威胁那两格**的空井均值（含进去的话基准会被特效自己抬走）。
  const probeFork = cells => page.evaluate(a => {
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
    const isFork = (c, r) => a.cells.some(q => q.c === c && q.r === r);
    const forks = [], empties = [];
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      if (C4Render.cellOwner(bd, c, r) >= 0) continue;
      (isFork(c, r) ? forks : empties).push([c, r]);
    }
    let sum = 0, n = 0;
    for (const [c, r] of empties) {
      const m = cellGray(c, r);
      for (let i = 0; i < S * S; i++) if (inDisc[i]) { sum += m[i]; n++; }
    }
    const bg = n ? sum / n : 90;
    const maskOf = (c, r) => {
      const m = cellGray(c, r);
      const u = new Uint8Array(S * S);
      for (let i = 0; i < S * S; i++) if (inDisc[i] && Math.abs(m[i] - bg) > 25) u[i] = 1;
      return u;
    };
    const statOf = (c, r) => {
      const m = cellGray(c, r);
      let k = 0;
      for (let i = 0; i < S * S; i++) if (inDisc[i] && Math.abs(m[i] - bg) > 25) k++;
      // ⭐ 中心 3×3：**空心判据**（同 §6.2 / drawThreat 那条）——
      //   实心亮斑读起来就是「这格已经有子了」，而这格恰恰是空的。
      const mid = Math.floor(S / 2);
      let cs = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cs += m[(mid + dy) * S + mid + dx];
      return { c: c, r: r, ink: k / discN, center: cs / 9 };
    };
    // 参照：盘上真正的棋子长什么样（⇒ 「光环 ≠ 一枚棋子」这句话有个尺子）
    const pieces = { p0: [], p1: [] };
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      const o = C4Render.cellOwner(bd, c, r);
      if (o >= 0) pieces['p' + o].push([c, r]);
    }
    const avg = v => v.length ? v.reduce((x, y) => x + y, 0) / v.length : bg;
    // ⭐ **共识剪影**（过半的格子都是 ink）：与 e2e-p2b-t4 ④ 同一套 —— 它与颜色完全无关，
    //   两方调成同一个灰度值也照样成立（§6.2：约 8% 的男性有色觉障碍）。
    const consensus = list => {
      const acc = new Int32Array(S * S), out = new Uint8Array(S * S);
      for (const [c, r] of list) { const u = maskOf(c, r); for (let i = 0; i < S * S; i++) acc[i] += u[i]; }
      for (let i = 0; i < S * S; i++) if (acc[i] * 2 > list.length) out[i] = 1;
      return out;
    };
    const iou = (a, b) => {
      let inter = 0, uni = 0;
      for (let i = 0; i < S * S; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) uni++; }
      return uni ? inter / uni : 1;
    };
    const mFork = consensus(forks), m0 = consensus(pieces.p0), m1 = consensus(pieces.p1);
    return {
      bg: bg, S: S, cell: L.cell,
      p0Center: avg(pieces.p0.map(([c, r]) => statOf(c, r).center)),
      p1Center: avg(pieces.p1.map(([c, r]) => statOf(c, r).center)),
      iouP0: pieces.p0.length ? iou(mFork, m0) : null,
      iouP1: pieces.p1.length ? iou(mFork, m1) : null,
      fork: forks.map(([c, r]) => statOf(c, r)),
      empty: empties.map(([c, r]) => statOf(c, r))
    };
  }, { cells: cells });

  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(
    () => window.G && window.C4Render && window.C4Threats && window.C4Fx && window.C4Settings
       && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  await page.waitForTimeout(200);

  // ⭐⭐ 两个计数器，必须在开局**之前**装上（否则前几次调用会漏计）：
  //   · EngineClient 的 API 对象**没有冻结**（engine-client.js 结尾）⇒ 可以包一层；
  //   · Sfx 是 audio.js 顶层的 `const`（**词法绑定不是 window 属性**）⇒ 只能取裸标识符，
  //     但对象本身没冻结，换掉 .play 就行；main.js 是 `Sfx.play(...)` 调用时才取属性。
  await page.evaluate(() => {
    window.__scores = 0; window.__ai = 0; window.__sfx = [];
    const os = EngineClient.scores, oa = EngineClient.ai;
    EngineClient.scores = function () { window.__scores++; return os.apply(EngineClient, arguments); };
    EngineClient.ai = function () { window.__ai++; return oa.apply(EngineClient, arguments); };
    const op = Sfx.play;
    Sfx.play = function (n) { window.__sfx.push({ n: n, t: performance.now() }); return op.call(Sfx, n); };
  });
  const sfxLog = () => page.evaluate(() => window.__sfx.slice());
  const clearSfx = () => page.evaluate(() => { window.__sfx.length = 0; });

  console.log('\n① 加载');
  ok(errs.length === 0, '打开页面零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  // ═══════════ ② ⭐ 事件层：前 6 手一次不触发，第 7 手恰好一次 ═══════════
  console.log('\n② ⭐ 「形成双威胁的那一刻」才触发（前几手是同一局里的反向对照）');
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });
  await clearSfx();
  let preMax = 0, sawThreat = 0;
  for (const c of FIX_FORK.slice(0, -1)) {
    await playCol(c);
    const s = await page.evaluate(() => ({ n: G.forkCount, th: (G.threats || []).length,
                                           sfx: window.__sfx.filter(x => x.n === 'fork').length }));
    preMax = Math.max(preMax, s.n + s.sfx);
    if (s.th > 0) sawThreat++;
  }
  ok(preMax === 0, '⭐ 前 ' + (FIX_FORK.length - 1) + ' 手 forkCount 与 fork 音**全程都是 0**（累计 '
    + preMax + '） —— ⛔ 「只要有威胁就响」的实现在这里就红了');
  ok(sawThreat >= 2, '前提：这几手里有 ' + sawThreat + ' 手盘上**已经有威胁格**（单威胁）'
    + ' ⇒ 上面那个 0 不是「盘子太空所以什么都没有」');

  await playCol(FIX_FORK[FIX_FORK.length - 1]);
  const afterFork = await page.evaluate(() => ({
    n: G.forkCount, last: G.lastFork, sfx: window.__sfx.slice()
  }));
  ok(afterFork.n === 1, '⭐ 最后一手之后 forkCount = ' + afterFork.n + '（必须恰好 1）');
  ok(JSON.stringify(afterFork.last && afterFork.last.cells) === JSON.stringify(TF.cells),
    '⭐ 触发的两格与 node 侧逐格相同：' + JSON.stringify(afterFork.last && afterFork.last.cells));
  ok(afterFork.last && afterFork.last.player === TF.player,
    '触发方 player=' + (afterFork.last && afterFork.last.player) + '（node 侧 ' + TF.player + '）');
  const forkPlays = afterFork.sfx.filter(x => x.n === 'fork');
  ok(forkPlays.length === 1, '⭐ `fork` 音恰好响一次（' + forkPlays.length + ' 次）');

  // ②b ⭐ 音画同步：光环 + 音必须等那枚棋子落地
  const dropPlay = afterFork.sfx.filter(x => x.n === 'drop').pop();
  const landPlay = afterFork.sfx.filter(x => /^land/.test(x.n)).pop();
  const gap = forkPlays.length && dropPlay ? forkPlays[0].t - dropPlay.t : -1;
  const lead = await page.evaluate(() => C4Fx.planDrop(C4Fx.fallForRow(0)).tf);
  console.log('   松手（drop 音）→ fork 音 = ' + Math.round(gap) + ' ms，'
    + 'fx 算出来的 lead（那枚棋子的自由落体时长）= ' + Math.round(lead) + ' ms');
  ok(gap >= lead * 0.8 && gap <= lead + 400,
    '⭐ `fork` 音响在**那枚棋子落地之后**（' + Math.round(gap) + ' ms ∈ ['
    + Math.round(lead * 0.8) + ', ' + Math.round(lead + 400) + ']）'
    + ' —— ⛔ 松手就响的实现会给出 ≈0，那时棋子还在半空');
  ok(!!landPlay && !!forkPlays.length && landPlay.t <= forkPlays[0].t,
    '⭐ 顺序上 land（' + (landPlay ? landPlay.n : '无') + '）不晚于 fork ⇒ 音画同步的方向是对的');

  // ═══════════ ⑤ ⭐ 同一局面只触发一次（撤销 → 重下同一手）═══════════
  console.log('\n⑤ ⭐ 同一局面只触发一次：撤销之后重下同一手，不许再响');
  // ⚠ P2c T4：双人局的悔棋要对方同意（§6.7）⇒ 两下（请求 + 同意），下同。
  await clickAt(await pt('UNDO'));
  await clickAt(await pt('UNDO_OK'));
  await page.waitForFunction(k => window.G.g.moves.length < k, FIX_FORK.length, { timeout: 4000 });
  await clearSfx();
  await playCol(FIX_FORK[FIX_FORK.length - 1]);
  const afterUndo = await page.evaluate(() => ({
    n: G.forkCount, moves: G.g.moves.slice(), sfx: window.__sfx.filter(x => x.n === 'fork').length
  }));
  ok(JSON.stringify(afterUndo.moves) === JSON.stringify(FIX_FORK),
    '前提：撤销后重下同一手，局面回到了一模一样的位置（' + JSON.stringify(afterUndo.moves) + '）');
  ok(afterUndo.n === 1 && afterUndo.sfx === 0,
    '⭐ 计数仍然是 ' + afterUndo.n + '、这一轮 fork 音响了 ' + afterUndo.sfx + ' 次'
    + '（⛔ 把 main.js 的 _forkKeys 去重去掉，这条变成 2/1 ⇒ 红）');
  // ⭐⭐ 上面那条**曾经是恒绿的**（变异实验当场抓到，本仓「加了断言但抓不住」的第六次未遂）：
  //   冷却比的是**手数**，而撤销让手数倒退 ⇒ `ply - _forkPly ≤ 0` 把一切都压住了，
  //   把 `_forkKeys` 整段删掉照样全绿。⇒ main.js 的 doUndo 现在调 `forkRewind()` 松开冷却。
  //   ⚠ 那就必须再钉一条**反向**的：撤销之后换一手**别的**双威胁，它必须**照样能响** ——
  //     ⛔ 少了这条，「冷却在撤销后永久压死一切」这个真 bug 没有任何门禁看得见。
  await clickAt(await pt('UNDO'));
  await clickAt(await pt('UNDO_OK'));
  await page.waitForFunction(k => window.G.g.moves.length < k, FIX_FORK.length, { timeout: 4000 });
  await playCol(ALT_COL);
  const alt = await page.evaluate(() => ({ n: G.forkCount, last: G.lastFork }));
  ok(alt.n === 2 && JSON.stringify(alt.last.cells) === JSON.stringify(TALT.cells),
    '⭐⭐ 撤销后换成第 ' + ALT_COL + ' 列（**另一个**双威胁）⇒ forkCount ' + alt.n
    + '、两格 ' + JSON.stringify(alt.last.cells)
    + '（⛔ doUndo 里去掉 forkRewind()，冷却会把它永久压住 ⇒ 这条红）');

  // ═══════════ ④ ⭐ 不刷屏：连续两手都是双威胁 ═══════════
  console.log('\n④ ⭐ 不刷屏：连续两手**都**满足判据时，只许响一次');
  await newHumanGame();
  await clearSfx();
  for (const c of FIX_TWICE) await playCol(c);
  const tw = await page.evaluate(() => ({
    n: G.forkCount, last: G.lastFork, sfx: window.__sfx.filter(x => x.n === 'fork').length
  }));
  ok(tw.n === 1 && tw.sfx === 1,
    '⭐ 第 9、10 手 node 侧**都**满足判据，浏览器里 forkCount=' + tw.n + ' / fork 音 ' + tw.sfx
    + ' 次（都必须是 1）—— ⛔ 把 main.js 的 FORK_MIN_GAP 冷却去掉，这条会变成 2/2');
  ok(tw.last && tw.last.ply === 9,
    '响的是**先形成的**那一手（第 ' + (tw.last && tw.last.ply) + ' 手），⛔ 不是最后一手');
  await settle();
  console.log('   ' + (await shot('p2b-t5-03-twice.png')) + '（连续两手都是双威胁，只响了第 9 手）');

  // ═══════════ ③ ⭐ 像素：同一局面同一设置，只有时间不同的两帧 ═══════════
  console.log('\n③ ⭐ 像素：光环真的画在那两格上了（⚠ 本节把威胁提示**关掉**跑）');
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('TOGGLE_HINTS'));
  ok(await page.evaluate(() => C4Settings.get('threatHints')) === false,
    '把威胁提示关掉（① 隔离 ▲/◇ 对 ink 的污染 ② 顺带证明特效不吃这个开关）');
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 4000 });
  for (const c of FIX_FORK.slice(0, -1)) await playCol(c);
  await settle();

  // ⭐⭐ 把 rAF 换成空操作**再**落最后一手 ⇒ 动画一帧都不会自己往前走，
  //   之后由测试用 C4Fx.step 精确推到指定时刻。⛔ 别去「抢拍某一帧」：那是不确定的，
  //   而这个特效恰恰是转瞬即逝的 —— 抢不准就会变成一条时灵时不灵的门禁。
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => null; });
  const before3 = await page.evaluate(() => G.g.moves.length);
  await clickAt(await pt('COL', 'col', FIX_FORK[FIX_FORK.length - 1]));
  await page.waitForFunction(k => window.G.g.moves.length > k, before3, { timeout: 4000 });
  await settle();
  const froze = await page.evaluate(() => {
    const p = C4Fx.poseFork();
    return { hints: C4Settings.get('threatHints'), threats: (G.threats || []).length,
             t: p ? p.t : -1, lead: p ? p.lead : -1, total: p ? p.total : -1, n: G.forkCount };
  });
  ok(froze.t === 0 && froze.lead > 0,
    '⭐ 动画被冻在起点（t=' + froze.t + '，lead=' + Math.round(froze.lead)
    + ' ms）⇒ 下面量的是**指定的那一帧**，不是抢到的某一帧');
  ok(froze.hints === false && froze.threats === 0,
    '⭐ 威胁提示确实是关的（G.threats=' + froze.threats + '）⇒ 下面那两格上的 ink 只可能来自特效本身');

  const stepTo = t => page.evaluate(tt => {
    const p = C4Fx.poseFork();
    if (p && tt > p.t) C4Fx.step(tt - p.t);
    renderAll();
    const q = C4Fx.poseFork();
    return q ? { t: q.t, rings: q.rings.slice(), flash: q.flash, phase: q.phase } : null;
  }, t);

  const burstAt = froze.lead + 90;                    // 第一圈刚散开、中心闪还在
  const atBurst = await stepTo(burstAt);
  ok(!!atBurst && atBurst.phase === 'burst',
    '推到 t=' + Math.round(burstAt) + ' ms（phase=' + (atBurst && atBurst.phase)
    + '，rings=' + (atBurst ? atBurst.rings.map(n3).join('/') : '?')
    + '，flash=' + (atBurst ? n3(atBurst.flash) : '?') + '）');
  const PB = await probeFork(TF.cells);
  const burstShot = await shot('p2b-t5-01-fork-burst.png');
  console.log('   实测（灰度 0..255，格 ' + PB.S + '×' + PB.S + ' 设备像素，空井基准 bg=' + n3(PB.bg) + '）：');
  console.log('     双威胁两格 ink = ' + PB.fork.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · '));
  console.log('     其余 ' + PB.empty.length + ' 个空格 ink 最大 = '
    + n3(PB.empty.reduce((a, b) => Math.max(a, b.ink), 0)));
  ok(PB.fork.length === 2, '前提：这一帧上确实是两个落点（' + PB.fork.length + '）');
  const burstMin = Math.min.apply(null, PB.fork.map(x => x.ink));
  ok(burstMin > 0.10,
    '⭐ **两个落点每一个都真的画上了光环**（最小 ink ' + n3(burstMin) + ' > 0.10）');
  // ⭐⭐ 这一条是本 task 唯一一条**由看图倒逼出来**的断言：第一版画的是「实心软光斑 + 圆环」，
  //   截图上那两格就是**两枚 teal 色的棋子**。脚本当时全绿（ink 甚至是 1.000）——
  //   ⇒ 光有「画了东西」不够，必须钉死「画的**不是一枚棋子**」：中心要透出井底。
  const cMax = Math.max.apply(null, PB.fork.map(x => Math.abs(x.center - PB.bg)));
  console.log('     中心 |Δbg|：光环 ' + PB.fork.map(x => n3(Math.abs(x.center - PB.bg))).join(' / ')
    + '  ← 参照：先手棋子 ' + n3(Math.abs(PB.p0Center - PB.bg))
    + ' · 后手棋子 ' + n3(Math.abs(PB.p1Center - PB.bg)));
  ok(cMax < 25,
    '⭐⭐ 光环**中心仍然透出井底**（最大 |Δbg|=' + n3(cMax) + ' < 25）⇒ 它读不成「这格有子了」'
    + ' —— ⛔ 实心光斑的实现在这里红');
  ok(cMax < Math.abs(PB.p0Center - PB.bg) / 3,
    '⭐ 与真棋子的中心对比度差 ' + n3(Math.abs(PB.p0Center - PB.bg) / Math.max(cMax, 0.001))
    + '×（≥3×）⇒ 灰度下也不会被读成一枚棋子');
  // ⭐⭐ 剪影层面同一件事（与颜色完全无关 ⇒ 两方调成同一个灰度值也成立，§6.2）：
  //   ⚠ 第二版把光环画成「触发方自己那枚棋子的轮廓」，先手看着没事，**后手就是一圈圆环**
  //     —— 而圆环正是后手棋子的造型，灰度下 glow(~217) 与奶白(~232) 几乎同亮。
  //   ⇒ 光环用的是**威胁标记**那两个形状（▲/◇），这条 IoU 就是它的门禁。
  console.log('     剪影 IoU：光环 vs 先手棋子 = ' + n3(PB.iouP0) + ' · vs 后手棋子 = ' + n3(PB.iouP1));
  ok(PB.iouP0 < 0.55 && PB.iouP1 < 0.55,
    '⭐⭐ 光环的**剪影**与两方棋子都拉得开（IoU ' + n3(PB.iouP0) + ' / ' + n3(PB.iouP1)
    + '，都 < 0.55）⇒ ⛔ 不会被读成「这格已经有子了」');
  const emptyMaxB = PB.empty.reduce((a, b) => Math.max(a, b.ink), 0);
  ok(emptyMaxB < 0.02,
    '⭐ 反向对照 ①：同一帧里其余 ' + PB.empty.length + ' 个空格仍然干净（最大 ink '
    + n3(emptyMaxB) + ' < 0.02）⇒ 光环确实只画在那两格上');

  // ⭐ 反向对照 ②：把同一个动画推到播完 —— 局面、设置、连一个像素的静态内容都没变，
  //   只有时间变了 ⇒ 那两格的 ink 必须掉回空井水平。
  const totalT = froze.total + 50;
  const atEnd = await stepTo(totalT);
  ok(atEnd === null, '推到 t=' + Math.round(totalT) + ' ms ⇒ 特效已经播完（poseFork=null）');
  const PE = await probeFork(TF.cells);
  const endShot = await shot('p2b-t5-02-fork-after.png');
  console.log('     播完之后同样两格 ink = ' + PE.fork.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · '));
  const endMax = Math.max.apply(null, PE.fork.map(x => x.ink));
  ok(endMax < 0.02,
    '⭐ 反向对照 ②：**同一个局面、同一份设置**，只有时间不同 ⇒ 那两格 ink 回到 '
    + n3(endMax) + ' < 0.02（⇒ 上面量到的确实是这个特效，⛔ 不是别的常驻东西）');
  ok(burstMin > endMax * 5,
    '⭐ 两帧差距 ' + n3(burstMin) + ' vs ' + n3(endMax) + '（≥5×）');
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; });

  // ═══════════ ③b ⭐ 触发方是**后手**：光环换成后手自己那枚棋子的轮廓 ═══════════
  console.log('\n③b ⭐ 后手触发时，光环是**菱形 ◇**（⛔ 不是圆环 —— 圆环是后手棋子的造型）');
  await newHumanGame();
  for (const c of FIX_P1.slice(0, -1)) await playCol(c);
  await settle();
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => null; });
  const beforeP1 = await page.evaluate(() => G.g.moves.length);
  await clickAt(await pt('COL', 'col', FIX_P1[FIX_P1.length - 1]));
  await page.waitForFunction(k => window.G.g.moves.length > k, beforeP1, { timeout: 4000 });
  await settle();
  const fp1 = await page.evaluate(() => {
    const p = C4Fx.poseFork();
    return { n: G.forkCount, player: G.lastFork && G.lastFork.player, t: p ? p.t : -1, lead: p ? p.lead : -1 };
  });
  ok(fp1.n === 1 && fp1.player === 1,
    '⭐ 后手形成的双威胁也触发（forkCount=' + fp1.n + '，player=' + fp1.player + '）');
  await stepTo(fp1.lead + 90);
  const PP = await probeFork(TP1.cells);
  const p1Shot = await shot('p2b-t5-04-fork-p1.png');
  console.log('   两格 ink = ' + PP.fork.map(x => '(' + x.c + ',' + x.r + ')=' + n3(x.ink)).join(' · ')
    + '，中心 |Δbg| = ' + PP.fork.map(x => n3(Math.abs(x.center - PP.bg))).join(' / '));
  ok(Math.min.apply(null, PP.fork.map(x => x.ink)) > 0.10,
    '⭐ 后手那两格也真的画上了（最小 ink ' + n3(Math.min.apply(null, PP.fork.map(x => x.ink))) + '）');
  ok(Math.max.apply(null, PP.fork.map(x => Math.abs(x.center - PP.bg))) < 25,
    '⭐ 中心同样透出井底（最大 |Δbg|='
    + n3(Math.max.apply(null, PP.fork.map(x => Math.abs(x.center - PP.bg)))) + ' < 25）');
  ok(PP.empty.reduce((a, b) => Math.max(a, b.ink), 0) < 0.02,
    '⭐ 其余空格干净（最大 ink ' + n3(PP.empty.reduce((a, b) => Math.max(a, b.ink), 0)) + '）');
  console.log('   剪影 IoU：光环 vs 先手棋子 = ' + n3(PP.iouP0) + ' · vs 后手棋子 = ' + n3(PP.iouP1));
  ok(PP.iouP0 < 0.55 && PP.iouP1 < 0.55,
    '⭐⭐ **后手这一路才是真正会翻车的那条**（圆环 = 后手棋子的造型）：剪影 IoU '
    + n3(PP.iouP0) + ' / ' + n3(PP.iouP1) + ' 都 < 0.55 ⇒ ⛔ 读不成「这里有一枚后手的子」');
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; });

  // 开回去（⛔ 别把设置留在关的状态污染别的门禁）
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('TOGGLE_HINTS'));
  ok(await page.evaluate(() => C4Settings.get('threatHints')) === true, '威胁提示开回去');

  // ═══════════ ③c ⭐ **默认设置下**那一帧（威胁提示开着 —— 真实玩家看到的就是这张）═══════════
  // ⚠ 上面两节为了隔离 ink 把提示关掉了；⛔ 不能就这么收工：默认是**开**的，
  //   ▲/◇ 与光环会画在**同一格**上 —— 那一帧糊不糊只有肉眼看得出来（本仓两次实锤都在这类帧上）。
  console.log('\n③c ⭐ 默认设置（威胁提示开着）下的那一帧 —— ⛔ 这张必须肉眼看');
  await newHumanGame();
  for (const c of FIX_FORK.slice(0, -1)) await playCol(c);
  await settle();
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => null; });
  const beforeD = await page.evaluate(() => G.g.moves.length);
  await clickAt(await pt('COL', 'col', FIX_FORK[FIX_FORK.length - 1]));
  await page.waitForFunction(k => window.G.g.moves.length > k, beforeD, { timeout: 4000 });
  await settle();
  const leadD = await page.evaluate(() => C4Fx.poseFork().lead);
  await stepTo(leadD + 90);
  const dft = await page.evaluate(a => ({
    hints: C4Settings.get('threatHints'),
    marked: a.cells.every(q => (G.threats || []).some(t => t.c === q.c && t.r === q.r))
  }), { cells: TF.cells });
  ok(dft.hints === true && dft.marked,
    '⭐ 默认设置下：那两格上**同时**有常驻标记 ▲ 与光环（threatHints=' + dft.hints + '）'
    + ' ⇒ 两套东西画在同一格上，⛔ 这张必须肉眼确认不糊');
  const defShot = await shot('p2b-t5-05-fork-hints-on.png');
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; });

  // ═══════════ ⑥ ⭐⭐ 零搜索 ═══════════
  console.log('\n⑥ ⭐⭐ 零搜索（DESIGN §9.2 的断崖：scoreAll 中位 1,678 ms，而这条判据每落一子都要跑）');
  const cnt = await page.evaluate(() => ({ scores: window.__scores, ai: window.__ai }));
  ok(cnt.scores === 0,
    '⭐⭐ 以上全部场景跑完 `EngineClient.scores` 调用 ' + cnt.scores + ' 次（必须是 0）'
    + ' —— 双威胁判据只走 C4Threats.forkOf（≤14 次 B.isWinningMove）');
  ok(cnt.ai === 0, '前提：本文件全是双人局 ⇒ EngineClient.ai 也是 ' + cnt.ai
    + ' 次（「引擎通道确实在用」那半条由 e2e-p2b-t4 ⑦ 的整局人机负责，⛔ 不在这里重复）');

  ok(errs.length === 0, '全程零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  console.log('  · ' + burstShot + '（⭐ 光环炸开那一帧：三连两端的 '
    + TF.cells.map(c => '(' + c.c + ',' + c.r + ')').join(' 与 ') + ' 各一圈**三角**轮廓）');
  console.log('  · ' + endShot + '（⭐ 同一局面、播完之后 —— 对照帧，那两格必须干净）');
  console.log('  · p2b-t5-03-twice.png（连续两手都是双威胁，只响了第 9 手；⚠ 此帧特效已播完，'
    + '看的是「(2,1) 那格两方都能赢」的常驻标记还在）');
  console.log('  · ' + p1Shot + '（⭐ 后手触发：光环是**菱形**轮廓 —— ⛔ 不是圆环，圆环是后手棋子的造型）');
  console.log('  · ' + defShot + '（⭐⭐ **默认设置**下那一帧：常驻标记 ▲ 与光环同格，看糊没糊）');
  console.log(failed === 0 ? '\ne2e-p2b-t5: 全部通过' : '\ne2e-p2b-t5: ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
