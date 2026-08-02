// ════════════════════════════════════════
// e2e-p2a.cjs —— P2a 的端到端门禁（Task 8）：**真实鼠标**把一整局打完。
//
// ⛔⛔ 本文件的第一条纪律：**一次都不许调 `dispatch()`**（也不许直接调 applyMove /
//   startGame / doUndo）。理由是本仓的实锤：blockblast 的某版 E2E 用 dispatch 驱动菜单，
//   报「零 error」全绿 —— 而真机上菜单里**每一次点击都抛 TypeError**，因为出错的正是
//   dispatch 之前的那一段（热区注册 / hitTest / 输入回调）。dispatch 驱动的测试测的是
//   「状态机对不对」，测不了「玩家点得动点不动」。⇒ 这里一律 `page.mouse.down/move/up`。
//
// ⛔ 第二条：**落点一律按热区的 action 名去找**（'COL' + data.col / 'UNDO' / 'AGAIN' /
//   'TIER' + data.tier / 'PLAY_AI' / 'PLAY_HUMAN' / 'HOME'），⛔ 不写任何绝对坐标。
//   这是本仓 15 套 E2E 在多次布局大改版下零适配全绿的唯一原因。
//
// ⚠ 页面里取全局的规矩（P1 终审那条坑）：`GameGlobal` / `hitAreas` / `T` / `CFG` / `Input`
//   在 canvas.js 等文件里是顶层 const/let ⇒ **全局词法绑定不是 window 属性**，
//   `window.GameGlobal` 恒 undefined ⇒ 必须用**裸标识符**。症状是 waitForFunction
//   **等到超时**而不是报错，极难查。反过来 `C4State` / `C4Render` / `EngineClient` /
//   `ConnectAI` 是 `root.X = API` ⇒ 两种写法都行；`G` 与 main.js 里的顶层
//   `function` 声明（firstSeatName / setThinking）是 window 属性 ⇒ 可以覆盖、可以取。
//
// ⭐ 覆盖清单（每条都是真实鼠标）：
//   ① 打开页面零 console error / pageerror
//   ② 人 vs 轻松档 AI 下完整局：终局判定正确 + **赢局连线真的画出来了**（量像素）
//   ③ ⭐⭐ 按住 > 500 ms 再松手，那一手必须落下（= T3 给引擎加三件套的**全部理由**：
//      onAction 只在 `dist<10 && dt<500` 才发，按住两秒那一手会被**静默丢掉**）
//   ④ 按住预览跟着指针走，松手落在**松手那一列**（不是按下那一列）—— 预览用像素量
//   ⑤ 按住后指针离开画布 ⇒ 清预览且**不落子**（真实鼠标移到 #controls 上，触发 mouseleave）
//   ⑥ 快点一下**只落一子**（onHoldEnd 与 onAction 都会发，main.js 的去重必须生效）
//   ⑦ 撤销 / 再来一局
//   ⑧ 同机双人连开两局，**先手换人**
//   ⑨ ⭐ 顶档必须玩家先手（DESIGN §1.1：后手对完美 AI 是数学上的必败）
//   ⑩ ⭐ 轻松档**不转菊花**（DESIGN §9.2：别让共用 loading 把轻松档拖得比顶档还重）
//
// ⚠ 人这一侧的着法由 node 侧**确定性规划器**给（见下 planner 那一节）：AI 是
//   (position, tier, seed) 的纯函数 ⇒ 对局树只在人这一侧分叉 ⇒ 可以真的搜出一条必胜线。
//   ⛔ 别对轻松档以外的档位这么玩：求解器档 n≤9 无库是 4-5 秒（DESIGN §11b）。
//
// ⚠ E2E（起浏览器）⇒ 照本仓惯例单独挂 script（`npm run test:c4:e2e`），⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2a\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8331;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2a');

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  \u2717 ' + m); failed++; } else console.log('  \u2713 ' + m); };

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

