// ════════════════════════════════════════
// e2e-p2b-t7.cjs —— P2b **Task 7** 的端到端门禁：**竖屏留白**（DESIGN §6.9）
//
// §6.9 只有一句话：「7×6 棋盘在竖屏手机上偏宽，上下留白大 ⇒ 放对手角色立绘、
//   威胁提示条、精准度条。**别浪费。**」
// ⚠⚠ 但先得认清一件**量出来的**事实（本文件 ⑥ 会现场再量一遍）：
//   **手机竖屏上棋盘是被「宽」封顶的，不是被「高」** —— 盘已经占到屏宽的 91%~93%，
//   竖向那一大块留白**变不成更大的棋盘**。⇒ 本 task 交付的不是「棋盘塞满屏幕」，而是：
//     ① 平板竖屏上那条纯浪费的死上限（BOARD_MAXW=560）删掉 ⇒ 盘真的变大（⑥ 给数值）；
//     ② 竖向余量被**显式切成 `L.reserve`（上，§6.9 立绘/威胁条留位）与 `L.tray`（下，
//        按钮/结算数据条/§6.9 精准度条）**，⛔ 按钮只许排在 tray 里；
//     ③ 于是**各视口都不出屏、不压 #controls、不压棋盘** —— 这三条改之前**全在被违反**。
//
// ⭐⭐ 本文件的判据是**几何 + 真实鼠标**，⛔ 不是「看着好多了」：
//   五个视口 × {普通 / 舒适模式} × {HOME / 对局中 / 结算} = **30 屏**，每一屏都过同一组断言。
//   ⚠ 改之前这 30 屏里有 6 屏按钮压在棋盘上、1 屏对局中就压着且掉出屏幕下沿、
//     1 屏 HOME 四块文字压成一坨 —— 全部零报错、脚本全绿，只有截图肉眼看得出。
//
// 覆盖：
//   ① **所有热区都在屏内**（含底部安全区）
//   ② ⭐⭐ **所有热区都不被 `#controls` 压住** —— 判据不是「矩形不相交」而已，还要
//      `document.elementFromPoint(热区中心)` **真的是 canvas**（solitaire 实踩：HUD 画在
//      safeTop 之上被 #controls 盖住，唯一入口点不动，只有真实鼠标 E2E 抓得出来）
//   ③ ⭐⭐ **按钮不压棋盘**（赢局那条连线必须一直看得见，§6.3）
//   ④ HUD 卡片本身也不与 #controls 相交（P2a 那条，这里跨五个视口重跑）
//   ⑤ ⭐ **HOME 的块栈两两不重叠**（G.homeRows）—— 360×640 + 舒适模式改之前就是压成一坨
//   ⑥ ⭐⭐ **棋盘尺寸新旧对照**：用**改之前那份公式**（本文件里留了一份历史快照）对同一个
//      视口现算一遍，把两个 cell 摆在一起。⛔ 不是硬编码的历史数字，⛔ 也不是「看着大了」
//   ⑦ ⭐ **改之前那份公式真的会压盘/出屏** —— 用同一份历史快照把旧版的按钮位置算出来，
//      逐视口证明「新版为什么必须这么改」，也让 ⑥ 里横屏变小的那一格有个交代
//   ⑧ ⭐ **真实鼠标**：结算屏的［再来一局］在每个视口都点得动（真的开了新局）
//   ⑨ tray 不变量：`L.tray.h >= C4Render.TRAY_MIN` 且盘宽 <= SW - 2*MARGIN
//
// ⚠ E2E（起浏览器）⇒ 单独挂 script（进 `npm run test:c4:p2b`），⛔ 不进 `npm test`。
// ⚠ 截图落 C:\tmp\connect4-p2b\（用 --shots=<dir> 覆盖），⛔ 不进仓库。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8337;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' };
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8)
  || path.join('C:', 'tmp', 'connect4-p2b');

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

// ─────────── 视口清单 ───────────
// ⚠ 三台手机 + 平板竖 + 平板横。⛔ 别只留 414×896 那一台（本仓五个 E2E 一直只跑它，
//   而 T7 抓到的 8 个缺陷里有 7 个在**别的**视口上）。
const VPS = [
  { n: '360x640',  w: 360,  h: 640,  tag: '小屏安卓', portrait: true },
  { n: '390x844',  w: 390,  h: 844,  tag: 'iPhone 14', portrait: true },
  { n: '414x896',  w: 414,  h: 896,  tag: 'iPhone 11（本仓其它 E2E 的基准机）', portrait: true },
  { n: '768x1024', w: 768,  h: 1024, tag: '平板竖屏', portrait: true },
  { n: '1024x768', w: 1024, h: 768,  tag: '平板横屏', portrait: false }
];

