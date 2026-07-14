#!/usr/bin/env node
/**
 * capture-shots.cjs — App Store 截图（iPhone 6.7" 1290×2796 + iPad 13" 2048×2732）。
 *
 * ⚠ **第 1 张绝不是牌桌** —— 是公平页。
 *   skill 的血泪教训（2048 Abyss 被 4.3(a) 拒之后写下的）：
 *   「第一张放核心玩法棋盘 = 审核员第一眼就是『又一个克隆』」。
 *   第 1 张必须是**最能证明「我不是克隆」的那个系统**。对我们就是公平页。
 *
 * ⚠ 用 Playwright 的 viewport + deviceScaleFactor（CDP 设备模拟），
 *   **不要**用 --window-size：Chromium headless 有 ~480 CSS px 最小窗口宽度，
 *   想出 430 CSS px 的图时布局视口被钳在 480 → 右侧被裁掉一截。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = 'C:/tmp/solitaire/shots';
const PORT = 8175;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const DEVICES = [
  { id: 'iphone67', w: 430, h: 932, dsf: 3 },      // → 1290×2796
  { id: 'ipad13',   w: 1024, h: 1366, dsf: 2 },    // → 2048×2732（Capacitor 默认支持 iPad ⇒ 必传）
];

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.on('error', rej);
    srv.listen(PORT, () => res(srv));
  });
}

/** 每一屏怎么摆（顺序 = 展示顺序）*/
const SHOTS = [
  {
    id: '1-fairness',                                  // ⭐ 第 1 张：证明「我不是克隆」
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true;
            G.difficulty="hard"; dispatch("NEW"); dispatch("FAIR");`,
  },
  {
    id: '2-prover',                                    // 「这局还有解吗」+ 真实结论
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true; G.phase="PLAY";
            for(let t=0;t<8;t++){ G.difficulty="hard"; dispatch("NEW");
              for(let i=0;i<20;i++){ const ms=RulesK.legalMoves(G.s).filter(m=>m.t!=="recycle"&&m.t!=="ft");
                if(!ms.length)break;
                const m=ms.find(x=>x.t==="tt"&&G.s.tableau[x.ti].cards.length-x.idx===G.s.tableau[x.ti].up&&x.idx>0)
                      ||ms.find(x=>x.t==="tf")||ms.find(x=>x.t==="wt")||ms.find(x=>x.t==="draw")||ms[0];
                Core.apply(G.s,m); }
              if(Solver.solve(G.s,{maxNodes:15000}).result==="win") break; }
            FX.reset(); G.phase="PLAY"; renderAll(); dispatch("PROVE");`,
    wait: 2500,                                        // 等 worker 出结论（要真的证明出来，不是摆拍）
  },
  {
    id: '3-table',                                     // 牌桌 + 「✓ 有解」角标
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true; G.phase="PLAY";
            G.difficulty="hard"; dispatch("NEW");
            for(let i=0;i<12;i++){ const ms=RulesK.legalMoves(G.s).filter(m=>m.t!=="recycle");
              if(!ms.length)break; Core.apply(G.s,ms[0]); }
            FX.reset(); renderAll();`,
  },
  {
    id: '4-freecell',                                  // FreeCell + 微软局号
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true;
            G.s = Core.newGame(11982, 3, "freecell"); G.phase="PLAY"; FX.reset(); renderAll();`,
  },
  {
    id: '5-stats',                                     // 双口径胜率
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true;
            G.stats={played:214,won:151,cleanWon:63,streak:7,bestStreak:19}; dispatch("STATS");`,
  },
  {
    id: '6-collection',                                // 收藏
    setup: `G.seenIntro=1; Money.state.noAds=true; G.noAds=true;
            Money.state.coins=340; Money.state.ownedBacks=["classic","waves","plaid"];
            Money.state.ownedTables=["felt","midnight"]; Money.state.back="waves";
            dispatch("SHOP");`,
  },
];

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();

  for (const d of DEVICES) {
    for (const s of SHOTS) {
      const ctx = await browser.newContext({
        viewport: { width: d.w, height: d.h },
        deviceScaleFactor: d.dsf,                      // ⚠ CDP 设备模拟 —— 不受 480px 最小窗口钳制
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
      await page.waitForFunction(() => window.G && window.G.s && window.Pool && window.Pool.has(3), null, { timeout: 15000 });
      await page.evaluate(s.setup);
      await page.waitForTimeout(s.wait || 400);
      await page.evaluate(() => renderAll());
      await page.waitForTimeout(150);

      const f = path.join(OUT, `${d.id}-${s.id}.png`);
      await page.screenshot({ path: f });
      const sz = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
      console.log(`${d.id}/${s.id}  innerW=${sz[0]}  ${errs.length ? 'ERR:' + errs[0].slice(0, 60) : ''}`);
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();

  // 尺寸复查（苹果要求像素精确）
  const { execSync } = require('child_process');
  console.log('\n尺寸复查：');
  for (const f of fs.readdirSync(OUT)) {
    const b = fs.readFileSync(path.join(OUT, f));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const want = f.startsWith('iphone67') ? [1290, 2796] : [2048, 2732];
    const ok = w === want[0] && h === want[1];
    console.log(`  ${ok ? 'OK ' : 'X  '}${f}  ${w}×${h}${ok ? '' : ` (要 ${want[0]}×${want[1]})`}`);
  }
  console.log(`\n→ ${OUT}`);
  console.log('⚠ 上传前必须 Read 逐张肉眼验图（图片验收 HARD GATE）');
})();