// ═══════════ node 侧：确定性规划器（人这一侧怎么走） ═══════════
// ⭐ 为什么可以「搜出必胜线」：`ConnectAI.aiMove(position, tier, seed)` 是纯函数
//   （DESIGN §2.3 的公平承诺签名本身），⇒ 给定 seed，AI 的每一手都是**确定的**，
//   整棵树只在人这一侧分叉，深度 5 的搜索就够把轻松档打穿（400 局离线自测 400 胜 0 负，
//   最长 10 手、最慢一次规划 8 ms）。
// ⚠ 每一手都**从页面上真实的局面重新规划**：万一 Worker 那边的回答与预测不符，
//   下一手照样接得住（而不是照着一条已经作废的计划往下走）。
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const AI = require('../js/ai.js');

const ORDER = [3, 2, 4, 1, 5, 0, 6];                     // 中路优先（找到必胜线更快）
const legal = bd => ORDER.filter(c => B.canPlay(bd, c));

/** 深度受限的必胜线搜索：depth = 人还能走几手。找到就立刻返回那一手。 */
function dfs(moves, depth, human, tier, seed, st) {
  const bd = B.fromMoves(moves);
  for (const c of legal(bd)) {
    const m1 = moves.concat([c]);
    const b1 = B.fromMoves(m1);
    if (B.winner(b1) === human) return c;
    if (B.isFull(b1) || depth === 1) continue;
    if (++st.n > st.budget) return null;
    const m2 = m1.concat([AI.aiMove(m1, tier, seed)]);   // ⭐ AI 的回答是确定的
    const b2 = B.fromMoves(m2);
    if (B.winner(b2) !== null || B.isFull(b2)) continue; // 这条线人输了/和了 ⇒ 换一列
    if (dfs(m2, depth - 1, human, tier, seed, st) !== null) return c;
  }
  return null;
}

/** 人这一手：能连四就连 → 有必胜线就照走 → 挡对方 → 不送头 → 中路。 */
function planHuman(moves, tier, seed, human) {
  const bd = B.fromMoves(moves);
  const ls = legal(bd);
  for (const c of ls) if (B.isWinningMove(bd, c)) return { col: c, why: 'win' };
  for (let d = 2; d <= 5; d++) {
    const st = { n: 0, budget: 40000 };
    const r = dfs(moves, d, human, tier, seed, st);
    if (r !== null) return { col: r, why: 'plan' + d };
    if (st.n > st.budget) break;
  }
  const threats = R.winningMoves(bd);                    // 轮到的是人 ⇒ 上面已查过；这里查对方
  const blocks = ls.filter(c => R.winningMoves(B.fromMoves(moves.concat([c]))).length === 0);
  if (threats.length) return { col: threats[0], why: 'block' };
  return { col: (blocks.length ? blocks : ls)[0], why: 'safe' };
}

