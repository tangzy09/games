// ════════════════════════════════════════
// main.js —— 主循环（P2a Task 6）。把前五块（state / render / engine-client / input 三件套 /
// worker）接成**一局真的能玩的四子棋**：状态机 + 悬停预览 + 人机 + 同机双人 + 撤销 + 再来一局。
//
// ⭐ 三条承重的决定（每一条都有一个具体的、静默的失败模式在背后）：
//
// ① **落子只走 onHoldEnd，⛔ dispatch 里的 'COL' 是空分支。**
//    engine/input.js:51-56 白纸黑字：快点一下 `onHoldEnd` 与 `onAction` **都会发**。
//    两边各落一次 = 一次点击落两子（而且只在「快点」时复现，按住两秒反而正常）——
//    那是最像玄学的一类 bug。⇒ 列的落子**唯一入口**是 onHoldEnd，'COL' 分支留着只为
//    「热区确实注册了」这件事有个名字。
//    ⚠ 取消（指针离开画布 / touchcancel）发的是 `onHoldEnd(-1, -1)` ⇒ colAt 落空 ⇒
//      **清预览而不落子**，这正是它给 (-1,-1) 而不是不发的理由。
//
// ② **「AI 思考中」是独立标志 `G.thinking`，⛔ 不是一个 phase。**
//    做成 phase 的话，思考期间玩家点［撤销］［菜单］［再来一局］全被吞（状态机里没有那些
//    转移）——玩家的反应是再点几下，然后觉得游戏卡死了。现在思考只挡「落子」这一件事
//    （而且那时本来就不是他的回合），其余按钮一律照常。
//
// ③ ⭐⭐ **轻松档（1-5 级）不许被共用的 loading 态拖住**（DESIGN §9.2 的产品判断 / §11b 第 3 条）。
//    它们根本不调求解器（实测中位 0.0022 ms），一转菊花就会让「轻松」显得比顶档还重。
//    判据是 `ConnectAI.usesSolver(moves, tier)` —— 它自己不搜，恒微秒级。
//    ⚠ 但它**判不出**「开局库没装 ⇒ 这一次会慢得离谱」（n=9 无库实测 4-5 秒，装库后 0.5 ms，
//      10,171×；空盘那一档是几十分钟）。那一层必须自己查 **`EngineClient.bookReady()`**。
//    ⛔⛔ 主线程上的 `Book.status()` 是**假的**：真正的 install 发生在 Worker 里，
//      主线程这份 book.js 只是 ai.js 的依赖，状态恒 'none'。查它 = 永远以为没库。
//      唯一入口是 EngineClient.bookReady()（它转述的是 Worker 那一份）。
//
// ⚠ 主线程为什么会加载 solver/book（index.html 原注释说「不加载」，那条已过期）：
//   `state.js` 要 `ConnectAI.paramsDigest()`，UI 要 `ConnectAI.usesSolver()` ⇒ ai.js 必须在
//   主线程；而 ai.js 顶层吃 Bitboard / RulesClassic / Solver / 裸标识符 PRNG，book.js 是 ai→solver
//   的同层依赖。⇒ 六个模块照 tests/test-browser-globals.js 的 LOAD_ORDER 全量加载。
//   ⛔ 但**一行搜索都不许在主线程跑**：`Solver.solve` / `ConnectAI.decide` / `ConnectAI.aiMove`
//     在本文件里一次都不出现，AI 落子一律经 EngineClient → Worker。
//
// ⚠ G 用 var 不用 const —— 顶层 const 不挂 window，E2E/调试要 window.G（snake 实踩）。
// ════════════════════════════════════════
var G = {
  phase: 'HOME',      // HOME → PLAYING → OVER
  g: null,            // C4State 的对局对象（唯一真值，⛔ 别在 G 上再存一份盘面）
  tier: 3,            // 人机局选中的档位（HOME 上可改）
  gameNo: 0,          // ⭐ 交替先手全靠它（state.js 的 newGame 管，⛔ 别在这覆盖）
  thinking: false,    // 见文件头 ②
  spin: 0,            // 「思考中」的三点动画相位
  aiSeq: 0,           // 每次撤销/换局 +1 ⇒ 在飞的 AI 结果作废（⛔ 别拿旧局面的答案画这一手）
  hoverCol: -1,       // 悬停预览的列（-1 = 无）
  holdCol: -1,        // 这次按下是从哪一列起的；<0 = 没按在盘上 ⇒ 松手不落子
  notice: '',         // 诚实措辞（求解器不可用 / 开局库准备中），⛔ 绝不谎报
  result: null,       // { t, winner, line }
  lastAiMs: 0,        // 实测用：上一次 AI 落子耗时
  lastAiHeavy: false, // 实测用：上一次是不是真的转了菊花
  L: null,            // 本帧的 layout（输入回调用它算列号，⛔ 别各算各的）
  // ── 落子动画（P2b T2）。⭐ rafId 是**可检查的状态**：没有动画在跑时它必须是 null
  //    （⛔ 空转烧电是这个 rAF 唯一的失败模式，而它不报错 ⇒ 必须能被 E2E 问到）。
  rafId: null,
  fxLast: 0,          // 上一帧的时间戳（ms，与 rAF 的 ts 同一时基）
  // ── 结算节奏（P2b T3 · DESIGN §6.5）──
  // ⭐ overReady = 「庆祝播完了，主 CTA［再来一局］进入焦点态」。
  //   ⛔ 它**不是**一把输入锁：结算的按钮从终局第一帧就注册了热区、全程点得动
  //     （本仓铁律，e2e-p2b 用真实鼠标钉死）。它只决定「那一刻画面上谁最显眼」。
  overReady: false,
  overAt: 0,          // 实测用：判出终局的时刻（ms）
  readyAt: 0          // 实测用：主 CTA 拿到焦点态的时刻 ⇒ 两者之差就是 §6.5 那 5 秒的量法
};

