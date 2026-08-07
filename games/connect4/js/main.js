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
  // ⭐ adPending = 「这一局该放的插屏欠着，等庆祝演完再放」（⛔ 不进存档：纯这一屏的时序状态）。
  //   ⚠ 存在的理由：记账现在从 checkOver 就进一次（让子/儿童档那两种局根本没有 onIdle），
  //     而那一刻连线才刚开始画 —— 直接放插屏就是**盖在庆祝上**（§6.5）。
  adPending: false,
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
  // ── ⭐ 双人局的悔棋请求（P2c T4 · DESIGN §6.7「不许单方悔棋 —— 对方同意才悔」）──
  // ⭐ `undoAsk` = 「有一个悔棋请求正等着回答」。null = 没有。
  //   ⛔ **不进 G 的存档对象**（照 T3 对坐模式的先例，与 T2 儿童档相反）：它一条规则都不改、
  //     也不属于「这一局是什么」，它是**这一屏此刻在问一句话**。存它只会白 bump 一次
  //     SAVE_VERSION 把所有老档判死，还会让一份存档被读回来时**卡在一个没人回答得了的问句上**。
  undoAsk: null,      // { to: 0|1（该回答的那一位）, by: 0|1（请求方）, ply: number }
  // ── ⭐ 提示（P3 T3 · DESIGN §3.2「分层，且**永远免费**」）──
  // ⭐ `hint` = 「这一手的提示按到第几层了」。**⛔ 不进存档**（照 undoAsk 的先例）：
  //   它不改任何规则，只是这一屏此刻在说一句话。
  //   ⚠ `ply` 是它属于**哪一手** —— 落子/撤销之后这条提示就过期了（⛔ 别让上一手的答案
  //     挂在这一手上：那是「看起来完全合法」的错答案，本仓最怕的失败模式）。
  //   level: 0 没按 / 1 只说关不关键（不剧透）/ 2 指出走哪列 + 一句机械导出的理由
  hint: null,         // { ply, level, kind, safe, total, col, reason, pending, why }
  hintRect: null,     // 上一帧提示条画在哪（只给 E2E 取样，⛔ 不是真值源）
  // ── ⭐ 妙手 ✨（P3 T4 · DESIGN §3.4）──
  // ⭐ 计数与最近一次**只给 E2E / 调试看**（⛔ 不是真值源：妙手是 (真值, 落子) 的纯函数，
  //   随时现算得出来 ⇒ ⛔ 不进存档、不必 bump SAVE_VERSION）。
  brilliantCount: 0,
  lastBrilliant: null,   // { ply, col, player }
  brilliantNote: null,   // { until, col } —— 盘下那行 ✨ 还该不该画
  // ── ⭐ 复盘页（P3 T5 · DESIGN §3.3）──
  // ⭐ `review` 是**打开那一刻现算的快照**（⛔ 不进存档：它由 moves + 真值缓存随时重建）。
  review: null,          // { labels, ready, done, total, tp }
  // ⭐ 这一局的精准度记进纪录了没有（⛔ 幂等用，别记两次）。⚠ 不进存档：它是「这一屏的事」。
  accRecorded: false,
  // ⭐ 记的那一刻它**是不是新高**（⛔ 别事后拿纪录反推：写进去之后就比不出来了）
  accWasRecord: false,
  // ⭐ 这一局用过提示没有（§7.8 的「零提示胜率」判据）。⚠ 不进存档：它是「这一局的事」。
  hintUsed: false,
  // ── ⭐ 课程（P4 · §5）──
  // ⭐ `lesson` = 「现在在上哪一课、这道题是什么」。⛔ 不进存档（题目由求解器无限供给，
  //   存了反而会把一道过期的题带回来）；**做完哪几课**存在 settings 的 lessonsMask 位图里。
  lesson: null,          // { id, moves, sa, picked, judged, loading, why }
  pageBack: null,        // 二级页返回键画在哪（只给 E2E 取样）
  reviewBack: null,      // 上一帧返回键画在哪（只给 E2E 取样，⛔ 不是真值源）
  askRect: null,      // 上一帧确认条画在哪（只给 E2E 取样，⛔ 不是真值源）
  askRectF2F: null,   // 对坐模式下那条**旋转 180°** 的确认条画在哪（同上）
  // ── ⭐ 限时模式（P2c T5 · DESIGN §6.10）──
  // ⭐ 这三个都**只给 E2E / 调试看**（⛔ 不是真值源：表的真值恒在 C4Clock，每拍现问）。
  clockKey: null,     // 现在在给哪一手计时（null = 没有表在跑）
  clockBlock: null,   // 这一拍**为什么**停表（null = 没停）——见 clockBlock()
  clockOn: false,     // 上一帧到底画没画倒计时
  // ⭐ 「时间到 · 第 N 列由时钟落下」这条**归因**（⛔ 不进存档：存档里记的是 g.auto 那个 ply）。
  autoNote: null,     // { col, player, until }
  // 猜先要占到哪一刻为止（**停表**用，见 clockBlock 的 'coin' 那一支）
  coinUntil: 0,
  // ── 竖屏留白（P2b T7 · DESIGN §6.9）──
  // ⭐ HOME 上每一块排完的 { k, y, h }，**只给 E2E / 调试看**（⛔ 不是真值源，每帧重排）。
  //   门禁靠它断言「块与块不重叠、都不出屏」—— ⛔ 少了它，「小屏 + 舒适模式四行压成一坨」
  //   这种事只有肉眼抓得到（改之前就是这样：脚本全绿、截图一眼是坏的）。
  homeRows: [],
  // ⭐ HOME 上每一行设置**真的画上去**的标签与值（只给 E2E / 调试看，⛔ 不是真值源，每帧重建）。
  homeSettings: []
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

// ════════ ⭐⭐ 限时模式（P2c Task 5 · DESIGN §6.10）════════
// §6.10：「每手 10 秒倒计时，超时随机落子（偏中路）…… ⚠ **绝不能是默认**。
//   ⚠ 限时局**不计入精准度纪录**。」
//
// 三块分工（⛔ 别合并，合并之后就再也没法单独钉死其中一条）：
//   · `C4Clock`（js/clock.js）  —— **表**：累计「这一手玩家真正拥有过的毫秒」。⛔ 不认识棋盘。
//   · `C4State.timeoutMove`     —— **规则**：超时落哪一列（纯函数，⛔ 不读时钟）。
//   · 本节                      —— **接线**：什么时候停表、超时了做什么、画在哪。
//
// ⭐⭐⭐ ─── 判断②：哪些事件停表（**单一判据 clockBlock()**）───
//   判据只有一句话：**「玩家现在是不是真的可以想、也真的可以落子」**。
//     · 不是他的回合（AI 在算）        ⇒ 表**根本不存在**（turnKey() 恒 null）——
//       这一条比「停表」更强：连超时都不可能触发 ⇒ ⛔ 绝不会出现「时钟替 AI 落了一手」。
//       §9.2 那个断崖（n=10..15 中位 1.7 秒、尾部 4 秒）因此一毫秒都进不了玩家的 10 秒。
//     · `G.thinking`（引擎在替**玩家**算）⇒ 停。⭐ **P3 的［提示］按钮直接复用这一条**：
//       按下提示 → 求解器要算 1.7 秒（§9.2）→ 那是**我们**欠他的，不是他的思考时间；
//       ⛔ 但算完之后**表要接着走** —— 读提示、想清楚，那是他的时间。
//     · 猜先动画（T3）⇒ 停。那 ~1.2 秒是开场镜头，牌面信息（谁先手）还在交付，
//       占 10 秒预算的 12%。⚠ 减弱动态下硬币不转，但仍有 COIN_STATIC_MS 的静态停留 ——
//       ⇒ 判据用 `G.coinUntil` 这个**时刻**，⛔ 不是「动画还在不在」（那会漏掉减弱动态那一半）。
//     · 悔棋确认（T4）⇒ 停。等对方开口可能好几秒，而那时棋盘本来就落不了子（interactive 已挡）。
//       ⚠⚠ 诚实记一笔（与 T4 那条「同机双人没有身份」同源）：一台设备一双手 ⇒ 一方**能**靠
//         挂着一个问句把表冻住。⛔ 但反过来（问句挂着还跑表）明显更坏 —— 那等于让一个人
//         能把另一个人的表耗光，而被耗的那位连子都落不了。⇒ 收下这条，⛔ 不加「确认超时」。
//     · 切后台 / 切到别的 app ⇒ 停（`document.hidden` + visibilitychange，见下）。
//   ⛔ **不**停表的：自己刚落的那枚还在飞（~270 ms）。落点是确定的、不遮任何信息，
//     而为它停表等于把「规则」又挂回 fx 那一层（本 task 判断①刚把它拆开）。
const CLOCK_TICK_MS = 100;      // ⚠ 表的精度由它定；显示重画另有节流（见 clockTick）
const AUTO_NOTE_MS = 3600;      // 「时间到 · 第 N 列由时钟落下」这条归因留多久

/** 设置里选的（HOME 上画哪个值）。⚠ 与 `timedGame()` 是两个问题，别混用（同 kidsPref/kidsGame）。 */
function timedPref() { return C4Settings.get('timed'); }
/** ⭐ 这一局**实际**限不限时（⛔ 判据只有 C4State.timedAllowed 一份，别在这再写一次 !kids）。
 *  ⚠ 玩家选的一直存着（他下一局退出儿童档时不该发现自己的选择被清了）。 */
function effTimed(kids) { return timedPref() && C4State.timedAllowed(kids); }
/** ⭐ **这一局**是不是限时局（单一真值在 G 里，⛔ 不是设置）。 */
function timedGame() { return C4State.timedOf(G.g); }

/** ⭐ 现在在给**哪一手**计时；null = 没有表在跑。
 *  ⚠ 身份里必须有 `aiSeq`：撤销之后手数可能回到同一个数，而那是**另一手**（表该重新开始）。 */
function turnKey() {
  const g = G.g;
  if (!g || G.phase !== 'PLAYING' || !C4State.timedOf(g)) return null;
  // ⭐⭐ 轮到 AI 时**根本不建表** —— 见上面那段：这比「停表」更强。
  if (!C4State.isHumanTurn(g)) return null;
  return G.aiSeq + ':' + g.moves.length;
}

/** ⭐ 这一拍**为什么**停表（null = 不停）。⛔ 全局只有这一处判据。 */
function clockBlock() {
  // ⭐ 切后台/切 app：⛔ 别只靠 visibilitychange 事件 —— 后台里 setInterval 会被节流到 ≥1 s，
  //   回到前台后的第一拍可能带着一个几秒的 dt，而那时 hidden 已经是 false 了。
  //   ⇒ **每一拍都现问 document.hidden**（事件那一层另外还有，两层都要，见 boot）。
  try { if (typeof document !== 'undefined' && document.hidden) return 'hidden'; } catch (e) { /* 没有 document 的壳 */ }
  // ⭐ 引擎在替他算 —— 两种：AI 落子，以及**玩家按下的提示**（P3 T3 兑现了上面那句预告）。
  //   ⚠ 同一个原因码 'engine'：语义就是同一条「这段等待是**我们**欠他的，不是他的思考时间」。
  //   ⛔ 算完之后表要接着走 —— 读提示、想清楚，那是他的时间。
  if (G.thinking || (G.hint && G.hint.pending)) return 'engine';
  if (G.undoAsk) return 'ask';           // 等对方回答悔棋（T4）
  if (coinShown() && nowMs() < G.coinUntil) return 'coin';   // 猜先还在演（T3，含减弱动态的静态停留）
  return null;
}

let _clockTimer = null;
let _clockPaint = '';        // 上一次真的重画时的「显示状态」指纹（⇒ 没变就不重画）
let _timeoutPending = false; // ⭐ 见 clockSync：越线由谁去执行

