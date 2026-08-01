// tools/shot-ui.cjs — 一次截全部 DOM 界面,改样式后目视验(产物 C:/tmp/snake/ui/)
// 用法:先起静态服务(仓库根)`python -m http.server 8123`,再 node games/snake/tools/shot-ui.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8123';
const PATH_ = process.argv[3] || (/localhost|127\.0\.0\.1/.test(BASE) ? '/games/snake/' : '/');
const DIR = 'C:/tmp/snake/ui';

const SHOTS = [
  ['home',    () => { openHome(); }],
  ['quests',  () => { openQuests(); }],
  ['stats',   () => { openStats(); }],
  ['skins',   () => { openSkins(); }],
  ['gallery', () => { openGallery(); }],
  ['ach',     () => { openAchievements(); }],
  ['ach-cum', () => { openAchievements('cum'); }],
  ['howto',   () => { openHowTo(); }],
  ['lang',    () => { openLangMenu(); }],
];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  p.on('dialog', d => d.accept());
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + PATH_, { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1800);
  // 造一点进度,免得每屏都是 0(空页看不出排版好坏)
  await p.evaluate(() => {
    const s = window.G.save;
    s.stats.levelsCleared = 23; s.stats.apples = 412; s.stats.cellsRevealed = 5130;
    s.stats.steps = 9820; s.stats.deaths = 7; s.stats.playtimeMs = 4260000;
    s.stats.maxCombo = 12; s.stats.maxLen = 41; s.stats.setsDone = 1; s.stats.revives = 3;
    s.daily.giftStreak = 5;
    s.gallery.unlocked = (window.G.imgList || []).slice(0, 37);
    s.stats.distinctImgs = s.gallery.unlocked.length;
    s.gallery.stars = {}; s.gallery.unlocked.forEach((f, i) => { s.gallery.stars[f] = (i % 3) + 1; });
    s.ach.unlocked = ['img_1', 'img_2', 'aic_1', 'aic_2', 'death_1', 'sk_cloud_1', 'rev_1'];
    Quests.bump(s, ymd(Date.now()), Quests.todays(ymd(Date.now()))[0].t, 3);
    persist();
  });

  for (const [name, fn] of SHOTS) {
    await p.evaluate(() => {                       // 每屏前收干净上一屏
      const el = document.getElementById('panel'); if (el) el.classList.add('hidden');
      const lb = document.getElementById('lightbox'); if (lb) lb.classList.add('hidden');
      const h = document.getElementById('home'); if (h) h.classList.add('hidden');
    });
    await p.evaluate(`(${fn.toString()})()`);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${DIR}/${name}.png` });
  }
  if (errs.length) console.error('⚠ pageerror:', errs.join(' | '));
  await b.close();
  console.log('ok', SHOTS.length, '张 →', DIR);
})().catch(e => { console.error(e); process.exit(1); });
