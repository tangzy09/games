// ════════════════════════════════════════
// e2e-p2b.cjs —— P2b 的端到端门禁。**Task 2（落子物理下落）+ Task 3（赢局那 3 秒）。**
//
// ⛔⛔ 与 e2e-p2a 同一条纪律：**一次都不许调 `dispatch()` / `applyMove()`**，
//   落子一律 `page.mouse.down/up`，落点一律按热区的 action 名取（⛔ 零绝对坐标）。
//   （blockblast 实锤：dispatch 驱动的 E2E 报「零 error」全绿，而真机上每一次点击都抛。）
//
// ⭐ 这里的核心判据是**像素**，不是标志位：
//   ⛔ 断言 `C4Fx.active() > 0` 是没有用的 —— 动画状态机在跑、渲染那一侧没接上，
//     它照样绿，而玩家看到的是棋子瞬移。⇒ 连拍多帧，**量棋子在画布上的 y**。
//   ⚠ 配反向对照：动画播完之后**强制重画**再连拍，y 必须纹丝不动
//     （光断言「在动」的话，一个永远在抖的实现也能骗过去）。
//
// ⭐⭐ 另一条是本仓铁律（casual-game-meta §6 / solitaire 实踩：发牌动画 1 秒内点击全被吞）：
//   **落子动画期间不许锁输入。** 第一枚还在飞的时候真实点第二列，第二手必须落下。
//   ⚠ 这条自带前提检查：点第二下的**那一刻** `C4Fx.active()` 必须 > 0，
//     否则动画早播完了，断言变成恒真（本项目「加了断言但抓不住」已出现过五次）。
//
// 覆盖：
//   ① 零 console error / pageerror
//   ② ⭐ 棋子的 y 逐帧在变（+ 起点在悬停带、终点精确落在格心）
//   ③ ⭐ 反向对照：播完后强制重画连拍三帧，y 完全不动
//   ④ ⛔ 空闲时 rAF 必须停（G.rafId === null，别空转烧电）
//   ⑤ ⭐⭐ 动画期间连续落子，第二手必须生效
//   ⑥ ⭐ 落定音随深度变调真的接上了（land0 / land1 …）+ 震动被调用 + 松手播 drop
//
// ── Task 3（DESIGN §6.3 最后一段 + §6.5）──
//   ⑧ ⭐⭐ **连线是逐段出的**：连拍每一帧，量画布上那条线的**可见长度**，它必须在长；
//         ⛔ 断言「winLine 有四格」是没有用的（P2a 就有了，一次性全出照样绿）。
//         配反向对照：播完之后强制重画连拍五帧，长度纹丝不动。
//   ⑨ ⭐ 四枚**依次点亮**：四格各自的「亮起时刻」必须严格错开（⛔ 不是同一帧一起亮）。
//   ⑩ ⭐ 时间**放慢**：连线开始画的时刻必须晚于「不慢放时这枚棋子的落地时刻」。
//   ⑪ ⭐⭐ 结算节奏（§6.5 红线）：**从终局到主 CTA［再来一局］拿到焦点态 ≤ 5 秒**，
//         同时 ⛔ 不许趋近 0（那是把庆祝删掉，不是快）。
//   ⑫ ⭐⭐ 庆祝期间**照样点得动**：真实鼠标在庆祝没播完时点［再来一局］必须立刻开新局。
//   ⑬ 输局：播的是 lose（不是 win），⚠ §6.6 —— ⛔ 输局不许多出任何惩罚性反馈。
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script（`npm run test:c4:p2b`），⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2b\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// node 侧的独立复算 + 「怎么故意输掉一局」的确定性规划（⑬ 用）。
// ⭐ 与 e2e-p2a 同一条理由：`ConnectAI.aiMove(position, tier, seed)` 是纯函数 ⇒ 对局树
//   只在人这一侧分叉，可以**离线搜出**一条「人一定输」的线，再用真实鼠标照着走。
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const AI = require('../js/ai.js');
const Fx = require('../js/fx.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8332;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2b');

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