function stopClock() {
  if (_clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
  C4Clock.forget();
  G.clockKey = null; G.clockBlock = null; _clockPaint = ''; _timeoutPending = false;
}
/** ⚠ 幂等：startGame / doUndo / answerUndo 都调得到它。 */
function startClock() {
  if (_clockTimer) return;
  _clockPaint = '';
  _clockTimer = setInterval(clockTick, CLOCK_TICK_MS);
}
/** ⭐ 这一局要不要有表。⛔ 别在别处 setInterval：启停只有这一个入口。 */
function syncClock() {
  if (G.phase === 'PLAYING' && timedGame()) startClock(); else stopClock();
}

/**
 * ⭐⭐ 把表推到**此刻**，并更新 `G.clockKey / G.clockBlock`。⛔ 它自己**不重画**。
 *
 * ⚠⚠ 它被 `renderAll()` 每帧调一次，理由是一次实测：只在 100 ms 的 tick 里同步的话，
 *   **换手那一瞬画出来的是上一拍的剩余时间** —— 刚落完子 / AI 刚落完 / 悔棋刚被回答的那
 *   最多 100 ms 里，HUD 上挂着的是**别人那一手**的秒数（画面完全正常、零报错）。
 *   ⇒ 「画出来的那份」与「表的状态」必须是同一时刻的，同 curLayout 那条「全局只算一处」。
 *
 * ⭐ 越线**不在这里执行**，只置 `_timeoutPending`：
 *   ⛔ 在 renderAll 里直接 onTimeout 会 renderAll → clockSync → onTimeout → applyMove → renderAll
 *     递归下去；而 `expired` 在 C4Clock 里**只报一次**，⇒ 若这里吞掉它，那一手的超时就
 *     **永远丢了**（表走完了却没人落子，零报错）。⇒ 记下来，交给 clockTick 统一执行。
 */
function clockSync(now) {
  const t = typeof now === 'number' ? now : nowMs();
  const key = turnKey();
  const why = key === null ? null : clockBlock();
  G.clockKey = key; G.clockBlock = why;
  const r = C4Clock.tick(key, t, why !== null);
  if (r.expired && key !== null) _timeoutPending = true;
  return r;
}

function clockTick() {
  const now = nowMs();
  clockSync(now);
  // ⭐ 归因提示到点就撤（⛔ 别让它赖在屏幕上：下一手开始之后它就不是「现在发生的事」了）
  if (G.autoNote && now >= G.autoNote.until) { G.autoNote = null; _clockPaint = ''; }
  if (_timeoutPending) { _timeoutPending = false; onTimeout(); return; }   // ⚠ onTimeout 自己会重画
  // ⭐ 重画节流：只在**显示真的会变**的时候重画。⛔ 别每 100 ms 无脑全屏重画。
  //   ⚠ 减弱动态（§6.8）下指纹只取**整秒** ⇒ 条不再连续动，但「还剩几秒」这条**信息**
  //     一秒不差 —— P2b 的教训：关掉的是运动，⛔ 不是信息。
  const sig = G.clockKey === null ? 'off:' + (G.autoNote ? 1 : 0)
    : (G.clockBlock || '-') + ':' + (reduceMotion() ? C4Clock.seconds()
                                                    : Math.round(C4Clock.frac() * 240))
      + ':' + (G.autoNote ? 1 : 0);
  if (sig !== _clockPaint) { _clockPaint = sig; renderAll(); }
}

/**
 * ⭐⭐ 倒计时归零 —— 由**时钟**落一手。
 * ⚠ 落哪一列全权交给 `C4State.timeoutMove`（纯函数、零搜索、⛔ 不读时钟）⇒ 这一手**可重放**：
 *   它进 `moves` 之后与玩家自己落的一手逐位无差别，而「是谁落的」记在 `g.auto` 里。
 */
function onTimeout() {
  const g = G.g;
  if (!g || G.phase !== 'PLAYING' || !C4State.timedOf(g) || !C4State.isHumanTurn(g)) return;
  const col = C4State.timeoutMove(g);
  G.autoNote = { col: col, player: C4State.turnOf(g), until: nowMs() + AUTO_NOTE_MS };
  _clockPaint = '';
  applyMove(col, true);
}

// ⚠⚠ 全局只有这一处算 layout：**画出来的那份**与 `onHoldEnd` 拿去算列号的那份必须是
//   同一个对象（renderAll 把它存进 G.L，drawBoard 用同一个 L 注册热区）。
//   ⛔ 对坐模式改了几何（盘往下挪、平板上 cell 还会变小）——两处各算各的话就会出现
//   「点哪儿都不对」而功能测试全绿（那些测试直接调 action，根本不走热区）。
function curLayout() {
  return C4Render.layout(GameGlobal.SW, GameGlobal.SH, null, null, { faceToFace: f2fOn() });
}

/** 单行文字**缩到装得下**（canvas 的 fillText 不换行也不截断，德/俄膨胀会直接压到隔壁）。 */
/**
 * ⭐⭐ 缩到放得下再画。**量的时候必须带上 `GameGlobal.fontScale`**（2026-08-07 抓到）：
 *   `txt/txtL/txtR` 会把 font 串过一遍 `sfont()`，那里按字号档乘 1 / 1.15 / **1.3**；
 *   而这里原来用**原始**字号去 measure ⇒ 收敛出来的宽度随后被放大 15-30% ⇒
 *   **A⁺⁺ 档下 HOME 的四个档位按钮、HUD 那行全都互相压**。
 * ⇒ 量与画用同一个 `sfont()`，⛔ 别再各算各的。
 */
/** ⭐ 量宽时把 font 串过 engine 的 `sfont()`，与 `txt/txtL/txtR` 画字用同一个字号档。
 *  ⚠ 防御 typeof：`sfont` 是 engine/canvas.js 的全局函数，本文件在没有它的环境里也不该炸。 */
function SF(f) { return (typeof sfont === 'function' ? sfont(f) : f); }

function measureAtScale(s, weight, px) {
  ctx.font = SF(weight + ' ' + px + 'px sans-serif');
  return ctx.measureText(clean(s)).width;
}
function fitTxt(s, cx, cy, maxW, color, weight, size) {
  let px = size;
  while (px > 10 && measureAtScale(s, weight, px) > maxW) px -= 1;
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
  // ⭐ 庆祝演完了 ⇒ 把挂起的插屏补放（见 recordAccuracy 末尾那段 ⛔）。
  if (G.adPending) { G.adPending = false; maybeInterstitial(); }
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
  // ⛔ 挂起的插屏一起清：撤销/换局之后它再放出来，就是**上一局**欠的那个广告砸在新局面上。
  G.adPending = false;
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
// ⚠ `!G.undoAsk`（P2c T4）是**唯一**一个「点击真的被挡住」的条件，而它与上面那条并不矛盾：
//   挡输入之所以有害是因为**看不见**（玩家只知道点不动）；而悔棋请求挂着的时候，屏幕上正
//   摆着一条写着问句的确认条和两个大按钮，⇒ 「为什么点不动」和「怎么解开」是同一眼看到的。
//   ⛔ 反过来放行才是错的：等回答的这段时间里棋盘要是还能落子，两个人就会一边吵一边把
//     局面走出去 —— 那正是这条规则要拦下的事。
function interactive() {
  return G.phase === 'PLAYING' && !!G.g && !G.thinking && !G.undoAsk && C4State.isHumanTurn(G.g);
}

function goHome() {
  G.aiSeq++; setThinking(false); fxStop(); resetFork();
  G.phase = 'HOME'; G.g = null; G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  G.coin = false; G.coinAnim = false; G.undoAsk = null; G.hint = null;
  G.brilliantNote = null; G.brilliantCount = 0; G.lastBrilliant = null; _brilliantPly = -99;
  G.review = null; G.accRecorded = false; G.accWasRecord = false; G.hintUsed = false;
  // ⭐ 表停掉（⛔ 别让一个 100 ms 的 interval 在 HOME 上空转 —— 与 fxStop 里那条 rAF 同源）
  G.autoNote = null; G.coinUntil = 0; stopClock();
  // ⭐ 上一局的真值不许漏进下一局（缓存 key 里没有「哪一局」这一维，靠 reset 划界）
  C4Analysis.reset();
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
  G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = ''; G.undoAsk = null;
  G.autoNote = null; G.hint = null;
  // ⭐ 妙手计数是**这一局**的（⛔ 上一局的 ✨ 不许漏进新一局）
  G.brilliantNote = null; G.brilliantCount = 0; G.lastBrilliant = null; _brilliantPly = -99;
  G.review = null; G.accRecorded = false; G.accWasRecord = false; G.hintUsed = false;
  // ⭐ 儿童档只对人机局成立（双人局那一侧的答案是让子，T1）。⚠ 档位由 state.js 说了算，
  //   ⛔ 这里不许自己写 `tier = 1`：两份判据漂了就会出现「界面写儿童档、开的是别的级」。
  const kids = mode === 'ai' && kidsPref();
  if (kids) tier = C4State.KIDS_TIER;
  const opts = { mode: mode, gameNo: G.gameNo, handicap: effHandicap(mode, tier), kids: kids,
                 // ⭐ 限时（§6.10）。⚠ 儿童档下 effTimed 恒 false（判据在 C4State.timedAllowed），
                 //   ⛔ 但设置里那个选择照样存着 —— 家长退出儿童档时不该发现它被清了。
                 timed: effTimed(kids) };
  // ⛔ 别在这里算 humanFirst：交替先手 +「顶档必须玩家先手」+「让子局强方先手」三条都写在
  //    state.js 的 newGame 里（只写一处才守得住），这里传了就等于把那三条兜底覆盖掉。
  if (mode === 'ai') opts.tier = tier;
  G.g = C4State.newGame(opts);
  G.phase = 'PLAYING';
  // ⭐ 边打边算（P3 T2 · §9.2）：这一局的真值从现在起在 Worker 空闲时慢慢算，
  //   到终局时复盘几乎瞬开。⚠ 让子局会在 start() 里被整个关掉（两条理由见 analysis.js 文件头）。
  //   ⛔ 它永远不阻塞任何一次点击 —— 没算完只是复盘页显示进度。
  C4Analysis.start(G.g);
  C4Analysis.onMove(G.g);
  // ⭐ 猜先（§6.7）。⚠ 必须在 newGame **之后**：它演的就是 newGame 刚算完的那个先手。
  const wait = startCoinFx();
  // ⭐ 表（§6.10）：⚠ 必须在 startCoinFx **之后** —— 猜先那段是**停表**的（clockBlock 的 'coin'），
  //   而它要读 G.coinUntil。
  G.coinUntil = nowMs() + wait;
  syncClock();
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
  // ⭐⭐ 若这一局是**时钟**替他落的那一手结束的，那句归因必须留到玩家自己离开结算屏为止：
  //   「我怎么就输了」正是这一刻最该被回答的问题（§2.3 公平即资产 / §3.3 归因）。
  //   ⚠ **显式**抬掉到期时间，⛔ 别依赖「反正表停了就没人去 tick 它」那个副作用 ——
  //     那种「靠另一处的实现细节碰巧成立」的行为，下一次改 ticker 时会静默消失。
  if (G.autoNote) G.autoNote.until = Infinity;
  // ⭐ 终局 ⇒ 表停掉（§6.10 的 10 秒是「轮到你走」的 10 秒，结算屏上没有「该谁走」）。
  //   ⛔ 也别留着 interval 空转 —— 同 fxStop 里那条 rAF 的纪律。
  syncClock();
  startWinFx();         // ⭐ 赢的那 3 秒（⚠ 此刻赢的那一枚通常**还在飞**，lead 就是等它落地）
  // ⭐⭐ 记账**必须也从这里进一次**（2026-08-07 记账门禁 e2e-stats-record 当场抓到）：
  //   recordAccuracy 原来**只挂在 C4Analysis.onIdle 上**，而 onIdle 只在「从忙变闲」那一拍响。
  //   ⇒ 让子局 / 儿童档（= 让 2 子）里边打边算是**整个关掉**的，一个请求都不发 ⇒ 永远不忙
  //     ⇒ onIdle 一次都不触发 ⇒ **那个函数压根没被调到**，里面写得再对也没用。
  //   ⚠ 这不是重复记账：recordAccuracy 自己用 `G.accRecorded` 去重，而且**算得分的局**
  //     在这一刻精准度还没算完 ⇒ 它会早退且**不置** accRecorded，照旧等 onIdle 那一趟。
  recordAccuracy();
  setThinking(false);   // ⚠ 放最后：它会重画一帧，前面的字段得先摆好
  return true;
}

/**
 * 落一子（人 / AI / ⭐ 限时模式的时钟 都走这里）。⚠ 先问 canPlay —— C4State.play 对非法列是**抛**的。
 * @param auto ⭐ true = 这一手是**时钟**落的（P2c T5 · §6.10）⇒ 走 C4State.playAuto，
 *   ply 记进 `g.auto`（§3.3 复盘要说得出「第 17 手是时钟落的，不是你」）。
 */
function applyMove(col, auto) {
  if (!G.g || !C4State.canPlay(G.g, col)) return false;
  // ⚠ 落点与执子方必须在 play **之前**读：落完盘面就变了，那时候 h[col] 已经加过一。
  //   ⭐ 这个 row 直接就是落定音的编号（land0 = 最底行 = 最低音，DESIGN §6.3）。
  const bdBefore = C4State.boardOf(G.g);      // ⭐ T5 的双威胁判据要「落子之前」那一份
  const movesBefore = G.g.moves.slice();      // ⭐ P3 T4：妙手判据要「落子之前」那份手数列表
  const row = C4Render.landingRow(bdBefore, col);
  const player = C4State.turnOf(G.g);
  G.g = auto ? C4State.playAuto(G.g, col) : C4State.play(G.g, col);
  // ⛔ 时钟落完子必须把「手指还按在盘上」这件事清掉（P2c T5）：同机双人局里，超时那一瞬
  //   轮走方就换人了 —— 上一位玩家的手指一松，onHoldEnd 会拿着旧的 holdCol **替下一位落一手**，
  //   而画面上完全看不出发生了什么。⚠ 人机局够不着这条，但判据不该依赖那个前提。
  if (auto) G.holdCol = -1;
  // ⭐ 玩家自己落了子 ⇒ 上一条「时间到」的归因该撤下（它说的是**刚才**那一手）。
  //   ⚠ 只在非 auto 时撤：连着两次超时时，第二条会在 onTimeout 里覆盖第一条。
  if (!auto) G.autoNote = null;
  G.hoverCol = -1;
  if (row >= 0) startDropFx(col, row, player);
  // ⭐ 双威胁（§6.4 下半）。⚠ 必须在 startDropFx **之后**：fx 要问「那枚棋子还差多久落地」
  //   才能把光环与落地对齐（lead）；⛔ 也必须在 checkOver 之前 —— 判据自己会挡终局，
  //   但顺序反了会让「这一手直接连四」的局面多算一遍。
  if (row >= 0) maybeFork(bdBefore, C4State.boardOf(G.g));
  // ⭐ 边打边算（P3 T2）：把新的前缀局面排进队。⚠ 放在这里（落子后、renderAll 之前）而
  //   ⛔ **不是放进 renderAll** —— 后者每帧都跑，有副作用的东西放进去会递归（P2c-T5 实锤）。
  C4Analysis.onMove(G.g);
  // ⭐ 上一手的提示当场过期（⛔ 别让它挂在这一手上 —— 那是「看起来完全合法」的错答案）
  expireHint();
  // ⭐ 妙手 ✨（§3.4）。⚠ 必须在 onMove **之后**（那一手的真值可能刚被排进来）、
  //   在 checkOver **之前**（终局那一手同样可以是妙手）。⛔ 它只读缓存、绝不等待。
  maybeBrilliant(movesBefore, col);
  const over = checkOver();
  renderAll();
  if (!over) maybeAI();
  return true;
}

// ════════ ⭐⭐ 双人局的悔棋：对方同意才悔（P2c Task 4 · DESIGN §6.7）════════
// §6.7 原文：「⚠ **双人对战不许单方悔棋**（会吵架）——『对方同意才悔』。」
//
// ⭐⭐⭐ ─── 我没有推翻这条规则，但它有三处是空的，而**坑全在那三处** ───
//   规格只说了「要同意」。照字面最容易做出来的东西是一个「确定要悔棋吗？」的弹窗 ——
//   那是**自我确认**，一下都没挡住单方悔棋（点的人自己点确定），纯属 §6「high-quality」
//   要扣分的那种弹窗轰炸。三条把它补成一条真规则：
//
//   ① ⭐⭐ **「对方」是算出来的，⛔ 不是问出来的。**
//      悔棋撤掉的是**最后那一手**，⇒ 得利的恒是**刚落子的那一位**，付账的恒是**现在该走的
//      那一位**。⇒ `to = C4State.turnOf(g)`（该走的那一位）= 同意方，`by = to ^ 1` = 请求方。
//      ⇒ 屏幕上那句话因此是**指名道姓**的（「玩家 1，同意悔这一手吗？」）而不是「确定吗？」,
//        HUD 左边那枚棋子图示也换成**同意方自己的子**。这一条才是「不许单方悔棋」的全部内容：
//        问句一旦指了名，桌子对面那个人就必须真的开口，⛔ 而「确定吗」谁都能替谁点。
//
//   ② ⭐ **不是弹窗，是把两块**既有**的面借过来**（⛔ 零新图层、零遮挡棋盘、零版面跳动）：
//      · **HUD 那一行** —— 它本来就是「现在发生什么」，是全屏最大的字，且**对坐模式下
//        T3 已经把它逐字复制到盘上方那条转 180° 的第二 HUD 上** ⇒ 「两边都读得到」这条
//        要求在结构上白拿（⛔ 不必为它再发明一块几何）；
//      · **tray 里［撤销］［菜单］那一行** —— 换成［不同意］［同意］，位置、高度一个像素不动。
//      ⇒ 棋盘全程可见（§6.3「连线必须一直看得见」同源），拇指位置不变。
//
//   ③ ⛔ **没有计时器。** 超时自动同意 = 把这条规则整个删掉；超时自动拒绝 = 一家人商量两句
//      就被判死（4-5 岁那一侧尤其）。⇒ 出口只有明面上的两个按钮（外加［菜单］／［再来一局］
//      这两个本来就在的转移）。⚠ 验收里那句「超时」在这里的答案就是**我们不做超时**。
//
// ⚠⚠ ─── 一条做不到的事，如实写在这里（诚实纪律，⛔ 别把它讲成安全机制）───
//   同机双人**没有身份**：请求方物理上也按得到［同意］。这不是能修的（一台设备、一双手，
//   没有任何信号能区分是谁的手指）。⇒ 这条规则拦的是「**一方悄悄把棋撤了**」：盘面在收到
//   一个**明面的、指了名的**回答之前**一个像素都不动**。⛔ 别为了「防作弊」去加密码/长按/
//   双人同时按 —— 那是把一家人当贼防，成本全落在 4-5 岁那一侧。
//   ⭐ 能做的那一半照做了：**对坐模式下确认条会镜像到对面那一侧**（见 drawConsentBar 的
//     flip）—— 否则底下那一排离请求方最近、离同意方最远，这条规则就成了摆设。
//
// ⭐ ─── 4-5 岁那一侧怎么「同意」（⚠ 这是本 task 的第二个产品判断）───
//   ⚠ 儿童档（T2）是**人机局**，⇒ 确认条**永远不会出现在儿童档里**（人机局根本不问）。
//     但 §6.7 那一侧的孩子照样会坐在**双人 + 让子**局里 ⇒ 这三条是给他准备的：
//     · 按钮和别处的按钮一样大，舒适模式（§6.8）照常把它们一起放大；
//     · ✓ / ✗ 是**画出来的形状**（⛔ 不是 '✓' 这个字符 —— 部分安卓 WebView 会落到豆腐块，
//       与 drawKidsCheer 里不用 '★' 是同一条教训），并且**形状 + 颜色双编码**（§6.2）：
//       绿底 ✓ / 灰底 ✗，灰度下也分得出；
//     · 确认条左边画的是**同意方自己的棋子** —— 不识字也能被告诉「有你的子的那一条在问你」。
function undoNeedsConsent(g) { return !!g && g.mode === 'human'; }

/** ⭐ 谁来回答。**单一判据**：现在该走的那一位（= 不是刚落子的那一位，见上面 ①）。
 *  ⛔ 别在 UI 里再算一次「谁是对方」——两份判据漂了就会出现「问了不该问的人」。 */
function undoApprover(g) { return C4State.turnOf(g); }

// ════════ ⭐⭐ 提示：分层两按，且**永远免费**（P3 Task 3 · DESIGN §3.2）════════
//
// §3.2 原文：「**第一按**：只说这步关不关键——『有 4 列都不输，随便走』vs『**只有 1 列不输**』。
//   教育价值最高且不剧透。**第二按**：指出走哪一列 + 一句理由。
//   理由从求解器评分结构**机械导出，不手写解说**。」
// ⛔⛔ 红线（§3.2 明写、E2E 断言）：**提示 / 复盘 / 悔棋 / 全部课程——永远免费，永不看广告，
//   且不限次数**。竞品把提示做成 9 次限量道具——这正是不学的东西。
//
// ⭐ 判据全在 `review.js`（纯函数、node 里逐条钉死），本节只做三件事：
//   ① 问 `C4Analysis` 要这一手的真值（没算过就**插队**现算）；
//   ② 把 `C4Threats`（**零搜索**）算出的两个布尔喂给 hintLevel2 —— 那两条理由要它；
//   ③ 把结果挂到 `G.hint` 上等着被画。
//
// ⚠⚠ **提示是有「哪一手」的**：落子 / 撤销之后它当场过期（`hint.ply !== moves.length` ⇒ 丢）。
//   ⛔ 少了这一条，上一手的答案会挂在这一手上 —— 一个**看起来完全合法**的错答案，零报错。

/** 这一局给不给精确提示（⛔ 判据只有 C4Analysis 一份，别在这再写一次「让子局不给」）。 */
function hintAvailable() { return C4Analysis.enabled(); }

/** 提示过期了就清掉（⭐ 落子/撤销/换局后必须调得到）。 */
function expireHint() {
  if (G.hint && (!G.g || G.hint.ply !== G.g.moves.length)) G.hint = null;
}

/**
 * ⭐ ［提示］按下去。第一次 → level 1（只说关不关键）；再按 → level 2（指出走哪列）。
 * ⛔ 零广告、零消耗、不限次数。
 */
function askHint() {
  const g = G.g;
  if (!g || G.phase !== 'PLAYING' || C4State.isOver(g)) return;
  // ⭐ 这一局用过提示了（§7.8 的零提示胜率 / §7.7 的 ★2 都读它）。
  //   ⚠ 提示**永远免费**（§3.2）—— 这个标记只影响「怎么记账」，⛔ 不影响能不能按。
  G.hintUsed = true;
  // ⚠ 不是玩家的回合就别提示（AI 在想，盘上也落不了子）
  if (!C4State.isHumanTurn(g)) return;
  expireHint();
  const ply = g.moves.length;

  // ⛔ 这一局不给精确提示（让子局 / 求解器不可用）⇒ **如实说**，⛔ 绝不编一个列号出来（§2.4）
  if (!hintAvailable()) {
    G.hint = { ply: ply, level: 1, pending: false, why: analysisOffText() || T('game.hintOff') };
    renderAll();
    return;
  }

  const sa = C4Analysis.get(g.moves);
  if (!sa) {
    // ⭐ 还没算到这一手 ⇒ **插队**现算（玩家主动按下的等待，§9.2 裁定可接受），
    //   ⚠ 但界面上要如实说「正在算」，⛔ 不是转到天荒地老、更不是假装有答案。
    //   ⚠ 库还没就位时 request 会被 analysis 的 bookOk() 闸挡住（无库的 n≤9 是几十分钟）
    //     ⇒ 那时这条 pending 会一直挂着，而 HUD 上本来就写着「开局库准备中」。
    G.hint = { ply: ply, level: G.hint && G.hint.ply === ply ? G.hint.level : 1, pending: true, why: '' };
    C4Analysis.request(g.moves, { priority: true });
    renderAll();
    return;
  }

  const l1 = C4Review.hintLevel1(sa);
  const prev = G.hint && G.hint.ply === ply ? G.hint : null;
  // ⭐ 已经在 level 1 ⇒ 这一按进 level 2（⚠ pending 那次不算「按过一层」）
  const level = prev && !prev.pending && prev.level >= 1 ? 2 : 1;
  const h = { ply: ply, level: level, pending: false, why: '',
              kind: l1.kind, safe: l1.safe, total: l1.total, col: -1, reason: '' };
  if (level >= 2) {
    // ⭐ 两条 fork 理由用 C4Threats（**零搜索**，≤14 次 isWinningMove）现算，
    //   ⛔ 绝不为了一句解说去调求解器（§9.2 的断崖 + threats.js 的头号红线）。
    const bd = C4State.boardOf(g);
    const me = C4State.turnOf(g);
    const cols = C4Review.safeCols(sa);
    // ⚠ 在**并列最优**里优先挑一个能说出理由的（⛔ 不是「挑一个更好的列」——
    //   它们分数完全相同，挑哪个都是最优；只是有理由可说的那个更有教育价值）。
    let pick = cols[0], makes = false, blocks = false;
    for (const c of cols) {
      const after = C4Threats.forkOf(bd, B_play(bd, c));
      const mk = !!(after && after.player === me);
      const bl = forkBlocked(bd, c, me);
      if (mk || bl) { pick = c; makes = mk; blocks = bl; break; }
    }
    const l2 = C4Review.hintLevel2(sa, { col: pick, makesFork: makes, blocksFork: blocks });
    h.col = l2.col; h.reason = l2.reason;
  }
  G.hint = h;
  renderAll();
}

// ════════ ⭐ 妙手 ✨（P3 Task 4 · DESIGN §3.4）════════
//
// §3.4：「只有 1 列不输、而你找到了 ⇒ 当场弹 ✨妙手。成本几乎为零（数据已在算），
//   但它把『我下了步好棋』变成**可量化、可炫耀的事件**。」
//
// ⭐⭐ 判据只有 `C4Review.isBrilliant` 一份（= hintLevel1 那一个）⇒ ⛔ 这里不再判一次。
//
// ⭐⭐ ─── 时机：这是本 task 唯一的难点（§9.2 点名过）───
//   真值来自边打边算。**n ≥ 16 段实测几乎全是 0 ms** ⇒ 落完子那一刻真值多半**已经在缓存里**
//   ⇒ 当场弹，爽感全在。而 n ≤ 15 可能还没算到 —— §9.2 的裁定是 ⛔ **别等**：
//   等 1.7 秒会让 ✨ 弹在玩家下一手都想好之后，**爽点全丢**。
//   ⇒ 判据写成一句话：**缓存里现在有就判，没有就不判**（⛔ 不发请求、⛔ 不排队、⛔ 不等待）。
//     漏掉的那些由**赛后复盘**一次性兑现（那时整局的真值本来就都算完了）——
//     ⚠ 两条路读的是**同一个** isBrilliant，⛔ 别写两份（两份一漂，局中弹了 3 个、
//       结算说 2 个，而没人看得出是哪边错了）。
//
// ⚠ 妙手**不进存档**：它是 (局面真值, 实际落子) 的纯函数 ⇒ 随时现算得出来
//   ⇒ ⛔ 不必 bump SAVE_VERSION，也不会有「存了但和现算对不上」这种病。

/** 冷却：连着好几手都是「唯一解」是真会发生的（残局尤其），⛔ 别让 ✨ 刷屏。 */
const BRILLIANT_MIN_GAP = 2;
let _brilliantPly = -99;

/**
 * ⭐ 刚落的那一手是不是妙手 —— **只在真值已经在缓存里时判**（见上面那段 ⭐⭐）。
 * @param movesBefore 落子**之前**的手数列表
 * @param col 落的列
 */
function maybeBrilliant(movesBefore, col) {
  const g = G.g;
  if (!g || !C4Analysis.enabled()) return;
  const sa = C4Analysis.get(movesBefore);
  if (!sa) return;                          // ⛔ 还没算到 ⇒ **不等**（赛后复盘兑现）
  let good = false;
  try { good = C4Review.isBrilliant(sa, col); }
  catch (e) { return; }                     // 终局/脏数据 ⇒ 静默跳过（⛔ 别为一个特效炸掉一局）
  if (!good) return;
  const ply = movesBefore.length;
  if (ply - _brilliantPly < BRILLIANT_MIN_GAP) return;
  _brilliantPly = ply;
  G.brilliantCount++;
  G.lastBrilliant = { ply: ply, col: col, player: ply % 2 === 0 ? 0 : 1 };
  startBrilliantFx(col);
}

/**
 * ⭐ 妙手的表现：盘下那条上打一行 ✨ + 复用 P2b-T5 的 `fork` 音。
 * ⚠⚠ **没有用 `C4Fx.startFork` 的光环**，理由是实测出来的：它的 `normLine` 要求 **≥2 个点**
 *   （那是「双威胁」的形状：两个格子）——而妙手是**一格**。硬传一格会被静默判成非法形状
 *   （返回 null、什么都不画、零报错）；凑第二个点则是**画一条语义错误的线**。
 *   ⇒ 要真做单格光环得动 `fx.js`（它有 dt 幂等等严格契约 + 自己的门禁）——那是打磨，
 *     ⛔ 不值得为它冒险，也 ⛔ 不许为了「有个动画」去传一个假形状。
 * ⚠ 音效不吃减弱动态（§6.8 关的是**运动**，⛔ 不是信息与声音）。
 */
function startBrilliantFx(col) {
  // ⭐ 妙手有**自己的音**（A5→E6→A6，收尾单音长鸣）。⛔ 别借 fork 的：
  //   双威胁 = 两条路（收尾两个音同响），妙手 = 唯一解（收尾一个音）—— 声音本身说清了两件事；
  //   而且借用会污染 e2e-p2b-t5 那条「fork 音恰好响一次」的门禁（2026-08-06 实锤）。
  Sfx.play('brilliant');
  G.brilliantNote = { until: nowMs() + BRILLIANT_NOTE_MS, col: col };
}
/** ✨ 那一行留多久（与「时间到」那条归因同一个量级）。 */
const BRILLIANT_NOTE_MS = 2600;

// ════════ ⭐⭐ 赛后复盘（P3 Task 5 · DESIGN §3.3「最大的差异化」）════════
//
// §3.3：「一局 ≤42 手、盘面小，**整局每一手的真值完全算得起**：
//   **胜负曲线** · **转折点**（「你到第 14 手为止一直是必胜的。第 14 手走了第 3 列——
//   这一步之后变成必败。当时该走第 5 列。」）· **［从这一步重来］**」
//
// ⚠⚠ **措辞死线**（§3.3 原话）：口径是**陈述事实**（「这一步之后局面变了」），
//   **不是指责**（「你犯了个错」）。⛔ 面向玩家的每一句都走 locale，且一句指责都不许有。
//
// ⭐ 数据全部现成：**边打边算**（T2）到终局时已经把每个前缀局面算完了（E2E 实测 100%）
//   ⇒ 复盘几乎瞬开。⛔ 这里绝不自己发请求、绝不等待 —— 没算完就如实显示进度。

/**
 * ⭐ 把这一局摊成每一手的判据。
 * @returns { labels, ready } —— `ready=false` 表示还有手没算到（⛔ 别拿半份数据画曲线）
 * ⚠ 只用 `C4Analysis.get`（**只读缓存**）：⛔ 不发请求、⛔ 不等待。
 */
function buildReview(g) {
  const out = { labels: [], ready: true, done: 0, total: (g && g.moves ? g.moves.length : 0) };
  if (!g || !g.moves.length) { out.ready = false; return out; }
  for (let k = 0; k < g.moves.length; k++) {
    const sa = C4Analysis.get(g.moves.slice(0, k));
    if (!sa || !Object.keys(sa).length) { out.ready = false; continue; }
    let d;
    try { d = C4Review.labelDetail(sa, g.moves[k]); }
    catch (e) { out.ready = false; continue; }   // 终局/脏数据 ⇒ 这一手跳过，⛔ 别编
    out.done++;
    out.labels.push({
      ply: k,
      // ⭐ 谁下的这一手：先手位在偶数 ply。⚠ 让子局的 pre 不进 moves ⇒ 这个口径仍成立。
      side: k % 2 === 0 ? 0 : 1,
      col: g.moves[k], label: d.label, from: d.from, to: d.to
    });
  }
  return out;
}

/** ⭐ 打开复盘页。⛔ 零广告、零消耗（§3.2 那条红线同样罩着复盘）。 */
function openReview() {
  if (!G.g) return;
  G.review = buildReview(G.g);
  if (G.review.ready) G.review.tp = C4Review.turningPoint(G.review.labels,
    { side: G.g.mode === 'ai' ? C4State.humanPlayer(G.g) : 0 });
  G.phase = 'REVIEW';
  stopClock();                       // ⛔ 别让 100 ms 的 interval 在复盘页上空转
  renderAll();
}

/**
 * ⭐ ［从这一步重来］—— 直接用 P2a 就有的 `C4State.rewindTo`，⛔ 别新写一套。
 * ⚠ 它会按 `p < k` 砍掉 `auto` 归因（P2c T5 已实现）⇒ 重来之后那一手不再顶着时钟的名字。
 */
function replayFrom(ply) {
  const g = G.g;
  if (!g || typeof ply !== 'number' || ply < 0) return;
  G.aiSeq++; setThinking(false); fxStop(); forkRewind();
  G.g = C4State.rewindTo(g, ply);
  G.phase = 'PLAYING';
  G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = ''; G.undoAsk = null;
  G.hint = null; G.brilliantNote = null; G.review = null;
  // ⛔ autoNote 也要清：checkOver 会把它的 until 设成 Infinity（终局后不再自动撤），
  //   而 doUndo 清了、replayFrom 没清 ⇒ 「时间到 · 第 N 列由时钟落下」会赖在屏幕上，
  //   指着一手**已经不在盘上**的棋（2026-08-07 抓到）。
  G.autoNote = null;
  G.overReady = false;
  syncClock();
  renderAll();
  maybeAI();
}

/** ⭐ 这一局给不给复盘 + ⛔ 不给的话**如实说的那句话**（§2.4：降级必须可见）。 */
/**
 * ⭐⭐ 「这一局为什么不给精确评分」——**原因码 → 句子的唯一翻译入口**。
 * ⚠⚠ analysis.js 是纯模块、拿不到 T() ⇒ 它只返回**码**；翻译只能在这一层做。
 *   这条是截图抓出来的（2026-08-06）：第一版在 analysis.js 里写死了一句中文，
 *   **英文界面上就直接弹出中文** —— 本仓「零硬编码文案」铁律的活教材。
 * ⛔ 提示与复盘共用这一个函数，别各翻各的（两份一漂就会出现「提示说 A、复盘说 B」）。
 */
function analysisOffText() {
  const code = C4Analysis.disabledReason();
  if (!code) return '';
  return T(code === 'handicap' ? 'game.offHandicap'
         : code === 'engine' ? 'game.offEngine' : 'game.hintOff');
}

/** ⭐ 这一局给不给复盘 + ⛔ 不给的话如实说的那句话（§2.4：降级必须可见）。 */
function reviewBlocked(g) {
  if (!g) return T('game.hintOff');
  if (C4Analysis.enabled()) return '';
  return analysisOffText() || T('game.hintOff');
}

/**
 * ⭐ 转折点那一手「当时该走哪一列」。
 * ⚠⚠ 必须来自**那一手的** scoreAll，⛔ 不许是「现在算出来的最优」——
 *   局面早就不同了，那是另一个问题的答案（而它看起来同样合理）。
 */
function bestColAt(g, ply) {
  const sa = C4Analysis.get(g.moves.slice(0, ply));
  if (!sa || !Object.keys(sa).length) return -1;
  try { return C4Review.safeCols(sa)[0]; } catch (e) { return -1; }
}

/**
 * ⭐ 真值回来了 ⇒ 把挂着的那条提示补完（⛔ 别让 pending 永远挂着，见 boot 里 onIdle 那段 ⛔⛔）。
 * ⚠ 只处理「还是同一手」的情况：换手了直接清掉（那条提示已经过期）。
 */
function resumeHint() {
  const g = G.g, h = G.hint;
  if (!g || !h || !h.pending) return;
  if (h.ply !== g.moves.length) { G.hint = null; renderAll(); return; }
  const sa = C4Analysis.get(g.moves);
  if (!sa || !Object.keys(sa).length) { renderAll(); return; }   // 还没到 ⇒ 继续等
  G.hint = null;          // ⚠ 先清掉 pending 那一条，askHint 才会重新按 level 1 算
  askHint();              // ⚠ 它自己会 renderAll
}

/** 落这一列之后，**对方**原本的双威胁是不是没了。⛔ 零搜索（同 threats.js 的红线）。 */
function forkBlocked(bd, col, me) {
  const before = C4Threats.forPlayer(bd, me ^ 1);
  if (!before || before.length < 2) return false;
  const after = C4Threats.forPlayer(B_play(bd, col), me ^ 1);
  return after.length < before.length;
}
/** 借 Bitboard 落一子（⚠ 纯函数，不改入参）。⛔ 主线程一行搜索都不许有，这只是落子。 */
function B_play(bd, col) { return Bitboard.play(bd, col); }

/**
 * ［撤销］按下去之后到底发生什么。
 * ⭐⭐ **人机局照旧：一下都不许多点**（DESIGN §8「提示/复盘/悔棋/课程永远免费」，
 *   §6.7 那条规则的理由是「会吵架」——人机局里没有对方可吵，加一次确认纯粹是收买路钱）。
 */
function requestUndo() {
  const g = G.g;
  if (!g || !g.moves.length) return;
  if (!undoNeedsConsent(g)) { doUndo(); return; }
  if (G.undoAsk) return;                    // 已经在问了（⛔ 别把同一句话问两遍）
  const to = undoApprover(g);
  G.undoAsk = { to: to, by: to ^ 1, ply: g.moves.length };
  renderAll();
}

/**
 * 回答那个请求。⭐ **两条出口都必须把 `undoAsk` 清掉**（同意与拒绝共用这一行）——
 * ⛔ 拒绝时忘了清 = 棋盘永远卡在等回答的状态，两个人只能重开一局（零报错的死局）。
 * ⚠ `ply` 是**陈旧性守卫**：等待期间局面本来就落不了子（interactive 已经挡住），
 *   但同意这件事一旦对上的是另一个局面就是「撤掉了别人的一手」——那种 bug 不许靠
 *   「上游应该不会发生」来防。
 */
function answerUndo(agree) {
  const ask = G.undoAsk;
  G.undoAsk = null;
  if (!agree || !ask || !G.g || G.g.moves.length !== ask.ply) { renderAll(); return; }
  doUndo();
}

/** ✓ / ✗ 是**画出来的**（⛔ 不用字体字形，理由见上面那段 ⭐）。 */
function drawMark(kind, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.17);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'ok') {
    ctx.moveTo(cx - s * 0.42, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.32);
    ctx.lineTo(cx + s * 0.44, cy - s * 0.34);
  } else {
    ctx.moveTo(cx - s * 0.34, cy - s * 0.34); ctx.lineTo(cx + s * 0.34, cy + s * 0.34);
    ctx.moveTo(cx + s * 0.34, cy - s * 0.34); ctx.lineTo(cx - s * 0.34, cy + s * 0.34);
  }
  ctx.stroke();
  ctx.restore();
}

