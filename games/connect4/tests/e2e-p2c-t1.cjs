// ════════════════════════════════════════
// e2e-p2c-t1.cjs —— P2c **Task 1** 的端到端门禁：让子（DESIGN §6.7）。
//
// §6.7：「⭐ **让子**：弱的一方可**预置 1-2 枚子**在盘上。家长 vs 孩子终于能打得有来有回
//        —— **这是让全家人一起玩下去的唯一办法**。」
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b 同一条纪律：**一次都不许调 `dispatch()` / `applyMove()` /
//   `C4Settings.set()`**，落子与设置一律 `page.mouse`，落点一律按热区 action 名取（⛔ 零绝对坐标）。
//
// 覆盖（每条都配了会红的反向对照）：
//   ① 加载零报错
//   ② ⭐ 真实鼠标把让子从 0 点到 2（点两下 `CYCLE_HANDICAP`）+ **刷新之后还在**
//      （⚠ 判据取**非默认值**方向 —— 默认是 0，「刷新后仍是 0」在持久化坏掉时照样绿）
//   ③ ⭐⭐ 开一局让 2 子的双人局：**开局盘上就有 2 枚子** —— **状态 + 像素双判据**
//      （⛔ 只断言 `boardOf().n===2` 不够：那只证明数据对，不证明画出来了）
//   ④ ⭐⭐ **撤销撤不掉它们**：走 5 手 → 真实鼠标［撤销］点到底 ⇒ 盘上仍是那 2 枚
//      · 反向对照：让 0 子做同一串操作 ⇒ 撤到底盘上 **0 枚**（少了这条，③④ 可能只是
//        「盘面读数恒 2」之类的假绿）
//   ⑤ ⭐ 让子归**弱方一个人**，且**强方先手**（humanFirst=false）
//   ⑥ ⭐⭐ **AI 真的看见了那两枚子**：让 2 子的人机轻松档里，AI 的第一手必须等于 node 侧
//      拿**带预置子的盘**独立复算的答案，且**不等于**拿「空手数列表」算的答案。
//      ⚠ 这一条抓的正是「传给引擎的是 `g.moves` 而不是盘面」那个 bug —— 那时 AI 会照着一个
//        少了两枚子的局面走，**落子照常、零报错**，其它所有断言都抓不住。
//   ⑦ ⭐ 求解器档下让子**不生效、且界面上不许还写着生效**（§2.4：降级必须可见）：
//      设置里仍是 2（选择不许被清），开局盘上 0 枚，且那一行的**像素**与轻松档时不同
//   ⑧ 截图：让 0 / 1 / 2 子的开局各一张（⛔ 逐张肉眼验收）
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。截图落 C:\tmp\connect4-p2c\。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const AI = require('../js/ai.js');
const St = require('../js/state.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8337;
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
  // ⚠ 用同一个 context ⇒ localStorage 跨「刷新」还在（②那条持久化断言全靠它）
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
  /** 把让子档位点到 n（真实鼠标 cycle，⛔ 不碰 C4Settings）。 */
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) {
      await click('CYCLE_HANDICAP');
    }
    const got = await page.evaluate(() => C4Settings.get('handicap'));
    if (got !== n) throw new Error('点不到让子 ' + n + ' 档（停在 ' + got + '）');
  }
  /** 走一手真实鼠标并等它落稳。 */
  async function playCol(col) {
    const before = await page.evaluate(() => G.g.moves.length);
    await click('COL', 'col', col);
    await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
      before, { timeout: 6000 });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  }
  async function settle() {
    await page.mouse.move(5, 5);
    await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
  }

  // ⭐⭐ 像素判据：按**格心圆盘窗口**（半径 0.40 格）量每格的平均灰度，
  //   然后看「哪几格明显偏离空井的中位数」。⛔ 别用整格方窗（井的圆角边框会被算进去）。
  const cellGrays = () => page.evaluate(() => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    const dpr = cv.width / GameGlobal.SW;
    const S = Math.round(L.cell * dpr);
    const RAD = 0.40 * L.cell * dpr;
    const out = [];
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) {
      const d = g2.getImageData(Math.round(L.cellX(c) * dpr), Math.round(L.cellY(r) * dpr), S, S).data;
      let s = 0, k = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5;
        if (dx * dx + dy * dy > RAD * RAD) continue;
        const i = (y * S + x) * 4;
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        k++;
      }
      out.push({ c: c, r: r, g: s / k });
    }
    return out;
  });
  /** 与「空井中位灰度」差 > TH 的格子 = 画着东西的格子。 */
  const INK_TH = 12;
  function inkedCells(grays) {
    const vals = grays.map(x => x.g).slice().sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    return grays.filter(x => Math.abs(x.g - med) > INK_TH).map(x => ({ c: x.c, r: x.r, g: Math.round(x.g) }));
  }
  /** 某个矩形里的「非背景」像素数（⑦ 用它比两种档位下同一行的字不一样）。 */
  const rectInk = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(a.rx * dpr), Math.round(a.ry * dpr),
      Math.round(a.w * dpr), Math.round(a.h * dpr)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 200) n++;                       // 行底是接近白的卡片 ⇒ 深像素 = 字/图例
    }
    return n;
  }, rc);

  console.log('\n① 加载');
  await boot();
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  ok(await page.evaluate(() => C4Settings.get('handicap')) === 0,
    '① 让子**默认 0**（§6.7 的让子改的是规则 ⇒ 绝不许默认替人开）');

  console.log('\n② ⭐ 真实鼠标改让子档位 + 持久化');
  await setHandicap(2);
  ok(await page.evaluate(() => C4Settings.get('handicap')) === 2, '② 点两下 CYCLE_HANDICAP ⇒ 让子 = 2');
  await boot();                                  // 「刷新页面」
  ok(await page.evaluate(() => C4Settings.get('handicap')) === 2,
    '② ⭐ 让子 2 **活过了一次刷新**（判据取非默认值方向：默认是 0，持久化坏掉时「仍是 0」照样绿）');

  // ⭐ HOME 上那一行长什么样（⛔ 逐张肉眼验收：标签被截断成「Head start (w…」这种事
  //   只有看图才抓得住 —— settingRow 的 wrapLines 只留一行，德/俄/中文膨胀都会撞上）。
  await shot('p2c-t1-home-h2.png');
  const hcapRow = await pt('CYCLE_HANDICAP');
  ok(hcapRow.ry > (await pt('TIER', 'tier', 3)).ry && hcapRow.ry < (await pt('PLAY_AI')).ry,
    '② ⭐ 让子那一行排在**难度选择与开始按钮之间**（它是「这一局怎么开」的设置，'
    + '⛔ 不是无障碍偏好 —— 丢进底下那三行等于家长找不到）');

  console.log('\n③ ⭐⭐ 让 2 子开局：盘上就有 2 枚（状态 + 像素双判据）');
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 4000 });
  await settle();
  const s3 = await page.evaluate(() => ({
    pre: G.g.pre.slice(), moves: G.g.moves.slice(),
    n: C4State.boardOf(G.g).n, humanFirst: G.g.humanFirst,
    owner: C4State.humanPlayer(G.g), turn: C4State.turnOf(G.g)
  }));
  ok(s3.n === 2 && s3.moves.length === 0,
    '③ 开局盘上 **2 枚**、手数 **0**（预置子不是手数）：n=' + s3.n + ' moves=' + JSON.stringify(s3.moves));
  ok(JSON.stringify(s3.pre) === JSON.stringify(St.HANDICAP_COLS[2].slice()),
    '③ 预置格 = C4State.HANDICAP_COLS[2] = ' + JSON.stringify(St.HANDICAP_COLS[2].slice()));
  const ink3 = inkedCells(await cellGrays());
  const want3 = St.placeHandicap(B.newBoard(), s3.pre, s3.owner);
  const wantCells = [];
  for (let c = 0; c < 7; c++) for (let r = 0; r < want3.h[c]; r++) wantCells.push(c + ',' + r);
  ok(ink3.length === 2 && ink3.every(x => wantCells.indexOf(x.c + ',' + x.r) >= 0),
    '③ ⭐⭐ **像素上**恰好 2 格画着东西，且正是 ' + JSON.stringify(wantCells)
    + '（实测有墨的格：' + JSON.stringify(ink3.map(x => x.c + ',' + x.r)) + '）');
  await shot('p2c-t1-h2-start.png');

  console.log('\n⑤ ⭐ 归弱方一个人 + 强方先手');
  ok(s3.humanFirst === false && s3.owner === 1,
    '⑤ ⭐ 让子局里**强方先手**（humanFirst=false）、预置子归弱方那个座位（player ' + s3.owner + '）');
  ok(s3.turn === 0, '⑤ 开局轮到先手位走（预置子不算手数）');
  const owned = await page.evaluate(() => {
    const bd = C4State.boardOf(G.g);
    const cnt = m => m.reduce((s, v) => { let k = 0; for (let x = v; x; x >>= 1) k += x & 1; return s + k; }, 0);
    return { a: cnt(bd.a), b: cnt(bd.b) };
  });
  ok(owned.a === 0 && owned.b === 2,
    '⑤ 两枚**全归同一个人**（先手位 ' + owned.a + ' 枚 / 后手位 ' + owned.b + ' 枚）');

  console.log('\n④ ⭐⭐ 撤销撤不掉预置子（真实鼠标）');
  for (const c of [0, 0, 6, 6, 1]) await playCol(c);
  ok(await page.evaluate(() => C4State.boardOf(G.g).n) === 7, '④ 走完 5 手 ⇒ 盘上 7 枚');
  // ⚠ P2c T4：双人局的悔棋要对方同意（§6.7）⇒ 每一次都是两下（请求 + 同意）。
  //   ⛔ 别只点第一下：那样 moves 一手都不会退，本节「撤到底」的前提就没了。
  for (let i = 0; i < 8; i++) {
    const has = await page.evaluate(() => hitAreas.some(h => h.action === 'UNDO' && h.data !== undefined));
    if (!has) break;
    await click('UNDO');
    await click('UNDO_OK');
    await page.waitForTimeout(30);
  }
  await settle();
  const s4 = await page.evaluate(() => ({ moves: G.g.moves.slice(), n: C4State.boardOf(G.g).n, pre: G.g.pre.slice() }));
  ok(s4.moves.length === 0, '④ 手数已经撤光（moves=' + JSON.stringify(s4.moves) + '）');
  ok(s4.n === 2 && JSON.stringify(s4.pre) === JSON.stringify(s3.pre),
    '④ ⭐⭐ 撤到底之后盘上**仍有 2 枚预置子**（n=' + s4.n + '）—— 撤没了 = 孩子的让子被吃了');
  const ink4 = inkedCells(await cellGrays());
  ok(ink4.length === 2 && ink4.every(x => wantCells.indexOf(x.c + ',' + x.r) >= 0),
    '④ ⭐⭐ **像素上**也还在（有墨的格：' + JSON.stringify(ink4.map(x => x.c + ',' + x.r)) + '）');

  console.log('\n④b 反向对照：让 0 子做同一串操作 ⇒ 撤到底是**空盘**');
  await setHandicap(0);
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.pre.length === 0, null, { timeout: 4000 });
  await settle();
  ok(inkedCells(await cellGrays()).length === 0, '④b 让 0 子的开局像素上是**空盘**');
  await shot('p2c-t1-h0-start.png');
  for (const c of [0, 0, 6, 6, 1]) await playCol(c);
  for (let i = 0; i < 8; i++) {
    if (!await page.evaluate(() => hitAreas.some(h => h.action === 'UNDO'))) break;
    await click('UNDO');           // ⚠ P2c T4：双人局两下（请求 + 同意），同上
    await click('UNDO_OK');
    await page.waitForTimeout(30);
  }
  await settle();
  const s4b = await page.evaluate(() => ({ n: C4State.boardOf(G.g).n }));
  ok(s4b.n === 0 && inkedCells(await cellGrays()).length === 0,
    '④b ⭐ 让 0 子撤到底 ⇒ 盘上 **0 枚**（n=' + s4b.n + '）—— 没有这条，④ 可能只是「读数恒 2」的假绿');

  console.log('\n⑧ 让 1 子的开局（截图 + 像素）');
  await setHandicap(1);
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.pre.length === 1, null, { timeout: 4000 });
  await settle();
  const ink1 = inkedCells(await cellGrays());
  ok(ink1.length === 1 && ink1[0].c === St.HANDICAP_COLS[1][0] && ink1[0].r === 0,
    '⑧ 让 1 子 ⇒ 像素上恰好 1 格（中列底）：' + JSON.stringify(ink1.map(x => x.c + ',' + x.r)));
  await shot('p2c-t1-h1-start.png');

  console.log('\n⑥ ⭐⭐ AI 真的看见了那两枚子（人机轻松档）');
  await setHandicap(2);
  await goHome();
  await click('TIER', 'tier', 3);
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 6000 });
  let disc = 0, checked = 0;
  for (let attempt = 0; attempt < 14 && disc === 0; attempt++) {
    await page.waitForFunction(() => G.g.moves.length >= 1, null, { timeout: 8000 });
    const s = await page.evaluate(() => ({
      seed: G.g.seed, tier: G.g.tier, pre: G.g.pre.slice(),
      owner: C4State.humanPlayer(G.g), first: G.g.moves[0]
    }));
    const bd = St.placeHandicap(B.newBoard(), s.pre, s.owner);
    const wantBoard = AI.aiMove(bd, s.tier, s.seed);      // 看得见预置子
    const wantMoves = AI.aiMove([], s.tier, s.seed);      // 只拿手数列表（= 那个 bug 的行为）
    checked++;
    if (wantBoard !== wantMoves) {
      disc++;
      ok(s.first === wantBoard,
        '⑥ ⭐⭐ AI 第一手 = 拿**带预置子的盘**复算的答案（第 ' + s.first + ' 列，node 说 ' + wantBoard + '）');
      ok(s.first !== wantMoves,
        '⑥ ⭐⭐ 且 **不等于** 只拿手数列表算出来的第 ' + wantMoves
        + ' 列 —— 这一条抓的正是「传 g.moves 而不是盘面」那个零报错的 bug');
    } else {
      // ⚠⚠ **这一局还在进行中**（我们只看了 AI 的第一手）⇒ ⛔ 不能点［再来一局］：
      //   那颗按钮只在**结算屏**注册热区，PLAYING 时 `pt('AGAIN')` 会当场抛
      //   「找不到热区 action=AGAIN」。回菜单重开才是「换一个 seed」的合法走法
      //   （autoSeed 每开一局 +1）。
      //   ⚠ 这条重试路径**此前一直靠运气没走到**：seed 来自 Date.now，第一次尝试通常就是
      //     可区分的，于是这个 bug 潜伏着；换一个时刻跑就当场炸（本次 P2c T2 收尾时实锤）。
      await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
      await click('HOME');
      await page.waitForFunction(() => G.phase === 'HOME', null, { timeout: 4000 });
      await click('PLAY_AI');
      await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 6000 });
    }
  }
  ok(disc === 1, '⑥ 找到了 1 个**可区分**的局面（试了 ' + checked + ' 局；两种算法答案相同的局面证明不了任何事）');
  await settle();
  await shot('p2c-t1-h2-ai.png');

  console.log('\n⑦ ⭐⭐ 求解器档：让子不生效，且界面上不许还写着生效');
  await goHome();
  const rcEasy = await pt('CYCLE_HANDICAP');
  const inkEasy = await rectInk(rcEasy);
  await click('TIER', 'tier', 20);
  await page.waitForTimeout(50);
  const rcPerf = await pt('CYCLE_HANDICAP');
  const inkPerf = await rectInk(rcPerf);
  ok(await page.evaluate(() => C4Settings.get('handicap')) === 2,
    '⑦ 换到完美档之后**设置仍是 2**（⛔ 不许悄悄把玩家的选择清掉）');
  ok(inkEasy !== inkPerf,
    '⑦ ⭐⭐ **像素上**那一行的字换了（轻松档 ' + inkEasy + ' 个深像素 vs 完美档 ' + inkPerf
    + '）—— ⛔ 绝不许「界面写着让 2 子、开局却是普通局」');
  await shot('p2c-t1-perfect-na.png');
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 6000 });
  await settle();
  const s7 = await page.evaluate(() => ({ pre: G.g.pre.slice(), n: C4State.boardOf(G.g).n,
                                          humanFirst: G.g.humanFirst, thinking: G.thinking }));
  ok(s7.pre.length === 0 && s7.n === 0,
    '⑦ 完美档开局盘上 **0 枚**（求解器档不许让子：开局库对让子局面 100% 落空 ⇒ §9.2 的断崖）');
  ok(s7.humanFirst === true,
    '⑦ ⚠ §1.1 第 1 条仍然赢：顶档**玩家先手**（⛔ 让子那条「强方先手」不许推翻它）');

  console.log('\n⑨ 收尾');
  ok(errs.length === 0, '⑨ 整场跑完仍是零 console error / pageerror'
    + (errs.length ? '：' + errs.slice(0, 2).join(' | ') : ''));

  await ctx.close();
  await browser.close();
  srv.close();

  console.log('\n截图 → ' + SHOT_DIR);
  console.log('  · p2c-t1-h0-start.png / p2c-t1-h1-start.png / p2c-t1-h2-start.png ⭐ 让 0/1/2 子的开局各一张');
  console.log('  · p2c-t1-h2-ai.png（让 2 子的人机局，AI 已经走了第一手）');
  console.log('  · p2c-t1-perfect-na.png（完美档：让子那一行必须写着「仅轻松档/双人」）');
  if (failed) { console.error('\n\u2717 e2e-p2c-t1 有 ' + failed + ' 条未通过'); process.exit(1); }
  console.log('\n\u2713 e2e-p2c-t1 全绿');
})().catch(e => { console.error(e); process.exit(1); });
