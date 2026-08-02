// tools/shot-ui.cjs — 一次截全部界面（主界面/菜单/各二级页/局内/结算），改样式后目视验。
// 产物 C:/tmp/solitaire/ui/*.png。自带静态服务：`node games/solitaire/tools/shot-ui.cjs`
// ⚠ 先注入一份有进度的存档：空档页面全是 0/锁，看不出排版好坏。每屏跑两种视口（矮屏才是照妖镜）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8157;
const DIR = 'C:/tmp/solitaire/ui';
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
  let n = 0;

  for (const [tag, W, H] of [['', 414, 896], ['-small', 360, 640]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
    await page.waitForFunction(() => window.G && window.G.s, null, { timeout: 12000 });

    // ── 造进度（空档看不出排版）──
    await page.evaluate(() => {
      G.angels = 137; G.xp = 42000;
      G.lessonsDone = { 1: 1, 2: 1 };
      G.ach = { first: 1, clean: 1, streak3: 1 };
      G.stats = Object.assign(G.stats || {}, { played: 86, won: 41, streak: 4, bestStreak: 9, bestTime: 254000 });
      G.badges = { '2026-06': 'gold', '2026-07': 'silver' };
      G.dayScore = 8600;
      Money.coins = 1240;
      if (G.dailyDays) G.dailyDays.length = 0;
    });

    const shot = async (name) => {
      await page.evaluate(() => renderAll());
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${name}${tag}.png` });
      n++;
    };

    for (const ph of ['HOME', 'MENU', 'STATS', 'SHOP', 'GALLERY', 'ACH', 'INSIGHT', 'HELP', 'SET', 'FAIR', 'INTRO']) {
      await page.evaluate(p => { G.phase = p; }, ph);
      await shot('page-' + ph.toLowerCase());
    }

    // 局内 + 赢局结算
    await page.evaluate(() => { G.phase = 'PLAY'; });
    await shot('play');
    await page.evaluate(() => {
      const s = G.s;
      s.won = true; s.score = 1240;
      G.lastWinCoins = 45; G.lastAngelGain = 2;
      FX.reset && FX.reset();
    });
    await shot('win');

    await page.close();
  }

  await browser.close();
  srv.close();
  if (errs.length) console.error('⚠ pageerror:', [...new Set(errs)].slice(0, 4).join(' | '));
  console.log('ok', n, '张 →', DIR);
})().catch(e => { console.error(e); process.exit(1); });