/** 确认条里的一颗按钮：**形状 + 颜色**双编码 + 文字。
 *  @param hit 注册热区用的矩形 —— ⚠ 旋转 180° 那一条**必须传镜像后的矩形**（见 drawConsentBar）。 */
function markBtn(x, y, w, h, kind, label, action, hit) {
  const isOk = kind === 'ok';
  fillRR(x, y, w, h, 10, isOk ? C4Render.PAL.accent : '#61776f');
  const ms = Math.max(10, Math.round(h * 0.42));
  const cy = y + h / 2;
  drawMark(kind, x + 11 + ms / 2, cy, ms, '#fff');
  const tx0 = x + 11 + ms + 6, tx1 = x + w - 8;
  fitTxt(label, (tx0 + tx1) / 2, cy, Math.max(20, tx1 - tx0), '#fff', 'bold', fsz(14));
  addHit(hit.x, hit.y, hit.w, hit.h, action, {});
}

/**
 * ⭐⭐ 确认条本体。`flip` = 旋转 180°（对坐模式下给桌子对面那个人的那一条）。
 *
 * ⭐⭐ **旋转的支点是这条 bar 自己的中心** —— 与 T3 的第二 HUD 逐字同一条纪律，而且这里
 *   比那时更要紧：那条 HUD **没有热区**，这条有两颗**会改变盘面**的按钮。
 *   ⇒ 180° 绕自身中心之后，任何轴对齐子矩形 (x,y,w,h) 落在 (2cx−x−w, 2cy−y−h, w, h)，
 *     `map()` 就是这条公式；画由 ctx 变换负责、热区由 map 负责。
 *   ⛔⛔ 少了 map（只转画面不转热区）= 点「同意」实际点到「不同意」，而**画面完全正常**
 *     —— 本仓最怕的那类失败，e2e-p2c-t4 ⑦ 用**真实鼠标点旋转那条的［同意］**钉死它。
 */
