// tools/shot-banner.cjs — ⭐ 底部横幅遮挡目检 + **自动断言**（2026-08-03 实机被广告压住工具条后加的）
//
// 真机的 AdMob ADAPTIVE_BANNER 不是 50 也不是 56：高度按**设备屏高**分档（>720dp ⇒ 90pt），
// 且它贴在 safe area 之上 ⇒ 底下还压着 home indicator 的 34 ⇒ **实际吃掉 ~124px**。
// 这个脚本把那 124px 模拟出来，逐页：
//   ① 截图并叠红带（目检）；
//   ② **扫描红带内有没有可点区域**（hitTest 采样）—— 有就是按钮被广告盖住，直接 FAIL。
// 用法: node games/solitaire/tools/shot-banner.cjs   → C:/tmp/solitaire/banner/*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8183, SHOT = 'C:/tmp/solitaire/banner';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav' };

// ⚠ 模拟值必须**按机型分档**，不能一律 90+34：AdMob 的自适应横幅高度看**设备屏高**
//   （≤400:32 / ≤720:50 / >720:90），而 home indicator 只有全面屏机型才有。
//   给 640 高的小屏套 124px 是伪造出来的难题（那种机器实际只吃 50）。
function reserveFor(h) { return (h <= 400 ? 32 : h <= 720 ? 50 : 90) + (h > 720 ? 34 : 0); }

const PAGES = [
  { label: 'play',  js: "G.phase='PLAY'; renderAll();" },
  { label: 'home',  js: "G.phase='HOME'; renderAll();" },
  { label: 'menu',  js: "G.phase='MENU'; renderAll();" },
  { label: 'fair',  js: "G.phase='FAIR'; renderAll();" },
  { label: 'shop',  js: "G.phase='SHOP'; renderAll();" },
  { label: 'stats', js: "G.phase='STATS'; renderAll();" },
];

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
  let fails = 0;
  for (const vp of [{ width: 393, height: 852 }, { width: 360, height: 640 }, { width: 834, height: 1112 }]) {
    const RESERVE = reserveFor(vp.height), SAFE_BOTTOM = vp.height > 720 ? 34 : 0;
    const page = await browser.newPage({ viewport: vp });
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`, { timeout: 20000 });
    await page.waitForTimeout(2500);
    // 模拟真机：底部安全区 + 一条已经加载出来的原生横幅
    await page.evaluate(({ res, sb }) => {
      GameGlobal.__forceSafeTop = 59;
      GameGlobal.safeBottom = sb;
      Ads.bannerReserve = () => res;                 // 装成「横幅在、真实高度 res」
      G.seenIntro = 1; G.noAds = false;
      if (G.phase === 'INTRO') dispatch('INTRO_GO');
    }, { res: RESERVE, sb: SAFE_BOTTOM });
    await page.waitForTimeout(600);

    for (const p of PAGES) {
      await page.evaluate(p.js);
      await page.waitForTimeout(350);
      // ── 断言：预留带里不该有任何可点区域 ──
      const hits = await page.evaluate(({ res }) => {
        const { SW, SH } = GameGlobal, bad = [];
        for (let y = SH - res + 2; y < SH; y += 6)
          for (let x = 4; x < SW; x += 12) {
            const h = hitTest(x, y);
            if (h && !bad.includes(h.action)) bad.push(h.action);
          }
        return bad;
      }, { res: RESERVE });
      const tag = `${p.label}@${vp.width}x${vp.height}`;
      if (hits.length) { fails++; console.log(`FAIL ${tag} — 广告带内仍有可点区: ${hits.join(', ')}`); }
      else console.log(`ok   ${tag}`);
      await page.evaluate(({ res }) => {           // 红带叠加（目检用，DOM 层不碰 canvas）
        document.querySelectorAll('.__band').forEach(e => e.remove());
        const d = document.createElement('div');
        d.className = '__band';
        d.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${res}px;background:rgba(255,0,0,0.32);z-index:9999;pointer-events:none;`;
        document.body.appendChild(d);
      }, { res: RESERVE });
      await page.screenshot({ path: path.join(SHOT, `${p.label}-${vp.width}.png`) });
    }
    await page.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `\n✕ ${fails} 屏被横幅压住 → ${SHOT}` : `\n✓ 全部让开了横幅 → ${SHOT}`);
  process.exit(fails ? 1 : 0);
})();
