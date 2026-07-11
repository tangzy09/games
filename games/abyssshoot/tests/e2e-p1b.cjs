// e2e-p1b.cjs — Playwright 无头:整局跑通(HOME→射击→连锁→死亡→重开)+ 截图。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');   // 仓库根
const PORT = 8127;
const SHOT_DIR = 'C:\\tmp\\abyssshoot';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
               '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://localhost:${PORT}/games/abyssshoot/`);
  await page.waitForFunction(() => window.G && window.G.phase === 'HOME', { timeout: 8000 });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1-home.png') });
  console.log('OK HOME 渲染');

  // 开局
  await page.evaluate(() => dispatch('START', {}));
  let st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots }));
  if (st.phase !== 'PLAYING') throw new Error('START 后应进 PLAYING,实为 ' + st.phase);
  console.log('OK START → PLAYING');

  // 连射直到死(随机选列,上限保护)
  let guard = 0;
  while (guard++ < 3000) {
    const dead = await page.evaluate(() => {
      if (G.phase !== 'PLAYING') return true;
      dispatch('SHOOT', { col: Math.floor(Math.random() * G.s.cols) });
      return G.phase !== 'PLAYING';
    });
    if (dead) break;
  }
  st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots,
                                    score: G.s.score, maxTile: G.s.maxTile }));
  if (st.phase !== 'DEAD') throw new Error('连射到底应进 DEAD,实为 ' + st.phase);
  if (!st.dead) throw new Error('DEAD 相位下 core 应 dead');
  if (!(st.score > 0)) throw new Error('整局下来分数应 > 0,实为 ' + st.score);
  if (!(st.maxTile >= 4)) throw new Error('整局下来应至少合出过 4,实为 ' + st.maxTile);
  if (!(st.shots > 5)) throw new Error('局长应 > 5 发,实为 ' + st.shots);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-2-dead.png') });
  console.log(`OK 整局跑通:${st.shots} 发 / 分 ${st.score} / 最深 ${st.maxTile} → DEAD`);

  // 重开
  await page.evaluate(() => dispatch('RESTART', {}));
  st = await page.evaluate(() => ({ phase: G.phase, shots: G.s.shots, score: G.s.score }));
  if (st.phase !== 'PLAYING' || st.shots !== 0 || st.score !== 0)
    throw new Error('RESTART 应回到全新 PLAYING 局,实为 ' + JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-3-restart.png') });
  console.log('OK RESTART → 全新一局');

  if (errors.length) throw new Error('页面有 JS 错误:\n' + errors.join('\n'));

  await browser.close();
  srv.close();
  console.log(`e2e-p1b OK (截图在 ${SHOT_DIR})`);
})().catch(e => { console.error('e2e-p1b FAIL:', e.message); process.exit(1); });
