// games/solitaire/tools/preview/capture.cjs — 录制 App Preview 原片（886×1920 webm）
//
// 双根静态服务：/ → 本目录的 video-stage.html，其余 → 仓库根（app 与素材都从真仓库拿，同源才能 eval 驱动）。
// 用法：node games/solitaire/tools/preview/capture.cjs
// ⚠ 无头浏览器录不到声音；本片**本来就无声**（用户定：不要音乐），所以不需要另铺音轨。
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '../../../..');
const HERE = __dirname, REC = path.join(HERE, 'rec');
const PORT = 8926;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/video-stage.html';
  const file = p === '/video-stage.html' ? path.join(HERE, 'video-stage.html') : path.join(REPO, p.slice(1));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.rmSync(REC, { recursive: true, force: true });
  const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 886, height: 1920 }, deviceScaleFactor: 1,
    recordVideo: { dir: REC, size: { width: 886, height: 1920 } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pg-exc]', String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') console.log('[pg-err]', m.text().slice(0, 160)); });
  await page.goto(`http://127.0.0.1:${PORT}/video-stage.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done===true', null, { timeout: 180000 });
  await page.waitForTimeout(700);                       // 定帧：不留这一下，片尾会被截掉
  const caps = await page.evaluate(() => window.__caps);
  fs.writeFileSync(path.join(HERE, 'caps.json'), JSON.stringify(caps, null, 1));
  await ctx.close();                                     // ⚠ close 才 flush 视频文件
  await browser.close();
  server.close();

  const f = fs.readdirSync(REC).find(x => x.endsWith('.webm'));
  const out = path.join(HERE, 'preview-raw.webm');
  fs.copyFileSync(path.join(REC, f), out);
  console.log('原片 →', out, (fs.statSync(out).size / 1048576).toFixed(1) + 'MB', '| 字幕', caps.length, '条');
})();
