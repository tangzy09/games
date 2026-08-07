// ════════════════════════════════════════
// e2e-p45.cjs —— P4 课程页 + P5 统计页的端到端门禁（DESIGN §5 / §7 / §8）。
//
// ⛔⛔ 同既有门禁：**一次都不许调 dispatch()**，一律 page.mouse + 热区。
//
// 覆盖：
//   ① 加载零报错 + 库就位 + HOME 上真的有两个入口
//   ② ⭐⭐ 开一课 ⇒ **真的出得了题**（求解器筛出来的），点一列 ⇒ **当场判分**
//   ③ ⭐⭐ 判分与 node 侧独立重算**一致**（⛔ 课程说对、复盘说错 = 卖点破产）
//   ④ ⭐ 答对之后这一课标记为完成，且**活过一次刷新**（判据走非默认值方向）
//   ⑤ ⭐ 统计页：等级 / 双口径胜率 / 成就 / 「我的弱点」都画得出来
//   ⑥ ⛔ 二级页的返回键都在**左上角**且回得去（本仓铁律）
//   ⑦ ⛔⛔ 变现红线：整个课程 + 统计流程里广告调用 = 0（§3.2「课程永远免费」）
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');
const RV = require('../js/review.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8346;
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
        return { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action + (key !== undefined ? ' ' + key + '=' + val : ''));
    return r;
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));
  const has = async a => page.evaluate(x => hitAreas.some(h => h.action === x), a);

  async function instrument() {
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
    });
  }
  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await instrument();
    await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  }

  await boot();
  console.log('\n① 前提与入口');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  ok(await has('LEARN'), '① HOME 上有［课程］入口');
  ok(await has('STATS'), '① HOME 上有［统计］入口');

  console.log('\n②③ ⭐⭐ 开一课：真的出得了题 + 当场判分 + 与独立重算一致');
  await click('LEARN');
  await page.waitForFunction(() => G.phase === 'LEARN', null, { timeout: 4000 });
  ok(await has('LESSON'), '② 课表画出来了（十六课）');
  await click('LESSON', 'id', 1);
  // ⭐ 等出题（要真值 ⇒ 走插队请求）。⚠ 这一等本身就是「题目真的算出来了」的证据
  await page.waitForFunction(() => G.lesson && !G.lesson.loading && G.lesson.sa, null, { timeout: 90000 });
  const q = await page.evaluate(() => ({
    id: G.lesson.id, moves: G.lesson.moves.slice(), sa: G.lesson.sa, tries: G.lesson.tries
  }));
  ok(!!q.sa && Object.keys(q.sa).length > 0, '② ⭐⭐ 求解器**真的出了一道题**（' + q.moves.length + ' 手，试了 ' + q.tries + ' 次）');
  // ⭐ node 侧独立重算这道题的最优列
  const saNode = S.scoreAll(B.fromMoves(q.moves));
  const bestNode = RV.safeCols(saNode);
  ok(bestNode.length > 0, '③ 前提：这道题算得出最优列 [' + bestNode.map(c => c + 1).join(',') + ']');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p45-lesson.png') });

  // 点最优列 ⇒ 必须判对
  await click('LESSON_COL', 'col', bestNode[0]);
  await page.waitForFunction(() => G.lesson && G.lesson.judged, null, { timeout: 6000 });
  const j = await page.evaluate(() => ({ ok: G.lesson.judged.ok, label: G.lesson.judged.label,
                                         reason: G.lesson.judged.reason, best: G.lesson.judged.best }));
  ok(j.ok === true, '③ ⭐⭐ 点最优列 ⇒ 判**对**（label=' + j.label + '）');
  ok(JSON.stringify(j.best) === JSON.stringify(bestNode),
    '③ ⭐⭐ 页面给的最优列与 node 侧独立重算**逐位一致**（' + JSON.stringify(j.best)
    + ' vs ' + JSON.stringify(bestNode) + '）—— ⛔ 课程说对、复盘说错 = 卖点当场破产');
  // ⚠ 五条机械理由（'win' 是给「当场连四」的那条 —— 截图实测：第 1 课判对之后说
  //   「这一列最稳」在教学上完全违和，那一课要教的恰恰是「这一手直接连四」）
  ok(['win', 'only', 'makeFork', 'blockFork', 'steady'].indexOf(j.reason) >= 0,
    '③ 理由是五条机械导出之一：' + j.reason);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p45-lesson-judged.png') });

  console.log('\n④ ⭐ 答对 ⇒ 这一课完成，且活过一次刷新');
  {
    const mask = await page.evaluate(() => C4Settings.get('lessonsMask'));
    ok((mask & 1) === 1, '④ 第 1 课标记为完成（mask=' + mask + '）');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && (hitAreas || []).length > 0, null, { timeout: 15000 });
    const mask2 = await page.evaluate(() => C4Settings.get('lessonsMask'));
    ok(mask2 === mask,
      '④ ⭐ 完成记录活过一次刷新（' + mask + ' → ' + mask2 + '）—— 判据走**非默认值**方向');
    await instrument();
    await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  }

  console.log('\n⑤⑥ ⭐ 统计页 + 返回键在左上角');
  await click('STATS');
  await page.waitForFunction(() => G.phase === 'STATS', null, { timeout: 4000 });
  {
    const st = await page.evaluate(() => ({
      lv: C4Meta.levelProgress(C4Meta.xpOf({
        games: C4Settings.get('games') | 0, wins: C4Settings.get('wins') | 0,
        winsNoHint: C4Settings.get('winsNoHint') | 0, bestAcc: C4Settings.get('bestAcc') | 0,
        lessonsDone: 1
      })).lv,
      stats: C4Meta.stats({ games: C4Settings.get('games') | 0, wins: C4Settings.get('wins') | 0 }),
      back: G.pageBack, safeTop: G.L.safeTop, SW: G.L.SW
    }));
    ok(st.lv >= 1, '⑤ 等级算得出来（' + st.lv + ' 级）');
    ok(st.stats.rate === null || (st.stats.rate >= 0 && st.stats.rate <= 100),
      '⑤ ⛔ 胜率要么是 null（还没打过）要么是 0-100，⛔ 绝不是编出来的数：' + st.stats.rate);
    ok(!!st.back, '⑥ 返回键画出来了');
    ok(st.back.y >= st.safeTop && st.back.y <= st.safeTop + 20,
      '⑥ ⛔ y 从 safeTop 起算（y=' + st.back.y + '，safeTop=' + st.safeTop + '）');
    ok(st.back.x < st.SW / 2, '⑥ ⛔ 在**左**上角（x=' + st.back.x + '）');
    await page.screenshot({ path: path.join(SHOT_DIR, 'p45-stats.png') });
    await click('PAGE_BACK');
    await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    ok(true, '⑥ 点返回真的回到 HOME');
  }

  console.log('\n⑦ ⛔⛔ 变现红线：课程与统计全程广告 = 0');
  {
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑦ ⛔⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）'
      + ' —— §3.2：**全部课程永远免费，永不看广告**');
    ok(errs.length === 0, '⑦ 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 肉眼验收）：p45-lesson.png / p45-lesson-judged.png / p45-stats.png');
  if (failed) { console.error('\n⛔ e2e-p45 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p45 全绿');
})().catch(e => { console.error(e); process.exit(1); });
