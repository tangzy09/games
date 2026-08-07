// play-probe.cjs —— 「自己玩一遍」的探针：真实鼠标点，记录**每一次点击有没有反应**。
// ⛔ 不调 dispatch()。用法：
//   node games/connect4/tools/play-probe.cjs            # 打本地工作区
//   node games/connect4/tools/play-probe.cjs --base=https://four.ai-speeds.com
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8347, OUT = 'C:/tmp/connect4/play';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };
const LIVE = (process.argv.find(a => a.startsWith('--base=')) || '').slice(7);

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      const p = decodeURIComponent(q.url.split('?')[0]);
      const f = path.join(ROOT, p);
      if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.on('error', rej); srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = LIVE ? null : await serve();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const acts = () => page.evaluate(() => (hitAreas || []).map(h => h.action));
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
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });

  await page.goto(LIVE ? LIVE.replace(/\/+$/, '') + '/' : 'http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0, null, { timeout: 15000 });
  await page.waitForFunction(() => EngineClient.bookReady(), null, { timeout: 60000 });
  console.log('开局库就位。首页热区:', (await acts()).join(', '));

  // ════ A. 教程：逐课点进去，量「点了有没有反应」════
  console.log('\n════ A. 教程（16 课逐个点） ════');
  await click('LEARN');
  await page.waitForTimeout(400);
  await shot('learn-list');

  const report = [];
  for (let n = 1; n <= 16; n++) {
    // ⚠ 回到**课程列表**：光把 phase 摆成 LEARN 不够 —— G.lesson 还在就仍是详情页。
    //   ⛔ 走真实按钮（详情页的返回键 action 就是 'LEARN' ⇒ openLearn 清掉 G.lesson）。
    for (let k = 0; k < 3 && await page.evaluate(() => !!G.lesson); k++) {
      const b = await pt('LEARN'); if (!b) break; await clickAt(b); await page.waitForTimeout(150);
    }
    await page.waitForTimeout(120);
    const p = await pt('LESSON', 'id', n);
    // ⛔ 出声，别静默跳过（本仓铁律：silent skip 会让报告看起来全绿）
    if (!p) { console.log(' 第' + String(n).padStart(2) + ' 课: ⛔ 列表上没有它的热区'); report.push({ n, err: '课程按钮没有热区' }); continue; }
    const t0 = Date.now();
    await clickAt(p);
    // 等到「有列可点」或超时 —— 这就是玩家感知的「点了有没有反应」
    let clickable = false, waited = 0;
    for (; waited < 12000; waited += 100) {
      const has = await page.evaluate(() => (hitAreas || []).some(h => h.action === 'LESSON_COL'));
      if (has) { clickable = true; break; }
      await page.waitForTimeout(100);
    }
    const st = await page.evaluate(() => ({
      phase: G.phase,
      loading: !!(G.lesson && G.lesson.loading),
      judged: !!(G.lesson && G.lesson.judged),
      acts: Array.from(new Set((hitAreas || []).map(h => h.action)))
    }));
    const row = { n, ms: Date.now() - t0, clickable, ...st };
    report.push(row);
    console.log(' 第' + String(n).padStart(2) + ' 课: ' +
      (clickable ? '可点 (等了 ' + row.ms + ' ms)' : '⛔ 点不动 (' + row.ms + ' ms 后仍无 LESSON_COL)') +
      ' phase=' + st.phase + ' loading=' + st.loading + ' 热区=[' + st.acts.join(',') + ']');
    if (!clickable) await shot('lesson-' + n + '-STUCK');
    else if (n <= 2) await shot('lesson-' + n);
    // 答一手看看判分
    if (clickable) {
      const cols = await page.evaluate(() => (hitAreas || []).filter(h => h.action === 'LESSON_COL').map(h => h.data.col));
      await click('LESSON_COL', 'col', cols[0]);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ judged: !!(G.lesson && G.lesson.judged), acts: Array.from(new Set((hitAreas || []).map(h => h.action))) }));
      if (!after.judged) console.log('        ⚠ 答了一手但 judged 仍 false，热区=[' + after.acts.join(',') + ']');
      if (n === 1) await shot('lesson-1-judged');
    }
  }
  fs.writeFileSync(path.join(OUT, 'lesson-report.json'), JSON.stringify(report, null, 1), 'utf8');

  // ════ B. 打一局人机，量「点击 → 电脑落子」的节奏 ════
  console.log('\n════ B. 人机一局（量节奏） ════');
  await page.evaluate(() => { G.phase = 'HOME'; renderAll(); });
  await page.waitForTimeout(200);
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 8000 });
  const gaps = [];
  let guard = 0;
  while (await page.evaluate(() => G.phase === 'PLAYING') && guard++ < 40) {
    const mine = await page.evaluate(() => C4State.isHumanTurn(G.g));
    if (!mine) {
      const t0 = Date.now(), before = await page.evaluate(() => G.g.moves.length);
      await page.waitForFunction(k => G.g.moves.length > k || G.phase !== 'PLAYING', before, { timeout: 15000 }).catch(() => {});
      gaps.push(Date.now() - t0);
      continue;
    }
    const col = await page.evaluate(() => {
      const ms = RulesClassic.moves(C4State.boardOf(G.g));
      return ms.length ? ms[(G.g.moves.length * 3 + 1) % ms.length] : -1;
    });
    if (col < 0) break;
    await click('COL', 'col', col);
    await page.waitForTimeout(60);
  }
  const eng = await page.evaluate(() => G.lastAiMs);
  console.log(' 电脑每手「轮到它 → 落子」耗时(ms):', gaps.join(', '));
  console.log(' 引擎真实耗时 lastAiMs =', eng, 'ms');
  console.log(' 最小间隔 =', Math.min.apply(null, gaps), 'ms（应 ≥ ~500）');
  await page.waitForTimeout(1500);
  await shot('game-over');

  console.log('\n报错:', errs.length ? errs.slice(0, 5) : '无');
  console.log('产物 →', OUT);
  await browser.close(); if (srv) srv.close();
})().catch(e => { console.error('崩了：', e); process.exit(1); });
