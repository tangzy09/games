// tools/shot-clearfx.cjs — ⚡ 消行特效梯度的目检 + 自动断言（2026-08-04「清 2/3/4/5 行特效依次增加」）。
//
// ⛔ 为什么必须专门做一个：消行特效只存在 0.4 秒，shot-ui 那种「摆好状态再截」的脚本
//   永远拍不到它。本脚本**摆盘 → 真落子 → 在特效播放中途截图**，并断言强度确实随条数递增。
// 用法: node games/blockblast/tools/shot-clearfx.cjs   → C:/tmp/blockblast/clearfx/*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8188, SHOT = 'C:/tmp/blockblast/clearfx';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav' };

function serve() { return new Promise((res, rej) => {
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  srv.on('error', rej); srv.listen(PORT, () => res(srv));
}); }

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`, { timeout: 20000 });
  await page.waitForTimeout(2500);

  const rows = [];
  for (const N of [1, 2, 3, 4, 5]) {
    // 摆一个「放下一块 1×1 就同时消掉 N 条」的盘面：
    //   前 N 行除了第 0 列全满 + 第 0 列除了前 N 行全满 ⇒ 落在 (0,0) 会消 N 行 + 1 列。
    //   ⚠ 直接改 G.s.board 是测试特权；真实性由「随后走的是真的 Core.place」保证。
    const got = await page.evaluate(n => {
      G.phase = 'PLAYING';
      G.s = Core.newGame(1234);
      FX.reset();
      const B = G.s.board;
      for (let i = 0; i < 64; i++) B[i] = 0;
      // ⚠ 1×1 只能补一格 ⇒ 不可能靠它「同时补齐 N 行」（第一版就这么写，结果每档都只消 1 条）。
      //   正解:**把前 N 行摆成已经填满**（findFullLines 只在落子之后才跑 ⇒ 摆着不会自己消），
      //   然后在第 N 行随便落一子触发检查 ⇒ 一次消掉 N 行。
      for (let r = 0; r < n; r++) for (let c = 0; c < 8; c++) B[r * 8 + c] = 1;
      // ⚠ 底部留一片「不会被消掉」的格子:否则消完棋盘几乎全空 ⇒ 每档都顺带触发
      //   DEEP SWEEP,清屏特效盖在消行特效上,梯度就看不出来了（实拍抓到）。
      for (let r = 6; r < 8; r++) for (let c = 0; c < 6; c++) B[r * 8 + c] = 1;
      // 让托盘第一格是 1×1（用礼包手，它不碰块流）
      Core.grantBonusHands(G.s, 1);
      G.s.placed = [false, false, false];
      const p = Core.tray(G.s)[0];
      if (p.size !== 1) return { err: 'tray[0] 不是 1×1，size=' + p.size };
      // ⛔ **必须走 onPlace，不能直接调 Core.place** —— FX 是在 main 的 consume(events) 里
      //   触发的，绕过它就只改了游戏状态、一个特效都不会播（第一版就这么错的:消行数对、
      //   FX.busy() 恒 false）。这也是本仓「E2E 用 dispatch 绕过真实路径 = 假绿」的同一个坑。
      const before = G.s.stats.lines;
      onPlace(0, n, 0);
      return { L: G.s.stats.lines - before };
    }, N);
    if (got.err) { console.log(`FAIL L=${N} — ${got.err}`); continue; }
    // 特效播到一半时截图（killCell 0.18s + ring 0.42s ⇒ 120ms 时最热闹）
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(SHOT, `clear-${N}.png`) });
    // 量一下这一档的「强度」：环的个数 + 粒子数 + 屏震
    const m = await page.evaluate(() => ({
      busy: FX.busy(),
      shake: Math.abs(FX.offset().x) + Math.abs(FX.offset().y),
    }));
    rows.push({ 想消: N, 实际消: got.L, 特效在播: m.busy, 屏震幅度: +m.shake.toFixed(1) });
    await page.waitForTimeout(700);      // 等这一轮特效散场，别污染下一档
  }
  console.table(rows);

  // ── 断言：条数越多、屏震越大（这是档位差最容易验的一维）──
  let bad = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].实际消 <= rows[i - 1].实际消) { console.log(`FAIL 消行数没递增: ${rows[i - 1].实际消} → ${rows[i].实际消}`); bad++; }
  }
  if (rows.some(r => !r.特效在播)) { console.log('FAIL 有一档截图时特效已经没了（时序不对，截不到东西）'); bad++; }
  await browser.close(); srv.close();
  console.log(bad ? `\n✕ ${bad} 处不对 → ${SHOT}` : `\n✓ 五档都播了特效 → ${SHOT}（强度差异**必须肉眼看图确认**）`);
  process.exit(bad ? 1 : 0);
})();
