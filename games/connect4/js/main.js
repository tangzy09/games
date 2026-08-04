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
  readyAt: 0,         // 实测用：主 CTA 拿到焦点态的时刻 ⇒ 两者之差就是 §6.5 那 5 秒的量法
  // ── 威胁高亮（P2b T4 · DESIGN §6.4）──
  // ⭐ 上一帧算出来的威胁格，**只给 E2E / 调试看**（⛔ 不是真值源：真值恒是 bd，每帧现算）。
  //   现算的代价是每帧 ≤14 次 B.isWinningMove + 一次 clone —— 微秒级，⛔ 不许改成缓存：
  //   缓存过期的表现是「标记停在上一手的位置」，画面照常、零报错，正是本仓最怕的失败模式。
  threats: [],
  // ── 双威胁的专属时刻（P2b T5 · DESIGN §6.4 下半）──
  // ⭐ 只给 E2E / 调试看的计数与最近一次记录（⛔ 不是真值源）。
  //   forkCount 存在的理由就是「不刷屏」那条门禁要能**数**：连续两手都是双威胁时它必须还是 1。
  forkCount: 0,
  lastFork: null,     // { player, cells:[{c,r}], ply }
  // ── ⭐ 猜先（P2c T3 · DESIGN §6.7）──
  // ⭐ `coin` = 「这一局的猜先卡还该不该画」。⛔ **不进 G 的存档对象**：猜先没有任何自己的
  //   随机性，它演的就是 `g.humanFirst`（state.js 早就算好了）⇒ 存它等于把同一个事实存两遍，
  //   而两份一旦漂了就会出现「卡上说他先手、盘上是我先走」，零报错。
  coin: false,
  // ⭐ 这一局的猜先到底**放没放动画**（减弱动态下是 false）。只给 E2E / 调试看。
  coinAnim: false,
  coinRect: null,     // 上一帧猜先卡画在哪（只给 E2E 取样，⛔ 不是真值源）
  f2fRect: null,      // 上一帧对坐 HUD 画在哪（同上）
  // ── 竖屏留白（P2b T7 · DESIGN §6.9）──
  // ⭐ HOME 上每一块排完的 { k, y, h }，**只给 E2E / 调试看**（⛔ 不是真值源，每帧重排）。
  //   门禁靠它断言「块与块不重叠、都不出屏」—— ⛔ 少了它，「小屏 + 舒适模式四行压成一坨」
  //   这种事只有肉眼抓得到（改之前就是这样：脚本全绿、截图一眼是坏的）。
  homeRows: []
};

// ════════ 无障碍：减弱动态 / 舒适模式（P2b Task 6 · DESIGN §6.8）════════
// 「大字 + 更大点击窗 + 跳过一切非必要动画（晕动症）。四子棋用户画像**从 4 岁到 80 岁**，
//   这不是矫情（solitaire 已验证）。」
//
// ⭐⭐ 减弱动态的门控点**只有三处**，全部是 `C4Fx.start(...)` 那一行（fx.js 文件头写死了）：
//   startDropFx / startWinFx / startForkFx —— 三处都走各自现成的 `id == null` 分支，
//   ⇒ 「跳过动画」与「动画参数坏了」是同一条代码路径，⛔ 不许再加第二套 if。
//   ⛔ 别把门控写进 fx 内部：那样「动画到底跑没跑」就有两个真值了。
//
// ⚠⚠ **什么不许被一起关掉**（这一条比「关掉什么」更容易做砸）：
//   · 落子的**结果**（棋子出现在落点）+ 落定音 + 震动 —— 走 onPieceLanded，照旧；
//   · 赢局的**终态**：连线整条 + 四枚发光 + 其余变暗（render 的 lineProg/lit 默认就是终态）
//     并且**立刻** markOverReady（⛔ 不许因为没动画就没结算）；
//   · 双威胁的 **fork 音**（光环不放，音照响）—— 减弱动态针对的是**视觉运动**，
//     声音不引起晕动症；要静音有独立入口（🔊）。
//   · ⭐ **威胁标记 ▲/◇ 完全不吃这个门**（render.js drawThreat 那段 ⭐⭐）：
//     它是**信息**不是动效，关掉动效的人反而更需要它。
let _mqReduce = null;
/** 系统的 `prefers-reduced-motion`。⚠ 每次现问（MediaQueryList.matches 是活的）：
 *  玩家可以在系统设置里随时改，而这个页面可能一直开着。 */
function sysReduceMotion() {
  try {
    if (!_mqReduce && typeof window !== 'undefined' && window.matchMedia) {
      _mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return !!(_mqReduce && _mqReduce.matches);
  } catch (e) { return false; }   // 老 WebView 没 matchMedia ⇒ 当「系统没要求」，设置里仍能强制开
}
/** 这一刻到底减不减动态。⭐ 真值表在 C4Settings.motionReduced（纯函数，node 侧钉死）。 */
function reduceMotion() {
  return C4Settings.motionReduced(C4Settings.get('reduceMotion'), sysReduceMotion());
}

// ── 舒适模式：字号与按钮高度的两个倍数 ──
// ⚠ 「更大点击窗」在本作里就是**按钮更高**（列的热区本来就是整列，已经是最大了）。
//   ⛔ 别用「热区比画出来的按钮大一圈」来实现：那会让相邻按钮的热区互相重叠，
//     边缘的点击被静默判给隔壁 —— 又是一个画面正常、零报错的失败模式。
const COMFORT_TEXT = 1.30;
const COMFORT_BTN  = 1.32;
function comfortOn() { return C4Settings.get('comfort'); }
/** 字号（px）。 */ function fsz(px) { return Math.round(px * (comfortOn() ? COMFORT_TEXT : 1)); }
/** 按钮/行高（px）。 */ function bht(px) { return Math.round(px * (comfortOn() ? COMFORT_BTN : 1)); }

// ════════ 小工具 ════════

// ════════ ⭐⭐ 对坐模式（P2c Task 3 · DESIGN §6.7）════════
// §6.7 原文：「**对坐模式**：棋盘旋转 180°，两人各自面向自己那侧（平板尤其自然）。」
//
// ⭐⭐⭐ ─── 产品判断 ①：**转的是 HUD，⛔ 不是棋盘。** ───
//   规格那句话我照着做了一遍，然后把它推翻了。三条理由，按分量排：
//   1. ⛔⛔ **重力是这局棋里唯一「两人必须共享」的约定。** 转 180° 之后「往下掉」在屏幕上
//      变成「往上长」——**给谁转，谁的重力就是对的，另一个人就得看着棋子往上掉**。
//      而且它不是能两边都满足的东西：平板平放在桌上时根本不存在一个两人都认同的「下」
//      （真实的塑料四子棋是**立着**的，重力对两人是同一个真实方向 —— 那正是它躲开这个问题
//      的方式，⛔ 平板躲不开）。
//   2. ⛔ **「每手转一次」会让全盘棋子在屏幕上瞬移两次/回合。** 这个游戏的全部内容就是
//      「读盘面」：我刚记住的那条三连换到了对角。对 §6.7 真正的主角（4-5 岁的孩子、
//      让子局、儿童档）这是灾难。而且它是**大幅度的整屏运动** ⇒ §6.8 减弱动态必须把它关掉
//      ⇒ 最需要「不歪头」的那批人反而拿不到这个功能，功能就自相矛盾了。
//   3. ⭐ **盘面倒过来看几乎不丢信息，字才丢。** 两方棋子的造型是**正六边形**与**圆环**——
//      两者在 180° 旋转下逐像素不变（§6.2 的双编码在对面那个人眼里原样成立）；
//      威胁标记 ▲ 倒过来是 ▼、◇ 不变，实心/空心这一重编码也照样在。
//      ⇒ 对面那个人真正读不了的是**字**：「轮到谁」「谁赢了」。
//   ⇒ **对坐模式 = 在盘上方给对面那个人一条旋转 180° 的第二 HUD**（盘、重力、列热区
//     一个像素都不动）。⚠ 那条 HUD 像 tray 一样**进 cell 的高度预算**（render 的 F2F_RESERVE），
//     ⛔ 否则棋盘会长上去把它压在身下，而画面看起来完全正常。
//
// ⭐ ─── 产品判断 ②：**只对同机双人局开放** ───
//   对坐模式的全部价值是「对面**坐着一个人**」。人机局对面没有人 ⇒ 第二条 HUD 是纯噪音，
//   还要从棋盘身上收走 64 px（§6.9 的留白是有限资源）。
//   ⚠ 但**⛔ 不静默**（§2.4 / T1 让子在求解器档下的先例）：设置**存得住**（家长的选择不该
//     被清掉），HOME 上那一行的标签自己就写着「（双人）」，人机局开出来就是不生效。
//   ⚠ 判据只有 `f2fOn()` 一份，⛔ 别在别处再写一次 `mode === 'human'`。
//
// ⭐ ─── 为什么它**不进存档**（与 kids 正好相反）───
//   kids 进存档，是因为它**改规则**（锁档位 + 孩子恒先手）⇒ 「这一局是什么」必须钉在 G 上。
//   对坐模式**一条规则都不改**，它只回答「这一屏怎么画」⇒ 读设置现算才是对的：
//   两个人中途想换个坐法，改一下当场就该生效。⛔ 把它塞进 G 会白 bump 一次 SAVE_VERSION
//   并把所有老档判死，换来的只是一个画面开关。
function f2fPref() { return C4Settings.get('faceToFace'); }
/** ⭐ 这一屏到底给不给第二条 HUD。⚠ HOME 上恒 false（那时还没有「对面那个人」）。 */
function f2fOn() {
  return f2fPref() && G.phase !== 'HOME' && !!G.g && G.g.mode === 'human';
}

// ⚠⚠ 全局只有这一处算 layout：**画出来的那份**与 `onHoldEnd` 拿去算列号的那份必须是
//   同一个对象（renderAll 把它存进 G.L，drawBoard 用同一个 L 注册热区）。
//   ⛔ 对坐模式改了几何（盘往下挪、平板上 cell 还会变小）——两处各算各的话就会出现
//   「点哪儿都不对」而功能测试全绿（那些测试直接调 action，根本不走热区）。
function curLayout() {
  return C4Render.layout(GameGlobal.SW, GameGlobal.SH, null, null, { faceToFace: f2fOn() });
}

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
  // ⭐ 舒适模式（§6.8）：**所有**按钮的字号在这里统一放大，⛔ 别让各处调用方各乘一次
  //   （漏一个的表现是「一屏字大小不一」，而且没人会发现是漏了乘）。
  // ⚠ style.px = 已经算好的字号（drawHome 的块栈在矮屏上会把整栈一起缩）；
  //   没给就照旧走 fsz()。
  fitTxt(label, x + w / 2, y + h / 2, w - 16,
         on ? (style.fg || '#fff') : 'rgba(38,74,61,0.45)', style.weight || 'bold',
         style.px || fsz(style.size || 16));
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
  // ⭐ T6 减弱动态的门控点之二（§6.8）。⚠ 慢放时钟是 win 动画的一部分 ⇒ 不 start
  //   就**根本不会有慢放**，减弱动态下棋子照常按正常速度落，⛔ 别再单独加一个开关。
  const id = reduceMotion() ? null : C4Fx.start('win', { line: line });
  // ⚠ 走这条时画面**不是空的**：drawPlay 的 lineProg/lit 默认就是「整条 + 全亮」，
  //   dim 退回 C4Fx.DIM_MAX ⇒ 连线、四枚发光、其余变暗这三件**终态**照样在（§6.3 的信息没丢，
  //   丢掉的只是"逐段画出"这个过程），并且**立刻**进结算。
  if (id == null) { playResultSfx(); markOverReady(); return; }
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
    // ⭐ 双威胁的音**挂在光环炸开那一瞬**（= 触发这次双威胁的那枚棋子落地那一刻），
    //   ⛔ 不挂 maybeFork 那一刻：那时棋子还在半空，声音会早到 ~270 ms。
    else if (e.type === 'fork') playForkSfx();
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
  // ⭐ 猜先那个「等演完再让 AI 走」的计时器一起清（同 _overTimer 的理由）：撤销/换局之后
  //   它再触发就会在**另一局**上叫醒 AI。⚠ 里面还有一道 aiSeq 校验，两层都要有。
  clearCoinTimer();
  G.overReady = false;
  C4Fx.reset();
}