function drawConsentBar(x, y, w, h, flip) {
  const ask = G.undoAsk, g = G.g;
  if (!ask || !g) return null;
  const cx = x + w / 2, cy = y + h / 2;
  const map = r => flip ? { x: 2 * cx - r.x - r.w, y: 2 * cy - r.y - r.h, w: r.w, h: r.h } : r;
  if (flip) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.PI); ctx.translate(-cx, -cy);
  }
  fillRR(x, y, w, h, 12, 'rgba(255,255,255,0.92)');
  strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, 12, C4Render.PAL.hudEdge, 1.5);
  // ⭐ 同意方**自己的棋子** —— 「有你的子的那一条在问你」（不识字也读得出，见上面那段 ⭐）
  const gs = Math.min(fsz(26), Math.round(h * 0.56));
  C4Render.drawGlyph(ask.to, x + 12 + gs / 2, cy, gs);
  const bw = Math.min(Math.round(w * 0.30), 132);
  const bh = Math.max(28, h - 12);
  const by = y + (h - bh) / 2;
  const okX = x + w - 10 - bw, noX = okX - 8 - bw;
  markBtn(noX, by, bw, bh, 'no', T('undo.refuse'), 'UNDO_NO', map({ x: noX, y: by, w: bw, h: bh }));
  markBtn(okX, by, bw, bh, 'ok', T('undo.agree'), 'UNDO_OK', map({ x: okX, y: by, w: bw, h: bh }));
  // ⚠ 短句（长的那句指名道姓的在 HUD 上）：值栏宽度有限，拼长了会被 fitTxt 压到读不清。
  const tx = x + 16 + gs, tw = Math.max(24, noX - 10 - tx);
  fitTxt(T('undo.barAsk'), tx + tw / 2, cy, tw, C4Render.PAL.hudText, 'bold', fsz(13));
  if (flip) ctx.restore();
  return { x: x, y: y, w: w, h: h };
}

/** ⭐ 撤销要退回**该玩家走**的那个位置。
 *  只退一手的话，人机局里 AI 会立刻把它走回来 —— 表现为「撤销按钮没反应」，零报错。
 *  ⚠ 双人局的入口是 requestUndo（对方同意才走到这里）；⛔ 本函数自己不判同意 ——
 *    「撤销到底怎么发生」和「谁批准的」是两件事，混在一起会让人机局那条免费路径
 *    跟着长出一个分支来。 */
