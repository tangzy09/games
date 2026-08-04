// ════════════════════════════════════════
// e2e-p2c-t3.cjs —— P2c **Task 3** 的端到端门禁：对坐模式 + 猜先动画（DESIGN §6.7）。
//
// §6.7：「**对坐模式**：棋盘旋转 180°，两人各自面向自己那侧（平板尤其自然）。」
//       「**猜先动画**（抛硬币）：交替先手之外加一点『开始感』。」
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b / e2e-p2c-t1/t2 同一条纪律：**一次都不许调 `dispatch()` /
//   `applyMove()` / `C4Settings.set()`**，落子与设置一律 `page.mouse`，落点一律从
//   **画出来的那份几何**（`G.L`）算，⛔ 零绝对坐标。
//
// 覆盖（每条都配了会红的反向对照；变异实测见 commit message）：
//   ① 加载零报错 + 对坐模式**默认关**
//   ② ⭐ 真实鼠标点那一行 ⇒ 开，且**活过一次刷新**（判据取非默认值方向）
//   ③ ⭐ 只对**同机双人局**生效：双人局 L.faceToFace=true、人机局 false，
//      而设置本身**没被清掉**（⛔ 不静默 —— 照 T1 让子在求解器档下的先例）
//   ④ ⭐⭐⭐ **棋盘、重力、列热区一个像素都没转** —— 这是本 task 那个产品判断的判据本身：
//      (a) 注册的 COL 热区与**画出来的那份 layout**（G.L.colHits）逐个相同（同源，⛔ 不许各算各的）
//      (b) ⭐⭐ **真实鼠标**：在一个**非对称**局面上逐列点「画出来的第 c 列」的列心，
//          落子必须真的在第 c 列 —— 尤其 **第 3 列（镜像下会变成第 5 列）**
//      (c) ⭐ **像素**反向对照：点完第 3 列之后，新多出来的那枚棋子在第 3 列那一格上，
//          第 5 列那一格**仍然是空的**（⛔ 少了这条，(b) 在「盘也镜像了」时会一起自洽）
//   ⑤ ⭐⭐ 第二条 HUD **真的是转过来的**（像素）：它与主 HUD 内容逐字相同 ⇒
//      把它**按 180° 反向采样**之后必须与主 HUD 几乎逐点相同，而**正向**采样则明显不同
//      （⛔ 少了「正向明显不同」这条反向对照，一张空白卡也能让上一句成立）
//      + 几何：reserve 够高、第二 HUD ⛔ 压不到棋盘、且它**确实从棋盘那里要到了地方**
//   ⑥ ⭐⭐ 猜先：落定面 = 先手那枚；**结果 == state.js 那四条规则算出来的先手**（六局逐条对）
//      + 确定性（同 seed 两次采样逐位相同、且与 node 侧逐位相同）+ 源码零 Math.random
//   ⑦ ⭐⭐ 减弱动态：硬币**不转**（coinAnim=false / poseCoin()=null），
//      **但「谁先手」仍然看得见**（像素墨迹 + 文案），⛔ 信息不许被一起关掉
//   ⑧ 多视口截图（⚠ **平板竖屏 / 横屏必看** —— 对坐模式的主场就是平板）
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。截图落 C:\tmp\connect4-p2c\。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const St = require('../js/state.js');
const Fx = require('../js/fx.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8340;
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
  // ⚠ 同一个 context ⇒ localStorage 跨「刷新」还在（②那条持久化断言全靠它）
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); return n; };

  async function pt(action, key, val) {
    const r = await page.evaluate(a => {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const h = hitAreas[i];
        if (h.action !== a.action) continue;
        if (a.key !== null && h.data[a.key] !== a.val) continue;
        return { x: h.x + h.w / 2, y: h.y + h.h / 2, w: h.w, h: h.h, rx: h.x, ry: h.y };
      }
      return null;
    }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
    if (!r) throw new Error('找不到热区 action=' + action + (key ? ' ' + key + '=' + val : ''));
    return { x: Math.round(r.x), y: Math.round(r.y), rx: r.rx, ry: r.ry, w: r.w, h: r.h };
  }
  const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  const click = async (a, k, v) => clickAt(await pt(a, k, v));

  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
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
  /** 等猜先演完（⇒ 静态终态，截图与像素判据才稳）。 */
  const coinDone = () => page.waitForFunction(() => C4Fx.poseCoin() === null, null, { timeout: 6000 });
  /** ⚠ 换视口之后必须**等 resize 真的到达页面**：setViewportSize 一返回不代表引擎已经
   *  initCanvas + 重排热区，早一步去点会点在旧版面的坐标上（表现是「点不动」，零报错）。 */
  async function setVP(w, h) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(a => GameGlobal.SW === a.w && GameGlobal.SH === a.h && G.L
      && G.L.SW === a.w, { w, h }, { timeout: 5000 });
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
  async function setMotion(mode) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('reduceMotion')) !== mode; i++) {
      await click('CYCLE_MOTION');
    }
    if (await page.evaluate(() => C4Settings.get('reduceMotion')) !== mode) throw new Error('点不到减弱动态 ' + mode);
  }

  const prefs = () => page.evaluate(() => ({
    faceToFace: C4Settings.get('faceToFace'), handicap: C4Settings.get('handicap'),
    kids: C4Settings.get('kids'), reduceMotion: C4Settings.get('reduceMotion')
  }));
  const geom = () => page.evaluate(() => ({
    f2f: G.L.faceToFace, cell: G.L.cell, boardX: G.L.boardX, boardY: G.L.boardY,
    boardW: G.L.boardW, boardH: G.L.boardH,
    reserve: { x: G.L.reserve.x, y: G.L.reserve.y, w: G.L.reserve.w, h: G.L.reserve.h },
    drop: { x: G.L.drop.x, y: G.L.drop.y, w: G.L.drop.w, h: G.L.drop.h },
    hud: { x: G.L.hud.x, y: G.L.hud.y, w: G.L.hud.w, h: G.L.hud.h },
    f2fRect: G.f2fRect, coinRect: G.coinRect,
    HUD_H: C4Render.HUD_H, F2F_RESERVE: C4Render.F2F_RESERVE,
    colHits: G.L.colHits.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    // ⭐ 「画出来的第 c 列」的列心 x —— 用的是 drawBoard 画棋子那条同一个函数
    colCenterX: [0, 1, 2, 3, 4, 5, 6].map(c => G.L.cellX(c) + G.L.cell / 2),
    SW: GameGlobal.SW, SH: GameGlobal.SH
  }));
  const gameOf = () => page.evaluate(() => ({
    mode: G.g.mode, tier: G.g.tier, gameNo: G.g.gameNo, humanFirst: G.g.humanFirst,
    kids: G.g.kids, pre: G.g.pre.slice(), moves: G.g.moves.slice(), seed: G.g.seed,
    phase: G.phase, coin: G.coin, coinAnim: G.coinAnim, label: coinLabel(G.g)
  }));

  /** 某个矩形里的「非背景」像素数（深像素 = 字/图例/棋子）。 */
  const rectInk = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(a.x * dpr), Math.round(a.y * dpr),
      Math.max(1, Math.round(a.w * dpr)), Math.max(1, Math.round(a.h * dpr))).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 200) n++;
    }
    return n;
  }, rc);

  /** 在矩形里按 gw×gh 的网格采一遍灰度（⇒ 两块可以逐点比）。 */
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

  /** 一格棋子的墨迹（判「这一格到底有没有子」）。 */
  const cellInk = (c, r) => page.evaluate(a => {
    const L = G.L;
    const p = L.center(a.c, a.r);
    const s = L.cell * 0.62;
    const cv = document.getElementById(CFG.canvasId);
    const dpr = cv.width / GameGlobal.SW;
    const d = cv.getContext('2d').getImageData(
      Math.round((p.x - s / 2) * dpr), Math.round((p.y - s / 2) * dpr),
      Math.round(s * dpr), Math.round(s * dpr)).data;
    // 井底 gray≈90；六边形 ≈27（更暗）、圆环 ≈232（更亮）⇒ 两侧都算「有子」
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 60 || g > 170) n++;
    }
    return n;
  }, { c, r });

  /** ⭐ 用真实鼠标点「**画出来的**第 c 列」（x = 画棋子那条 cellX 算的列心；y = 盘中央）。
   *  ⛔ 故意**不**用 colHits 的中心：那正是「只转画面不转热区」时会自洽的那条路。 */
  async function clickDrawnCol(c) {
    const g = await geom();
    const x = Math.round(g.colCenterX[c]);
    const y = Math.round(g.boardY + g.boardH * 0.5);
    const before = await page.evaluate(() => G.g.moves.length);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(k => G.g.moves.length > k, before, { timeout: 4000 })
      .catch(() => { throw new Error('点「画出来的第 ' + (c + 1) + ' 列」(x=' + x + ',y=' + y + ') 之后一子都没落'); });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
    return page.evaluate(() => G.g.moves[G.g.moves.length - 1]);
  }

  // ═════════════════════════════════════════════════════════════════
  console.log('\n① 加载 + 默认值');
  await boot();
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  ok((await prefs()).faceToFace === false,
    '① ⭐ 对坐模式**默认关**（它要从棋盘身上收走 ' + await page.evaluate(() => C4Render.F2F_RESERVE)
    + ' px，⛔ 不许替没提要求的人改版面）');

  console.log('\n② ⭐ 真实鼠标打开 + 活过一次刷新');
  await click('TOGGLE_F2F');
  ok((await prefs()).faceToFace === true, '② 点那一行 ⇒ 对坐模式打开');
  await shot('p2c-t3-home-f2f.png');
  await boot();                                    // 「刷新页面」
  ok((await prefs()).faceToFace === true,
    '② ⭐ 活过一次刷新（判据取**非默认值**方向：默认是 false，持久化坏掉时「仍是 false」照样绿）');

  console.log('\n③ ⭐ 只对同机双人局生效（⛔ 但不静默清掉设置）');
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 6000 });
  await coinDone(); await settle();
  const gH = await geom();
  ok(gH.f2f === true, '③ 双人局：这一屏是按对坐模式算的（G.L.faceToFace）');
  ok(!!gH.f2fRect, '③ 第二条 HUD 真的画出来了（G.f2fRect=' + JSON.stringify(gH.f2fRect) + '）');
  await goHome();
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 8000 });
  await settle();
  const gA = await geom();
  ok(gA.f2f === false && !gA.f2fRect,
    '③ ⭐ 人机局：对坐模式**不生效**（对面没有人 ⇒ 第二条 HUD 是纯噪音，还要占 64 px）');
  ok((await prefs()).faceToFace === true,
    '③ ⭐ 但设置**没被清掉**（⛔ 不静默 —— 照 T1 让子在求解器档下的先例：存得住、那一局不生效）');

  console.log('\n④ ⭐⭐⭐ 棋盘 / 重力 / 列热区一个像素都没转');
  await goHome();
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 6000 });
  await coinDone(); await settle();
  // (a) 注册的热区与**画出来的那份 layout** 同源
  const same = await page.evaluate(() => {
    const cols = hitAreas.filter(h => h.action === 'COL');
    if (cols.length !== 7) return 'COL 热区 ' + cols.length + ' 个';
    for (const h of cols) {
      const r = G.L.colHits[h.data.col];
      if (Math.abs(r.x - h.x) > 0.01 || Math.abs(r.y - h.y) > 0.01
        || Math.abs(r.w - h.w) > 0.01 || Math.abs(r.h - h.h) > 0.01) return '列 ' + h.data.col + ' 对不上';
    }
    return 'ok';
  });
  ok(same === 'ok',
    '④(a) ⭐ 7 个 COL 热区与**画出来的那份 layout**（G.L.colHits）逐个相同（' + same + '）'
    + ' —— ⛔ 两处各算各的 = 点哪儿都不对，而功能测试全绿');

  // 先摆一个**非对称**局面（⛔ 对称局面会把镜像错误整个掩盖掉）
  for (const c of [0, 0, 1, 6]) {
    const got = await clickDrawnCol(c);
    if (got !== c) break;
  }
  const asym = await page.evaluate(() => G.g.moves.slice());
  ok(asym.join(',') === '0,0,1,6',
    '④ 前置：摆出一个**非对称**局面 moves=[' + asym + ']（⛔ 对称局面下镜像错误看不出来）');

  // (b) ⭐⭐ 逐列点「画出来的第 c 列」，落子必须真的在第 c 列
  const wrong = [];
  for (const c of [2, 4, 0, 6, 5, 3, 1]) {
    const got = await clickDrawnCol(c);
    if (got !== c) wrong.push('视觉第 ' + (c + 1) + ' 列 → 落在第 ' + (got + 1) + ' 列');
  }
  ok(wrong.length === 0,
    '④(b) ⭐⭐ **真实鼠标**：7 列逐列点「画出来的第 c 列」的列心，落子全部落在第 c 列'
    + (wrong.length ? ' —— ' + wrong.join(' / ') : '')
    + '（⚠ 第 3 列在镜像下会变成第 5 列 —— 那才是能抓住 bug 的那一列）');

  // (c) ⭐ 像素反向对照：再点一次「画出来的第 3 列」，那一格必须真的多出一枚，
  //     而它的镜像列（第 5 列）那一格**不许**跟着变。
  const rowOf = c => page.evaluate(k => C4Render.landingRow(C4State.boardOf(G.g), k), c);
  const r3 = await rowOf(2), r5 = await rowOf(4);
  const before3 = await cellInk(2, r3), before5 = await cellInk(4, r5);
  const got3 = await clickDrawnCol(2);
  await settle();
  const after3 = await cellInk(2, r3), after5 = await cellInk(4, r5);
  ok(got3 === 2 && after3 > before3 + 30 && Math.abs(after5 - before5) < 30,
    '④(c) ⭐ **像素**：点「画出来的第 3 列」之后，第 3 列那一格真的多出一枚（墨迹 '
    + before3 + '→' + after3 + '），而**镜像的第 5 列**那一格没动（' + before5 + '→' + after5 + '）'
    + ' —— ⛔ 少了这条，(b) 在「盘也一起镜像了」时会自洽');
  await shot('p2c-t3-play-f2f-phone.png');

  console.log('\n⑤ ⭐⭐ 第二条 HUD 真的是转过来的（像素）+ 几何');
  const g5 = await geom();
  ok(g5.reserve.h >= g5.F2F_RESERVE - 0.5,
    '⑤ reserve 高度 ' + g5.reserve.h + ' >= F2F_RESERVE=' + g5.F2F_RESERVE + '（硬底线，⛔ 装不下等于没做）');
  ok(g5.f2fRect.y + g5.f2fRect.h <= g5.drop.y + 0.5,
    '⑤ ⭐ 第二条 HUD（底 ' + (g5.f2fRect.y + g5.f2fRect.h) + '）⛔ 压不到棋盘（悬停带顶 '
    + g5.drop.y + '）—— 它进了 cell 的高度预算');
  const GW = 64, GH = 10;
  const gMain = await grid(g5.hud, GW, GH);
  const gF2F = await grid(g5.f2fRect, GW, GH);
  const rot = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) rot.push(gF2F[(GH - 1 - j) * GW + (GW - 1 - i)]);
  const mad = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const dRot = mad(gMain, rot), dPlain = mad(gMain, gF2F);
  ok(dRot < 10 && dRot * 2.5 < dPlain,
    '⑤ ⭐⭐ **像素**：第二条 HUD 按 180° 反着采样后与主 HUD 几乎逐点相同（平均差 '
    + dRot.toFixed(2) + '），而**正向**采样明显不同（' + dPlain.toFixed(2) + '）'
    + ' —— ⛔ 少了后半句，一张空白卡也能让前半句成立');

  await goHome();
  await setF2F(false);
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  await coinDone(); await settle();
  const gOff = await geom();
  ok(gOff.f2f === false && !gOff.f2fRect, '⑤ 反向对照：关掉对坐模式 ⇒ 没有第二条 HUD');

  // ⭐⭐ 它**确实从棋盘的预算里要到了地方**（⛔ 不是画上去压住盘）。
  // ⚠ 判据必须在**平板竖屏**上量：手机竖屏的盘是被「宽」封顶的（§6.9 那条实测纠正），
  //   reserve 本来就有 90 px 富余 ⇒ 对坐模式在那里是**白拿**的，量不出差别。
  //   ⛔ 别因此把这条断言删掉：平板才是对坐模式的主场，而那正是它会真的挤到盘的地方。
  const measure = async on => {
    await goHome(); await setF2F(on);
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    await coinDone(); await settle();
    return geom();
  };
  await setVP(768, 1024);
  const tOff = await measure(false), tOn = await measure(true);
  ok(tOn.cell < tOff.cell && tOn.reserve.h >= tOn.F2F_RESERVE
     && tOn.boardY + tOn.boardH <= tOff.boardY + tOff.boardH + 0.5,
    '⑤ ⭐⭐ 平板竖屏 768×1024：对坐模式把 cell 从 ' + tOff.cell + ' 收到 ' + tOn.cell
    + '、reserve ' + tOff.reserve.h + '→' + tOn.reserve.h
    + ' —— 那 ' + tOn.F2F_RESERVE + ' px 是**从棋盘的高度预算里扣的**，⛔ 不是画上去压住盘'
    + '（盘底 ' + (tOff.boardY + tOff.boardH) + '→' + (tOn.boardY + tOn.boardH) + '，没往下溢）');
  await setVP(414, 896);

  console.log('\n⑥ ⭐⭐ 猜先：结果 == state.js 那四条规则算出来的先手');
  await goHome();
  await setF2F(true);
  await setHandicap(0);
  // 六局，把四条先手规则（交替 / 让子强方先手 / 孩子恒先手 / 顶档玩家先手）都过一遍。
  // ⭐ 期望值**在 node 侧由 state.js 现算**（⛔ 不抄页面的答案），文案由 locale key 独立拼。
  const T2 = (k, p) => page.evaluate(a => T(a.k, a.p || undefined), { k, p });
  const cases = [];
  const runCase = async (name, prep, opts) => {
    await goHome();
    await prep();
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 20000 });
    const g = await gameOf();
    const want = St.newGame(Object.assign({ gameNo: g.gameNo, seed: g.seed }, opts)).humanFirst;
    let label;
    if (g.kids) label = await T2(want ? 'kids.coinYou' : 'kids.coinAI');
    else if (g.mode === 'ai') label = await T2(want ? 'game.coinYou' : 'game.coinAI');
    else label = await T2('game.coinP', { p: await T2(want ? 'game.p1' : 'game.p2') });
    cases.push({ name, want, got: g.humanFirst, label: g.label, expect: label, coin: g.coin });
    return g;
  };
  /** 双人局最快的一局：0,1,0,1,0,1,0 ⇒ 先手在第 1 列连成竖四。⚠ 全程真实鼠标。 */
  async function fastHumanWin() {
    for (const c of [0, 1, 0, 1, 0, 1, 0]) await clickDrawnCol(c);
    await page.waitForFunction(() => G.phase === 'OVER', null, { timeout: 8000 });
  }
  await runCase('双人 · 第 1 局（§1.1② 交替先手）', async () => { await click('PLAY_HUMAN'); }, { mode: 'human' });
  await runCase('双人 · 第 2 局（§1.1② 交替 ⇒ 翻面）',
    async () => {
      await click('PLAY_HUMAN');
      await coinDone();
      await fastHumanWin();                        // ⭐ 真的打完一局，⛔ 不许伪造 gameNo
      await click('AGAIN');
    }, { mode: 'human' });
  await runCase('双人 · 让 2 子（T1 强方先手）',
    async () => { await setHandicap(2); await click('PLAY_HUMAN'); }, { mode: 'human', handicap: 2 });
  await runCase('人机 · 儿童档（T2 孩子恒先手，⚠ 优先级高于 T1）',
    async () => { await setHandicap(2); await click('KIDS'); await click('PLAY_AI'); },
    { mode: 'ai', tier: St.KIDS_TIER, handicap: St.KIDS_HANDICAP, kids: true });
  await runCase('人机 · 顶档（§1.1① 玩家必须先手）',
    async () => { await click('TIER', 'tier', 20); await setHandicap(0); await click('PLAY_AI'); },
    { mode: 'ai', tier: 20 });
  await runCase('人机 · 轻松档 + 让 2 子（T1 ⇒ AI 先手）',
    async () => { await click('TIER', 'tier', 3); await setHandicap(2); await click('PLAY_AI'); },
    { mode: 'ai', tier: 3, handicap: 2 });

  for (const c of cases) {
    ok(c.got === c.want && c.label === c.expect && c.coin === true,
      '⑥ ' + c.name + '：先手 ' + (c.want ? '玩家/P1' : '对手/P2')
      + '（state.js 现算 ' + c.want + ' vs 页面 ' + c.got + '），猜先卡上写的是 «' + c.label + '»'
      + (c.label === c.expect ? '' : ' ⛔ 应为 «' + c.expect + '»'));
  }
  const kinds = new Set(cases.map(c => c.want));
  ok(kinds.size === 2,
    '⑥ ⭐ 反向对照：这六局里**两个方向都出现过**（' + [...kinds] + '）—— ⛔ 否则上面六条'
    + '在「猜先恒说玩家先手」的假实现下会一起绿');

  // ⭐ 确定性：同 seed 两次采样逐位相同，且**与 node 侧逐位相同**
  const seeds = [0, 1, 7, -268435455, 123456789];
  const sig = s => page.evaluate(a => {
    const out = [];
    for (let i = 0; i <= 60; i++) {
      const p = C4Fx.sampleCoin({ first: 0, seed: a }, (C4Fx.COIN_SPIN + C4Fx.COIN_HOLD) * i / 60);
      out.push(p.face + ':' + p.w.toFixed(12));
    }
    return out.join('|');
  }, s);
  const nodeSig = s => {
    const out = [];
    for (let i = 0; i <= 60; i++) {
      const p = Fx.sampleCoin({ first: 0, seed: s }, (Fx.COIN_SPIN + Fx.COIN_HOLD) * i / 60);
      out.push(p.face + ':' + p.w.toFixed(12));
    }
    return out.join('|');
  };
  let detOK = true, detMsg = '';
  for (const s of seeds) {
    const a = await sig(s), b = await sig(s);
    if (a !== b) { detOK = false; detMsg = 'seed=' + s + ' 同一页面里两次不一样'; break; }
    if (a !== nodeSig(s)) { detOK = false; detMsg = 'seed=' + s + ' 浏览器与 node 不一样'; break; }
  }
  ok(detOK, '⑥ ⭐⭐ 猜先确定性：' + seeds.length + ' 个 seed × 61 个时刻，同 seed 两次**逐位相同**，'
    + '且**浏览器与 node 逐位相同**' + (detOK ? '' : ' —— ' + detMsg));
  const halves = await page.evaluate(a => a.map(s => C4Fx.coinHalfTurns(s)), seeds);
  ok(new Set(halves).size >= 2,
    '⑥ ⭐ 反向对照：圈数**真的**由存档里的 seed 定（' + halves.join('/') + '）—— ⛔ 否则上一条在'
    + '「圈数写死」的实现下也全绿，而那就没法证明它是 seed 的函数');

  // ⛔⛔ 源码零 Math.random（抓「没被用例覆盖到的分支里偷用」）
  const srcs = ['js/fx.js', 'js/main.js', 'js/render.js', 'js/state.js'];
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const dirty = srcs.filter(f => /Math\s*\.\s*random/.test(strip(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))));
  ok(dirty.length === 0,
    '⑥ ⛔⛔ 四个源码文件里**代码**零 Math.random（注释里的禁令不算）'
    + (dirty.length ? ' —— ' + dirty.join(' / ') : '')
    + ' —— 真随机会同时打碎存档重放与那三条先手规则');

  console.log('\n⑦ ⭐⭐ 减弱动态：硬币不转，但「谁先手」仍然看得见');
  await goHome();
  await setHandicap(0);                            // ⚠ ⑥ 最后一局把让子留在 2 了；这一节只测减弱动态
  await setMotion('off');                          // 先强制关 ⇒ 拿到「动画确实会放」的反向对照
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  const spinning = await page.evaluate(() => ({ anim: G.coinAnim, pose: C4Fx.poseCoin() !== null }));
  ok(spinning.anim === true && spinning.pose === true,
    '⑦ 反向对照：减弱动态**关**的时候硬币真的在转（coinAnim=' + spinning.anim + '）'
    + ' —— ⛔ 少了这条，下面那句「没在转」在「猜先根本没做」时也绿');
  // ⚠ 截图要**拍在硬币立起来的那一瞬**（w 小）：随手一拍多半正好是正面朝上，
  //   与减弱动态那张长得一模一样，肉眼验收就白验了。
  const caught = await page.waitForFunction(
    () => { const p = C4Fx.poseCoin(); return !!p && p.w < 0.35; }, null, { timeout: 3000 })
    .then(() => true, () => false);
  ok(caught, '⑦ 截图拍在硬币**立起来**那一瞬（⇒ 那张图肉眼看得出它在转）');
  await shot('p2c-t3-coin-spin.png');
  await coinDone(); await settle();
  const inkNormal = await rectInk((await geom()).coinRect);

  await goHome();
  await setMotion('on');
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  await settle();
  const g7 = await geom();
  const gg7 = await gameOf();
  const off = await page.evaluate(() => ({ anim: G.coinAnim, pose: C4Fx.poseCoin() !== null, done: C4Fx.done() }));
  ok(off.anim === false && off.pose === false && off.done === true,
    '⑦ ⭐ 减弱动态开 ⇒ 硬币**一帧都不转**（coinAnim=false / poseCoin()=null / fx 全空）');
  ok(!!g7.coinRect, '⑦ ⭐⭐ **但那张卡还在**（G.coinRect=' + JSON.stringify(g7.coinRect) + '）');
  const inkReduced = await rectInk(g7.coinRect);
  ok(inkReduced > inkNormal * 0.6,
    '⑦ ⭐⭐ **像素**：减弱动态下卡里的墨迹 ' + inkReduced + '（正常时 ' + inkNormal
    + '）—— 「谁先手」这条**信息**没有被一起关掉');
  const want7 = St.newGame({ mode: 'human', gameNo: gg7.gameNo, seed: gg7.seed }).humanFirst;
  ok(gg7.label === await T2('game.coinP', { p: await T2(want7 ? 'game.p1' : 'game.p2') }),
    '⑦ ⭐ 文案也仍然是对的：«' + gg7.label + '»');
  await shot('p2c-t3-coin-reduced.png');
  // 反向对照：落下第一手之后那张卡就该收掉（⛔ 它不是常驻装饰）
  await clickDrawnCol(3);
  await settle();
  ok(!(await geom()).coinRect, '⑦ ⭐ 落下第一手之后猜先卡收掉（先手已经是看得见的事实了）');
  await setMotion('auto');

  console.log('\n⑧ 多视口截图（⚠ 平板竖屏/横屏必看 —— 对坐模式的主场就是平板）');
  const VPS = [
    { n: 'tablet-portrait', w: 768, h: 1024 },
    { n: 'tablet-landscape', w: 1024, h: 768 },
    { n: 'phone', w: 414, h: 896 },
    { n: 'small', w: 360, h: 640 }
  ];
  const shots = [];
  for (const vp of VPS) {
    await setVP(vp.w, vp.h);
    await goHome();
    await setF2F(true);
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
    await coinDone();
    for (const c of [3, 3, 2, 4, 2]) await clickDrawnCol(c);
    await settle();
    const gv = await geom();
    ok(!!gv.f2fRect && gv.f2fRect.y + gv.f2fRect.h <= gv.drop.y + 0.5
       && gv.f2fRect.y >= gv.hud.y + gv.hud.h - 0.5,
      '⑧ [' + vp.n + ' ' + vp.w + '×' + vp.h + '] 第二条 HUD 排在 HUD 与棋盘之间、⛔ 不压盘'
      + '（cell=' + gv.cell + '，reserve.h=' + gv.reserve.h + '）');
    shots.push(await shot('p2c-t3-' + vp.n + '.png'));
  }
  await setVP(414, 896);

  ok(errs.length === 0, '⑨ 全程零 pageerror / console.error' + (errs.length ? '：' + errs.join(' | ') : ''));
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);

  await browser.close();
  srv.close();
  if (failed) { console.error('\n⛔ ' + failed + ' 条断言失败'); process.exit(1); }
  console.log('\n✅ e2e-p2c-t3 全绿');
})().catch(e => { console.error(e); process.exit(1); });
