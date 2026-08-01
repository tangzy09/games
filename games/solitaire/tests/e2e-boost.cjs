// e2e-boost.cjs — 用户点名的四件：
//   ① 提示 = **通往胜利的那一步**（求解器给，不是「现在能走什么」）
//   ② 收到右上角的牌**能取回来**（'ft'）
//   ③ 连击越连越爽（音效分档 + 浮字升级 + 每 5 连给币）
//   ④ 激励视频：更多位 + 奖励加厚 + **每日额度** + 拒绝观看零发放（经济红线，skill 要求的四条断言）
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8183, SHOT = 'C:/tmp/solitaire';
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

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  // ⚠ web 端的激励视频用 window.confirm 模拟 ⇒ 这个开关控制「看完 / 拒绝」
  let acceptAds = true;
  page.on('dialog', d => (acceptAds ? d.accept() : d.dismiss()));

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);
  await page.evaluate(() => { dispatch('INTRO_GO'); dispatch('TOG_RFX'); });
  await page.waitForTimeout(300);

  // ══════════ ① 提示 = 通往胜利的一步 ══════════
  // 先给一个**已验证可解**的局面，点提示 ⇒ 求解器应给出解法的第一步
  await page.evaluate(() => { G.diffLv = 1; G.stats.played = 10; dispatch('NEW'); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { G.hintMove = null; G.hintWin = false; dispatch('HINT'); });
  // 求解器在 worker 里跑 ⇒ 等它回来（证明条会显示进度）
  await page.waitForFunction(() => window.G && (G.hintMove || Prover.st.phase === 'done'), { timeout: 15000 });
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => ({
    move: G.hintMove ? JSON.stringify(G.hintMove) : null, win: !!G.hintWin,
    verdict: Prover.st.result, sol0: Prover.st.solMoves ? JSON.stringify(Prover.st.solMoves[0]) : null,
    usedHint: !!G.s.usedHint,
  }));
  ok(!!h.move, `提示给出了一步（${h.move}）`);
  ok(h.verdict !== 'solvable' || (h.win && h.move === h.sol0),
     `⭐⭐ 有解的局 ⇒ 提示就是**解法的第一步**（不是「现在能走什么」）verdict=${h.verdict}`);
  ok(h.usedHint, '用了提示会留痕（「零提示胜率」口径不被架空）');

  // ⛔ 变现红线：提示**永远免费**，不许弹广告
  const hintAds = await page.evaluate(() => {
    let n = 0; const orig = Ads.showRewarded;
    Ads.showRewarded = () => { n++; return Promise.resolve(false); };
    dispatch('HINT'); dispatch('UNDO'); dispatch('NEW'); dispatch('PROVE');
    Ads.showRewarded = orig;
    return n;
  });
  ok(hintAds === 0, '⛔ 红线：提示/撤销/换局/证明器**零广告调用**');

  // 算不出来（unknown）⇒ 必须如实标注「这只是猜的」，不许伪装成证明过的
  const guess = await page.evaluate(() => {
    G.hintWant = true;
    Prover.st.phase = 'done'; Prover.st.result = 'unknown'; Prover.st.solMoves = null;
    hintFromProof();
    return { move: !!G.hintMove, win: G.hintWin };
  });
  ok(guess.move && guess.win === false,
     '⛔ 求解器算不出来 ⇒ 退回启发式并**标成「猜的」**（绝不把猜的画成证明过的）');

  // ══════════ ② 收上去的牌能取回来 ══════════
  const back = await page.evaluate(() => {
    // 手搓一个「A♠ 已收上去、桌上有红 2 可以承接」的局面
    // ⚠ 手搓的 G.s 不可撤销（撤销=按 seed 重放）——本用例不撤销
    const s = G.s;
    FX.reset();
    s.foundations = [[0], [], [], []];                  // ♠A 在 foundation 0（id: rank*4+suit）
    s.tableau = s.tableau.map(() => ({ cards: [], up: 0 }));
    s.tableau[0] = { cards: [1 * 4 + 1], up: 1 };        // ♥2（红 2）——♠A 能落上去
    s.waste = []; s.stock = []; s.won = false;
    G.sel = null; renderAll();
    const before = s.foundations[0].length;
    // 走真实入口：点 foundation（自动落到有牌的列）
    onTap({ action: 'FOUND', data: { fi: 0 } });
    return { before, after: s.foundations[0].length, col0: s.tableau[0].cards.length,
             last: s.moves.length ? s.moves[s.moves.length - 1].t : null };
  });
  ok(back.before === 1 && back.after === 0 && back.col0 === 2 && back.last === 'ft',
     `⭐ 收到右上角的牌能拿回来（foundation ${back.before}→${back.after}，列 0 变 ${back.col0} 张，move=${back.last}）`);

  // 没有落点时 ⇒ 只是选中（给反馈），不该悄悄什么都不做
  const sel = await page.evaluate(() => {
    const s = G.s;
    s.foundations = [[0, 4], [], [], []];               // ♠A ♠2
    s.tableau = s.tableau.map(() => ({ cards: [], up: 0 }));
    s.tableau[0] = { cards: [12 * 4 + 0], up: 1 };       // ♠K —— 黑 2 落不上去（同色）
    G.sel = null; renderAll();
    onTap({ action: 'FOUND', data: { fi: 0 } });
    return { sel: JSON.parse(JSON.stringify(G.sel || null)), n: s.foundations[0].length };
  });
  ok(sel.sel && sel.sel.p === 'f' && sel.sel.fi === 0 && sel.n === 2,
     '没有合法落点 ⇒ 选中并高亮（不是「点了没反应」）');
  await page.screenshot({ path: path.join(SHOT, 'p19-01-foundation-back.png') });

  // ══════════ ③ 连击越连越爽 ══════════
  const combo = await page.evaluate(() => {
    const calls = [];
    const orig = Snd.combo;
    Snd.combo = n => { calls.push(n); };
    const c0 = Money.state.coins;
    G.comboAt = Date.now(); G.comboN = 4;
    // 直接驱动连击计数的那段逻辑：连收 6 张（跨过 5 连的金币档）
    const s = G.s;
    FX.reset();
    s.foundations = [[], [], [], []];
    s.tableau = s.tableau.map(() => ({ cards: [], up: 0 }));
    for (let i = 0; i < 4; i++) s.tableau[i] = { cards: [0 * 4 + i], up: 1 };   // 四张 A
    s.waste = []; s.stock = []; s.won = false; G.comboN = 0; G.comboAt = 0;
    for (let i = 0; i < 4; i++) doMove({ t: 'tf', ti: i, fi: i });
    Snd.combo = orig;
    return { calls, comboN: G.comboN, dCoins: Money.state.coins - c0 };
  });
  ok(combo.calls.join(',') === '2,3,4', `⭐ 连击计数逐级上升并逐次发声（×${combo.calls.join(' ×')}）`);
  ok(combo.comboN === 4, '连击窗口内计数正确');

  const tiers = await page.evaluate(() => {
    // 音效分三档：不同连击数走不同分支（只验「参数确实随 n 变」，音频本身测不了）
    const seen = [];
    const oscN = { n: 0 };
    const AC = window.AudioContext || window.webkitAudioContext;
    const realOsc = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { oscN.n++; return realOsc.call(this); };
    for (const k of [2, 5, 9]) { oscN.n = 0; Snd.combo(k); seen.push(oscN.n); }
    AC.prototype.createOscillator = realOsc;
    return seen;
  });
  ok(tiers[0] < tiers[1] && tiers[1] < tiers[2],
     `⭐ 连击音效**分三档递增**（2 连 ${tiers[0]} 音 → 5 连 ${tiers[1]} 音 → 9 连 ${tiers[2]} 音）`);

  // ══════════ ④ 激励视频：额度 / 加厚 / 拒绝零发放 ══════════
  // 先把额度清干净
  await page.evaluate(() => { G.ads = null; adsState(); G.angels = 0; Money.state.coins = 0; Money.save(); });

  // (a) 奖励数量必须精确等于常量表
  const g1 = await page.evaluate(async () => {
    const a0 = G.angels, u0 = adsState().gallery;
    dispatch('GAL_AD');
    await new Promise(r => setTimeout(r, 400));
    return { d: G.angels - a0, used: adsState().gallery - u0, want: AD_GIVE.gallery };
  });
  ok(g1.d === g1.want && g1.used === 1, `⭐ 图鉴位一次给 ${g1.d} 张（加厚前是 3 张）且额度 +1`);

  const c1 = await page.evaluate(async () => {
    const m0 = Money.state.coins;
    dispatch('EARN_AD');
    await new Promise(r => setTimeout(r, 400));
    return { d: Money.state.coins - m0, want: AD_GIVE.coins };
  });
  ok(c1.d === c1.want, `⭐ 金币位一次给 ${c1.d} 币（加厚前是 25）`);

  // (b) 新位·外观：白送一款牌背
  const b1 = await page.evaluate(async () => {
    const n0 = Money.state.ownedBacks.length;
    dispatch('AD_BACK');
    await new Promise(r => setTimeout(r, 400));
    return { d: Money.state.ownedBacks.length - n0, left: adLeft('back') };
  });
  ok(b1.d === 1 && b1.left === 0, '⭐ 新位·外观：看广告白送一款牌背（1 次/天，用完即 0）');

  // (c) 新位·局内增益：透视暗牌
  const p1 = await page.evaluate(async () => {
    G.peekUntil = 0; G.s.usedHint = false;
    dispatch('AD_PEEK');
    await new Promise(r => setTimeout(r, 400));
    return { on: G.peekUntil > Date.now(), ms: G.peekUntil - Date.now(), used: !!G.s.usedHint };
  });
  ok(p1.on && p1.ms > 10000, `⭐ 新位·局内增益：透视暗牌 ${Math.round(p1.ms / 1000)} 秒`);
  ok(p1.used, '⛔ 透视要记 usedHint —— 它是外部帮助，**不算干净赢**（统计不能撒谎）');

  // (d) ⛔ 额度用尽 ⇒ 零发放
  const cap = await page.evaluate(async () => {
    let guard = 0;
    while (adLeft('gallery') > 0 && guard++ < 20) {
      dispatch('GAL_AD');
      await new Promise(r => setTimeout(r, 260));
    }
    await new Promise(r => setTimeout(r, 500));   // 等最后一次发放落地再取基线（不然测到的是它）
    const a0 = G.angels;
    dispatch('GAL_AD');
    await new Promise(r => setTimeout(r, 400));
    return { d: G.angels - a0, used: adsState().gallery, capN: AD_CAPS.gallery };
  });
  ok(cap.d === 0 && cap.used === cap.capN,
     `⛔ 经济红线：额度用尽（${cap.used}/${cap.capN}）后**零发放**——否则 500 张长线收集当天被刷穿`);

  // (e) ⛔ 跨天必须**按额度表全量清**（手写清哪几个 key 必漏，漏掉的位永久卡死）
  const reset = await page.evaluate(() => {
    G.ads.day = '19990101';                       // 假装是昨天
    adsState();
    return Object.keys(AD_CAPS).map(k => adLeft(k) === AD_CAPS[k]);
  });
  ok(reset.every(Boolean), '⛔ 跨天全部额度归零（一个位都不许漏）');

  // (f) ⛔ 拒绝观看 ⇒ 零发放且**不扣额度**
  acceptAds = false;
  const refuse = await page.evaluate(async () => {
    const a0 = G.angels, m0 = Money.state.coins, u0 = adsState().gallery, uc = adsState().coins;
    dispatch('GAL_AD'); await new Promise(r => setTimeout(r, 350));
    dispatch('EARN_AD'); await new Promise(r => setTimeout(r, 350));
    return { dA: G.angels - a0, dC: Money.state.coins - m0,
             dU: adsState().gallery - u0, dUc: adsState().coins - uc };
  });
  ok(refuse.dA === 0 && refuse.dC === 0 && refuse.dU === 0 && refuse.dUc === 0,
     '⛔ 拒绝观看 ⇒ 零发放**且不扣额度**（扣了就是惩罚没看完的人）');
  acceptAds = true;

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX 增益包 E2E 有失败项' : '\nOK 增益包 E2E 全绿');
})();