function doUndo() {
  const g = G.g;
  if (!g || !g.moves.length) return;
  G.aiSeq++; setThinking(false); fxStop(); forkRewind(); G.notice = ''; G.undoAsk = null;
  let n = g.moves.length - 1;
  if (g.mode === 'ai') {
    while (n > 0 && (n % 2) !== C4State.humanPlayer(g)) n--;
  }
  G.g = C4State.rewindTo(g, n);
  G.phase = 'PLAYING';
  G.result = null; G.hoverCol = -1; G.holdCol = -1;
  // ⭐ 撤销之后上一手的提示当场过期（⛔ 同 applyMove 那条：错答案看起来完全合法）
  expireHint();
  // ⭐ 撤销之后表要重新开始（aiSeq 已经 +1 ⇒ turnKey 变了 ⇒ C4Clock 自己会清零）。
  //   ⚠ 这里只负责「结算屏撤回对局中」时把 interval 重新起起来（结算时它是停的）。
  G.autoNote = null; syncClock();
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
    // ⭐⭐ 限时模式（DESIGN §6.10）：布尔 ⇒ toggle。⚠ 与让子/对坐同理，儿童档下这个选择
    //   **照样存得住**，只是那一局不生效（effTimed 说了算）——⛔ 别在这里替家长清掉他的选择。
    case 'TOGGLE_TIMED': C4Settings.toggle('timed'); renderAll(); return;
    // ⭐⭐ 悔棋（P2c T4 · DESIGN §6.7）：**人机局立刻生效**（免费救济，⛔ 一下都不许多点），
    //   **双人局先问对方**。判据只有 undoNeedsConsent 一份，⛔ 别在这里再写一次 mode 比较。
    // ⭐ 提示（§3.2）：⛔ 零广告、零消耗、不限次数 —— 与 UNDO 同一条红线
    case 'HINT':       askHint(); return;
    // ⭐ 复盘（§3.3）：⛔ 同样永远免费
    case 'REVIEW':     openReview(); return;
    // ⭐ 课程与统计（P4/P5）：⛔ 同样永远免费、零广告
    case 'LEARN':      openLearn(); return;
    case 'STATS':      G.phase = 'STATS'; renderAll(); return;
    case 'PAGE_BACK':  G.phase = 'HOME'; G.g = G.g; renderAll(); return;
    case 'LESSON':     startLesson(data && data.id); return;
    case 'LESSON_COL': answerLesson(data && data.col); return;
    case 'LESSON_NEXT': nextQuestion(); return;
    case 'REVIEW_BACK': G.phase = 'OVER'; renderAll(); return;
    case 'REPLAY_FROM': replayFrom(data && data.ply); return;
    case 'UNDO':       requestUndo(); return;
    case 'UNDO_OK':    answerUndo(true); return;
    case 'UNDO_NO':    answerUndo(false); return;
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
  ctx.font = SF(f);
  const vw = Math.min(bw * 0.5, ctx.measureText(clean(value)).width);
  const vDrawn = wrapLines(value, bw * 0.5, 1)[0];
  txtR(vDrawn, bx + bw - 14, gy, hot ? C4Render.PAL.accent : C4Render.PAL.hudSub, f);
  ctx.font = SF(f);
  const lDrawn = wrapLines(label, Math.max(30, bx + bw - 22 - vw - tx), 1)[0];
  txtL(lDrawn, tx, gy, C4Render.PAL.hudText, f);
  // ⭐ 把**真的画上去的那两串**（截过断的那一份）记下来，⛔ 只给 E2E / 调试看，不是真值源。
  //   ⚠ 存在的理由与 drawHUD 的 leftDrawn 逐字相同（P2c T4 实锤）：门禁要能问
  //     「界面上那句『儿童档不适用』是不是被截成了半句」——⛔ 别让它只能靠肉眼。
  G.homeSettings.push({ a: action, label: lDrawn, value: vDrawn, hot: !!hot });
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
      { k: 'f2f',    h: B(46),                    gap: 8,  px: F(14) },
      // ⭐⭐ 限时模式（§6.10）同一组：它是「这一局怎么开」里**最重**的一条（它会替玩家落子），
      //   ⛔ 绝不能丢进下面那三行无障碍设置里。⚠ 加这一块会让 360×640 + 舒适模式的块栈再缩一档
      //   （homeStack 的 hk 迭代自己会处理），门禁 e2e-p2b-t7 ⑤/⑤b 逐块量重叠与墨迹越界。
      { k: 'timed',  h: B(46),                    gap: 12, px: F(14) },
      { k: 'ai',     h: B(52),                    gap: 12, px: F(16) },
      { k: 'human',  h: B(52),                    gap: 12, px: F(16) },
      // ⭐ 课程 / 统计（P4/P5）：两个按钮**共用这一块**（并排）⇒ ⛔ 别占两行。
      { k: 'meta',   h: B(42),                    gap: 18, px: F(14) },
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
  G.homeSettings = [];      // ⚠ 每帧重建（⛔ 不清的话门禁会拿到上一帧的串）
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

  // ⭐⭐ 限时模式（DESIGN §6.10）：「每手 10 秒 —— 四子棋在时间压力下完全是另一个游戏。」
  //   ⚠ 右侧的值在**开着**时写的是「每手 10 秒」而不是一个「开」字：玩家在按下之前
  //     就该知道到底给他多久（10 这个数是产品数值，来自 C4Clock.TURN_MS，⛔ 别在文案里硬写）。
  //   ⚠ 儿童档下必须**如实说它不生效**（§2.4：降级必须可见，照让子在求解器档下的先例）——
  //     ⛔ 绝不许「界面上写着限时、开出来没有表」，也 ⛔ 不许替家长把这个选择清掉。
  //   ⭐ 左边的图例是**一个走了一格的表盘**（画出来的形状，⛔ 不用 '⏱' 这类字形：部分安卓
  //     WebView 会落到豆腐块 —— 与 drawKidsCheer 不用 '★'、drawMark 不用 '✓' 同一条教训）。
  const tmd = timedPref();
  const tmdOn = C4State.timedAllowed(kd);
  b = S.at('timed');
  settingRow(bx, b.y, bw, b.h, T('menu.timed'),
             !tmd ? T('menu.off')
                  : (tmdOn ? T('menu.timedOn', { n: Math.round(C4Clock.TURN_MS / 1000) })
                           : T('menu.timedNA')),
             tmd && tmdOn, 'TOGGLE_TIMED', (x, gy, h) => {
               const gs = Math.min(fsz(24), Math.round(h * 0.58));
               drawClockGlyph(x + 12 + gs / 2, gy, gs, tmd && tmdOn);
               return x + 20 + gs;
             }, b.px);

  b = S.at('ai');
  btn(bx, b.y, bw, b.h, T('menu.vsAI'), 'PLAY_AI', {}, { disabled: dead, px: b.px });
  b = S.at('human');
  btn(bx, b.y, bw, b.h, T('menu.vsHuman'), 'PLAY_HUMAN', {}, { bg: '#61776f', px: b.px });

  // ⭐ 课程 / 统计两个入口（P4/P5）。⚠ **两个按钮共用一块**（并排）⇒ ⛔ 不多占一行高度：
  //   HOME 的块栈在最窄屏上排得很满，P2b-T7 的版面门禁逐块量重叠与墨迹越界。
  //   ⛔ 两者都**永远免费**（§3.2 那条红线罩着课程）。
  b = S.at('meta');
  {
    const gap2 = 10, w2 = (bw - gap2) / 2;
    btn(bx, b.y, w2, b.h, T('menu.learn'), 'LEARN', {}, { bg: '#61776f', px: b.px });
    btn(bx + w2 + gap2, b.y, w2, b.h, T('menu.stats'), 'STATS', {}, { bg: '#61776f', px: b.px });
  }

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
    ctx.font = SF(f);
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
    ctx.font = SF(f);
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
    ctx.font = SF(f);
    wrapLines(G.notice, L.drop.w - 24, 2).forEach((ln, i) =>
      txt(ln, cx, cy - 7 + i * 15, '#a33', f));
    return;
  }
  // ⭐⭐ 「时间到 · 第 N 列由时钟落下」（P2c T5 · §6.10）——**归因**，不是装饰。
  //   §2.3「公平即资产」/ §3.3「复盘告诉你输在第几手」的同一条：⛔ 系统替玩家落了一手，
  //   就必须当场说清楚**是它落的、落在哪**。少了这一句，玩家看到的是「盘上凭空多了一子」，
  //   而那正好踩中「它坑我」那条最毒的差评（这也是我给「超时随机落子」加两道护栏的同一个理由）。
  //   ⛔ 别把它做成红字（那是 §2.4 的降级措辞）：这不是故障，是规则在生效。
  if (G.autoNote) {
    const label = T('game.timeUp', { n: G.autoNote.col + 1 });
    const f = 'bold ' + fsz(12) + 'px sans-serif';
    ctx.font = SF(f);
    const lines = wrapLines(label, L.drop.w - 56, 2);
    const gs = Math.min(fsz(20), Math.round(L.drop.h * 0.62));
    const tw = Math.max.apply(null, lines.map(s => ctx.measureText(s).width));
    const bw = Math.min(L.drop.w - 8, tw + gs + 34);
    const bh = Math.min(L.drop.h, lines.length > 1 ? 44 : 34);
    fillRR(cx - bw / 2, cy - bh / 2, bw, bh, bh / 2, 'rgba(255,255,255,0.94)');
    strokeRR(cx - bw / 2 + 0.5, cy - bh / 2 + 0.5, bw - 1, bh - 1, bh / 2, C4Render.PAL.timeHot, 1.5);
    // ⭐ 左边画**那一手到底是谁的子** —— 不识字/读不快的人也知道这一手记在谁头上（同 T4 的确认条）
    C4Render.drawGlyph(G.autoNote.player, cx - bw / 2 + 12 + gs / 2, cy, gs);
    const tx0 = cx - bw / 2 + 18 + gs, tx1 = cx + bw / 2 - 10;
    lines.forEach((ln, i) => txt(ln, (tx0 + tx1) / 2, cy - (lines.length - 1) * 8 + i * 16,
                                 C4Render.PAL.hudText, f));
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
    ctx.font = SF(f);
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
  // ⭐⭐ 悔棋请求（P2c T4 · DESIGN §6.7）排在**最前面**：HUD 那一行本来就是「现在发生什么」，
  //   而此刻正在发生的就是这个问句。⭐ 它**指名道姓**（⛔ 不是「确定要悔棋吗？」——那是自我
  //   确认，一下都没挡住单方悔棋），左边那枚棋子图示换成**同意方自己的子**。
  //   ⭐⭐ 对坐模式下这一行由 T3 的第二 HUD **逐字**复制到盘上方那条转 180° 的卡上
  //     ⇒ 桌子两边**都读得到**这句话，⛔ 不需要为它再发明一块几何。
  if (G.undoAsk) {
    return { turn: G.undoAsk.to, left: T('undo.ask', { p: seatName(g, G.undoAsk.to) }) };
  }
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
  // ⭐ P3 T6：填真内容。⚠ 算不出来时**照旧显示占位符 —**，⛔ 绝不显示 "0%"
  //   （那会被读成「你这局 0 分」，是编出来的信息 —— §2.4）。
  const S = settleStats();
  const cell = (cx, label, val, hi) => {
    fitTxt(label, cx, y + h * 0.33, half - 18, C4Render.PAL.hudSub, 'normal', fsz(11));
    fitTxt(val, cx, y + h * 0.71, half - 18, hi ? '#c2601f' : C4Render.PAL.hudText, 'bold', fsz(16));
  };
  cell(x + half / 2, T('game.accuracy'),
       S.acc === null ? SETTLE_PENDING : (S.acc + '%' + (S.best ? ' ★' : '')), S.best);
  cell(x + half * 1.5, T('game.turningPoint'),
       S.tpPly === null ? SETTLE_PENDING : T('game.moveN', { n: S.tpPly + 1 }));
}
/** 占位符：⛔ 别换成 "0%" / "—%"（会被读成「你这局 0 分」，那是编出来的信息）。 */
const SETTLE_PENDING = '—';

/**
 * ⭐ 结算屏那条数据条上的两个数（P3 T6 · DESIGN §4）。
 * @returns { acc, tpPly, best } —— acc/tpPly 为 **null = 算不出来**（⛔ 不是 0）
 * ⚠ **纯读**：⛔ 不写存储（renderAll 每帧都跑，写就是每帧一次 IO）——
 *   纪录由 `recordAccuracy()` 在 analysis 空闲那一刻写一次（见 boot 里的 onIdle）。
 */
function settleStats() {
  const g = G.g;
  const out = { acc: null, tpPly: null, best: false };
  if (!g || !C4Analysis.enabled()) return out;
  const R = buildReview(g);
  if (!R.ready) return out;
  const me = g.mode === 'ai' ? C4State.humanPlayer(g) : 0;
  // ⛔ 限时局里**时钟代落的那几手不是玩家下的** ⇒ 从精准度里剔除（§6.10）
  const skip = C4State.timedOf(g) ? C4State.autoOf(g) : [];
  out.acc = C4Review.accuracyOf(R.labels, { side: me, skipPlies: skip });
  const tp = C4Review.turningPoint(R.labels, { side: me });
  out.tpPly = tp ? tp.ply : null;
  // ⭐ 「这是你的新高」——⚠ 限时局不参与纪录（§6.10 白纸黑字），所以也不标 ★
  // ⚠⚠ **记过之后要读「当时是不是新高」这个事实**，⛔ 不能再拿现在的纪录去比：
  //   recordAccuracy 把 49 写进纪录之后，`49 > 49` 就是假 ⇒ ★ 会在写入那一刻**自己消失**
  //   （截图实测，2026-08-06）。玩家看到的恰恰是写入之后的那一屏。
  out.best = out.acc !== null && !C4State.timedOf(g)
             && (G.accRecorded ? !!G.accWasRecord : accIsRecord(out.acc));
  return out;
}

/** 这个分数算不算新高。⚠ 判「有没有纪录」看 bestAccN，⛔ 不是 `bestAcc > 0`。 */
function accIsRecord(acc) {
  const n = C4Settings.get('bestAccN') | 0;
  return n === 0 || acc > (C4Settings.get('bestAcc') | 0);
}

/**
 * ⭐ 把这一局的精准度记进纪录。**只在 analysis 空闲那一刻调一次**（⛔ 不在渲染里）。
 * ⛔ 三种局不计入：限时局（§6.10）· 让子局（算不出真值）· 还没算完的。
 * ⚠ 幂等：靠 G.accRecorded 挡住同一局记两次。
 */
function recordAccuracy() {
  const g = G.g;
  if (!g || G.phase !== 'OVER' || G.accRecorded) return;

  // ⭐⭐ **精准度记不记** 与 **这一局算不算打过** 是两件事（2026-08-07 code review 抓到）。
  //   原来这里四个 early return 一起挡在最前面 ⇒ 儿童档（= 让 2 子）、限时局、
  //   以及求解器起不来的那些局，**局数/胜负/妙手/诊断标签全都不记** ——
  //   一个孩子在儿童档打 100 局，统计页永远是 `games 0 / 胜率 — / 1 级 / 零成就`，
  //   而三行之下 recordMeta 的注释白纸黑字写着「仍然计入局数与胜负，只有精准度不计入」。
  //   ⇒ 注释是对的，代码是错的。现在分成两段：**先无条件记账，再按条件记精准度**。
  const timed = C4State.timedOf(g);
  const canScore = !timed && C4Analysis.enabled();
  const S = canScore ? settleStats() : { acc: null };
  // ⚠ 精准度还没算完 ⇒ 这一整轮都先不落盘，等下一次 idle（⛔ 否则记账会先跑、
  //   而 accRecorded 一置就再也不会回来记精准度了）。
  if (canScore && S.acc === null) return;

  G.accRecorded = true;
  if (canScore) {
    // ⭐ 把「当时是不是新高」记下来（见 settleStats 里那段 ⚠⚠）
    G.accWasRecord = accIsRecord(S.acc);
    if (G.accWasRecord) C4Settings.set('bestAcc', S.acc);
    C4Settings.set('bestAccN', (C4Settings.get('bestAccN') | 0) + 1);
  }
  // ⭐ 这两条**无条件**跑：限时局/让子局也是真的打了一局。
  recordMeta();
  // ⛔ 插屏绝不许打断庆祝（§6.5 那 1.5 秒）。⚠ 记账现在也从 checkOver 进（见那里的 ⭐⭐），
  //   那一刻连线才刚开始画 ⇒ 直接放就是**盖在庆祝上**。⇒ 没演完就挂起，由 markOverReady 补放。
  //   ⚠ 顺序不能反：maybeInterstitial 读的 `rounds` 就是 recordMeta 刚 +1 的那个 games。
  if (G.overReady) maybeInterstitial();
  else G.adPending = true;
}

/**
 * ⭐⭐ 结算时该不该放插屏（§8）。⛔ 判据**只有 C4Shop.interstitial 一份**，
 * ⛔ 别在这里再写一次「前 50 盘」——两份一漂，商店页上那句承诺就成了谎。
 * ⚠ 与 recordMeta 同一时机（analysis 空闲那一刻）⇒ 已经过了结算动画，⛔ 不打断庆祝。
 * ⛔⛔ 输局永不出 —— 那一条在 C4Shop 里是**第一道闸**，这里只是把 lost 如实传进去。
 */
function maybeInterstitial() {
  const g = G.g;
  if (!g) return;
  // ⛔⛔ 时间基准必须是**墙钟**（Date.now），⛔ 不是 nowMs()/performance.now()：
  //   后者是「本次页面加载以来的毫秒」，每次启动归零，而 lastAdAt 是**持久化**的
  //   ⇒ 下次启动要连续开着 app ~17 分钟才可能再出插屏，且这个门槛每展示一次还往上爬
  //   （2026-08-07 抓到）。⚠ 墙钟 ~1.75e12 会被 |0 截断 ⇒ shop.js 那边也一起改了。
  const wall = Date.now();
  const r = C4Shop.interstitial({
    rounds: C4Settings.get('games') | 0,
    lost: isLoss(),
    now: wall,
    lastAt: Number(C4Settings.get('lastAdAt')) || 0
  });
  if (!r.show) return;
  C4Settings.set('lastAdAt', wall);
  try { Ads.showInterstitial(); } catch (e) { /* 广告失败绝不影响这一局 */ }
}

/**
 * ⭐ 元游戏计数器（P5 · §7）：局数 / 胜 / **零提示胜** / 妙手 / 诊断标签。
 * ⚠ 与 recordAccuracy 同一时机（analysis 空闲那一刻）⇒ ⛔ 不在渲染里写存储。
 * ⚠ 幂等由 G.accRecorded 一起罩住（它在上面刚被置 true）。
 * ⛔ 让子局/限时局仍然计入**局数与胜负**（那是真的打了一局）—— 只有**精准度**不计入。
 *   ⇒ 两件事分开，别混（§6.10 说的是「不计入精准度纪录」，不是「这局不算」）。
 */
function recordMeta() {
  const g = G.g;
  if (!g) return;
  const won = G.result && G.result.winner !== null
              && G.result.winner === (g.mode === 'ai' ? C4State.humanPlayer(g) : 0);
  const inc = (k, d) => C4Settings.set(k, (C4Settings.get(k) | 0) + (d | 0));
  inc('games', 1);
  if (won) {
    inc('wins', 1);
    // ⭐ §7.8 的「零提示胜率」——⚠ 判据是**这一局用没用过提示**（G.hintUsed）
    if (!G.hintUsed) inc('winsNoHint', 1);
  }
  if (G.brilliantCount > 0) inc('brilliants', G.brilliantCount);
  // ⭐ 诊断标签（§5.2.3 → §5.3 的「我的弱点」）。⚠ 只统计**玩家自己**的手。
  const tags = collectTags(g);
  for (const k of Object.keys(tags)) if (tags[k]) inc('tag' + k.charAt(0).toUpperCase() + k.slice(1), tags[k]);
}

/**
 * ⭐ 把这一局玩家的失误分类计数（§5.2.3）。
 * ⚠ 只读缓存、⛔ 不发请求（算不出来就少统计一点，⛔ 绝不为了统计去卡住玩家）。
 * ⚠ 盘面判据全是**零搜索**的（C4Threats）——⛔ 别为打标签去调求解器。
 */
