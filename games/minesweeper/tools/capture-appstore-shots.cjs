// Dungeon Sweep App Store 截图:2 locale × iPhone/iPad × 5 屏,输出 C:/tmp/dungeon-sweep/shots
// iPhone 430×932@3=1290×2796 (APP_IPHONE_67), iPad 1024×1366@2=2048×2732 (APP_IPAD_PRO_3GEN_129)
// 用法:node games/minesweeper/tools/capture-appstore-shots.cjs;出图后必须逐张 Read 验收(appstore-listing 的图片 HARD GATE)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const OUT = 'C:/tmp/dungeon-sweep/shots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

const LOCALES = { 'en-US': 'en', 'zh-Hans': 'zh-CN' };
const DEVICES = {
  iphone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },
  ipad:   { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2 },
};

// 中局盘面:数字格为主、点缀少量萌怪(避开炸弹邻格的 100+ 污染数字)、压血、攒到可升级
function craftMidGame() {
  dispatch('START_RUN'); Tut.done(); Meta.markHintDone = true; // 提示行在 iPad 视口会贴底裁切,直接不画
  G.grid.forEach((c, i) => {
    const y = (i / G.w) | 0;
    if (y < 8 && !c.mon && !c.item && cellNumber(i) < 100) c.rev = true;
  });
  const shown = { mousey: 0, flitter: 0, pudding: 0, cuddle: 0 };
  G.grid.forEach((c, i) => {
    const y = (i / G.w) | 0;
    if (y < 8 && c.mon && shown[c.mon] != null && shown[c.mon] < 2) { c.rev = true; shown[c.mon]++; }
  });
  const m = G.grid.find(c => c.rev && c.mon === 'mousey');
  if (m) m.defeated = true;
  G.hp = 4; G.level = 3; G.xp = 8; // xpNeed(3)=7 → 升级按钮点亮
  renderAll();
}

// 推理时刻:小片开局 + 两个已放置的数字标记 + 长按标记选择器打开
function craftDeduce() {
  dispatch('RESTART'); Tut.done(); Meta.markHintDone = true;
  G.grid.forEach((c, i) => {
    const x = i % G.w, y = (i / G.w) | 0;
    if (x < 7 && y < 6 && !c.mon && !c.item && cellNumber(i) < 100) c.rev = true;
  });
  let marked = 0;
  G.grid.forEach((c, i) => {
    const x = i % G.w, y = (i / G.w) | 0;
    if (!c.rev && !c.mon && x >= 1 && x < 6 && y >= 1 && y < 5 && marked < 2) { c.mark = marked ? 5 : 3; marked++; }
  });
  const t = G.grid.findIndex((c, i) => {
    const x = i % G.w, y = (i / G.w) | 0;
    return !c.rev && !c.mark && x >= 3 && x < 8 && y >= 5 && y < 8;
  });
  if (t >= 0) dispatch('MARK_MENU', { i: t });
  renderAll();
}

const SHOTS = [
  { name: '1-home', fn: async p => p.evaluate(() => {
      Meta.wins = 12; Meta.streak = 4; ['clear', 'lovers', 'egg'].forEach(b => Meta.badges.add(b));
      dispatch('GO_HOME'); renderAll();
    }) },
  { name: '2-board', fn: async p => p.evaluate(`(${craftMidGame})()`) },
  { name: '3-deduce', fn: async p => p.evaluate(`(${craftDeduce})()`) },
  { name: '4-codex', fn: async p => p.evaluate(() => { dispatch('GO_HOME'); dispatch('OPEN_CODEX'); renderAll(); }) },
  { name: '5-help', fn: async p => p.evaluate(() => { dispatch('GO_HOME'); dispatch('OPEN_HELP'); renderAll(); }) },
];

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  for (const [locale, lang] of Object.entries(LOCALES)) {
    for (const [dev, opts] of Object.entries(DEVICES)) {
      const dir = path.join(OUT, locale, dev);
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ ...opts, locale });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log(`  [pageerror ${locale}/${dev}] ${String(e).slice(0, 150)}`));
      await page.goto(`http://127.0.0.1:${port}/games/minesweeper/`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.evaluate(l => I18N.setLang(l), lang);
      await page.waitForTimeout(800);
      for (const s of SHOTS) {
        try {
          await s.fn(page);
          await page.waitForTimeout(1500); // 等 webp 精灵图加载后的 renderAll
          await page.screenshot({ path: path.join(dir, s.name + '.png') });
          console.log(`ok ${locale}/${dev}/${s.name}`);
        } catch (e) { console.log(`FAIL ${locale}/${dev}/${s.name}: ${e.message.slice(0, 150)}`); }
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log('done');
})();
