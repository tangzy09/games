// ════════════════════════════════════════
// e2e-p3-t3.cjs —— P3 **Task 3** 的端到端门禁：提示（DESIGN §3.2）。
//
// §3.2：「**第一按**：只说这步关不关键——『有 4 列都不输，随便走』vs『**只有 1 列不输**』。
//   教育价值最高且不剧透。**第二按**：指出走哪一列 + 一句理由。
//   理由从求解器评分结构**机械导出，不手写解说**。」
// ⛔ 红线：「**提示 / 复盘 / 悔棋 / 全部课程——永远免费，永不看广告。**」
//
// ⛔⛔ 同既有门禁：**一次都不许调 dispatch() / applyMove()**，一律 page.mouse + 热区 action。
//
// 覆盖：
//   ① 加载零报错 + 库就位
//   ② ⭐ 第一按只说「关不关键」，**⛔ 不剧透列号**（反向对照：第二按才有列号）
//   ③ ⭐⭐ 第二按指的列**必须真的是** scoreAll 的最优之一 —— 拿 node 侧独立重算对拍。
//      ⚠ 这是本门禁最硬的一条：提示指错列 = 产品的全部卖点当场破产，而它不报任何错。
//   ④ ⭐ 落一手之后提示**当场过期**（⛔ 上一手的答案不许挂在这一手上）
//   ⑤ ⛔ 让子局：提示**如实说不给**，⛔ 不编列号
//   ⑥ ⛔ 变现红线：全程广告调用 = 0，且**连按 8 次**仍然次次给答案（不限次数）
//   ⑦ 截图：三视口 × 两层 —— ⛔ 逐张肉眼验收（三按钮那一行的文案有没有被挤）
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8342;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p3');

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