// ═══ ⛔ 改之前那份 layout 公式的**历史快照**（⚠ 不是被测代码，只当可比基线）═══
//   BOARD_MAXW = 560 的死上限 + 盘下**不预留**任何净空，按钮由 main.js「从盘底往下 16，
//   装不下就往上顶」。⑥⑦ 用它对同一个视口现算，⇒ 收益与「为什么非改不可」都是**算出来的**。
function oldLayout(SW, SH, st, sb, ctrlH) {
  const top0 = st + ctrlH + 8;
  const availW = Math.min(SW - 28, 560);
  const availH = SH - sb - 14 - top0 - 54 - 10;
  const cell = Math.max(18, Math.floor(Math.min(availW / 7.28, availH / 7.33)));
  const pad = Math.max(3, Math.round(cell * 0.14));
  const boardW = 7 * cell + pad * 2, boardH = 6 * cell + pad * 2;
  const dropH = Math.round(cell * 1.05);
  const belowHud = top0 + 54 + 10;
  const slack = Math.max(0, (SH - sb - 14 - belowHud) - (dropH + boardH));
  const boardY = Math.round(belowHud + slack * 0.38) + dropH;
  return { cell: cell, boardW: boardW, boardH: boardH, boardY: boardY, bottom: boardY + boardH };
}
/** 旧版按钮块排完之后的 y（main.js 改之前那三行：ry = 盘底+16，超了就 `ry = maxY` 往上顶）。 */
function oldBlock(SH, sb, boardBottom, blockH) {
  const ry = Math.min(boardBottom + 16, SH - sb - 12 - blockH);
  return { y: ry, bottom: ry + blockH };
}

// 斜线四连（t5/t6 用的同一条夹具）：⛔ 手搓掩码不算数，一律 bitboard 重放自证。
const DIAG = [0, 1, 1, 2, 3, 2, 2, 3, 4, 3];
const DIAG_WIN = 3;

