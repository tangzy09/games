// tools/smoke-live.cjs — ⭐ 部署后的**线上**冒烟：直接打真域名，不是本地服务。
//
// ⛔ 为什么不能只 curl 版本号：`?v=` 对了只说明 index.html 更新了，不代表页面**跑得起来**。
//   本仓真踩过：素材被 git rm 但代码路径没改 ⇒ 线上图鉴一直空白，而所有本地测试全绿
//   （本地磁盘上文件还在）。⇒ 线上必须**真开一次浏览器**，看有没有 console error、
//   关键 UI 在不在。
// 用法: node tools/smoke-live.cjs
const { chromium } = require('playwright');
const SITES = [
  ['minesweeper', 'https://mines.ai-speeds.com/'],
  ['snake',       'https://snake.ai-speeds.com/'],
  ['abyssshoot',  'https://fishshoot.ai-speeds.com/'],
  ['blockblast',  'https://blocks.ai-speeds.com/'],
  ['solitaire',   'https://cards.ai-speeds.com/'],
];

(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  for (const [name, url] of SITES) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
    page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 120)));
    try {
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const st = await page.evaluate(() => ({
        // 引擎起来了没
        hasCanvas: !!document.querySelector('canvas'),
        // ⭐ 本批新功能：字号按钮（引擎顶栏）
        hasFontBtn: !!document.getElementById('font-btn'),
        fontScale: (typeof GameGlobal !== 'undefined') ? GameGlobal.fontScale : null,
        // 画面真的画了东西（canvas 全黑/全空是最常见的「线上白屏」）
        painted: (() => {
          const c = document.querySelector('canvas');
          if (!c) return false;
          try {
            const g = c.getContext('2d');
            const d = g.getImageData(0, 0, Math.min(c.width, 60), Math.min(c.height, 60)).data;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
            return false;
          } catch (e) { return 'cors'; }
        })(),
      }));
      const bad = [];
      if (!st.hasCanvas) bad.push('没有 canvas');
      if (!st.hasFontBtn) bad.push('⚠ 顶栏没有字号按钮');
      if (st.painted === false) bad.push('canvas 是空的（白屏？）');
      if (errs.length) bad.push(`console error ×${errs.length}: ${errs[0]}`);
      if (bad.length) { fails++; console.log(`FAIL ${name.padEnd(12)} ${bad.join(' | ')}`); }
      else console.log(`ok   ${name.padEnd(12)} 字号档=${st.fontScale}`);
    } catch (e) { fails++; console.log(`FAIL ${name.padEnd(12)} ${String(e).slice(0, 100)}`); }
    await page.close();
  }
  await browser.close();
  console.log(fails ? `\n✕ ${fails} 个站点有问题` : '\n✓ 五个站点线上都正常');
  process.exit(fails ? 1 : 0);
})();
