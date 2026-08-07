// 只做一件事：把成就全解锁，看那 10 个格子里的 ★ 是不是真画出来了。
// 由来：2026-08-07 把 '★' 字面量换成矢量 drawStar（安卓 WebView 豆腐块），
// 而那一格里 ★ 是**唯一**内容 ⇒ 画错/画丢在功能测试里完全看不出来（没有断言够得着它）。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8191, OUT = 'C:/tmp/connect4';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };

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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${PORT}/games/connect4/index.html`, { timeout: 20000 });
  await page.waitForTimeout(2000);
  // 把计数器摆到「全都够了」——⚠ 照真实字段写，别手捏 achievements 数组
  // ⚠ 照 drawStats 真正读的那几个 key 摆（⛔ 别手捏 achievements 数组 —— 那就绕开了被测的路径）；
  //   lessonsDone 是从课程进度算的，一并把 16 课全标完成。
  const got = await page.evaluate(() => {
    ['games', 'wins', 'winsNoHint', 'brilliants', 'bestAcc'].forEach(k => C4Settings.set(k, 999));
    const done = {}; for (let i = 1; i <= 16; i++) done['l' + i] = 1;
    try { C4Settings.set('lessons', done); } catch (e) {}
    G.phase = 'STATS'; renderAll();
    const st = {
      games: C4Settings.get('games') | 0, wins: C4Settings.get('wins') | 0,
      winsNoHint: C4Settings.get('winsNoHint') | 0, brilliants: C4Settings.get('brilliants') | 0,
      bestAcc: C4Settings.get('bestAcc') | 0, lessonsDone: 16
    };
    const ach = C4Meta.achievements(st);
    return ach.filter(a => a.got).length + '/' + ach.length;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'stats-stars.png') });
  console.log('解锁数 =', got, '→', path.join(OUT, 'stats-stars.png'));
  await browser.close(); srv.close();
})();
