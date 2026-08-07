// ════════════════════════════════════════
// e2e-lessons.cjs —— ⭐⭐ 教程门禁：**16 课都点得动，且交付的题真的符合本课概念**。
//
// 由来（2026-08-07 试玩当场抓到，两条都是零报错）：
//   ① **16 课里 12 课永远停在「正在出题…」**，盘面一个热区都没有 —— 玩家看到的就是
//      「点了没反应」。根因在 analysis.js 的 `fireIdle()`：它把**回调之前**那张忙闲快照
//      写回 `wasBusy`，而教程的 onIdle 回调里恰恰会**再排一道题** ⇒ 新排的活被记成「不忙」
//      ⇒ 它算完时 `wasBusy` 已是 false ⇒ **onIdle 再也不响**。
//      ⚠ `progress()` 那时是 done=total（活其实全干完了），⛔ 光看进度条完全看不出来。
//   ② 第 5/12 课（`under`）要**换满 40 道题**才罢休，每道一次 Worker 往返 ⇒ 转 13 秒，
//      最后还**接受一道不符合本课概念的题**（到上限就直接收下）。
//      ⇒ 加了**零搜索预筛**（under/fork/antifork/win1/opening/endgame 的必要条件都不吃求解器）。
//
// ⇒ 本文件同时钉住这两件事，尤其是 ②**不许把判据改松** ——
//   预筛只许省掉注定不合格的 Worker 往返，**最终交付的题必须仍然满足 `C4Lessons.matches`**。
//
// ⛔ 同既有门禁：一次都不调 dispatch() 走玩法路径（进课/答题一律真实鼠标点热区）。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8350;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };
/** ⚠ 上限按**玩家的耐心**定，⛔ 不是按「反正早晚会好」——超了就是产品坏了。 */
const READY_MS = 6000;
const LIVE = (process.argv.find(a => a.startsWith('--base=')) || '').slice(7);

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

(async () => {
  const srv = LIVE ? null : await serve();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  async function pt(action, key, val) {
    return page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action !== a.action) continue;
        if (a.key !== null && h.data[a.key] !== a.val) continue;
        return { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  async function click(a, k, v) { const p = await pt(a, k, v); if (!p) throw new Error('无热区 ' + a); await clickAt(p); }

  await page.goto(LIVE ? LIVE.replace(/\/+$/, '') + '/' : 'http://127.0.0.1:' + PORT + '/games/connect4/index.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
    null, { timeout: 15000 });
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });

  console.log('\n① 进教程');
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  await click('LEARN');
  await page.waitForTimeout(300);

  console.log('\n② ⭐⭐ 16 课逐个：点得动 + 题符合本课概念');
  const slow = [];
  for (let id = 1; id <= 16; id++) {
    // 回到列表（⚠ 光把 phase 摆回去不够：G.lesson 还在就仍是详情页）
    for (let k = 0; k < 3 && await page.evaluate(() => !!G.lesson); k++) {
      const b = await pt('LEARN'); if (!b) break; await clickAt(b); await page.waitForTimeout(120);
    }
    const p = await pt('LESSON', 'id', id);
    if (!p) { ok(false, '第 ' + id + ' 课：列表上没有它的热区'); continue; }
    const t0 = Date.now();
    await clickAt(p);
    // ⭐ 判据是「盘面**真的能点了**」（有 LESSON_COL 热区），⛔ 不是「loading 变 false」——
    //   玩家感知的是前者，而两者曾经就是不一致的那一对。
    let ready = false;
    while (Date.now() - t0 < READY_MS) {
      if (await page.evaluate(() => (hitAreas || []).some(h => h.action === 'LESSON_COL'))) { ready = true; break; }
      await page.waitForTimeout(80);
    }
    const ms = Date.now() - t0;
    if (!ready) {
      const why = await page.evaluate(() => ({
        loading: !!(G.lesson && G.lesson.loading), asked: G.lesson && G.lesson.asked,
        pre: G.lesson && G.lesson.pre, prog: C4Analysis.progress(), en: C4Analysis.enabled()
      }));
      ok(false, '第 ' + id + ' 课：' + READY_MS + ' ms 后仍点不动（' + JSON.stringify(why) + '）');
      continue;
    }
    if (ms > 3000) slow.push(id + '(' + ms + 'ms)');
    // ⭐⭐ 交付的这道题**必须**满足本课概念（预筛只许省 Worker 往返，⛔ 不许改判据）
    const m = await page.evaluate(() => {
      const st = G.lesson;
      const sa = C4Analysis.get(st.moves);
      if (!sa) return { err: 'no-sa' };
      return { concept: st.concept, matches: C4Lessons.matches(st.concept, sa, st.ctx || {}),
               asked: st.asked, pre: st.pre };
    });
    ok(!m.err && m.matches === true,
       '第 ' + String(id).padStart(2) + ' 课 [' + m.concept + '] ' + ms + ' ms 可点，题符合概念'
       + '（问求解器 ' + m.asked + ' 次 / 本地预筛掉 ' + m.pre + ' 次）');
  }
  if (slow.length) console.log('  ⚠ 偏慢（>3s）：' + slow.join(', '));

  console.log('\n③ 答一题：判分与「下一题」都活着');
  const cols = await page.evaluate(() => (hitAreas || []).filter(h => h.action === 'LESSON_COL').map(h => h.data.col));
  ok(cols.length > 0, '③ 有可点的列（' + cols.length + ' 列）');
  await click('LESSON_COL', 'col', cols[0]);
  await page.waitForTimeout(400);
  const j = await page.evaluate(() => ({
    judged: !!(G.lesson && G.lesson.judged),
    picked: G.lesson && G.lesson.picked,
    hasNext: (hitAreas || []).some(h => h.action === 'LESSON_NEXT'),
    noCols: !(hitAreas || []).some(h => h.action === 'LESSON_COL')
  }));
  ok(j.judged, '③ 判了分');
  ok(j.picked === cols[0], '③ 记住了玩家点的是第 ' + (j.picked + 1) + ' 列');
  ok(j.hasNext, '③ 出了［下一题］');
  ok(j.noCols, '③ ⛔ 判过之后列不再可点（否则会连答两次）');

  console.log('\n④ 收尾');
  ok(errs.length === 0, '④ 全程零报错' + (errs.length ? '：' + errs[0] : ''));

  await browser.close(); if (srv) srv.close();
  console.log(failed ? '\n✗ ' + failed + ' 条不过' : '\n✓ 教程门禁全部通过（16 课都点得动，题都对得上概念）');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('崩了：', e); process.exit(1); });
