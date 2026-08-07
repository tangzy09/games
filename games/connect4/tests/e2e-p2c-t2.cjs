// ════════════════════════════════════════
// e2e-p2c-t2.cjs —— P2c **Task 2** 的端到端门禁：儿童档（DESIGN §6.7）。
//
// §6.7：「**儿童档**：AI 明显放水、不说难懂的话、赢了大撒花、更大的字与按钮。」
//
// ⛔⛔ 与 e2e-p2a / e2e-p2b / e2e-p2c-t1 同一条纪律：**一次都不许调 `dispatch()` /
//   `applyMove()` / `C4Settings.set()`**，落子与设置一律 `page.mouse`，落点一律按热区
//   action 名取（⛔ 零绝对坐标）。
//
// 覆盖（每条都配了会红的反向对照）：
//   ① 加载零报错 + 儿童档**默认关**（它改的是这一局怎么开，⛔ 不许替人开）
//   ② ⭐ 真实鼠标点［儿童］⇒ 一次性预设三项（档位 / 让子≥2 / 舒适模式）+ **刷新之后还在**
//      （⚠ 判据取**非默认值**方向 —— 默认是 false/0/false，持久化坏掉时「仍是默认」照样绿）
//      · 反向对照：再点［轻松］⇒ 儿童档退出，而**让子与舒适模式不回滚**
//   ③ ⭐⭐ 开一局儿童档：`kids` / 档位 / **孩子恒先手（连让 2 子也是）** / 盘上真有 2 枚子
//      · 反向对照：同样让 2 子但**不开**儿童档 ⇒ humanFirst=false（T1 的「强方先手」照旧）
//   ④ ⭐⭐ **界面文案确实变简单了** —— 三条各自独立可失败的判据：
//      (a) **像素**：HUD 右侧那格在儿童档下与「第 N 级」明显不同（同屏同位置比墨迹）
//      (b) **结构**：结算屏只剩一个占满整行的主 CTA（非儿童档是 60% + 一个读不懂的灰按钮）
//      (c) **文案**：kids.* 与 game.* 在 locale 里真的是两串不同的字
//          （⛔ 少了这条，(a)(b) 在「换了 key 但文案照抄」时照样绿）
//   ⑤ ⭐⭐ **赢了大撒花**：真实鼠标打到孩子赢 ⇒ 结算那一格是撒花卡（像素判黄）
//      · 反向对照：**非儿童档**赢局的同一格是数据条（⛔ 不许是黄的）
//   ⑥ ⭐ 儿童档与求解器档互斥：点［完美］⇒ 儿童档退出，开出来的局 `kids=false`
//   ⑦ 截图：儿童档 HOME / 开局 / 结算（撒花）各一张（⛔ 逐张肉眼验收）
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。截图落 C:\tmp\connect4-p2c\。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const St = require('../js/state.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8339;
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

/** ⭐ 脚本玩家（**node 侧**，与页面无关）：能连四就连、否则挑一个不送头的中路列。
 *  ⚠ 它只是个「会玩的手」，⛔ 不是尺子 —— 胜率的真值在 `npm run sim:c4:kids`，这里只要
 *    能在有限局数内打出一次胜利，好让 ⑤ 看得到撒花。 */
function scriptPick(g) {
  const bd = St.boardOf(g);
  const win = R.winningMoves(bd);
  if (win.length) return win[0];
  const legal = R.moves(bd);
  const safe = legal.filter(c => R.winningMoves(B.play(bd, c)).length === 0);
  const pool = safe.length ? safe : legal;
  return pool.slice().sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))[0];
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
  async function setHandicap(n) {
    await goHome();
    for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== n; i++) {
      await click('CYCLE_HANDICAP');
    }
    const got = await page.evaluate(() => C4Settings.get('handicap'));
    if (got !== n) throw new Error('点不到让子 ' + n + ' 档（停在 ' + got + '）');
  }
  async function settle() {
    await page.mouse.move(5, 5);
    await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
  }
  const prefs = () => page.evaluate(() => ({
    kids: C4Settings.get('kids'), handicap: C4Settings.get('handicap'), comfort: C4Settings.get('comfort')
  }));
  const gameOf = () => page.evaluate(() => ({
    kids: G.g.kids, tier: G.g.tier, mode: G.g.mode, humanFirst: G.g.humanFirst,
    pre: G.g.pre.slice(), moves: G.g.moves.slice(), n: C4State.boardOf(G.g).n,
    seed: G.g.seed, gameNo: G.g.gameNo, phase: G.phase,
    winner: G.result ? G.result.winner : null, human: C4State.humanPlayer(G.g)
  }));

  /** 某个矩形里的「非背景」像素数（⛔ 深像素 = 字/图例）。 */
  const rectInk = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(a.rx * dpr), Math.round(a.ry * dpr),
      Math.max(1, Math.round(a.w * dpr)), Math.max(1, Math.round(a.h * dpr))).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 200) n++;
    }
    return n;
  }, rc);

  /** 矩形里「暖黄」（撒花卡 #ffd75e / 星星 #f6a21d）像素的占比。⚠ 判据是**色相**不是灰度：
   *  数据条那张卡是接近白的，灰度上和黄卡分不开。 */
  const yellowFrac = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const g2 = cv.getContext('2d');
    const dpr = cv.width / GameGlobal.SW;
    const d = g2.getImageData(Math.round(a.rx * dpr), Math.round(a.ry * dpr),
      Math.max(1, Math.round(a.w * dpr)), Math.max(1, Math.round(a.h * dpr))).data;
    let n = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4) {
      tot++;
      // 暖黄：R 高、G 中高、B 明显低
      if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 160 && d[i] - d[i + 2] > 60) n++;
    }
    return n / tot;
  }, rc);

  /** HUD 右半格（「第 N 级」/「儿童档」写在这里）。 */
  const hudRight = () => page.evaluate(() => {
    const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
    return { rx: L.hud.x + L.hud.w * 0.5, ry: L.hud.y, w: L.hud.w * 0.5, h: L.hud.h };
  });
  /** 结算屏那一格数据条 / 撒花卡的矩形（从 tray 与按钮热区反推，⛔ 零绝对坐标）。 */
  async function settleCardRect() {
    const again = await pt('AGAIN');
    const tray = await page.evaluate(() => {
      const L = C4Render.layout(GameGlobal.SW, GameGlobal.SH);
      return { x: L.tray.x, y: L.tray.y, w: L.tray.w, h: L.tray.h };
    });
    // 卡片就在主 CTA 上方那一块（间距 ≤12）
    const h = Math.max(0, again.ry - tray.y - 12);
    return { rx: tray.x, ry: Math.max(tray.y, again.ry - h - 8), w: tray.w, h: Math.max(1, h) };
  }

  /** 用真实鼠标把一局打完（脚本玩家）。@returns 终局的 G 快照 */
  async function playOutGame(maxPlies) {
    for (let i = 0; i < (maxPlies || 60); i++) {
      const st = await page.evaluate(() => ({
        phase: G.phase, thinking: G.thinking,
        g: { mode: G.g.mode, tier: G.g.tier, gameNo: G.g.gameNo, humanFirst: G.g.humanFirst,
             seed: G.g.seed, pre: G.g.pre.slice(), moves: G.g.moves.slice(), kids: G.g.kids,
             v: G.g.v, paramsHash: G.g.paramsHash },
        myTurn: C4State.isHumanTurn(G.g)
      }));
      if (st.phase === 'OVER') break;
      if (!st.myTurn || st.thinking) {
        await page.waitForFunction(() => G.phase === 'OVER' || (!G.thinking && C4State.isHumanTurn(G.g)),
          null, { timeout: 15000 });
        continue;
      }
      const col = scriptPick(st.g);
      const before = st.g.moves.length;
      await click('COL', 'col', col);
      await page.waitForFunction(k => window.G.g.moves.length > k || window.G.phase === 'OVER',
        before, { timeout: 8000 });
      await page.waitForFunction(() => C4Fx.done(), null, { timeout: 8000 }).catch(() => {});
    }
    await page.waitForFunction(() => G.phase !== 'OVER' || G.overReady, null, { timeout: 8000 }).catch(() => {});
    await settle();
    return gameOf();
  }

  console.log('\n① 加载 + 默认值');
  await boot();
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  const p0 = await prefs();
  ok(p0.kids === false, '① ⭐ 儿童档**默认关**（它改的是这一局怎么开，⛔ 绝不许替没提要求的人开）');
  ok(p0.handicap === 0 && p0.comfort === false, '① 让子 / 舒适模式也仍是默认（0 / 关）');

  console.log('\n② ⭐ 点［儿童］= 一次性预设三项 + 持久化');
  await click('KIDS');
  const p1 = await prefs();
  ok(p1.kids === true, '② 儿童档打开');
  ok(p1.handicap >= St.KIDS_HANDICAP,
    '② ⭐ 让子被推到 ≥ ' + St.KIDS_HANDICAP + ' 枚（实际 ' + p1.handicap + '）—— 预设，不是锁');
  ok(p1.comfort === true, '② ⭐ 舒适模式**联动打开**（§6.7 的「更大的字与按钮」）');
  ok(await page.evaluate(() => G.tier) === St.KIDS_TIER,
    '② 选中的档位切到儿童档那一级（' + St.KIDS_TIER + '）');
  await shot('p2c-t2-home-kids.png');

  await boot();                                   // 「刷新页面」
  const p2 = await prefs();
  ok(p2.kids === true && p2.handicap >= St.KIDS_HANDICAP && p2.comfort === true,
    '② ⭐ 三项**都活过了一次刷新**（' + JSON.stringify(p2) + '）'
    + ' —— 判据取非默认值方向：默认是 false/0/false，持久化坏掉时「仍是默认」照样绿');
  ok(await page.evaluate(() => G.tier) === St.KIDS_TIER,
    '② 刷新之后选中的档位也回到儿童档那一级（⛔ 少了 boot 里那一句，让子那行会按默认 tier 判）');

  // 反向对照：点别的档 ⇒ 儿童档退出，但**让子与舒适模式不回滚**
  await click('TIER', 'tier', 20);
  const p3 = await prefs();
  ok(p3.kids === false, '② 反向对照：点［完美］⇒ 儿童档退出（四选一）');
  ok(p3.handicap === p2.handicap && p3.comfort === true,
    '② ⭐ 退出儿童档**不回滚**家长已经改过的让子/舒适模式（回滚 = 「我设的东西自己没了」）');
  await click('KIDS');
  ok((await prefs()).kids === true, '② 再点回［儿童］');

  console.log('\n③ ⭐⭐ 开一局儿童档');
  await setHandicap(2);
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 6000 });
  await settle();
  const g3 = await gameOf();
  ok(g3.kids === true, '③ 这一局的 `kids` 为真（⭐ 存在 G 里，⛔ 不是 UI 每帧去读设置）');
  ok(g3.tier === St.KIDS_TIER, '③ 档位恒 ' + St.KIDS_TIER + '（实际 ' + g3.tier + '）');
  ok(g3.humanFirst === true && g3.human === 0,
    '③ ⭐⭐ **孩子恒先手 —— 连让 2 子也是**（T1 的「让子局强方先手」在儿童档里让位）');
  ok(g3.pre.length === 2 && g3.n === 2 && g3.moves.length === 0,
    '③ 让子照常生效：开局盘上就有 2 枚预置子（pre=' + JSON.stringify(g3.pre) + ' n=' + g3.n + '）');
  await shot('p2c-t2-kids-start.png');

  // 反向对照：同样让 2 子、**不开**儿童档 ⇒ T1 的强方先手照旧
  await goHome();
  await click('TIER', 'tier', 3);                 // 轻松档（也允许让子）
  ok((await prefs()).kids === false, '③ 反向对照：切到轻松档，儿童档已退出');
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  await settle();
  const g3b = await gameOf();
  ok(g3b.kids === false && g3b.pre.length === 2 && g3b.humanFirst === false,
    '③ ⭐ 反向对照：**同样让 2 子但不开儿童档 ⇒ humanFirst=false**（T1 的规则没被改坏）'
    + ' —— 少了这条，③ 那句「孩子恒先手」可能只是 humanFirst 恒真的假绿');

  console.log('\n④ ⭐⭐ 文案确实变简单了（像素 / 结构 / 文案 三条）');
  // (a) 像素：同一位置的 HUD 右格，两种档位下的墨迹必须明显不同
  const hr = await hudRight();
  const inkPlain = await rectInk(hr);
  await goHome();
  await click('KIDS');
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.kids === true, null, { timeout: 6000 });
  await settle();
  const inkKids = await rectInk(hr);
  ok(Math.abs(inkKids - inkPlain) > 20,
    '④(a) ⭐ **像素**：HUD 右格在儿童档下与「第 N 级」明显不同（墨迹 ' + inkKids + ' vs ' + inkPlain + '）');
  // (c) 文案：两套字符串真的不一样（⛔ 否则 (a)(b) 在「换了 key 但文案照抄」时照样绿）
  const words = await page.evaluate(() => ({
    kidsTurn: T('kids.yourTurn'), plainTurn: T('game.yourTurn'),
    kidsWin: T('kids.win'), plainWin: T('game.win'),
    kidsOver: T('kids.roundOver'), plainOver: T('game.roundOver'),
    kidsTag: T('menu.kids'), level: T('game.level', { n: 3 })
  }));
  ok(words.kidsTurn !== words.plainTurn && words.kidsWin !== words.plainWin
     && words.kidsOver !== words.plainOver && words.kidsTag !== words.level,
    '④(c) **文案**：kids.* 与 game.* 确实是两串不同的字（' + JSON.stringify(words) + '）');

  console.log('\n⑤ ⭐⭐ 赢了大撒花（真实鼠标打到孩子赢）');
  // ⚠ 打不打得赢是概率事件（儿童档实测得分率 .954/basic）⇒ 最多打 8 局。
  //   连输 8 局的概率约 1e-11 —— ⛔ 别为了「稳」去调 seed 或绕过 UI。
  let won = null;
  for (let attempt = 0; attempt < 8 && !won; attempt++) {
    const res = await playOutGame(60);
    if (res.winner !== null && res.winner === res.human) won = res;
    else { await click('AGAIN'); await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 }); }
  }
  ok(!!won, '⑤ 儿童档里孩子在 8 局之内赢了一局'
    + (won ? '（第 ' + (won.gameNo + 1) + ' 局，' + won.moves.length + ' 手）' : ''));
  if (won) {
    ok(await page.evaluate(() => G.g.kids === true), '⑤ 那一局确实是儿童档');
    const cardKids = await settleCardRect();
    const yKids = await yellowFrac(cardKids);
    ok(yKids > 0.30, '⑤ ⭐⭐ 结算那一格是**撒花卡**（暖黄占比 ' + (yKids * 100).toFixed(1) + '%）');
    // (b) 结构：主 CTA 占满整行
    const againKids = await pt('AGAIN');
    const trayW = await page.evaluate(() => C4Render.layout(GameGlobal.SW, GameGlobal.SH).tray.w);
    ok(againKids.w > trayW * 0.95,
      '④(b) ⭐ **结构**：儿童档结算只剩一个占满整行的主 CTA（' + Math.round(againKids.w)
      + '/' + Math.round(trayW) + '）');
    await shot('p2c-t2-kids-cheer.png');

    // 反向对照：**非儿童档**赢局的同一格是数据条，⛔ 不许是黄的
    await goHome();
    await click('TIER', 'tier', 3);
    await click('PLAY_AI');
    await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.kids === false, null, { timeout: 6000 });
    let plainWin = null;
    for (let attempt = 0; attempt < 10 && !plainWin; attempt++) {
      const res = await playOutGame(60);
      if (res.winner !== null && res.winner === res.human) plainWin = res;
      else { await click('AGAIN'); await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 }); }
    }
    ok(!!plainWin, '⑤ 反向对照：非儿童档也赢下一局（用来比同一格画的是什么）');
    if (plainWin) {
      const cardPlain = await settleCardRect();
      const yPlain = await yellowFrac(cardPlain);
      ok(yPlain < 0.05,
        '⑤ ⭐ 反向对照：**非儿童档**赢局的同一格是数据条不是撒花（暖黄占比 '
        + (yPlain * 100).toFixed(1) + '%）—— 少了这条，上面那句「是黄的」可能只是背景本来就黄');
      const againPlain = await pt('AGAIN');
      ok(againPlain.w < trayW * 0.75,
        '④(b) ⭐ 反向对照：非儿童档的主 CTA 只占 '
        + Math.round(againPlain.w / trayW * 100) + '%（旁边还有一个 P3 的留位按钮）');
    }
  }

  console.log('\n⑥ ⭐ 儿童档与求解器档互斥');
  await goHome();
  await click('TIER', 'tier', 20);
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 20000 });
  const g6 = await gameOf();
  ok(g6.kids === false && g6.tier === 20,
    '⑥ 选了［完美］之后开出来的是普通第 20 级局（kids=' + g6.kids + '）');
  ok(g6.pre.length === 0,
    '⑥ 求解器档下让子照 T1 的规则不生效（⛔ 儿童档没把这条弄坏）');

  ok(errs.length === 0, '⑦ 全程零 pageerror / console.error' + (errs.length ? '：' + errs.join(' | ') : ''));
  console.log('\n截图：' + SHOT_DIR);

  await browser.close();
  srv.close();
  if (failed) { console.error('\n⛔ ' + failed + ' 条断言失败'); process.exit(1); }
  console.log('\n✅ e2e-p2c-t2 全绿');
})().catch(e => { console.error(e); process.exit(1); });
