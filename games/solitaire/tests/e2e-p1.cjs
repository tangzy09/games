// e2e-p1.cjs — Klondike 可玩性 + ⭐**纸牌瀑布**（P1 的全部验收标准）。
// 真实鼠标事件（不用 dispatch 绕过 —— blockblast 那次「假绿」的教训）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8161;
const SHOT = 'C:\\tmp\\solitaire';
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

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s, null, { timeout: 5000 });
  // 首启一屏（4.3(a) 防线）会挡住一切 —— 测试里先跳过它
  await page.evaluate(() => { if (G.phase === 'INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(80);
  await page.waitForTimeout(300);
  ok(errs.length === 0, '加载零 error' + (errs.length ? ': ' + errs[0] : ''));
  await page.screenshot({ path: path.join(SHOT, 'p1-01-deal.png') });

  // ── 布局：牌不能被横幅盖住，也不能溢出屏幕（DESIGN §7.6）──
  const lay = await page.evaluate(() => {
    const L = Layout.L, s = G.s;
    let maxBottom = 0;
    for (let ti = 0; ti < 7; ti++) {
      const col = s.tableau[ti];
      const nDown = col.cards.length - col.up;
      const off = L.fitOffsets(nDown, col.up);
      const h = nDown * off.down + Math.max(0, col.up - 1) * off.up + L.cardH;
      maxBottom = Math.max(maxBottom, L.tabY + h);
    }
    return { maxBottom, barY: L.barY, bannerY: L.bannerY, cardW: L.cardW, SW: GameGlobal.SW };
  });
  ok(lay.maxBottom <= lay.barY + 2, `最长列不越过工具条（列底 ${Math.round(lay.maxBottom)} ≤ ${lay.barY}）`);
  ok(lay.cardW >= 40, `牌够大（${lay.cardW}px；老年用户是主力人群）`);

  // ── 真实点击：翻牌堆 ──
  const stock = await page.evaluate(() => {
    const L = Layout.L;
    return { x: L.stockX + L.cardW / 2, y: L.topY + L.cardH / 2 };
  });
  const before = await page.evaluate(() => ({ stock: G.s.stock.length, waste: G.s.waste.length }));
  await page.mouse.click(stock.x, stock.y);
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({ stock: G.s.stock.length, waste: G.s.waste.length, moves: G.s.moves.length }));
  ok(after.stock === before.stock - 3 && after.waste === 3, '点 stock → 翻 3 张（draw-3）');
  ok(after.moves === 1, '记进 move list');
  await page.screenshot({ path: path.join(SHOT, 'p1-02-draw.png') });

  // ── 撤销（永远免费，且是重放实现）──
  await page.evaluate(() => dispatch('UNDO'));
  await page.waitForTimeout(80);
  const undone = await page.evaluate(() => ({ stock: G.s.stock.length, moves: G.s.moves.length, usedUndo: G.s.usedUndo }));
  ok(undone.stock === before.stock && undone.moves === 0, '撤销 → 回到翻牌前（重放实现）');
  ok(undone.usedUndo, '⭐ 撤销留痕（「零撤销胜率」靠它 —— 否则无限撤销会把统计架空）');

  // ── ⭐ 纸牌瀑布：直接把牌摆成赢局，看那段动画（P1 的全部验收标准）──
  const win = await page.evaluate(() => {
    const s = G.s;
    // 强行摆成「52 张全在 foundation」
    for (let fi = 0; fi < 4; fi++) s.foundations[fi] = Array.from({ length: 13 }, (_, r) => r * 4 + fi);
    s.tableau.forEach(c => { c.cards = []; c.up = 0; });
    s.stock = []; s.waste = [];
    s.won = RulesK.isWon(s);
    onWin();                                   // 触发瀑布
    return { won: s.won, cascading: FX.busy() };
  });
  ok(win.won, '赢局判定（52 张全进 foundation）');
  ok(win.cascading, '⭐ **纸牌瀑布启动了** —— 玩家记了三十年的就是这个画面');

  await page.waitForTimeout(700);
  const mid = await page.evaluate(() => FX.busy());
  ok(mid, '瀑布仍在跑（不是一闪而过）');
  await page.screenshot({ path: path.join(SHOT, 'p1-03-cascade.png') });   // 抓运动中的一帧
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOT, 'p1-04-cascade-trail.png') });  // 拖尾累积

  // 统计双口径
  const st = await page.evaluate(() => ({ ...G.stats, usedUndo: G.s.usedUndo }));
  ok(st.won >= 1, '胜局计入统计');
  ok(st.cleanWon === 0, '⭐ 用过撤销 ⇒ 不算「干净赢」（双口径生效）');

  // ── 中文 ──
  await page.evaluate(() => I18N.setLang('zh-CN'));
  await page.waitForTimeout(200);
  await page.evaluate(() => renderAll());
  ok(await page.evaluate(() => T('sol.undo') === '撤销'), '中文 locale 生效');

  ok(errs.length === 0, '全程零 error' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT}`);
  console.log(process.exitCode ? '\n✗ P1 E2E 有失败项' : '\n✓ P1 E2E 全绿');
})();