// ════════ 小工具 ════════

function curLayout() { return C4Render.layout(GameGlobal.SW, GameGlobal.SH); }

/** 单行文字**缩到装得下**（canvas 的 fillText 不换行也不截断，德/俄膨胀会直接压到隔壁）。 */
function fitTxt(s, cx, cy, maxW, color, weight, size) {
  let px = size;
  ctx.font = weight + ' ' + px + 'px sans-serif';
  while (px > 10 && ctx.measureText(clean(s)).width > maxW) {
    px -= 1;
    ctx.font = weight + ' ' + px + 'px sans-serif';
  }
  txt(s, cx, cy, color, weight + ' ' + px + 'px sans-serif');
}

function btn(x, y, w, h, label, action, data, style) {
  style = style || {};
  const on = !style.disabled;
  fillRR(x, y, w, h, 12, on ? (style.bg || C4Render.PAL.accent) : 'rgba(97,119,111,0.26)');
  // ⭐ 焦点态（DESIGN §6.5：庆祝完，主按钮**直接是**［再来一局］）：外扩一圈发光描边。
  //   ⚠ 几何**不变**（⛔ 别用「变大一点」表达焦点：那会在结算那一刻把整排按钮挤得跳一下）。
  if (style.focus) {
    ctx.save();
    ctx.shadowColor = C4Render.PAL.glow; ctx.shadowBlur = 16;
    strokeRR(x - 3, y - 3, w + 6, h + 6, 15, C4Render.PAL.glow, 2.5);
    ctx.restore();
  }
  if (style.outline) strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, 12, style.outline, 1.5);
  fitTxt(label, x + w / 2, y + h / 2, w - 16,
         on ? (style.fg || '#fff') : 'rgba(38,74,61,0.45)', style.weight || 'bold', style.size || 16);
  if (on) addHit(x, y, w, h, action, data || {});
}

/** 赢家的那四格（rules-classic 只回「谁赢了」，不回连线；drawBoard 的 winLine 要它）。 */
const WIN_DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function findWinLine(bd, w) {
  const CW = C4Render.W, CH = C4Render.H;
  for (let c = 0; c < CW; c++) for (let r = 0; r < CH; r++) for (const d of WIN_DIRS) {
    const cells = [0, 1, 2, 3].map(k => ({ c: c + d[0] * k, r: r + d[1] * k }));
    if (cells.every(p => p.c >= 0 && p.c < CW && p.r >= 0 && p.r < CH
                         && C4Render.cellOwner(bd, p.c, p.r) === w)) return cells;
  }
  return null;   // ⚠ 找不到 = 掩码与 winner 对不上；画面上就是「赢了但没连线」，不至于白屏
}

/** ⭐ 「第几号玩家」只在这里定义一次：Player 1 永远坐 humanPlayer 这个位。
 *  同机双人局里 humanFirst 逐局翻转 ⇒ Player 1 手里的棋子（六边形/圆环）也跟着换，
 *  这正是 DESIGN §1.1 第 2 条要的「每局自动交替先手」。 */
function seatName(g, player) {
  return T(player === C4State.humanPlayer(g) ? 'game.p1' : 'game.p2');
}
/** 这一局谁先手（先手恒 = 棋子 0 = 六边形）。 */
function firstSeatName(g) { return seatName(g, 0); }

