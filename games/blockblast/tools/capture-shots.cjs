#!/usr/bin/env node
/**
 * capture-shots.cjs — App Store 截图（iPhone 6.7" + iPad 13"，en-US + zh-Hans）。
 *
 * 抓的是**线上真站**（blocks.ai-speeds.com），画面即产品，不做任何合成/美化。
 *
 * ⚠ 第 1 张固定是「公平页」—— 这是本作对抗 App Store 4.3(a) 的关键：
 *   审核员 30 秒试玩只会看到「又一个 block puzzle」，差异化必须在截图里 5 秒内说清。
 *
 * ⚠ 用 Playwright 的 viewport + deviceScaleFactor（走 CDP 设备模拟），
 *   不用 --window-size —— 后者有 ~480px 最小窗口钳制，会把右侧裁掉（skill 实锤）。
 *
 * 用法: node games/blockblast/tools/capture-shots.cjs [--local]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LOCAL = process.argv.includes('--local');
const URL = LOCAL ? 'http://127.0.0.1:8080/games/blockblast/index.html' : 'https://blocks.ai-speeds.com/';
const OUT = 'C:\\tmp\\blockblast\\shots';

const DEVICES = [
  { id: 'iphone67', w: 430, h: 932, dsf: 3 },     // → 1290×2796
  { id: 'ipad13', w: 1024, h: 1366, dsf: 2 },     // → 2048×2732
];
const LOCALES = ['en-US', 'zh-Hans'];
const LANG = { 'en-US': 'en', 'zh-Hans': 'zh-CN' };

/** 每张截图：先把游戏摆成想要的样子，再拍 */
const SHOTS = [
  {
    id: '1-fairness',                    // ⚠ 第一张 = 差异化（对抗 4.3）
    setup: async page => page.evaluate(() => { G.phase = 'FAIR'; renderAll(); }),
  },
  {
    id: '2-gameplay',                    // 拖拽中 + 消行预览高亮（本作最重要的一个 UI）
    setup: async page => page.evaluate(() => {
      dispatch('PLAY_ENDLESS');
      const s = G.s;
      // 摆一个「差一格就消」的盘面，并把块悬在落点上方 → 整行发光
      s.board = new Array(64).fill(0);
      for (let c = 1; c < 8; c++) { s.board[Core.idx(7, c)] = 1; G.cellColor[Core.idx(7, c)] = Render.COLORS[c % 7]; }
      for (let c = 2; c < 6; c++) { s.board[Core.idx(6, c)] = 1; G.cellColor[Core.idx(6, c)] = Render.COLORS[(c + 3) % 7]; }
      s.board[Core.idx(5, 3)] = 1; G.cellColor[Core.idx(5, 3)] = Render.COLORS[2];
      s.score = 2480; s.streak = 5;
      renderAll();
      // 手动摆一个拖拽态：1×1 悬在 (7,0) 上方 → 第 7 行整条高亮
      const L = Render.L;
      const piece = Pieces.byId('i1');
      // 块**悬在半空**（不是画在落点上，否则截图里看不出正在拖），target 仍指向 (7,0)
      // ⇒ 画面同时呈现：手上的块 + 落点幽灵 + 整行高亮「松手就消」
      G.drag = { slot: 0, piece, anchorDR: 0, anchorDC: 0, grow: 1, fromSize: L.cell,
                 px: L.boardX + L.cell * 1.5, py: L.boardY + L.cell * 4.5,
                 target: { r: 7, c: 0, piece } };
      renderAll();
    }),
  },
  {
    id: '3-sweep',                       // 招牌大招
    setup: async page => page.evaluate(() => {
      dispatch('PLAY_ENDLESS');
      const s = G.s;
      s.board = new Array(64).fill(0);
      for (let i = 0; i < 6; i++) { const r = 5 + (i % 3), c = i; s.board[Core.idx(r, c)] = 1; G.cellColor[Core.idx(r, c)] = Render.COLORS[i % 7]; }
      s.score = 6120; s.streak = 7;
      renderAll();
      const L = Render.L;
      FX.toast(T('blockblast.sweep.sweep'), L.cx, L.boardY + L.boardW / 2 - 40, '#7ef2a0', 'bold 34px sans-serif', 1.4);
      FX.toast(T('blockblast.combo', { m: '4.0' }), L.cx, L.boardY + L.boardW / 2 + 30, '#ffe08a', 'bold 22px sans-serif', 1);
      for (let k = 0; k < 90; k++) {
        FX.burst(L.boardX + Math.random() * L.boardW, L.boardY + Math.random() * L.boardW,
                 Render.COLORS[k % 7], 3);
      }
      FX.update(0.12);
      renderAll();
    }),
  },
  {
    id: '4-levels',                      // 关卡：水晶目标（审核员一眼看出「不是纯克隆」）
    setup: async page => page.evaluate(() => {
      dispatch('PLAY_LEVEL', { id: 13 });
      G.s.stats.turns = 4;
      renderAll();
    }),
  },
  {
    id: '5-map',                         // 关卡地图 + 每日 + 成就/皮肤入口（内容量）
    setup: async page => page.evaluate(() => {
      for (let i = 1; i <= 9; i++) G.progress[i] = i % 3 === 0 ? 2 : 3;
      G.profile.unlocked = ['place100', 'line50', 'streak5', 'sweep1', 'lvl5', 'daily1', 'star10', 'combo3'];
      G.profile.dailyStreak = 6;
      G.wallet.coins = 240;
      G.phase = 'MENU';
      renderAll();
    }),
  },
  {
    id: '6-daily',                       // 每日谜题：全球同一道题
    setup: async page => page.evaluate(() => {
      dispatch('PLAY_DAILY');
      const s = G.s;
      for (let i = 0; i < 10; i++) { const r = 4 + (i % 4), c = (i * 3) % 8; s.board[Core.idx(r, c)] = 1; G.cellColor[Core.idx(r, c)] = Render.COLORS[i % 7]; }
      s.score = 1830; s.streak = 4;
      renderAll();
    }),
  },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const dev of DEVICES) {
    for (const locale of LOCALES) {
      for (const shot of SHOTS) {
        const ctx = await browser.newContext({
          viewport: { width: dev.w, height: dev.h },
          deviceScaleFactor: dev.dsf,
        });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        await page.goto(URL, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.G && window.G.wallet, null, { timeout: 10000 });
        await page.evaluate(l => I18N.setLang(l), LANG[locale]);
        await page.waitForTimeout(250);
        await shot.setup(page);
        await page.waitForTimeout(200);

        const file = path.join(OUT, `${dev.id}-${locale}-${shot.id}.png`);
        await page.screenshot({ path: file });
        const { width, height } = require('child_process').execSync(
          `python -c "from PIL import Image;im=Image.open(r'${file}');print(im.size[0],im.size[1])"`,
          { encoding: 'utf8' }
        ).trim().split(' ').reduce((a, v, i) => (i ? { ...a, height: +v } : { width: +v }), {});
        console.log(`${errs.length ? '✗' : '✓'} ${path.basename(file)}  ${width}×${height}` +
                    (errs.length ? '  ERR: ' + errs[0] : ''));
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(`\n截图 → ${OUT}`);
  console.log('⚠ 上传前必须逐张 Read 验图（HARD GATE）：无浮层遮挡 / 四边不裁 / 内容真实 / 语言对 / 尺寸精确');
})();