function collectTags(g) {
  const out = {};
  if (!C4Analysis.enabled()) return out;
  const me = g.mode === 'ai' ? C4State.humanPlayer(g) : 0;
  let bd = C4State.boardOf(C4State.rewindTo(g, 0));
  for (let k = 0; k < g.moves.length; k++) {
    const col = g.moves[k];
    const side = k % 2 === 0 ? 0 : 1;
    if (side === me) {
      const sa = C4Analysis.get(g.moves.slice(0, k));
      if (sa && Object.keys(sa).length) {
        const t = C4Lessons.tagOf(sa, col, tagCtx(bd, side));
        if (t) out[t] = (out[t] | 0) + 1;
      }
    }
    bd = Bitboard.play(bd, col);
  }
  return out;
}

/**
 * 打标签要的那两组列（**零搜索**）。⚠ 与课程出题用的是同一套判据。
 * ⭐ `givesForkCols` = 「**走了这一列，对方下一手就能形成双威胁**」——
 *   即**该躲开**的列。⚠ 它以前叫 antiforkCols，而消费端按「必须走的防守列」在读，
 *   两边正好反了（2026-08-07 抓到）⇒ 改成这个名字，让它自己说清是哪一边。
 */
function tagCtx(bd, me) {
  const legal = RulesClassic.moves(bd);
  const theirs = C4Threats.forPlayer(bd, me ^ 1);
  const underCols = [], givesForkCols = [];
  for (const c of legal) {
    const nb = Bitboard.play(bd, c);
    const loses = RulesClassic.moves(nb).some(d => Bitboard.isWinningMove(nb, d));
    if (loses && theirs.some(t => t.c === c)) underCols.push(c);
    const ob = Bitboard.clone(nb); ob.turn = me ^ 1;
    if (RulesClassic.winningMoves(ob).length >= 2) givesForkCols.push(c);
  }
  return { underCols: underCols, givesForkCols: givesForkCols, n: bd.n };
}

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

/** ⭐ 表盘图例（P2c T5 · §6.10）：一圈 + 一段扇形「已经走掉的时间」+ 两根指针。
 *  ⛔ 不用 '⏱'/'⏰' 这类 emoji 字形（部分安卓 WebView 落到豆腐块 —— 同 drawStar / drawMark）。
 *  ⚠ 扇形是**形状**编码：关着时也画得出这是一个表，不靠颜色说话（§6.2）。 */
function drawClockGlyph(cx, cy, s, on) {
  const R = s * 0.46;
  const fg = on ? C4Render.PAL.accent : C4Render.PAL.hudSub;
  ctx.save();
  // 已经走掉的那一格（12 点 → 2 点方向），提示「这是个在走的表」
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI / 3);
  ctx.closePath();
  ctx.fillStyle = on ? 'rgba(47,143,106,0.22)' : 'rgba(38,74,61,0.14)';
  ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, s * 0.09); ctx.strokeStyle = fg; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R * 0.62);          // 长针指 12
  ctx.moveTo(cx, cy); ctx.lineTo(cx + R * 0.42, cy - R * 0.24);
  ctx.lineWidth = Math.max(1.5, s * 0.085); ctx.lineCap = 'round'; ctx.strokeStyle = fg;
  ctx.stroke();
  ctx.restore();
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
function trayPlan(L, over, hint) {
  const avail = Math.max(0, L.tray.h - 10);      // 盘底与第一行之间留一点呼吸
  const rows = over ? 2 : 1;
  let gap = 12, rowH = bht(46), statH = over ? bht(40) : 0;
  // ⭐ 提示条（P3 T3）：对局中**有提示时**才占一行（⛔ 没按提示时一个像素都不占）。
  //   ⚠ 它画在 tray 而不是 §6.9 那块 `L.reserve` —— 实测 reserve 在 **iPad 竖屏只有 2 px、
  //     横屏 5 px**（手机才有 50-90），把提示塞进去等于在平板上根本看不见。
  let hintH = (!over && hint) ? bht(34) : 0;
  const H = () => rowH * rows + gap * (rows - 1) + (statH ? statH + gap : 0) + (hintH ? hintH + gap : 0);
  if (H() > avail) gap = 8;
  if (H() > avail && statH) statH = 0;
  // ⭐⭐ 退让顺序：提示条**排在 statH 之后让路，但排在按钮的「舒适加高」之前**。
  //   ⚠ 与 statH 那条「让路成本最低」的理由正好相反：statH 画的是两个「—」的**占位**，
  //     而提示条是**玩家刚刚主动按出来的内容** —— 挤掉它 = 按了提示什么都没看到。
  //   ⭐⭐ 这一段是被**截图**改过的（2026-08-06）：第一版照搬了 statH 那条「⛔ 不许为它缩按钮」，
  //     结果 **360×640 + 舒适模式下提示条整条消失**（tray 只有 97 px，舒适按钮就吃掉 61）——
  //     而舒适模式恰恰是给「需要大字」的人用的，他们更需要看见那句话。
  //     ⇒ 改成**先把按钮从舒适高度退回普通高度（46，仍然完全点得中）**，把空间让给内容；
  //       这样那一屏变成 46 + 33 —— 两样都在。⛔ 只有连这样都放不下时才丢提示条。
  //   ⚠ 门禁看不出这个（三个按钮当时全都「在屏内且有热区」）—— 只有逐张看图才抓得到。
  if (H() > avail && hintH) {
    const plain = 46;                            // 普通（非舒适）按钮高度
    if (rowH > plain) rowH = Math.max(plain, avail - hintH - gap * rows);
    if (H() > avail) {
      const shrunk = Math.max(0, avail - (rowH * rows + gap * (rows - 1)) - gap);
      hintH = shrunk >= 24 ? shrunk : 0;         // 24 px 以下就读不清了，⛔ 宁可不画
    }
  }
  if (H() > avail) rowH = Math.max(36, Math.floor((avail - gap * (rows - 1)) / rows));
  return { gap: gap, rowH: rowH, statH: statH, hintH: hintH, h: H() };
}

/** ⭐ 提示条上写什么（**文案层的唯一出口**）。⛔ 判据一律来自 review.js，这里只挑句子。
 *  ⚠⚠ `kind === 'lost'` 时**绝不许**说「有 N 列不输」—— 必败局面里三列同为必败，
 *    那个 `safe` 就是 3，说出来就是谎（§2.4）。判据只能是 kind。 */