// ════════ 「思考中」的可见反馈 ════════
// ⚠ 只有真的会搜的那一手才开（见文件头 ③）。计时器**必须**在关的时候清掉，
//   否则一局结束后它还在后台每 220 ms 重绘整屏。
let _spinTimer = null;
function setThinking(on) {
  if (G.thinking === on) return;
  G.thinking = on;
  if (_spinTimer) { clearInterval(_spinTimer); _spinTimer = null; }
  if (on) { G.spin = 0; _spinTimer = setInterval(() => { G.spin = (G.spin + 1) % 3; renderAll(); }, 220); }
  // ⭐ **翻标志就必须重画**（截图实锤：只翻不画的话，「思考中」要等三点动画的第一次
  //   tick（220 ms）才出现——短的那些手根本来不及显示，等于没有反馈）。
  //   ⛔ 别指望调用方记得跟一句 renderAll：漏了不报错，只是反馈静默消失。
  renderAll();
}

// ════════ 落子动画（P2b Task 2 · DESIGN §6.3）════════
// 一局落 20 次子、一天几百次 —— **这一个动作的手感就是这个游戏的手感**。
// 曲线全在 js/fx.js（闭式解、node 里逐位可测），这里只做三件事：驱动、停下、发声。
//
// ⛔⛔ 本节最重要的一条：**动画期间不许锁输入。**
//   `interactive()` 里**没有** C4Fx 的影子，这是故意的（casual-game-meta §6 铁律；
//   solitaire 实踩：发牌动画 1 秒内点击全被吞，快手玩家的反馈是「点不动」）。
//   落子动画只是表现，玩家想在上一枚还在飞的时候落下一枚 ⇒ **就得让他落**
//   （C4Fx 支持多枚同时在飞正是为这条）。⇒ e2e-p2b.cjs 用真实鼠标钉死了它。
//
// ⚠ T6（§6.8 减弱动态）将来要门控的就是 `startDropFx` 里那一次 `C4Fx.start`：
//   reduceMotion 打开时**跳过 start**，直接走 `onPieceLanded`（音 + 震动 + 静态帧）——
//   下面那条 `if (id == null)` 的 fail-safe 分支就是它现成的入口。

const MAX_FRAME_DELTA = 100;   // 切后台回来的第一帧 ts 是真实墙钟 ⇒ 夹住，最坏只是慢放一点

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** 从悬停带到落点的真实距离（**格**，不是像素——转屏时 cell 会变）。 */
function fallCells(L, col, row) {
  if (!L || !L.cell) return null;
  const d = (L.center(col, row).y - (L.drop.y + L.drop.h / 2)) / L.cell;
  return d > 0 ? d : null;
}

/** 落定的那一瞬：⭐ 音随深度变调（land0 = 最底行 = 最低音）+ 震动。 */
function onPieceLanded(row) {
  const r = Math.max(0, Math.min(C4Render.H - 1, row | 0));
  Sfx.play('land' + r);
  // 掉得深 = 砸得重：震动跟着深度分两档（与音高的梯子同一个意思，触觉上也读得出来）。
  // ⚠ Haptics 自己吃 AudioState.sfxOn 的门 ⇒ 🔊 关掉时震动一起停（engine/audio.js 的约定）。
  if (r <= 1) Haptics.medium(); else Haptics.light();
}

// ════════ 赢局那 3 秒 + 结算节奏（P2b Task 3 · DESIGN §6.3 最后一段 + §6.5）════════
// §6.3：「⭐ 赢的那一刻：四枚棋子发光、**画出那条连线**、其余变暗、时间放慢半秒。
//        玩家必须看清自己赢在哪 —— 第一局赢的那 3 秒是 D1 的杠杆。」
// §6.5：「⚠ 别照抄 solitaire 的结算 …… 庆祝 ~1.5 s → 主按钮直接是［再来一局］的焦点态。」
//
// 曲线全在 js/fx.js（闭式、node 里逐位可测），这里同样只做三件事：起、发声、收尾。
// ⚠ T6（减弱动态）要门控的是 `startWinFx` 里那一次 `C4Fx.start('win')`：关掉时走
//   `id == null` 那条 fail-safe —— 立刻出声 + 立刻 markOverReady + 画静态赢局帧（render 的
//   lineProg/lit 默认就是「整条 + 全亮」）。⛔ 别再加第二个开关。

let _overTimer = null;
function clearOverTimer() { if (_overTimer) { clearTimeout(_overTimer); _overTimer = null; } }

/** ⭐ 结算音。⚠ §6.6「让输不疼」：输局**只有**这一声（lose 本身是刻意温和的），
 *  ⛔ 不加震动、不加红闪、不加「你输了」的大字 —— 那些都是惩罚性反馈。 */
