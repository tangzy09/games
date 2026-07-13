// e2e-p4.cjs — 变现红线（DESIGN §9）。真实点击，不用 dispatch 绕过。
//
// 这个测试的重点不是「广告能不能播」，而是**三条红线在真实 UI 里成立**：
//   1. 局中永远没有插屏
//   2. 玩家**拒绝**激励视频 ⇒ 什么也不发生（绝不强塞无奖励广告、绝不惩罚）
//   3. 关卡失败零广告；插屏只在通关后且每 3 次最多一个
//   4. 买了去广告 ⇒ 插屏一个都没有，但**功能不变少**
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8155;
const SHOT_DIR = 'C:\\tmp\\blockblast';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      const inRoot = f === ROOT || f.startsWith(ROOT + path.sep);
      if (!inRoot || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error(`端口 ${PORT} 被占用`) : e));
    srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

async function findBtn(page, action) {
  return page.evaluate(a => {
    const { SW, SH } = GameGlobal;
    for (let y = 0; y < SH; y += 4) for (let x = 0; x < SW; x += 4) {
      const h = hitTest(x, y);
      if (h && h.action === a) return { x, y };
    }
    return null;
  }, action);
}
async function clickAction(page, action) {
  const b = await findBtn(page, action);
  if (!b) return false;
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(150);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
  await page.waitForFunction(() => window.G && window.G.wallet, null, { timeout: 5000 });

  // 把引擎的广告接口换成可控的假实现（记录调用；可设定玩家「拒绝」）
  await page.evaluate(() => {
    window.__ads = { rewarded: 0, interstitial: 0, rewardResult: true };
    Ads.showRewarded = () => { window.__ads.rewarded++; return Promise.resolve(window.__ads.rewardResult); };
    Ads.showInterstitial = () => { window.__ads.interstitial++; return Promise.resolve(true); };
  });

  // ── 局中零插屏 ──
  await clickAction(page, 'PLAY_ENDLESS');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    for (let k = 0; k < 12; k++) {                    // 玩十几步
      const t = Core.tray(G.s);
      const slot = t.findIndex(Boolean);
      if (slot < 0) break;
      const pl = Core.placements(G.s.board, t[slot]);
      if (!pl.length) break;
      onPlace(slot, pl[0][0], pl[0][1]);
    }
  });
  ok(await page.evaluate(() => window.__ads.interstitial) === 0, '⛔ 局中零插屏（玩了十几步，一个都没出）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-01-items.png') });

  // ── 道具条：撤销显示「免费」，换一手显示「看广告」──
  const itemUi = await page.evaluate(() => ({
    undoMode: Shop.undoMode(G.wallet, G.items),
    refreshMode: Shop.refreshMode(G.wallet, G.items),
    coins: G.wallet.coins,
  }));
  ok(itemUi.undoMode === 'free', '撤销：每局第 1 次免费');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-02-tools.png') });

  // ── ⛔ 红线：玩家**拒绝**激励视频 ⇒ 什么也不发生 ──
  // ⚠ 先把换手道具的充能清零 —— 上面玩了 12 步，每 8 步充 1 格，此刻它是「免费」模式，
  //   根本不会请求广告（第一版测试就栽在这个假设上）。清零后才走「看广告」这条路径。
  await page.evaluate(() => {
    G.items.refreshCharge = 0;
    G.items.turnsSinceCharge = 0;
    window.__ads.rewardResult = false;                                 // 玩家关掉了广告
    renderAll();
  });
  ok(await page.evaluate(() => Shop.refreshMode(G.wallet, G.items)) === 'ad', '换一手：没电时走「看广告」');
  const beforeRefuse = await page.evaluate(() => ({
    coins: G.wallet.coins, streamIndex: G.s.streamIndex, tray: Core.tray(G.s).map(p => p && p.id),
  }));
  await clickAction(page, 'REFRESH');                                   // 换一手要看广告
  await page.waitForTimeout(250);
  const afterRefuse = await page.evaluate(() => ({
    coins: G.wallet.coins, streamIndex: G.s.streamIndex, tray: Core.tray(G.s).map(p => p && p.id),
    rewarded: window.__ads.rewarded, interstitial: window.__ads.interstitial,
  }));
  ok(afterRefuse.rewarded >= 1, '点了换一手 → 请求激励视频');
  ok(afterRefuse.streamIndex === beforeRefuse.streamIndex, '拒绝广告 ⇒ 道具没生效（没有偷偷给）');
  ok(afterRefuse.coins === beforeRefuse.coins, '拒绝广告 ⇒ 不扣金币（不惩罚）');
  ok(afterRefuse.interstitial === 0, '⛔ 拒绝激励视频后，绝不强塞一个无奖励插屏（Block Blast 被骂最狠的一条）');

  // ── 接受广告 ⇒ 道具生效，且拿到的正是「预览里的下一手」（不是重抽）──
  const nextBefore = await page.evaluate(() => Core.nextHand(G.s).map(p => p.id));
  await page.evaluate(() => { window.__ads.rewardResult = true; });
  await clickAction(page, 'REFRESH');
  await page.waitForTimeout(250);
  const afterAccept = await page.evaluate(() => Core.tray(G.s).map(p => p && p.id));
  ok(JSON.stringify(afterAccept) === JSON.stringify(nextBefore),
    '看完广告 → 换到的正是预览里那一手（道具改变不了后面是什么 = 公平承诺）');

  // ── 关卡失败零广告 ──
  await page.evaluate(() => {
    dispatch('PLAY_LEVEL', { id: 1 });
    const s = G.s;
    for (let i = 0; i < 64; i++) s.board[i] = 1;
    s.board[0] = 0;
    s.over = Core.isOver(s);
    renderAll();
  });
  const failActions = await page.evaluate(() => {
    const { SW, SH } = GameGlobal, found = [];
    for (let y = 0; y < SH; y += 6) for (let x = 0; x < SW; x += 6) {
      const h = hitTest(x, y);
      if (h && !found.includes(h.action)) found.push(h.action);
    }
    return { found, interstitial: window.__ads.interstitial };
  });
  ok(!failActions.found.some(a => /AD|REVIVE/i.test(a)),
    `⛔ 关卡失败界面零广告按钮（只有：${failActions.found.join(', ')}）`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-03-fail-no-ads.png') });

  // ── 插屏只在通关后、每 3 次最多一个 ──
  const interCount = await page.evaluate(() => {
    window.__ads.interstitial = 0;
    G.wallet.winsSinceAd = 0;
    for (let k = 0; k < 6; k++) {                       // 模拟连赢 6 关
      const show = Shop.canShowInterstitial(G.wallet);
      Shop.noteWin(G.wallet, show);
      if (show) window.__ads.interstitial++;
    }
    return window.__ads.interstitial;
  });
  ok(interCount <= 2, `连赢 6 关只出了 ${interCount} 个插屏（每 3 次最多 1 个）`);

  // ── 去广告 IAP：插屏归零，但功能不变少 ──
  await clickAction(page, 'MENU');
  ok(await clickAction(page, 'PAGE_SHOP'), '菜单能进商店');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-04-shop.png') });
  ok(await clickAction(page, 'BUY_NOADS'), '能买去广告');
  const paid = await page.evaluate(() => {
    G.wallet.coins = 500;
    const it = Shop.newRunItems(); it.undoFree = 0;
    return {
      noAds: G.wallet.noAds,
      canInterstitial: Shop.canShowInterstitial(G.wallet),
      undoMode: Shop.undoMode(G.wallet, it),     // 付费玩家：不该被要求看广告
    };
  });
  ok(paid.noAds && !paid.canInterstitial, '✅ 买了去广告 ⇒ 插屏一个都没有');
  ok(paid.undoMode !== 'ad', '✅ 付费玩家不会被要求看广告（功能改走金币，不是消失）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-05-noads.png') });

  ok(errors.length === 0, '全程零 error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT_DIR}`);
  console.log(process.exitCode ? '\n✗ P4 E2E 有失败项' : '\n✓ P4 E2E 全绿');
})();