// ═══════════ node 侧：怎么**故意输掉**一局（⑬ 要一张真的输局帧）═══════════
// ⚠ 人这一侧的策略是「⛔ 绝不自己连四 → 优先送给 AI 一个立刻能连四的机会」，
//   AI 的回答确定 ⇒ 整条线离线就能验完，⛔ 不靠「多打几局总会输」的运气。
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const legal = bd => ORDER.filter(c => B.canPlay(bd, c));

function dfsLose(moves, depth, human, tier, seed, st) {
  const bd = B.fromMoves(moves);
  const cand = legal(bd).map(c => {
    const b1 = B.fromMoves(moves.concat([c]));
    return { c: c, self: B.winner(b1) === human, gift: R.winningMoves(b1).length };
  }).filter(x => !x.self)                       // ⛔ 绝不自己赢（那这条线就白搜了）
    .sort((a, b) => b.gift - a.gift);            // 送得越狠越先试
  for (const x of cand) {
    const m1 = moves.concat([x.c]);
    if (B.isFull(B.fromMoves(m1))) continue;
    if (++st.n > st.budget) return null;
    const m2 = m1.concat([AI.aiMove(m1, tier, seed)]);
    const w = B.winner(B.fromMoves(m2));
    if (w !== null && w !== human) return [x.c];              // ⭐ AI 赢了
    if (w !== null || B.isFull(B.fromMoves(m2)) || depth === 1) continue;
    const rest = dfsLose(m2, depth - 1, human, tier, seed, st);
    if (rest) return [x.c].concat(rest);
  }
  return null;
}
/** 这一手怎么走才输得掉；null = 这一步搜不出（调用方降级到「不挡就行」）。 */
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
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  /** 按 action 名（可选 data 键值）取热区中心点。⛔ 全文件没有一个绝对坐标。 */
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
  async function clickAt(p) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); }

  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(
    () => window.G && window.C4Render && window.C4Fx
       && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
       && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
    null, { timeout: 10000 });
  await page.waitForTimeout(300);

  // ⭐ 音效/震动改成**记录**（headless 里本来也发不出声，但「调了没调、调的是哪一个」
  //   正是 DESIGN §6.3 那条「随深度变调」在产品里唯一能被验的地方）。
  // ⚠ 用裸标识符：Sfx / Haptics 在 engine/audio.js 里是顶层 const ⇒ **不是 window 属性**。
  await page.evaluate(() => {
    window.__sfx = []; window.__hap = [];
    Sfx.play = n => window.__sfx.push(n);
    Haptics.light = () => window.__hap.push('light');
    Haptics.medium = () => window.__hap.push('medium');
    Haptics.heavy = () => window.__hap.push('heavy');
  });

  console.log('\n① 加载');
  ok(errs.length === 0, '打开页面零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  // 同机双人局：两侧都是人 ⇒ 没有 AI 在中间插手，落子与不落子都归因得清清楚楚
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });
  ok(await page.evaluate(() => G.rafId === null && C4Fx.done()),
    '开局时没有动画在跑，rAF 是停的（G.rafId === null）');

  // ═══════════ ② ⭐ 逐帧量棋子的 y ═══════════
  // 采样器自己起一条 rAF：在每一帧读画布，算**这一列里深色像素的质心 y**。
  // 先手是近墨黑的实心六边形（gray≈27），井 90 / 盘体 114 / 页面 240 ⇒ 阈值 45 只圈得住它。
  const COL = 0;
  const sampler = (col) => new Promise(resolve => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const x0 = Math.round((L.cellX(col) + L.cell * 0.2) * dpr);
    const w = Math.max(1, Math.round(L.cell * 0.6 * dpr));
    const y0 = Math.round(L.drop.y * dpr);
    const h = Math.round((L.boardY + L.boardH - L.drop.y) * dpr);
    const measure = () => {
      const d = g2.getImageData(x0, y0, w, h).data;
      let n = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (g < 45) { n++; sy += Math.floor((i / 4) / w); }
      }
      return n ? Math.round(((y0 + sy / n) / dpr) * 100) / 100 : null;
    };
    const out = [];
    let after = 0;
    function tick() {
      // ⭐ 播完之后的那几帧**强制重画**再量：否则画布只是没人动过，
      //   「y 不再变」会变成恒真（那是反向对照，不能是恒真）。
      if (C4Fx.done()) renderAll();
      out.push({ y: measure(), done: C4Fx.done(), raf: G.rafId !== null, active: C4Fx.active() });
      if (C4Fx.done() && ++after >= 4) { resolve({ out: out, rest: L.center(col, 0).y, cell: L.cell }); return; }
      if (out.length > 400) { resolve({ out: out, rest: L.center(col, 0).y, cell: L.cell }); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  console.log('\n② ⭐ 落子物理下落：逐帧量棋子的 y（像素判据，⛔ 不是标志位）');
  const p0 = await pt('COL', 'col', COL);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.up();
  const S = await page.evaluate(sampler, COL);
  const ys = S.out.map(s => s.y);
  const moving = S.out.filter(s => !s.done).map(s => s.y);
  const settled = S.out.filter(s => s.done).map(s => s.y);

  ok(ys.every(y => y !== null), '每一帧都量到了棋子（没有一帧是空的）：' + JSON.stringify(ys));
  ok(moving.length >= 3, '⭐ 动画期间至少连拍到三帧（实测 ' + moving.length + ' 帧）');
  const first3 = moving.slice(0, 3);
  ok(first3.length === 3 && first3[1] > first3[0] && first3[2] > first3[1],
    '⭐ 头三帧棋子的 y **确实在往下变**：' + JSON.stringify(first3));
  ok(moving.length >= 2 && moving[moving.length - 1] - moving[0] > S.cell * 2,
    '⭐ 全程掉了 ' + (moving.length ? (moving[moving.length - 1] - moving[0]).toFixed(1) : '?') +
    ' px（> 2 格 = ' + (S.cell * 2).toFixed(0) + ' px），是真的从悬停带掉到底');
  // 单调：允许微弹那一下往上走一点点，但**不许**倒着爬回去
  const backs = [];
  for (let i = 1; i < moving.length; i++) if (moving[i] < moving[i - 1] - 0.5) backs.push(moving[i - 1] - moving[i]);
  ok(backs.every(b => b <= S.cell * 0.35),
    '下落全程单调向下，只有撞底后的微弹（最大回弹 ' +
    (backs.length ? Math.max.apply(null, backs).toFixed(1) : '0') + ' px ≤ ' + (S.cell * 0.35).toFixed(0) + ' px）');

  // ═══════════ ③ ⭐ 反向对照：播完之后 y 必须稳定，且**精确落在格心** ═══════════
  console.log('\n③ ⭐ 反向对照：动画结束后强制重画三帧，y 必须纹丝不动');
  ok(settled.length >= 3, '播完后拿到 ' + settled.length + ' 帧（每帧都强制 renderAll 重画）');
  const spread = settled.length ? Math.max.apply(null, settled) - Math.min.apply(null, settled) : 999;
  ok(spread < 0.5, '⭐ 播完之后 y 完全不动（三帧极差 ' + spread.toFixed(2) + ' px）：' + JSON.stringify(settled));
  const restErr = Math.abs(settled[settled.length - 1] - S.rest);
  ok(restErr < S.cell * 0.25,
    '⭐ 落点**恰好停在目标格**（量到 y=' + settled[settled.length - 1] + '，格心 y=' + S.rest.toFixed(1) +
    '，差 ' + restErr.toFixed(1) + ' px < ' + (S.cell * 0.25).toFixed(0) + ' px）');
  const jump = Math.abs(settled[0] - moving[moving.length - 1]);
  ok(jump < S.cell * 0.2, '动画最后一帧 → 静态帧不跳（差 ' + jump.toFixed(1) + ' px）');

  // ═══════════ ④ ⛔ 空闲时 rAF 必须停 ═══════════
  console.log('\n④ ⛔ 没有动画在跑时 rAF 必须停下来（别空转烧电）');
  await page.waitForTimeout(200);
  const idle = await page.evaluate(() => ({ raf: G.rafId, done: C4Fx.done(), active: C4Fx.active() }));
  ok(idle.raf === null && idle.done && idle.active === 0,
    '空闲时 G.rafId === null（实测 ' + JSON.stringify(idle) + '）');
  ok(S.out.some(s => !s.done && s.raf), '⇒ 反过来：动画期间 rAF 确实是开着的（不是从头到尾都没起）');

  // ═══════════ ⑥ ⭐ 音效接线：drop + 随深度变调的 land ═══════════
  console.log('\n⑥ ⭐ 落定音随深度变调真的接上了（DESIGN §6.3）');
  const a1 = await page.evaluate(() => ({ sfx: window.__sfx.slice(), hap: window.__hap.slice() }));
  ok(a1.sfx[0] === 'drop', '松手开始掉时播 drop（实测 ' + JSON.stringify(a1.sfx) + '）');
  ok(a1.sfx.includes('land0'), '⭐ 落在**最底行**播的是 land0（最低音）');
  ok(a1.hap.length === 1, '落定震动被调了恰好一次（' + JSON.stringify(a1.hap) + '）');

  // 同一列再落一枚 ⇒ 停在第 1 行 ⇒ 必须是 land1（⛔ 反向对照：不是恒播 land0）
  await page.evaluate(() => { window.__sfx = []; window.__hap = []; });
  await clickAt(await pt('COL', 'col', COL));
  await page.waitForFunction(() => C4Fx.done() && G.g.moves.length >= 2, null, { timeout: 4000 });
  const a2 = await page.evaluate(() => window.__sfx.slice());
  ok(a2.includes('land1') && !a2.includes('land0'),
    '⭐ 叠在上一枚之上那一手播的是 land1（⛔ 不是恒播 land0）：' + JSON.stringify(a2));

  // ═══════════ ⑤ ⭐⭐ 动画期间不许锁输入 ═══════════
  console.log('\n⑤ ⭐⭐ 落子动画期间连续落子，第二手必须生效（casual-game-meta §6 铁律）');
  const before = await page.evaluate(() => G.g.moves.length);
  const pA = await pt('COL', 'col', 3), pB = await pt('COL', 'col', 5);
  await page.mouse.move(pA.x, pA.y); await page.mouse.down(); await page.mouse.up();
  // ⚠ 前提：点第二下的那一刻动画必须真的还在飞，否则这条断言是恒真的
  const activeNow = await page.evaluate(() => C4Fx.active());
  await page.mouse.move(pB.x, pB.y); await page.mouse.down(); await page.mouse.up();
  const activeAtSecond = await page.evaluate(() => C4Fx.active());
  ok(activeNow > 0, '前提检查：点第二下之前第一枚**确实还在飞**（active=' + activeNow + '）');
  const mv = await page.evaluate(() => G.g.moves.slice());
  ok(mv.length === before + 2 && mv[mv.length - 2] === 3 && mv[mv.length - 1] === 5,
    '⭐⭐ 两手都落下了（moves=' + JSON.stringify(mv) + '）—— 动画没有吞掉第二次点击');
  ok(activeAtSecond >= 1, '第二手落下时盘上有 ' + activeAtSecond + ' 枚在飞（两枚可以同时下落）');
  console.log('   ' + (await shot('p2b-t2-01-two-in-flight.png')));

  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });
  console.log('   ' + (await shot('p2b-t2-02-settled.png')));

  // 撤销必须把在飞的那枚一起撤掉（⛔ 否则半空中会留一枚已经不在盘上的棋子）
  console.log('\n⑦ 撤销 / 回菜单必须把在飞的棋子一起停掉');
  await page.mouse.move(pA.x, pA.y); await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => C4Fx.active());
  await clickAt(await pt('UNDO'));
  const afterUndo = await page.evaluate(() => ({ raf: G.rafId, active: C4Fx.active() }));
  ok(afterUndo.active === 0 && afterUndo.raf === null,
    '撤销之后没有棋子还在飞、rAF 也停了（' + JSON.stringify(afterUndo) + '）');

  // ════════════════════════════════════════════════════════════════
  //                   Task 3：赢局那 3 秒 + 结算节奏
  // ════════════════════════════════════════════════════════════════

  /** 按 action 名取热区**矩形**（焦点态的像素探针要贴着按钮边量）。 */
  async function rectOf(action) {
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
  }

  /** ⭐ 焦点态的像素判据：按钮**外面**那一圈的「绿度」（g-r）。
   *  ⚠ 为什么不量灰度：焦点环是 #8ff0cd（gray≈217），页面底色是 #eef3f0（gray≈240）——
   *    环比底色**更暗**，量灰度会得出「亮度没变」的错误结论。绿度上两者差 60 倍。 */
  const ringGreen = (rc) => page.evaluate(r => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const x = Math.round(r.x * dpr), w = Math.round(r.w * dpr);
    const y = Math.round((r.y - 7) * dpr), h = Math.max(1, Math.round(5 * dpr));
    const d = g2.getImageData(x, y, w, h).data;
    let mx = 0;
    for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i + 1] - d[i]);
    return mx;
  }, rc);

  /** 走一步真实鼠标并等它落到盘上（⚠ 等的是 moves 变长，⛔ 不是等固定毫秒）。 */
  async function playCol(col, timeout) {
    const before = await page.evaluate(() => G.g.moves.length);
    await clickAt(await pt('COL', 'col', col));
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: timeout || 4000 });
  }

  // ⭐⭐ 逐帧采样器：量的是**画布像素**，不是标志位。
  //   ① 沿连线取 61 个点，⛔ 扔掉落在棋子里的那些（那里连线被棋子盖住，量到的是棋子不是线）
  //      ⇒ 「可见长度」= 从起点数起、连续「已画出」的采样点占比。
  //   ② 四个赢局格各自的最大亮度 ⇒ 「第 i 枚什么时候亮起来的」。
  //   ③ 播完之后**强制 renderAll 再量**（反向对照：不强制重画的话「不再变」是恒真的）。
  const winSampler = () => new Promise(resolve => {
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
    const t0 = performance.now();
    const out = [];
    let extra = 0;
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
    function tick() {
      const settled = C4Fx.done() && G.overReady;
      if (settled) renderAll();                      // ⭐ 反向对照
      const buf = g2.getImageData(X0, Y0, WP, HP).data;
      let k = 0;
      while (k < pts.length && maxGray(buf, pts[k].x, pts[k].y, 2) > 170) k++;
      const cells = line.map(p => {
        const q = L.center(p.c, p.r);
        return Math.round(maxGray(buf, q.x, q.y, Math.round(L.cell * 0.5 * dpr)));
      });
      out.push({
        t: Math.round(performance.now() - t0),
        len: Math.round(k / pts.length * 1000) / 1000,
        cells: cells, done: C4Fx.done(), ready: G.overReady,
        again: hitAreas.some(h => h.action === 'AGAIN')
      });
      if (settled && ++extra >= 5) { resolve({ out: out, n: pts.length, cell: L.cell }); return; }
      if (out.length > 600) { resolve({ out: out, n: pts.length, cell: L.cell }); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // ═══════════ ⑧⑨⑩⑪ 双人局：先手（六边形）走出一条**斜线**四连 ═══════════
  // ⚠ 为什么用斜线：竖线上相邻两枚的缝只有 0.09 格宽，连线的白芯几乎全被棋子盖住，
  //   量不出「画到哪儿了」；斜线上两枚中心相距 √2 格 ⇒ 中间有一大段只有线没有棋子。
  console.log('\n⑧⑨⑩⑪ ⭐⭐ 赢局那 3 秒（DESIGN §6.3 最后一段）');
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await clickAt(await pt('PLAY_HUMAN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });
  // (0,0)(1,1)(2,2)(3,3) 四连：先手走 0/1/3/2/4，后手被动填 1/2/2/3/3
  const DIAG = [0, 1, 1, 2, 3, 2, 2, 3, 4, 3];
  for (const c of DIAG) await playCol(c);
  const preWin = await page.evaluate(() => ({ phase: G.phase, moves: G.g.moves.slice() }));
  ok(preWin.phase === 'PLAYING', '⑧ 前置：铺完 10 手仍未终局（phase=' + preWin.phase + '）');
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });   // 上一手落稳再开拍

  const wallT0 = Date.now();
  await clickAt(await pt('COL', 'col', 3));         // ⭐ 决胜的那一手
  const W = await page.evaluate(winSampler);
  const wallReady = Date.now() - wallT0;

  const lens = W.out.map(s => s.len);
  const during = W.out.filter(s => !s.done);
  const after = W.out.filter(s => s.done && s.ready);
  console.log('   连线可见长度逐帧（' + W.out.length + ' 帧，采样点 ' + W.n + ' 个）：' +
    JSON.stringify(lens));
  console.log('   四格亮度逐帧：' + JSON.stringify(W.out.map(s => s.cells)));

  // ⑧ ⭐⭐ 长度在增长
  const grew = [];
  for (let i = 1; i < during.length; i++) if (during[i].len > during[i - 1].len) grew.push(during[i].len);
  ok(during.length >= 8, '⑧ 庆祝期间连拍到 ' + during.length + ' 帧');
  ok(lens[0] < 0.05, '⑧ ⭐ 第一帧连线**还没开始画**（len=' + lens[0] + '）');
  ok(grew.length >= 5, '⑧ ⭐⭐ 连线可见长度**在增长**：' + grew.length +
    ' 次逐帧变长（⛔ 一次性全出的实现这里恒为 0-1 次）');
  const mids = during.filter(s => s.len > 0.15 && s.len < 0.85);
  ok(mids.length >= 4, '⑧ ⭐⭐ 真的拍到了「画了一半」的中间态 ' + mids.length +
    ' 帧（⛔ 一次性全出 = 0 帧）');
  for (let i = 1; i < during.length; i++) {
    if (during[i].len < during[i - 1].len - 0.001) {
      ok(false, '⑧ 连线长度倒退了：第 ' + i + ' 帧 ' + during[i - 1].len + ' → ' + during[i].len);
      break;
    }
  }
  // 反向对照：播完之后强制重画五帧，长度必须一模一样
  const aLens = after.map(s => s.len);
  ok(after.length >= 5, '⑧ 播完后拿到 ' + after.length + ' 帧（每帧都强制 renderAll 重画）');
  ok(aLens.length > 0 && Math.max.apply(null, aLens) - Math.min.apply(null, aLens) < 0.001
     && aLens[0] >= 0.99,
    '⑧ ⭐ 反向对照：播完之后长度稳定在整条（' + JSON.stringify(aLens) + '）');

  // ⑨ ⭐ 四枚**依次**点亮
  const litAt = [0, 1, 2, 3].map(i => {
    const base = W.out[0].cells[i];
    for (const s of W.out) if (s.cells[i] > base + 60) return s.t;
    return -1;
  });
  ok(litAt.every(v => v >= 0), '⑨ 四格都亮起来了（亮起时刻 ' + JSON.stringify(litAt) + ' ms）');
  let seq = true;
  for (let i = 1; i < 4; i++) if (!(litAt[i] > litAt[i - 1] + 60)) seq = false;
  ok(seq, '⑨ ⭐ 四枚**依次**点亮，时刻严格错开：' + JSON.stringify(litAt) +
    ' ms（⛔ 一起亮的实现四个数会挤在一起）');

  // ⑩ ⭐ 时间放慢：连线开始画 = 赢的那枚落地。它必须**晚于**不慢放时的落地时刻。
  const firstDraw = (W.out.find(s => s.len > 0) || { t: -1 }).t;
  const tfNoSlow = Fx.planDrop(Fx.fallForRow(3)).tf;      // 这一手落在 r=3
  ok(firstDraw > tfNoSlow * 1.35,
    '⑩ ⭐ 时间真的放慢了：连线在 ' + firstDraw + ' ms 才开始画，而不慢放时这枚棋子 ' +
    Math.round(tfNoSlow) + ' ms 就落地了（' + (firstDraw / tfNoSlow).toFixed(2) + '×）');
  ok(firstDraw < 900, '⑩ 慢放没有过头（' + firstDraw + ' ms 内连线已经开始画）');

  // ⑪ ⭐⭐ 结算节奏（DESIGN §6.5 红线：结算超过 5 秒就是打断节奏）
  const clk = await page.evaluate(() => ({ overAt: G.overAt, readyAt: G.readyAt, ready: G.overReady }));
  const appMs = Math.round(clk.readyAt - clk.overAt);
  ok(clk.ready === true, '⑪ 庆祝结束后主 CTA 进入焦点态（G.overReady=true）');
  ok(appMs <= 5000 && wallReady <= 5000,
    '⑪ ⭐⭐ **终局 → ［再来一局］可点且拿到焦点态 ' + (appMs / 1000).toFixed(2) + ' 秒**' +
    '（真实鼠标到手的墙钟 ' + (wallReady / 1000).toFixed(2) + ' 秒）≤ 5 秒 —— DESIGN §6.5');
  ok(appMs >= 400,
    '⑪ ⛔ 反向对照：结算不是「把庆祝删掉」换来的快（实测 ' + appMs + ' ms，庆祝确实播了）');
  ok(W.out[0].again === true,
    '⑪ ⭐⭐ ［再来一局］的热区在**终局第一帧**就注册了（⛔ 庆祝期间不许没按钮可点）');
  const ringOn = await ringGreen(await rectOf('AGAIN'));
  console.log('   ' + (await shot('p2b-t3-01-celebrate-end.png')));

  // ═══════════ ⑫ ⭐⭐ 庆祝期间照样点得动（本仓铁律）═══════════
  console.log('\n⑫ ⭐⭐ 庆祝还没播完，真实鼠标点［再来一局］必须立刻开新局');
  await clickAt(await pt('AGAIN'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.moves.length === 0,
    null, { timeout: 4000 });
  for (const c of [0, 1, 0, 1, 0, 1]) await playCol(c);   // 竖线四连：先手第 0 列
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 4000 });
  await clickAt(await pt('COL', 'col', 0));
  await page.waitForTimeout(560);
  const mid1 = await page.evaluate(() => ({ ready: G.overReady, phase: G.phase, prog: (C4Fx.poseWin() || {}).prog }));
  console.log('   ' + (await shot('p2b-t3-02-celebrate-mid.png')) +
    '（prog=' + (mid1.prog == null ? '-' : mid1.prog.toFixed(2)) + '）');
  await page.waitForTimeout(180);
  const mid2 = await page.evaluate(() => ({ ready: G.overReady, prog: (C4Fx.poseWin() || {}).prog }));
  console.log('   ' + (await shot('p2b-t3-03-celebrate-mid2.png')) +
    '（prog=' + (mid2.prog == null ? '-' : mid2.prog.toFixed(2)) + '）');
  ok(mid1.phase === 'OVER' && mid1.ready === false && mid2.ready === false,
    '⑫ 前提检查：这两张截图**确实**拍在庆祝中途（overReady 仍是 false）');
  const ringOff = await ringGreen(await rectOf('AGAIN'));
  ok(ringOn > ringOff + 40,
    '⑪ ⭐ 焦点态是**画出来的**不是只有个标志位：按钮外圈绿度 ' + ringOff + ' → ' + ringOn);
  await clickAt(await pt('AGAIN'));                      // ⭐ 庆祝没播完就点
  const restarted = await page.waitForFunction(
    () => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 3000 }
  ).then(() => true, () => false);
  ok(restarted, '⑫ ⭐⭐ 庆祝期间点［再来一局］**立刻开了新局**（⛔ 动画不许吞掉点击）');
  const clean = await page.evaluate(() => ({ raf: G.rafId, active: C4Fx.active(), ready: G.overReady }));
  ok(clean.active === 0 && clean.raf === null && clean.ready === false,
    '⑫ 新局开出来时庆祝被彻底停掉（' + JSON.stringify(clean) + '）');

  // ═══════════ ⑬ 输局：播 lose，⚠ §6.6 别加惩罚性反馈 ═══════════
  console.log('\n⑬ 输局（人机·轻松档）：播的是 lose，不是 win');
  await clickAt(await pt('HOME'));
  await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
  await page.waitForFunction(() => EngineClient.state().worker !== 'starting', null, { timeout: 15000 });
  const engOk = await page.evaluate(() => EngineClient.state().worker === 'alive');
  ok(engOk, '⑬ 前置：求解器 Worker 活着（否则这一段测的不是本 task 的东西）');
  await clickAt(await pt('TIER', 'tier', 3));
  await clickAt(await pt('PLAY_AI'));
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 4000 });
  await page.evaluate(() => { window.__sfx = []; window.__hap = []; });
  const gi = await page.evaluate(() => ({ seed: G.g.seed, tier: G.g.tier, human: C4State.humanPlayer(G.g) }));
  for (let it = 0; it < 40; it++) {
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
  await page.waitForFunction(() => G.phase === 'OVER' && G.overReady, null, { timeout: 9000 })
    .catch(() => {});
  const lost = await page.evaluate(() => ({
    phase: G.phase, winner: G.result && G.result.winner, human: C4State.humanPlayer(G.g),
    moves: G.g.moves.slice(), sfx: window.__sfx.slice(), hap: window.__hap.slice(),
    ms: Math.round(G.readyAt - G.overAt)
  }));
  const truth = B.winner(B.fromMoves(lost.moves));
  ok(lost.phase === 'OVER' && lost.winner !== null && lost.winner === truth,
    '⑬ 这一局真的下完了，且终局判定与 node 侧复算一致（winner=' + String(lost.winner) +
    '，复算 ' + String(truth) + '，' + lost.moves.length + ' 手）');
  ok(lost.winner !== lost.human, '⑬ 前提检查：**玩家输了**这一局（human=' + lost.human + '）');
  ok(lost.sfx.includes('lose') && !lost.sfx.includes('win'),
    '⑬ ⭐ 输局播的是 lose、⛔ 没有播 win：' + JSON.stringify(lost.sfx.slice(-4)));
  ok(lost.hap.filter(h => h !== 'light' && h !== 'medium').length === 0,
    '⑬ ⚠ §6.6：输局没有多出任何惩罚性的重震动（震动记录 ' + JSON.stringify(lost.hap.slice(-3)) + '）');
  ok(lost.ms <= 5000,
    '⑬ ⭐ 输局的结算同样 ' + (lost.ms / 1000).toFixed(2) + ' 秒 ≤ 5 秒（⛔ 输局不许拖）');
  console.log('   ' + (await shot('p2b-t3-04-lose.png')));

  ok(errs.length === 0, '全程零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  await browser.close();
  srv.close();
  console.log('\n采样帧 y（' + S.out.length + ' 帧）：' + JSON.stringify(ys));
  console.log('⭐ 终局 → ［再来一局］焦点态：' + (appMs / 1000).toFixed(2) + ' 秒（墙钟 ' +
    (wallReady / 1000).toFixed(2) + ' 秒）；输局 ' + (lost.ms / 1000).toFixed(2) + ' 秒');
  console.log(failed === 0 ? '\ne2e-p2b(T2+T3): 全部通过' : '\ne2e-p2b(T2+T3): ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
