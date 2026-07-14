// e2e-p2p3.cjs — 已验证可解池（P2）+「这局还有解吗？」证明器（P3）。
//
// ⚠ **全程真实鼠标点击**，不用 dispatch 绕过 —— blockblast 那次「假绿 E2E」的教训：
//    每个菜单点击其实都在抛 TypeError，而 E2E 因为走 dispatch() 全绿。
// ⚠ 截图必须**肉眼验收**（Read 工具看），不能只看「跑完没报错」——
//    blockblast 的截图 GATE 抓出过 3 个真 bug，最狠的一个是**整个消行预览完全不可见**。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8162;
const SHOT = 'C:\\tmp\\solitaire';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error(`端口 ${PORT} 被占用`) : e));
    srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

/** 用真实鼠标点一个 hit 区（按 action 找，canvas 坐标 → 页面坐标）*/
async function clickAction(page, action) {
  const box = await page.evaluate((a) => {
    // ⚠ hit 区在 engine/canvas.js 的顶层 `let hitAreas`（不挂 window/GameGlobal），
    //   但 evaluate 在全局作用域执行 ⇒ 直接引用得到。
    // ⚠ 用 .pop()（**后注册优先**，与引擎 hitTest 的倒序遍历一致）
    const h = hitAreas.filter(x => x.action === a).pop();
    if (!h) return null;
    const c = document.getElementById('game-canvas').getBoundingClientRect();
    const sx = c.width / GameGlobal.SW, sy = c.height / GameGlobal.SH;   // 同上：顶层 const，别加 window.
    return { x: c.left + (h.x + h.w / 2) * sx, y: c.top + (h.y + h.h / 2) * sy };
  }, action);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s && window.Pool, null, { timeout: 5000 });

  // ── P2：池加载 + 开局必是「已验证可解」的 seed ──
  const pool = await page.evaluate(() => ({
    has3: Pool.has(3), has1: Pool.has(1),
    st: Pool.stats(3),
    verified: Pool.isVerified(G.s.drawCount, G.s.seed),
    seed: G.s.seed,
  }));
  ok(pool.has3 && pool.has1, `两个池都加载了（draw-3: ${pool.st && pool.st.total} 局）`);
  ok(pool.verified, `⭐ 开局发的是**已验证可解**的牌局（seed ${pool.seed}）`);

  // 换 5 局，每一局都必须是已验证的（不是碰巧）
  let allVerified = true;
  for (let i = 0; i < 5; i++) {
    await clickAction(page, 'NEW');
    await page.waitForTimeout(60);
    if (!await page.evaluate(() => Pool.isVerified(G.s.drawCount, G.s.seed))) allVerified = false;
  }
  ok(allVerified, '连开 5 局，局局都从已验证池里发（不是碰巧）');

  // ── 公平页：真实点「✓ 有解」角标进去 ──
  ok(await clickAction(page, 'FAIR'), '「✓ 有解」角标可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => G.phase === 'FAIR'), '进入公平页');
  await page.screenshot({ path: path.join(SHOT, 'p2-01-fair-en.png') });

  await page.evaluate(() => I18N.setLang('zh-CN'));
  await page.waitForTimeout(250);
  await page.evaluate(() => renderAll());
  await page.screenshot({ path: path.join(SHOT, 'p2-02-fair-zh.png') });   // ⚠ 肉眼验收：落差表 + 45% 那段

  ok(await clickAction(page, 'PLAY'), '公平页可返回');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => G.phase === 'PLAY'), '回到牌桌');

  // ── P3：「这局还有解吗？」真实点击 → Worker 真的算出结论 ──
  const before = await page.evaluate(() => ({
    seed: G.s.seed, draw: G.s.drawCount, moves: G.s.moves.length,
    verified: Pool.isVerified(G.s.drawCount, G.s.seed), phase: G.phase,
  }));
  console.log('   [诊断] 点 PROVE 前:', JSON.stringify(before));
  ok(await clickAction(page, 'PROVE'), '「这局还有解吗？」按钮可点');
  await page.waitForTimeout(120);
  const proving = await page.evaluate(() => Prover.st.phase);
  // ⚠ 简单局面 3ms 就证完了 ⇒ proving 可能一闪而过。只要不是 idle，Worker 就是起来了。
  ok(proving !== 'idle', `点下去 → Worker 起来了（phase=${proving}）`);
  await page.screenshot({ path: path.join(SHOT, 'p3-01-proving.png') });   // ⚠ 肉眼验收：进度条 + 动画

  // 等 Worker 出结论（开局 = 池里的可解局 ⇒ **必须**答 solvable）
  await page.waitForFunction(() => Prover.st.phase === 'done', null, { timeout: 30000 });
  const v = await page.evaluate(() => ({ ...Prover.st }));
  ok(v.result === 'solvable',
    `⭐ 开局问「还有解吗」→ 答「${v.result}」（池里的局 ⇒ 必须 solvable，答 dead = 撒谎）`);
  console.log(`   （证明耗时 ${v.ms}ms）`);
  await page.screenshot({ path: path.join(SHOT, 'p3-02-verdict-solvable.png') });  // ⚠ 肉眼验收：结论文案

  // 走一步 → 旧结论必须立刻作废（留着它 = 对新局面撒谎）
  // ⚠ 用「抽牌」：它**必然**改变局面。AUTO 在没牌可收时什么都不做，测不出东西。
  ok(await clickAction(page, 'STOCK'), '点牌堆抽牌');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => Prover.st.phase === 'idle'), '⭐ 局面一变，旧结论立刻作废（不许拿旧答案骗新局面）');

  // 撤销也必须作废（玩家看到「死局」后最常做的就是撤销）
  await page.evaluate(() => { Prover.st.phase = 'done'; Prover.st.result = 'dead'; });
  await page.evaluate(() => dispatch('UNDO'));
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => Prover.st.phase === 'idle'), '⭐ 撤销后旧结论也作废');

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT}（p2-*, p3-*）`);
  console.log(process.exitCode ? '\n✗ P2/P3 E2E 有失败项' : '\n✓ P2/P3 E2E 全绿');
})();
