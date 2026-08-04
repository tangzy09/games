// tools/shot-fontscale.cjs — ⭐ 字号缩放的验收（2026-08-04 用户定：所有游戏都要能调字体大小）。
//
// 逐游戏 × 三档字号各截一张，并断言：
//   ① 顶栏真的有字号按钮（新游戏漏接引擎顶栏时会挂在这一条）；
//   ② 选了大号之后 GameGlobal.fontScale 真的变了、且**重画后仍然是它**（存得住）。
// ⛔ 「大字会不会把布局撑破」机器判不了 —— **必须逐张看图**（本仓截图验收的老规矩）。
// 用法: node tools/shot-fontscale.cjs   → C:/tmp/fontscale/*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), PORT = 8191, SHOT = 'C:/tmp/fontscale';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav' };
const GAMES = ['minesweeper', 'snake', 'abyssshoot', 'blockblast', 'solitaire'];

function serve() { return new Promise((res, rej) => {
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  srv.on('error', rej); srv.listen(PORT, () => res(srv));
}); }

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const g of GAMES) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    page.on('dialog', d => d.accept());
    try {
      await page.goto(`http://127.0.0.1:${PORT}/games/${g}/index.html`, { timeout: 20000 });
      await page.waitForTimeout(2200);
      // 跳过首启浮层（各游戏 action 不同，尽力而为）
      await page.evaluate(() => {
        try { if (window.G && G.phase === 'INTRO' && typeof dispatch === 'function') dispatch('INTRO_GO'); } catch (e) {}
      });
      await page.waitForTimeout(300);

      // ① 顶栏必须有字号按钮
      const hasBtn = await page.$('#font-btn');
      if (!hasBtn) { fails++; console.log(`FAIL ${g} — 顶栏没有字号按钮（#font-btn）`); await page.close(); continue; }

      for (const [v, tag] of [[1, 'S'], [1.15, 'M'], [1.3, 'L']]) {
        const got = await page.evaluate(x => {
          setFontScale(x);
          try { if (typeof renderAll === 'function') renderAll(); } catch (e) {}
          return GameGlobal.fontScale;
        }, v);
        if (Math.abs(got - v) > 0.001) { fails++; console.log(`FAIL ${g} ${tag} — fontScale 没生效（${got}）`); }
        await page.waitForTimeout(260);
        await page.screenshot({ path: path.join(SHOT, `${g}-${tag}.png`) });
      }
      // ② 存得住：重新载入后仍是大号
      await page.reload({ timeout: 20000 });
      await page.waitForTimeout(2000);
      const kept = await page.evaluate(() => GameGlobal.fontScale);
      if (Math.abs(kept - 1.3) > 0.001) { fails++; console.log(`FAIL ${g} — 刷新后没记住字号（${kept}）`); }
      else console.log(`ok   ${g}（三档 + 刷新后记得住）`);
      await page.evaluate(() => setFontScale(1));      // 复原，别污染下一个游戏（共用一个键）
    } catch (e) { fails++; console.log(`FAIL ${g} — ${String(e).slice(0, 90)}`); }
    await page.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `\n✕ ${fails} 处不对 → ${SHOT}` : `\n✓ 五个游戏都能调字号 → ${SHOT}（⛔ 大字有没有撑破布局**必须看图**）`);
  process.exit(fails ? 1 : 0);
})();