/** 终局的独立复算（⛔ 不信页面自己的转述）。 */
function truthOf(moves) {
  const bd = B.fromMoves(moves);
  const t = R.terminal(bd);
  return { over: t !== null, winner: t === null ? undefined : R.winnerOf(t) };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  // ═══════════ ① 零 console error / pageerror ═══════════
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  // ── 小工具（全部走真实热区 / 真实鼠标）──
  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  /** ⭐ 按 action 名（可选 data 键值）取热区中心点。⛔ 全文件没有一个绝对坐标。 */
  async function pt(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {       // 与 hitTest 同序（后画的在上）
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

  const snap = () => page.evaluate(() => ({
    phase: G.phase, thinking: G.thinking, hoverCol: G.hoverCol, holdCol: G.holdCol,
    notice: G.notice, lastAiHeavy: G.lastAiHeavy, lastAiMs: G.lastAiMs,
    moves: G.g ? G.g.moves.slice() : null,
    mode: G.g ? G.g.mode : null, tier: G.g ? G.g.tier : null,
    gameNo: G.g ? G.g.gameNo : null, humanFirst: G.g ? G.g.humanFirst : null,
    seed: G.g ? G.g.seed : null,
    human: G.g ? C4State.humanPlayer(G.g) : null,
    isHumanTurn: G.g ? C4State.isHumanTurn(G.g) : null,
    result: G.result ? { winner: G.result.winner, line: G.result.line } : null,
    firstSeat: G.g ? firstSeatName(G.g) : null,
    engine: EngineClient.state()
  }));

  const nMoves = async () => (await page.evaluate(() => (G.g ? G.g.moves.length : -1)));
  /** 等到手数涨上去。⚠ **超时不抛**：落子没落下这件事必须由后面那条 `ok()` 报出来
   *  （一条 Playwright 的 Timeout 栈只说「等超时了」，不说是哪条判据坏了 —— 变异体实验
   *  里第一版就是这样，红是红了，但红得没告诉你为什么）。 */
  const waitLen = async (n, t) => {
    try {
      await page.waitForFunction(k => window.G.g && (window.G.g.moves.length >= k || window.G.phase === 'OVER'),
        n, { timeout: t || 4000 });
      return true;
    } catch (e) { return false; }
  };
  /** 同理：等一个条件，超时不抛（让紧跟着的 `ok()` 去报真正的判据）。 */
  const soft = (fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 4000 }).catch(() => {});

  /** 真实鼠标：快点一下（⇒ onHoldEnd 与 onAction **都会发**，去重必须生效）。 */
  async function clickAt(p) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); }
  /** 真实鼠标：按住 ms 毫秒再松手。 */
  async function holdAt(p, ms) {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const t0 = Date.now();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    return Date.now() - t0;
  }

  /** 悬停带里每一列的「墨量」（stddev）：有预览棋子的那一列会显著高于其余列。
   *  ⭐ 这是「预览真的画出来了」的**像素级**判据 —— 只断言 G.hoverCol 的话，
   *     渲染那一侧整个坏掉也照样绿。 */
  const bandInk = () => page.evaluate(() => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const S = Math.round(L.cell * dpr);
    const out = [];
    for (let c = 0; c < 7; c++) {
      const x = Math.round(L.cellX(c) * dpr);
      const y = Math.round((L.drop.y + L.drop.h / 2 - L.cell / 2) * dpr);
      const d = g2.getImageData(x, y, S, S).data;
      let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        s += g; s2 += g * g; n++;
      }
      out.push(Math.round(Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n))) * 10) / 10);
    }
    return out;
  });

  /** 赢局连线的像素判据：连线**穿过两枚棋子之间的缝** ⇒ 那里必须是一条很亮的线。 */
  const winSeam = () => page.evaluate(() => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const GRAY = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const line = G.result.line;
    const a = L.center(line[0].c, line[0].r), b = L.center(line[1].c, line[1].r);
    const grab = (px, py) => {
      const d = g2.getImageData(Math.round(px * dpr) - 3, Math.round(py * dpr) - 3, 7, 7).data;
      let mx = 0; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, GRAY(d, i));
      return mx;
    };
    // 参照点：盘上一个**不在连线上**的格子的缝（赢局那一帧其余部分是被 dim 压暗的）
    let ref = null;
    for (let c = 0; c < 7 && ref === null; c++) for (let r = 0; r < 5; r++) {
      if (line.some(p => (p.c === c && p.r === r) || (p.c === c && p.r === r + 1))) continue;
      const q0 = L.center(c, r), q1 = L.center(c, r + 1);
      ref = grab((q0.x + q1.x) / 2, (q0.y + q1.y) / 2); break;
    }
    return { seam: Math.round(grab((a.x + b.x) / 2, (a.y + b.y) / 2)), ref: Math.round(ref) };
  });

  /** 终局那一组判据（两局共用）：phase / winner 与 node 侧复算一致 / 连线四格 / 连线真的画了。
   *  ⚠ 每一条各自 ok() 且**不许因为上一条坏了就抛**（抛了就没有汇总，看不出到底红了几条）。 */
  async function checkOverAndLine(tag, s) {
    const truth = truthOf(s.moves);
    const res = s.result || {};
    ok(s.phase === 'OVER', tag + '一整局下完（phase=' + s.phase + '，moves=' + JSON.stringify(s.moves) + '）');
    ok(truth.over && !!s.result && res.winner === truth.winner,
      tag + '终局判定与 node 侧 rules-classic 复算一致（页面 winner=' + String(res.winner)
      + '，复算 winner=' + String(truth.winner) + '）');
    ok(!!res.line && res.line.length === 4,
      tag + '赢局连线有四格：' + JSON.stringify((res.line || []).map(p => [p.c, p.r])));
    if (!res.line || res.line.length !== 4) { ok(false, tag + '⭐ 赢局连线**画出来了**（没有连线可量）'); return; }
    const sm = await winSeam();
    ok(sm.seam > 200 && sm.seam > sm.ref + 60,
      tag + '⭐ 赢局连线**画出来了**（连线上的缝 gray=' + sm.seam + '，连线之外的缝 gray=' + sm.ref + '）');
  }

  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(
    () => window.G && window.C4State && window.C4Render && window.EngineClient
       && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  await page.waitForTimeout(400);

  console.log('\n① 加载');
  ok(errs.length === 0, '打开页面零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));
  const home = await snap();
  ok(home.phase === 'HOME', '首屏是标题屏（phase=' + home.phase + '）');
  console.log('   ' + (await shot('p2a-01-home.png')));

  // Worker 得活着，否则「人机对局」这一整段测的就不是本 task 的东西了 —— 说清楚再死
  await page.waitForFunction(() => EngineClient.state().worker !== 'starting', null, { timeout: 15000 });
  const eng = (await snap()).engine;
  ok(eng.worker === 'alive', '求解器 Worker 活着（worker=' + eng.worker + ' book=' + eng.book + '）');

  // ═══════════ ⑨ ⭐ 顶档必须玩家先手 ═══════════
  console.log('\n⑨ ⭐ 顶档（完美）必须玩家先手 —— DESIGN §1.1');
  await clickAt(await pt('TIER', 'tier', 20));
  await clickAt(await pt('PLAY_AI'));
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 4000 });
  const perfect = await snap();
  ok(perfect.tier === 20, '真实鼠标点［完美］＋［人机对战］开出的是顶档（tier=' + perfect.tier + '）');
  ok(perfect.humanFirst === true && perfect.human === 0 && perfect.isHumanTurn === true,
    '顶档开局：玩家先手且轮到玩家（humanFirst=' + perfect.humanFirst + '）');
  await page.waitForTimeout(900);
  const perfect2 = await snap();
  ok(perfect2.moves.length === 0 && perfect2.thinking === false,
    '顶档开局 AI **不抢先落子**、也不转菊花（moves=' + perfect2.moves.length + '）');
  // ⚠⚠ 上面那三条**单靠 gameNo=0 也会成立**（PLAY_AI 把 gameNo 归零 ⇒ 交替规则本来就给
  //   humanFirst=true）⇒ 只有它们的话，state.js 里那条「顶档强制让先」被删掉也照样全绿。
  //   而 UI 上唯一能走到「顶档 + 奇数 gameNo」的路是「顶档下完一整局再点［再来一局］」——
  //   顶档一整局是分钟级，不能进门禁。⇒ 这一层直接问 C4State（它就是那条规则的唯一住处）。
  const alt = await page.evaluate(() => ({
    top1: C4State.newGame({ mode: 'ai', tier: 20, gameNo: 1 }).humanFirst,
    top3: C4State.newGame({ mode: 'ai', tier: 20, gameNo: 3 }).humanFirst,
    easy1: C4State.newGame({ mode: 'ai', tier: 3, gameNo: 1 }).humanFirst,
    easy0: C4State.newGame({ mode: 'ai', tier: 3, gameNo: 0 }).humanFirst
  }));
  ok(alt.top1 === true && alt.top3 === true,
    '⭐ 顶档在**奇数局**（gameNo=1/3，交替规则本会让 AI 先手）仍强制玩家先手');
  ok(alt.easy1 === false && alt.easy0 === true,
    '同一条路径上轻松档照常交替（gameNo=0 → 玩家先，gameNo=1 → AI 先）⇒ 上一条不是恒真');
  console.log('   ' + (await shot('p2a-02-perfect-first.png')));
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });

  // ═══════════ ③④⑤⑥⑦⑧ 输入三件套 + 撤销/再来 + 双人先手（同机双人局） ═══════════
  // ⚠ 用同机双人局做输入测试：两侧都是人 ⇒ 没有 AI 在中间插手，落子与不落子都归因得清清楚楚。
  console.log('\n③④⑤⑥ 真实鼠标：按住 / 拖动预览 / 取消 / 快点');
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });

  // ⑥ 快点一下**只落一子**（onHoldEnd 与 onAction 都会发，main.js 的 'COL' 空分支去重）
  await clickAt(await pt('COL', 'col', 0));
  await waitLen(1);
  await page.waitForTimeout(200);                        // 给「第二次落子」一个真的会发生的窗口
  const s6 = await snap();
  ok(s6.moves.length === 1 && s6.moves[0] === 0,
    '⑥ 快点一下**只落一子**（moves=' + JSON.stringify(s6.moves) + '）');

  // ③ ⭐⭐ 按住 > 500 ms 再松手，那一手必须落下
  const held = await holdAt(await pt('COL', 'col', 1), 700);
  await waitLen(2);
  const s3 = await snap();
  ok(held >= 550, '   （这一次按住确实超过 500 ms：实测 ' + held + ' ms）');
  ok(s3.moves.length === 2 && s3.moves[1] === 1,
    '③ ⭐⭐ 按住 ' + held + ' ms 再松手，那一手**落下了**（moves=' + JSON.stringify(s3.moves) + '）');

  // ④ 按住预览跟着指针走，松手落在**松手那一列**
  const pFrom = await pt('COL', 'col', 2), pTo = await pt('COL', 'col', 5);
  await page.mouse.move(pFrom.x, pFrom.y);
  await page.mouse.down();
  const hov0 = (await snap()).hoverCol;
  await page.mouse.move(pTo.x, pTo.y, { steps: 10 });
  const hov1 = (await snap()).hoverCol;
  const ink = await bandInk();
  console.log('   ' + (await shot('p2a-03-preview-drag.png')));
  const inkMax = Math.max(...ink), inkArg = ink.indexOf(inkMax);
  const inkSecond = Math.max(...ink.filter((_, i) => i !== inkArg));
  ok(hov0 === 2, '④ 按下第 2 列 ⇒ 预览在第 2 列（hoverCol=' + hov0 + '）');
  ok(hov1 === 5, '④ 按住不放拖到第 5 列 ⇒ 预览**跟着走**（hoverCol=' + hov1 + '）');
  ok(inkArg === 5 && inkMax > inkSecond * 4,
    '④ 悬停带里的预览棋子**真的画在第 5 列**（各列墨量 ' + JSON.stringify(ink) + '）');
  await page.mouse.up();
  await waitLen(3);
  await page.waitForTimeout(150);
  const s4 = await snap();
  ok(s4.moves.length === 3 && s4.moves[2] === 5,
    '④ 松手落在**松手那一列**（第 5 列，不是按下的第 2 列）：moves=' + JSON.stringify(s4.moves));

  // ⑤ 取消：按住后把指针移出画布（真实鼠标移到 #controls 上 ⇒ canvas 收到 mouseleave）
  const ctrl = await page.evaluate(() => {
    const r = document.getElementById('controls').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  ok(ctrl.w > 2 && ctrl.h > 2, '   （#controls 有真实尺寸 ' + Math.round(ctrl.w) + '×' + Math.round(ctrl.h)
    + '，它盖在画布之上 ⇒ 指针移上去就是「离开画布」）');
  const nBeforeCancel = await nMoves();     // ⚠ 与前几条解耦：⑤ 只该为「取消」这件事红
  const pCancel = await pt('COL', 'col', 6);
  await page.mouse.move(pCancel.x, pCancel.y);
  await page.mouse.down();
  const hovC0 = (await snap()).hoverCol;
  await page.mouse.move(Math.round(ctrl.x + ctrl.w / 2), Math.round(ctrl.y + ctrl.h / 2), { steps: 12 });
  await page.waitForTimeout(120);
  const sCancel = await snap();
  const inkC = await bandInk();
  console.log('   ' + (await shot('p2a-04-cancelled.png')));
  await page.mouse.move(6, 6, { steps: 8 });             // 回到画布上再松手（⛔ 别在语言按钮上松）
  await page.mouse.up();
  await page.waitForTimeout(150);
  const sCancel2 = await snap();
  ok(hovC0 === 6, '⑤ 按下第 6 列 ⇒ 先有预览（hoverCol=' + hovC0 + '）');
  ok(sCancel.hoverCol === -1 && sCancel.holdCol === -1,
    '⑤ 指针离开画布 ⇒ **清预览**（hoverCol=' + sCancel.hoverCol + ' holdCol=' + sCancel.holdCol + '）');
  ok(Math.max(...inkC) < inkMax / 4,
    '⑤ 悬停带上确实**没有**预览棋子了（各列墨量 ' + JSON.stringify(inkC) + '，此前是 ' + inkMax + '）');
  ok(sCancel2.moves.length === nBeforeCancel,
    '⑤ 取消 ⇒ **不落子**（手数仍是 ' + nBeforeCancel + '：' + JSON.stringify(sCancel2.moves) + '）');

  // ⑦ 撤销（同机双人局：退一手）
  console.log('\n⑦ 撤销 / 再来一局　⑧ 同机双人先手交替');
  await clickAt(await pt('UNDO'));
  await soft(() => G.g.moves.length === 2);
  const s7 = await snap();
  ok(s7.moves.length === 2 && JSON.stringify(s7.moves) === JSON.stringify([0, 1]),
    '⑦ ［撤销］退掉最后一手（moves=' + JSON.stringify(s7.moves) + '）');

  // ⑧-a 把这一局下完：先手（棋子 0）在第 0 列连四
  for (const c of [0, 1, 0, 1, 0]) {
    const before = await nMoves();
    await clickAt(await pt('COL', 'col', c));
    if (!await waitLen(before + 1)) { ok(false, '双人局收官：第 ' + (before + 1) + ' 手（第 ' + c + ' 列）没落下'); break; }
  }
  await page.waitForTimeout(200);
  const over1 = await snap();
  await checkOverAndLine('', over1);
  console.log('   ' + (await shot('p2a-05-human-win.png')));

  // ⑧-b 再来一局 ⇒ 先手换人
  await clickAt(await pt('AGAIN'));
  await soft(() => G.phase === 'PLAYING' && G.g.moves.length === 0);
  const g2 = await snap();
  ok(g2.gameNo === over1.gameNo + 1 && g2.humanFirst === !over1.humanFirst,
    '⑦ ［再来一局］开出新的一局（gameNo ' + over1.gameNo + '→' + g2.gameNo + '）');
  ok(g2.firstSeat !== over1.firstSeat,
    '⑧ ⭐ 同机双人连开两局，**先手换人**：第 1 局「' + over1.firstSeat + '」先，第 2 局「' + g2.firstSeat + '」先');
  console.log('   ' + (await shot('p2a-06-again-swapped.png')));
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });

  // ═══════════ ②⑩ 人 vs 轻松档 AI，下完一整局 ═══════════
  console.log('\n②⑩ 人 vs 轻松档 AI：整局 + 不转菊花');
  // ⭐ 菊花探针：包住 window.setThinking（main.js 的顶层 function 声明是 window 属性，
  //   内部调用经全局对象解析 ⇒ 覆盖得到）。⚠ 探针自己要能证明**它是活的**：
  //   startGame/doUndo 每次都会调 setThinking(false) ⇒ 日志必须非空，否则这条断言是死的。
  await page.evaluate(() => {
    window.__think = [];
    const orig = window.setThinking;
    window.setThinking = function (on) { window.__think.push(!!on); return orig(on); };
  });
  await clickAt(await pt('TIER', 'tier', 3));
  await clickAt(await pt('PLAY_AI'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 4000 });
  const start = await snap();
  ok(start.tier === 3 && start.humanFirst === true, '轻松档人机局开局（tier=' + start.tier + '，玩家先手）');

  const seen = [];            // AI 每次面对的局面（结束后回头问 usesSolver）
  let mismatch = 0, aiMoves = 0, undone = false, humanMoves = 0;
  for (let it = 0; it < 60; it++) {
    const s = await snap();
    if (s.phase === 'OVER') break;
    if (s.isHumanTurn) {
      const plan = planHuman(s.moves, s.tier, s.seed, s.human);
      const p = await pt('COL', 'col', plan.col);
      // ⭐ 两种真实手势轮着来：快点一下 / 按住 600 ms 再松手 —— 整局里两条路都得能落子
      const gesture = humanMoves % 2 === 0 ? '快点' : '按住 600ms';
      if (humanMoves % 2 === 0) await clickAt(p); else await holdAt(p, 600);
      humanMoves++;
      if (!await waitLen(s.moves.length + 1, 6000)) {
        ok(false, '人机局里玩家的第 ' + humanMoves + ' 手（' + gesture + '，第 ' + plan.col + ' 列）**没落下**');
        break;
      }
    } else {
      const before = s.moves.length;
      seen.push(s.moves.slice());
      await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
        before, { timeout: 25000 });
      const after = await snap();
      aiMoves++;
      if (AI.aiMove(s.moves, s.tier, s.seed) !== after.moves[before]) mismatch++;
      ok(after.lastAiHeavy === false,
        '   AI 第 ' + aiMoves + ' 手：走第 ' + after.moves[before] + ' 列，耗时 ' + after.lastAiMs
        + ' ms，heavy=false');
      // ⑦ 撤销（人机局）：AI 刚回完第一手就撤 —— 必须退回**该玩家走**的位置
      if (!undone) {
        undone = true;
        await clickAt(await pt('UNDO'));
        await soft(() => G.g.moves.length === 0);
        const u = await snap();
        ok(u.moves.length === 0 && u.isHumanTurn === true,
          '⑦ 人机局［撤销］退回**玩家的回合**（moves=' + u.moves.length + '，轮到玩家=' + u.isHumanTurn + '）');
        humanMoves = 0;
      }
    }
  }
  const fin = await snap();
  console.log('   整局手数 ' + fin.moves.length + '：' + JSON.stringify(fin.moves));
  await checkOverAndLine('② ', fin);
  ok(!!fin.result && fin.result.winner === fin.human,
    '② 玩家赢下这一局（human=' + fin.human + '，winner=' + String(fin.result && fin.result.winner) + '）');
  ok(mismatch === 0, '   （Worker 里的 AI 与 node 侧 aiMove 逐手一致，' + aiMoves + ' 手 ' + mismatch + ' 处不符 ⇒ 确定性成立）');
  console.log('   ' + (await shot('p2a-07-ai-win.png')));

  // ⑩ ⭐ 轻松档全程没有转过菊花
  const think = await page.evaluate(() => window.__think.slice());
  ok(think.length > 0, '   （菊花探针是活的：整局记录到 ' + think.length + ' 次 setThinking 调用）');
  ok(think.every(v => v === false),
    '⑩ ⭐ 轻松档**全程没出现「思考中」**（setThinking(true) 出现 '
    + think.filter(Boolean).length + ' 次，应为 0）');
  const solverUse = await page.evaluate(ms => ms.map(m => ConnectAI.usesSolver(m, 3)), seen);
  ok(solverUse.every(v => v === false),
    '⑩ AI 面对的 ' + seen.length + ' 个局面在轻松档下**一个都不调求解器**（usesSolver 全 false）');

  // ═══════════ ① 收尾：全程零错误 ═══════════
  console.log('\n① 收尾');
  ok(errs.length === 0, '整场跑完仍是零 console error / pageerror'
    + (errs.length ? ' —— ' + errs.slice(0, 3).join(' | ') : ''));

  await browser.close();
  srv.close();
  console.log('\n截图 → ' + SHOT_DIR);
  if (failed) { console.error('\n\u2717 e2e-p2a 有 ' + failed + ' 条失败'); process.exit(1); }
  console.log('\n\u2713 e2e-p2a 全绿');
})().catch(e => { console.error('\u2717 e2e-p2a 崩了：' + (e && e.stack || e)); process.exit(1); });