// ════════ 双威胁的专属时刻（P2b Task 5 · DESIGN §6.4 下半）════════
// §6.4：「⭐ **形成双威胁的那一刻给专属特效 + 音效** —— 把整个游戏最精彩的战术瞬间
//        变成一个能看见能听见的事件。一箭三雕：即时爽感 + 实战教学（第 7 课的概念在
//        真实对局里被看见）+ 旁观者也看得懂（双人对战时很重要）。」
//
// ⛔⛔ **零搜索**：判据整个在 `C4Threats.forkOf`（≤14 次 B.isWinningMove，微秒级）。
//   ⛔ 这里绝不许出现 EngineClient.scores / Solver.* —— §9.2 的断崖是每手 1.7 秒，
//     而这条判据**每落一子**都要跑。e2e-p2b-t5 用调用计数钉死（并接上 t4 ⑦ 的整局计数）。
//
// ⚠⚠ 「别刷屏」是**两道**，缺一道都不够：
//   ① 判据层（threats.forkOf 的条件 ②）：**只在「形成」那一手**报，之后每一手都成立的
//      「我现在有双威胁」不算 —— ⛔ 少了这条，双威胁一旦形成就每落一子响一次；
//   ② 本节这两个状态：**同一局面只触发一次**（_forkKeys，撤销后重下同一手不再响）
//      + **冷却**（_forkPly，见 FORK_MIN_GAP）。
//   ⭐ 两道分工不同：① 挡「同一个双威胁反复报」，② 挡「两方连着各形成一个」——
//     后者是真实存在的局面（门禁的 FIX_TWICE 就是随机对局里搜出来的），⛔ 别以为 ① 够了。
const FORK_MIN_GAP = 3;      // 响过之后至少再过 3 手才可能再响（⚠ 改这个数门禁会红，那是故意的）
let _forkKeys = new Set();   // 已经判过的局面（key = 手数列表；⛔ 别用盘面哈希，那反而更贵）
let _forkPly = -99;          // 上一次真的响的手数

/** ⛔ 换局 / 回菜单必须调。⚠ **撤销不调** —— 撤销后重下同一手不该再响一次（「同一局面只触发一次」）。 */
function resetFork() { _forkKeys = new Set(); _forkPly = -99; G.forkCount = 0; G.lastFork = null; }

/**
 * ⭐⭐ 撤销时**只松开冷却**，⛔ 不动 `_forkKeys`。这一行是被一次变异实验逼出来的：
 *   冷却比的是**手数**，而撤销会让手数**倒退** ⇒ `ply - _forkPly ≤ 0` 恒成立 ⇒
 *   响过一次之后，撤销回去再怎么下都被冷却永久压住。表现有两个，都不报错：
 *     ① 真正的 bug：撤销后换一手**新的**双威胁，特效再也不出现；
 *     ② 更阴的一个：它把「同一局面只触发一次」那条门禁**变成恒绿的** ——
 *        实测把 `_forkKeys` 整段删掉，e2e-p2b-t5 ⑤ 照样全绿（本仓「加了断言但抓不住」第六次，
 *        当场被变异实验抓住）。⇒ 两道防线必须**各自独立可失败**：
 *          · `_forkKeys` 管「同一局面」（跨撤销有效）
 *          · `_forkPly`  管「连续两手」（撤销时释放）
 */
function forkRewind() { _forkPly = -99; }

/** ⭐ 特效 + 音效。⚠ 声音挂在 fx 的 'fork' 事件上（= 那枚棋子落地那一刻），⛔ 不在这里响。 */
function playForkSfx() {
  Sfx.play('fork');
  // ⛔ 这里**不加震动**：'fork' 与那一手的 land 音是**同一帧**发的（fx 的 lead 就是这么算的），
  //   land 已经震过了 —— 再震一次只会糊成一下更长的震动，读不出「这是个事件」。
}

function startForkFx(f) {
  // ⭐ T6 减弱动态的门控点之三（§6.8）：**光环不放，但事件仍然听得见** ——
  //   ⛔ 别顺手把音也关掉：减弱动态针对的是视觉运动，而 fork 音是这个事件在关掉动效后
  //   **唯一**的载体，一起关等于把 §6.4 下半整条功能删掉（理由全文写在 fx.js 文件头）。
  const id = reduceMotion() ? null : C4Fx.start('fork', { cells: f.cells, player: f.player });
  if (id == null) { playForkSfx(); return; }
  fxKick();
}

/** 落完一子就问一次。bdBefore 必须是**落子之前**的盘（落完就读不到了）。 */
function maybeFork(bdBefore, bdAfter) {
  const g = G.g;
  if (!g) return;
  const key = g.moves.join(',');
  if (_forkKeys.has(key)) return;           // 同一局面只判一次（撤销 → 重下同一手 ⇒ 不再响）
  _forkKeys.add(key);
  const f = C4Threats.forkOf(bdBefore, bdAfter);
  if (!f) return;
  const ply = g.moves.length;
  if (ply - _forkPly < FORK_MIN_GAP) return;   // ⭐ 冷却（⛔ 别删：连续两手都双威胁是真会发生的）
  _forkPly = ply;
  G.forkCount++;
  G.lastFork = { player: f.player, cells: f.cells, ply: ply };
  startForkFx(f);
}

/** 起一枚棋子的下落。row/player 必须是**落子之前**读到的（落完就读不到了）。 */
function startDropFx(col, row, player) {
  const L = G.L || curLayout();
  const params = { c: col, r: row, player: player };
  const f = fallCells(L, col, row);
  if (f !== null) params.fall = f;
  // ⭐ T6 减弱动态的门控点之一（§6.8）：**不 start ⇒ 没有任何东西在动**，
  //   走下面那条 fail-safe ⇒ 棋子直接出现在落点 + 落定音 + 震动。
  const id = reduceMotion() ? null : C4Fx.start('drop', params);
  // ⛔ 动画起不来（参数坏了 / 减弱动态）也**必须有落定反馈**：
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
  G.aiSeq++; setThinking(false); fxStop(); resetFork();
  G.phase = 'HOME'; G.g = null; G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  G.coin = false; G.coinAnim = false;
  renderAll();
}

/** ⭐ 这一局**实际**让几子（DESIGN §6.7）。
 *  ⚠ 玩家选的档位一直存着（他下一局换回轻松档时不该发现自己的选择被清了），
 *    但求解器档（6-20）不许让子 —— 判据只有 `C4State.handicapAllowed` 一份，
 *    ⛔ 别在这里再写一次 `tier < 6`（两份判据漂了 = 界面选得动、开局当场抛）。 */
function effHandicap(mode, tier) {
  const n = C4Settings.get('handicap');
  return C4State.handicapAllowed(mode, tier) ? n : 0;
}

