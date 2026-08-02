// ════════════════════════════════════════
// e2e-p2b.cjs —— P2b 的端到端门禁。**Task 2（落子物理下落）那一段。**
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
// ⚠ E2E（起浏览器）⇒ 单独挂 script（`npm run test:c4:p2b`），⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2b\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

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

  ok(errs.length === 0, '全程零 console error / pageerror' + (errs.length ? ' —— ' + errs[0] : ''));

  await browser.close();
  srv.close();
  console.log('\n采样帧 y（' + S.out.length + ' 帧）：' + JSON.stringify(ys));
  console.log(failed === 0 ? '\ne2e-p2b(T2): 全部通过' : '\ne2e-p2b(T2): ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
