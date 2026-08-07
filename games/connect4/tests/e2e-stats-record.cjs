// ════════════════════════════════════════
// e2e-stats-record.cjs —— ⭐⭐ 记账门禁：**每一局都要进统计**（§7.7-7.9 + §5.3）。
//
// 为什么单独立一个文件（2026-08-07 code review 抓到的那条线上 bug）：
//   `recordMeta()`（局数/胜数/零提示胜/妙手/诊断标签）当时**只能从 `recordAccuracy()` 里进去**，
//   而那个函数开头有四个 early return：限时局、让子局、边打边算不可用、精准度还没算完。
//   ⇒ **儿童档 / 限时局 / 让子局打完一整局，统计页一位都不动** ——
//     孩子在儿童档打 100 局，看到的永远是 `0 局 · 胜率 — · 1 级 · 零成就 · 弱点页空白`。
//   ⚠⚠ 而三行之下的注释白纸黑字写着「让子局/限时局仍然计入局数与胜负，只有精准度不计入」
//      —— **注释是对的、代码是错的**，光读代码的人会以为这里没问题。
//
// ⇒ 这个文件钉死的就是那句注释：**四种局都记账，只有精准度分模式**。
//    ⛔ 它必须是**端到端**的：单测够不着 `recordAccuracy → recordMeta` 这条调用链，
//      而 bug 恰恰就长在链上（两个函数各自都对）。
//
// ⛔ 同既有门禁：**一次都不许调 dispatch()**，一律 page.mouse + 热区。
//
// 覆盖（每种局各打一整局，看 games/wins 的**增量**）：
//   ① 普通双人局（对照组：本来就是好的）
//   ② ⭐ 让子局      —— 修复前 +0
//   ③ ⭐ 限时局      —— 修复前 +0
//   ④ ⭐⭐ 儿童档人机 —— 修复前 +0（孩子那条最疼）
//   ⑤ ⛔ 反向：精准度纪录**仍然只在普通局**更新（⛔ 别为了修记账把 §6.10 的豁免一起删了）
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8346;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  ✗ ' + m); failed++; } else console.log('  ✓ ' + m); };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, p);
      if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error('端口 ' + PORT + ' 被占用') : e));
    srv.listen(PORT, () => res(srv));
  });
}

// ⭐ `--base=https://four.ai-speeds.com` ⇒ 直接打**线上**（部署后的真值复查）。
//   ⚠ 不给就照常起本地静态服务器打工作区（默认、也是 npm 脚本走的那条）。
const LIVE = (process.argv.find(a => a.startsWith('--base=')) || '').slice(7);

