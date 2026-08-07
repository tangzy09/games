// ════════════════════════════════════════
// e2e-p3-t2.cjs —— P3 **Task 2** 的端到端门禁：边打边算（DESIGN §9.2 的两段实测）。
//
// analysis.js 的承诺只有一句：**每落一手就在 Worker 空闲时算那一手的真值**
// ⇒ 到终局时复盘几乎瞬开，而**总计算量一位不变**。
// 本门禁验的就是「真的摊掉了」，以及三条不许破的红线。
//
// ⛔⛔ 与 e2e-p2a/p2b/p2c 同一条纪律：**一次都不许调 `dispatch()` / `applyMove()` /
//   `C4Settings.set()`**，落子与设置一律 `page.mouse`，落点按热区 action 名取（⛔ 零绝对坐标）。
//
// 覆盖：
//   ① 加载零报错
//   ② ⭐⭐ **每一次 scores 请求发出时，开局库都必须已经就位** —— 这是本模块最要命的一道闸：
//      engine-client.js:209「库没就位时绝不许对 n≤9 调 scores()，那是**几十分钟**」，
//      而 analysis **恰恰是从 n=0 的前缀开始排队的**。破了这条 = Worker 被焊死几十分钟，
//      画面上只是「复盘一直在转」，**零报错**。（开发时真的踩到过，靠单测 ⑥b 抓出来。）
//   ③ ⭐⭐ 下一整局人机，**终局那一刻**已经算完的比例（= 「摊掉了」的量化判据）
//   ④ ⭐ **零阻塞**：每一次点击到落子的耗时，不许被这条流水线拖慢
//   ⑤ ⛔ 让子局：一个请求都不发，且**停用原因可读**（⛔ 不是空字符串）
//   ⑥ ⭐ 撤销不作废：真实鼠标撤两手再走回来，**不产生新的 scores 请求**
//   ⑦ ⛔ 变现红线：整个流程里广告调用 = 0（提示/复盘/悔棋永远免费，DESIGN §3.2）
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8341;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  ✗ ' + m); failed++; } else console.log('  ✓ ' + m); };

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
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

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
  const click = async (a, k, v) => clickAt(await pt(a, k, v));

  /** ⛔ 变现红线 + ⭐ 把每一次 scores 请求连同「当时库就位没有」一起记下来。 */
  async function instrument() {
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
      // ⭐⭐ 每次 scores 的调用现场：**当时 bookReady() 是不是 true**。
      //   ⚠ 只包一层记录，⛔ 没改它返回什么 —— 测的仍是产品那条路。
      window.__scores = { n: 0, beforeBook: 0, lens: [] };
      const orig = EngineClient.scores;
      EngineClient.scores = function (moves) {
        window.__scores.n++;
        if (!EngineClient.bookReady()) window.__scores.beforeBook++;
        window.__scores.lens.push((moves || []).length);
        return orig.apply(EngineClient, arguments);
      };
    });
  }

  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await instrument();
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) {
      await click('CYCLE_HANDICAP');
    }
  }
  /** 走一手真实鼠标并等它落稳；返回这一次点击到落子的毫秒数。 */
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    const t0 = Date.now();
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 8000 });
    const dt = Date.now() - t0;
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
    return dt;
  }
  const prog = () => page.evaluate(() => C4Analysis.progress());

  await boot();

  console.log('\n① 加载与前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  // ⚠ 等开局库真的装好 —— 本门禁的核心断言（②③）都以「库在就位」为前提
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  ok(true, '① 开局库已就位（3.6 MB 懒加载）');

  console.log('\n③④ ⭐⭐ 下一整局人机：边打边算真的摊掉了吗');
  await goHome();
  await setHandicap(0);                       // ⚠ 让子局是不给算的（⑤ 单独验），这里必须 0
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });

  const clickMs = [];
  let guard = 0;
  while (await page.evaluate(() => G.phase === 'PLAYING') && guard++ < 42) {
    // 挑一列合法的走（⛔ 不用 dispatch，仍然是真实鼠标）
    const col = await page.evaluate(() => {
      const bd = C4State.boardOf(G.g);
      const ms = RulesClassic.moves(bd);
      return ms.length ? ms[(G.g.moves.length * 3) % ms.length] : -1;
    });
    if (col < 0) break;
    if (!await page.evaluate(() => C4State.isHumanTurn(G.g))) {
      await page.waitForFunction(() => C4State.isHumanTurn(G.g) || G.phase !== 'PLAYING',
        null, { timeout: 12000 }).catch(() => {});
      continue;
    }
    clickMs.push(await playCol(col));
  }
  const atOver = await prog();
  const pct = atOver.total ? Math.round(atOver.done / atOver.total * 100) : 0;
  console.log('   终局那一刻：已算完 ' + atOver.done + '/' + atOver.total + ' = ' + pct + '%');
  ok(await page.evaluate(() => G.phase === 'OVER'), '③ 这一局真的下完了');
  ok(atOver.total > 0, '③ 确实排了活（total=' + atOver.total + '）');
  // ⭐ 阈值取 60%：本机实测远高于此，留出手机/CI 的余量。⚠ 真正要挡的是「终局才开始算」
  //   那种实现 —— 它在这一刻会是 0-1 个。
  ok(pct >= 60, '③ ⭐⭐ 终局那一刻已算完 ' + pct + '%（门槛 60% —— 「终局才开始算」的实现在这里会是 0）');

  const worst = clickMs.length ? Math.max.apply(null, clickMs) : 0;
  const med = clickMs.slice().sort((a, b) => a - b)[Math.floor(clickMs.length / 2)] || 0;
  console.log('   点击到落子：中位 ' + med + ' ms / 最慢 ' + worst + ' ms（' + clickMs.length + ' 次）');
  ok(med < 400, '④ ⭐ 零阻塞：点击到落子的中位 ' + med + ' ms < 400（边打边算不许拖慢操作）');

  console.log('\n⑥ ⭐ 撤销不作废已算的前缀');
  {
    const n0 = await page.evaluate(() => window.__scores.n);
    await goHome();
    await click('PLAY_AI');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    for (const c of [3, 4, 2]) {
      if (await page.evaluate(() => C4State.isHumanTurn(G.g))) await playCol(c);
      await page.waitForFunction(() => C4State.isHumanTurn(G.g) || G.phase !== 'PLAYING',
        null, { timeout: 12000 }).catch(() => {});
    }
    // 等这一局的活干完，再撤销 —— 撤回去的前缀都算过了
    await page.waitForFunction(() => { const p = C4Analysis.progress(); return p.total > 0 && p.done >= p.total; },
      null, { timeout: 60000 }).catch(() => {});
    const nBefore = await page.evaluate(() => window.__scores.n);
    await click('UNDO');
    await page.waitForTimeout(300);
    const nAfter = await page.evaluate(() => window.__scores.n);
    ok(nAfter === nBefore,
      '⑥ ⭐ 撤销之后没有产生新的 scores 请求（' + nBefore + ' → ' + nAfter + '）—— 缓存按局面存，⛔ 不是按第几手');
    ok(nBefore > n0, '⑥ 前提：这一局确实算过东西（' + n0 + ' → ' + nBefore + '）');
  }

  console.log('\n② ⭐⭐ 那道最要命的闸：库没就位时一个请求都不许发');
  {
    const s = await page.evaluate(() => window.__scores);
    ok(s.n > 0, '② 前提：这条流水线真的发过请求（' + s.n + ' 次）');
    ok(s.beforeBook === 0,
      '② ⭐⭐ 有 ' + s.beforeBook + ' 次 scores 是在开局库就位**之前**发的 —— '
      + 'engine-client.js:209：无库的 n≤9 是**几十分钟**，Worker 会被焊死而画面只是「一直在转」');
    const shallow = s.lens.filter(l => l <= 9).length;
    ok(shallow > 0, '② 前提：确实算了浅前缀（n≤9 共 ' + shallow + ' 个）—— 否则上一条是空过的');
  }

  console.log('\n⑤ ⛔ 让子局：零请求 + 原因可读');
  {
    await goHome();
    await setHandicap(2);
    const n0 = await page.evaluate(() => window.__scores.n);
    await click('PLAY_HUMAN');                // 让子只对同机双人 + 轻松档开放（§6.7）
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    for (const c of [3, 4]) await playCol(c);
    await page.waitForTimeout(400);
    const n1 = await page.evaluate(() => window.__scores.n);
    ok(n1 === n0, '⑤ ⛔ 让子局一个 scores 都没发（' + n0 + ' → ' + n1 + '）');
    ok(await page.evaluate(() => C4Analysis.enabled()) === false, '⑤ 让子局 enabled() === false');
    const why = await page.evaluate(() => C4Analysis.disabledReason());
    ok(typeof why === 'string' && why.length > 0,
      '⑤ ⛔ 停用原因可读：「' + why + '」（空字符串 = UI 只能显示一片空白）');
    await setHandicap(0);
  }

  console.log('\n⑦ ⛔ 变现红线');
  {
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑦ ⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）—— '
      + 'DESIGN §3.2：提示/复盘/悔棋/课程**永远免费，永不看广告**');
    ok(errs.length === 0, '⑦ 全程零 pageerror / console.error' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  if (failed) { console.error('\n⛔ e2e-p3-t2 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p3-t2 全绿（边打边算：终局那一刻已算完 ' + pct + '%）');
})().catch(e => { console.error(e); process.exit(1); });
