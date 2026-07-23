// capture-shots.cjs — App Store 商店截图(en + zh-CN,iPhone 6.7" + iPad 12.9")
//
//   node games/abyssshoot/tools/capture-shots.cjs
//   产物 → C:\tmp\abyssshoot\shots\{en,zh}\{iphone,ipad}\NN-*.png
//
// ⚠ 两条来自 appstore-listing skill 的硬约束:
//  1. **走 Playwright 的 viewport + deviceScaleFactor(CDP 设备模拟)**,不要用 --window-size:
//     Chromium headless 有 ~480 CSS px 最小窗口宽度,想出 430pt 的 6.7" 图会被钳在 480,
//     画布按 430×3=1290 裁 → **右边缘约 150px 连同 UI 一起被切**。CDP 模拟无此钳制。
//  2. 生成后**必须逐张 Read 肉眼验**(无遮挡/不裁切/内容真实/语言正确/尺寸精确)。
//     「脚本打印成功」不算验收 —— 本仓因此翻过两次车。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8137;
const OUT = 'C:/tmp/abyssshoot/shots';

const DEVICES = {
  iphone: { viewport: { width: 430, height: 932 }, dsf: 3 },   // → 1290×2796
  ipad:   { viewport: { width: 1024, height: 1366 }, dsf: 2 }, // → 2048×2732
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
               '.wav': 'audio/wav' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        r.writeHead(404); r.end(); return;
      }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(PORT, () => res(srv));
  });
}