function playResultSfx() {
  const g = G.g, res = G.result;
  if (!g || !res || res.winner === null) return;   // 平局：不响（⛔ 也别拿 lose 顶替，平局不是输）
  const lost = g.mode === 'ai' && res.winner !== C4State.humanPlayer(g);
  Sfx.play(lost ? 'lose' : 'win');
  if (!lost) Haptics.medium();
}

/** 庆祝结束 ⇒ 主 CTA 进入焦点态。⚠ 幂等：rAF 与兜底计时器都会调到它。 */
function markOverReady() {
  clearOverTimer();
  if (G.overReady || G.phase !== 'OVER') return;
  G.overReady = true;
  G.readyAt = nowMs();
  renderAll();
}

function startWinFx() {
  clearOverTimer();
  G.overReady = false;
  G.overAt = nowMs();
  const line = G.result && G.result.line;
  // 平局没有连线可画 ⇒ ⛔ 别硬凑一段庆祝，直接进结算（§6.5：快）
  if (!line) { markOverReady(); return; }
  const id = C4Fx.start('win', { line: line });
  if (id == null) { playResultSfx(); markOverReady(); return; }   // ⚠ 也是 T6 减弱动态的入口
  // ⛔ 结算节奏必须有**上界**：页面切后台时 rAF 会被节流甚至停掉，'winend' 就永远不来，
  //   主 CTA 一直不进焦点态（画面没坏、只是「结算卡在庆祝里」，零报错）。
  // ⭐ 上界从 fx 的预算**算**出来，⛔ 不是写死的数字 —— 写死的话把庆祝调到 8 秒时
  //   这条兜底会先把 CTA 点亮，e2e 的「≤ 5 秒」就抓不住了（门禁必须真的会红）。
  _overTimer = setTimeout(markOverReady, C4Fx.winTotal() + 400);
  fxKick();
}

function fxFrame(ts) {
  G.rafId = null;
  const now = (typeof ts === 'number' && isFinite(ts)) ? ts : nowMs();
  const dt = Math.min(Math.max(0, now - G.fxLast), MAX_FRAME_DELTA);
  G.fxLast = now;
  const evs = C4Fx.step(dt);
  for (const e of evs) {
    if (e.type === 'land') onPieceLanded(e.r);
    // ⭐ 结算音挂在**连线开始画**那一瞬（= 赢的那枚落地那一刻），⛔ 不挂判出终局那一刻：
    //   那时棋子还在半空中（而且正在慢放），声音会比画面早半秒 —— 就是音画不同步。
    else if (e.type === 'winline') playResultSfx();
    else if (e.type === 'winend') markOverReady();
  }
  renderAll();
  // ⛔ 没有动画在跑就**必须停**（别空转烧电）。判据是 C4Fx.done()，不是别的标志。
  if (!C4Fx.done()) G.rafId = requestAnimationFrame(fxFrame);
}

function fxKick() {
  if (G.rafId != null || C4Fx.done()) return;
  G.fxLast = nowMs();
  G.rafId = requestAnimationFrame(fxFrame);
}

/** ⛔ 撤销 / 换局 / 回菜单必须调：不然一枚**已经不在盘上**的棋子还在半空中飞。
 *  ⚠ 结算的兜底计时器一起清：撤销掉一个赢局之后，它再触发就会在**新局面**上把
 *    overReady 点亮（phase 已经不是 OVER 了 ⇒ markOverReady 自己也挡一道，两层都要有）。 */
function fxStop() {
  if (G.rafId != null) { cancelAnimationFrame(G.rafId); G.rafId = null; }
  clearOverTimer();
  G.overReady = false;
  C4Fx.reset();
}

/** 起一枚棋子的下落。row/player 必须是**落子之前**读到的（落完就读不到了）。 */
function startDropFx(col, row, player) {
  const L = G.L || curLayout();
  const params = { c: col, r: row, player: player };
  const f = fallCells(L, col, row);
  if (f !== null) params.fall = f;
  const id = C4Fx.start('drop', params);
  // ⛔ 动画起不来（参数坏了 / 将来 T6 的减弱动态）也**必须有落定反馈**：
  //    静默丢掉音与震动 = 玩家以为这一手没落上。
  if (id == null) { onPieceLanded(row); return; }
  Sfx.play('drop');
  fxKick();
}

// ════════ 状态机 ════════

// ⛔ 别在这里加 `&& C4Fx.done()`（见上节）：落子动画期间点击必须照常生效。
function interactive() {
  return G.phase === 'PLAYING' && !!G.g && !G.thinking && C4State.isHumanTurn(G.g);
}

