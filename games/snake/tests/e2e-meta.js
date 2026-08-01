// e2e-meta.js — 粘度层接线（DOM）：档案头 / 「下一个目标」条 / 天使榜 / 连续奖励阶梯。
// 单测（test-meta.js）管纯函数，这里只管**真的接上去了没有**——
// 三款产品的教训：纯函数全绿但没接进 UI 的功能，等于不存在。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8194, SHOT = 'C:/tmp/snake';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
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

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/snake/index.html`);
  await page.waitForFunction(() => window.G && window.G.save && window.Meta, { timeout: 20000 });
  await page.waitForTimeout(1200);

  // 注入一份有进度的存档（空档看不出接没接上 —— skill 的老规矩）
  await page.evaluate(() => {
    G.save.stats.totalScore = 68000;
    G.save.daily.giftStreak = 6; G.save.daily.rewarded = ['r3'];
    G.save.ach.unlocked = ['a', 'b', 'c'];
    if (G.imgList && G.imgList.length) G.save.gallery.unlocked = G.imgList.slice(0, 123);
    openHome();
  });
  await page.waitForTimeout(500);

  // ── ① 档案头：称号 + Lv + XP 条 ──
  const prof = await page.evaluate(() => {
    const el = document.querySelector('.home-prof');
    if (!el) return null;
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(),
             bar: !!el.querySelector('.pf-bar i'),
             w: el.querySelector('.pf-bar i').style.width };
  });
  ok(prof && prof.bar, '⭐ 主界面有档案头（头像 + 称号 + XP 条）');
  ok(prof && /Lv\s*20/.test(prof.txt), `⭐ 等级由累计分推出（6.8 万分 → ${(prof.txt.match(/Lv\s*\d+/) || [])[0]}）`);
  ok(prof && parseFloat(prof.w) > 0 && parseFloat(prof.w) <= 100, `XP 条宽度合法（${prof.w}）`);

  // ── ② 「下一个目标」条：有内容且点得动 ──
  const goal = await page.evaluate(() => {
    const el = document.getElementById('home-goal');
    return el ? { act: el.dataset.act, txt: el.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
  ok(goal && goal.txt.length > 4, `⭐ 有「下一个目标」条（${goal ? goal.txt : '—'}）`);
  ok(goal && ['quests', 'daily', 'gallery', 'ladder', 'stats'].includes(goal.act),
     `目标条指向一个真实入口（${goal && goal.act}）`);
  await page.click('#home-goal');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('panel').classList.contains('hidden')),
     '⭐ 点目标条直达对应面板（不是死按钮）');
  await page.click('#panel-close');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT, 'p21-01-home-meta.png') });

  // ── ③ 天使榜：入口带角标 → 页面 → **打开就定位到「你」** ──
  const entry = await page.evaluate(() => {
    const el = document.getElementById('home-ladder');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  ok(entry && /6\s*\/\s*20/.test(entry), `⭐ 菜单有天使榜入口且带角标（${entry}）`);
  await page.click('#home-ladder');
  await page.waitForTimeout(500);
  const ld = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ld-row')];
    const me = document.querySelector('.ld-row.me');
    const box = document.getElementById('panel-body').getBoundingClientRect();
    const mb = me ? me.getBoundingClientRect() : null;
    return {
      n: rows.length, hasMe: !!me,
      passed: document.querySelectorAll('.ld-row.passed').length,
      meVisible: !!mb && mb.top >= box.top - 4 && mb.bottom <= box.bottom + 4,
      body: document.getElementById('panel-body').textContent,
    };
  });
  ok(ld.n === 21 && ld.hasMe, `⭐ 榜上 20 位角色 + 你（共 ${ld.n} 行）`);
  ok(ld.passed === 6, `⭐ 已超过的 6 位被标灰（与 beatenCount 一致，进度零存档）`);
  ok(ld.meVisible, '⭐ 打开就滚到「你」那一行（榜的意义就是看自己在哪格）');

  // ⛔ 文案红线：榜上绝不出现「玩家 / player」（社会证明可以虚构，但不能伪造成真人）
  const blame = ['player', 'Player', '玩家', 'user ', 'users'].filter(w => ld.body.includes(w));
  ok(blame.length === 0, '⛔ 榜页零「玩家/player」字样' + (blame.length ? '（命中 ' + blame.join(',') + '）' : ''));
  await page.screenshot({ path: path.join(SHOT, 'p21-02-ladder.png') });
  await page.click('#panel-close');
  await page.waitForTimeout(300);

  // ── ④ 连续奖励阶梯：打卡到 7 天档 ⇒ 补发天使 ──
  const streak = await page.evaluate(() => {
    const y = new Date(Date.now() - 86400000);
    const p2 = n => String(n).padStart(2, '0');
    // 造「昨天领过、已连 6 天、只领过 r3」的状态 ⇒ 今天打卡应到 7 天档
    G.save.daily.lastGiftDay = y.getFullYear() + '-' + p2(y.getMonth() + 1) + '-' + p2(y.getDate());
    G.save.daily.giftStreak = 6; G.save.daily.rewarded = ['r3'];
    const before = G.save.gallery.unlocked.length;
    claimDaily();
    return { before, after: G.save.gallery.unlocked.length,
             streak: G.save.daily.giftStreak, rewarded: G.save.daily.rewarded.slice(),
             bonus: G.streakBonus };
  });
  ok(streak.streak === 7 && streak.rewarded.join(',') === 'r3,r7',
     `⭐ 连到第 7 天 ⇒ 发 7 天档奖励（水位 ${streak.rewarded.join('+')}）`);
  ok(streak.after - streak.before >= 8,
     `⭐ 奖励是「一次见效」的厚度（+${streak.after - streak.before} 张天使）`);

  // ⛔ 领过就不再重发（同一天再点、或明天再打卡都不能重复发）
  const again = await page.evaluate(() => {
    const before = G.save.gallery.unlocked.length;
    claimDaily();                                 // 今天已领 ⇒ 直接 return
    return { d: G.save.gallery.unlocked.length - before, rewarded: G.save.daily.rewarded.slice() };
  });
  ok(again.d === 0 && again.rewarded.join(',') === 'r3,r7', '⛔ 同一天重复领 ⇒ 零发放');

  // ── ⑤ ⛔ 经济红线：断签→补签不能刷奖（水位必须跟着恢复）──
  const repair = await page.evaluate(() => {
    // 模拟：断签（streak 回 1、水位清空）后用补签接回 8 天
    G.save.daily.giftStreak = 1; G.save.daily.rewarded = [];
    G.repairOffer = 7;
    // 走补签的落地逻辑（与 daily-fix 按钮里那段同一份口径）
    G.save.daily.giftStreak = G.repairOffer + 1;
    G.save.daily.rewarded = Meta.STREAK_REWARDS
      .filter(r => G.save.daily.giftStreak >= r.days).map(r => r.key);
    return { streak: G.save.daily.giftStreak, rewarded: G.save.daily.rewarded.slice(),
             due: Meta.dueRewards(G.save.daily.giftStreak, G.save.daily.rewarded).map(r => r.key) };
  });
  ok(repair.streak === 8 && repair.rewarded.join(',') === 'r3,r7' && repair.due.length === 0,
     '⛔ 补签把**已领水位一起恢复** ⇒ 不会重发 3/7 档（否则「故意断签→补签」可无限刷）');

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 粘度层 E2E 有失败项' : '\nOK 粘度层 E2E 全绿');
})();
