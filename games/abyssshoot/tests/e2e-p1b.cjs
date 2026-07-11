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
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      // 路径穿越判断:必须是 ROOT 本身或 ROOT/ 下的真子路径。
      // 用裸 startsWith(ROOT) 会把 `games-backup` 这类兄弟目录也当成命中。
      const inRoot = f === ROOT || f.startsWith(ROOT + path.sep);
      if (!inRoot || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    // 本仓多会话并行共用:端口被别的会话占着时给一句人话,别抛裸 EADDRINUSE。
    srv.on('error', e => rej(e.code === 'EADDRINUSE'
      ? new Error(`端口 ${PORT} 被占用(另一个会话在跑 e2e?)。等它跑完或改 PORT。`)
      : e));
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  let browser;
  try {
    browser = await chromium.launch();
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

    // 连射直到死。选列用确定性轮询(非 Math.random):失败时轨迹可复现。
    let guard = 0;
    while (guard < 3000) {
      const dead = await page.evaluate(n => {
        if (G.phase !== 'PLAYING') return true;
        dispatch('SHOOT', { col: n % G.s.cols });
        return G.phase !== 'PLAYING';
      }, guard);
      guard++;
      if (dead) break;
    }
    st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots,
                                      score: G.s.score, maxTile: G.s.maxTile,
                                      breached: G.s.board.filter(c => c.length > G.s.rows).length }));
    if (st.phase !== 'DEAD') throw new Error('连射到底应进 DEAD,实为 ' + st.phase);
    if (!st.dead) throw new Error('DEAD 相位下 core 应 dead');
    if (!(st.score > 0)) throw new Error('整局下来分数应 > 0,实为 ' + st.score);
    if (!(st.maxTile >= 4)) throw new Error('整局下来应至少合出过 4,实为 ' + st.maxTile);
    if (!(st.shots > 5)) throw new Error('局长应 > 5 发,实为 ' + st.shots);
    // 顶爆的那一格(index === rows)是死因的空间信息,渲染必须有东西可画。
    if (!(st.breached >= 1)) throw new Error('死亡时应至少有一列越过死线(length > rows),实为 ' + st.breached);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-2-dead.png') });
    console.log(`OK 整局跑通:${st.shots} 发 / 分 ${st.score} / 最深 ${st.maxTile} / 顶爆 ${st.breached} 列 → DEAD`);

    // 重开
    await page.evaluate(() => dispatch('RESTART', {}));
    st = await page.evaluate(() => ({ phase: G.phase, shots: G.s.shots, score: G.s.score }));
    if (st.phase !== 'PLAYING' || st.shots !== 0 || st.score !== 0)
      throw new Error('RESTART 应回到全新 PLAYING 局,实为 ' + JSON.stringify(st));
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-3-restart.png') });
    console.log('OK RESTART → 全新一局');

    if (errors.length) throw new Error('页面有 JS 错误:\n' + errors.join('\n'));

    console.log(`e2e-p1b OK (截图在 ${SHOT_DIR})`);
  } finally {
    // 失败也必须回收:否则留下孤儿 Chromium + 占着端口,坑下一个并行会话。
    if (browser) await browser.close();
    srv.close();
  }
})().catch(e => { console.error('e2e-p1b FAIL:', e.message); process.exit(1); });