function goHome() {
  G.aiSeq++; setThinking(false); fxStop();
  G.phase = 'HOME'; G.g = null; G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  renderAll();
}

function startGame(mode, tier) {
  G.aiSeq++; setThinking(false); fxStop();
  G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  const opts = { mode: mode, gameNo: G.gameNo };
  // ⛔ 别在这里算 humanFirst：交替先手 + 「顶档必须玩家先手」两条都写在 state.js 的
  //    newGame 里（只写一处才守得住），这里传了就等于把那条兜底覆盖掉。
  if (mode === 'ai') opts.tier = tier;
  G.g = C4State.newGame(opts);
  G.phase = 'PLAYING';
  renderAll();
  maybeAI();
}

/** 再来一局：⭐ gameNo +1 ⇒ 下一局先手换人（同机双人），人机局同理轮换。 */
function again() {
  const prev = G.g;
  if (!prev) { goHome(); return; }
  G.gameNo++;
  startGame(prev.mode, prev.mode === 'ai' ? prev.tier : undefined);
}

function checkOver() {
  const bd = C4State.boardOf(G.g);
  const t = RulesClassic.terminal(bd);
  if (t === null) return false;
  const w = RulesClassic.winnerOf(t);
  G.phase = 'OVER';
  G.result = { t: t, winner: w, line: w === null ? null : findWinLine(bd, w) };
  G.hoverCol = -1;
  startWinFx();         // ⭐ 赢的那 3 秒（⚠ 此刻赢的那一枚通常**还在飞**，lead 就是等它落地）
  setThinking(false);   // ⚠ 放最后：它会重画一帧，前面的字段得先摆好
  return true;
}

/** 落一子（人或 AI 都走这里）。⚠ 先问 canPlay —— C4State.play 对非法列是**抛**的。 */
function applyMove(col) {
  if (!G.g || !C4State.canPlay(G.g, col)) return false;
  // ⚠ 落点与执子方必须在 play **之前**读：落完盘面就变了，那时候 h[col] 已经加过一。
  //   ⭐ 这个 row 直接就是落定音的编号（land0 = 最底行 = 最低音，DESIGN §6.3）。
  const row = C4Render.landingRow(C4State.boardOf(G.g), col);
  const player = C4State.turnOf(G.g);
  G.g = C4State.play(G.g, col);
  G.hoverCol = -1;
  if (row >= 0) startDropFx(col, row, player);
  const over = checkOver();
  renderAll();
  if (!over) maybeAI();
  return true;
}

/** ⭐ 撤销要退回**该玩家走**的那个位置。
 *  只退一手的话，人机局里 AI 会立刻把它走回来 —— 表现为「撤销按钮没反应」，零报错。 */
function doUndo() {
  const g = G.g;
  if (!g || !g.moves.length) return;
  G.aiSeq++; setThinking(false); fxStop(); G.notice = '';
  let n = g.moves.length - 1;
  if (g.mode === 'ai') {
    while (n > 0 && (n % 2) !== C4State.humanPlayer(g)) n--;
  }
  G.g = C4State.rewindTo(g, n);
  G.phase = 'PLAYING';
  G.result = null; G.hoverCol = -1; G.holdCol = -1;
  renderAll();
  maybeAI();   // ⚠ 兜底：万一退到的仍是 AI 的回合（human 局恒 false），别把局面卡死
}

// ════════ AI ════════

function maybeAI() {
  const g = G.g;
  if (!g || G.phase !== 'PLAYING' || g.mode !== 'ai') return;
  if (C4State.isHumanTurn(g)) return;
  if (G.thinking) return;
  requestAI();
}

