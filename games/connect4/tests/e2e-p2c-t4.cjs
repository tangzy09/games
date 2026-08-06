// ════════════════════════════════════════
// e2e-p2c-t4.cjs —— P2c **Task 4** 的端到端门禁：双人对局的悔棋规则（DESIGN §6.7）。
//
// §6.7：「⚠ **双人对战不许单方悔棋**（会吵架）——『对方同意才悔』。」
// §8  ：「⛔ **提示 / 复盘 / 悔棋 / 全部课程永远免费** —— 写成 E2E 断言（广告调用 = 0）。」
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b / e2e-p2c-t1/t2/t3 同一条纪律：**一次都不许调 `dispatch()` /
//   `doUndo()` / `applyMove()` / `C4Settings.set()`**，落子与按钮一律 `page.mouse`，
//   落点一律从**画出来的那份几何**算，⛔ 零绝对坐标。
//
// 覆盖（每条都配了会红的反向对照；变异实测见 commit message）：
//   ① 加载零报错 + 开局没有任何悔棋请求
//   ② ⭐⭐ **双人局单方点不动**：真实鼠标点［悔棋］⇒ **手数与盘面像素逐位不变**，
//      只多出一条确认条；再点［同意］⇒ **这时才退**（⛔ 少了「点之前不变」这半句，
//      整条门禁在「照旧立刻撤」的实现下会全绿）
//   ③ ⭐⭐ **人机局零回归**（红线）：一次点击、**零确认按钮**、盘面立刻就变了
//   ④ ⭐ 拒绝路径：［不同意］⇒ 盘面不变、**不卡在确认态**（能继续落子、还能再问再同意）
//   ⑤ ⭐ 等回答期间棋盘不收落子（真实鼠标点列 ⇒ 手数不变），拒绝之后**立刻**又能落
//   ⑥ ⭐ 问的是**该走的那一位**（= 不是刚落子的那一位），且逐手换人（反向对照）
//   ⑦ ⭐ 让子局（T1）：请求 + 同意撤到底 ⇒ **预置子还在**（读数 + 像素）
//   ⑧ ⭐ 存档不受影响：pending 期间 serialize→deserialize 往返逐位相同、SAVE_VERSION 没变、
//      `G.g` 上**没有**多出任何字段（确认态是屏幕状态，⛔ 不是对局状态）
//   ⑨ ⭐⭐ 对坐模式（T3）：**桌子两边各有一条**确认条，上面那条是下面那条的 180° 复制品
//      （像素旋转对照 + 正向反向对照）；⭐⭐ **真实鼠标点「画出来的那颗绿按钮」**（像素定位，
//      ⛔ 不读热区坐标）必须真的同意 —— 抓「只转画面不转热区」
//   ⑩ 儿童档（T2）：儿童档是**人机局** ⇒ 确认条永不出现（node 侧同时钉死 kids+human 会抛）
//   ⑪ ⛔ 变现红线：整个悔棋流程里 `Ads.showRewarded/showInterstitial` 调用 = **0**
//   ⑫ 截图：手机竖屏 + **平板竖屏（对坐开）** 的确认态各一张
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。截图落 C:\tmp\connect4-p2c\。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const St = require('../js/state.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8341;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2c');

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('  \u2717 ' + m); failed++; } else console.log('  \u2713 ' + m); };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, p);
      if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error('端口 ' + PORT + ' 被占用') : e));
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  /** 按 action 名取热区（同一个 action 有多份时可以按 y 挑，对坐模式下两条确认条就是这样）。 */
  async function pts(action) {
    return page.evaluate(a => hitAreas.filter(h => h.action === a)
      .map(h => ({ x: h.x + h.w / 2, y: h.y + h.h / 2, rx: h.x, ry: h.y, w: h.w, h: h.h })), action);
  }
  async function pt(action, pick) {
    const all = await pts(action);
    if (!all.length) throw new Error('找不到热区 action=' + action);
    if (pick === 'top') return all.reduce((a, b) => (a.y <= b.y ? a : b));
    if (pick === 'bottom') return all.reduce((a, b) => (a.y >= b.y ? a : b));
    return all[all.length - 1];
  }
  const clickAt = async p => {
    await page.mouse.move(Math.round(p.x), Math.round(p.y));
    await page.mouse.down(); await page.mouse.up();
  };
  const click = async (a, pick) => clickAt(await pt(a, pick));
  /** 点一个带 data 的热区（难度按钮）。 */
  async function clickData(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action === a.action && h.data[a.key] === a.val) return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
      }
      return null;
    }, { action, key, val });
    if (!r) throw new Error('找不到热区 ' + action + ' ' + key + '=' + val);
    await clickAt(r);
  }

  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    // ⛔ 变现红线（§8）：把两个出广告的入口换成计数器 —— 悔棋全程必须一次都不调。
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
    });
  }
  async function goHome() {
    if (await page.evaluate(() => G.phase !== 'HOME')) {
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
    }
  }
  async function settle() {
    await page.mouse.move(5, 5);
    await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
  }
  const coinDone = () => page.waitForFunction(() => C4Fx.poseCoin() === null, null, { timeout: 6000 });
  async function setVP(w, h) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(a => GameGlobal.SW === a.w && GameGlobal.SH === a.h && G.L && G.L.SW === a.w,
      { w, h }, { timeout: 5000 });
  }
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) {
      await click('CYCLE_HANDICAP');
    }
    if (await page.evaluate(() => C4Settings.get('handicap')) !== n) throw new Error('点不到让子 ' + n);
  }
  async function setF2F(on) {
    await goHome();
    if (await page.evaluate(() => C4Settings.get('faceToFace')) !== on) await click('TOGGLE_F2F');
    if (await page.evaluate(() => C4Settings.get('faceToFace')) !== on) throw new Error('点不到对坐模式 ' + on);
  }

  const snap = () => page.evaluate(() => ({
    phase: G.phase, mode: G.g && G.g.mode, moves: G.g ? G.g.moves.slice() : null,
    ask: G.undoAsk ? { to: G.undoAsk.to, by: G.undoAsk.by, ply: G.undoAsk.ply } : null,
    askRect: G.askRect, askRectF2F: G.askRectF2F, f2fRect: G.f2fRect,
    hudLeft: G.g ? hudInfo(G.g).left : null,
    // ⭐ **真的画上去的那两串**（缩过字号、截过断的那一份，render.js drawHUD 带回来的）
    hudDrawn: G.L.hud.leftDrawn, hudRight: G.L.hud.rightDrawn,
    hudTurn: G.g ? hudInfo(G.g).turn : null,
    undoLabel: G.g ? undoLabel(G.g) : null,
    n: G.g ? C4State.boardOf(G.g).n : null,
    pre: G.g ? G.g.pre.slice() : null,
    okHits: hitAreas.filter(h => h.action === 'UNDO_OK').length,
    noHits: hitAreas.filter(h => h.action === 'UNDO_NO').length,
    undoHits: hitAreas.filter(h => h.action === 'UNDO').length,
    board: { x: G.L.boardX, y: G.L.boardY, w: G.L.boardW, h: G.L.boardH },
    ads: window.__ads
  }));

  /** 在矩形里按 gw×gh 的网格采一遍灰度（⇒ 两块/两帧可以逐点比）。 */
  const grid = (rc, gw, gh) => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const out = [];
    for (let j = 0; j < a.gh; j++) for (let i = 0; i < a.gw; i++) {
      const x = Math.round((a.rc.x + (i + 0.5) * a.rc.w / a.gw) * dpr);
      const y = Math.round((a.rc.y + (j + 0.5) * a.rc.h / a.gh) * dpr);
      const d = g2.getImageData(Math.max(0, Math.min(cv.width - 1, x)),
        Math.max(0, Math.min(cv.height - 1, y)), 1, 1).data;
      out.push(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]);
    }
    return out;
  }, { rc, gw, gh });
  const mad = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

  /** 一格棋子的墨迹（判「这一格到底有没有子」，与 t1/t3 同一把尺子）。 */
  const cellInk = (c, r) => page.evaluate(a => {
    const L = G.L, p = L.center(a.c, a.r), s = L.cell * 0.62;
    const cv = document.getElementById(CFG.canvasId);
    const dpr = cv.width / GameGlobal.SW;
    const d = cv.getContext('2d').getImageData(
      Math.round((p.x - s / 2) * dpr), Math.round((p.y - s / 2) * dpr),
      Math.round(s * dpr), Math.round(s * dpr)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 60 || g > 170) n++;
    }
    return n;
  }, { c, r });

  /**
   * ⭐⭐ 在一个矩形里**用像素**找到那颗绿色的［同意］按钮的重心。
   * ⛔ 故意**不读热区坐标**：读热区的话「只转画面不转热区」这类 bug 会自洽 ——
   *   而对坐模式那条确认条整条转了 180°，正是它最容易发生的地方。
   */
  const findGreen = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const dpr = cv.width / GameGlobal.SW;
    const x0 = Math.round(a.x * dpr), y0 = Math.round(a.y * dpr);
    const w = Math.round(a.w * dpr), h = Math.round(a.h * dpr);
    const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
    let sx = 0, sy = 0, n = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      // C4Render.PAL.accent = #2f8f6a = rgb(47,143,106)
      if (Math.abs(d[k] - 47) < 26 && Math.abs(d[k + 1] - 143) < 26 && Math.abs(d[k + 2] - 106) < 26) {
        sx += i; sy += j; n++;
      }
    }
    return n ? { x: a.x + (sx / n) / dpr, y: a.y + (sy / n) / dpr, n: n } : null;
  }, rc);

  /** ⭐ 用真实鼠标点「画出来的第 c 列」（与 t3 同一条路径）。 */
  async function playCol(c) {
    const p = await page.evaluate(k => ({ x: G.L.cellX(k) + G.L.cell / 2, y: G.L.boardY + G.L.boardH * 0.5 }), c);
    const before = await page.evaluate(() => G.g.moves.length);
    await page.mouse.move(Math.round(p.x), Math.round(p.y));
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(k => G.g.moves.length > k, before, { timeout: 4000 })
      .catch(() => { throw new Error('点第 ' + (c + 1) + ' 列之后一子都没落'); });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  }
  /** 点一列但**不要求**落子（⑤ 那条「等回答期间点不动」用）。 */
  async function tapCol(c) {
    const p = await page.evaluate(k => ({ x: G.L.cellX(k) + G.L.cell / 2, y: G.L.boardY + G.L.boardH * 0.5 }), c);
    await page.mouse.move(Math.round(p.x), Math.round(p.y));
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(200);
  }
  async function startHuman() {
    await goHome();
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 6000 });
    await coinDone(); await settle();
  }

  // ═════════════════════════════════════════════════════════════════
  console.log('\n① 加载 + 开局没有任何悔棋请求');
  await boot();
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  await setF2F(false);
  await setHandicap(0);
  await startHuman();
  await playCol(3); await playCol(2); await playCol(4);
  let s = await snap();
  ok(s.ask === null && s.okHits === 0 && s.noHits === 0 && s.undoHits === 1,
    '① 开局/对局中没有悔棋请求（undoAsk=null，确认按钮 0 个，［悔棋］1 个）');
  ok(s.undoLabel === await page.evaluate(() => T('undo.request')),
    '① ⭐ 双人局那颗按钮写的是 «' + s.undoLabel + '»（⛔ 不是「撤销」：按下去不会当场撤掉，'
    + '它是**向对方提一个请求**）');

  console.log('\n② ⭐⭐ 双人局单方点不动 —— 点了［悔棋］盘面一个像素都不许动');
  const before2 = await snap();
  const boardBefore = await grid(before2.board, 42, 34);
  // ⭐ 那一手棋子**自己那一格**（整盘平均会把一格的变化摊薄到读不出来 —— 反向对照必须
  //   量在会变的那一格上，⛔ 别用整盘平均去当「变了」的判据）。
  const lastCell = await page.evaluate(() => {
    const c = G.g.moves[G.g.moves.length - 1];
    return { c: c, r: C4Render.landingRow(C4State.boardOf(G.g), c) - 1 };
  });
  const inkBefore = await cellInk(lastCell.c, lastCell.r);
  await click('UNDO');
  await settle();
  const mid2 = await snap();
  const boardMid = await grid(mid2.board, 42, 34);
  ok(JSON.stringify(mid2.moves) === JSON.stringify(before2.moves),
    '② ⭐⭐ **真实鼠标点［悔棋］之后手数逐位不变**（' + JSON.stringify(mid2.moves) + '）'
    + ' —— ⛔ 这就是「不许单方悔棋」的判据本身');
  const inkMid = await cellInk(lastCell.c, lastCell.r);
  ok(mad(boardBefore, boardMid) < 0.5 && Math.abs(inkMid - inkBefore) < 20,
    '② ⭐⭐ **像素**：棋盘那块（' + before2.board.w + '×' + before2.board.h + '）逐点几乎不变'
    + '（平均差 ' + mad(boardBefore, boardMid).toFixed(3) + '），**那一手自己那一格**也一样'
    + '（墨迹 ' + inkBefore + '→' + inkMid + '）—— ⛔ 少了这条，'
    + '「读数不变但画面已经撤了」这种事没人看得见');
  ok(mid2.ask !== null && mid2.okHits === 1 && mid2.noHits === 1 && mid2.undoHits === 0,
    '② 多出来的只有一条确认条：［同意］×' + mid2.okHits + ' ［不同意］×' + mid2.noHits
    + '，［悔棋］让位（' + mid2.undoHits + '）');
  // ⭐⭐ 那句指名道姓的问句必须**整句画得出来**（截图实锤：右边那串「第 1 局 · 谁先手」
  //   本来占掉 42% 的宽 ⇒ 414 宽的手机上问句被截成 «Player 1, allow that mov…»
  //   —— 问句被截断 = 这个问题**没有被问出口**，而画面看起来完全正常）。
  ok(mid2.hudDrawn === mid2.hudLeft && mid2.hudDrawn.indexOf('…') < 0 && mid2.hudRight === '',
    '② ⭐⭐ HUD 上那句问句**整句都在**（画出来的是 «' + mid2.hudDrawn + '»，右侧次要信息让位）'
    + ' —— ⛔ 少了这条，「问句被截成半句」只有肉眼抓得到');
  ok(before2.hudRight !== '' && before2.hudDrawn.indexOf('…') < 0,
    '② 反向对照：没有请求时右侧那串照常在（«' + before2.hudRight + '»）—— ⛔ 别顺手把它删了');
  ok(!!mid2.askRect && mid2.askRect.y >= before2.board.y + before2.board.h,
    '② ⭐ 确认条排在**棋盘之下的 tray 里**（y=' + (mid2.askRect && mid2.askRect.y)
    + ' ≥ 盘底 ' + (before2.board.y + before2.board.h) + '）—— ⛔ 不是盖在棋盘上的弹窗');
  await shot('p2c-t4-ask-phone.png');
  await click('UNDO_OK');
  await page.waitForFunction(k => G.g.moves.length === k - 1, before2.moves.length, { timeout: 4000 })
    .catch(() => {});
  await settle();
  const after2 = await snap();
  ok(after2.moves.length === before2.moves.length - 1 && after2.ask === null,
    '② ⭐⭐ 点了［同意］**才**退一手（' + JSON.stringify(before2.moves) + ' → '
    + JSON.stringify(after2.moves) + '）且确认态收掉');
  const inkAfter = await cellInk(lastCell.c, lastCell.r);
  ok(inkAfter < inkBefore - 60 && mad(boardBefore, await grid(after2.board, 42, 34)) > 0.3,
    '② 反向对照：**同意之后**那一格的棋子在像素上真的没了（墨迹 ' + inkBefore + '→' + inkAfter
    + '，整盘平均差 ' + mad(boardBefore, await grid(after2.board, 42, 34)).toFixed(2) + '）'
    + ' —— ⛔ 少了它，上面那条「几乎不变」在「这把尺子根本量不动」时也绿');

  console.log('\n③ ⭐⭐ 人机局零回归（红线）：一次点击、零确认、立刻生效');
  await goHome();
  await clickData('TIER', 'tier', 3);
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 8000 });
  await coinDone();
  await page.waitForFunction(() => C4State.isHumanTurn(G.g), null, { timeout: 8000 });
  await playCol(3);
  await page.waitForFunction(() => G.g.moves.length >= 2 && C4State.isHumanTurn(G.g), null, { timeout: 20000 });
  await settle();
  const b3 = await snap();
  ok(b3.undoLabel === await page.evaluate(() => T('game.undo')),
    '③ 人机局那颗按钮仍写「' + b3.undoLabel + '」（逐字不变）');
  await click('UNDO');                                     // ⭐ **只点这一下**
  await page.waitForFunction(k => G.g.moves.length < k, b3.moves.length, { timeout: 4000 })
    .catch(() => { throw new Error('人机局点一下［撤销］之后手数没变 —— 红线被踩了'); });
  await settle();
  const a3 = await snap();
  ok(a3.moves.length < b3.moves.length && a3.ask === null,
    '③ ⭐⭐ **红线**：人机局点**一下**［撤销］就立刻生效（' + JSON.stringify(b3.moves) + ' → '
    + JSON.stringify(a3.moves) + '），⛔ 一次确认都没有（undoAsk=' + a3.ask + '）');
  ok(a3.okHits === 0 && a3.noHits === 0 && b3.okHits === 0 && b3.noHits === 0,
    '③ ⭐ 人机局里**从来没有出现过**［同意］/［不同意］按钮（撤销是免费救济，DESIGN §8）');
  ok(a3.moves.length === 0 && await page.evaluate(() => C4State.isHumanTurn(G.g)),
    '③ 而且它仍然退回**玩家的回合**（P2a 的语义一个字没动，moves=' + a3.moves.length + '）');

  console.log('\n④⑤ ⭐ 拒绝路径 + 等回答期间的棋盘');
  await startHuman();
  await playCol(3); await playCol(3); await playCol(1);
  const b4 = await snap();
  await click('UNDO');
  await settle();
  const p4 = await snap();
  ok(p4.ask !== null, '④ 前置：请求挂上了');
  // ⑤ 等回答期间点列 ⇒ 一子都落不下去
  await tapCol(5);
  const t5 = await snap();
  ok(JSON.stringify(t5.moves) === JSON.stringify(b4.moves) && t5.ask !== null,
    '⑤ ⭐ 等回答期间**真实鼠标点第 6 列落不下去**（手数仍是 ' + JSON.stringify(t5.moves)
    + '）—— ⛔ 否则两个人会一边吵一边把局面走出去');
  await click('UNDO_NO');
  await settle();
  const a4 = await snap();
  ok(JSON.stringify(a4.moves) === JSON.stringify(b4.moves) && a4.ask === null,
    '④ ⭐ ［不同意］⇒ 盘面不变（' + JSON.stringify(a4.moves) + '）且**确认态收掉**（undoAsk=null）');
  ok(a4.okHits === 0 && a4.noHits === 0 && a4.undoHits === 1,
    '④ ⭐ 按钮也回到了［悔棋］［菜单］那一行（⛔ 卡在确认态 = 两个人只能重开一局）');
  // ⑤ 拒绝之后**立刻**能继续下棋
  await playCol(5);
  const a5 = await snap();
  ok(a5.moves.length === b4.moves.length + 1,
    '⑤ ⭐ 拒绝之后**立刻**又能落子（' + JSON.stringify(a5.moves) + '）—— ⛔ 不会卡死');
  // 再问一次、这次同意 ⇒ 拒绝过一次不会把功能弄坏
  await click('UNDO');
  await click('UNDO_OK');
  await page.waitForFunction(k => G.g.moves.length === k, a5.moves.length - 1, { timeout: 4000 }).catch(() => {});
  const a5b = await snap();
  ok(a5b.moves.length === a5.moves.length - 1 && a5b.ask === null,
    '④ ⭐ 拒绝过之后**再问再同意**照样成立（' + JSON.stringify(a5b.moves) + '）');

  console.log('\n⑥ ⭐ 问的是「该走的那一位」，且逐手换人');
  await startHuman();
  const asks = [];
  for (let i = 0; i < 2; i++) {
    await playCol(i);
    await click('UNDO');
    const q = await snap();
    const want = await page.evaluate(() => ({
      to: C4State.turnOf(G.g),
      label: T('undo.ask', { p: T(C4State.turnOf(G.g) === C4State.humanPlayer(G.g) ? 'game.p1' : 'game.p2') })
    }));
    asks.push({ ask: q.ask, hud: q.hudLeft, hudTurn: q.hudTurn, want: want });
    await click('UNDO_NO');
    await settle();
  }
  for (const a of asks) {
    ok(a.ask.to === a.want.to && a.ask.by === (a.want.to ^ 1) && a.hud === a.want.label
       && a.hudTurn === a.want.to,
      '⑥ 同意方 = 现在该走的那一位（' + a.ask.to + '），请求方 = 刚落子的那一位（' + a.ask.by
      + '）；HUD 上**指名道姓**写着 «' + a.hud + '»，左边那枚图示是同意方自己的子');
  }
  ok(asks[0].ask.to !== asks[1].ask.to && asks[0].hud !== asks[1].hud,
    '⑥ ⭐ 反向对照：两手之后问的**换了一个人**（' + asks[0].ask.to + '→' + asks[1].ask.to
    + '，文案 «' + asks[0].hud + '» → «' + asks[1].hud + '»）'
    + ' —— ⛔ 否则上面那条在「恒问玩家 1」的假实现下也全绿');

  console.log('\n⑦ ⭐ 让子局（T1）：同意撤到底，预置子还在');
  await setHandicap(2);
  await startHuman();
  const pre7 = await snap();
  ok(pre7.pre.length === 2 && pre7.n === 2, '⑦ 前置：让 2 子（pre=' + JSON.stringify(pre7.pre) + '）');
  for (const c of [0, 6, 1, 5]) await playCol(c);
  for (let i = 0; i < 8; i++) {
    if (!(await snap()).undoHits) break;
    await click('UNDO'); await click('UNDO_OK');
    await page.waitForTimeout(40);
  }
  await settle();
  const a7 = await snap();
  const ink7 = await cellInk(3, 0) + await cellInk(3, 1);
  ok(a7.moves.length === 0 && a7.n === 2 && JSON.stringify(a7.pre) === JSON.stringify(pre7.pre),
    '⑦ ⭐ 撤到底（moves=0）之后盘上**仍有 2 枚预置子**（n=' + a7.n + '）—— 撤没了 = 孩子的让子被吃了');
  ok(ink7 > 100, '⑦ ⭐ **像素上**那两枚也还在（中列最底两格墨迹 ' + ink7 + '）');
  await setHandicap(0);

  console.log('\n⑧ ⭐ 确认态是屏幕状态，⛔ 不是对局状态');
  await startHuman();
  await playCol(3); await playCol(2);
  await click('UNDO');
  const sv = await page.evaluate(() => {
    const s1 = C4State.serialize(G.g);
    const back = C4State.deserialize(s1);
    return { s1: s1, s2: back ? C4State.serialize(back) : null,
             keys: Object.keys(G.g).sort().join(','), v: C4State.SAVE_VERSION,
             sv: JSON.parse(s1).v,
             hasAsk: JSON.stringify(G.g).indexOf('undoAsk') >= 0
                     || Object.keys(G.g).some(k => /ask|consent/i.test(k)) };
  });
  ok(sv.s1 === sv.s2 && sv.s2 !== null,
    '⑧ ⭐ 请求挂着时存档**往返逐位相同**（' + sv.s1.length + ' 字节）');
  // ⚠⚠ 判据是「**这一条功能**没往 G 上加字段」，⛔ 不是「SAVE_VERSION 等于某个数」——
  //   钉死一个字面量的话，下一个 task 合法地 bump 版本（P2c T5 的限时局就 3→4）会让这条红，
  //   而下一个人的修法多半是**把数字改掉**，于是它就再也不守任何东西了
  //   （test-state.js 里那条 `SAVE_VERSION >= 3` 的注释写的就是同一个坑）。
  ok(!sv.hasAsk && sv.sv === sv.v,
    '⑧ ⭐ `G.g` 上没有任何「正在问一句话」的字段（键：' + sv.keys + '），存档里的 v='
    + sv.sv + ' 就是当前 SAVE_VERSION —— ⛔ 把确认态存进档 = 一份存档被读回来时'
    + '卡在没人回答得了的问句上');
  await click('UNDO_NO');

  console.log('\n⑨ ⭐⭐ 对坐模式：桌子两边各有一条，且**画哪儿点哪儿**');
  await setVP(768, 1024);
  await setF2F(true);
  await startHuman();
  await playCol(3); await playCol(2);
  await click('UNDO');
  await settle();
  const f9 = await snap();
  ok(!!f9.askRect && !!f9.askRectF2F && f9.okHits === 2 && f9.noHits === 2,
    '⑨ ⭐⭐ 桌子**两边各一条**确认条（底下 ' + JSON.stringify(f9.askRect) + ' / 对面 '
    + JSON.stringify(f9.askRectF2F) + '，［同意］共 ' + f9.okHits + ' 颗）'
    + ' —— ⛔ 只放底下那一条 = 离请求方最近、离同意方最远，这条规则就成了摆设');
  ok(f9.askRectF2F.y + f9.askRectF2F.h <= f9.board.y + 0.5,
    '⑨ 对面那条排在**棋盘上方**（底 ' + (f9.askRectF2F.y + f9.askRectF2F.h) + ' ≤ 盘顶 '
    + f9.board.y + '）⛔ 压不到棋盘（它用的是 T3 已经进了 cell 预算的 reserve）');
  const GW = 64, GH = 12;
  const gBot = await grid(f9.askRect, GW, GH);
  const gTop = await grid(f9.askRectF2F, GW, GH);
  const rot = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) rot.push(gTop[(GH - 1 - j) * GW + (GW - 1 - i)]);
  const dRot = mad(gBot, rot), dPlain = mad(gBot, gTop);
  ok(dRot < 12 && dRot * 2.5 < dPlain,
    '⑨ ⭐⭐ **像素**：对面那条按 180° 反着采样后与底下那条几乎逐点相同（平均差 '
    + dRot.toFixed(2) + '），而**正向**采样明显不同（' + dPlain.toFixed(2) + '）'
    + ' —— ⛔ 少了后半句，一张空白卡也能让前半句成立');
  await shot('p2c-t4-ask-f2f-tablet.png');

  // ⭐⭐ 真实鼠标点「**画出来的**那颗绿按钮」（像素定位，⛔ 不读热区坐标）
  const green = await findGreen(f9.askRectF2F);
  ok(!!green && green.n > 200,
    '⑨ 前置：在对面那条上**用像素**找到了那颗绿色［同意］（' + (green ? green.n : 0) + ' 个像素，'
    + '重心 x=' + (green ? green.x.toFixed(1) : '—') + '）');
  const okHit = await pt('UNDO_OK', 'top');
  ok(Math.abs(okHit.x - green.x) < f9.askRectF2F.w * 0.06,
    '⑨ ⭐⭐ 注册的［同意］热区中心（x=' + okHit.x.toFixed(1) + '）与**画出来的**那颗绿按钮'
    + '（x=' + green.x.toFixed(1) + '）在同一处 —— ⛔ 只转画面不转热区 = 点「同意」实际点到'
    + '「不同意」，而画面完全正常');
  const b9 = await snap();
  await clickAt(green);                                    // ⭐ 点像素找出来的那一点
  await page.waitForFunction(k => G.g.moves.length === k - 1, b9.moves.length, { timeout: 4000 })
    .catch(() => {});
  await settle();
  const a9 = await snap();
  ok(a9.moves.length === b9.moves.length - 1 && a9.ask === null,
    '⑨ ⭐⭐ **真实鼠标点对面那条上画出来的［同意］** ⇒ 真的退了一手（'
    + JSON.stringify(b9.moves) + ' → ' + JSON.stringify(a9.moves) + '）');
  // 反向对照：点对面那条上的［不同意］⇒ 拒绝（⛔ 不是两颗按钮都接到了 UNDO_OK）
  await playCol(4);
  await click('UNDO');
  await settle();
  const b9b = await snap();
  await click('UNDO_NO', 'top');
  await settle();
  const a9b = await snap();
  ok(JSON.stringify(a9b.moves) === JSON.stringify(b9b.moves) && a9b.ask === null,
    '⑨ ⭐ 反向对照：点对面那条上的［不同意］⇒ 盘面不变、确认态收掉（'
    + JSON.stringify(a9b.moves) + '）—— ⛔ 否则「两颗按钮接的是同一个 action」也全绿');
  // 对坐模式下没有请求时，那条带子仍然是 T3 的第二 HUD（⛔ 不许被 T4 顺手吃掉）
  const t3ok = await snap();
  ok(!!t3ok.f2fRect && !t3ok.askRectF2F,
    '⑨ ⭐ 没有请求时那条带子照样是 T3 的第二 HUD（' + JSON.stringify(t3ok.f2fRect) + '）'
    + ' —— ⛔ T4 只在等回答的那几秒借用它');
  await setVP(414, 896);
  await setF2F(false);

  console.log('\n⑩ 儿童档（T2）：确认条永不出现');
  await goHome();
  await click('KIDS');
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.kids === true, null, { timeout: 20000 });
  await coinDone();
  await page.waitForFunction(() => C4State.isHumanTurn(G.g), null, { timeout: 8000 });
  await playCol(3);
  await page.waitForFunction(() => G.g.moves.length >= 2 && C4State.isHumanTurn(G.g), null, { timeout: 20000 });
  await settle();
  const bK = await snap();
  await click('UNDO');
  await page.waitForFunction(k => G.g.moves.length < k, bK.moves.length, { timeout: 4000 }).catch(() => {});
  const aK = await snap();
  ok(aK.moves.length < bK.moves.length && aK.ask === null && aK.okHits === 0,
    '⑩ ⭐ 儿童档是**人机局** ⇒ 点一下就撤（' + JSON.stringify(bK.moves) + ' → '
    + JSON.stringify(aK.moves) + '），确认条一次都没出现');
  let threw = '';
  try { St.newGame({ mode: 'human', gameNo: 0, kids: true }); } catch (e) { threw = String(e.message || e); }
  ok(/儿童档/.test(threw),
    '⑩ ⭐ 而且「儿童档 + 双人局」在 state.js 里**根本构造不出来**（当场抛：'
    + threw.slice(0, 40) + '…）—— ⇒ 两条功能在结构上碰不到彼此，⛔ 不是靠 UI 挡的');
  await goHome();
  await clickData('TIER', 'tier', 3);                       // 退出儿童档，别把设置留给下一节

  console.log('\n⑪⑫ 变现红线 + 截图');
  const ads = await page.evaluate(() => window.__ads);
  ok(ads.rewarded === 0 && ads.interstitial === 0,
    '⑪ ⛔ 整个悔棋流程里广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial
    + '）—— DESIGN §8：提示/复盘/悔棋/课程**永远免费**');

  // 手机竖屏的确认态（普通）+ 平板竖屏（对坐开）的确认态，⛔ 逐张肉眼验收
  // ⭐ 截图**故意用让 2 子的双人局**：那正是 §6.7 这条规则的主场（家长 vs 孩子），
  //   顺带在图上确认「确认条 + 预置子」两件事同屏时没有互相打架。
  //   ⚠ 显式设一次，⛔ 别依赖上一节留下来的值（⑩ 的儿童档预设会顺手把它推到 2）。
  await setHandicap(2);
  await setVP(414, 896);
  await startHuman();
  await playCol(3); await playCol(2); await playCol(3);
  await click('UNDO'); await settle();
  ok(!!(await snap()).askRect, '⑫ 手机竖屏 414×896 确认态');
  await shot('p2c-t4-phone-portrait.png');
  await click('UNDO_NO');

  await setVP(768, 1024);
  await setF2F(true);
  await startHuman();
  await playCol(3); await playCol(2); await playCol(4);
  await click('UNDO'); await settle();
  const sT = await snap();
  ok(!!sT.askRect && !!sT.askRectF2F, '⑫ 平板竖屏 768×1024（对坐开）确认态：两条都在');
  await shot('p2c-t4-tablet-portrait-f2f.png');
  await click('UNDO_NO');
  await setF2F(false);

  // ⭐ 最窄的屏 + 舒适模式（§6.8 的 1.3× 字 / 1.32× 按钮）—— 确认条真正的极限工况。
  //   ⚠ 英文比中文长 ⇒ 这一格就是最坏情况，⛔ 别只在 414 上验收（P2b T7 的教训：
  //     「五个 E2E 只跑 414×896 一台」，10 个组合里 5 个的按钮压在棋盘上一直没人发现）。
  await setVP(360, 640);
  await goHome();
  await click('TOGGLE_COMFORT');
  await startHuman();
  await playCol(3); await playCol(2);
  await click('UNDO'); await settle();
  const sS = await snap();
  ok(!!sS.askRect
     && sS.askRect.y >= sS.board.y + sS.board.h
     && sS.askRect.y + sS.askRect.h <= 640,
    '⑫ 360×640 · 舒适模式：确认条整条在**盘底之下、屏内**（y=' + (sS.askRect && sS.askRect.y)
    + '..' + (sS.askRect && (sS.askRect.y + sS.askRect.h)) + '，盘底 ' + (sS.board.y + sS.board.h) + '）');
  ok(sS.hudDrawn.indexOf('…') < 0,
    '⑫ ⭐ 连最窄的屏 + 舒适模式下那句问句都**没被截断**（«' + sS.hudDrawn + '»）');
  await shot('p2c-t4-small-comfort.png');
  await click('UNDO_NO');
  await goHome();
  await click('TOGGLE_COMFORT');
  await setVP(414, 896);

  ok(errs.length === 0, '⑬ 全程零 pageerror / console.error' + (errs.length ? '：' + errs.join(' | ') : ''));
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);

  await browser.close();
  srv.close();
  if (failed) { console.error('\n⛔ ' + failed + ' 条断言失败'); process.exit(1); }
  console.log('\n✅ e2e-p2c-t4 全绿');
})().catch(e => { console.error(e); process.exit(1); });
