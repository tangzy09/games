// tools/shot-ui.cjs — 一次截「关卡地图 + 过关/失败结算 + 无尽结算」几屏，改样式后目视验。
// 产物 C:/tmp/blockblast/ui/*.png。自带静态服务，直接 `node games/blockblast/tools/shot-ui.cjs`。
// ⚠ 先注入有进度的存档：空进度的页面看不出排版好坏（照 snake/tools/shot-ui.cjs 的模板）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8155;
const DIR = 'C:/tmp/blockblast/ui';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', rej);
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const errs = [];
  const shots = [];

  for (const [tag, W, H] of [['', 414, 896], ['-small', 360, 640]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
    await page.waitForFunction(() => window.G && window.G.s, null, { timeout: 8000 });

    // ── 造进度：第 1 章全通（星数不一）、第 2 章通了 4 关、第 3 章未解锁 ──
    await page.evaluate(() => {
      for (let i = 1; i <= 10; i++) G.progress[i] = [3, 2, 3, 1, 3, 2, 3, 3, 1, 2][i - 1];
      for (let i = 11; i <= 14; i++) G.progress[i] = (i % 3) + 1;
      G.wallet.coins = 1240; G.wallet.angels = 137; G.wallet.gamesPlayed = 46;
      G.profile.dailyStreak = 5;
      G.best = 8420;
    });

    const shot = async (name) => {
      await page.evaluate(() => renderAll());
      await page.waitForTimeout(350);
      const p = `${DIR}/${name}${tag}.png`;
      await page.screenshot({ path: p });
      shots.push(p);
    };

    // 0) 🏠 主界面（图标全走共享 UI 库）
    await page.evaluate(() => { G.phase = 'HOME'; });
    await shot('home');
    // 1) 关卡地图（第 1 章：全通 + 宝箱可领）
    await page.evaluate(() => { G.phase = 'MENU'; G.chapter = 1; });
    await shot('menu-ch1');
    // 2) 关卡地图（第 2 章：打到一半）
    await page.evaluate(() => { G.chapter = 2; });
    await shot('menu-ch2');
    // 3) 关卡地图（第 3 章：全锁）
    await page.evaluate(() => { G.chapter = 3; });
    await shot('menu-ch3');

    // 4) 过关结算（三星：步数 ≤ par）
    await page.evaluate(() => {
      dispatch('PLAY_LEVEL', { id: 5 });
      const s = G.s;
      s.stats.turns = Math.max(1, s.par - 1); s.score = 3260;
      for (const k of Object.keys(s.goals)) s.collected[k] = s.goals[k];
      s.won = true; s.over = true;
      G.lastEarn = { n: 60 }; G.newAngels = 2;
    });
    await shot('win3');
    // 5) 过关结算（一星：远超 par，且金币已翻倍）
    await page.evaluate(() => {
      const s = G.s;
      s.stats.turns = Math.ceil(s.par * 2) + 3; s.score = 1180;
      G.lastEarn = { n: 48, doubled: true }; G.newAngels = 2;
    });
    await shot('win1');
    // 6) 关卡失败
    await page.evaluate(() => {
      const s = G.s; s.won = false; s.over = true; s.unwinnable = false;
    });
    await shot('fail');
    // 7) 无尽结算
    await page.evaluate(() => {
      dispatch('MENU'); dispatch('PLAY_ENDLESS');
      const s = G.s;
      s.score = 6120; s.over = true; s.stats.maxStreak = 9; s.stats.sweeps = 3;
      G.newAngels = 2; G.lastEarn = { n: 61 }; G.newBestRun = false;
    });
    await shot('endless-over');

    await page.close();
  }

  await browser.close();
  srv.close();
  if (errs.length) console.error('⚠ pageerror:', [...new Set(errs)].join(' | '));
  console.log('ok', shots.length, '张 →', DIR);
})().catch(e => { console.error(e); process.exit(1); });
