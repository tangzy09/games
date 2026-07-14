// e2e-intro.cjs — 首启一屏（**App Store 4.3(a) 的主要防线**）。
//
// 为什么值得一个专门的 E2E：纸牌是极端红海、我们的玩法是 100% 经典规则，
// 真正的差异（设备上跑求解器、公开可解率落差）**全在按钮后面**。
// 审核员只花两三分钟：打开 → 一张普通牌桌 → 4.3(a) 拒。
// ⇒ 这一屏是差异化唯一「主动撞到脸上」的机会。它哪天被悄悄改没了，测试必须炸。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8165, SHOT = 'C:/tmp/solitaire';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.on('error', rej); srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('X ' + m); process.exitCode = 1; } else console.log('OK ' + m); };

async function click(page, action) {
  const box = await page.evaluate(a => {
    const h = hitAreas.filter(x => x.action === a).pop();
    if (!h) return null;
    const c = document.getElementById('game-canvas').getBoundingClientRect();
    const sx = c.width / GameGlobal.SW, sy = c.height / GameGlobal.SH;
    return { x: c.left + (h.x + h.w / 2) * sx, y: c.top + (h.y + h.h / 2) * sy };
  }, action);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);

  // ⭐ 全新用户（空 localStorage）第一次打开 —— 必须先看到首启一屏
  ok(await page.evaluate(() => G.phase === 'INTRO'),
    '⭐ 全新用户打开 → 首启一屏（差异化在头 5 秒撞到脸上，不是藏在按钮后面）');
  await page.screenshot({ path: path.join(SHOT, 'p7-01-intro-en.png') });

  await page.evaluate(() => I18N.setLang('zh-CN'));
  await page.waitForTimeout(250);
  await page.evaluate(() => renderAll());
  await page.screenshot({ path: path.join(SHOT, 'p7-02-intro-zh.png') });

  // 一键进公平页（审核员最短路径：打开 → 一下就看到那些数字）
  ok(await click(page, 'INTRO_FAIR'), '「看看那些数字」可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => G.phase === 'FAIR'), '⭐ 从首启一屏**一下**就能到公平页（审核员的最短路径）');

  // 回到牌桌 → 首启一屏不再出现
  await click(page, 'PLAY');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => G.phase === 'PLAY'), '回到牌桌');

  await page.reload();
  await page.waitForFunction(() => window.G && window.G.s);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => G.phase !== 'INTRO'), '⭐ 看过一次后重开 → 首启一屏不再出现（不烦老玩家）');

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 首启 E2E 有失败项' : '\nOK 首启 E2E 全绿');
})();