function hintText(h) {
  if (!h) return '';
  if (h.why) return h.why;                       // 让子局 / 求解器不可用 ⇒ 如实说
  if (h.pending) return T('game.hintWait');
  if (h.level >= 2 && h.col >= 0) {
    const why = T('game.r' + h.reason.charAt(0).toUpperCase() + h.reason.slice(1));
    return T('game.hintCol', { n: h.col + 1 }) + ' — ' + why;
  }
  if (h.kind === 'only') return T('game.hintOnly');
  if (h.kind === 'lost') return T('game.hintLost');
  return T(h.kind === 'win' ? 'game.hintWin' : 'game.hintDraw', { n: h.safe, t: h.total });
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
  // ⭐⭐ 悔棋请求挂着时**右侧那串次要信息整条让位**（P2c T4 —— 截图实锤，⛔ 别删）：
  //   drawHUD 会先给右侧留 42% 的宽，剩下的才归主句 ⇒ 414 宽的手机上那句指名道姓的问句
  //   被压成了「Player 1, allow that mov…」。**问句被截断 = 这条规则没被问出口**，
  //   而「第 1 局 · 谁先手」在这几秒里一点都不要紧（回答完它自己就回来了）。
  info.right = G.undoAsk ? '' : (g.mode === 'ai'
    ? (C4State.kidsOf(g) ? T('menu.kids') : T('game.level', { n: g.tier }))
    : T('game.gameLine', { n: g.gameNo + 1, p: firstSeatName(g) }));
  // ⭐⭐ 倒计时（P2c T5 · §6.10）。⚠ 只在**表真的在跑**的那些时刻画（G.clockKey 非空）——
  //   轮到 AI / 结算 / 非限时局一律不画。⛔ 别改成「限时局就一直画」：那样 AI 思考期间
  //   屏幕上会挂着一个不动的倒计时，玩家读到的是「我的表停了？坏了？」。
  //   ⚠ 停表的那几拍（切后台/等回答悔棋/猜先）**照画**，数字停住就是「表停了」这条信息本身。
  //   ⭐ 右侧那串次要信息在限时局里整条让位（照 T4 的先例：414 宽的手机上两串会互相挤）。
  const tk = G.clockKey !== null && G.phase === 'PLAYING';
  const hudOpts = tk ? { timer: {
    // ⚠ 减弱动态（§6.8）下条按**整秒**分十档走，⇒ 它不再连续动，但「还剩几秒」一秒不差。
    frac: reduceMotion() ? C4Clock.seconds() / (C4Clock.TURN_MS / 1000) : C4Clock.frac(),
    secs: C4Clock.seconds(), urgent: C4Clock.urgent()
  } } : null;
  G.clockOn = tk;
  if (tk) info.right = '';
  // ⭐ 舒适模式（§6.8）：HUD 的字也一起放大。⚠ HUD 的**高度**不跟着变（那是 layout 的事）。
  C4Render.drawHUD(info, L, comfortOn() ? COMFORT_TEXT : 1, hudOpts);

  // ⚠ trayPlan 提到这里算（原来在下面那一节）：**对坐那条确认条要用底下那条的行高**（见下）。
  //   ⛔ 它不读任何已经画出去的东西，提前算逐位不变。
  // ⭐ 提示条只在对局中、且**真的按出了内容**时占位（⛔ 没按提示时一个像素都不占）
  expireHint();
  // ⭐ 妙手那行 ✨ 到点自己撤（⛔ 别赖在屏幕上：下一手开始之后它就不是「现在发生的事」了）
  if (G.brilliantNote && nowMs() >= G.brilliantNote.until) G.brilliantNote = null;
  // ⚠ 两者共用盘下那一条（⛔ 别为 ✨ 再发明一块几何）。⭐ 妙手**压过**提示：
  //   它是刚刚发生的事，而提示是玩家几秒前按的。
  const showBrilliant = G.phase === 'PLAYING' && !!G.brilliantNote && !G.undoAsk;
  const showHint = G.phase === 'PLAYING' && !!G.hint && !G.undoAsk && !showBrilliant;
  const plan = trayPlan(L, G.phase === 'OVER', showHint || showBrilliant);
  const gap = plan.gap, rowH = plan.rowH;

  // ⭐⭐ 对坐模式（P2c T3 · §6.7）：盘上方那条**旋转 180°** 的第二 HUD —— 给坐在对面
  //   那个人读的。⚠ 内容与下面那条**逐字相同**（同一个 info 对象）：⛔ 两条 HUD 说不同的话
  //   就是两个真值，桌子两边的人会为「到底轮到谁」吵起来。
  //   ⚠ 位置来自 layout 的 `L.reserve`（§6.9 具名留出的那块，F2F_RESERVE 已经把它进了
  //     cell 的预算）⇒ ⛔ 它在结构上压不到棋盘。
  if (L.faceToFace && L.reserve.h >= C4Render.HUD_H) {
    // ⭐⭐ 悔棋请求挂着的时候，这条给对面那个人的带子上放的是**确认条**而不是 HUD 副本
    //   （P2c T4 · DESIGN §6.7）。两条理由，缺一条我就不会动 T3 定下来的东西：
    //   ① 「现在发生什么」此刻**就是**这个问句 —— HUD 副本那句「轮到谁」在等回答期间
    //      本来就没有意义（谁也走不了）；
    //   ② ⭐ **同意方得够得着按钮**：底下那一排离请求方最近、离对面那个人最远
    //      （平板横过来是一整块玻璃的距离）—— 只在底下放一份，等于把「对方同意才悔」
    //      做成「谁手快谁说了算」。
    //   ⚠ 高度取**底下那条的高度**（rowH）：⇒ 上面这条就是下面那条的 180° 复制品，
    //     E2E 才能拿 T3 ⑤ 那把尺子（旋转采样逐点比）真的量它。
    //     ⚠ f2f 时 reserve.h ≥ F2F_RESERVE = HUD_H+10 = 64 ≥ 舒适模式的 rowH(61) ⇒ 装得下；
    //       仍夹一道 min，⛔ 别让它溢出到棋盘上。
    const rect = { x: L.reserve.x, y: L.reserve.y, w: L.reserve.w, h: C4Render.HUD_H };
    if (G.undoAsk) {
      const bh = Math.min(rowH, L.reserve.h);
      G.askRectF2F = drawConsentBar(L.reserve.x, L.reserve.y, L.reserve.w, bh, true);
    } else {
      // ⭐ 倒计时一并复制到对面那一条（P2c T5）：⛔ 只有请求方那一侧看得见表的话，
      //   桌子对面那个人就是在「不知道还剩几秒」的情况下被判超时 —— 那正是这条功能最坏的形态。
      C4Render.drawHUD(info, L, comfortOn() ? COMFORT_TEXT : 1,
                       { rect: rect, flip: true, timer: hudOpts ? hudOpts.timer : null });
      G.f2fRect = rect;
    }
  }

  drawDropBand(L);

  // ⭐⭐ 按钮 / 结算内容一律排进 layout 给的 **L.tray**（盘底之下的净空，P2b T7 · §6.9）。
  //   ⛔ 别再自己从盘底往下量：改之前那版是「ry = 盘底 + 16，装不下就往上顶」，
  //     于是**顶到盘上**去了 —— 实测 1024×768 对局中按钮压着盘底 15 px 还掉出屏幕，
  //     五视口 × 结算屏 10 个组合里 6 个在压盘。而「赢局那条连线必须一直看得见」是 §6.3。
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
    // ⭐ P3 T5 已填内容 ⇒ 去掉 disabled。⚠ 两种情况都进**同一个复盘页**（输局那颗只是
    //   叫法不同 —— ［从那一步重来］的按钮在页内，⛔ 别做成两条不同的路）。
    //   ⚠ 让子局/求解器不可用时仍然点得进去：进去之后**如实说不给**（§2.4 降级必须可见），
    //     ⛔ 而不是给一个灰按钮让玩家猜为什么。
    const lost = isLoss();
    if (!kd) {
      btn(marg + wMain + gap, ry, full - wMain - gap, rowH,
          T(lost ? 'game.replayFrom' : 'game.review'), 'REVIEW', {}, { size: 15 });
    }
    const ry2 = ry + rowH + gap;
    const w2 = (full - gap) / 2;
    // ⭐⭐ 悔棋请求挂着 ⇒ 这一行换成确认条（P2c T4）。⚠ 结算屏**同样要问** —— 撤掉的正是
    //   刚刚那手制胜子，那是这个游戏最会吵架的一刻，⛔ 不许因为「都结束了」就放行。
    //   ⚠ ［再来一局］那一行照常在（它不是悔棋），⇒ 等回答期间也永远有一条出路。
    if (G.undoAsk) G.askRect = drawConsentBar(marg, ry2, full, rowH, false);
    else {
      btn(marg, ry2, w2, rowH, undoLabel(g), 'UNDO', {}, { bg: '#61776f' });
      btn(marg + w2 + gap, ry2, w2, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
    }
  } else {
    // ⭐ 提示条（§3.2）画在按钮行**上方** —— 紧挨着按出它的那颗按钮。
    //   ⚠ plan.hintH 为 0 = 这一屏实在放不下（最窄屏 + 舒适模式）⇒ 不画，⛔ 但按钮照旧在。
    if ((showHint || showBrilliant) && plan.hintH) {
      G.hintRect = drawHintBar(marg, ry, full, plan.hintH, showBrilliant);
      ry += plan.hintH + gap;
    } else G.hintRect = null;
    if (G.undoAsk) G.askRect = drawConsentBar(marg, ry, full, rowH, false);
    else {
      // ⭐⭐ 三个按钮：［提示］［撤销］［菜单］。⚠ btn 的 fitTxt 带 maxW ⇒ 长文案会自适应缩，
      //   ⛔ 但仍然要在 E2E 里逐张肉眼看（「文案截断是只有肉眼抓得到的一整类 bug」）。
      const w3 = (full - gap * 2) / 3;
      // ⭐ 提示**永远免费、不限次数**（§3.2）⇒ ⛔ 这里绝不许有「剩几次」的角标或禁用态。
      //   ⚠ 唯一的禁用是「现在不是你的回合」——那时盘上本来也落不了子。
      btn(marg, ry, w3, rowH, T('game.hint'), 'HINT', {}, {
        bg: '#61776f', disabled: !C4State.isHumanTurn(g) || C4State.isOver(g)
      });
      btn(marg + w3 + gap, ry, w3, rowH, undoLabel(g), 'UNDO', {}, {
        bg: '#61776f', disabled: !g.moves.length
      });
      btn(marg + (w3 + gap) * 2, ry, w3, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
    }
  }
}

/**
 * ⭐ 提示条：一句话，画在一张与结算卡同族的浅色条上。
 * ⚠ 文案过 `fitTxt` 的 maxW（canvas 不自动换行，⛔ 长语言会静默溢出）。
 * @returns 它画在哪（只给 E2E 取样，⛔ 不是真值源）
 */
function drawHintBar(x, y, w, h, brilliant) {
  // ⭐ 妙手用一张**更亮**的底 + 金色字：它是这一局的高光时刻，⛔ 别和提示长得一模一样。
  fillRR(x, y, w, h, 10, brilliant ? 'rgba(255,247,224,0.97)' : 'rgba(255,255,255,0.92)');
  const txt = brilliant ? T('game.brilliant') : hintText(G.hint);
  fitTxt(txt, x + w / 2, y + h / 2, w - 20, brilliant ? '#8a5a12' : '#2f4f43', '700', fsz(14));
  return { x: x, y: y, w: w, h: h, text: txt, brilliant: !!brilliant };
}

/** ⭐ 双人局那颗按钮写的是「悔棋」而不是「撤销」（P2c T4）：按下去**不会**当场撤掉，
 *  它是**向对方提一个请求** —— 按钮的名字必须说的是它真会做的那件事，⛔ 否则第一次按
 *  下去的人会以为坏了。⚠ 人机局逐字不变（那里它真的就是「撤销」，一下生效）。 */
function undoLabel(g) { return T(undoNeedsConsent(g) ? 'undo.request' : 'game.undo'); }

function renderAll() {
  // ⭐ 画之前先把表推到**此刻**（P2c T5 · §6.10）：⛔ 否则换手那一瞬 HUD 上挂的是
  //   **上一手**的剩余秒数（最多一拍 100 ms，画面完全正常、零报错）。理由全文见 clockSync。
  if (_clockTimer) clockSync();
  clearHits();
  // ⚠ 每帧清掉：这两个矩形是「上一帧画在哪」，⛔ 不是真值源 —— 不清的话门禁会拿着
  //   一个早就不画了的矩形去取样，量到的是别的东西（而且看起来很合理）。
  G.coinRect = null; G.f2fRect = null; G.askRect = null; G.askRectF2F = null; G.clockOn = false;
  const L = curLayout();
  G.L = L;
  C4Render.drawBackground(L);
  G.hintRect = G.phase === 'PLAYING' ? G.hintRect : null;
  if (G.phase === 'REVIEW' && G.g) drawReview(L);
  else if (G.phase === 'LEARN') drawLearn(L);
  else if (G.phase === 'STATS') drawStats(L);
  else if (G.phase === 'HOME' || !G.g) drawHome(L);
  else drawPlay(L);
}

// ════════ ⭐⭐ 复盘页（P3 T5 · DESIGN §3.3）════════

/** ⭐ 返回键：**一律左上角**（本仓 2026-08-03 铁律，全游戏统一）。
 *  ⛔ y 必须从 `safeTop` 起算（刘海/灵动岛），⛔ 别写死；⛔ 也别放右上（那是引擎控制栏的地盘）。 */
function backButton(L) {
  const x = L.tray.x, y = L.safeTop + 4, w = 66, h = 34;
  fillRR(x, y, w, h, 10, 'rgba(97,119,111,0.92)');
  fitTxt('‹ ' + T('game.back'), x + w / 2, y + h / 2, w - 12, '#fff', 'bold', fsz(14));
  addHit(x, y, w, h, 'REVIEW_BACK', {});
  return { x: x, y: y, w: w, h: h };
}

/**
 * ⭐⭐ 胜负曲线：画的是**胜负态**（三档），⛔ 不是 `score` 原值。
 * §3.3 要的是「你到第 14 手为止一直是必胜的」这条**故事线**；而 `|score|` 的锯齿
 * （赢得早一子/晚一子）会让曲线看起来在剧烈震荡，**而胜负态其实一直没变**。
 * ⚠ 一律画成**玩家视角**：`side` 是谁下的这一手 ⇒ 后手那几手要翻符号，
 *   ⛔ 否则曲线会每一手上下横跳（那是「换了个人看」，不是局势在变）。
 */
function drawCurve(x, y, w, h, R) {
  fillRR(x, y, w, h, 10, 'rgba(255,255,255,0.92)');
  const n = R.labels.length;
  if (!n) return;
  const padX = 10, padY = 8;
  const x0 = x + padX, w0 = w - padX * 2, y0 = y + padY, h0 = h - padY * 2;
  // 中线 = 和棋
  ctx.save();
  ctx.strokeStyle = 'rgba(47,79,67,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0 + h0 / 2); ctx.lineTo(x0 + w0, y0 + h0 / 2); ctx.stroke();
  // ⭐ 玩家视角：人机局看 humanPlayer，双人局看先手位（0）
  const me = G.g.mode === 'ai' ? C4State.humanPlayer(G.g) : 0;
  const px = i => x0 + (n === 1 ? w0 / 2 : w0 * i / (n - 1));
  const py = v => y0 + h0 / 2 - v * (h0 / 2 - 2);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const e = R.labels[i];
    const v = e.side === me ? e.to : -e.to;      // ⚠ 换成玩家视角（见上面那段 ⚠）
    const X = px(i), Y = py(v);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.strokeStyle = '#3f7f66'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  // ⭐ 转折点打一个点（⛔ 只靠颜色区分不行 —— 这里是「位置 + 一个更大的点」双编码）
  if (R.tp) {
    const i = R.labels.findIndex(e => e.ply === R.tp.ply);
    if (i >= 0) {
      const e = R.labels[i];
      const v = e.side === me ? e.to : -e.to;
      ctx.beginPath(); ctx.arc(px(i), py(v), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#c2601f'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ctx.restore();
}

function drawReview(L) {
  const g = G.g;
  const R = G.review || { labels: [], ready: false, done: 0, total: 0 };
  const marg = L.tray.x, full = L.tray.w;
  G.reviewBack = backButton(L);

  // 标题（⚠ 给左上角那颗按钮让出宽度：长语言的标题会压上去）
  const titleY = L.safeTop + 4 + 34 / 2;
  fitTxt(T('game.review'), L.SW / 2, titleY, full - 160, C4Render.PAL.hudText, 'bold', fsz(19));

  let y = L.safeTop + 56;
  const why = reviewBlocked(g);
  const line = (txt, size, color) => {
    fitTxt(txt, L.SW / 2, y + 12, full - 20, color || C4Render.PAL.hudText, '600', fsz(size || 14));
    y += 30;
  };

  // ⛔ 三种「不给复盘」的诚实分支（§2.4：降级必须**可见**，⛔ 绝不显示一个编出来的数字）
  if (why) { line(why, 15, '#7a5b3a'); }
  else if (!R.ready) {
    // ⭐ 还在算 ⇒ **显示进度**，⛔ 不是禁用按钮、⛔ 也不是空白页
    line(T('game.reviewWait', { n: R.done, t: R.total }), 15, '#5a6f66');
  } else {
    // ⭐ 精准度（只统计玩家那一侧；限时局里时钟代落的手要剔除 —— 那不是玩家下的）
    const skip = C4State.timedOf(g) ? C4State.autoOf(g) : [];
    const me = g.mode === 'ai' ? C4State.humanPlayer(g) : 0;
    const acc = C4Review.accuracyOf(R.labels, { side: me, skipPlies: skip });
    // ⛔ null = 没算过 ⇒ 如实说，**绝不显示成 0%**（那是谎报）
    // ⭐⭐ 整块内容**垂直居中**于「标题下 ~ 按钮上」这段净空。
    //   ⚠ 这是被截图改过的（2026-08-06）：第一版从顶上排下来 + 曲线定高
    //   ⇒ 曲线下方留了 350 px 的**纯空白**，一屏里最显眼的东西是「什么都没有」。
    //   ⛔ 别靠「把曲线拉到很高」去填满：一条折线拉伸到半屏只会显得空洞 ——
    //     正解是内容成块居中，空白平分到上下。
    const avail = (L.bottomLimit - bht(46) - 16) - y;
    const curveH = Math.max(64, Math.min(300, Math.round(avail * 0.46)));
    const nLines = 1 + (R.tp ? 2 : 1) + (G.brilliantCount > 0 ? 1 : 0);   // 精准度 + 转折点 + ✨
    const contentH = curveH + 12 + nLines * 30;
    y += Math.max(0, Math.round((avail - contentH) / 2));
    // 精准度那一行要跟着一起居中 ⇒ 先退回去再画（⚠ line() 会把 y 往下推）
    y -= 30;
    line(acc === null ? T('game.accNone') : T('game.accLine', { n: acc }), 17);
    drawCurve(marg, y, full, curveH, R);
    y += curveH + 12;
    // ⭐ 转折点 —— ⚠⚠ 措辞是**陈述事实**，⛔ 不指责（§3.3 死线）
    if (R.tp) {
      const best = bestColAt(g, R.tp.ply);
      line(T('game.tpLine', { n: R.tp.ply + 1, c: R.labels.find(e => e.ply === R.tp.ply).col + 1 }), 14);
      if (best >= 0) line(T('game.tpBetter', { c: best + 1 }), 14, '#3f7f66');
    } else {
      line(T('game.tpNone'), 14, '#5a6f66');
    }
    if (G.brilliantCount > 0) line(T('game.brilliantCount', { n: G.brilliantCount }), 14, '#8a5a12');
  }

  // ─── 按钮：［从这一步重来］+［再来一局］───
  const rowH = bht(46), gap = 12;
  const by = L.bottomLimit - rowH - 8;
  if (!why && R.ready && R.tp) {
    const w2 = (full - gap) / 2;
    btn(marg, by, w2, rowH, T('game.replayFrom'), 'REPLAY_FROM', { ply: R.tp.ply },
        { bg: C4Render.PAL.accent, size: 15 });
    btn(marg + w2 + gap, by, w2, rowH, T('game.again'), 'AGAIN', {}, { bg: '#61776f', size: 15 });
  } else {
    btn(marg, by, full, rowH, T('game.again'), 'AGAIN', {}, { bg: '#61776f', size: 15 });
  }
}


// ════════ ⭐⭐ 课程页（P4 · DESIGN §5）════════
//
// §5：「有真值 ⇒ 教程可以**自动出题、自动判分、无限供给、还能诊断你哪儿不会**。」
// ⛔ 课程**永远免费**（§3.2 那条红线同样罩着它）。
//
// ⚠ 出题要真值 ⇒ 走 C4Analysis 的插队请求；**没算出来之前如实说「正在出题」**，
//   ⛔ 不是转到天荒地老、更不是先给一道判不了分的题。

/** 这一课做完了没有（存在 settings 的 lessonsMask 位图里）。 */
function lessonDone(id) { return !!((C4Settings.get('lessonsMask') | 0) & (1 << (id - 1))); }
function markLessonDone(id) {
  const m = C4Settings.get('lessonsMask') | 0;
  C4Settings.set('lessonsMask', m | (1 << (id - 1)));
}
/** 做完几课（⇒ 成就/XP 读它）。 */
function lessonsDoneCount() {
  let m = C4Settings.get('lessonsMask') | 0, n = 0;
  while (m) { n += m & 1; m >>>= 1; }
  return n;
}
/** 诊断标签的累计（§5.3 的数据源）。 */
function tagCounts() {
  return {
    under: C4Settings.get('tagUnder') | 0,
    missFork: C4Settings.get('tagMissFork') | 0,
    offCenter: C4Settings.get('tagOffCenter') | 0,
    parity: C4Settings.get('tagParity') | 0
  };
}
function doneLessonIds() {
  const out = [];
  for (const L of C4Lessons.LESSONS) if (lessonDone(L.id)) out.push(L.id);
  return out;
}

function openLearn() { G.phase = 'LEARN'; G.lesson = null; renderAll(); }

/** ⭐ 开一课。 */
function startLesson(id) {
  const L = C4Lessons.lessonOf(id | 0);
  if (!L) return;
  G.lesson = { id: L.id, concept: L.concept, moves: [], sa: null, picked: -1,
               judged: null, loading: true, tries: 0, ctx: null };
  nextQuestion();
}

/**
 * ⭐ 出下一道题。**确定性伪随机**走几手（⛔ 禁 Math.random：同一课的题目序列要可重放），
 * 然后问 C4Analysis 要真值；筛不中就换一道（有上限，⛔ 别无限转）。
 */
function nextQuestion() {
  const st = G.lesson;
  if (!st) return;
  const L = C4Lessons.lessonOf(st.id);
  st.picked = -1; st.judged = null; st.loading = true;
  let x = ((st.id * 2654435761) ^ ((st.tries + 1) * 0x9e3779b9)) >>> 0;
  let bd = Bitboard.newBoard();
  const moves = [];
  const depth = L.concept === 'opening' ? 2 + (st.tries % 4)
              : L.concept === 'endgame' ? 20 + (st.tries % 8)
              : 6 + (st.tries % 14);
  for (let d = 0; d < depth; d++) {
    if (RulesClassic.terminal(bd) !== null) break;
    const legal = RulesClassic.moves(bd);
    x = (x * 1103515245 + 12345) >>> 0;
    const c = legal[x % legal.length];
    moves.push(c);
    bd = Bitboard.play(bd, c);
  }
  st.moves = moves;
  st.tries++;
  if (RulesClassic.terminal(bd) !== null) { if (st.tries < 40) return nextQuestion(); }
  C4Analysis.request(moves, { priority: true });
  const sa = C4Analysis.get(moves);
  if (sa) applyQuestion(sa); else renderAll();
}

/** 真值回来了 ⇒ 看这道题符不符合本课概念；不符合就换一道（⛔ 别塞不相关的题给玩家）。 */
function applyQuestion(sa) {
  const st = G.lesson;
  if (!st || !sa) return;
  // ⛔ 空对象 = 这个局面已终局（solver 的约定）。⚠ 早退但**不清 loading** 的话，
  //   页面会永远停在「正在出题…」，而 onIdle 每次重入都走同一条早退（2026-08-07 抓到）。
  //   ⇒ 换一道题；连换 40 次都不成就如实停下，⛔ 别把玩家晾在转圈上。
  if (!Object.keys(sa).length) {
    if (st.tries < 40) { nextQuestion(); return; }
    st.loading = false;
    st.why = T('game.hintOff');
    renderAll();
    return;
  }
  const bd = Bitboard.fromMoves(st.moves);
  const ctx = Object.assign({ n: bd.n }, tagCtx(bd, bd.turn));
  ctx.forkCols = RulesClassic.moves(bd).filter(function (c) {
    const fk = C4Threats.forkOf(bd, Bitboard.play(bd, c));
    return fk && fk.player === bd.turn;
  });
  if (!C4Lessons.matches(st.concept, sa, ctx) && st.tries < 40) { nextQuestion(); return; }
  st.sa = sa; st.ctx = ctx; st.loading = false;
  renderAll();
}

/** ⭐ 玩家点了一列 ⇒ 求解器**立刻**判对错 + 给机械导出的理由（§5.2.2）。 */
function answerLesson(col) {
  const st = G.lesson;
  if (!st || st.loading || !st.sa || st.judged) return;
  let j;
  // ⚠ 带上 n：judge 靠它认出「当场连四」那条理由（⛔ 否则第 1 课会说成「最稳的一列」）
  // ⭐ 并把出题时算好的 fork 上下文一并传进去（st.ctx 在 applyQuestion 里存的）。
  //   ⛔ 少了它，hintLevel2 永远回不了 makeFork/blockFork ⇒ **第 7/8 课（双威胁）
  //     判对之后说的却是「这一列最稳」** —— 与第 1 课那条已修的教学违和是同一个毛病。
  const qbd = Bitboard.fromMoves(st.moves);
  try {
    j = C4Lessons.judge(st.sa, col, Object.assign({}, st.ctx || {}, {
      col: col, n: qbd.n,
      makesFork: !!(st.ctx && st.ctx.forkCols && st.ctx.forkCols.indexOf(col) >= 0),
      blocksFork: forkBlocked(qbd, col, qbd.turn)
    }));
  } catch (e) { return; }
  st.picked = col;
  st.judged = j;
  Sfx.play(j.ok ? 'brilliant' : 'undo');
  if (j.ok) markLessonDone(st.id);
  renderAll();
}

/** ⭐ 二级页通用返回键（**左上角**，本仓铁律；y 从 safeTop 起算）。 */
function pageBack(L, action) {
  const x = L.tray.x, y = L.safeTop + 4, w = 66, h = 34;
  fillRR(x, y, w, h, 10, 'rgba(97,119,111,0.92)');
  fitTxt('‹ ' + T('game.back'), x + w / 2, y + h / 2, w - 12, '#fff', 'bold', fsz(14));
  addHit(x, y, w, h, action || 'PAGE_BACK', {});
  return { x: x, y: y, w: w, h: h };
}

function drawLearn(L) {
  const marg = L.tray.x, full = L.tray.w;
  G.pageBack = pageBack(L, G.lesson ? 'LEARN' : 'PAGE_BACK');
  fitTxt(T('menu.learn'), L.SW / 2, L.safeTop + 21, full - 160, C4Render.PAL.hudText, 'bold', fsz(19));
  const st = G.lesson;

  if (!st) {
    let y = L.safeTop + 56;
    const done = lessonsDoneCount();
    fitTxt(T('learn.progress', { n: done, t: C4Lessons.LESSONS.length }),
           L.SW / 2, y + 10, full - 20, C4Render.PAL.hudSub, '600', fsz(13));
    y += 30;
    // ⭐ 「下一个目标」：由**诊断**推的那一课（§5.2.3 的自适应课程）
    const next = C4Lessons.nextLesson(tagCounts(), doneLessonIds());
    fitTxt(T('learn.next', { n: next }), L.SW / 2, y + 10, full - 20, '#c2601f', 'bold', fsz(13));
    y += 32;
    const cols = 4, gap = 8;
    const bw = (full - gap * (cols - 1)) / cols, bh = bht(40);
    for (const Ls of C4Lessons.LESSONS) {
      const i = Ls.id - 1;
      const bx = marg + (i % cols) * (bw + gap);
      const by = y + Math.floor(i / cols) * (bh + gap);
      const okDone = lessonDone(Ls.id);
      btn(bx, by, bw, bh, String(Ls.id), 'LESSON', { id: Ls.id },
          { bg: okDone ? '#37a87c' : (Ls.id === next ? C4Render.PAL.accent : '#61776f'), size: 15 });
    }
    return;
  }

  let y = L.safeTop + 52;
  fitTxt(T('learn.' + C4Lessons.lessonOf(st.id).key), L.SW / 2, y + 10, full - 20,
         C4Render.PAL.hudText, 'bold', fsz(15));
  y += 30;
  if (st.loading) {
    fitTxt(T('learn.making'), L.SW / 2, y + 10, full - 20, C4Render.PAL.hudSub, '600', fsz(13));
  } else if (st.judged) {
    const j = st.judged;
    const why = T('game.r' + j.reason.charAt(0).toUpperCase() + j.reason.slice(1));
    // ⭐ 把**玩家点的那一列**写进这句话。⚠ 截图实测：只在盘上给那格描一圈边，
    //   在手机尺寸下**根本看不出来** —— 而「我到底点了哪一列」是这一屏最要紧的信息。
    fitTxt(T(j.ok ? 'learn.right' : 'learn.wrong') + ' · '
             + T('game.hintCol', { n: st.picked + 1 }) + ' · ' + why,
           L.SW / 2, y + 10, full - 20, j.ok ? '#2f8f6a' : '#c2601f', 'bold', fsz(14));
    if (!j.ok) {
      fitTxt(T('game.hintCol', { n: j.best[0] + 1 }), L.SW / 2, y + 32, full - 20,
             C4Render.PAL.hudSub, '600', fsz(13));
    }
  } else {
    fitTxt(T('learn.yourTurn'), L.SW / 2, y + 10, full - 20, C4Render.PAL.hudSub, '600', fsz(13));
  }

  // 盘面。⚠ 列热区用 LESSON_COL，⛔ 别复用 COL（那会真的落子）
  const bd = Bitboard.fromMoves(st.moves);
  const rowH = bht(46);
  const avail = (L.bottomLimit - rowH - 16) - (y + 44);
  const cell = Math.max(24, Math.min(Math.floor(full / 7), Math.floor(avail / 6)));
  const bw2 = cell * 7, bx2 = Math.round((L.SW - bw2) / 2), by2 = y + 44, bh2 = cell * 6;
  fillRR(bx2 - 6, by2 - 6, bw2 + 12, bh2 + 12, 12, C4Render.PAL.slab);
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const cx = bx2 + cell * (c + 0.5), cy = by2 + cell * (5 - r + 0.5);
      const who = C4Render.cellOwner(bd, c, r);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = who === 0 ? C4Render.PAL.p0Fill : (who === 1 ? C4Render.PAL.p1Fill : C4Render.PAL.well);
      ctx.fill();
      // ⭐ 判过之后**把玩家点的那枚子真的画上去**（⛔ 只描一圈边在截图里根本看不出来
      //   ——「我到底点了哪一列」是这一屏最要紧的信息）。
      if (who === null && st.judged && st.picked === c && r === C4Render.landingRow(bd, c)) {
        ctx.fillStyle = bd.turn === 0 ? C4Render.PAL.p0Fill : C4Render.PAL.p1Fill;
        ctx.fill();
        ctx.strokeStyle = st.judged.ok ? '#2f8f6a' : '#c2601f';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
  }
  if (!st.loading && !st.judged) {
    for (const c of RulesClassic.moves(bd)) addHit(bx2 + cell * c, by2, cell, bh2, 'LESSON_COL', { col: c });
  }
  if (st.judged) {
    btn(marg, L.bottomLimit - rowH - 8, full, rowH, T('learn.next2'), 'LESSON_NEXT', {},
        { bg: C4Render.PAL.accent, size: 15 });
  }
}

// ════════ ⭐ 统计 / 成就 / 「我的弱点」（P5 · §7.7-7.9 + §5.3）════════
function drawStats(L) {
  const marg = L.tray.x, full = L.tray.w;
  G.pageBack = pageBack(L);
  fitTxt(T('menu.stats'), L.SW / 2, L.safeTop + 21, full - 160, C4Render.PAL.hudText, 'bold', fsz(19));
  const st = {
    games: C4Settings.get('games') | 0, wins: C4Settings.get('wins') | 0,
    winsNoHint: C4Settings.get('winsNoHint') | 0, brilliants: C4Settings.get('brilliants') | 0,
    bestAcc: C4Settings.get('bestAcc') | 0, lessonsDone: lessonsDoneCount()
  };
  const s = C4Meta.stats(st);
  const p = C4Meta.levelProgress(C4Meta.xpOf(st));
  let y = L.safeTop + 52;
  const line = function (txt, size, color) {
    fitTxt(txt, L.SW / 2, y + 10, full - 20, color || C4Render.PAL.hudText, '600', fsz(size || 14));
    y += 28;
  };

  line(T('meta.level', { n: p.lv }) + ' · ' + T(C4Meta.titleKey(p.lv)), 17);
  fillRR(marg + 20, y, full - 40, 8, 4, 'rgba(255,255,255,0.85)');
  fillRR(marg + 20, y, (full - 40) * p.frac, 8, 4, C4Render.PAL.accent);
  y += 22;
  // ⛔ 0 局时 rate 是 null ⇒ 显示占位符，绝不显示 0%
  line(T('meta.games', { n: s.games }) + ' · ' +
       T('meta.rate', { n: s.rate === null ? '—' : s.rate + '%' }), 14);
  // ⭐ §7.8：零提示胜率才是拿去炫的那个口径
  line(T('meta.rateClean', { n: s.noHintRate === null ? '—' : s.noHintRate + '%' }), 14, '#2f8f6a');
  // ⚠ 这一处的 ★ 只是**装饰**（旁边还有文字与数字），豆腐了也读得懂 ⇒ 保留字面量；
  //   ⛔ 成就格那处不行（★ 是那一格唯一的内容）—— 那里已改成 drawStar。
  line(T('game.accuracy') + ' ' + ((C4Settings.get('bestAccN') | 0) ? st.bestAcc + '%' : '—'), 14);
  y += 4;
  // ⭐ 「我的弱点」（§5.3）——⚠ 措辞是**陈述事实**，⛔ 不指责
  const w = C4Lessons.weakness(tagCounts());
  if (w.length) {
    line(T('meta.weak'), 13, C4Render.PAL.hudSub);
    for (const it of w.slice(0, 3)) line(T('tag.' + it.tag) + ' · ' + it.n, 13, '#c2601f');
  } else {
    line(T('meta.weakNone'), 13, C4Render.PAL.hudSub);
  }
  y += 4;
  const ach = C4Meta.achievements(st);
  line(T('meta.ach', { n: ach.filter(function (a) { return a.got; }).length, t: ach.length }), 13, C4Render.PAL.hudSub);
  const cols = 5, gap = 6, bw = (full - gap * (cols - 1)) / cols, bh = bht(28);
  ach.forEach(function (a, i) {
    const bx = marg + (i % cols) * (bw + gap), by = y + Math.floor(i / cols) * (bh + gap);
    fillRR(bx, by, bw, bh, 8, a.got ? '#37a87c' : 'rgba(97,119,111,0.26)');
    // ⛔ 别用 '★' 字面量：部分安卓 WebView 会落到缺字回退框（豆腐块），而这一格里
    //   它是**唯一**内容 ⇒ 整行成豆腐（2026-08-07 抓到）。drawStar 是现成的矢量星，
    //   drawKidsCheer / drawMark 早就是为同一条理由改的。
    if (a.got) drawStar(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.30, '#fff');
    else fitTxt(String(a.need), bx + bw / 2, by + bh / 2, bw - 6,
                'rgba(38,74,61,0.55)', 'bold', fsz(12));
  });
  const rowH = bht(46);
  btn(marg, L.bottomLimit - rowH - 8, full, rowH, T('menu.learn'), 'LEARN', {},
      { bg: C4Render.PAL.accent, size: 15 });
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
  // ⭐⭐ 限时模式（P2c T5 · §6.10）：**切后台不许偷跑** —— 切到别的 app 回来不该发现
  //   自己超时输了。⚠ 这里是**两层**里的第二层，两层都要：
  //     ① clockBlock() 每一拍现问 `document.hidden`（后台里 setInterval 被节流到 ≥1 s，
  //        回前台的第一拍可能带着几秒的 dt，而那时 hidden 已经是 false 了 ⇒ 光靠事件挡不住）；
  //     ② 这个事件：切回来的**那一瞬**立刻同步一次基准并重画（⛔ 否则要等下一拍才更新，
  //        中间那段仍可能被算进去；顺带让画面立刻恢复成「表在走」）。
  try {
    document.addEventListener('visibilitychange', () => { clockTick(); renderAll(); });
  } catch (e) { /* 没有 document 的壳 */ }
  Controls.render();
  renderAll();

  // ⭐ 边打边算（P3 T2）用的就是同一个 Worker 门面。⚠ 注入而不是让 analysis.js 自己去取，
  //   是为了让它在 node 门禁里能塞一个假 client（那里要钉的是**调度**，不是求解器）。
  C4Analysis.attach(EngineClient);
  // ⭐ 「这一局的活干完了」⇒ 记一次纪录 + 重画（进度/精准度这时才有得显示）。
  //   ⛔ 写存储绝不能放渲染里（renderAll 每帧都跑 = 每帧一次 IO）——这就是 onIdle 存在的理由。
  C4Analysis.onIdle(() => {
    recordAccuracy();
    // ⭐⭐ 课程正等着这道题的真值 ⇒ 回来了就推进。
    //   ⛔ 少了这一句，`G.lesson.loading` 会永远挂着（页面上就是「正在出题…」转到天荒地老，
    //   而请求其实早算完了）—— 2026-08-06 被 e2e-p45 当场抓出。
    if (G.phase === 'LEARN' && G.lesson && G.lesson.loading) {
      const sa = C4Analysis.get(G.lesson.moves);
      if (sa) { applyQuestion(sa); return; }      // ⚠ applyQuestion 自己会重画
    }
    // ⭐⭐ 提示也在等真值 ⇒ 回来了就把它补完。
    //   ⛔ 少了这一句有两个后果，第二个很严重（2026-08-07 code review 抓到）：
    //   ① 提示条永远停在「正在算」，玩家得再按一次；
    //   ② **限时局里时钟被永久冻结** —— clockBlock() 在 hint.pending 时返回 'engine'，
    //      而 pending 从来没人清 ⇒ 表停住再也不走，那一手变成无限思考时间。
    if (G.hint && G.hint.pending) { resumeHint(); return; }   // ⚠ resumeHint 自己会重画
    renderAll();
  });

  // ⭐ 首屏**不 await** 引擎：让玩家先看见界面（DESIGN §9.2）。
  // ⭐ 引擎状态一变就 kick 一下边打边算：**开局库到位的那一刻**正是它该开工的时刻
  //   （在那之前 analysis 一个请求都不发 —— 无库的 n≤9 是几十分钟，见它的判断④）。
  EngineClient.onChange(() => { C4Analysis.kick(); renderAll(); });
  EngineClient.start().then(okv => {
    renderAll();
    if (okv) EngineClient.ensureBook();   // 3.6 MB 开局库懒加载，到位后自然变快
  });
}

boot();
