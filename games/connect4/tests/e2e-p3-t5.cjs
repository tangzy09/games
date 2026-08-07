// ════════════════════════════════════════
// e2e-p3-t5.cjs —— P3 **Task 5** 的端到端门禁：赛后复盘（DESIGN §3.3「最大的差异化」）。
//
// §3.3：「**胜负曲线** · **转折点**（「你到第 14 手为止一直是必胜的。第 14 手走了第 3 列——
//   这一步之后变成必败。当时该走第 5 列。」）· **［从这一步重来］**」
// ⚠⚠ **措辞死线**：陈述事实，⛔ 不指责。
//
// ⛔⛔ 同既有门禁：**一次都不许调 dispatch() / applyMove()**，一律 page.mouse + 热区。
//
// 覆盖：
//   ① 加载零报错 + 库就位
//   ② ⭐ 结算屏的［复盘］**真的点得进去**（P2b 时它是 disabled 的留位）
//   ③ ⭐⭐ 转折点那句「当时该走第 X 列」与 **node 侧拿那一手的局面独立重算**的最优列一致
//      ——⚠ 必须是**那一手**的答案，⛔ 不是「现在算出来的最优」（局面早就不同了）
//   ④ ⭐ ［从这一步重来］真的把盘面退回那一手（真实鼠标）
//   ⑤ ⛔ 返回键在**左上角**（本仓铁律）且真的回得去
//   ⑥ ⛔ 让子局进复盘 ⇒ **如实说不给**，⛔ 不显示任何百分比
//   ⑦ ⛔ 变现红线：全程广告调用 = 0
//   ⑧ 截图（⛔ 肉眼验收）
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8344;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p3');

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
{
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'book-classic.bin'));
  const bk = BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length));
  if (!bk) { console.error('⛔ 开局库解析失败'); process.exit(2); }
  S.setBook(bk);
}
/** ⭐ node 侧独立重算：这一手的局面上，最优列有哪些。 */
function bestColsAt(moves, ply) {
  const sa = S.scoreAll(B.fromMoves(moves.slice(0, ply)));
  const cols = Object.keys(sa).map(Number);
  if (!cols.length) return [];
  let best = -Infinity;
  for (const c of cols) if (sa[c] > best) best = sa[c];
  return cols.filter(c => sa[c] === best);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
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
        return { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2), rx: h.x, ry: h.y, w: h.w, h: h.h };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action);
    return r;
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));
  const has = async a => page.evaluate(x => hitAreas.some(h => h.action === x), a);

  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
    });
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      if (await has('REVIEW_BACK')) await click('REVIEW_BACK');
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
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 8000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
  }
  /** 下一整局双人局（⇒ 每手都是「我的」回合，好控），走到终局。 */
  async function playOut() {
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    let guard = 0;
    while (await page.evaluate(() => G.phase === 'PLAYING') && guard++ < 42) {
      const col = await page.evaluate(() => {
        const ms = RulesClassic.moves(C4State.boardOf(G.g));
        return ms.length ? ms[(G.g.moves.length * 3 + 1) % ms.length] : -1;
      });
      if (col < 0) break;
      await playCol(col);
    }
  }

  await boot();
  console.log('\n① 前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  ok(true, '① 开局库已就位');

  console.log('\n②③ ⭐⭐ 复盘页：点得进去 + 转折点与独立重算一致');
  await goHome();
  await setHandicap(0);
  await playOut();
  ok(await page.evaluate(() => G.phase === 'OVER'), '② 这一局下完了');
  // ⚠ 等边打边算收尾（终局那一刻通常已 100%，这里给个兜底）
  await page.waitForFunction(() => { const p = C4Analysis.progress(); return p.total > 0 && p.done >= p.total; },
    null, { timeout: 90000 }).catch(() => {});
  ok(await has('REVIEW'), '② ⭐ 结算屏的［复盘］**注册了热区**（P2b 时它是 disabled 的留位）');
  await click('REVIEW');
  await page.waitForFunction(() => G.phase === 'REVIEW', null, { timeout: 6000 });
  ok(true, '② ⭐ 真实鼠标点进了复盘页');

  const R = await page.evaluate(() => ({
    ready: G.review.ready, done: G.review.done, total: G.review.total,
    tp: G.review.tp || null, moves: G.g.moves.slice(),
    labels: G.review.labels.map(e => ({ ply: e.ply, label: e.label, from: e.from, to: e.to }))
  }));
  ok(R.ready, '③ 整局真值已备齐（' + R.done + '/' + R.total + '）');
  ok(R.labels.length === R.total, '③ 每一手都有标签（' + R.labels.length + '/' + R.total + '）');
  if (R.tp) {
    const want = bestColsAt(R.moves, R.tp.ply);
    const shown = await page.evaluate(() => {
      // 页面上那句「第 X 列守得住」里的列号 —— 从产品自己的函数取（与画出来的是同一个）
      return typeof bestColAt === 'function' ? bestColAt(G.g, G.review.tp.ply) : -1;
    });
    ok(want.indexOf(shown) >= 0,
      '③ ⭐⭐ 转折点（第 ' + (R.tp.ply + 1) + ' 手）说「该走第 ' + (shown + 1) + ' 列」，'
      + 'node 侧拿**那一手的局面**独立重算 = [' + want.map(c => c + 1).join(',') + '] —— 一致');
    ok(R.tp.to < R.tp.from, '③ 转折点确实是**下滑**的那一手（' + R.tp.from + ' → ' + R.tp.to + '）');
  } else {
    ok(true, '③ 这一局没有转折点（全程没滑落）—— 页面显示「守得很稳」那一支');
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-t5-review.png') });

  console.log('\n⑤ ⛔ 返回键在左上角且回得去（本仓铁律）');
  {
    const rb = await page.evaluate(() => G.reviewBack);
    const geo = await page.evaluate(() => ({ safeTop: G.L.safeTop, trayX: G.L.tray.x, SW: G.L.SW }));
    ok(!!rb, '⑤ 返回键画出来了');
    ok(rb && rb.y >= geo.safeTop && rb.y <= geo.safeTop + 20,
      '⑤ ⛔ y 从 safeTop 起算（y=' + (rb && rb.y) + '，safeTop=' + geo.safeTop + '）—— ⛔ 别写死');
    ok(rb && rb.x < geo.SW / 2, '⑤ ⛔ 在**左**上角（x=' + (rb && rb.x) + ' < 半屏 ' + geo.SW / 2 + '）');
    await click('REVIEW_BACK');
    await page.waitForFunction(() => G.phase === 'OVER', null, { timeout: 4000 });
    ok(true, '⑤ 点返回真的回到结算屏');
  }

  console.log('\n④ ⭐ ［从这一步重来］真的退回那一手');
  {
    await click('REVIEW');
    await page.waitForFunction(() => G.phase === 'REVIEW', null, { timeout: 4000 });
    if (await has('REPLAY_FROM')) {
      const ply = await page.evaluate(() => G.review.tp.ply);
      await click('REPLAY_FROM');
      await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
      const n = await page.evaluate(() => G.g.moves.length);
      ok(n === ply, '④ ⭐ 盘面退回到第 ' + ply + ' 手（实际 ' + n + ' 手）—— 走的是既有的 rewindTo');
      ok(await page.evaluate(() => G.review === null), '④ 重来之后复盘快照被清掉（⛔ 别留着过期数据）');
    } else {
      ok(true, '④ 这一局没有转折点 ⇒ 没有［从这一步重来］按钮（合理）');
      await click('REVIEW_BACK');
    }
  }

  console.log('\n⑥ ⛔ 让子局：如实说不给，⛔ 不显示任何百分比');
  {
    await goHome();
    await setHandicap(2);
    await playOut();
    await click('REVIEW');
    await page.waitForFunction(() => G.phase === 'REVIEW', null, { timeout: 4000 });
    const why = await page.evaluate(() => reviewBlocked(G.g));
    ok(typeof why === 'string' && why.length > 0, '⑥ ⛔ 如实给出原因：「' + why + '」');
    ok(!await has('REPLAY_FROM'), '⑥ 不给复盘时没有［从这一步重来］按钮');
    // ⛔ 页面上不许出现百分比（那会是编出来的）
    const px = await page.screenshot({ path: path.join(SHOT_DIR, 'p3-t5-review-handicap.png') });
    const accShown = await page.evaluate(() => {
      const r = C4Review.accuracyOf(G.review ? G.review.labels : [], { side: 0 });
      return { acc: r, ready: G.review ? G.review.ready : null };
    });
    ok(accShown.acc === null || accShown.ready === false,
      '⑥ ⛔ 让子局算不出精准度（acc=' + accShown.acc + '）—— §2.4：绝不显示一个编出来的数字');
    await setHandicap(0);
  }

  console.log('\n⑦ ⛔ 变现红线');
  {
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑦ ⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）'
      + ' —— §3.2：复盘**永远免费**');
    ok(errs.length === 0, '⑦ 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  console.log('  · p3-t5-review.png / p3-t5-review-handicap.png');
  if (failed) { console.error('\n⛔ e2e-p3-t5 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p3-t5 全绿');
})().catch(e => { console.error(e); process.exit(1); });