(async () => {
  if (R.terminal(B.fromMoves(DIAG)) !== null) throw new Error('夹具必须非终局');
  if (R.terminal(B.fromMoves(DIAG.concat([DIAG_WIN]))) === null) throw new Error('夹具最后一手必须终局');

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();

  const shots = [];
  // ⭐ 逐视口的实测表，最后打一张总表出来（人要能一眼比出改前 / 改后）
  const table = [];

  for (const vp of VPS) {
    for (const comfort of [false, true]) {
      const label = vp.n + (comfort ? ' · 舒适模式' : '');
      console.log('\n══════ ' + label + '（' + vp.tag + '）══════');
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
      page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
      await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
      await page.waitForFunction(
        () => window.G && window.C4Render && window.C4Settings
           && typeof GameGlobal !== 'undefined' && GameGlobal.SW > 0
           && typeof hitAreas !== 'undefined' && hitAreas.length > 0,
        null, { timeout: 10000 });
      await page.waitForTimeout(120);

      const pt = async (action, key, val) => {
        const r = await page.evaluate(a => {
          for (let i = hitAreas.length - 1; i >= 0; i--) {
            const h = hitAreas[i];
            if (h.action !== a.action) continue;
            if (a.key !== null && h.data[a.key] !== a.val) continue;
            return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
          }
          return null;
        }, { action, key: key === undefined ? null : key, val: val === undefined ? null : val });
        if (!r) throw new Error('[' + label + '] 找不到热区 action=' + action);
        return { x: Math.round(r.x), y: Math.round(r.y) };
      };
      const clickAt = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };

      // ⚠ 一律**真实鼠标**点那一行设置（⛔ 不许 C4Settings.set 抄近路：那样测的就不是 UI 了）
      if (comfort) {
        await clickAt(await pt('TOGGLE_COMFORT'));
        if (await page.evaluate(() => C4Settings.get('comfort')) !== true) throw new Error('点不到 comfort');
      }
      // 减弱动态开着 ⇒ 落子/赢局不放动画，门禁跑得快。⚠ 版面与它无关（layout 不读这个开关）。
      await clickAt(await pt('CYCLE_MOTION'));      // auto → on
      if (await page.evaluate(() => C4Settings.get('reduceMotion')) !== 'on') throw new Error('点不到 reduceMotion=on');

      // ⭐⭐ 一屏的全部几何判据。⚠ 每一条都逐个热区查，⛔ 别只查「最下面那一个」。
      const probe = () => page.evaluate(() => {
        const L = G.L;
        const cr = document.getElementById('controls').getBoundingClientRect();
        const ctl = { x: cr.x, y: cr.y, w: cr.width, h: cr.height };
        const hit = h => ({ a: h.action, x: h.x, y: h.y, w: h.w, h: h.h,
                            // ⭐ 「点得动」的唯一硬判据：热区中心那个像素上，最上层的 DOM
                            //   必须是 canvas 本身（⛔ 不是 #controls / 语言菜单）
                            top: (document.elementFromPoint(
                                    Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2)) || {}).id || null });
        return {
          phase: G.phase,
          SW: GameGlobal.SW, SH: GameGlobal.SH,
          safeTop: GameGlobal.safeTop, safeBottom: GameGlobal.safeBottom, ctrlH: GameGlobal.ctrlH,
          ctl: ctl, canvasId: CFG.canvasId,
          hits: hitAreas.map(hit),
          homeRows: (G.homeRows || []).slice(),
          L: { cell: L.cell, boardX: L.boardX, boardY: L.boardY, boardW: L.boardW, boardH: L.boardH,
               hud: L.hud, drop: L.drop, reserve: L.reserve, tray: L.tray, bottomLimit: L.bottomLimit },
          TRAY_MIN: C4Render.TRAY_MIN, MARGIN: C4Render.MARGIN
        };
      });

      const isect = (a, b) => !(a.x >= b.x + b.w || a.x + a.w <= b.x || a.y >= b.y + b.h || a.y + a.h <= b.y);

      /**
       * ⭐⭐ 每个 CSS 像素行「有没有画东西」。⚠ 这一条是 ⑤ 的**必需补充**：
       *   ⑤ 比的是每块**自报**的 {y,h}，⛔ 一个块画得比自报的大（正是改之前那个 bug 的形态：
       *   高度写死常数、字号却跟着舒适模式 ×1.3）它**完全看不见** —— 那就又是一次
       *   「加了断言但抓不住」。这里量的是**真画出来的墨迹**。
       * ⚠ 底色是竖向渐变 ⇒ 用**同一行最左侧那个像素**当基准（同一行底色恒定），
       *   阈值 6：设置行的白卡（gray≈250 vs 底 ≈240）也要算成墨迹。
       */
      const inkRows = () => page.evaluate(() => {
        const cv = document.getElementById(CFG.canvasId);
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const WP = cv.width, dpr = cv.width / GameGlobal.SW;
        const GRAY = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const out = [];
        for (let y = 0; y < GameGlobal.SH; y++) {
          const py = Math.min(cv.height - 1, Math.round(y * dpr));
          const bg = GRAY(py * WP * 4);
          let ink = 0;
          for (let x = 2; x < WP; x++) { if (Math.abs(GRAY((py * WP + x) * 4) - bg) > 6 && ++ink > 3) break; }
          out.push(ink > 3);
        }
        return out;
      });

      /** 一屏的全套断言。screen = 'HOME' | 'PLAY' | 'OVER' */
      const check = async screen => {
        const P = await probe();
        const tag = '[' + label + ' · ' + screen + '] ';
        const bottom = P.SH - P.safeBottom;

        // ① 全部热区在屏内
        const outside = P.hits.filter(h => h.x < 0 || h.y < 0 || h.x + h.w > P.SW + 0.5 || h.y + h.h > bottom + 0.5);
        ok(outside.length === 0, tag + '① ' + P.hits.length + ' 个热区**全在屏内**'
          + (outside.length ? ' —— 出屏：' + JSON.stringify(outside.slice(0, 3)) : ''));

        // ② ⭐⭐ 没有热区被 #controls 压住（矩形 + elementFromPoint 双判据）
        const under = P.hits.filter(h => isect(h, P.ctl));
        const blocked = P.hits.filter(h => h.top !== P.canvasId);
        ok(under.length === 0 && blocked.length === 0,
          tag + '② ⭐⭐ 没有热区落在 #controls 底下（相交 ' + under.length + ' 个、'
          + 'elementFromPoint 不是 canvas 的 ' + blocked.length + ' 个）'
          + (blocked.length ? ' —— ' + JSON.stringify(blocked.slice(0, 2)) : ''));

        if (screen === 'HOME') {
          // ⑤ ⭐ 块栈两两不重叠（改之前 360×640 + 舒适模式这里四块压成一坨）
          const rows = P.homeRows;
          ok(rows.length >= 10, tag + '⑤ HOME 排了 ' + rows.length + ' 块（G.homeRows）');
          const bad = [];
          for (let i = 0; i + 1 < rows.length; i++) {
            if (rows[i].y + rows[i].h > rows[i + 1].y + 0.5) bad.push(rows[i].k + '↔' + rows[i + 1].k);
          }
          ok(bad.length === 0, tag + '⑤ ⭐ 相邻块**两两不重叠**' + (bad.length ? ' —— 压住了：' + bad.join(' / ') : ''));
          ok(rows[0].y >= P.ctl.y + P.ctl.h,
            tag + '⑤ 第一块（' + rows[0].k + ' y=' + rows[0].y + '）在 #controls（底 '
            + Math.round(P.ctl.y + P.ctl.h) + '）之下');
          const last = rows[rows.length - 1];
          ok(last.y + last.h <= bottom + 0.5,
            tag + '⑤ 最后一块（' + last.k + '）底边 ' + (last.y + last.h) + ' <= ' + bottom);

          // ⑤b ⭐⭐ 像素判据：每一块**真画出来的墨迹**必须留在它自报的框里（±2 px）。
          //   ⚠ 取样窗只到与邻块的**中线**为止 ⇒ 越界画进邻居的地盘就会被算进来 ⇒ 红。
          const ink = await inkRows();
          const over = [];
          for (let i = 0; i < rows.length; i++) {
            const b = rows[i];
            const lo = i === 0 ? Math.max(0, b.y - 8)
                               : Math.floor((rows[i - 1].y + rows[i - 1].h + b.y) / 2);
            const hi = i === rows.length - 1 ? Math.min(P.SH - 1, b.y + b.h + 8)
                                             : Math.floor((b.y + b.h + rows[i + 1].y) / 2);
            let t = -1, bt = -1;
            for (let y = lo; y <= hi; y++) if (ink[y]) { if (t < 0) t = y; bt = y; }
            if (t < 0) continue;                       // 空块（没有引擎提示时 note 就是空的）
            if (t < b.y - 2 || bt > b.y + b.h + 2) over.push(b.k + ' 墨迹 ' + t + '..' + bt + ' 越出 ' + b.y + '..' + (b.y + b.h));
          }
          ok(over.length === 0,
            tag + '⑤b ⭐⭐ **像素上**每块画出来的东西都留在自己框里' + (over.length ? ' —— ' + over.join(' / ') : ''));

          // ⑤c ⭐ 留白**分配掉了**：内容不许全堆在顶上、下半屏空着（P2a 点名的那条）。
          //   ⚠ 用**自报的**栈上下沿（末尾的 note 块常常是空的，用墨迹会把它算成留白）。
          const topGap = rows[0].y - P.L.hud.y;
          const botGap = bottom - 14 - (last.y + last.h);
          ok(botGap <= topGap * 1.8 + 30,
            tag + '⑤c ⭐ HOME 竖向留白是**分配过的**：上 ' + topGap + ' px / 下 ' + Math.round(botGap)
            + ' px（判据 下 <= 上×1.8+30）—— ⛔ 改之前是「贴顶排完、下半屏空 220 px」');
        } else {
          const board = { x: P.L.boardX, y: P.L.boardY, w: P.L.boardW, h: P.L.boardH };
          // ③ ⭐⭐ 按钮不压棋盘（列热区 'COL' 本来就该盖在盘上，排除）
          const onBoard = P.hits.filter(h => h.a !== 'COL' && isect(h, board));
          ok(onBoard.length === 0,
            tag + '③ ⭐⭐ **按钮一个都不压棋盘**（盘 y ' + board.y + '..' + (board.y + board.h) + '）'
            + (onBoard.length ? ' —— 压着：' + JSON.stringify(onBoard.map(h => h.a + '@' + Math.round(h.y))) : ''));
          // ④ HUD 卡片不与 #controls 相交
          ok(!isect(P.L.hud, P.ctl),
            tag + '④ HUD 卡片（y ' + P.L.hud.y + '..' + (P.L.hud.y + P.L.hud.h) + '）不与 #controls（底 '
            + Math.round(P.ctl.y + P.ctl.h) + '）相交');
          // ⑨ tray 不变量
          ok(P.L.tray.h >= P.TRAY_MIN,
            tag + '⑨ 盘下净空 tray.h=' + P.L.tray.h + ' >= TRAY_MIN=' + P.TRAY_MIN);
          ok(P.L.boardW <= P.SW - P.MARGIN * 2 + 0.5,
            tag + '⑨ 盘宽 ' + P.L.boardW + ' <= SW-2*MARGIN=' + (P.SW - P.MARGIN * 2));
          // 盘顶不越 HUD、盘底不越 tray 底
          ok(P.L.drop.y >= P.L.hud.y + P.L.hud.h && P.L.boardY + P.L.boardH <= P.L.bottomLimit + 0.5,
            tag + '⑨ 盘在 [HUD 底, bottomLimit] 之内（drop.y=' + P.L.drop.y + '，盘底 '
            + (P.L.boardY + P.L.boardH) + ' <= ' + P.L.bottomLimit + '）');
        }
        return P;
      };

      const shot = async n => { await page.screenshot({ path: path.join(SHOT_DIR, n) }); shots.push(n); return n; };
      const base = 'p2b-t7-' + vp.n + (comfort ? '-comfort' : '');

      // ─── HOME ───
      const Phome = await check('HOME');
      await shot(base + '-1home.png');

      // ─── 对局中 ───
      await clickAt(await pt('PLAY_HUMAN'));
      await page.waitForFunction(() => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 4000 });
      for (const c of DIAG) {
        const before = await page.evaluate(() => G.g.moves.length);
        await clickAt(await pt('COL', 'col', c));
        await page.waitForFunction(k => window.G.g.moves.length > k, before, { timeout: 6000 });
      }
      await page.mouse.move(3, 3);
      await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
      const Pplay = await check('PLAY');
      await shot(base + '-2play.png');

      // ─── 结算 ───
      await clickAt(await pt('COL', 'col', DIAG_WIN));
      await page.waitForFunction(() => G.phase === 'OVER', null, { timeout: 6000 });
      await page.mouse.move(3, 3);
      await page.evaluate(() => { G.hoverCol = -1; G.holdCol = -1; renderAll(); });
      const Pover = await check('OVER');
      await shot(base + '-3over.png');

      // ⑧ ⭐ 真实鼠标点［再来一局］—— ①②③ 全绿但按钮实际点不动的话，这一条才抓得到
      await clickAt(await pt('AGAIN'));
      const restarted = await page.waitForFunction(
        () => G.phase === 'PLAYING' && G.g.moves.length === 0, null, { timeout: 4000 }
      ).then(() => true, () => false);
      ok(restarted, '[' + label + '] ⑧ ⭐ **真实鼠标**点结算屏的［再来一局］真的开了新局');

      ok(errs.length === 0, '[' + label + '] 全程零 console error / pageerror'
        + (errs.length ? ' —— ' + errs[0] : ''));

      if (!comfort) {
        const O = oldLayout(Pplay.SW, Pplay.SH, Pplay.safeTop, Pplay.safeBottom, Pplay.ctrlH);
        table.push({ vp: vp, P: Pplay, O: O, over: Pover, home: Phome });
      }
      await page.close();
    }
  }

  await browser.close();
  srv.close();

  // ═══════════ ⑥⑦ 棋盘尺寸新旧对照 + 「旧版为什么非改不可」 ═══════════
  console.log('\n══════ ⑥ ⭐⭐ 棋盘尺寸：改前公式 vs 改后（同一视口现算，⛔ 不是硬编码的历史数字）══════');
  console.log('  视口        改前 cell / 盘     改后 cell / 盘        盘宽占屏宽');
  for (const t of table) {
    const P = t.P.L, O = t.O;
    console.log('  ' + t.vp.n.padEnd(11)
      + (O.cell + ' / ' + O.boardW + '×' + O.boardH).padEnd(19)
      + (P.cell + ' / ' + P.boardW + '×' + P.boardH).padEnd(22)
      + (P.boardW / t.P.SW * 100).toFixed(1) + '%   ('
      + (P.cell >= O.cell ? '+' : '') + ((P.cell / O.cell - 1) * 100).toFixed(1) + '%)');
  }

  // ⭐ 手机竖屏：盘**贴着宽度上限** ⇒ 「把上下留白让给棋盘」这条路在手机上不存在
  for (const t of table.filter(x => x.vp.portrait && x.vp.w < 500)) {
    const P = t.P.L;
    ok(P.boardW >= t.P.SW - t.P.MARGIN * 2 - 7 * 1.0,
      '⑥ ' + t.vp.n + ' ⭐ 棋盘**已经贴着宽度上限**（盘宽 ' + P.boardW + '，可用 '
      + (t.P.SW - t.P.MARGIN * 2) + '，占屏宽 ' + (P.boardW / t.P.SW * 100).toFixed(1)
      + '%）⇒ 竖向留白**变不成更大的棋盘**，只能被分配');
    ok(P.cell >= t.O.cell,
      '⑥ ' + t.vp.n + ' 改动没让手机上的棋盘变小（cell ' + t.O.cell + ' → ' + P.cell + '）');
  }
  // ⭐⭐ 平板竖屏：删掉 BOARD_MAXW=560 那条死上限之后盘真的变大
  const tab = table.find(t => t.vp.n === '768x1024');
  ok(tab.P.L.cell >= tab.O.cell * 1.2,
    '⑥ ⭐⭐ 768×1024（平板竖屏）**棋盘真的变大了**：cell ' + tab.O.cell + ' → ' + tab.P.L.cell
    + '（+' + ((tab.P.L.cell / tab.O.cell - 1) * 100).toFixed(0) + '%），盘 '
    + tab.O.boardW + '×' + tab.O.boardH + ' → ' + tab.P.L.boardW + '×' + tab.P.L.boardH
    + '（面积 ×' + ((tab.P.L.boardW * tab.P.L.boardH) / (tab.O.boardW * tab.O.boardH)).toFixed(2)
    + '）—— 改之前那 560 的死上限让它白白空着 '
    + (tab.O.boardY - (tab.P.safeTop + tab.P.ctrlH + 8 + 54 + 10)) + ' px');

  // ⚠ 舒适模式（§6.8）把行高 ×1.32 ⇒ 两种都要算：五视口 × {普通, 舒适} = 10 个组合。
  console.log('\n══════ ⑦ ⭐ 改前那份公式在这些视口上会怎样（= 为什么非改不可）══════');
  let oldBad = 0, oldTotal = 0;
  for (const t of table) {
    for (const cm of [false, true]) {
      const O = t.O, k = cm ? 1.32 : 1;
      const rowH = Math.round(46 * k), statH = Math.round(40 * k);
      // 对局中：一行按钮；结算：数据条 + 12 + 主行 + 12 + 撤销/菜单行
      const play = oldBlock(t.P.SH, t.P.safeBottom, O.bottom, rowH);
      const over = oldBlock(t.P.SH, t.P.safeBottom, O.bottom, statH + 12 + rowH + 12 + rowH);
      const hitPlay = play.y < O.bottom, hitOver = over.y < O.bottom;
      const offPlay = play.bottom > t.P.SH - t.P.safeBottom;
      oldTotal++;
      if (hitPlay || hitOver || offPlay) oldBad++;
      console.log('  ' + (t.vp.n + (cm ? '·舒适' : '')).padEnd(16) + '旧盘底 ' + String(O.bottom).padEnd(6)
        + '对局中按钮 y=' + String(play.y).padEnd(6) + (hitPlay ? '⛔压盘 ' : '      ')
        + (offPlay ? '⛔出屏 ' : '      ')
        + '结算块 y=' + String(over.y).padEnd(6) + (hitOver ? '⛔压盘' : ''));
    }
  }
  ok(oldBad >= 5,
    '⑦ ⭐ 改前那份公式在 ' + oldBad + '/' + oldTotal + ' 个（视口 × 舒适模式）组合上会**压盘或出屏**'
    + ' —— 这也是「棋盘在横屏反而小了一点」那一格的交代：旧的那个大盘是**压着按钮**换来的');

  console.log('\n截图（⛔ 逐张肉眼验收，' + shots.length + ' 张）：' + SHOT_DIR);
  console.log('  · p2b-t7-<视口>[-comfort]-1home / -2play / -3over.png');
  console.log('  · ⭐⭐ 最该看的一张：p2b-t7-360x640-comfort-1home.png'
    + '（小屏 + 舒适模式 —— 改之前标题/棋子图示/Opponent/Level 三四块压成一坨）');
  console.log('  · ⭐ p2b-t7-1024x768-2play.png（改之前按钮压着盘底且掉出屏幕下沿）');
  console.log('  · ⭐ p2b-t7-768x1024-2play.png（改之前盘被 560 的死上限钉住，上方空 200px）');
  console.log(failed === 0 ? '\ne2e-p2b-t7: 全部通过' : '\ne2e-p2b-t7: ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