(async () => {
  const srv = LIVE ? null : await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  async function pt(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action !== a.action) continue;
        if (a.key !== null && h.data[a.key] !== a.val) continue;
        return { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action);
    return r;
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));
  const has = async a => page.evaluate(x => hitAreas.some(h => h.action === x), a);

  async function boot() {
    const url = LIVE ? LIVE.replace(/\/+$/, '') + '/'
                     : 'http://127.0.0.1:' + PORT + '/games/connect4/index.html';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      if (await has('REVIEW_BACK')) await click('REVIEW_BACK');
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 5 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) await click('CYCLE_HANDICAP');
    return page.evaluate(() => C4Settings.get('handicap'));
  }
  async function setTimed(on) {
    await goHome();
    if (await page.evaluate(() => C4Settings.get('timed')) !== on) await click('TOGGLE_TIMED');
    return page.evaluate(() => !!C4Settings.get('timed'));
  }
  async function setKids(on) {
    await goHome();
    if (on) { if (!await page.evaluate(() => !!C4Settings.get('kids'))) await click('KIDS'); }
    else if (await page.evaluate(() => !!C4Settings.get('kids'))) await click('TIER', 'tier', 2);
    return page.evaluate(() => !!C4Settings.get('kids'));
  }
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 10000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 10000 }).catch(() => {});
  }
  /** 打完一整局（vs 人 或 vs 机），并等边打边算 + onIdle 收尾。 */
  async function playOut(startAction) {
    await click(startAction);
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 8000 });
    let guard = 0;
    while (await page.evaluate(() => G.phase === 'PLAYING') && guard++ < 44) {
      // ⚠ 人机局要等轮到人（AI 那手是自己落的）
      const mine = await page.evaluate(() =>
        G.g.mode !== 'ai' || C4State.turnOf(G.g) === C4State.humanPlayer(G.g));
      if (!mine) { await page.waitForTimeout(250); continue; }
      const col = await page.evaluate(() => {
        const ms = RulesClassic.moves(C4State.boardOf(G.g));
        return ms.length ? ms[(G.g.moves.length * 3 + 1) % ms.length] : -1;
      });
      if (col < 0) break;
      await playCol(col);
    }
    await page.waitForFunction(() => { const p = C4Analysis.progress(); return !(p.total > 0) || p.done >= p.total; },
      null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(400);   // 等 onIdle 收尾
    return page.evaluate(() => G.phase);
  }
  const counters = () => page.evaluate(() => ({
    games: C4Settings.get('games') | 0, wins: C4Settings.get('wins') | 0,
    accN: C4Settings.get('bestAccN') | 0
  }));

  await boot();
  console.log('\n① 前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  const c0 = await counters();
  ok(c0.games === 0, '① 干净档：games=0');

  // ── ② 普通双人局（对照组）
  console.log('\n② 普通双人局（对照组 —— 修复前就是好的）');
  await setKids(false); await setHandicap(0); await setTimed(false);
  const ph2 = await playOut('PLAY_HUMAN');
  const c2 = await counters();
  ok(ph2 === 'OVER', '② 打到了 OVER（phase=' + ph2 + '）');
  ok(c2.games === c0.games + 1, '② games +1（' + c0.games + ' → ' + c2.games + '）');
  ok(c2.accN > c0.accN, '② ⭐ 普通局**有**精准度纪录（accN ' + c0.accN + ' → ' + c2.accN + '）');

  // ── ③ 让子局
  console.log('\n③ ⭐ 让子局（修复前 games +0）');
  const h = await setHandicap(1);
  ok(h === 1, '③ 让子已设为 1（实际 ' + h + '）');
  const ph3 = await playOut('PLAY_HUMAN');
  const c3 = await counters();
  ok(ph3 === 'OVER', '③ 打到了 OVER（phase=' + ph3 + '）');
  ok(c3.games === c2.games + 1, '③ ⭐⭐ games +1（' + c2.games + ' → ' + c3.games + '）—— 这一条就是那个线上 bug');
  ok(c3.accN === c2.accN, '③ ⛔ 反向：让子局**不**动精准度纪录（accN 仍 ' + c3.accN + '）');

  // ── ④ 限时局
  console.log('\n④ ⭐ 限时局（修复前 games +0）');
  await setHandicap(0);
  const t = await setTimed(true);
  ok(t === true, '④ 限时已开');
  const ph4 = await playOut('PLAY_HUMAN');
  const c4 = await counters();
  ok(ph4 === 'OVER', '④ 打到了 OVER（phase=' + ph4 + '）');
  ok(c4.games === c3.games + 1, '④ ⭐⭐ games +1（' + c3.games + ' → ' + c4.games + '）');
  ok(c4.accN === c3.accN, '④ ⛔ 反向：限时局**不**动精准度纪录（§6.10，accN 仍 ' + c4.accN + '）');

  // ── ⑤ 儿童档人机（最疼的那条）
  console.log('\n⑤ ⭐⭐ 儿童档人机（修复前 games +0 —— 孩子打 100 局统计页全空）');
  await setTimed(false);
  const k = await setKids(true);
  ok(k === true, '⑤ 儿童档已开');
  const ph5 = await playOut('PLAY_AI');
  const c5 = await counters();
  ok(ph5 === 'OVER', '⑤ 打到了 OVER（phase=' + ph5 + '）');
  ok(c5.games === c4.games + 1, '⑤ ⭐⭐ games +1（' + c4.games + ' → ' + c5.games + '）');

  console.log('\n⑥ 收尾');
  ok(errs.length === 0, '⑥ 全程零报错' + (errs.length ? '：' + errs[0] : ''));

  await browser.close(); if (srv) srv.close();
  console.log(failed ? '\n✗ ' + failed + ' 条不过' : '\n✓ 记账门禁全部通过（四种局都进统计，精准度仍分模式）');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('崩了：', e); process.exit(1); });
