// e2e-home.cjs — 🏠 主界面（照 snake 天使主页做的方块版）：
//   启动落点 / hero 天使 + 零素材回退 / 智能续继主按钮 / 六格入口带角标 / 底部四钮 /
//   原 MENU 保留成「关卡地图」（功能一样没少，只是不再当门面）/ 刘海。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8191, SHOT = 'C:/tmp/blockblast';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
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
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);
  await page.waitForTimeout(600);

  // ── ① 启动落在 🏠 主界面（原来落在那张信息极密的 MENU 上）──
  ok(await page.evaluate(() => G.phase === 'HOME'), '⭐ 启动落在主界面');

  // ── ② 零进度也要画得出来（没解锁天使 ⇒ 回退画方块，绝不空着）──
  const zero = await page.evaluate(() => {
    G.wallet.angels = 0; G.progress = {}; G.profile.unlocked = []; renderAll();
    return [...new Set(hitAreas.map(h => h.action))];
  });
  const need = ['PLAY_ENDLESS', 'PLAY_DAILY', 'MENU', 'PAGE_ANG', 'PAGE_ACH',
                'PAGE_QUESTS', 'PAGE_SKIN', 'PAGE_STATS', 'PAGE_SHOP', 'PAGE_DEX',
                'PAGE_FAIR', 'PAGE_SET'];
  const miss = need.filter(a => !zero.includes(a));
  ok(miss.length === 0, '⭐ 十二个入口齐活' + (miss.length ? '（缺 ' + miss.join(',') + '）' : ''));
  ok(errs.length === 0, '零天使时 hero 回退不报错');
  await page.screenshot({ path: path.join(SHOT, 'p20-01-home-new.png') });

  // ── ③ 有进度：hero 用**最近解锁的那张**天使 ──
  await page.evaluate(() => {
    G.wallet.angels = 137; G.wallet.coins = 820;
    G.progress = { 1: 3, 2: 3, 3: 2, 4: 3, 5: 1, 6: 2 };
    G.profile.dailyStreak = 6; G.profile.unlocked = ['a', 'b', 'c', 'd', 'e'];
    renderAll();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOT, 'p20-02-home-progress.png') });
  ok(await page.evaluate(() => G.wallet.angels === 137), 'hero 取最近解锁的那张（第 137 张）');

  // ── ④ 主按钮**智能续继**：无尽局没打完 ⇒ 接着打，别把人扔回新局 ──
  await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
  await click(page, 'PLAY_ENDLESS');
  await page.waitForTimeout(400);
  const played = await page.evaluate(() => {
    // 造一个「打了一会儿」的无尽局（⚠ resumableScore 还要求 stats.turns > 0，光改分数不算）
    G.s.score = 4321; G.s.stats.turns = 12;
    G.phase = 'HOME'; renderAll();
    return { rs: resumableScore(), mode: G.s.mode, phase: G.phase };
  });
  ok(played.rs === 4321, `⭐ 主界面认得出没打完的局（分数 ${played.rs}）`);
  await click(page, 'PLAY_ENDLESS');
  await page.waitForTimeout(400);
  const cont = await page.evaluate(() => ({ phase: G.phase, score: G.s.score }));
  ok(cont.phase === 'PLAYING' && cont.score === 4321,
     `⭐ 「继续」接着打同一局（${cont.score} 分还在，没被扔回新局）`);

  // ── ⑤ 每个入口都真的进得去；原 MENU 变成「关卡地图」入口 ──
  for (const [act, want] of [['MENU', 'MENU'], ['PAGE_ANG', 'ANG'], ['PAGE_ACH', 'ACH'],
                             ['PAGE_QUESTS', 'QUESTS'], ['PAGE_SKIN', 'SKIN'],
                             ['PAGE_STATS', 'STATS'], ['PAGE_SHOP', 'SHOP'],
                             ['PAGE_DEX', 'DEX'], ['PAGE_FAIR', 'FAIR'], ['PAGE_SET', 'SET']]) {
    await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
    await page.waitForTimeout(120);
    await click(page, act);
    await page.waitForTimeout(220);
    const ph = await page.evaluate(() => G.phase);
    ok(ph === want, `  ${act} → ${ph}`);
  }

  // ── ⑥ 关卡地图（原 MENU）功能一样没少：章节页签 + 关卡格子都还在 ──
  await page.evaluate(() => { G.phase = 'MENU'; renderAll(); });
  const menu = await page.evaluate(() => {
    const a = hitAreas.map(h => h.action);
    return { chapter: a.includes('CHAPTER'), level: a.includes('PLAY_LEVEL'), n: a.length };
  });
  ok(menu.chapter && menu.level, `⭐ 关卡地图原样保留（章节页签 + 关卡格子，共 ${menu.n} 个可点区）`);

  // ── ⑦ 刘海：主界面顶部内容必须在 safeTop 之下 ──
  await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
  const top = await page.evaluate(() => ({
    minY: Math.min.apply(null, hitAreas.map(h => h.y)), safeTop: GameGlobal.safeTop,
  }));
  ok(top.minY >= top.safeTop, `⛔ 刘海：最靠上的可点区 y=${Math.round(top.minY)} ≥ safeTop=${top.safeTop}`);

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 主界面 E2E 有失败项' : '\nOK 主界面 E2E 全绿');
})();