// ════════ ⭐⭐ 儿童档（P2c Task 2 · DESIGN §6.7）════════
// ⚠⚠ **两个不同的问题，别混用**（混用的表现是「一局打到一半家长翻了设置，这一局的文案
//   当场跳成另一套，而规则并没有变」——画面正常、零报错）：
//   · `kidsPref()` = 设置里选的，回答「**下一局**怎么开」（HOME 上画哪个按钮高亮）；
//   · `kidsGame()` = `C4State.kidsOf(G.g)`，回答「**这一局**是不是儿童档」（局中/结算的
//     文案、庆祝、结算版面全读它）。⭐ 单一真值在 G 里，与 seed/tier/pre 同一条纪律。
function kidsPref() { return C4Settings.get('kids'); }
function kidsGame() { return C4State.kidsOf(G.g); }

/**
 * ⭐ 打开儿童档：**一次性套用预设**（⛔ 不是锁）。
 * 三项都是真的 `C4Settings.set` + 立刻落盘，家长事后**每一项都改得回**：
 *   · 难度 → 儿童档那一级（C4State.KIDS_TIER，量出来的）
 *   · 让子 → 至少 C4State.KIDS_HANDICAP 枚（孩子长大了就这么退下来：让2 → 让1 → 让0 → 轻松档）
 *   · ⭐ 舒适模式 → 开（DESIGN §6.7 的「更大的字与按钮」）
 * ⭐⭐ **舒适模式是「联动一次」而不是「强制」**，这是本 task 的第二个设计判断：
 *   · 强制（儿童档期间锁死）⇒ 家长点得动却改不掉 —— 而这一家人里可能正好有个视力好、
 *     嫌字大占地方的哥哥姐姐在同一台设备上玩，锁死就是把 §6.8 的开关废掉；
 *   · 完全不联动 ⇒ 家长得自己去第三行设置里翻出来 —— 那条「更大的字与按钮」等于没做。
 *   ⇒ 联动一次：打开的那一下把它打开，之后**再也不管它**（⛔ 别在每次开局时重新套用，
 *     那就是「改不掉」的另一种写法）。
 * ⚠ 只在 off → on 那一下调（dispatch 里判的）：已经在儿童档里再点一下不该把家长
 *   刚调回去的让子又推上来。
 */
function applyKidsPreset() {
  C4Settings.set('kids', true);
  G.tier = C4State.KIDS_TIER;
  if (C4Settings.get('handicap') < C4State.KIDS_HANDICAP) {
    C4Settings.set('handicap', C4State.KIDS_HANDICAP);
  }
  if (!C4Settings.get('comfort')) C4Settings.set('comfort', true);
}

// ════════ ⭐⭐ 猜先（P2c Task 3 · DESIGN §6.7「猜先动画（抛硬币）」）════════
// 「交替先手之外加一点『开始感』，几乎零成本。」
//
// ⭐⭐⭐ ─── 产品判断 ③：**猜先不掷骰子，它把已定的结果演一遍** ───
//   先手在 `C4State.newGame` 里已经由**四条**规则算完了（交替先手 §1.1②、T1「让子局强方
//   先手」、T2「孩子恒先手」、§1.1① 顶档必须玩家先手）。猜先如果自己再抛一次硬币，
//   会同时打碎三样东西，而且全都零报错：
//     ① **存档可重放**（撤销 = 重放到 n−1）—— 同一份存档两次打开会演出不同的先手；
//     ② 上面那四条规则**当场失效**（儿童档的孩子会有一半局数后手）；
//     ③ 「卡片上说的」与「盘上发生的」可以不一致。
//   ⇒ 三条**结构性**保证（⛔ 不是靠自觉）：
//     · 落定那一面 `first` 恒是**棋子 0**（本作里「先手 = 棋子 0」是定义，⛔ 不是能抛的东西）；
//     · 真正被「猜」的是「**这一局它归谁**」，而那句话（coinLabel）**只读 `g.humanFirst`**
//       —— 与 state.js 算先手用的是同一个字段，⛔ 不存第二份；
//     · 硬币转几圈由**存档里的 seed** 定（C4Fx.coinHalfTurns，纯函数）⇒ 同 seed 逐位相同。
//   ⛔ 本 task 改动的四个 js 里 `Math.random` 零出现（门禁 tests/e2e-p2c-t3 现场扫源码）。
//
// ⭐ 减弱动态（§6.8）：**硬币不转，卡片照画**（静态终态）—— 与 T3 赢局那条 fail-safe 同模板。
//   ⚠ 但「静态卡也需要时间被读到」⇒ 关掉动画时仍然给一个**最小停留**，AI 先手时等它过去
//     再走。⛔ 这不是「锁输入」（那时本来就不是玩家的回合；人先手时它一秒都不挡）。
const COIN_STATIC_MS = 700;
let _coinTimer = null;
function clearCoinTimer() { if (_coinTimer) { clearTimeout(_coinTimer); _coinTimer = null; } }

/** @returns 这次猜先要占多久（ms）—— AI 先手时先等这么久再让它走。 */
function startCoinFx() {
  const g = G.g;
  G.coin = true;
  // ⭐ 减弱动态的门控点之四（§6.8）：不 start ⇒ 硬币不转，⛔ 但下面那张卡照画。
  const id = reduceMotion() ? null : C4Fx.start('coin', { first: 0, seed: g.seed });
  G.coinAnim = id != null;
  if (id == null) return COIN_STATIC_MS;
  fxKick();
  return C4Fx.coinTotal();
}

/** ⭐ 「这一局谁先走」那句话。⚠ **只读 `g.humanFirst`** —— 与 state.js 定先手用的是同一个
 *  字段，⛔ 这里不许再算一次先手（两份判据漂了 = 卡片说的和盘上发生的不一样）。
 *  ⚠ 儿童档换成「不说难懂的话」的那一套（§6.7）。 */
function coinLabel(g) {
  if (C4State.kidsOf(g)) return T(g.humanFirst ? 'kids.coinYou' : 'kids.coinAI');
  if (g.mode === 'ai') return T(g.humanFirst ? 'game.coinYou' : 'game.coinAI');
  return T('game.coinP', { p: firstSeatName(g) });
}

/** 猜先卡这一帧还该不该画。⭐ 判据是「**还没落第一手**」：它一出现在盘上，先手就是
 *  看得见的事实了。⚠ 撤销回空盘时它会**回来**，那是对的（那时确实又是「还没开始」）。 */
function coinShown() {
  return G.coin && G.phase === 'PLAYING' && !!G.g && G.g.moves.length === 0;
}

function startGame(mode, tier) {
  G.aiSeq++; setThinking(false); fxStop(); resetFork();
  G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  // ⭐ 儿童档只对人机局成立（双人局那一侧的答案是让子，T1）。⚠ 档位由 state.js 说了算，
  //   ⛔ 这里不许自己写 `tier = 1`：两份判据漂了就会出现「界面写儿童档、开的是别的级」。
  const kids = mode === 'ai' && kidsPref();
  if (kids) tier = C4State.KIDS_TIER;
  const opts = { mode: mode, gameNo: G.gameNo, handicap: effHandicap(mode, tier), kids: kids };
  // ⛔ 别在这里算 humanFirst：交替先手 +「顶档必须玩家先手」+「让子局强方先手」三条都写在
  //    state.js 的 newGame 里（只写一处才守得住），这里传了就等于把那三条兜底覆盖掉。
  if (mode === 'ai') opts.tier = tier;
  G.g = C4State.newGame(opts);
  G.phase = 'PLAYING';
  // ⭐ 猜先（§6.7）。⚠ 必须在 newGame **之后**：它演的就是 newGame 刚算完的那个先手。
  const wait = startCoinFx();
  renderAll();
  // ⭐ AI 先手时**等猜先演完再走**：否则「电脑先走」这句话在屏幕上活不过一帧（等于没做）。
  //   ⛔ 这不是文件头 ② 那种「把玩家的点击吞掉」的锁：这段时间本来就不是玩家的回合，
  //     而玩家先手时下面直接走 else 分支，一毫秒都不挡。
  if (wait > 0 && !C4State.isHumanTurn(G.g)) {
    const my = G.aiSeq;
    _coinTimer = setTimeout(() => {
      _coinTimer = null;
      if (my !== G.aiSeq) return;   // 换局 / 撤销把它作废了
      maybeAI();
    }, wait);
  } else maybeAI();
}

/** 再来一局：⭐ gameNo +1 ⇒ 下一局先手换人（同机双人），人机局同理轮换。 */
function again() {
  const prev = G.g;
  if (!prev) { goHome(); return; }
  G.gameNo++;
  startGame(prev.mode, prev.mode === 'ai' ? prev.tier : undefined);
}

// ════════ 让「输」不疼（P2b Task 6 · DESIGN §6.6）════════
// §6.6 三条：
//   ① 输局结算**不给「你输了」的大字**，只给 **精准度 % + 转折点 + ［从那一步重来］**
//   ② 求解器知道「你差一手就赢了」——那就说出来
//   ③ **精准度创新高时，输局也庆祝**
//
// ⚠⚠ ①③ 里的 **精准度 / 转折点 / 从那一步重来 / 创新高** 全部要 `Solver.scoreAll` 逐手复算，
//   那是 **P3**（§3.3 赛后复盘）—— 局中/结算即时算会撞 §9.2 的断崖（n=10..15 中位 1,678 ms/手）。
//   ⇒ **本 task 只交付版面与措辞那一半**：
//     · HUD 上那句判决式的「你输了」换成中性的「本局结束」（⛔ 不做失败横幅、不加红闪/重震动）；
//     · 结算多出一条**数据条**，精准度与转折点是明写的占位「—」（⛔ 绝不编一个数，DESIGN §2.4）；
//     · 第二个按钮在输局时变成［从那一步重来］，与［复盘］同样是 **disabled 的留位**
//       （⇒ btn 不注册热区 ⇒ ⛔ 不会出现「点了没反应」的假按钮）。
//   ⭐ ② 反而**现在就能真的做**：它是零搜索的（threats.js 的 missedWin）。