// ⭐ node 侧的独立真值（③ 的对拍基准）。⚠ 装真库，否则浅局面要几十分钟。
{
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'book-classic.bin'));
  const bk = BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length));
  if (!bk) { console.error('⛔ 开局库解析失败'); process.exit(2); }
  S.setBook(bk);
}
const bestColsOf = moves => {
  const sa = S.scoreAll(B.fromMoves(moves));
  let best = -Infinity;
  for (const k of Object.keys(sa)) if (sa[k] > best) best = sa[k];
  return Object.keys(sa).filter(k => sa[k] === best).map(Number);
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  async function pt(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action !== a.action) continue;
        if (a.key !== null && h.data[a.key] !== a.val) continue;
        return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action + (key ? ' ' + key + '=' + val : ''));
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));

  async function instrument() {
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
    });
  }
  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await instrument();
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) {
      await click('CYCLE_HANDICAP');
    }
  }
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 8000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
  }
  /** 按一次提示并等它算完（⚠ pending 时要等真值回来）。 */
  async function hint() {
    await click('HINT');
    await page.waitForFunction(() => G.hint && !G.hint.pending, null, { timeout: 30000 });
    return page.evaluate(() => ({ ...G.hint, text: G.hintRect ? G.hintRect.text : '' }));
  }
  const myTurn = () => page.evaluate(() => C4State.isHumanTurn(G.g) && G.phase === 'PLAYING');

  await boot();
  console.log('\n① 前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  ok(true, '① 开局库已就位');

  console.log('\n②③ ⭐⭐ 两层提示：第一按不剧透，第二按指的列必须真的是最优');
  await goHome();
  await setHandicap(0);
  await click('PLAY_HUMAN');                 // ⚠ 双人局 ⇒ 每一手都是「我的回合」，好摆局面
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  // 走几手造一个有内容的中局
  for (const c of [3, 3, 4, 4, 2]) { if (await myTurn()) await playCol(c); }

  const h1 = await hint();
  ok(h1.level === 1, '② 第一按停在 level 1（实际 ' + h1.level + '）');
  ok(!!h1.text && h1.text.length > 0, '② 第一按真的说了一句话：「' + h1.text + '」');
  ok(!/[1-7]\s*列|[Cc]olumn\s*[1-7]/.test(h1.text) || h1.kind === 'only',
    '② ⭐ 第一按**不剧透列号**（说的是「有几列不输」而不是「走第几列」）：「' + h1.text + '」');
  const shot1 = await shot('p3-t3-hint-level1.png');

  const h2 = await hint();
  ok(h2.level === 2, '③ 第二按进 level 2（实际 ' + h2.level + '）');
  ok(h2.col >= 0 && h2.col <= 6, '③ 第二按给出了列号：第 ' + (h2.col + 1) + ' 列');
  ok(/[1-7]/.test(h2.text), '③ 第二按的文案里有列号：「' + h2.text + '」');
  {
    const moves = await page.evaluate(() => G.g.moves.slice());
    const best = bestColsOf(moves);
    ok(best.indexOf(h2.col) >= 0,
      '③ ⭐⭐ 提示指的第 ' + (h2.col + 1) + ' 列**真的是**最优之一（node 侧独立重算：['
      + best.map(c => c + 1).join(',') + ']）—— 指错列 = 产品卖点当场破产，而它不报任何错');
    ok(['only', 'makeFork', 'blockFork', 'steady'].indexOf(h2.reason) >= 0,
      '③ 理由是四条机械导出之一：' + h2.reason);
  }
  const shot2 = await shot('p3-t3-hint-level2.png');

  console.log('\n④ ⭐ 落一手之后提示当场过期');
  {
    const beforePly = await page.evaluate(() => G.hint.ply);
    const col = await page.evaluate(() => RulesClassic.moves(C4State.boardOf(G.g))[0]);
    await playCol(col);
    const after = await page.evaluate(() => G.hint);
    ok(after === null,
      '④ ⭐ 落子后 G.hint 被清空（⛔ 上一手的答案挂在这一手上 = 看起来完全合法的错答案）');
    ok(beforePly >= 0, '④ 前提：过期前确实有一条提示（ply=' + beforePly + '）');
  }

  console.log('\n⑥ ⛔ 不限次数（连按 8 次次次给答案）');
  {
    let good = 0;
    for (let i = 0; i < 8; i++) {
      if (!await myTurn()) break;
      const h = await hint();
      if (h.level >= 1 && (h.text || '').length > 0) good++;
    }
    ok(good >= 8, '⑥ ⛔ 连按 8 次全部给出答案（实际 ' + good + '）—— '
      + '§3.2：提示**永远免费、不限次数**，竞品做成 9 次限量道具正是不学的东西');
  }

  console.log('\n⑤ ⛔ 让子局：如实说不给，⛔ 不编列号');
  {
    await goHome();
    await setHandicap(2);
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    await click('HINT');
    await page.waitForTimeout(400);
    const h = await page.evaluate(() => ({ ...G.hint, text: G.hintRect ? G.hintRect.text : '' }));
    ok(!!h && (h.why || '').length > 0, '⑤ ⛔ 让子局如实给出原因：「' + (h && h.why) + '」');
    ok(!h || h.col === undefined || h.col < 0,
      '⑤ ⛔ 让子局**没有编出列号**（col=' + (h && h.col) + '）—— §2.4：绝不谎报真值');
    ok(!/[Cc]olumn\s*[1-7]|第\s*[1-7]\s*列/.test(h.text || ''),
      '⑤ ⛔ 文案里也没有列号：「' + (h && h.text) + '」');
    await setHandicap(0);
  }

  console.log('\n⑦ 三视口截图（⛔ 逐张肉眼看三按钮那一行有没有被挤）');
  const shots = [shot1, shot2];
  for (const [w, h, name, comfort] of [[360, 640, 'narrow', true], [768, 1024, 'ipad', false]]) {
    await page.setViewportSize({ width: w, height: h });
    // ⚠ 换视口之后必须等**重排完**再去点：hitAreas 是上一帧按旧尺寸注册的，
    //   立刻点会点在旧坐标上（表现是「点了没反应」然后超时，⛔ 不是产品的错）。
    await page.waitForTimeout(250);
    await page.evaluate(() => renderAll());
    await goHome();
    if (comfort) {
      // 真实鼠标开舒适模式（⛔ 不碰 C4Settings）
      if (!await page.evaluate(() => C4Settings.get('comfort'))) await click('TOGGLE_COMFORT');
    } else if (await page.evaluate(() => C4Settings.get('comfort'))) await click('TOGGLE_COMFORT');
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    for (const c of [3, 3, 4]) { if (await myTurn()) await playCol(c); }
    await hint(); await hint();
    await page.mouse.move(2, 2);
    await page.evaluate(() => { G.hoverCol = -1; renderAll(); });
    shots.push(await shot('p3-t3-' + name + '.png'));
    // ⭐ 三个按钮都要**真的在屏内且点得到**（⛔ 挤出屏幕是 canvas 最常见的静默失败）
    const rects = await page.evaluate(() => ['HINT', 'UNDO', 'HOME'].map(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) if (hitAreas[i].action === a) return hitAreas[i];
      return null;
    }));
    ok(rects.every(r => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1 && r.y + r.h <= h + 1),
      '⑦ ' + name + ' ' + w + '×' + h + (comfort ? ' 舒适' : '') + '：三个按钮都在屏内且有热区');
    // ⭐⭐ **按了提示就必须真的看得见** —— 这条是被截图抓出来补的（2026-08-06）：
    //   第一版在 360×640 + 舒适模式下把提示条整条挤没了，而上面那条「三个按钮都在屏内」
    //   **照样全绿** —— 按钮确实都在，只是玩家按了提示什么都没看到。
    const hr = await page.evaluate(() => G.hintRect);
    ok(hr && hr.h >= 24 && (hr.text || '').length > 0,
      '⑦ ⭐⭐ ' + name + '：提示条真的画出来了（h=' + (hr && hr.h) + '「' + (hr && hr.text) + '」）'
      + ' —— ⛔ 挤掉它 = 按了提示什么都没看到');
    ok(!hr || hr.y + hr.h <= h + 1, '⑦ ' + name + '：提示条在屏内');
  }

  console.log('\n⑥b ⛔ 变现红线');
  {
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑥b ⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）');
    ok(errs.length === 0, '⑥b 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  for (const s of shots) console.log('  · ' + s);
  if (failed) { console.error('\n⛔ e2e-p3-t3 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p3-t3 全绿');
})().catch(e => { console.error(e); process.exit(1); });