function requestAI() {
  const g = G.g;
  const my = ++G.aiSeq;
  const moves = g.moves.slice();
  const tier = g.tier, seed = g.seed;

  // ⭐ 这一手到底会不会搜。⛔ 别按 phase、别按「反正是 AI 的回合」开菊花（见文件头 ③）。
  const heavy = ConnectAI.usesSolver(moves, tier);
  G.lastAiHeavy = heavy;
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const fresh = () => my === G.aiSeq;
  const took = () => Math.round(((typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now()) - t0);

  const fire = () => EngineClient.ai(moves, tier, seed).then(r => {
    if (!fresh()) return;                 // 撤销 / 换局把它作废了
    if (r && r.stale) return;             // 被更新的一次顶掉（engine-client 的约定，不是错误）
    setThinking(false);
    G.lastAiMs = took();
    G.notice = '';                        // 这次成功了 ⇒ 上一次的降级措辞该撤下（⛔ 别让红字赖着）
    // ⛔ 兜底也要**响**：Worker 回了个落不下去的列（列满 / 越界 / undefined）时，
    //    静默不动 = 棋局永远停在 AI 的回合，玩家只看到「思考中」消失了却没人落子。
    if (!applyMove(r.col)) { G.notice = T('game.engineDown'); renderAll(); }
  }, e => {
    if (!fresh()) return;
    setThinking(false);
    G.lastAiMs = took();
    // ⛔ 绝不编一个「看起来合理」的列号顶上（DESIGN §2.4）。如实说，并退回菜单可选。
    G.notice = T('game.engineDown');
    renderAll();
  });

  if (!heavy) { fire(); return; }         // ⭐ 轻松档：不转菊花，直接发

  setThinking(true);
  // ⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调求解器档（DESIGN §9.2 的断崖）。
  //    usesSolver 判不出这一层，必须自己查 EngineClient.bookReady()。
  if (moves.length <= 9 && !EngineClient.bookReady()) {
    G.notice = T('game.enginePrep');
    renderAll();
    EngineClient.ensureBook().then(() => {
      if (!fresh()) return;
      if (!EngineClient.bookReady()) {
        setThinking(false);
        G.notice = T('game.engineSlow');   // 诚实停下，⛔ 不硬算（那是几秒到几十分钟）
        renderAll();
        return;
      }
      G.notice = '';
      fire();
    });
    return;
  }
  fire();
}

// ════════ 输入 ════════

function setHover(c) {
  if (G.hoverCol === c) return;
  G.hoverCol = c;
  renderAll();
}

function onHold(x, y) {
  G.holdCol = -1;
  if (!interactive()) return;               // 按在按钮上/不是我的回合 ⇒ 交给 onAction
  const L = G.L || curLayout();
  const c = L.colAt(x, y);
  if (c < 0) return;
  G.holdCol = c;
  setHover(C4State.canPlay(G.g, c) ? c : -1);
}

function onHoldMove(x, y) {
  if (G.holdCol < 0) return;
  const L = G.L || curLayout();
  const c = L.colAt(x, y);                  // 拖出盘外 ⇒ -1 ⇒ 预览消失（但手指还按着）
  setHover(c >= 0 && C4State.canPlay(G.g, c) ? c : -1);
}

function onHoldEnd(x, y) {
  const from = G.holdCol;
  G.holdCol = -1;
  if (from < 0) return;                     // 这次按下不是从盘上起的 ⇒ 让 onAction 去处理按钮
  const L = G.L || curLayout();
  const c = L.colAt(x, y);                  // ⚠ 取消发的是 (-1,-1) ⇒ c=-1 ⇒ 清预览而不落子
  G.hoverCol = -1;
  if (c < 0 || !interactive() || !C4State.canPlay(G.g, c)) { renderAll(); return; }
  applyMove(c);
}

function dispatch(action, data) {
  switch (action) {
    // ⛔ 空分支是**故意的**（文件头 ①）：快点一下时 onHoldEnd 已经落过子了，
    //    这里再落一次 = 一次点击落两子。热区仍由 render.drawBoard 注册，别删。
    case 'COL': return;

    case 'PLAY_AI':    G.gameNo = 0; startGame('ai', G.tier); return;
    case 'PLAY_HUMAN': G.gameNo = 0; startGame('human'); return;
    case 'TIER':       G.tier = data.tier; renderAll(); return;
    case 'UNDO':       doUndo(); return;
    case 'AGAIN':      again(); return;
    case 'HOME':       goHome(); return;
    default: return;
  }
}

// ════════ 绘制 ════════

const TIER_PRESETS = [
  { key: 'menu.easy',    tier: 3  },   // 轻松：不调求解器，秒出
  { key: 'menu.medium',  tier: 12 },   // 进阶：求解器 + 明面失误率
  { key: 'menu.perfect', tier: 20 }    // 完美：零失误（⭐ state.js 会强制玩家先手）
];

function drawHome(L) {
  const SW = L.SW, SH = L.SH;
  const es = EngineClient.state();
  const dead = es.worker === 'dead';

  txt(T('app.title'), SW / 2, L.hud.y + 46, '#1f6e4d', 'bold 30px sans-serif');
  // 两枚棋子当门面：进游戏前就先看见「两方不是同一个圆换色」
  C4Render.drawGlyph(0, SW / 2 - 34, L.hud.y + 108, 44);
  C4Render.drawGlyph(1, SW / 2 + 34, L.hud.y + 108, 44);

  const bw = Math.min(300, SW - 60), bx = (SW - bw) / 2;
  let y = L.hud.y + 156;

  txt(T('menu.tier'), SW / 2, y, C4Render.PAL.hudSub, '13px sans-serif');
  y += 18;
  const cw = (bw - 16) / 3;
  TIER_PRESETS.forEach((p, i) => {
    const sel = G.tier === p.tier;
    btn(bx + i * (cw + 8), y, cw, 40, T(p.key), 'TIER', { tier: p.tier }, {
      bg: sel ? C4Render.PAL.accent : 'rgba(255,255,255,0.92)',
      fg: sel ? '#fff' : C4Render.PAL.hudText,
      outline: sel ? null : C4Render.PAL.hudEdge,
      size: 14, disabled: dead
    });
  });
  y += 40 + 6;
  txt(T('game.level', { n: G.tier }), SW / 2, y + 8, C4Render.PAL.hudSub, '12px sans-serif');
  y += 26;

  btn(bx, y, bw, 52, T('menu.vsAI'), 'PLAY_AI', {}, { disabled: dead });
  y += 62;
  btn(bx, y, bw, 52, T('menu.vsHuman'), 'PLAY_HUMAN', {}, { bg: '#61776f' });
  y += 70;

  // ⭐ 引擎状态如实写出来（DESIGN §2.4：降级必须**可见**）
  let note = '';
  if (dead) note = T('game.engineDown');
  else if (es.worker !== 'alive') note = T('game.enginePrep');
  else if (es.book === 'loading') note = T('game.bookLoading');
  else if (es.book === 'failed') note = T('game.engineSlow');
  if (note) {
    ctx.font = '12px sans-serif';
    wrapLines(note, bw, 2).forEach((ln, i) =>
      txt(ln, SW / 2, y + i * 16, dead ? '#a33' : C4Render.PAL.hudSub, '12px sans-serif'));
  }
}

/** 悬停带里的一条状态：思考中三点 / 诚实措辞。（有悬停预览时那里是棋子，不画这个） */
function drawDropBand(L) {
  if (G.hoverCol >= 0) return;
  const cx = L.drop.x + L.drop.w / 2, cy = L.drop.y + L.drop.h / 2;
  if (G.thinking) {
    const label = T('game.thinking');
    ctx.font = 'bold 14px sans-serif';
    const tw = ctx.measureText(clean(label)).width;
    const bw = Math.min(L.drop.w - 8, tw + 60);
    fillRR(cx - bw / 2, cy - 17, bw, 34, 17, 'rgba(255,255,255,0.92)');
    txt(label, cx - 14, cy, C4Render.PAL.hudText, 'bold 14px sans-serif');
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + bw / 2 - 34 + i * 10, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = i === G.spin ? C4Render.PAL.accent : 'rgba(47,143,106,0.28)';
      ctx.fill();
    }
    return;
  }
  if (G.notice) {
    ctx.font = '12px sans-serif';
    wrapLines(G.notice, L.drop.w - 24, 2).forEach((ln, i) =>
      txt(ln, cx, cy - 7 + i * 15, '#a33', '12px sans-serif'));
  }
}