/** ⭐ §6.6②：输的那一方是不是真的**曾经差一手就赢**。⛔ 不成立就返回 null（别编）。
 *  ⚠ 只对「坐在这台设备前的那个人」说：
 *    · 人机局 —— 只有**玩家自己输了**才说（玩家赢了却弹一句「电脑差一手就赢了」是噪音，
 *      而且刚好把 §6.5 那 1.5 秒的庆祝冲淡）；
 *    · 同机双人局 —— 输的那一位就在旁边，说的是他（措辞用座位名，不是「你」）。 */
function nearWinOf(winner) {
  const g = G.g;
  if (!g || winner === null) return null;                       // 平局：⛔ 平局不是输，什么都不说
  const loser = winner ^ 1;
  if (g.mode === 'ai' && loser !== C4State.humanPlayer(g)) return null;
  // ⚠⚠ 让子局必须把**只有预置子**的那个盘当重放起点（P2c T1）：预置子不在 g.moves 里，
  //   从空盘重放出来的是另一个局面 ⇒ 这句话会指着一手根本不存在的「制胜手」说话，且零报错。
  //   ⭐ `rewindTo(g,0)` 的语义正好就是它（让子局回到的是「只有预置子」而不是空盘）。
  const mw = C4Threats.missedWin(g.moves, loser,                // ⛔⛔ 零搜索（≤42×7 次 isWinningMove）
                                 C4State.boardOf(C4State.rewindTo(g, 0)));
  return mw ? { player: loser, ply: mw.ply } : null;
}

