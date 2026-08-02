// e2e-home.cjs — 🏠 主界面（照 snake 天使主页做的纸牌版）：
//   启动落点 / hero 天使 + 零素材回退 / 主按钮智能续继 / 六格入口带角标 / 底部四钮 /
//   PLAY 顶栏 '‹' 回主界面 / 首启仍走 INTRO（**全套 E2E 都依赖这条**）。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8178, SHOT = 'C:/tmp/solitaire';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
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

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);

  // ── ① 首启仍是 INTRO（⚠ 全套 E2E 都建立在「全新 localStorage ⇒ INTRO」上，动了必炸）──
  ok(await page.evaluate(() => G.phase === 'INTRO'), '⭐ 首启仍落 INTRO（教学第一课那一屏）');

  // ── ② 二次启动落 🏠 主界面 ──
  await page.evaluate(() => { dispatch('INTRO_GO'); dispatch('TOG_RFX'); });
  await page.reload();
  await page.waitForFunction(() => window.G && window.G.s);
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => G.phase === 'HOME'), '⭐ 再次启动落在主界面（回访的必经之路）');

  // ── ③ 零进度：没解锁天使也要画得出来（回退四花色，绝不空着）──
  const zero = await page.evaluate(() => {
    G.angels = 0; G.lessonsDone = {}; G.ach = {}; renderAll();
    return { acts: hitAreas.map(h => h.action) };
  });
  const need = ['HOME_PLAY', 'DAILY', 'LESSON', 'GALLERY', 'ACH', 'SHOP', 'STATS', 'SET', 'MENU', 'FAIR', 'HELP', 'TOG_RFX'];
  const missing = need.filter(a => !zero.acts.includes(a));
  ok(missing.length === 0, '⭐ 十二个入口齐活' + (missing.length ? '（缺 ' + missing.join(',') + '）' : ''));
  ok(errs.length === 0, '零天使时 hero 回退不报错');
  await page.screenshot({ path: path.join(SHOT, 'p18-01-home-new.png') });

  // ── ④ 有进度：hero 用**最近解锁的那张**（是「我的收藏」，不是装饰画）──
  const hero = await page.evaluate(() => {
    G.angels = 137; G.xp = 8400; Money.state.coins = 340;
    G.lessonsDone = { 1: 1, 2: 1 }; G.ach = { firstWin: 1, win10: 1, angels50: 1 };
    renderAll();
    return { want: Angels.fileAt(136), n: G.angels };
  });
  await page.waitForTimeout(900);                 // 等图解码（onload 会自己重画）
  await page.screenshot({ path: path.join(SHOT, 'p18-02-home-progress.png') });
  ok(!!hero.want, `⭐ hero 取最近解锁的那张（第 ${hero.n} 张 = ${hero.want}）`);

  // ── ⑤ 主按钮**智能续继**：局中未完 ⇒ 接着打，别把人扔回新局 ──
  await page.evaluate(() => {
    G.phase = 'PLAY'; dispatch('NEW');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { doMove(RulesK.legalMoves(G.s).find(m => m.t === 'draw') || { t: 'draw' }); dispatch('HOME'); });
  await page.waitForTimeout(400);
  const mid = await page.evaluate(() => ({ seed: G.s.seed, moves: G.s.moves.length, phase: G.phase }));
  ok(await click(page, 'HOME_PLAY'), '主按钮可点');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ seed: G.s.seed, moves: G.s.moves.length, phase: G.phase }));
  ok(after.phase === 'PLAY' && after.seed === mid.seed && after.moves === mid.moves,
     `⭐ 局中未完 ⇒ 「继续」接着打同一局（#${after.seed}，${after.moves} 步都还在）`);

  // ── ⑥ 已赢 / 没开局 ⇒ 主按钮发新局 ──
  await page.evaluate(() => { G.s.won = true; dispatch('HOME'); });
  await page.waitForTimeout(300);
  await click(page, 'HOME_PLAY');
  await page.waitForTimeout(500);
  const fresh = await page.evaluate(() => ({ won: G.s.won, moves: G.s.moves.length, phase: G.phase }));
  ok(fresh.phase === 'PLAY' && !fresh.won && fresh.moves === 0, '⭐ 上一局已赢 ⇒ 主按钮发新局');

  // ── ⑦ PLAY 顶栏 '‹' 回主界面 ──
  ok(await click(page, 'HOME'), "PLAY 顶栏 '‹' 可点");
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => G.phase === 'HOME'), "⭐ '‹' 回主界面（MENU 挂在主界面的「⋯ 更多」里）");

  // ── ⑧ 每个入口都真的进得去（空按钮不给人点进去的理由 ⇒ 那就别让它点了白点）──
  for (const [act, want] of [['LESSON', 'PLAY'], ['GALLERY', 'GALLERY'], ['ACH', 'ACH'],
                             ['SHOP', 'SHOP'], ['STATS', 'STATS'], ['SET', 'SET'], ['MENU', 'MENU']]) {
    await page.evaluate(() => { G.lesson = 0; dispatch('HOME'); });
    await page.waitForTimeout(250);
    await click(page, act);
    await page.waitForTimeout(act === 'LESSON' ? 1600 : 350);
    const ph = await page.evaluate(() => G.phase);
    ok(ph === want, `  ${act} → ${ph}`);
  }

  // ── ⑨ 刘海/灵动岛：主界面顶部内容必须在 safeTop 之下 ──
  await page.evaluate(() => { dispatch('HOME'); });
  await page.waitForTimeout(300);
  const top = await page.evaluate(() => {
    const ys = hitAreas.map(h => h.y);
    return { minY: Math.min.apply(null, ys), safeTop: GameGlobal.safeTop };
  });
  ok(top.minY >= top.safeTop, `⛔ 刘海：最靠上的可点区 y=${Math.round(top.minY)} ≥ safeTop=${top.safeTop}`);

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 主界面 E2E 有失败项' : '\nOK 主界面 E2E 全绿');
})();