// 五个场景。每个用 page.evaluate 直接摆盘(我们有 window.G 的完全控制权)。
// 盘面刻意摆得「好看且可信」:有大鱼、有层次、不空不满。
const SCENES = [
  {
    id: '02-gameplay',
    setup: () => {
      dispatch('START', {}); G.noAnim = true;
      G.s.board = [
        [2, 16, 4, 32, 8, 64, 256],
        [8, 4, 32, 2, 16, 128],
        [4, 2, 64, 8, 16, 4, 512],
        [16, 32, 8, 4, 128],
        [2, 8, 16, 64, 4, 32, 128],
      ];
      G.s.score = 18420; G.s.maxTile = 512; G.s.shots = 47;
      G.s.ammo = 8; G.s.queue = [4, 16, 2];
      G.save.coins = 240; G.save.best.score = 18420;
      renderAll();
    },
  },
  {
    id: '03-chain',
    setup: () => {
      // ⚠ 不要试图定格在合并动画中途:easeOut 很凶(p=0.58 时缓动已走 93%),画面等于结果态;
      //   再往前定格又会出现半透明飞行残影,看着像渲染 bug。
      //   改为展示「**大团已摆好、正要引爆**」—— 盘上一片同款鱼 + 炮里正好是同款,一眼读懂。
      dispatch('START', {}); G.noAnim = true;
      // 六条 32(河豚,辨识度高)连成一大片;炮里也是 32 → 一发下去 7 连 = 32×2^6 = 2048
      G.s.board = [
        [2, 8, 4, 16, 8, 32, 32],
        [8, 4, 2, 8, 16, 32, 32],
        [4, 2, 8, 16, 4, 32, 32],
        [16, 8, 4, 2, 8, 16],
        [2, 4, 8, 16, 4, 8],
      ];
      G.s.score = 10664; G.s.maxTile = 256; G.save.coins = 189;
      G.s.ammo = 32; G.s.queue = [4, 2, 8];   // ← 炮里正是 32,补上就引爆
      G.save.best.score = 10664;
      renderAll();
    },
  },
  {
    id: '01-codex',
    setup: () => {
      dispatch('START', {}); G.noAnim = true;
      // 解锁前 11 档(留 6 档灰剪影吊胃口 —— 收集感的关键)
      G.save.codex.seen = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
      G.save.stats.fishSeenCount = { 2: 312, 4: 190, 8: 141, 16: 96, 32: 63,
        64: 41, 128: 22, 256: 11, 512: 6, 1024: 3, 2048: 1 };
      G.save.best.score = 41870; G.save.best.maxTile = 2048; G.save.coins = 350;
      dispatch('CODEX', {});
    },
  },
  {
    id: '04-tools',
    setup: () => {
      dispatch('START', {}); G.noAnim = true;
      G.s.board = [
        [4, 16, 8, 64, 32, 1024],
        [8, 2, 32, 16, 4, 128],
        [2, 8, 16, 128, 4, 64, 256],
        [16, 4, 32, 8, 2],
        [8, 16, 4, 64, 2, 32, 512],
      ];
      G.s.score = 26310; G.s.maxTile = 1024; G.s.ammo = 4;
      G.save.coins = 620; G.save.best.score = 41870; G.save.best.maxTile = 2048;
      dispatch('TOOL', { k: 'hammer' });      // 进入锤子瞄准态:鱼格高亮 + 顶部提示
    },
  },
  {
    id: '05-deep',
    setup: () => {
      dispatch('START', {}); G.noAnim = true;
      // 深海巨兽登场:鲸鲨/白鲸/虎鲸 —— 展示「越合越深」的终局
      G.s.board = [
        [64, 128, 256, 512, 2048],
        [32, 256, 128, 1024, 4096],
        [128, 64, 512, 256, 8192, 64],
        [256, 512, 128, 1024, 16384],
        [64, 128, 256, 512, 2048, 128],
      ];
      G.s.score = 184620; G.s.maxTile = 16384; G.save.coins = 1450;
      G.s.ammo = 128; G.s.queue = [256, 64, 512];
      G.save.best.score = 184620;
      renderAll();
    },
  },
];

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();

  for (const [devName, dev] of Object.entries(DEVICES)) {
    for (const lang of ['en', 'zh-CN']) {
      const tag = lang === 'en' ? 'en' : 'zh';
      const dir = path.join(OUT, tag, devName);
      fs.mkdirSync(dir, { recursive: true });

      for (const sc of SCENES) {
        // 每个场景开新 context:防状态污染(存档/图鉴会串)
        const ctx = await browser.newContext({
          viewport: dev.viewport,
          deviceScaleFactor: dev.dsf,          // ← CDP 设备模拟,无 480px 钳制
          locale: lang,
        });
        const page = await ctx.newPage();
        await page.addInitScript(l => {
          try { localStorage.clear(); localStorage.setItem('abyss_lang', l); } catch (e) {}
        }, lang);
        await page.goto(`http://localhost:${PORT}/games/abyssshoot/`);
        await page.waitForFunction(() => window.G && window.G.s, { timeout: 8000 });
        await page.evaluate(l => I18N.setLang(l), lang);
        await page.waitForTimeout(1400);        // 等 17 张鱼图全部加载完(否则回退成大数字)
        await page.evaluate(sc.setup);
        await page.waitForTimeout(350);
        const f = path.join(dir, sc.id + '.png');
        await page.screenshot({ path: f });
        console.log(`  ${tag}/${devName}/${sc.id}.png`);
        await ctx.close();
      }
    }
  }

  await browser.close();
  srv.close();

  // 尺寸自检(GATE 第 5 条:像素必须精确)
  const want = { iphone: [1290, 2796], ipad: [2048, 2732] };
  const { execSync } = require('child_process');
  let bad = 0;
  for (const tag of ['en', 'zh']) for (const d of ['iphone', 'ipad']) for (const sc of SCENES) {
    const f = path.join(OUT, tag, d, sc.id + '.png');
    const dim = execSync(`python -c "from PIL import Image;im=Image.open(r'${f}');print(im.size[0],im.size[1])"`)
      .toString().trim().split(' ').map(Number);
    const [w, h] = want[d];
    if (dim[0] !== w || dim[1] !== h) { console.log(`  ❌ ${tag}/${d}/${sc.id}: ${dim} != ${w}x${h}`); bad++; }
  }
  console.log(bad ? `\n❌ ${bad} 张尺寸不对` : `\n✅ 全部 ${SCENES.length * 4} 张尺寸精确`);
  console.log(`产物 → ${OUT}`);
  console.log('⚠ 下一步:逐张 Read 肉眼验(无遮挡/不裁切/内容真实/语言正确) —— 脚本报成功不算验收。');
})();
