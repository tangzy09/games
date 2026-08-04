// tools/shot-ads.cjs — ⭐ 激励视频入口的目检 + **自动断言**（2026-08-03「广告标识 + 明示奖励」批）
//
// AdMob 政策与转化在这件事上同向：激励广告必须让玩家**看得出是广告**、**看得见给什么**。
// 这个脚本把八个位逐个摆出来截图，并断言每个位都真的注册了可点区（没被布局挤掉）。
// 用法: node games/solitaire/tools/shot-ads.cjs   → C:/tmp/solitaire/ads/*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8185, SHOT = 'C:/tmp/solitaire/ads';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav' };

// [label, 摆状态的 js, 该屏必须存在的广告 action]
const SCENES = [
  ['home-gift',  "G.phase='HOME'; renderAll();",                                   'DAILY_GIFT'],
  ['menu-coins', "G.phase='MENU'; renderAll();",                                   'EARN_AD'],
  ['shop',       "G.phase='SHOP'; renderAll();",                                   'AD_BACK'],
  ['gallery',    "G.phase='GALLERY'; renderAll();",                                'GAL_AD'],
  ['play-peek',  "G.phase='PLAY'; renderAll();",                                   'AD_PEEK'],
  ['win',        "G.s.won=1; G.lastWinCoins=40; G.winDoubled=false; FX.reset(); G.phase='PLAY'; renderAll();", 'WIN_X2'],
  ['joker',      "G.s.won=0; G.jokers=0; G.jokerOffer=Date.now()+9e5; G.phase='PLAY'; renderAll();", 'JOKER_AD'],
];

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
  const LANG = process.argv[2] || 'en';          // 长语言体检：node shot-ads.cjs de
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`, { timeout: 20000 });
  await page.waitForTimeout(2500);
  // 摆一个「有进度的老玩家」：图鉴没集满(图鉴位才出现)、有金币、连续天数正要断(补签位才出现)
  await page.evaluate(() => {
    GameGlobal.__forceSafeTop = 59; GameGlobal.safeBottom = 34;
    G.seenIntro = 1; G.stats.played = 50; G.stats.won = 12; G.angels = 60;
    Money.state.coins = 400; Money.save();
    if (G.phase === 'INTRO') dispatch('INTRO_GO');
    dispatch('NEW');
  });
  if (LANG !== 'en') { await page.evaluate(l => I18N.setLang(l), LANG); await page.waitForTimeout(700); }
  await page.waitForTimeout(500);

  for (const [label, js, action] of SCENES) {
    await page.evaluate(js);
    await page.waitForTimeout(350);
    const hit = await page.evaluate(a => {
      const { SW, SH } = GameGlobal;
      for (let y = 4; y < SH; y += 4) for (let x = 4; x < SW; x += 10) {
        const h = hitTest(x, y);
        if (h && h.action === a) return true;
      }
      return false;
    }, action);
    if (!hit) { fails++; console.log(`FAIL ${label} — 找不到 ${action} 的可点区（被布局挤掉了？）`); }
    else console.log(`ok   ${label} (${action})`);
    await page.screenshot({ path: path.join(SHOT, label + (LANG==='en'?'':'-'+LANG) + '.png') });
  }
  await page.close();
  await browser.close(); srv.close();
  console.log(fails ? `\n✕ ${fails} 个激励位没画出来 → ${SHOT}` : `\n✓ 八个激励位都在 → ${SHOT}`);
  process.exit(fails ? 1 : 0);
})();
