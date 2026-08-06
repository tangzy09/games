// ════════════════════════════════════════
// e2e-p2c-t5.cjs —— P2c **Task 5** 的端到端门禁：**限时模式**（DESIGN §6.10）。
//
// §6.10：「每手 10 秒倒计时，超时随机落子（偏中路）。四子棋在时间压力下完全是另一个游戏。
//   ⚠ **绝不能是默认** —— 休闲玩家讨厌计时。⚠ 限时局**不计入精准度纪录**。」
//
// ⛔⛔ 与 e2e-p2a / p2b / p2c-t1..t4 同一条纪律：**一次都不许调 `dispatch()` /
//   `applyMove()` / `C4Settings.set()` / `onTimeout()`**，落子与按钮一律 `page.mouse`，
//   落点一律从**画出来的那份几何**算，⛔ 零绝对坐标。
//
// 覆盖（每条都配了会红的反向对照；变异实测见 commit message）：
//   ① ⭐⭐ **默认关**：干净档案里 `timed === false`（⛔ 不是「假值」）、HOME 那行写着「关」、
//      开出来的局 `g.timed === false` 且**一个倒计时都不画**
//   ①b ⭐⭐ 持久化判据取**非默认值方向**：真实鼠标点开 → **真的 reload** → 仍是开，
//      且开出来的局真的带表（⛔ 「关→刷新仍是关」在字段丢了的实现下照样绿）
//   ② ⭐⭐ **超时确实落子**：什么都不做等 10 秒 ⇒ 盘上多一子（读数 + **像素**）、
//      `g.auto` 记下那一手、屏幕上如实写「时间到 · 第 N 列由时钟落下」
//   ③ ⭐⭐ **切后台不许偷跑**：真实 `visibilitychange` + `document.hidden` ⇒ 藏 9 秒回来
//      （若表照跑，2.5+9 > 10 秒必然超时）⇒ **手数一位没变、used 一毫秒没涨**
//   ④ ⭐⭐ **AI 思考期间玩家的表不走**：把引擎打慢到 11.5 秒 ⇒ 那段里 `clockKey === null`、
//      `C4Clock.state().used === 0`、**盘面不动**（⛔ 时钟绝不许替 AI 落子）；
//      AI 落完之后玩家拿到的是**满格 10 秒**
//   ⑤ ⭐⭐ **超时手可重放**：整局存档 → `deserialize` → `rewindTo` 到那一手 → 重算 ⇒ **同一列**
//   ⑥ ⭐ 儿童档：HOME 那行如实写「儿童档不适用」（整句，⛔ 没被截断）、儿童局**没有表**，
//      ⚠ 但家长那个选择**没被清掉**
//   ⑦ ⭐ 版面：倒计时整条在 HUD 卡里 ⇒ **一个像素都不压棋盘**（P2b T7 的五视口门禁同源）；
//      对坐模式（T3）下桌子**两边**都看得见表
//   ⑧ ⭐ 停表的另外两处：等对方回答悔棋（T4）· 猜先还在演（T3）
//   ⑨ ⛔ 源码红线：本 task 改动的文件里 `Math.random` = **0**（超时手必须可重放）
//   ⑩ ⛔ 变现红线：整个限时流程里广告调用 = 0
//   ⑪ 截图：手机竖屏**正常**与**剩 3 秒告急**各一张
//
// ⚠ 本文件会真的等若干个 10 秒（表就是 10 秒的，⛔ 不许为了跑得快去改 TURN_MS ——
//   那样测的就不是产品了）。整体约 60-90 秒。
// ⚠ E2E（起浏览器）⇒ 单独挂 script，⛔ 不进 `npm test`。截图落 C:\tmp\connect4-p2c\。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const St = require('../js/state.js');
const Ck = require('../js/clock.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8342;
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

  /** ⛔ 变现红线（§8）+ ⭐ 「把引擎打慢」的钩子，两个都在**每次 goto 之后**重装。 */
  async function instrument() {
    await page.evaluate(() => {
      window.__ads = { rewarded: 0, interstitial: 0 };
      const r = Ads.showRewarded, i = Ads.showInterstitial;
      Ads.showRewarded = function () { window.__ads.rewarded++; return r.apply(Ads, arguments); };
      Ads.showInterstitial = function () { window.__ads.interstitial++; return i.apply(Ads, arguments); };
      // ⭐ 引擎减速器：`window.__aiDelay` 毫秒。⚠ 只包了**一层等待**，⛔ 没有改它返回什么 ——
      //   测的仍然是产品那条 AI 落子路径（这正是「AI 在 n=10..15 要 1.7 秒」那个断崖的模拟）。
      const orig = EngineClient.ai;
      window.__aiDelay = 0;
      EngineClient.ai = function () {
        const args = arguments;
        const d = window.__aiDelay | 0;
        if (!d) return orig.apply(EngineClient, args);
        return new Promise(res => setTimeout(() => res(orig.apply(EngineClient, args)), d));
      };
    });
  }
  async function boot() {
    await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
      null, { timeout: 15000 });
    await instrument();
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
  const coinDone = () => page.waitForFunction(
    () => C4Fx.poseCoin() === null && nowMs() >= G.coinUntil, null, { timeout: 6000 });

  /** ⚠ 一律**真实鼠标**点那一行设置（⛔ 不许 C4Settings.set 抄近路：那样测的就不是 UI 了）。 */
  async function setToggle(action, key, on) {
    await goHome();
    if (await page.evaluate(k => C4Settings.get(k), key) !== on) await click(action);
    if (await page.evaluate(k => C4Settings.get(k), key) !== on) throw new Error('点不到 ' + key + '=' + on);
  }
  const setTimed = on => setToggle('TOGGLE_TIMED', 'timed', on);
  const setF2F = on => setToggle('TOGGLE_F2F', 'faceToFace', on);

  const snap = () => page.evaluate(() => ({
    phase: G.phase, mode: G.g && G.g.mode,
    moves: G.g ? G.g.moves.slice() : null,
    auto: G.g ? G.g.auto.slice() : null,
    timed: G.g ? G.g.timed : null,
    kids: G.g ? G.g.kids : null,
    pref: C4Settings.get('timed'),
    clockKey: G.clockKey, clockBlock: G.clockBlock, clockOn: G.clockOn,
    used: C4Clock.state().used, remain: C4Clock.remain(), secs: C4Clock.seconds(),
    urgent: C4Clock.urgent(),
    note: G.autoNote ? { col: G.autoNote.col, player: G.autoNote.player } : null,
    chip: G.L.hud.timerChip, bar: G.L.hud.timerBar, fill: G.L.hud.timerFill,
    hudRight: G.L.hud.rightDrawn, hudLeft: G.L.hud.leftDrawn,
    f2fRect: G.f2fRect,
    board: { x: G.L.boardX, y: G.L.boardY, w: G.L.boardW, h: G.L.boardH },
    hud: { x: G.L.hud.x, y: G.L.hud.y, w: G.L.hud.w, h: G.L.hud.h },
    home: (G.homeSettings || []).slice(),
    ads: window.__ads
  }));

  /** 一格棋子的墨迹（判「这一格到底有没有子」，与 t1/t3/t4 同一把尺子）。 */
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

  /** 矩形里「非底色」的像素数（⇒ 「这块到底画没画东西」）。 */
  const inkOf = rc => page.evaluate(a => {
    const cv = document.getElementById(CFG.canvasId);
    const dpr = cv.width / GameGlobal.SW;
    const d = cv.getContext('2d').getImageData(
      Math.round(a.x * dpr), Math.round(a.y * dpr),
      Math.max(1, Math.round(a.w * dpr)), Math.max(1, Math.round(a.h * dpr))).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // HUD 卡是 rgba(255,255,255,0.90) 压在浅底上 ⇒ 底色 ≈ 250；显著更暗的算「画了东西」
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (g < 236) n++;
    }
    return n;
  }, rc);

  /** ⭐ 用真实鼠标点「画出来的第 c 列」（与 t3/t4 同一条路径）。 */
  async function playCol(c) {
    const p = await page.evaluate(k => ({ x: G.L.cellX(k) + G.L.cell / 2, y: G.L.boardY + G.L.boardH * 0.5 }), c);
    const before = await page.evaluate(() => G.g.moves.length);
    await page.mouse.move(Math.round(p.x), Math.round(p.y));
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(k => G.g.moves.length > k, before, { timeout: 4000 })
      .catch(() => { throw new Error('点第 ' + (c + 1) + ' 列之后一子都没落'); });
    await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  }
  async function startHuman() {
    await goHome();
    await click('PLAY_HUMAN');
    await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'human', null, { timeout: 6000 });
    await coinDone(); await settle();
  }
  /** ⭐ 真实的「切后台 / 切回来」：改 document.hidden + 派一个真的 visibilitychange。 */
  const setHidden = on => page.evaluate(v => {
    Object.defineProperty(document, 'hidden', { get: () => v, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (v ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, on);

  const home = (s, a) => (s.home.find(r => r.a === a) || {});

  // ═════════════════════════════════════════════════════════════════
  console.log('\n① ⭐⭐ 默认关（⛔ DESIGN §6.10：「绝不能是默认」）');
  await boot();
  ok(errs.length === 0, '① 加载零报错' + (errs.length ? '：' + errs[0] : ''));
  let s = await snap();
  ok(s.pref === false,
    '① ⭐⭐ 干净档案里 `C4Settings.get("timed") === false`（判据是 `=== false`，'
    + '⛔ 不是「假值」：字段被 merge 丢掉时读到的是 undefined，那也是假值）');
  const offRow = home(s, 'TOGGLE_TIMED');
  const offTxt = await page.evaluate(() => T('menu.off'));
  ok(offRow.value === offTxt && offRow.hot === false,
    '① HOME 那行**画上去的**值就是「' + offRow.value + '」（⛔ 不是高亮态）');
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  await coinDone(); await settle();
  s = await snap();
  ok(s.timed === false && s.clockKey === null && s.clockOn === false && s.chip === null,
    '① ⭐⭐ 默认开出来的局 `g.timed === false`、没有表在跑（clockKey=' + s.clockKey
    + '）、HUD 上**一个倒计时都没画**（timerChip=' + s.chip + '）');
  ok(s.hudRight !== '',
    '① 反向对照：非限时局里 HUD 右侧那串（«' + s.hudRight + '»）照常在'
    + ' —— ⛔ 别顺手把它删了（限时局才让位）');

  console.log('\n①b ⭐⭐ 持久化判据取**非默认值**方向（真实鼠标 + 真的 reload）');
  await goHome();
  await setTimed(true);
  ok(await page.evaluate(() => C4Settings.get('timed')) === true, '①b 真实鼠标点开了');
  await page.reload({ waitUntil: 'load' });                 // ⭐ **真的刷新**，⛔ 不是重新 attach
  await page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'HOME' && (hitAreas || []).length > 0,
    null, { timeout: 15000 });
  await instrument();
  s = await snap();
  ok(s.pref === true,
    '①b ⭐⭐ 刷新之后仍然是**开**（`=== true`）—— ⛔ 少了这条方向，'
    + '「字段没进 settings.js 的 defaults」这类 bug 在「关→刷新仍是关」下照样全绿');
  const onTxt = await page.evaluate(() => T('menu.timedOn', { n: 10 }));
  ok(home(s, 'TOGGLE_TIMED').value === onTxt && home(s, 'TOGGLE_TIMED').hot === true,
    '①b HOME 那行画的是「' + home(s, 'TOGGLE_TIMED').value + '」（⭐ 直接写出**给多久**，'
    + '⛔ 不是一个光秃秃的「开」）且是高亮态');
  await startHuman();
  s = await snap();
  ok(s.timed === true && s.clockKey !== null && s.clockOn === true && !!s.chip,
    '①b ⭐ 刷新之后开出来的局**真的带表**（g.timed=' + s.timed + '、clockKey=' + s.clockKey
    + '、HUD 上画了倒计时）');
  ok(s.hudRight === '',
    '①b ⭐ 限时局里 HUD 右侧那串次要信息整条让位（照 T4 的先例：414 宽上两串会互相挤）');

  console.log('\n⑦ ⭐ 版面：倒计时整条在 HUD 卡里 ⇒ ⛔ 一个像素都不压棋盘');
  const inHud = r => r && r.x >= s.hud.x - 0.5 && r.y >= s.hud.y - 0.5
    && r.x + r.w <= s.hud.x + s.hud.w + 0.5 && r.y + r.h <= s.hud.y + s.hud.h + 0.5;
  ok(inHud(s.chip) && inHud(s.bar),
    '⑦ ⭐ 数字牌 ' + JSON.stringify(s.chip) + ' 与倒计时条 ' + JSON.stringify(s.bar)
    + ' 都在 HUD 卡（' + JSON.stringify(s.hud) + '）之内');
  ok(s.bar.y + s.bar.h <= s.board.y && s.chip.y + s.chip.h <= s.board.y,
    '⑦ ⭐⭐ 两者都在**盘顶之上**（盘 y=' + s.board.y + '）—— ⛔ 倒计时压住棋盘 = '
    + '违反 §6.3「连线必须一直看得见」，而 P2b T7 的五视口版面门禁还在');
  const barInk = await inkOf(s.bar);
  ok(barInk > 0, '⑦ 倒计时条**真的画出来了**（' + barInk + ' 个非底色像素）');

  console.log('\n⑧ ⭐ 停表之一：猜先还在演的时候表不走（T3）');
  await goHome();
  await click('PLAY_HUMAN');
  await page.waitForFunction(() => G.phase === 'PLAYING', null, { timeout: 6000 });
  await page.waitForTimeout(160);        // ⚠ 等第一拍 tick 真的跑过（⛔ 否则采到的是上一局的残值）
  const coinSnaps = [];
  for (let i = 0; i < 5; i++) {
    coinSnaps.push(await page.evaluate(() => ({ b: G.clockBlock, u: C4Clock.state().used,
                                                coin: nowMs() < G.coinUntil })));
    await page.waitForTimeout(120);
  }
  const during = coinSnaps.filter(x => x.coin);
  ok(during.length >= 3 && during.every(x => x.b === 'coin' && x.u === 0),
    '⑧ ⭐ 猜先那 ~1.2 秒里表**一毫秒都没走**（' + during.length + ' 次采样，used 全 0，'
    + 'clockBlock 全是 «coin»）—— ⛔ 那段时间牌面信息还在交付，占 10 秒预算的 12%');
  await coinDone();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => C4Clock.state().used) > 200,
    '⑧ ⭐ 反向对照：猜先演完之后表**立刻开始走** —— ⛔ 否则上面那条在「表根本不走」时也绿');

  console.log('\n② ⭐⭐ 超时**确实落子**（什么都不做，等表走完）');
  await startHuman();
  let b2 = await snap();
  ok(b2.moves.length === 0 && b2.auto.length === 0 && b2.secs === 10, '② 前提：空盘、表满格 10 秒');
  // ⭐ 先看一眼「正常」的样子（截图 ⑪ 的第一张就在这拍）
  await page.waitForTimeout(1200);
  await settle();
  await shot('p2c-t5-countdown-normal.png');
  s = await snap();
  ok(s.secs <= 9 && s.urgent === false && s.fill.w < s.bar.w,
    '② 表在走：剩 ' + s.secs + ' 秒、条已经短了（' + Math.round(s.fill.w) + '/'
    + Math.round(s.bar.w) + '）且还不告急');
  // ⭐ 剩 3 秒告急那一张
  await page.waitForFunction(() => C4Clock.urgent(), null, { timeout: 12000 });
  await settle();
  await shot('p2c-t5-countdown-urgent.png');
  const sU = await snap();
  ok(sU.urgent === true && sU.secs <= 3 && sU.fill.w < sU.bar.w * 0.35,
    '② ⭐ 剩 ' + sU.secs + ' 秒进告急态，条只剩 '
    + (sU.fill.w / sU.bar.w * 100).toFixed(0) + '%（⭐ 长度也是编码，⛔ 不只是变色）');
  // ⭐⭐ 等它真的走完
  await page.waitForFunction(k => G.g.moves.length > k, 0, { timeout: 8000 })
    .catch(() => { throw new Error('⛔ 表走完了却一子都没落 —— 限时模式的核心就没做'); });
  // ⚠ 等那枚棋子**落地**再量像素：落子动画期间它画在半空中，格心那一格当然是空的
  await page.waitForFunction(() => C4Fx.done(), null, { timeout: 6000 }).catch(() => {});
  await settle();
  const a2 = await snap();
  ok(a2.moves.length === 1,
    '② ⭐⭐ **超时真的落了一子**（moves=' + JSON.stringify(a2.moves) + '）');
  ok(JSON.stringify(a2.auto) === '[0]',
    '② ⭐ 而且它被记成「时钟落的」（auto=' + JSON.stringify(a2.auto) + '）—— '
    + '§3.3 复盘要说得出「这一手不是你下的」');
  const ink2 = await cellInk(a2.moves[0], 0);
  ok(ink2 > 100, '② ⭐ **像素上**那一子真的在盘上（第 ' + (a2.moves[0] + 1) + ' 列底格墨迹 ' + ink2 + '）');
  ok(a2.note && a2.note.col === a2.moves[0],
    '② ⭐ 屏幕上如实写着「时间到 · 第 ' + (a2.note ? a2.note.col + 1 : '?') + ' 列由时钟落下」'
    + ' —— ⛔ 少了这句，玩家看到的是「盘上凭空多了一子」，正好踩「它坑我」那条最毒的差评');
  ok(a2.secs === 10 && a2.clockKey !== b2.clockKey,
    '② ⭐ 落完之后**换手、表重新满格**（' + a2.secs + ' 秒）—— ⛔ 别让下一位继承上一位的残表');
  // ⭐⭐ 落的那一列必须与**纯函数重算**的一致（node 侧同一个 timeoutMove）
  const sv2 = await page.evaluate(() => C4State.serialize(G.g));
  const g2 = St.deserialize(sv2);
  ok(!!g2, '② 存档读得回（' + sv2.length + ' 字节）');
  ok(St.timeoutMove(St.rewindTo(g2, 0)) === a2.moves[0],
    '② ⭐⭐ 浏览器里时钟落的那一列（' + a2.moves[0] + '）与 **node 侧纯函数重算**的一致'
    + ' —— ⛔ 一旦它读了「当时表上还剩多少」，这里就再也对不上');

  console.log('\n⑤ ⭐⭐ 超时手可重放（整局存档 → 读回 → 重放到那一手 → 落同一列）');
  await playCol(0); await playCol(6);
  // 再让它超一次时（这一次发生在第 4 手，⇒ 与第一次不同的 ply）
  await page.waitForFunction(k => G.g.moves.length > k, 3, { timeout: 13000 })
    .catch(() => { throw new Error('第二次超时没发生'); });
  await settle();
  const a5 = await snap();
  ok(a5.auto.length === 2 && a5.auto[0] === 0 && a5.auto[1] === 3,
    '⑤ 前提：这一局有两手是时钟落的（auto=' + JSON.stringify(a5.auto) + '）');
  const sv5 = await page.evaluate(() => C4State.serialize(G.g));
  const g5 = St.deserialize(sv5);
  ok(!!g5 && g5.timed === true, '⑤ 存档读得回且 timed=true（' + sv5.length + ' 字节）');
  let same = 0;
  for (const ply of g5.auto) {
    if (St.timeoutMove(St.rewindTo(g5, ply)) === g5.moves[ply]) same++;
  }
  ok(same === g5.auto.length,
    '⑤ ⭐⭐ **存档读回来重放，每一手超时都落在同一列**（' + same + '/' + g5.auto.length + '）'
    + ' —— 这就是「超时手不许依赖当时的时钟」那条的兑现');
  // ⭐ 反向对照：换一个 seed 就该换列（否则上面那条在「恒中列」的实现下也绿）
  const other = new Set();
  for (let sd = 0; sd < 40; sd++) other.add(St.timeoutMove({ ...St.rewindTo(g5, g5.auto[1]), seed: sd }));
  ok(other.size >= 2,
    '⑤ ⭐ 反向对照：同一个局面换 seed 会落到不同的列（' + [...other].join(',') + '）');

  console.log('\n③ ⭐⭐ 切后台不许偷跑（真实 visibilitychange）');
  await startHuman();
  await page.waitForTimeout(2500);
  const b3 = await snap();
  ok(b3.used >= 2000 && b3.used <= 3200, '③ 前提：先正常走了 ' + b3.used + ' ms');
  await setHidden(true);
  const hid = await page.evaluate(() => ({ b: G.clockBlock, u: C4Clock.state().used }));
  ok(hid.b === 'hidden', '③ 切后台那一瞬 clockBlock 立刻变成 «' + hid.b + '»（visibilitychange 那一层）');
  // ⭐ 藏 9 秒：若表照跑，2.5 + 9 > 10 ⇒ **必然超时并落一子**
  await page.waitForTimeout(9000);
  const a3 = await snap();
  ok(a3.moves.length === b3.moves.length,
    '③ ⭐⭐ 藏了 9 秒回来，**手数一位没变**（' + JSON.stringify(a3.moves) + '）—— '
    + '⛔ 表要是照跑，2.5+9 > 10 秒必然已经替他落了一手（「回来发现自己超时输了」）');
  ok(Math.abs(a3.used - b3.used) < 300,
    '③ ⭐⭐ 而且 used 几乎一毫秒没涨（' + b3.used + ' → ' + a3.used + ' ms）'
    + ' —— ⛔ 少了这条，「表跑了但恰好没到 10 秒」的实现也会绿');
  await setHidden(false);
  await page.waitForTimeout(700);
  const r3 = await snap();
  ok(r3.clockBlock === null && r3.used > a3.used + 300,
    '③ ⭐ 切回来之后表**接着走**（' + a3.used + ' → ' + r3.used + ' ms，clockBlock=' + r3.clockBlock
    + '）—— ⛔ 否则上面两条在「表根本不走」时也绿');

  console.log('\n④ ⭐⭐ AI 思考期间玩家的表不走（把引擎打慢到 11.5 秒）');
  await goHome();
  await clickData('TIER', 'tier', 3);
  await page.evaluate(() => { window.__aiDelay = 11500; });
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.mode === 'ai', null, { timeout: 8000 });
  await coinDone();
  await page.waitForFunction(() => C4State.isHumanTurn(G.g), null, { timeout: 8000 });
  await playCol(3);                                  // ⇒ 轮到 AI，它要想 11.5 秒
  await page.waitForFunction(() => !C4State.isHumanTurn(G.g), null, { timeout: 4000 });
  const b4 = await snap();
  // ⚠ 采样时把「这一拍是不是还轮着 AI」一起记下来，只对**真的还在 AI 回合**的那些下断言 ——
  //   ⛔ 否则最后一两拍会撞上 AI 刚落完子的那一刻，测的就不是「AI 思考期间」了。
  const all4 = [];
  for (let i = 0; i < 11; i++) {
    await page.waitForTimeout(950);
    all4.push(await page.evaluate(() => ({
      k: G.clockKey, b: G.clockBlock, u: C4Clock.state().used, n: G.g.moves.length,
      ai: !C4State.isHumanTurn(G.g)
    })));
  }
  const during4 = all4.filter(x => x.ai);
  ok(during4.length >= 9,
    '④ 前提：AI 真的想了 ≥9 秒（' + during4.length + ' 次采样落在它的回合里）—— '
    + '⇒ 若表在跑，10 秒那条线**必然**已经被跨过');
  ok(during4.every(x => x.k === null),
    '④ ⭐⭐ AI 想的那 ' + during4.length + ' 秒里 `G.clockKey` 恒为 null —— **表根本不存在**'
    + '（⛔ 这比「停表」更强：它让「时钟替 AI 落一手」在结构上不可能）');
  ok(during4.every(x => x.u === 0),
    '④ ⭐⭐ 那段里 `C4Clock.used` 恒为 0 —— §9.2 的断崖（n=10..15 每手 1.7 秒）'
    + '一毫秒都进不了玩家的 10 秒');
  ok(during4.every(x => x.n === b4.moves.length),
    '④ ⭐⭐ 而且那段里**盘面一位没动**（手数恒 ' + b4.moves.length + '）—— '
    + '⛔ 表要是在 AI 的回合上跑，第 10 秒就会替 AI 落一手，而画面看起来完全正常');
  await page.waitForFunction(k => G.g.moves.length > k && C4State.isHumanTurn(G.g), b4.moves.length,
    { timeout: 15000 });
  await settle();
  const a4 = await snap();
  ok(a4.clockKey !== null && a4.secs === 10 && a4.used < 400,
    '④ ⭐ AI 落完之后，玩家拿到的是**满格 10 秒**（' + a4.secs + ' 秒 / used=' + a4.used + ' ms）'
    + ' —— ⛔ 不是「10 秒减去 AI 想的那 11.5 秒」');
  await page.evaluate(() => { window.__aiDelay = 0; });

  console.log('\n⑧b ⭐ 停表之二：等对方回答悔棋期间（T4）');
  await startHuman();
  await playCol(3);
  await page.waitForTimeout(1200);
  const b8 = await snap();
  await click('UNDO');
  await settle();
  const p8 = await snap();
  ok(p8.clockBlock === 'ask' && p8.used > 0,
    '⑧b 悔棋请求挂着 ⇒ clockBlock=«' + p8.clockBlock + '»（表停在 ' + p8.used + ' ms）');
  await page.waitForTimeout(3000);
  const q8 = await snap();
  ok(Math.abs(q8.used - p8.used) < 300 && q8.moves.length === b8.moves.length,
    '⑧b ⭐ 等回答的 3 秒里表**没走**（' + p8.used + ' → ' + q8.used + ' ms）、盘面没动'
    + ' —— ⛔ 否则一个人挂着问句就能把另一个人的表耗光，而被耗的那位连子都落不了');
  await click('UNDO_NO');
  await page.waitForTimeout(600);
  const r8 = await snap();
  ok(r8.clockBlock === null && r8.used > q8.used + 200,
    '⑧b ⭐ 拒绝之后表**立刻接着走**（' + q8.used + ' → ' + r8.used + ' ms）');

  console.log('\n⑥ ⭐ 儿童档：不给表，但⛔ 不静默、⛔ 也不清掉家长的选择');
  await goHome();
  await click('KIDS');
  await settle();
  const sK = await snap();
  const naTxt = await page.evaluate(() => T('menu.timedNA'));
  ok(sK.pref === true,
    '⑥ ⭐ 家长那个「限时」的选择**还在**（timed=' + sK.pref + '）—— ⛔ 别替他清掉'
    + '（照 T1 让子在求解器档下的先例）');
  ok(home(sK, 'TOGGLE_TIMED').value === naTxt && home(sK, 'TOGGLE_TIMED').hot === false,
    '⑥ ⭐ HOME 那行**如实写着**「' + home(sK, 'TOGGLE_TIMED').value + '」且不再高亮'
    + ' —— ⛔ 绝不许「界面上写着限时、开出来没有表」（§2.4：降级必须可见）');
  ok(home(sK, 'TOGGLE_TIMED').value.indexOf('…') < 0,
    '⑥ ⭐ 而且这句话**整句都在**（⛔ 被截成半句 = 家长根本不知道为什么不生效，T4 实锤）');
  await click('PLAY_AI');
  await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.kids === true, null, { timeout: 20000 });
  await coinDone();
  await page.waitForFunction(() => C4State.isHumanTurn(G.g), null, { timeout: 10000 });
  await settle();
  const kG = await snap();
  ok(kG.timed === false && kG.clockKey === null && kG.chip === null,
    '⑥ ⭐⭐ 儿童局**没有表**（g.timed=' + kG.timed + '、HUD 上一个倒计时都没画）—— '
    + '4-5 岁读不懂倒计时，而儿童档整套设计就是让孩子赢');
  await page.waitForTimeout(1500);
  const kG2 = await snap();
  ok(kG2.moves.length === kG.moves.length && kG2.used === 0,
    '⑥ 反向对照：儿童局里坐着不动也不会有人替他落子（手数恒 ' + kG.moves.length + '）');
  let threw = '';
  try { St.newGame({ mode: 'ai', tier: St.KIDS_TIER, gameNo: 0, kids: true, timed: true }); }
  catch (e) { threw = String(e.message || e); }
  ok(/儿童档/.test(threw),
    '⑥ ⭐ 而且「儿童档 + 限时」在 state.js 里**根本构造不出来**（当场抛：' + threw.slice(0, 34)
    + '…）—— ⇒ 两条功能在结构上碰不到彼此，⛔ 不是靠 UI 挡的');
  await goHome();
  await clickData('TIER', 'tier', 3);                 // 退出儿童档
  await settle();
  const sBack = await snap();
  ok(sBack.pref === true && home(sBack, 'TOGGLE_TIMED').value === onTxt,
    '⑥ ⭐ 退出儿童档之后那一行又回到「' + home(sBack, 'TOGGLE_TIMED').value + '」'
    + ' —— 家长的选择自始至终没被动过');

  console.log('\n⑦b ⭐ 对坐模式（T3）：桌子**两边**都看得见表');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => GameGlobal.SW === 768 && G.L && G.L.SW === 768, null, { timeout: 5000 });
  await setF2F(true);
  await startHuman();
  await page.waitForTimeout(900);
  await settle();
  const sF = await snap();
  ok(!!sF.f2fRect && !!sF.chip,
    '⑦b 前提：对坐的第二 HUD 在（' + JSON.stringify(sF.f2fRect) + '）且底下这条有倒计时');
  const f2fTimer = await page.evaluate(() => {
    // 第二 HUD 用的是 drawPlay 里那个 rect 对象，drawHUD 把 timerChip / timerBar 挂在它身上
    const r = G.f2fRect;
    return r ? { chip: r.timerChip, bar: r.timerBar, fill: r.timerFill } : null;
  });
  ok(!!f2fTimer && !!f2fTimer.chip && !!f2fTimer.bar,
    '⑦b ⭐⭐ 对面那条 HUD 上**同样画了倒计时**（' + JSON.stringify(f2fTimer && f2fTimer.chip) + '）'
    + ' —— ⛔ 只有一侧看得见 = 桌子对面那个人在「不知道还剩几秒」的情况下被判超时');
  ok(f2fTimer.bar.y + f2fTimer.bar.h <= sF.board.y + 0.5,
    '⑦b 对面那条也在**棋盘之上**（底 ' + Math.round(f2fTimer.bar.y + f2fTimer.bar.h)
    + ' ≤ 盘顶 ' + sF.board.y + '）');
  await shot('p2c-t5-f2f-tablet.png');
  await setF2F(false);
  await page.setViewportSize({ width: 414, height: 896 });
  await page.waitForFunction(() => GameGlobal.SW === 414 && G.L && G.L.SW === 414, null, { timeout: 5000 });

  console.log('\n⑨⑩ ⛔ 源码红线 + 变现红线');
  // ⭐ 与 e2e-p2c-t3 扫猜先那一节同一条：本 task 改动的四个 js 里 `Math.random` 必须**零出现**。
  //   ⚠ 先剥注释（本仓注释里大量出现「⛔ 不许 Math.random」这类反例文字）。
  const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  let randHits = [];
  for (const f of ['clock.js', 'state.js', 'main.js', 'render.js']) {
    const src = strip(fs.readFileSync(path.resolve(__dirname, '..', 'js', f), 'utf8'));
    if (src.indexOf('Math.random') >= 0) randHits.push(f);
  }
  ok(randHits.length === 0,
    '⑨ ⛔ 本 task 改动的四个 js 里 `Math.random` 零出现' + (randHits.length ? '：' + randHits.join(',') : '')
    + ' —— 超时手必须可重放（撤销 = 重放，DESIGN §9.3）');
  ok(strip('var x=Math.random()').indexOf('Math.random') >= 0, '⑨ 前提：这把尺子量得动');
  const ads = await page.evaluate(() => window.__ads);
  ok(ads.rewarded === 0 && ads.interstitial === 0,
    '⑩ ⛔ 整个限时流程里广告调用 = 0（激励 ' + ads.rewarded + ' / 插屏 ' + ads.interstitial + '）');

  console.log('\n⑪ 截图 + 最窄屏 · 舒适模式');
  // ⚠ 最窄的屏 + 舒适模式（§6.8 的 1.3× 字 / 1.32× 按钮）—— HOME 上多出一行之后的极限工况。
  //   ⛔ 别只在 414 上验收（P2b T7 的教训：五个 E2E 只跑一台，10 个组合里 5 个的按钮压在棋盘上）。
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction(() => GameGlobal.SW === 360 && G.L && G.L.SW === 360, null, { timeout: 5000 });
  // ⚠ 显式设成 on，⛔ 别写成「点一下」：⑥ 的儿童档预设已经把 comfort 打开过了
  //   （applyKidsPreset 会顺手开舒适模式 + 把让子推到 2）⇒ 盲点一下会把它**关掉**，
  //   这一屏就不再是「最窄屏 + 舒适模式」那个极限工况了（T4 同类教训：⛔ 别依赖上一节留下的值）。
  await setToggle('TOGGLE_COMFORT', 'comfort', true);
  await settle();
  const sm = await page.evaluate(() => ({
    rows: G.homeRows.slice(), bottom: GameGlobal.SH - GameGlobal.safeBottom
  }));
  const badRows = [];
  for (let i = 0; i + 1 < sm.rows.length; i++) {
    if (sm.rows[i].y + sm.rows[i].h > sm.rows[i + 1].y + 0.5) badRows.push(sm.rows[i].k + '↔' + sm.rows[i + 1].k);
  }
  const lastRow = sm.rows[sm.rows.length - 1];
  ok(badRows.length === 0 && lastRow.y + lastRow.h <= sm.bottom + 0.5,
    '⑪ ⭐ 360×640 · 舒适模式：HOME 多出「限时」这一行之后，' + sm.rows.length
    + ' 块仍然两两不重叠、且最后一块（' + lastRow.k + '）底边 ' + (lastRow.y + lastRow.h)
    + ' ≤ ' + sm.bottom + (badRows.length ? ' —— 压住了：' + badRows.join(' / ') : ''));
  ok(sm.rows.some(r => r.k === 'timed'), '⑪ 「限时」那一块确实排进了块栈');
  ok(await page.evaluate(() => C4Settings.get('comfort')) === true,
    '⑪ 前提：上面那一屏**真的**开着舒适模式（§6.8 的 1.3× 字 / 1.32× 按钮）');
  await shot('p2c-t5-home-small-comfort.png');
  await setToggle('TOGGLE_COMFORT', 'comfort', false);
  await page.setViewportSize({ width: 414, height: 896 });
  await page.waitForFunction(() => GameGlobal.SW === 414 && G.L && G.L.SW === 414, null, { timeout: 5000 });
  await goHome();
  await settle();
  await shot('p2c-t5-home-phone.png');
  // 恢复默认（⛔ 别把限时/让子留在设置里 —— 截图是给人看的，别让下一张图带着上一节的残留）
  await setTimed(false);
  for (let i = 0; i < 4 && await page.evaluate(() => C4Settings.get('handicap')) !== 0; i++) {
    await click('CYCLE_HANDICAP');
  }

  ok(errs.length === 0, '⑫ 全程零 pageerror / console.error' + (errs.length ? '：' + errs.join(' | ') : ''));
  console.log('\n截图（⛔ 逐张肉眼验收）：' + SHOT_DIR);
  console.log('  · p2c-t5-countdown-normal.png / -urgent.png（手机竖屏：正常 / 剩 3 秒告急）');
  console.log('  · p2c-t5-f2f-tablet.png（对坐：桌子两边各一块表）');
  console.log('  · p2c-t5-home-phone.png / -home-small-comfort.png（HOME 那一行 + 最窄屏极限）');

  await browser.close();
  srv.close();
  if (failed) { console.error('\n⛔ ' + failed + ' 条断言失败'); process.exit(1); }
  console.log('\n✅ e2e-p2c-t5 全绿（C4Clock.TURN_MS=' + Ck.TURN_MS + ' ms）');
})().catch(e => { console.error(e); process.exit(1); });
