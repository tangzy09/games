// games/snake/tools/preview/capture.cjs — 录制 App Preview 原片（886×1920 webm）
//
// 双根静态服务：/ → 本目录的 video-stage.html，其余 → 仓库根（app 与素材都从真仓库拿）。
// Playwright recordVideo 出 webm；音轨由 mux.cjs 用 __sfx 时间戳另铺（无头浏览器录不到声音）。
// 用法：node games/snake/tools/preview/capture.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '../../../..');
const HERE = __dirname, REC = path.join(HERE, 'rec');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

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
  await new Promise(r => server.listen(8918, r));
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
  await page.goto('http://127.0.0.1:8918/video-stage.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__done===true', null, { timeout: 90000 });
  await page.waitForTimeout(600);
  const sfxArr = await page.evaluate(() => window.__sfx);
  const caps = await page.evaluate(() => window.__caps);
  fs.writeFileSync(path.join(HERE, 'sfx.json'), JSON.stringify(sfxArr, null, 1));
  fs.writeFileSync(path.join(HERE, 'caps.json'), JSON.stringify(caps, null, 1));
  await ctx.close(); await browser.close(); server.close();
  const v = fs.readdirSync(REC).find(f => f.endsWith('.webm'));
  fs.copyFileSync(path.join(REC, v), path.join(HERE, 'preview-raw.webm'));
  const kb = (fs.statSync(path.join(HERE, 'preview-raw.webm')).size / 1024).toFixed(0);
  console.log(`OK 原片 ${kb}KB · 音效事件 ${sfxArr.length} 条 · 字幕 ${caps.length} 条`);
})().catch(e => { console.error(e); process.exit(1); });
