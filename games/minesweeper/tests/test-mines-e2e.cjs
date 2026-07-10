const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = 'C:/Users/tangz/Documents/Projects/games';
const OUT = 'C:/tmp/roguelite-minigames';
const PORT = 8646;
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
});
async function clickHit(page, action) {
  const pos = await page.evaluate(a => {
    const h = hitAreas.find(x => x.action === a);
    return h ? { x: h.x + h.w / 2, y: h.y + h.h / 2 } : null;
  }, action);
  if (!pos) return false;
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(220);
  return true;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(`http://localhost:${PORT}/games/minesweeper/`);
  await page.waitForTimeout(900);
  const s1 = await page.evaluate(() => ({ phase: G.phase, lang: I18N.lang }));
  await page.screenshot({ path: OUT + '/v21-home.png' });

  // start → straight to PLAYING; dragon revealed; portrait 10x13; tut step1
  await clickHit(page, 'START_RUN');
  const s2 = await page.evaluate(() => ({
    phase: G.phase, w: G.w, h: G.h, tut: G.tut && G.tut.step,
    dragonRev: G.grid.some(x => x.mon === 'dragon' && x.rev),
    orbRev: G.grid.some(x => x.item === 'orb' && x.rev),
  }));
  await page.screenshot({ path: OUT + '/v21-board.png' });

  // tut: reveal hidden empty → step2 → next → step3 → attack a lv1 hidden monster twice? (fight = defeated)
  await page.evaluate(() => { const i = G.grid.findIndex(x => !x.rev && !x.mon && !x.item); dispatch('CELL', { i }); });
  const t2 = await page.evaluate(() => G.tut && G.tut.step);
  await clickHit(page, 'TUT_NEXT');
  const t3 = await page.evaluate(() => G.tut && G.tut.step);
  await page.evaluate(() => {
    const i = G.grid.findIndex(x => x.mon === 'mousey' && !x.defeated);
    dispatch('CELL', { i });
  });
  const t4 = await page.evaluate(() => G.tut && G.tut.step);
  await clickHit(page, 'TUT_NEXT');
  const t5 = await page.evaluate(() => ({ tut: G.tut, flag: localStorage.getItem('mines_tut') }));
  console.log('tut:', JSON.stringify({ t2, t3, t4, t5 }));

  // corpse pickup + manual level-up button
  const c1 = await page.evaluate(() => {
    const i = G.grid.findIndex(x => x.mon && x.defeated && x.rev);
    const xpBefore = G.xp;
    dispatch('CELL', { i });
    return { gained: G.xp - xpBefore };
  });
  const c2 = await page.evaluate(() => { grantXp(10); renderAll(); return { can: canLevelUp(), level: G.level }; });
  await clickHit(page, 'LEVEL_UP');
  const c3 = await page.evaluate(() => ({ level: G.level, full: G.hp === G.maxHp }));
  console.log('corpse+levelup:', JSON.stringify({ ...c1, ...c2, after: c3 }));

  // win: pump hp, slay dragon (already revealed), collect crown, tap crown
  await page.evaluate(() => { G.maxHp = 14; G.hp = 14; renderAll(); });
  const dI = await page.evaluate(() => G.grid.findIndex(x => x.mon === 'dragon'));
  await page.evaluate(i => dispatch('CELL', { i }), dI); // fight
  const w1 = await page.evaluate(i => ({ defeated: G.grid[i].defeated, hp: G.hp }), dI);
  await page.evaluate(i => dispatch('CELL', { i }), dI); // pickup → crown
  const w2 = await page.evaluate(i => G.grid[i].spell, dI);
  await page.evaluate(i => dispatch('CELL', { i }), dI); // crown → WIN
  const w3 = await page.evaluate(() => ({ phase: G.phase, wins: Meta.wins, stored: localStorage.getItem('mines_wins'), badges: G.badgesThisRun.length }));
  await page.screenshot({ path: OUT + '/v21-win.png' });
  console.log('win:', JSON.stringify({ ...w1, crown: w2, ...w3 }));

  // lose + ad revive: exact-level attack (hp == lv) must kill the player
  await clickHit(page, 'RESTART');
  const l1 = await page.evaluate(() => {
    G.hp = 1;
    const i = G.grid.findIndex(x => x.mon === 'mousey' && !x.defeated); // lv1 at hp1 = death
    dispatch('CELL', { i });
    return { phase: G.phase, monDead: G.grid[i].defeated };
  });
  await page.screenshot({ path: OUT + '/v21-lose.png' });
  await clickHit(page, 'AD_REVIVE');
  await page.waitForTimeout(800);
  const l2 = await page.evaluate(() => ({ phase: G.phase, hp: G.hp, revived: G.adRevived }));
  console.log('lose/revive:', JSON.stringify({ ...l1, ...l2 }));

  // daily
  await page.evaluate(() => dispatch('GO_HOME'));
  await clickHit(page, 'START_DAILY');
  const d1 = await page.evaluate(() => ({ phase: G.phase, mode: G.mode }));
  await page.evaluate(() => {
    G.maxHp = 14; G.hp = 14;
    const i = G.grid.findIndex(x => x.mon === 'dragon');
    dispatch('CELL', { i }); dispatch('CELL', { i }); dispatch('CELL', { i });
  });
  const d2 = await page.evaluate(() => ({ phase: G.phase, streak: Meta.streak, locked: !Meta.canDaily() }));
  console.log('daily:', JSON.stringify({ ...d1, ...d2 }));

  // resume
  await page.evaluate(() => dispatch('GO_HOME'));
  await clickHit(page, 'START_RUN');
  await page.evaluate(() => { const i = G.grid.findIndex(x => !x.rev && !x.mon && !x.item); dispatch('CELL', { i }); });
  const r1 = await page.evaluate(() => ({ rev: G.revealCount, hp: G.hp }));
  await page.reload();
  await page.waitForTimeout(900);
  const r2 = await page.evaluate(() => ({ phase: G.phase, rev: G.revealCount, hp: G.hp }));
  console.log('resume:', JSON.stringify({ r1, r2 }));

  // ── marks: long-press a hidden tile → picker → set '3' → survives reload ──
  const mk1 = await page.evaluate(() => {
    const i = G.grid.findIndex(x => !x.rev && !x.mon && !x.item);
    const h = hitAreas.find(a => a.action === 'CELL' && a.data.i === i);
    return { i, x: h.x + h.w / 2, y: h.y + h.h / 2 };
  });
  await page.mouse.move(mk1.x, mk1.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const mk2 = await page.evaluate(() => G.markMenu);
  console.log('markMenu after longpress:', mk2, 'hits:', await page.evaluate(() => hitAreas.filter(a => a.action === 'SET_MARK').length));
  await page.evaluate(() => { const h = hitAreas.find(a => a.action === 'SET_MARK' && a.data.m === '3'); if (h) dispatch('SET_MARK', h.data); });
  const mk3 = await page.evaluate(i => G.grid[i].mark, mk1.i);
  await page.reload();
  await page.waitForTimeout(900);
  const mk4 = await page.evaluate(i => G.phase === 'PLAYING' ? G.grid[i].mark : 'no-resume', mk1.i);
  console.log('marks:', JSON.stringify({ menuAt: mk2, target: mk1.i, set: mk3, afterReload: mk4 }));

  // codex + zh
  await page.evaluate(() => dispatch('GO_HOME'));
  await clickHit(page, 'OPEN_CODEX');
  const cx = await page.evaluate(() => ({ overlay: G.overlay, seen: Meta.seen.size }));
  await page.screenshot({ path: OUT + '/v21-codex.png' });
  await page.evaluate(() => dispatch('CLOSE_OVERLAY'));
  await page.click('#lang-btn'); await page.waitForTimeout(200);
  await page.click('.lang-item[data-lang="zh-CN"]'); await page.waitForTimeout(500);
  const z = await page.evaluate(() => I18N.t('home.title'));
  await page.screenshot({ path: OUT + '/v21-home-zh.png' });

  await browser.close(); server.close();
  const conds = {
    boot: s1.phase === 'HOME',
    board: s2.phase === 'PLAYING' && s2.w === 10 && s2.h === 13 && s2.tut === 1 && s2.dragonRev && s2.orbRev,
    tut: t2 === 2 && t3 === 3 && t4 === 4 && t5.tut === null && t5.flag === '1',
    corpse: c1.gained > 0,
    levelup: c2.can && c3.level === c2.level + 1 && c3.full,
    win: w1.defeated && w1.hp === 1 && w2 === 'crown' && w3.phase === 'WIN' && w3.wins >= 1 && w3.stored === String(w3.wins),
    exactDeath: l1.phase === 'LOSE' && !l1.monDead,
    revive: l2.phase === 'PLAYING' && l2.revived,
    daily: d1.mode === 'daily' && d2.phase === 'WIN' && d2.streak === 1 && d2.locked,
    resume: r2.phase === 'PLAYING' && r2.rev === r1.rev && r2.hp === r1.hp,
    codex: cx.overlay === 'codex' && cx.seen > 0,
    marks: mk2 === mk1.i && mk3 === '3' && mk4 === '3',
    zh: z === '扫雷小地牢',
    noErrors: errors.length === 0,
  };
  const failed = Object.entries(conds).filter(([, v]) => !v).map(([k]) => k);
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  console.log(failed.length ? 'FAIL: ' + failed.join(', ') : 'PASS');
  process.exit(failed.length ? 1 : 0);
})();
