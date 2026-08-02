// e2e-coach.cjs — 「求解器当教练」这一整套：
//   ① 难度**明面阶梯**（5 档，未解锁的点不动；每一档仍只发已验证可解的局）
//   ② 妙手标记（走出盲打 AI 打分最高的那步）
//   ③ 「我的弱点」页（证明器定位到的致命那步 → 分类统计；⛔ 措辞只陈述、不指责）
//   ④ 互动教学（solver 现场出题：解出来 → 退回「差 N 步」→ 玩家走完；教学局不计入战绩）
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8175, SHOT = 'C:/tmp/solitaire';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
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

async function hit(page, action, dm) {   // 有没有这个可点区域（不点）
  return await page.evaluate(({ a, d }) => {
    let hs = hitAreas.filter(x => x.action === a);
    if (d) hs = hs.filter(x => Object.entries(d).every(([k, v]) => x.data[k] === v));
    return hs.length > 0;
  }, { a: action, d: dm });
}

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);

  // ── ① 首启第一屏就有「一分钟学会」（教学即留存：D1 最强的钩子）──
  const introHasLesson = await page.evaluate(() => {
    G.phase = 'INTRO'; G.seenIntro = 0; renderAll();
    return hitAreas.some(h => h.action === 'INTRO_LESSON') && hitAreas.some(h => h.action === 'INTRO_GO');
  });
  ok(introHasLesson, '⭐ 首启第一屏有「一分钟学会」+「直接开局」两个入口');
  await page.screenshot({ path: path.join(SHOT, 'p17-01-intro-lesson.png') });

  await page.evaluate(() => { dispatch('INTRO_GO'); dispatch('TOG_RFX'); });
  await page.waitForTimeout(200);

  // ── ② 难度阶梯：未解锁的档点不动 ──
  await page.evaluate(() => { G.stats.won = 0; G.diffLv = 1; renderAll(); });
  const locked = await page.evaluate(() => {
    dispatch('SET_LV', { lv: 5 });                 // 0 胜 ⇒ 只解锁第 1 档
    return { lv: G.diffLv, hasHit5: hitAreas.some(h => h.action === 'SET_LV' && h.data.lv === 5) };
  });
  ok(locked.lv === 1 && !locked.hasHit5, '⭐ 未解锁的难度档：点不动、也不给可点区域（0 胜时第 5 档锁着）');

  // ── ③ 攒够胜局 ⇒ 高档解锁，且换档=换局（翻牌数跟着变）──
  const unlocked = await page.evaluate(() => {
    G.stats.won = 20; G.stats.played = 30;
    dispatch('SET'); renderAll();
    const hits = hitAreas.filter(h => h.action === 'SET_LV').map(h => h.data.lv).sort();
    dispatch('SET_LV', { lv: 5 });
    return { hits, lv: G.diffLv, draw: G.s.drawCount, mode: G.s.mode, phase: G.phase };
  });
  ok(unlocked.hits.join(',') === '2,3,4,5' && unlocked.lv === 5 && unlocked.draw === 3 && unlocked.phase === 'PLAY',
     `⭐ 20 胜后 2-5 档全解锁；切到第 5 档立刻开新局（翻 ${unlocked.draw} 张）`);

  // ── ④ ⛔ 公平红线：**最高难度档也必须是已验证可解的局** ──
  const top = await page.evaluate(() => {
    let allVerified = true, n = 0;
    for (let i = 0; i < 6; i++) {
      dispatch('SET_LV', { lv: 5 });
      if (G.s.mode === 'klondike') { n++; if (!Pool.isVerified(G.s.drawCount, G.s.seed)) allVerified = false; }
    }
    return { allVerified, n };
  });
  ok(top.allVerified && top.n >= 5, `⭐ 红线：第 5 档（最难）连发 ${top.n} 局**全部**已验证可解 —— 难的是找解，不是有没有解`);

  // ── ⑤ 妙手标记：**真实鼠标点击**走子，妙手计数必须与「这步正好是盲打 AI 打分最高的那步」严格同步 ──
  //   （用真实点击而不是 dispatch 假走子 —— 判定代码挂在 doMove 里，假走子测不到）
  //   ⚠ 用**固定 seed** 开局：牌局随机时「点到的那步是不是最优」本身是随机的，断言会间歇性红
  await page.evaluate(() => {
    G.lesson = 0; G.diffLv = 1;
    G.s = Core.newGame(1, 1, 'klondike');       // seed 1 / 翻 1 张 —— 确定性牌局
    G.brilliant = 0; G.sel = null; Prover.reset(); FX.reset(); renderAll();
  });
  await page.waitForTimeout(200);
  let taps = 0, brilliants = 0, mismatch = null;
  for (let i = 0; i < 16 && !mismatch; i++) {
    // 每一轮：先算「盲打 AI 认为最好的那步」，然后**真的用鼠标点**它的源牌（点不动就翻牌堆）
    const pre = await page.evaluate(() => {
      const s = G.s;
      const cand = RulesK.legalMoves(s).filter(x => x.t !== 'draw' && x.t !== 'recycle');
      let bm = null, bv = -Infinity;
      for (const c of cand) { const v = AIBlind.scoreMove(s, c); if (v > bv) { bv = v; bm = c; } }
      let h = null;
      if (!bm) h = hitAreas.find(x => x.action === 'STOCK');
      else if (bm.t[0] === 'w') h = hitAreas.find(x => x.action === 'WASTE');
      else h = hitAreas.filter(x => x.action === 'TAB' && x.data.ti === bm.ti)
                       .sort((p, q) => Math.abs(p.data.idx - bm.idx) - Math.abs(q.data.idx - bm.idx))[0];
      if (!h) h = hitAreas.find(x => x.action === 'STOCK');
      if (!h) return null;
      const c = document.getElementById('game-canvas').getBoundingClientRect();
      const sx = c.width / GameGlobal.SW, sy = c.height / GameGlobal.SH;
      return { x: c.left + (h.x + h.w / 2) * sx, y: c.top + (h.y + h.h / 2) * sy,
               n: s.moves.length, bril: G.brilliant,
               best: cand.length > 1 ? JSON.stringify(bm) : null };
    });
    if (!pre) break;
    await page.mouse.click(pre.x, pre.y);
    await page.waitForTimeout(190);              // > 130ms 滑牌动画，否则下一击被 FX 吞
    const post = await page.evaluate(() => ({
      n: G.s.moves.length, bril: G.brilliant,
      last: G.s.moves.length ? JSON.stringify(G.s.moves[G.s.moves.length - 1]) : null,
    }));
    if (post.n !== pre.n + 1) continue;          // 这一下只是选中/取消，没走成子
    taps++;
    const expect = (pre.best && post.last === pre.best) ? 1 : 0;
    if (post.bril - pre.bril !== expect)
      mismatch = { expect, got: post.bril - pre.bril, last: post.last, best: pre.best };
    brilliants += post.bril - pre.bril;
  }
  ok(taps >= 3 && brilliants > 0 && !mismatch,
     `⭐ 妙手判定与真实点击走子严格同步（${taps} 次真实走子，其中 ${brilliants} 次妙手）`
     + (mismatch ? ` —— 不同步：期望 ${mismatch.expect} 实得 ${mismatch.got}
   走了 ${mismatch.last}
   最优 ${mismatch.best}` : ''));

  // ⑤b 负例：**故意走一步不是最优的**，妙手计数必须不动
  //     （只测正例的话，「每步都给妙手」这种退化实现也能全绿 —— 那就等于没测）
  const neg = await page.evaluate(() => {
    G.s = Core.newGame(1, 1, 'klondike');
    G.brilliant = 0; G.sel = null; FX.reset(); renderAll();
    const s = G.s;
    const cand = RulesK.legalMoves(s).filter(x => x.t !== 'draw' && x.t !== 'recycle');
    if (cand.length < 2) return { skip: true };
    let bm = null, bv = -Infinity, wm = null, wv = Infinity;
    for (const c of cand) {
      const v = AIBlind.scoreMove(s, c);
      if (v > bv) { bv = v; bm = c; }
      if (v < wv) { wv = v; wm = c; }
    }
    if (JSON.stringify(bm) === JSON.stringify(wm)) return { skip: true };
    const before = G.brilliant;
    // ⚠ 必须走 doMove（妙手判定就写在里面）——用 Core.apply 绕过它，这条负例就等于没测
    const okMove = !!doMove(wm);
    return { skip: false, okMove, before, after: G.brilliant, worst: JSON.stringify(wm), best: JSON.stringify(bm) };
  });
  ok(neg.skip || (neg.okMove && neg.after === neg.before),
     '⛔ 负例：走一步非最优 ⇒ 妙手计数不动（防「每步都算妙手」的退化实现）');

  // ── ⑥ 「我的弱点」：证明器定位的致命那步进统计 + 页面能开 ──
  const ins = await page.evaluate(() => {
    G.insight = {};
    noteWeak('tf'); noteWeak('tf'); noteWeak('tt');
    dispatch('INSIGHT');
    return { phase: G.phase, ins: JSON.parse(JSON.stringify(G.insight)) };
  });
  ok(ins.phase === 'INSIGHT' && ins.ins.tf === 2 && ins.ins.tt === 1,
     '⭐ 弱点统计按走法类型累计（tf×2 / tt×1）且能开页');
  await page.screenshot({ path: path.join(SHOT, 'p17-02-insight.png') });

  // ⛔ 措辞死线：这一页**不许出现指责**（「你走错/你的错」之类）
  const blame = await page.evaluate(() => {
    const s = [T('sol.insightIntro'), T('sol.insightEmpty'), T('sol.insight')].join(' ').toLowerCase();
    return ['mistake', 'your fault', 'you were wrong', 'blunder', 'error'].filter(w => s.includes(w));
  });
  ok(blame.length === 0, '⛔ 措辞死线：弱点页零指责词' + (blame.length ? '（命中 ' + blame.join(',') + '）' : ''));

  // 空状态也要能画（一行数据都没有时最容易崩）
  const empty = await page.evaluate(() => { G.insight = {}; renderAll(); return true; });
  ok(empty && errs.length === 0, '空状态的弱点页正常渲染');

  // ── ⑦ 互动教学：solver 现场出题 ⇒ 局面「差 N 步就赢」 ──
  await page.evaluate(() => { G.phase = 'PLAY'; dispatch('LESSON', { id: 1 }); });
  await page.waitForTimeout(1200);
  const L1 = await page.evaluate(() => ({
    lesson: G.lesson, need: G.lessonNeed, won: G.s.won,
    moves: G.s.moves.length, mode: G.s.mode, draw: G.s.drawCount,
    bar: hitAreas.some(h => h.action === 'LESSON_QUIT'),
  }));
  ok(L1.lesson === 1 && L1.need === 2 && !L1.won && L1.moves > 0 && L1.bar,
     `⭐ 第 1 课开局：已替玩家走了 ${L1.moves} 步，剩 ${L1.need} 步（solver 证明能赢）+ 退出入口在`);
  await page.screenshot({ path: path.join(SHOT, 'p17-03-lesson1.png') });

  // ⛔ 教学局绝不能是死局：剩下的 N 步必须真的能走到赢
  const solvable = await page.evaluate(() => {
    const r = Solver.solve(Solver.clone(G.s), { maxNodes: 200000, timeoutMs: 4000 });
    return { res: r.result, len: r.moves ? r.moves.length : -1 };
  });
  ok(solvable.res === 'win' && solvable.len <= 4,
     `⛔ 红线：教学局当场可完成（solver ${solvable.len} 步内赢，绝不让新手走进死胡同）`);

  // ── ⑧ 走完这一课 ⇒ 记完成；且**不计入战绩**（教学局不是真实对局）──
  const done = await page.evaluate(() => {
    const w0 = G.stats.won, p0 = G.stats.played;
    const r = Solver.solve(Solver.clone(G.s), { maxNodes: 200000, timeoutMs: 4000 });
    // 最后一步走**真实入口** doMove（末尾判 win 事件 → onWin）；前面的步直接 apply
    r.moves.slice(0, -1).forEach(m => Core.apply(G.s, m));
    doMove(r.moves[r.moves.length - 1]);
    return { won: G.s.won, doneMap: JSON.parse(JSON.stringify(G.lessonsDone || {})),
             dWon: G.stats.won - w0, dPlayed: G.stats.played - p0 };
  });
  ok(done.won && done.doneMap['1'] === 1, '⭐ 第 1 课通关 ⇒ 记进度');
  ok(done.dWon === 0 && done.dPlayed === 0, '⛔ 教学局不计入胜局/对局数（否则胜率是假的）');
  await page.screenshot({ path: path.join(SHOT, 'p17-04-lesson-done.png') });

  // ── ⑨ 通关浮层给「下一课」，且能接着上 ──
  const nextBtn = await hit(page, 'LESSON_NEXT');
  ok(nextBtn, '⭐ 通关浮层直接给「下一课」（连着上完四课）');

  await page.evaluate(() => dispatch('LESSON_NEXT'));
  await page.waitForTimeout(1500);
  const L2 = await page.evaluate(() => ({ lesson: G.lesson, need: G.lessonNeed, won: G.s.won }));
  ok(L2.lesson === 2 && L2.need === 4 && !L2.won, `⭐ 接上第 2 课（差 ${L2.need} 步）`);

  // ── ⑩ 退出教学 ⇒ 回普通局（教学态必须清干净，否则横幅会挂在正常对局上）──
  await page.evaluate(() => dispatch('LESSON_QUIT'));
  await page.waitForTimeout(500);
  const quit = await page.evaluate(() => ({
    lesson: G.lesson, need: G.lessonNeed, moves: G.s.moves.length,
    bar: hitAreas.some(h => h.action === 'LESSON_QUIT'),
  }));
  ok(quit.lesson === 0 && quit.need === 0 && quit.moves === 0 && !quit.bar,
     '⭐ 退出教学回到普通新局，教学横幅消失');

  // ── ⑪ 菜单里的教学入口带进度 ──
  const menu = await page.evaluate(() => { dispatch('HOME'); return hitAreas.some(h => h.action === 'LESSON'); });
  ok(menu, '⭐ 主界面有教学入口（带 n/4 进度）');
  await page.screenshot({ path: path.join(SHOT, 'p17-05-menu-lessons.png') });

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 教练套件 E2E 有失败项' : '\nOK 教练套件 E2E 全绿');
})();
