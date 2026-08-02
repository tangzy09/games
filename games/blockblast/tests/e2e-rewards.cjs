// e2e-rewards.cjs — 激励视频**七个位**的冒烟（照 snake/tests/e2e-rewards.js 的模板）。
//
// 为什么必须有它：奖励发放这条链路（按钮 → dispatch 名 → 额度 → 钱包）里任何一环写错都**不报错**，
// 只是「点了没反应」或者「无限刷」，单测和玩法 E2E 都抓不到。三条红线逐位钉死：
//   ① 看完 ⇒ 奖励**真的到账**（零发放的位 = 白骗玩家看广告）
//   ② 拒绝 ⇒ **什么也不发生**（不发奖励、不扣额度、不惩罚）
//   ③ 额度用完 ⇒ 不再发（否则长线收集当天被刷穿，线上收不回来）
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8193;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.on('error', rej); srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('X ' + m); process.exitCode = 1; } else console.log('OK ' + m); };

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);

  // 广告 mock：window.__adOk 决定「看完」还是「拒绝」
  await page.evaluate(() => {
    window.__adCalls = 0;
    window.__adOk = true;
    Ads.showRewarded = () => { window.__adCalls++; return Promise.resolve(window.__adOk); };
    Ads.showInterstitial = () => Promise.resolve();
  });

  const snap = () => page.evaluate(() => ({
    coins: G.wallet.coins, angels: G.wallet.angels | 0,
    themes: (G.wallet.themes || []).length,
    quests: Quests.status(G.profile, Daily.dayNo(new Date())).filter(q => q.done).length,
    undoFree: G.items.undoFree, refresh: G.items.refreshCharge,
    bonus: G.s.bonusHands | 0, streamIndex: G.s.streamIndex,
    ads: JSON.parse(JSON.stringify(G.wallet.ads || {})),
    calls: window.__adCalls,
  }));

  // ── ① 看完 ⇒ 真到账 ──
  const POSITIONS = [
    { act: 'AD_COINS', kind: 'coins', check: (a, b) => b.coins > a.coins, name: '🏪 领币' },
    { act: 'AD_GIFT', kind: 'gift', check: (a, b) => b.coins > a.coins && b.angels > a.angels, name: '🎁 每日礼物' },
    { act: 'AD_GALLERY', kind: 'gallery', check: (a, b) => b.angels > a.angels, name: '👼 图鉴加速' },
    { act: 'AD_SKIN', kind: 'skin', check: (a, b) => b.themes > a.themes, name: '🎨 皮肤解锁' },
    { act: 'AD_QUEST', kind: 'quest', check: (a, b) => b.quests > a.quests && b.coins > a.coins, name: '📋 任务加速' },
    { act: 'AD_BOOST', kind: 'boost', check: (a, b) => b.undoFree > a.undoFree && b.refresh > a.refresh, name: '🚀 开局礼包' },
    // ⛔ 送方块的验收有**两条**：礼包手真的给了，而且 streamIndex **一动不动**（不动块流 = 公平承诺没破）
    { act: 'AD_BLOCKS', kind: 'blocks', check: (a, b) => b.bonus > a.bonus && b.streamIndex === a.streamIndex, name: '🧱 送方块' },
  ];
  for (const p of POSITIONS) {
    if (p.act === 'AD_BOOST' || p.act === 'AD_BLOCKS') await page.evaluate(() => { dispatch('NEW_RUN'); G.phase = 'PLAYING'; });
    const a = await snap();
    await page.evaluate(act => dispatch(act, {}), p.act);
    await page.waitForTimeout(80);
    const b = await snap();
    ok(p.check(a, b), p.name + '：看完广告，奖励真的到账');
    ok((b.ads[p.kind] | 0) === (a.ads[p.kind] | 0) + 1, p.name + '：额度记了一次');
  }

  // 💡 提示位：每局首次免费（不该调用广告），第二次才走广告
  await page.evaluate(() => { dispatch('NEW_RUN'); G.phase = 'PLAYING'; });
  const h0 = await snap();
  await page.evaluate(() => dispatch('HINT', {}));
  await page.waitForTimeout(50);
  const h1 = await snap();
  ok(await page.evaluate(() => !!G.coachHint), '💡 提示：给出了最优落点');
  ok(h1.calls === h0.calls, '💡 提示：每局第一次免费（没有放广告）');
  await page.evaluate(() => { G.coachHint = null; dispatch('HINT', {}); });
  await page.waitForTimeout(80);
  ok((await snap()).calls === h0.calls + 1, '💡 提示：第二次才走广告');

  // ── ② 拒绝 ⇒ 什么也不发生（红线：不发奖励、不扣额度、不惩罚）──
  await page.evaluate(() => {
    window.__adOk = false;
    G.wallet.ads = { day: 0 };                       // 额度清空，保证每个位都还能点
    G.wallet.angels = 10;
  });
  for (const p of POSITIONS) {
    if (p.act === 'AD_BOOST' || p.act === 'AD_BLOCKS') await page.evaluate(() => { dispatch('NEW_RUN'); G.phase = 'PLAYING'; });
    const a = await snap();
    await page.evaluate(act => dispatch(act, {}), p.act);
    await page.waitForTimeout(80);
    const b = await snap();
    const same = b.coins === a.coins && b.angels === a.angels && b.themes === a.themes
              && b.quests === a.quests && b.undoFree === a.undoFree && b.refresh === a.refresh;
    ok(same, p.name + '：拒绝 ⇒ 零发放');
    ok((b.ads[p.kind] | 0) === (a.ads[p.kind] | 0), p.name + '：拒绝 ⇒ 额度不扣');
  }

  // ── ③ 额度用完 ⇒ 不再发（长线收集的护栏）──
  await page.evaluate(() => {
    window.__adOk = true;
    G.wallet.ads = { day: 0 };
    G.wallet.angels = 10;
  });
  const cap = await page.evaluate(() => Shop.AD_CAPS.gallery);
  for (let i = 0; i < cap; i++) { await page.evaluate(() => dispatch('AD_GALLERY', {})); await page.waitForTimeout(60); }
  const c1 = await snap();
  await page.evaluate(() => dispatch('AD_GALLERY', {}));
  await page.waitForTimeout(80);
  const c2 = await snap();
  ok(c2.angels === c1.angels && c2.calls === c1.calls,
     '⛔ 额度用完 ⇒ 既不发奖励、也不再放广告（' + cap + ' 次/天）');

  // ── ④ 跨天必须**按 AD_CAPS 全量**重置（手写清 key 必漏）──
  const reset = await page.evaluate(() => {
    const w = Shop.emptyWallet();
    const d1 = new Date(2026, 7, 1).getTime(), d2 = new Date(2026, 7, 2).getTime();
    for (const k of Object.keys(Shop.AD_CAPS)) Shop.adUse(w, k, d1);
    return Object.keys(Shop.AD_CAPS).every(k => Shop.adQuotaLeft(w, k, d2) === Shop.AD_CAPS[k]);
  });
  ok(reset, '⛔ 跨天：每一个位都回满（漏一个 = 那个位永久卡在首日额度）');

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs[0] : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 激励位冒烟有失败项' : '\nOK 激励位冒烟全绿');
})().catch(e => { console.error(e); process.exit(1); });
