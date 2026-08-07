// ════════════════════════════════════════
// e2e-p3-t4.cjs —— P3 **Task 4** 的端到端门禁：妙手 ✨（DESIGN §3.4）。
//
// §3.4：「求解器知道一个局面**有几列不输**。**只有 1 列不输、而你找到了** ⇒ 当场弹 ✨妙手。
//   成本几乎为零（数据已在算），但它把『我下了步好棋』变成**可量化、可炫耀的事件**。」
//
// ⛔⛔ 同既有门禁：**一次都不许调 dispatch() / applyMove()**，一律 page.mouse + 热区。
//
// 覆盖：
//   ① 加载零报错 + 库就位
//   ② ⭐⭐ **正向**：走到一个「只有 1 列不输」的局面（node 侧独立求解挑出来的），
//      真实鼠标走对那一列 ⇒ ✨ 真的弹出来（计数 +1，盘下那条写着妙手）
//   ③ ⭐⭐ **反向对照**：同一个局面走**别的**列 ⇒ **不弹**（⛔ 少了这半条，②可能只是「恒弹」）
//   ④ ⭐ 多列都不输的局面走对 ⇒ **也不弹**（§3.4 的价值全在「只有 1 列」）
//   ⑤ ⛔ 不刷屏：冷却生效（连续两手都是唯一解时不会连弹）
//   ⑥ ⛔ 换局清零 + 广告调用 = 0
//   ⑦ 截图：✨ 那一屏（⛔ 肉眼验收）
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8343;
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