function checkOver() {
  const bd = C4State.boardOf(G.g);
  const t = RulesClassic.terminal(bd);
  if (t === null) return false;
  const w = RulesClassic.winnerOf(t);
  G.phase = 'OVER';
  G.result = { t: t, winner: w, line: w === null ? null : findWinLine(bd, w), nearWin: nearWinOf(w) };
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
  const bdBefore = C4State.boardOf(G.g);      // ⭐ T5 的双威胁判据要「落子之前」那一份
  const row = C4Render.landingRow(bdBefore, col);
  const player = C4State.turnOf(G.g);
  G.g = C4State.play(G.g, col);
  G.hoverCol = -1;
  if (row >= 0) startDropFx(col, row, player);
  // ⭐ 双威胁（§6.4 下半）。⚠ 必须在 startDropFx **之后**：fx 要问「那枚棋子还差多久落地」
  //   才能把光环与落地对齐（lead）；⛔ 也必须在 checkOver 之前 —— 判据自己会挡终局，
  //   但顺序反了会让「这一手直接连四」的局面多算一遍。
  if (row >= 0) maybeFork(bdBefore, C4State.boardOf(G.g));
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
  G.aiSeq++; setThinking(false); fxStop(); forkRewind(); G.notice = '';
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
  // ⭐⭐ 传给引擎的 position 是**盘面对象**，⛔ 不是手数列表（P2c T1 · DESIGN §6.7）：
  //   让子的预置子不在 `g.moves` 里 ⇒ 传手数列表的话 AI 看到的是一个**少了两枚子的盘**，
  //   它会照着那个不存在的局面走 —— 落子照常、零报错，而整局的应对全是错的。
  //   ⚠ `ConnectAI.toBoard` 从 P1 起就同时收「手数列表」与「棋盘对象」两种形状（ai.js:445），
  //     Worker 那侧原样转给 `decide` ⇒ **一行 worker 都不用改**（它是 P1 冻结件）。
  //   ⚠ 让 0 子时它与 `B.fromMoves(g.moves)` 逐位相同（posHash 只吃 a/b/turn）⇒ 确定性不变。
  const pos = C4State.boardOf(g);
  const tier = g.tier, seed = g.seed;

  // ⭐ 这一手到底会不会搜。⛔ 别按 phase、别按「反正是 AI 的回合」开菊花（见文件头 ③）。
  const heavy = ConnectAI.usesSolver(pos, tier);
  G.lastAiHeavy = heavy;
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const fresh = () => my === G.aiSeq;
  const took = () => Math.round(((typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now()) - t0);

  const fire = () => EngineClient.ai(pos, tier, seed).then(r => {
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
  // ⚠ 判据用**盘上的子数** `pos.n`（⛔ 不是 moves.length）：断崖是「还剩多少空格」定的。
  //   ⚠ 让子局在这一层其实够不着（求解器档不许让子，见 C4State.handicapAllowed），
  //     但判据仍写成 n —— 哪天放开了，写成 moves.length 会静默偏两手。
  if (pos.n <= 9 && !EngineClient.bookReady()) {
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
    // ⭐ 选了别的档 ⇒ 儿童档**退出**（四选一，见 TIER_PRESETS 上方那段）。
    //   ⚠ 让子与舒适模式**保持不动**：那是家长已经改过的东西，⛔ 退出儿童档不该把它们
    //     悄悄回滚（回滚的表现是「我明明设了让 2 子，换个难度就没了」，零报错）。
    case 'TIER':       if (kidsPref()) C4Settings.set('kids', false);
                       G.tier = data.tier; renderAll(); return;
    // ⭐ 儿童档：只在 off → on 那一下套预设（理由见 applyKidsPreset）。
    case 'KIDS':       if (!kidsPref()) applyKidsPreset(); renderAll(); return;
    // ⭐ 设置开关：写完**立刻落盘**（C4Settings.set 自己做），⛔ 别攒到某个「保存」时机。
    case 'TOGGLE_HINTS': C4Settings.toggle('threatHints'); renderAll(); return;
    // ⭐ 减弱动态是**三态** ⇒ 点一下是 cycle（跟随系统 → 强制开 → 强制关 → …），⛔ 不是 toggle。
    case 'CYCLE_MOTION': C4Settings.cycle('reduceMotion'); renderAll(); return;
    // ⚠ 舒适模式改的是版面尺寸 ⇒ renderAll 会用新尺寸**重新注册全部热区**（本引擎每帧重建，
    //   所以这里不用做别的）。⛔ 别忘了这一句：不重画的话按钮变大了但点击窗还是旧的。
    case 'TOGGLE_COMFORT': C4Settings.toggle('comfort'); renderAll(); return;
    // ⭐ 让子（DESIGN §6.7）：0 → 1 → 2 → 0。⚠ 与减弱动态同理是 cycle 不是 toggle
    //   （三档，⛔ 不是布尔）。⚠ 求解器档下这个选择**照样存得住**，只是那一局不生效
    //   （effHandicap 说了算）—— 玩家换回轻松档时不该发现自己的选择被清了。
    case 'CYCLE_HANDICAP': C4Settings.cycle('handicap'); renderAll(); return;
    // ⭐ 对坐模式（DESIGN §6.7）：布尔 ⇒ toggle。⚠ 与让子同理，人机局下这个选择**照样存得住**，
    //   只是那一局不生效（f2fOn 说了算）——⛔ 别在这里替玩家清掉他的选择。
    case 'TOGGLE_F2F': C4Settings.toggle('faceToFace'); renderAll(); return;
    case 'UNDO':       doUndo(); return;
    case 'AGAIN':      again(); return;
    case 'HOME':       goHome(); return;
    default: return;
  }
}

// ════════ 绘制 ════════

// ⭐⭐ 「对手」那一排 = 四个**推荐入口**（DESIGN §3.1「三档只是推荐入口」+ §6.7 儿童档）。
// ⚠ 儿童档挂在**这一排**而不是另开一行开关：玩家找「对手有多强」只会看这里，
//   开成第五行设置等于把它藏起来（家长找不到 = 这条功能等于没做）。而且它是**四选一**，
//   「选了儿童档还能不能选难度」这个问题在版面上就自己回答了 —— 不能，它就是那个难度。
// ⚠ 儿童档的 AI 恰好与「轻松」是同一级（C4State.KIDS_TIER = 3，量出来的，见 state.js）。
//   ⛔ 别因此把两个按钮合并：儿童档还带着**让 2 子 + 孩子恒先手 + 简单文案 + 大字**，
//   一句话是「对手和轻松档是同一个人，只是你多两颗子、还先走」。
const TIER_PRESETS = [
  { key: 'menu.kids',    tier: C4State.KIDS_TIER, kids: true },   // 儿童：见 DESIGN §6.7
  { key: 'menu.easy',    tier: 3  },   // 轻松：不调求解器，秒出
  { key: 'menu.medium',  tier: 12 },   // 进阶：求解器 + 明面失误率
  { key: 'menu.perfect', tier: 20 }    // 完美：零失误（⭐ state.js 会强制玩家先手）
];

/**
 * HOME 上的一行设置。⭐ 三行长一个样（一眼是同一类东西），右侧是**当前值**而不是一个勾。
 * @param icon 可选：在左边画图例，返回文字应该从哪个 x 开始（威胁提示那行画 ▲/◇）
 * ⚠ 标签与值都会被压到装得下为止：德/俄膨胀 + 舒适模式（×1.3）叠加时，
 *   canvas 的 fillText 不换行也不截断，两串会直接压在一起。
 */
function settingRow(bx, y, bw, h, label, value, hot, action, icon, px) {
  fillRR(bx, y, bw, h, 12, 'rgba(255,255,255,0.92)');
  strokeRR(bx + 0.5, y + 0.5, bw - 1, h - 1, 12, C4Render.PAL.hudEdge, 1.5);
  const gy = y + h / 2;
  const tx = icon ? icon(bx, gy, h) : bx + 14;
  // ⚠ px 由 drawHome 的块栈给（矮屏上整栈会一起缩，⛔ 字号不跟着缩就会互相压，见 drawHome）
  const f = 'bold ' + (px || fsz(14)) + 'px sans-serif';
  ctx.font = f;
  const vw = Math.min(bw * 0.5, ctx.measureText(clean(value)).width);
  txtR(wrapLines(value, bw * 0.5, 1)[0], bx + bw - 14, gy,
       hot ? C4Render.PAL.accent : C4Render.PAL.hudSub, f);
  ctx.font = f;
  txtL(wrapLines(label, Math.max(30, bx + bw - 22 - vw - tx), 1)[0], tx, gy, C4Render.PAL.hudText, f);
  addHit(bx, y, bw, h, action, {});
}

/**
 * ⭐⭐ HOME 的竖向排版（P2b T7 · DESIGN §6.9）——**显式的块栈**。
 *
 * 每一块自报**高度**（由它自己的字号/按钮高算出来），间距是唯一可伸缩的东西：
 *   · 装得下还有富余 ⇒ 间距**撑开**（k 最大 1.8）—— 这就是 P2a 点名的「HOME 下半屏
 *     留白较大」的解：844 高的机器上原来内容排到 y=616 就没了，下面 220 px 全空；
 *   · 装不下 ⇒ 间距先收（k → 0）；**还装不下才整栈缩尺寸**（hk，含字号与按钮高）。
 *
 * ⛔⛔ 改之前那版是「间距 = 一串常数 × 系数 k，**字号却不跟着缩**」，于是
 *   360×640 + 舒适模式（§6.8 那两条叠加）下标题、两枚棋子图示、「Opponent」「Level 3」
 *   四块**互相压在一起**（截图肉眼一眼看得出，而脚本全绿 —— 本仓最怕的失败模式）。
 *   现在高度由字号算出来、位置由高度累加 ⇒ **重叠在结构上不可能发生**，
 *   k 只决定「呼吸多大」。⛔ 别再往这里塞「魔数间距」。
 *
 * ⭐ `G.homeRows` 把排完的结果记下来（**只给 E2E / 调试看**，⛔ 不是真值源）：
 *   门禁靠它逐块断言「不重叠 + 不出屏」，⛔ 否则「四行压成一坨」这种事只有肉眼抓得到。
 */
const K_MAX = 2.0;      // 间距最多撑到理想值的 2 倍（再大就散了，见下面 ⛔）
function homeStack(L) {
  const build = hk => {
    const F = px => Math.max(9, Math.round(fsz(px) * hk));
    const B = px => Math.max(30, Math.round(bht(px) * hk));
    const it = [
      { k: 'title',  h: Math.round(F(30) * 1.22), gap: 18, px: F(30) },
      { k: 'glyphs', h: Math.round(F(44) * 1.10), gap: 10, px: F(44) },
      { k: 'tierLb', h: Math.round(F(13) * 1.60), gap: 8,  px: F(13) },
      { k: 'tiers',  h: B(40),                    gap: 6,  px: F(14) },
      { k: 'level',  h: Math.round(F(12) * 1.60), gap: 10, px: F(12) },
      // ⭐ 让子（§6.7）排在**档位与开始按钮之间**：它是「这一局怎么开」的设置，
      //   不是无障碍偏好 ⇒ ⛔ 别丢进下面那三行设置里（家长找不到 = 这条功能等于没做）。
      { k: 'hcap',   h: B(46),                    gap: 8,  px: F(14) },
      // ⭐ 对坐模式（§6.7）与让子并排：两条都是「这一局怎么开」，⛔ 别丢进下面那三行
      //   无障碍设置里（家长找不到 = 这条功能等于没做）。
      { k: 'f2f',    h: B(46),                    gap: 12, px: F(14) },
      { k: 'ai',     h: B(52),                    gap: 12, px: F(16) },
      { k: 'human',  h: B(52),                    gap: 18, px: F(16) },
      { k: 'set1',   h: B(46),                    gap: 8,  px: F(14) },
      { k: 'set2',   h: B(46),                    gap: 8,  px: F(14) },
      { k: 'set3',   h: B(46),                    gap: 14, px: F(14) },
      { k: 'note',   h: Math.round(F(12) * 2.8),  gap: 0,  px: F(12) }
    ];
    return { it: it, fixed: it.reduce((s, i) => s + i.h, 0), gaps: it.reduce((s, i) => s + i.gap, 0) };
  };
  const top0 = L.hud.y, bot = L.SH - L.safeBottom - 14;
  let hk = 1, P = build(1);
  let k = (bot - top0 - P.fixed) / P.gaps;
  // ⚠ 迭代缩而不是一次算：按钮/字号都有下限（B 的 30、F 的 9），闭式解会算错。
  for (let i = 0; i < 14 && k < 0.06; i++) { hk *= 0.94; P = build(hk); k = (bot - top0 - P.fixed) / P.gaps; }
  k = Math.max(0, Math.min(K_MAX, k));
  // ⭐ 撑到 K_MAX 还有富余（高屏 / 平板）⇒ **整栈往下挪到接近垂直居中**（0.45 略偏上）。
  //   ⛔ 别把富余全塞进间距：k 再大就是「一屏五个孤零零的元素」，读起来不是一组东西。
  //   ⛔ 也别一直贴着顶排 —— 那就是 P2a 点名的「HOME 下半屏留白较大」本身
  //     （改之前 844 高的机器上内容 132..616 结束，下面 220 px 全空）。
  const spare = Math.max(0, (bot - top0) - (P.fixed + P.gaps * k));
  const top = top0 + Math.round(spare * 0.45);
  let y = top;
  for (const b of P.it) { b.y = Math.round(y); y += b.h + Math.round(b.gap * k); }
  return { it: P.it, k: k, hk: hk, top: top, at: key => P.it.find(b => b.k === key) };
}

function drawHome(L) {
  const SW = L.SW;
  const es = EngineClient.state();
  const dead = es.worker === 'dead';

  const bw = Math.min(300, SW - 60), bx = (SW - bw) / 2;
  const S = homeStack(L);
  G.homeRows = S.it.map(b => ({ k: b.k, y: b.y, h: b.h }));
  const mid = b => b.y + b.h / 2;

  let b = S.at('title');
  txt(T('app.title'), SW / 2, mid(b), '#1f6e4d', 'bold ' + b.px + 'px sans-serif');

  // 两枚棋子当门面：进游戏前就先看见「两方不是同一个圆换色」
  // ⚠ 左右偏移跟着图示自己的尺寸走（⛔ 别写死 ±34：整栈缩小时两枚会分家）
  b = S.at('glyphs');
  C4Render.drawGlyph(0, SW / 2 - b.px * 0.78, mid(b), b.px);
  C4Render.drawGlyph(1, SW / 2 + b.px * 0.78, mid(b), b.px);

  b = S.at('tierLb');
  txt(T('menu.tier'), SW / 2, mid(b), C4Render.PAL.hudSub, b.px + 'px sans-serif');

  b = S.at('tiers');
  // ⚠ 四个入口挤一排 ⇒ 间距收到 6（三个时是 8）。⚠ 字号由 fitTxt 自己缩到装得下，
  //   ⛔ 别在这里写死一个更小的 px：德/俄那种长词会在别的语言上先炸。
  const kd = kidsPref();
  const gapT = 6;
  const cw = (bw - gapT * (TIER_PRESETS.length - 1)) / TIER_PRESETS.length;
  TIER_PRESETS.forEach((p, i) => {
    // ⭐ 儿童档与三个难度是**四选一**：儿童档开着时，即使 G.tier 恰好等于某个预设的 tier
    //   （KIDS_TIER 就等于「轻松」那一档），那个按钮也**不许**同时高亮 —— 两个亮着的按钮
    //   会让玩家以为自己选了两样东西。
    const sel = p.kids ? kd : (!kd && G.tier === p.tier);
    btn(bx + i * (cw + gapT), b.y, cw, b.h, T(p.key), p.kids ? 'KIDS' : 'TIER', { tier: p.tier }, {
      bg: sel ? C4Render.PAL.accent : 'rgba(255,255,255,0.92)',
      fg: sel ? '#fff' : C4Render.PAL.hudText,
      outline: sel ? null : C4Render.PAL.hudEdge,
      px: b.px, disabled: dead
    });
  });

  b = S.at('level');
  // ⭐ 儿童档下这一行不写「第 3 级」——「不说难懂的话」（§6.7）。写的是玩家**真正**拿到的
  //   那两样东西（先手 + 让子），⛔ 不是一个级别号：级别号对家长毫无信息量。
  txt(kd ? T('menu.kidsLine', { n: C4Settings.get('handicap') }) : T('game.level', { n: G.tier }),
      SW / 2, mid(b), C4Render.PAL.hudSub, b.px + 'px sans-serif');

  // ⭐⭐ 让子（DESIGN §6.7）：「弱的一方可预置 1-2 枚子 —— 这是让全家人一起玩下去的唯一办法。」
  //   左边把**预置子本身**画出来当图例（同 threatHints 那行的理由：让「让 2 子」是一件看得见
  //   的事，⛔ 不要只写一行字让家长去猜到底会发生什么）。
  //   ⚠ 右侧在求解器档下必须**如实说它这一局不生效**（§2.4：降级必须可见）——
  //     ⛔ 绝不许「界面上写着让 2 子、开局却是普通局」。
  const hcap = C4Settings.get('handicap');
  const hcapOn = C4State.handicapAllowed('ai', G.tier);
  b = S.at('hcap');
  //   ⚠ 不生效时**只写那句「仅…」**，⛔ 别拼成「2 枚 · 仅轻松档与双人」——
  //     settingRow 的值栏只有 `bw*0.5` 宽且 `wrapLines(…,1)` 只留一行，拼长了会被**截断**
  //     （截断之后剩下的半句话比不写更糟）。枚数由左边的图例照常显示，信息没丢。
  settingRow(bx, b.y, bw, b.h, T('menu.handicap'),
             hcap === 0 ? T('menu.off')
                        : (hcapOn ? T('menu.handicapN', { n: hcap }) : T('menu.handicapNA')),
             hcap > 0 && hcapOn, 'CYCLE_HANDICAP', (x, gy, h) => {
               if (hcap === 0) return x + 14;
               const gs = Math.min(fsz(24), Math.round(h * 0.58));
               // ⭐ 图例必须画**弱方真正会拿到的那种棋子**（截图实锤）：预置子恒归弱方，
               //   而弱方坐哪个位取决于谁先手 —— 让子局是强方先手 ⇒ 弱方是 ◇（第 2 号子）；
               //   **儿童档里孩子恒先手 ⇒ 他拿的是 ▲（第 1 号子）**。
               //   ⛔ 写死 1 的话，儿童档下图例画 ◇、盘上却是 ▲ —— 家长照着图例找不到自己的子，
               //   而画面「看起来完全正常」（本仓最怕的失败模式）。
               const owner = kd ? 0 : 1;
               for (let i = 0; i < hcap; i++) C4Render.drawGlyph(owner, x + 12 + gs / 2 + i * (gs + 4), gy, gs);
               return x + 20 + hcap * (gs + 4);
             }, b.px);

  // ⭐⭐ 对坐模式（DESIGN §6.7）：「两人各自面向自己那侧（平板尤其自然）」。
  //   ⚠ 「只对双人局生效」这件事写在**标签**里（「对坐模式（双人）」）而不是右边的值栏 ——
  //     值栏只有 `bw*0.5` 宽且 `wrapLines(…,1)` 只留一行，把「开 · 仅双人」拼进去会被
  //     **截断**成半句话（T1 在让子那行踩过，⛔ 别再踩一次）。
  //   ⭐ 左边的图例画的是**这条功能本身**：一枚正着的棋子 + 一枚倒过来的三角 ——
  //     ⛔ 别只写一行字（家长得先猜「对坐模式」是什么才敢点）。
  const f2f = f2fPref();
  b = S.at('f2f');
  settingRow(bx, b.y, bw, b.h, T('menu.faceToFace'), T(f2f ? 'menu.on' : 'menu.off'),
             f2f, 'TOGGLE_F2F', (x, gy, h) => {
               const gs = Math.min(fsz(26), Math.round(h * 0.62));
               C4Render.drawThreatGlyph(0, x + 12 + gs / 2, gy, gs);
               // 第二枚**旋转 180°** 画出来 = 这条功能的图例本身（对面那个人看到的样子）
               ctx.save();
               const px2 = x + 16 + gs * 1.5;
               ctx.translate(px2, gy); ctx.rotate(Math.PI); ctx.translate(-px2, -gy);
               C4Render.drawThreatGlyph(0, px2, gy, gs);
               ctx.restore();
               return x + 24 + gs * 2;
             }, b.px);

  b = S.at('ai');
  btn(bx, b.y, bw, b.h, T('menu.vsAI'), 'PLAY_AI', {}, { disabled: dead, px: b.px });
  b = S.at('human');
  btn(bx, b.y, bw, b.h, T('menu.vsHuman'), 'PLAY_HUMAN', {}, { bg: '#61776f', px: b.px });

  // ⭐ 设置入口（P2b T4 一行 + T6 两行）。⚠ 这里仍然不做完整设置页 —— 三行还压得住，
  //   做成页反而多一次点击（⚠ 再多就该收进页里了）。
  // ⭐ 威胁提示那行左边直接把**两个标记本身**画出来当图例：玩家第一次进游戏就知道 ▲ / ◇ 是什么，
  //   ⛔ 别只写一行「威胁提示」——那样标记的含义要靠猜（而这功能就是给读不出局面的人做的）。
  const hintsOn = C4Settings.get('threatHints');
  b = S.at('set1');
  settingRow(bx, b.y, bw, b.h, T('menu.threatHints'), T(hintsOn ? 'menu.on' : 'menu.off'),
             hintsOn, 'TOGGLE_HINTS', (x, gy, h) => {
               const gs = Math.min(fsz(28), Math.round(h * 0.66));   // ⭐ 跟着舒适模式放大，但不超过行高
               C4Render.drawThreatGlyph(0, x + 12 + gs / 2, gy, gs);
               C4Render.drawThreatGlyph(1, x + 16 + gs * 1.5, gy, gs);
               return x + 24 + gs * 2;
             }, b.px);

  // ⭐⭐ 减弱动态（§6.8）：**三态**。右侧显示的是「当前档」，且 'auto' 那档把**实际结果**
  //   也写出来（「跟随系统 · 开」）—— ⛔ 只写「跟随系统」的话，玩家根本不知道现在到底动不动，
  //   而这正是他点开这一行想知道的事。
  const mode = C4Settings.get('reduceMotion');
  const eff = reduceMotion();
  const modeTxt = mode === 'auto'
    ? T('menu.motionAuto') + ' · ' + T(eff ? 'menu.on' : 'menu.off')
    : T(mode === 'on' ? 'menu.on' : 'menu.off');
  b = S.at('set2');
  settingRow(bx, b.y, bw, b.h, T('menu.reduceMotion'), modeTxt, eff, 'CYCLE_MOTION', null, b.px);

  // ⭐ 舒适模式（§6.8）：大字 + 更大点击窗。用户画像 4 岁到 80 岁。
  const cmf = comfortOn();
  b = S.at('set3');
  settingRow(bx, b.y, bw, b.h, T('menu.comfort'), T(cmf ? 'menu.on' : 'menu.off'),
             cmf, 'TOGGLE_COMFORT', null, b.px);

  // ⭐ 引擎状态如实写出来（DESIGN §2.4：降级必须**可见**）
  let note = '';
  if (dead) note = T('game.engineDown');
  else if (es.worker !== 'alive') note = T('game.enginePrep');
  else if (es.book === 'loading') note = T('game.bookLoading');
  else if (es.book === 'failed') note = T('game.engineSlow');
  if (note) {
    b = S.at('note');
    const f = b.px + 'px sans-serif';
    ctx.font = f;
    const lh = Math.round(b.px * 1.35);
    wrapLines(note, bw, 2).forEach((ln, i) =>
      txt(ln, SW / 2, b.y + lh * 0.7 + i * lh, dead ? '#a33' : C4Render.PAL.hudSub, f));
  }
}

/** 悬停带里的一条状态：思考中三点 / 诚实措辞。（有悬停预览时那里是棋子，不画这个） */
function drawDropBand(L) {
  if (G.hoverCol >= 0) return;
  const cx = L.drop.x + L.drop.w / 2, cy = L.drop.y + L.drop.h / 2;
  if (G.thinking) {
    const label = T(kidsGame() ? 'kids.thinking' : 'game.thinking');
    const f = 'bold ' + fsz(14) + 'px sans-serif';
    ctx.font = f;
    const tw = ctx.measureText(clean(label)).width;
    const bw = Math.min(L.drop.w - 8, tw + 60);
    fillRR(cx - bw / 2, cy - 17, bw, 34, 17, 'rgba(255,255,255,0.92)');
    txt(label, cx - 14, cy, C4Render.PAL.hudText, f);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + bw / 2 - 34 + i * 10, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = i === G.spin ? C4Render.PAL.accent : 'rgba(47,143,106,0.28)';
      ctx.fill();
    }
    return;
  }
  // ⭐⭐ 猜先卡（P2c T3 · §6.7）。⚠ 排在「思考中」**之后**：AI 真的在算的时候那句反馈更要紧。
  //   ⭐ `C4Fx.poseCoin()` 为 null（播完了 / 减弱动态压根没 start）⇒ 退回**静态终态**
  //     （正面朝上 + 那句「谁先走」）—— 与赢局那条 fail-safe 同一个写法：
  //     ⛔ 关掉的是硬币在转，**不是**「谁先手」这条信息。
  if (coinShown()) {
    const cf = C4Fx.poseCoin();
    G.coinRect = C4Render.drawCoin(L, cf || { face: 0, w: 1 }, coinLabel(G.g),
                                   comfortOn() ? COMFORT_TEXT : 1);
    return;
  }
  if (G.notice) {
    const f = fsz(12) + 'px sans-serif';
    ctx.font = f;
    wrapLines(G.notice, L.drop.w - 24, 2).forEach((ln, i) =>
      txt(ln, cx, cy - 7 + i * 15, '#a33', f));
    return;
  }
  // ⭐⭐ §6.6②「你差一手就赢了」——求解器知道，那就说出来。⚠ 只在**真的成立**时才有这一句
  //   （nearWinOf 已经把「不成立就 null」钉死了），⛔ 别在这里补一句「安慰用」的兜底文案。
  //   ⚠ 措辞停在**事实**那一侧：说的是「那一手你有一个落下去当场连四的列」，
  //     ⛔ 不是「你本来赢定了」——后者要搜索才敢说（P3 的转折点）。
  // ⭐ 儿童档下**不说这一句**（§6.7「不说难懂的话」）：「你在第 17 手时只差一步就赢了」
  //   对 4-5 岁既读不懂、也是在复盘一次失败 —— 与「让输不疼」正好反着。⛔ 别改成儿童版措辞：
  //   这条信息本身（第几手 / 差一步）就不是这个年龄段的东西，改词也没用。
  const nw = (G.phase === 'OVER' && G.result && !kidsGame()) ? G.result.nearWin : null;
  if (nw) {
    const g = G.g;
    const label = g.mode === 'ai'
      ? T('game.nearWinYou', { n: nw.ply })
      : T('game.nearWinP', { p: seatName(g, nw.player), n: nw.ply });
    const f = 'bold ' + fsz(12) + 'px sans-serif';
    ctx.font = f;
    const lines = wrapLines(label, L.drop.w - 40, 2);
    const bw = Math.min(L.drop.w - 8, Math.max.apply(null, lines.map(s => ctx.measureText(s).width)) + 30);
    const bh = lines.length > 1 ? 40 : 30;
    fillRR(cx - bw / 2, cy - bh / 2, bw, bh, bh / 2, 'rgba(255,255,255,0.92)');
    strokeRR(cx - bw / 2 + 0.5, cy - bh / 2 + 0.5, bw - 1, bh - 1, bh / 2, C4Render.PAL.hudEdge, 1);
    lines.forEach((ln, i) => txt(ln, cx, cy - (lines.length - 1) * 7.5 + i * 15,
                                 C4Render.PAL.hudText, f));
  }
}

function hudInfo(g) {
  // ⭐⭐ 儿童档「不说难懂的话」（DESIGN §6.7）：HUD 那一行是全屏最大的字，也是孩子唯一
  //   会去读的一行 ⇒ 整条换成儿童版措辞。⛔ 别只把「思考中」改掉就算完 ——
  //   「本局结束」「轮到你了」对一个 5 岁孩子同样是书面语。
  //   ⚠ 判据是 `kidsGame()`（这一局是不是），⛔ 不是设置里选了什么（见 kidsPref 上方那段）。
  if (C4State.kidsOf(g)) {
    if (G.phase === 'OVER' && G.result) {
      const w = G.result.winner;
      if (w === null) return { turn: null, left: T('kids.draw') };
      // ⚠ §6.6「让输不疼」在儿童档里更要紧：输局**只**给一句轻的，⛔ 不给「你输了」。
      return { turn: w, left: T(w === C4State.humanPlayer(g) ? 'kids.win' : 'kids.roundOver') };
    }
    const kt = C4State.turnOf(g);
    if (C4State.isHumanTurn(g)) return { turn: kt, left: T('kids.yourTurn') };
    return { turn: kt, left: T(!G.thinking && G.notice ? 'game.stopped' : 'kids.thinking') };
  }
  if (G.phase === 'OVER' && G.result) {
    const w = G.result.winner;
    if (w === null) return { turn: null, left: T('game.draw') };
    if (g.mode === 'ai') {
      // ⭐⭐ §6.6：输局**不给「你输了」的大字** —— 这里给的是中性的一句「本局结束」，
      //   ⛔ 别改回判决式措辞（那句话在 HUD 上是全屏最大的一行，正是 §6.6 要拿掉的东西）。
      //   分析（精准度 / 转折点 / 从那一步重来）在盘下面的结算区，那才是输局该看的内容。
      return { turn: w, left: T(w === C4State.humanPlayer(g) ? 'game.win' : 'game.roundOver') };
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

/** 人机局里**玩家自己输了**这一局。（同机双人局没有「你输了」这回事 ⇒ 恒 false） */
function isLoss() {
  const g = G.g, r = G.result;
  return !!(g && r && G.phase === 'OVER' && r.winner !== null
            && g.mode === 'ai' && r.winner !== C4State.humanPlayer(g));
}

/**
 * ⭐ 结算的数据条（DESIGN §6.6 / §4「精准度：这个游戏的分数」）。
 *
 * ⚠⚠ 两个值现在都是明写的占位「—」，这是**故意的**：真值要 `Solver.scoreAll` 把整局逐手
 *   复算（§3.3 赛后复盘 = P3），而局中/结算即时算会撞 §9.2 的断崖（n=10..15 中位 1,678 ms/手）。
 *   ⛔⛔ 绝不许为了「看起来完整」编一个数字（DESIGN §2.4：宁可空着也不许谎报）——
 *   精准度是这个游戏的分数，编出来的分数会一路污染纪录、课程推荐和「创新高」判定。
 * ⭐ P3 填的时候：把这两个「—」换成真值即可，版面一个像素都不用动（这条位就是为它留的）。
 */
function drawSettleStats(x, y, w, h) {
  if (!(h > 0)) return;
  fillRR(x, y, w, h, 12, 'rgba(255,255,255,0.92)');
  strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, 12, C4Render.PAL.hudEdge, 1.5);
  const half = w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + half, y + 8); ctx.lineTo(x + half, y + h - 8);
  ctx.strokeStyle = C4Render.PAL.hudEdge; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  const cell = (cx, label) => {
    fitTxt(label, cx, y + h * 0.33, half - 18, C4Render.PAL.hudSub, 'normal', fsz(11));
    fitTxt(SETTLE_PENDING, cx, y + h * 0.71, half - 18, C4Render.PAL.hudText, 'bold', fsz(16));
  };
  cell(x + half / 2, T('game.accuracy'));
  cell(x + half * 1.5, T('game.turningPoint'));
}
/** 占位符：⛔ 别换成 "0%" / "—%"（会被读成「你这局 0 分」，那是编出来的信息）。 */
const SETTLE_PENDING = '—';

/**
 * ⭐⭐ 儿童档「赢了大撒花」（DESIGN §6.7 的第三条）。
 *
 * 它**占的正是**上面那张数据条的位置 —— 这是故意的，一举两得：
 *   · 「精准度 —／转折点 —」对 4-5 岁是纯噪音（而且现在还是占位符），儿童档下本来就该拿掉；
 *   · 腾出来的那一格正好给庆祝，⛔ 不必为了撒花去挤棋盘（§6.9 的退让顺序）。
 *
 * ⚠ **只在孩子赢的时候画**（输/平一律不画，那一格连位置都不留 —— 见 drawPlay 里的 statH）。
 *   §6.6「让输不疼」在这里是硬的：输局给一句轻的就够了，⛔ 绝不给一张「安慰卡」。
 * ⚠ 星星是**画出来的形状**不是字体字形：canvas 上 '★' 在部分安卓 WebView 里会落到
 *   缺字回退框（豆腐块）——一个「画面上多了一排方块」的静默失败。
 * ⚠ ⛔ 它**不做粒子动画**：减弱动态（§6.8）下必须能整条跳过，而这一格是**静态终态**
 *   ⇒ 天然满足，不必再加第二套开关（fx.js 的三个门控点一个都不用动）。
 */
function drawKidsCheer(x, y, w, h) {
  if (!(h > 0)) return;
  fillRR(x, y, w, h, 12, '#ffd75e');
  strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, 12, '#e0a91d', 1.5);
  const cy = y + h / 2;
  const s = Math.min(h * 0.30, 16);
  // 左右各三颗星，中间留给大字
  for (let i = 0; i < 3; i++) {
    drawStar(x + 16 + i * (s * 1.7), cy, s, '#f6a21d');
    drawStar(x + w - 16 - i * (s * 1.7), cy, s, '#f6a21d');
  }
  const inner = w - 12 * s;
  fitTxt(T('kids.cheer'), x + w / 2, cy, Math.max(60, inner), '#8a5a00', 'bold', fsz(20));
}

/** 五角星（⛔ 不用 '★' 字符，理由见 drawKidsCheer）。 */
function drawStar(cx, cy, r, color) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 === 0) ? r : r * 0.45;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * ⭐⭐ 盘下那块净空（`L.tray`）里到底怎么排（P2b T7 · DESIGN §6.9）。
 *
 * 对局中 = 一行［撤销］［菜单］；结算 = **数据条 + 两行按钮**（§6.5 + §6.6）：
 *   数据条给 §6.6 的「精准度 / 转折点」留位；第一行只放主 CTA［再来一局］+ 第二个按钮；
 *   ［撤销］［菜单］退到第二行 —— 「再来一局」必须是一眼看到的那一个，不是三选一。
 *
 * ⚠ tray 的高度由 layout 保证 ≥ `C4Render.TRAY_MIN`（够一行**舒适模式**按钮），
 *   但**结算屏那三块**在矮屏（640 高）与横屏（1024×768）上仍然放不下 ⇒ 必须退让。
 * ⭐⭐ 退让的**顺序是承重的**：
 *   ① 先收间距（12 → 8）；
 *   ② 再丢**数据条** —— 它现在画的是两个「—」的**留位**，让路的成本最低；
 *   ③ 最后才缩行高，且**下限 36 px**。
 *   ⛔ 绝不许反过来先缩按钮：舒适模式（§6.8）存在的全部理由就是按钮更大、点得中；
 *     为了给一个占位卡片腾地方把按钮缩回去，等于把 §6.8 削掉一半。
 *   ⛔ 更不许「挤不下就往上顶」—— 往上就是棋盘（这正是改之前的 bug）。
 */
function trayPlan(L, over) {
  const avail = Math.max(0, L.tray.h - 10);      // 盘底与第一行之间留一点呼吸
  const rows = over ? 2 : 1;
  let gap = 12, rowH = bht(46), statH = over ? bht(40) : 0;
  const H = () => rowH * rows + gap * (rows - 1) + (statH ? statH + gap : 0);
  if (H() > avail) gap = 8;
  if (H() > avail && statH) statH = 0;
  if (H() > avail) rowH = Math.max(36, Math.floor((avail - gap * (rows - 1)) / rows));
  return { gap: gap, rowH: rowH, statH: statH, h: H() };
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
  const ffx = C4Fx.poseFork();  // ⭐ T5：双威胁的光环（播完 ⇒ null ⇒ 一个像素都不画）

  // ⭐ 威胁高亮（DESIGN §6.4 上半）。⛔⛔ **零搜索**：C4Threats.cells 只做 ≤14 次
  //   B.isWinningMove（微秒级）。⛔ 这里绝不许出现 EngineClient.scores / Solver.*——
  //   §9.2 的断崖是每手 1.7 秒，而这一行每帧都要跑（e2e-p2b-t4 用调用计数钉死）。
  // ⚠ 终局不标（line 非空时 drawBoard 自己也会忽略，这里先省掉计算）。
  G.threats = (!line && C4Settings.get('threatHints')) ? C4Threats.cells(bd) : [];

  C4Render.drawBoard(bd, {
    L: L,
    hoverCol: G.hoverCol,
    hoverPlayer: C4State.turnOf(g),
    winLine: line,
    threats: G.threats,
    // ⭐ 双威胁的光环（§6.4 下半）。⚠ 它**不吃** threatHints 那个开关（那关的是常驻标记
    //   这份信息，这里是一个事件）；要门控它的是 T6 的减弱动态，而门控点在 fx 的 start。
    fork: ffx,
    // ⭐ 三条曲线全部来自 fx（⛔ 别在这里另算时间）：庆祝在跑时用它的，播完退回静态终态。
    dim: line ? (wfx ? wfx.dim : C4Fx.DIM_MAX) : 0,
    lineProg: wfx ? wfx.prog : 1,
    lit: wfx ? wfx.lit : null,
    lastMove: null,
    anim: drops            // ⭐ 正在下落的棋子（空数组 = 没有动画，drawBoard 一切照旧）
  });

  const info = hudInfo(g);
  // ⭐ 右侧那串就是「先手指示」：同机双人局逐局翻转，第二局肉眼可见换了人。
  // ⭐ 儿童档下右上角写「儿童档」而不是「第 3 级」（§6.7「不说难懂的话」）——
  //   ⚠ 而且它必须**看得见**：这一局到底是不是儿童档是家长唯一能在局中确认的地方。
  info.right = g.mode === 'ai'
    ? (C4State.kidsOf(g) ? T('menu.kids') : T('game.level', { n: g.tier }))
    : T('game.gameLine', { n: g.gameNo + 1, p: firstSeatName(g) });
  // ⭐ 舒适模式（§6.8）：HUD 的字也一起放大。⚠ HUD 的**高度**不跟着变（那是 layout 的事）。
  C4Render.drawHUD(info, L, comfortOn() ? COMFORT_TEXT : 1);

  // ⭐⭐ 对坐模式（P2c T3 · §6.7）：盘上方那条**旋转 180°** 的第二 HUD —— 给坐在对面
  //   那个人读的。⚠ 内容与下面那条**逐字相同**（同一个 info 对象）：⛔ 两条 HUD 说不同的话
  //   就是两个真值，桌子两边的人会为「到底轮到谁」吵起来。
  //   ⚠ 位置来自 layout 的 `L.reserve`（§6.9 具名留出的那块，F2F_RESERVE 已经把它进了
  //     cell 的预算）⇒ ⛔ 它在结构上压不到棋盘。
  if (L.faceToFace && L.reserve.h >= C4Render.HUD_H) {
    const rect = { x: L.reserve.x, y: L.reserve.y, w: L.reserve.w, h: C4Render.HUD_H };
    C4Render.drawHUD(info, L, comfortOn() ? COMFORT_TEXT : 1, { rect: rect, flip: true });
    G.f2fRect = rect;
  }

  drawDropBand(L);

  // ⭐⭐ 按钮 / 结算内容一律排进 layout 给的 **L.tray**（盘底之下的净空，P2b T7 · §6.9）。
  //   ⛔ 别再自己从盘底往下量：改之前那版是「ry = 盘底 + 16，装不下就往上顶」，
  //     于是**顶到盘上**去了 —— 实测 1024×768 对局中按钮压着盘底 15 px 还掉出屏幕，
  //     五视口 × 结算屏 10 个组合里 6 个在压盘。而「赢局那条连线必须一直看得见」是 §6.3。
  const plan = trayPlan(L, G.phase === 'OVER');
  const gap = plan.gap, rowH = plan.rowH;
  // ⭐ 儿童档的结算（§6.7）：数据条整条拿掉（「精准度 —／转折点 —」对 4-5 岁是噪音），
  //   那一格**只在孩子赢的时候**换成撒花；输/平连位置都不留（§6.6 让输不疼，⛔ 不给安慰卡）。
  const kidsCheer = kidsGame() && G.phase === 'OVER' && G.result
                    && G.result.winner !== null && G.result.winner === C4State.humanPlayer(g);
  const statH = (kidsGame() && !kidsCheer) ? 0 : plan.statH;
  // ⭐ **底部对齐**：结算多出来的两块（数据条 + 主 CTA 行）从**棋盘那一侧**长出来，
  //   ［撤销］［菜单］原地不动 —— 玩家刚才在看的那两个按钮不会在结算那一刻跳走。
  //   ⚠ 同时按钮贴着底部安全区 = 竖屏手机上拇指最舒服的位置。
  let ry = L.tray.y + Math.max(0, L.tray.h - plan.h);
  const marg = L.tray.x;
  const full = L.tray.w;

  if (G.phase === 'OVER') {
    if (kidsCheer) drawKidsCheer(marg, ry, full, statH);
    else drawSettleStats(marg, ry, full, statH);
    if (statH) ry += statH + gap;
    // ⭐ 主 CTA：庆祝一播完就进焦点态（⛔ 但从终局第一帧起就**点得动** —— 热区在这里注册，
    //    与 overReady 无关；「庆祝期间点得动」由 e2e-p2b 用真实鼠标钉死）。
    // ⭐ 儿童档下它**占满整行**：第二个按钮（复盘 / 从那一步重来）是 P3 的留位，措辞对 4-5 岁
    //   既读不懂又点不动 —— 一个读不懂的灰按钮就是噪音（§6.7「不说难懂的话」）。
    const kd = kidsGame();
    const wMain = kd ? full : Math.round((full - gap) * 0.60);
    btn(marg, ry, wMain, rowH, T(kd ? 'kids.again' : 'game.again'), 'AGAIN', {}, {
      bg: G.overReady ? '#37a87c' : C4Render.PAL.accent,
      focus: G.overReady, size: 17
    });
    // ⭐ 第二个按钮：**输局是［从那一步重来］**（DESIGN §6.6 点名的那一个），其余是［复盘］（§3.3）。
    //   ⚠ 两个都是 disabled 的**留位**（转折点/复盘都要 scoreAll ⇒ P3）：
    //     disabled ⇒ btn 不注册热区 ⇒ 点不出任何反应，⛔ 不许做成「点了没反应」的活按钮
    //     —— 假按钮比没按钮更伤（玩家会以为坏了）。P3 填内容时去掉 disabled + 加 dispatch 分支。
    const lost = isLoss();
    if (!kd) {
      btn(marg + wMain + gap, ry, full - wMain - gap, rowH,
          T(lost ? 'game.replayFrom' : 'game.review'), lost ? 'REPLAY_FROM' : 'REVIEW', {},
          { disabled: true, size: 15 });
    }
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
  // ⚠ 每帧清掉：这两个矩形是「上一帧画在哪」，⛔ 不是真值源 —— 不清的话门禁会拿着
  //   一个早就不画了的矩形去取样，量到的是别的东西（而且看起来很合理）。
  G.coinRect = null; G.f2fRect = null;
  const L = curLayout();
  G.L = L;
  C4Render.drawBackground(L);
  if (G.phase === 'HOME' || !G.g) drawHome(L);
  else drawPlay(L);
}

// ════════ 启动 ════════

async function boot() {
  // ⚠⚠ 设置的 key 必须一起 hydrate：Platform.storage 在**原生壳**里是「先异步灌进内存缓存、
  //   之后同步读」的门面（engine/platform.js:19-29）。漏了这一句，web 上因为有 localStorage
  //   兜底看起来一切正常，**只有装成 app 之后**设置才会每次启动都退回默认 —— 零报错。
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('settings')]);
  // ⭐ 必须在 hydrate **之后**、第一次 renderAll **之前**接后端（HOME 首帧就要读 threatHints）。
  C4Settings.attach(Platform.storage, CFG.key('settings'));
  // ⭐ 上次退出时开着儿童档 ⇒ 选中的档位要跟着回到儿童档那一级。⛔ 少了这一句，
  //   HOME 上「儿童」按钮是高亮的、而让子那行按 G.tier（默认 3）去判能不能让子 ——
  //   两者只在 KIDS_TIER 恰好等于 3 时碰巧一致，改一次 KIDS_TIER 就静默错开。
  if (C4Settings.get('kids')) G.tier = C4State.KIDS_TIER;
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
  // ⭐ 系统的 prefers-reduced-motion 改了要重画：'auto' 那一档右侧写的是**实际结果**
  //   （「跟随系统 · 开」），不重画的话它会一直停在改之前那句上（画面照常、零报错）。
  try {
    sysReduceMotion();
    if (_mqReduce && _mqReduce.addEventListener) _mqReduce.addEventListener('change', () => renderAll());
    else if (_mqReduce && _mqReduce.addListener) _mqReduce.addListener(() => renderAll());   // 老 Safari
  } catch (e) { /* 没有 matchMedia 的壳：设置里仍然能强制开/关 */ }
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
