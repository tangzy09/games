// tools/test-share-links.cjs — ⭐ 跨游戏红线：**分享出去的链接必须指向 App Store，不是网页版**。
//
// 为什么值得单开一个跨游戏测试：分享是最便宜的获客渠道，而网页版**不产生下载量、评分、排名**。
// 这条一旦被谁改回 location.origin（很容易，那是最顺手的写法），线上不会报任何错、
// 也没有任何游戏的自测会红 —— 只是每一次分享都白白流失一个装机。
//
// 同时钉住两件容易被悄悄删掉的事：
//   ① App Store 链接**带不了 seed/局号** ⇒ 局号必须出现在**文案**里（否则「同一局」的玩法价值没了）；
//   ② 没上架的游戏（appStoreId 为空）必须**回退到网页链接**（分享个 404 比网页版更差）。
//
// 用法：node tools/test-share-links.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), PORT = 8186;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

// 已上架的三个（数字 Apple ID 与 codemagic.yaml 的 APP_STORE_APP_ID 一致）
const GAMES = [
  { id: 'snake',      appStoreId: '6789757716' },
  { id: 'blockblast', appStoreId: '6790598746' },
  { id: 'solitaire',  appStoreId: '6790861224' },
];

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

  for (const g of GAMES) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const shared = [];
    // 拦住真正的分享调用，把「实际会发出去的文本」抓下来
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = t => { window.__shared.push(t); return Promise.resolve(); };
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    });
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${PORT}/games/${g.id}/index.html`);
    await page.waitForFunction(() => window.Share, { timeout: 15000 });
    await page.waitForTimeout(1200);

    const info = await page.evaluate(() => ({
      link: Share.link(), store: Share.storeUrl(), hasStore: Share.hasStore(),
      cfgId: (window.GAME_CONFIG || {}).appStoreId || null,
    }));
    ok(info.cfgId === g.appStoreId, `${g.id}: GAME_CONFIG.appStoreId = ${info.cfgId}`);
    ok(info.link === 'https://apps.apple.com/app/id' + g.appStoreId,
       `${g.id}: ⭐ 分享链接指向 App Store（${info.link}）`);
    ok(!/ai-speeds\.com|localhost|127\.0\.0\.1/.test(info.link),
       `${g.id}: ⛔ 分享链接里**没有**网页版地址`);

    // ⛔ 回退：没上架（appStoreId 为空）必须回退到网页链接，不能给个死链
    const fb = await page.evaluate(() => {
      const keep = window.GAME_CONFIG.appStoreId;
      window.GAME_CONFIG.appStoreId = '';
      const r = { link: Share.link(), hasStore: Share.hasStore() };
      window.GAME_CONFIG.appStoreId = keep;
      return r;
    });
    ok(!fb.hasStore && /^https?:\/\//.test(fb.link) && !fb.link.includes('apps.apple.com'),
       `${g.id}: ⛔ 没上架时回退到网页链接（${fb.link}）`);

    await page.close();
  }

  // ── 实际分享出去的文本：必须含 App Store 链接 + 局号/种子 ──
  {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = t => { window.__shared.push(t); return Promise.resolve(); };
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    });
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
    await page.waitForFunction(() => window.G && window.G.s);
    await page.evaluate(() => { dispatch('INTRO_GO'); dispatch('SHARE'); });
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => (window.__shared[0] || {}).text || '');
    const seed = await page.evaluate(() => G.s.seed);
    ok(t.includes('apps.apple.com/app/id6790861224'), 'solitaire 分享文本含 App Store 链接');
    ok(!t.includes('cards.ai-speeds.com'), '⛔ solitaire 分享文本**不含**网页版地址');
    ok(t.includes(String(seed)),
       `⭐ solitaire 分享文本含**局号 ${seed}**（App Store 链接带不了 seed ⇒ 必须写进文案，否则「同一局」就没了）`);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = t => { window.__shared.push(t); return Promise.resolve(); };
    });
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
    await page.waitForFunction(() => window.G && window.G.s);
    await page.evaluate(() => dispatch('SHARE_SEED'));
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => (window.__shared[0] || {}).text || '');
    const seed = await page.evaluate(() => G.s.seed);
    ok(t.includes('apps.apple.com/app/id6790598746'), 'blockblast 分享文本含 App Store 链接');
    ok(!t.includes('blocks.ai-speeds.com'), '⛔ blockblast 分享文本**不含**网页版地址');
    ok(t.includes(String(seed)),
       `⭐ blockblast 分享文本含**种子 ${seed}**（否则「同一条块流」这个卖点被悄悄删掉）`);
    await page.close();
  }

  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 分享链接红线有失败项' : '\nOK 分享链接红线全绿');
})();