function hudInfo(g) {
  if (G.phase === 'OVER' && G.result) {
    const w = G.result.winner;
    if (w === null) return { turn: null, left: T('game.draw') };
    if (g.mode === 'ai') {
      return { turn: w, left: T(w === C4State.humanPlayer(g) ? 'game.win' : 'game.lose') };
    }
    return { turn: w, left: T('game.wins', { p: seatName(g, w) }) };
  }
  const turn = C4State.turnOf(g);
  if (g.mode === 'ai') {
    if (C4State.isHumanTurn(g)) return { turn: turn, left: T('game.yourTurn') };
    // ⛔ 轮到 AI 但**没有在算**且已如实报错时，⛔ 绝不能继续显示「思考中」——
    //    截图实锤：Worker 挂了之后 HUD 一直写着 Thinking，红字却说引擎不可用，
    //    两句话互相打架，而「思考中」那句是假的。
    return { turn: turn, left: T(!G.thinking && G.notice ? 'game.stopped' : 'game.thinking') };
  }
  return { turn: turn, left: T('game.turnOf', { p: seatName(g, turn) }) };
}

function drawPlay(L) {
  const g = G.g;
  const bd = C4State.boardOf(g);
  const line = G.result && G.result.line;
  // ⭐ pose() 里混着两种动画 ⇒ 在这里分流（⛔ 别把 win 那条丢给 anim：它没有 c/r，
  //    drawBoard 会去算 L.center(undefined) ⇒ NaN ⇒ 棋子被静默画到画布外）。
  const poses = C4Fx.pose();
  const drops = poses.filter(p => p.kind === 'drop');
  const wfx = C4Fx.poseWin();   // 庆祝播完 / 没有庆祝 ⇒ null ⇒ 下面退回静态赢局帧

  C4Render.drawBoard(bd, {
    L: L,
    hoverCol: G.hoverCol,
    hoverPlayer: C4State.turnOf(g),
    winLine: line,
    // ⭐ 三条曲线全部来自 fx（⛔ 别在这里另算时间）：庆祝在跑时用它的，播完退回静态终态。
    dim: line ? (wfx ? wfx.dim : C4Fx.DIM_MAX) : 0,
    lineProg: wfx ? wfx.prog : 1,
    lit: wfx ? wfx.lit : null,
    lastMove: null,
    anim: drops            // ⭐ 正在下落的棋子（空数组 = 没有动画，drawBoard 一切照旧）
  });

  const info = hudInfo(g);
  // ⭐ 右侧那串就是「先手指示」：同机双人局逐局翻转，第二局肉眼可见换了人。
  info.right = g.mode === 'ai'
    ? T('game.level', { n: g.tier })
    : T('game.gameLine', { n: g.gameNo + 1, p: firstSeatName(g) });
  C4Render.drawHUD(info, L);

  drawDropBand(L);

  // 按钮行：钉在盘面下方的留白里（⛔ 别压在盘上——赢局那条连线必须一直看得见）
  const gap = 12;
  const rowH = 46;
  // ⭐ 结算是**两行**（§6.5）：第一行只放主 CTA［再来一局］+［复盘］留位，
  //   ［撤销］［菜单］退到第二行 —— 「再来一局」必须是一眼看到的那一个，不是三选一。
  const rows = G.phase === 'OVER' ? 2 : 1;
  const blockH = rows * rowH + (rows - 1) * gap;
  let ry = L.boardY + L.boardH + 16;
  const maxY = L.SH - L.safeBottom - 12 - blockH;
  if (ry > maxY) ry = maxY;
  const marg = 14;
  const full = L.SW - marg * 2;

  if (G.phase === 'OVER') {
    // ⭐ 主 CTA：庆祝一播完就进焦点态（⛔ 但从终局第一帧起就**点得动** —— 热区在这里注册，
    //    与 overReady 无关；「庆祝期间点得动」由 e2e-p2b 用真实鼠标钉死）。
    const wMain = Math.round((full - gap) * 0.60);
    btn(marg, ry, wMain, rowH, T('game.again'), 'AGAIN', {}, {
      bg: G.overReady ? '#37a87c' : C4Render.PAL.accent,
      focus: G.overReady, size: 17
    });
    // ⭐ ［复盘］**留位**（DESIGN §3.3 的赛后复盘是 P3 的内容）。
    //   ⚠ 现在是 disabled ⇒ btn 不注册热区 ⇒ 点不出任何反应，⛔ 不许做成「点了没反应」的活按钮：
    //     假按钮比没按钮更伤（玩家会以为坏了）。P3 填内容时把 disabled 去掉 + 加 'REVIEW' 分支。
    btn(marg + wMain + gap, ry, full - wMain - gap, rowH, T('game.review'), 'REVIEW', {},
        { disabled: true, size: 15 });
    const ry2 = ry + rowH + gap;
    const w2 = (full - gap) / 2;
    btn(marg, ry2, w2, rowH, T('game.undo'), 'UNDO', {}, { bg: '#61776f' });
    btn(marg + w2 + gap, ry2, w2, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
  } else {
    const w2 = (full - gap) / 2;
    btn(marg, ry, w2, rowH, T('game.undo'), 'UNDO', {}, {
      bg: '#61776f', disabled: !g.moves.length
    });
    btn(marg + w2 + gap, ry, w2, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
  }
}

function renderAll() {
  clearHits();
  const L = curLayout();
  G.L = L;
  C4Render.drawBackground(L);
  if (G.phase === 'HOME' || !G.g) drawHome(L);
  else drawPlay(L);
}

// ════════ 启动 ════════

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  // ⭐ 三件套 opt-in：按住预览、松手才落（DESIGN §6.1）。
  //   ⚠ onAction 只在 `dist<10 && dt<500` 才发 —— 按住想两秒再松手那一手会被静默丢掉，
  //     这正是 T3 给引擎加这三个回调的理由。落子**只**在 onHoldEnd 里做（文件头 ①）。
  Input.bind({ onAction: dispatch, onHold: onHold, onHoldMove: onHoldMove, onHoldEnd: onHoldEnd });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();

  // ⭐ 首屏**不 await** 引擎：让玩家先看见界面（DESIGN §9.2）。
  EngineClient.onChange(() => renderAll());
  EngineClient.start().then(okv => {
    renderAll();
    if (okv) EngineClient.ensureBook();   // 3.6 MB 开局库懒加载，到位后自然变快
  });
}

boot();
