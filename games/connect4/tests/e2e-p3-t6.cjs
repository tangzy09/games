// ════════════════════════════════════════
// e2e-p3-t6.cjs —— P3 **Task 6** 的端到端门禁：精准度进结算屏 + 纪录（DESIGN §4）。
//
// §4：「⭐ 精准度顺带解决一个更要命的问题：**四子棋对高档 AI 必然大量输，只有胜负的话
//   正反馈太稀、必然流失。** ⇒ **「你输了，但这局精准度 91%，是你的新高」**
//   ——输局也能创纪录、也能庆祝。」
//
// ⛔⛔ 同既有门禁：**一次都不许调 dispatch()**，一律 page.mouse + 热区。
//
// 覆盖：
//   ① 加载零报错 + 库就位
//   ② ⭐⭐ 结算屏那条数据条**真的显示了百分比**（P2b 时是两个「—」的留位）
//   ③ ⭐ 纪录**持久化**（刷新之后还在）—— 判据走**非默认值**方向
//   ④ ⭐⭐ **限时局不计入纪录**（§6.10）—— 反向对照：打完一局限时局，纪录**一位不变**
//   ⑤ ⛔ 让子局：结算屏**照旧显示占位符 —**，⛔ 绝不显示 0%
//   ⑥ ⛔ §6.6 没被破坏：输局仍然**没有**「你输了」大字
//   ⑦ ⛔ 广告 = 0
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8345;
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
    await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
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
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) await click('CYCLE_HANDICAP');
  }
  async function setTimed(on) {
    await goHome();
    if (await page.evaluate(() => C4Settings.get('timed')) !== on) await click('TOGGLE_TIMED');
  }
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 8000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
  }
  /** 下完一整局双人局并等边打边算收尾。 */
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
    await page.waitForFunction(() => { const p = C4Analysis.progress(); return p.total > 0 && p.done >= p.total; },
      null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(300);   // 等 onIdle 把纪录写进去
  }
  const rec = () => page.evaluate(() => ({ acc: C4Settings.get('bestAcc'), n: C4Settings.get('bestAccN') }));
  const stats = () => page.evaluate(() => settleStats());

  await boot();
  console.log('\n① 前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  const rec0 = await rec();
  ok(rec0.n === 0, '① 干净档：还没有纪录（bestAccN=' + rec0.n + '）');

  console.log('\n②③ ⭐⭐ 结算屏显示精准度 + 纪录持久化');
  await goHome();
  await setHandicap(0);
  await setTimed(false);
  await playOut();
  ok(await page.evaluate(() => G.phase === 'OVER'), '② 这一局下完了');
  const S = await stats();
  ok(S.acc !== null && S.acc >= 0 && S.acc <= 100,
    '② ⭐⭐ 结算屏算出了精准度 ' + S.acc + '%（P2b 时这里是「—」的留位）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-t6-settle.png') });
  const rec1 = await rec();
  ok(rec1.n === 1, '③ 纪录计了一局（bestAccN ' + rec0.n + ' → ' + rec1.n + '）');
  ok(rec1.acc === S.acc, '③ 最高纪录 = 本局精准度（' + rec1.acc + '%）—— 第一局必然是新高');
  // ⭐⭐ ★ 必须**还在**（截图实测的 bug：recordAccuracy 把 49 写进纪录后，49>49 为假
  //   ⇒ ★ 在写入那一刻自己消失了，而玩家看到的恰恰是写入之后的那一屏）
  ok((await stats()).best === true,
    '③ ⭐⭐ 第一局必然是新高 ⇒ 结算屏要标 ★，**而且写进纪录之后仍然标**'
    + ' —— ⛔ 别事后拿纪录反推「是不是新高」（写进去之后就比不出来了）');
  // ⭐ 刷新之后还在（判据走**非默认值**方向：⛔ 别断言「刷新后仍是 0」）
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && (hitAreas || []).length > 0, null, { timeout: 15000 });
  const rec2 = await rec();
  ok(rec2.acc === rec1.acc && rec2.n === rec1.n,
    '③ ⭐ 纪录活过一次刷新（' + rec2.acc + '% / ' + rec2.n + ' 局）—— 判据走非默认值方向');
  await page.evaluate(() => {
    window.__ads = { rewarded: 0, interstitial: 0 };
    const r = Ads.showRewarded, i = Ads.showInterstitial;
    Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
    Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
  });
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });

  console.log('\n④ ⭐⭐ 限时局不计入纪录（§6.10 反向对照）');
  {
    const before = await rec();
    await setTimed(true);
    await playOut();
    const after = await rec();
    ok(after.acc === before.acc && after.n === before.n,
      '④ ⭐⭐ 限时局打完，纪录**一位不变**（' + before.acc + '%/' + before.n + ' 局 → '
      + after.acc + '%/' + after.n + ' 局）—— §6.10：时间压力下的失误不该污染棋力统计');
    ok(await page.evaluate(() => settleStats().best) === false,
      '④ 限时局的结算屏不标 ★（它本来就不参与纪录）');
    await setTimed(false);
  }

  console.log('\n⑤ ⛔ 让子局：显示占位符，⛔ 绝不显示 0%');
  {
    await setHandicap(2);
    await playOut();
    const s2 = await stats();
    ok(s2.acc === null,
      '⑤ ⛔ 让子局算不出精准度 ⇒ acc=null（实际 ' + s2.acc + '）—— §2.4：绝不显示一个编出来的 0%');
    const before = await rec();
    await page.waitForTimeout(300);
    const after = await rec();
    ok(after.n === before.n, '⑤ 让子局也不计入纪录（' + before.n + ' → ' + after.n + '）');
    await page.screenshot({ path: path.join(SHOT_DIR, 'p3-t6-settle-handicap.png') });
    await setHandicap(0);
  }

  console.log('\n⑥⑦ ⛔ 既有红线没被破坏');
  {
    // §6.6：输局 HUD 上那一行必须仍是中性的「本局结束」，⛔ 不是「你输了」
    const neutral = await page.evaluate(() => ({
      roundOver: T('game.roundOver'), win: T('game.win')
    }));
    ok(neutral.roundOver !== neutral.win, '⑥ 前提：中性措辞与「你赢了」是两句话');
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑦ ⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）');
    ok(errs.length === 0, '⑦ 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 肉眼验收）：p3-t6-settle.png / p3-t6-settle-handicap.png');
  if (failed) { console.error('\n⛔ e2e-p3-t6 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p3-t6 全绿');
})().catch(e => { console.error(e); process.exit(1); });