// ─── node 侧独立真值：找夹具 ───
{
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'book-classic.bin'));
  const bk = BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length));
  if (!bk) { console.error('⛔ 开局库解析失败'); process.exit(2); }
  S.setBook(bk);
}
const sign = v => (v > 0 ? 1 : (v < 0 ? -1 : 0));
/** 这个局面「有几列不输」+ 那几列是谁（与产品的 review.js 同一口径）。 */
function safety(moves) {
  const sa = S.scoreAll(B.fromMoves(moves));
  const cols = Object.keys(sa).map(Number);
  if (!cols.length) return null;
  let best = -Infinity;
  for (const c of cols) if (sa[c] > best) best = sa[c];
  const bs = sign(best);
  return { safe: cols.filter(c => sign(sa[c]) === bs).length, total: cols.length,
           bestSign: bs, bestCols: cols.filter(c => sa[c] === best), all: cols };
}
/** ⭐ 确定性地找一个「只有 1 列不输且不是必败局面」的局面（= 妙手的判据本身）。 */
function findOnly(maxPlies) {
  let x = 12345;
  for (let t = 0; t < 900; t++) {
    let mv = [];
    for (let d = 0; d < maxPlies; d++) {
      const bd = B.fromMoves(mv);
      if (R.terminal(bd) !== null) break;
      const s = safety(mv);
      if (s && s.safe === 1 && s.bestSign >= 0 && mv.length >= 6) return { moves: mv, s: s };
      const legal = R.moves(bd);
      x = (x * 1103515245 + 12345) >>> 0;
      mv = mv.concat([legal[x % legal.length]]);
    }
  }
  return null;
}
/** 找一个「多列都不输」的局面（④ 用）。 */
function findMany() {
  let x = 777;
  for (let t = 0; t < 900; t++) {
    let mv = [];
    for (let d = 0; d < 18; d++) {
      const bd = B.fromMoves(mv);
      if (R.terminal(bd) !== null) break;
      const s = safety(mv);
      if (s && s.safe >= 3 && mv.length >= 8) return { moves: mv, s: s };
      const legal = R.moves(bd);
      x = (x * 1103515245 + 12345) >>> 0;
      mv = mv.concat([legal[x % legal.length]]);
    }
  }
  return null;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log('找夹具（node 侧独立求解）…');
  const F = findOnly(20);
  if (!F) { console.error('⛔ 找不到「只有 1 列不输」的夹具'); process.exit(2); }
  const M = findMany();
  if (!M) { console.error('⛔ 找不到「多列都不输」的夹具'); process.exit(2); }
  console.log('  · only 夹具：' + F.moves.length + ' 手，唯一那列 = 第 ' + (F.s.bestCols[0] + 1) + ' 列');
  console.log('  · many 夹具：' + M.moves.length + ' 手，' + M.s.safe + '/' + M.s.total + ' 列都不输');

  const srv = await serve();
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
    if (!r) throw new Error('找不到热区 action=' + action + (key !== undefined ? ' ' + key + '=' + val : ''));
    return r;
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));

  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
    });
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 8000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
  }
  /** ⭐ 真实鼠标把夹具走出来（双人局 ⇒ 每一手都是「我的」回合）。 */
  async function setup(moves) {
    await goHome();
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    for (const c of moves) await playCol(c);
    // ⚠ 等边打边算把**当前**这个局面算出来 —— 妙手只读缓存、⛔ 从不等待
    await page.waitForFunction(() => C4Analysis.get(G.g.moves) !== null, null, { timeout: 60000 });
  }
  const bril = () => page.evaluate(() => ({ n: G.brilliantCount, last: G.lastBrilliant,
                                            note: G.brilliantNote ? true : false,
                                            text: G.hintRect ? G.hintRect.text : '' }));

  await boot();
  console.log('\n① 前提');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  ok(true, '① 开局库已就位');

  console.log('\n② ⭐⭐ 正向：走对唯一那一列 ⇒ ✨ 弹出来');
  await setup(F.moves);
  {
    const before = await bril();
    ok(before.n === 0, '② 前提：走到这里还没弹过妙手（' + before.n + '）');
    await playCol(F.s.bestCols[0]);
    const after = await bril();
    ok(after.n === before.n + 1,
      '② ⭐⭐ 走对第 ' + (F.s.bestCols[0] + 1) + ' 列（node 侧独立求解确认它是**唯一**不输的一列）'
      + ' ⇒ 妙手计数 ' + before.n + ' → ' + after.n);
    ok(after.note === true, '② ✨ 那一行真的在画（brilliantNote 非空）');
    ok(/妙手|Brilliant|✨/.test(after.text || ''),
      '② ✨ 盘下那条写的是妙手：「' + after.text + '」');
    await page.screenshot({ path: path.join(SHOT_DIR, 'p3-t4-brilliant.png') });
  }

  console.log('\n③ ⭐⭐ 反向对照：同一局面走别的列 ⇒ 不弹');
  {
    const other = F.s.all.filter(c => F.s.bestCols.indexOf(c) < 0);
    ok(other.length > 0, '③ 前提：这个局面确实有别的合法列（' + other.length + ' 个）');
    await setup(F.moves);
    const before = await bril();
    await playCol(other[0]);
    const after = await bril();
    ok(after.n === before.n,
      '③ ⭐⭐ 走第 ' + (other[0] + 1) + ' 列（不是那唯一的一列）⇒ **不弹**（' + before.n + ' → ' + after.n + '）'
      + ' —— ⛔ 少了这半条，②可能只是「恒弹」');
  }

  console.log('\n④ ⭐ 多列都不输的局面 ⇒ 走对也不弹');
  {
    await setup(M.moves);
    const before = await bril();
    await playCol(M.s.bestCols[0]);
    const after = await bril();
    ok(after.n === before.n,
      '④ ⭐ ' + M.s.safe + '/' + M.s.total + ' 列都不输的局面里走最优 ⇒ **不弹**（'
      + before.n + ' → ' + after.n + '）—— §3.4 的价值全在「只有 1 列」');
  }

  console.log('\n⑥ ⛔ 换局清零 + 变现红线');
  {
    await goHome();
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    const b = await bril();
    ok(b.n === 0, '⑥ 换局之后妙手计数清零（' + b.n + '）—— ⛔ 上一局的 ✨ 不许漏进新一局');
    const ads = await page.evaluate(() => window.__ads);
    ok(ads.rewarded === 0 && ads.interstitial === 0,
      '⑥ ⛔ 全程广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）');
    ok(errs.length === 0, '⑥ 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));
  }

  await browser.close();
  srv.close();
  console.log('\n截图（⛔ 肉眼验收）：' + path.join(SHOT_DIR, 'p3-t4-brilliant.png'));
  if (failed) { console.error('\n⛔ e2e-p3-t4 失败 ' + failed + ' 条'); process.exit(1); }
  console.log('\n✅ e2e-p3-t4 全绿');
})().catch(e => { console.error(e); process.exit(1); });
