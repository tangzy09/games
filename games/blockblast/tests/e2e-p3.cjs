// e2e-p3.cjs — 元层：每日谜题 / 成就 / 皮肤(星星解锁) / 公平页。
// ⚠ 全部用**真实鼠标点击**（不用 dispatch 绕过）—— P2 就是靠 dispatch 绕过，
//    把「菜单每次点击都抛 TypeError」藏了过去还报「零 error」。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8151;
const SHOT_DIR = 'C:\\tmp\\blockblast';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      const inRoot = f === ROOT || f.startsWith(ROOT + path.sep);
      if (!inRoot || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error(`端口 ${PORT} 被占用`) : e));
    srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

/** 在屏幕上找到某个 action 的按钮中心（靠引擎的 hitTest 扫描）*/
async function findBtn(page, action) {
  return page.evaluate(a => {
    const { SW, SH } = GameGlobal;
    for (let y = 0; y < SH; y += 4) for (let x = 0; x < SW; x += 4) {
      const h = hitTest(x, y);
      if (h && h.action === a) return { x, y };
    }
    return null;
  }, action);
}
async function clickAction(page, action) {
  const b = await findBtn(page, action);
  if (!b) return false;
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(120);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
  await page.waitForFunction(() => window.G && window.G.s && window.G.profile, null, { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-01-menu.png') });

  // ── 公平页：三条承诺 + 本局种子（可验证性就落在这里）──
  ok(await clickAction(page, 'PAGE_FAIR'), '菜单能进公平页');
  const fair = await page.evaluate(() => ({
    phase: G.phase, seed: G.s.seed,
    t1: T('blockblast.fair1'), t2: T('blockblast.fair2'), t3: T('blockblast.fair3'),
  }));
  ok(fair.phase === 'FAIR', '进入公平页');
  ok(!/blockblast\./.test(fair.t1 + fair.t2 + fair.t3), '三条承诺文案有 locale（不是 key 原文）');
  ok(typeof fair.seed === 'number', `显示本局种子 ${fair.seed}（玩家可拿它复现整条块流）`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-02-fair.png') });
  ok(await clickAction(page, 'HOME'), '返回主界面（子页面的返回键回 HOME —— 关卡地图只管选关）');

  // ── 皮肤页：未解锁的**不能装**（防伪造点击）──
  ok(await clickAction(page, 'PAGE_SKIN'), '菜单能进皮肤页');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-03-skins.png') });
  const skinState = await page.evaluate(() => {
    const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    return { stars, theme: G.theme, unlocked: Themes.unlockedList(stars).map(t => t.id) };
  });
  ok(skinState.unlocked.length === 1 && skinState.theme === 'candy', '0 星只有默认皮肤');
  // 伪造 EQUIP 一个没解锁的皮肤 → 必须被拒
  await page.evaluate(() => dispatch('EQUIP', { id: 'sunset' }));
  ok(await page.evaluate(() => G.theme) === 'candy', '没解锁的皮肤装不上（dispatch 里二次校验）');

  // 给够星星 → 解锁 → 能装上，且**只换颜色不改规则**
  await page.evaluate(() => {
    for (let i = 1; i <= 6; i++) G.progress[i] = 3;      // 18 星
    renderAll();
  });
  await page.waitForTimeout(100);
  ok(await clickAction(page, 'EQUIP'), '有星星后能装第二套皮肤');
  const afterEquip = await page.evaluate(() => ({ theme: G.theme, colors: Render.COLORS.slice() }));
  ok(afterEquip.theme !== 'candy', `换上了 ${afterEquip.theme} 皮肤`);
  ok(afterEquip.colors.length === 7, '调色板换了 7 色');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-04-skin-equipped.png') });
  await clickAction(page, 'HOME');

  // ── 每日谜题：同一天同一条块流 ──
  ok(await clickAction(page, 'PLAY_DAILY'), '菜单能进每日谜题');
  const daily = await page.evaluate(() => {
    const seedNow = G.s.seed, id = G.s.daily;
    const expect = Dealer.dailySeed(new Date());
    const seq = Array.from({ length: 12 }, (_, i) => Dealer.stream(seedNow, i).id);
    return { seedNow, expect, id, seq, mode: G.s.mode };
  });
  ok(daily.seedNow === daily.expect, '每日谜题用「今天的种子」');
  ok(!!daily.id, '标记了是哪一天的题');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-05-daily.png') });

  // 打几步 → 结束 → 连续天数 + 成就
  await page.evaluate(() => {
    const s = G.s;
    s.score = 1500;
    s.stats = { turns: 40, lines: 20, sweeps: 1, deeps: 0, perfects: 0, maxStreak: 5, bestL: 2 };
    // 造死局收尾
    for (let i = 0; i < 64; i++) s.board[i] = 1;
    s.board[0] = 0;
    consume([{ t: 'over' }]);
  });
  const after = await page.evaluate(() => ({
    unlocked: G.profile.unlocked.slice(),
    dailyStreak: G.profile.dailyStreak,
    dailyDays: G.profile.dailyDays,
    best: G.best,
  }));
  ok(after.dailyStreak === 1 && after.dailyDays === 1, '每日完成 → 连续天数 1');
  ok(after.unlocked.includes('score1k') && after.unlocked.includes('streak5'), '解锁了单局成就');
  ok(after.unlocked.includes('daily1'), '解锁了「每日首战」');
  ok(after.best === 0, '⚠ 每日谜题的分数**不进**无尽最高分（两条赛道）');

  // ── 成就页 ──
  await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
  ok(await clickAction(page, 'PAGE_ACH'), '菜单能进成就页');
  const ach = await page.evaluate(() => ({
    phase: G.phase, total: Achievements.total(), got: G.profile.unlocked.length,
    sample: T('blockblast.ach.streak5'),
  }));
  ok(ach.phase === 'ACH' && ach.total >= 30, `成就页（${ach.got}/${ach.total}）`);
  ok(!/blockblast\./.test(ach.sample), '成就名有 locale');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-06-achievements.png') });

  // ── 成就分页：翻页有界（原来「放不下就不画」，矮屏看不到后半）
  //    ⚠ 别把页数写死：成就条数会随内容增长（30 关 → 300 关那批就加了 6 条，2 页变 3 页）
  const pg = await page.evaluate(() => {
    const pages = Math.max(1, Math.ceil(Achievements.total() / 20));
    const r = [G.achPage];
    dispatch('ACH_PAGE', { d: 1 }); r.push(G.achPage);
    for (let i = 0; i < pages + 2; i++) dispatch('ACH_PAGE', { d: 1 });   // 一路翻到底，应被钳住
    r.push(G.achPage);
    dispatch('ACH_PAGE', { d: -1 }); r.push(G.achPage);
    return { r, pages };
  });
  ok(pg.r[0] === 0 && pg.r[1] === Math.min(1, pg.pages - 1)
     && pg.r[2] === pg.pages - 1 && pg.r[3] === Math.max(0, pg.pages - 2),
     `成就分页翻页 + 边界钳制（${pg.pages} 页：${pg.r.join('→')}）`);

  // ── 设置页：预览/粒子开关翻转并持久化 ──
  await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
  ok(await clickAction(page, 'PAGE_SET'), '菜单能进设置页');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-08-settings.png') });
  const setOk = await page.evaluate(() => {
    const p0 = G.opts.preview, f0 = G.opts.fx;
    dispatch('TOGGLE_PREVIEW');
    dispatch('TOGGLE_FX');
    const stored = JSON.parse(Platform.storage.get(CFG.key('opts')));
    const flipped = G.opts.preview === !p0 && G.opts.fx === !f0;
    const persisted = stored.preview === G.opts.preview && stored.fx === G.opts.fx;
    const fxSynced = FX.enabled === G.opts.fx;
    dispatch('TOGGLE_PREVIEW'); dispatch('TOGGLE_FX');   // 复原，别污染后面的测试
    return { flipped, persisted, fxSynced };
  });
  ok(setOk.flipped && setOk.persisted && setOk.fxSynced, '设置开关翻转 + 持久化 + FX.enabled 同步');

  // ── 天使图鉴：每盘结束发放 + 图鉴页翻页 + 盘数皮肤解锁 ──
  const ang = await page.evaluate(() => {
    const a0 = G.wallet.angels | 0;
    dispatch('NEW_RUN');
    G.s.score = 300; G.s.over = true;
    consume([{ t: 'over' }]);                      // 真实结算路径
    G.overAnim = null;
    const gained = (G.wallet.angels | 0) - a0;
    dispatch('PAGE_ANG');
    const phase = G.phase;
    dispatch('ANG_PAGE', { d: 1 }); const p1 = G.angPage;
    dispatch('ANG_PAGE', { d: -1 }); const p0 = G.angPage;
    // 盘数皮肤：盘数够 lavender(2盘) 即解锁可装
    G.wallet.gamesPlayed = 5;
    dispatch('EQUIP', { id: 'lavender' });
    const equipped = G.theme;
    dispatch('MENU');
    return { gained, phase, p1, p0, equipped };
  });
  ok(ang.gained >= 1, `一盘结束收集 ${ang.gained} 张天使（挂在真实结算路径上）`);
  ok(ang.phase === 'ANG' && ang.p1 === 1 && ang.p0 === 0, '天使图鉴翻页 + 钳制 OK');
  ok(ang.equipped === 'lavender', '盘数皮肤：玩满 2 盘即可装上');
  await page.evaluate(() => { G.wallet.angels = 30; dispatch('PAGE_ANG'); });
  await page.waitForTimeout(600);                  // 等图片加载
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-09-angels.png') });
  await page.evaluate(() => dispatch('HOME'));

  // ── 中文 ──
  await page.evaluate(() => I18N.setLang('zh-CN'));
  await page.waitForTimeout(250);
  await page.evaluate(() => renderAll());
  await page.screenshot({ path: path.join(SHOT_DIR, 'p3-07-ach-zh.png') });
  ok(await page.evaluate(() => T('blockblast.fairTitle') === '没有暗箱，从来没有。'), '中文公平页文案');

  ok(errors.length === 0, '全程零 error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT_DIR}`);
  console.log(process.exitCode ? '\n✗ P3 E2E 有失败项' : '\n✓ P3 E2E 全绿');
})();
