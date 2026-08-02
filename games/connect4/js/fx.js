// ════════════════════════════════════════
// fx.js —— 表现层动画状态机（P2b Task 2）。**纯表现**：
//   ⛔ 不碰盘面真值、不进存档、不参与任何规则判断。整个模块删掉，游戏照样能玩完一局
//      （只是难看）—— 这条是它的设计约束，也是它能在 node 里被逐位断言的原因。
//
// DESIGN §6.3：**一局落 20 次子，一天几百次。这一个动作的手感就是这个游戏的手感。**
//   加速下落 → 撞底/撞上一枚 → **微弹** → 停（带一点 squash & stretch）。
//
// ⭐⭐ 本文件唯一一条承重的实现决定：**pose 是 `t`（累计时间）的闭式纯函数**，
//    ⛔ 不是「每帧 v += g*dt; y += v*dt」的欧拉积分。
//    理由不是洁癖，是掉帧：Euler 积分的结果**取决于 dt 怎么切**（同样 137 ms，
//    一帧走完 vs 十七帧走完，落点差出小半格）⇒ 手机上一卡顿，棋子就穿到格子里/停在半空，
//    而且**只在卡顿时复现**，是最像玄学的一类 bug。闭式解让 `step()` 对 dt 的切分
//    完全免疫，tests/test-fx.js 的 ⭐⭐ 那条（1 次 / 3 次 / 17 次不等长推进）钉的就是它。
//    ⇒ ⛔ 以后往这里加动画，也必须写成 `pose = f(t)`，别引入任何跨帧累积的状态。
//
// ⚠ 单位：**dy / 高度一律是「格」（cell）不是像素** —— 动画中途转屏/改窗口时 layout 的
//   cell 会变，用像素存的话棋子会当场跳一下。render 那侧乘 `L.cell` 落到屏幕上。
//   时间一律 ms。dy < 0 = 在目标格**上方**（屏幕坐标向下为正）。
//
// ⭐ P2b Task 3 往这里加了第二种动画 `'win'`（DESIGN §6.3 最后一段）：**连线逐段画出、
//   四枚依次点亮、其余变暗、时间放慢半秒**。它同样是闭式解（见 poseWinOf），
//   而「时间放慢」是**唯一一处会影响别的动画**的东西 —— 实现方式见下面的 ⑤ 慢放时钟。
//
// ⚠ T6（§6.8 减弱动态）将来要门控的**就是本文件的全部 `start()` 调用**：
//   · `start('drop')`  ⇒ 关掉时 main 立刻走落定回调（音 + 震动 + 静态帧）；
//   · `start('win')`   ⇒ 关掉时 main 立刻画**静态的**赢局帧（连线整条 + 四枚全亮 + 变暗）
//                        并立刻 markOverReady()（结算节奏一步到位，⛔ 不许因为没动画就没结算）；
//     ⭐ 慢放时钟是 win 动画的一部分 ⇒ 不 start('win') 就**根本不会有慢放**，
//        减弱动态下棋子照常按正常速度落 —— 这正是 T6 想要的，⛔ 别再单独加一个开关。
//   ⛔ 别把门控写进 fx 内部（那样「动画到底跑没跑」就有两个真值了）。
//
// ⛔ 落子动画期间**不许锁输入**（casual-game-meta §6 / solitaire 实踩：发牌动画 1 秒内
//   点击全被吞，快手玩家觉得「点不动」）。⇒ 本模块**没有** lock/busy 之类的东西可给
//   main 拿去当门槛，这是故意的；能同时有多枚棋子在飞（items 是个**列表**）也是为这条。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  const H = 6;                  // 与 bitboard/render 同一套：r=0 是最底行

  // ── 手感常数（改这几个数 = 改整个游戏的手感，改完跑 tests/test-fx.js）──
  const G_ACC    = 1.728e-4;    // 重力，cells/ms²。定标：掉满 6.3 格 ≈ 270 ms
  const REST     = 0.16;        // 回弹系数：**微**弹（0.16 ⇒ 首次弹起 ~0.16 格）
  const HOPS     = 2;           // 弹两下（第二下 ~0.004 格，只贡献「停稳」的那点余韵）
  const BAND     = 1.16;        // 悬停带中心 → 顶行格心的默认距离（格）。
                                // ⚠ 这是 layout 的实测值（drop.h=1.05cell + pad=0.14cell），
                                //   main 会把**当前 layout 真算出来的**距离传进来，这里只是兜底。
  const FALL_MIN = 0.5;         // 再短也要掉这么远，否则最上一行的动画短到看不见
  const STRETCH  = 0.16;        // 下落拉伸上限（速度最大时）
  const SQUASH   = 0.20;        // 触底压扁上限
  const MAX_ACTIVE = 6;         // ⚠ 上限：连点也不许攒出一堆在飞的棋子（内存/绘制都封顶）

  // ── 赢局庆祝的时间常数（P2b Task 3 · DESIGN §6.3 + §6.5）──
  // ⭐ 总预算 = lead + WIN_DRAW + WIN_HOLD ≈ 0.95 ~ 1.3 s，对齐 §6.5 的「庆祝 ~1.5 s」。
  //   ⚠ §6.5 是**产品红线不是建议**：四子棋一局 1-3 分钟，结算超过 5 秒就是打断节奏。
  //     这三个数就是那 5 秒的唯一来源 ⇒ 调大它们，e2e-p2b 的「终局 → 主 CTA ≤ 5 s」会红。
  const WIN_DRAW   = 460;       // 连线从第一枚画到最后一枚（ms）
  const WIN_LIT    = 170;       // 单枚棋子点亮的时长
  const WIN_HOLD   = 360;       // 画完之后停多久（⚠ 必须 ≥ WIN_LIT，否则最后一枚还没亮完就散场）
  const WIN_DIM_IN = 260;       // 其余变暗的渐入
  const DIM_MAX    = 0.62;      // ⚠ 与 render 的 `dim === true` **同一个数**，⛔ 别各写各的
  const WIN_LEAD_MIN = 120;     // 再快也先给一拍（⛔ 别让连线与落地同一帧蹦出来）
  const WIN_LEAD_MAX = 700;     // 兜底上限：lead 是算出来的，⛔ 不许算飞了把结算拖长

  // ── ⭐ 时间放慢（bullet time，DESIGN §6.3「时间放慢半秒」）──
  // ⛔ 「放慢」**不是**「卡住」：速率恒 ≥ SLOW_MIN > 0，棋子每一帧都在动。
  //   卡住（scale=0 / setTimeout 停一拍）在玩家眼里就是掉帧，是这条最容易做砸的方式。
  const SLOW_MIN  = 0.42;       // 最慢到 0.42×（还看得出在动，又明显「慢下来了」）
  const SLOW_HOLD = 180;        // 保持最慢（raw ms）
  const SLOW_RAMP = 320;        // 再用 320 ms 平滑回到 1.0×（⛔ 别硬切回去，那是第二次「卡一下」）

  // ════════ ① 时间线规划（纯函数，给定 fall 恒定）════════
  /**
   * 一次下落的完整时间线。
   * @param fall 下落距离（格）
   * @returns { fall, tf, v0, hops:[{v,dur,h}], tb, total }
   *   tf = 自由落体时长；tb = 弹跳段总时长；total = tf + tb
   */
  function planDrop(fall) {
    fall = Math.max(FALL_MIN, fall);
    const tf = Math.sqrt(2 * fall / G_ACC);      // ⭐ 闭式：s = ½gt² ⇒ t = √(2s/g)
    const v0 = G_ACC * tf;                       // 触底速度
    const hops = [];
    let v = v0 * REST;
    let tb = 0;
    for (let i = 0; i < HOPS; i++) {
      const dur = 2 * v / G_ACC;                 // 抛起再落回
      hops.push({ v: v, dur: dur, h: v * v / (2 * G_ACC) });
      tb += dur;
      v *= REST;
    }
    return { fall: fall, tf: tf, v0: v0, hops: hops, tb: tb, total: tf + tb };
  }

  /** 没有 layout 可问时的兜底下落距离（格）：从悬停带掉到第 r 行。 */
  function fallForRow(r) { return (H - 1 - r) + BAND; }

  /** 这一次下落要多久（ms）—— 给测试与结算节奏（T3）问预算用。 */
  function dropDuration(fall) { return planDrop(fall).total; }

  // ════════ ①b ⭐ 慢放时钟（T3「时间放慢半秒」）════════
  // ⭐⭐ 这一段是本 task 唯一一处「一个动画影响另一个动画」的地方，写法是承重的：
  //
  //   把「真实时间 raw」和「游戏世界时间 game」分开。raw 由 step() 纯加法累计（⇒ 对 dt 切分
  //   完全免疫）；game = 一条**闭式**的单调映射 gameTime(raw)。落子动画读的是 **game**，
  //   赢局庆祝读的是 **raw**（它是「镜头」不是「世界」，⛔ 慢放不该把庆祝自己也拖慢）。
  //
  //   ⛔ 绝不许写成「每帧 t += dt * scale(t)」—— 那又是欧拉积分，dt 一切分结果就变
  //      （与文件头 ⭐⭐ 同一个坑，只是这次藏在时间轴上）。这里用速率函数的**解析积分** Φ：
  //        scale(u) = SLOW_MIN                            u ∈ [0, HOLD]
  //                 = SLOW_MIN + (1-SLOW_MIN)(u-HOLD)/RAMP u ∈ [HOLD, HOLD+RAMP]
  //                 = 1                                    u > HOLD+RAMP
  //      Φ(u) = ∫scale ⇒ 分段「线性 / 二次 / 线性」，逐段拼上就是下面这几行。
  let clock = 0;                 // 累计真实时间（raw ms）。⛔ 只在 step() 里 `+= dt`。
  let slowFrom = Infinity;       // 慢放窗口起点（raw）。Infinity = 没在慢放 ⇒ gameTime 是恒等映射。

  /** 慢放窗口内的速率（0..1）。⚠ 恒 > 0：放慢 ≠ 暂停。 */
  function slowScale(u) {
    if (!(u >= 0)) return 1;
    if (u <= SLOW_HOLD) return SLOW_MIN;
    if (u >= SLOW_HOLD + SLOW_RAMP) return 1;
    return SLOW_MIN + (1 - SLOW_MIN) * (u - SLOW_HOLD) / SLOW_RAMP;
  }
  /** Φ(u)：慢放开始后 u 毫秒真实时间里，游戏世界走过的毫秒数。 */
  function warpInt(u) {
    if (!(u > 0)) return 0;
    if (u <= SLOW_HOLD) return SLOW_MIN * u;
    const x = Math.min(u - SLOW_HOLD, SLOW_RAMP);
    let v = SLOW_MIN * SLOW_HOLD + SLOW_MIN * x + (1 - SLOW_MIN) * x * x / (2 * SLOW_RAMP);
    if (u > SLOW_HOLD + SLOW_RAMP) v += u - SLOW_HOLD - SLOW_RAMP;
    return v;
  }
  /** Φ⁻¹(g)：世界要走 g 毫秒，得花多少真实毫秒。⭐ 算 lead（等那枚棋子落地）就靠它。 */
  function warpInv(g) {
    if (!(g > 0)) return 0;
    const g1 = SLOW_MIN * SLOW_HOLD;
    if (g <= g1) return g / SLOW_MIN;
    const g2 = warpInt(SLOW_HOLD + SLOW_RAMP);
    if (g >= g2) return SLOW_HOLD + SLOW_RAMP + (g - g2);
    // 解 a·x² + b·x = g - g1（x = u - HOLD），a>0 ⇒ 取正根
    const a = (1 - SLOW_MIN) / (2 * SLOW_RAMP), b = SLOW_MIN, c = g - g1;
    return SLOW_HOLD + (Math.sqrt(b * b + 4 * a * c) - b) / (2 * a);
  }
  /** raw → game。⚠ 单调不减、连续；没在慢放时是**逐位**恒等（⇒ 老行为一个像素都不变）。 */
  function gameTime(raw) {
    return raw <= slowFrom ? raw : slowFrom + warpInt(raw - slowFrom);
  }

  // ════════ ② 单个 drop 的 pose：**t 的闭式纯函数** ════════
  // ⛔ 这个函数里不许出现任何 `it.x = ...`（写回状态）—— 一旦写回，dt 幂等性当场没了。
  function poseOf(it) {
    const p = it.plan;
    const t = it.t;

    // ⭐ 终态**显式短路**：dy / sx / sy 必须是**精确**的 0 / 1 / 1。
    //   不短路的话末尾那一下是 `v*dur - ½g·dur²`，浮点上是 ~1e-19 而不是 0 ——
    //   棋子会永远停在离格心十亿分之一像素的地方（画面看不出来），但
    //   「落点恰好停在目标格」这条断言就只能松到 epsilon，等于放走了真正的超调 bug。
    if (t >= p.total) {
      return { id: it.id, kind: it.kind, c: it.c, r: it.r, player: it.player,
               dy: 0, sx: 1, sy: 1, phase: 'rest', t: p.total, total: p.total };
    }

    let dy, sx, sy, phase;
    if (t < p.tf) {
      // ── 自由落体：加速掉 + 随速度拉长（squash & stretch 的 stretch 那一半）──
      const s = 0.5 * G_ACC * t * t;
      dy = -(p.fall - s);                        // 负 = 还在目标上方
      const k = (G_ACC * t) / p.v0;              // 0..1 的速度占比
      sy = 1 + STRETCH * k;
      sx = 1 / sy;                               // 体积守恒感：拉长就变瘦
      phase = 'fall';
    } else {
      // ── 弹跳段：一串越来越小的抛物线小跳 ──
      let tb = t - p.tf;
      let hop = p.hops[p.hops.length - 1], tau = hop.dur;
      for (let i = 0; i < p.hops.length; i++) {
        if (tb < p.hops[i].dur) { hop = p.hops[i]; tau = tb; break; }
        tb -= p.hops[i].dur;
      }
      const h = Math.max(0, hop.v * tau - 0.5 * G_ACC * tau * tau);   // 当前离地高度（格）
      dy = -h;
      // 压扁量 = 衰减 × 接触度。
      //   衰减 (1-u)² 在弹跳段末尾**恰好为 0** ⇒ 停下时 sx=sy=1，不留一枚被压扁的棋子；
      //   接触度 1 - h/hmax 在触地瞬间为 1、在小跳的顶点为 0 ⇒ 只有「砸在东西上」才压扁。
      const u = (t - p.tf) / p.tb;
      const decay = (1 - u) * (1 - u);
      const contact = hop.h > 0 ? Math.max(0, 1 - h / hop.h) : 1;
      const amp = SQUASH * decay * contact;
      sy = 1 - amp;
      sx = 1 + amp * 0.9;
      phase = 'settle';
    }
    return { id: it.id, kind: it.kind, c: it.c, r: it.r, player: it.player,
             dy: dy, sx: sx, sy: sy, phase: phase, t: t, total: p.total };
  }

  // ════════ ②b ⭐ 赢局庆祝的 pose：同样是 **t 的闭式纯函数** ════════
  // DESIGN §6.3：「四枚棋子发光、**画出那条连线**、其余变暗、时间放慢半秒。
  //   玩家必须看清自己赢在哪 —— 第一局赢的那 3 秒是 D1 的杠杆。」
  //
  // ⭐ 三条曲线，各自独立、都只读 t：
  //   dim  0 → DIM_MAX（渐入，⛔ 不是一帧切黑）
  //   prog 0 → 1，**线性** —— 「逐段画出」在画面上就是「可见长度匀速在长」。
  //        ⛔ 别加 ease-in：起手慢一拍会让人以为是卡了；⛔ 也别做成 4 段跳变（那是四次闪）。
  //   lit[i] 第 i 枚的点亮程度：连线的**画笔头走到它**那一刻才开始亮（错开 draw/段数）。
  //        ⇒ 「依次点亮」不是另一条时间轴，而是同一条线的直接后果，⛔ 两边别各定各的时间。
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function poseWinOf(it) {
    const t = it.t;
    const n = it.line.length;
    const seg = Math.max(1, n - 1);
    const per = it.draw / seg;                       // 画笔头走过一段要多久
    const u = clamp01((t - it.lead) / it.draw);
    const lit = [];
    for (let i = 0; i < n; i++) lit.push(clamp01((t - it.lead - i * per) / WIN_LIT));
    return {
      id: it.id, kind: 'win', line: it.line,
      dim: DIM_MAX * clamp01(t / WIN_DIM_IN),
      prog: u, lit: lit,
      phase: t < it.lead ? 'lead' : (u < 1 ? 'draw' : 'hold'),
      t: t, total: it.total, lead: it.lead
    };
  }

  // ════════ ③ 状态机 ════════
  let items = [];
  let seq = 0;

  const num = v => typeof v === 'number' && isFinite(v);

  /** 连线容错：允许 [{c,r}] 或 [[c,r]]（与 render.normLine 同一条约定）。⚠ 坏数据一律 null。 */
  function normLine(line) {
    if (!Array.isArray(line) || line.length < 2) return null;
    const out = [];
    for (const p of line) {
      const c = Array.isArray(p) ? p[0] : (p && p.c), r = Array.isArray(p) ? p[1] : (p && p.r);
      if (!num(c) || !num(r)) return null;           // ⛔ 一个坏点就整条不要（NaN 会把线画到画布外）
      out.push({ c: c, r: r });
    }
    return out;
  }

  /**
   * 起一段动画。目前只有 'drop'（T3 的赢局、T5 的双威胁将来往这里加 kind）。
   * @param kind   'drop'
   * @param params { c, r, player, fall? }
   *   c,r     落点（r=0 最底行，与 bitboard 同一套）
   *   player  0|1（画哪种造型）
   *   fall    下落距离（格）。⭐ main 用**当前 layout** 真算；不给就按 r 兜底。
   * @returns id（number）或 null（参数不合法 ⇒ **什么都不做**，调用方照常画静态棋子）
   *
   * ⚠ 参数不合法一律返回 null 而不是抛：动画层炸掉不该把一局对弈带走。
   *   ⛔ 但也绝不许「带着 NaN 继续跑」—— NaN 的 dy 会把棋子静默画到画布外，
   *     表现是「这一子不见了」且零报错（abyssshoot 实踩过同一类）。
   */
  function start(kind, params) {
    if (kind === 'win') return startWin(params);
    if (kind !== 'drop') return null;
    const q = params || {};
    if (!num(q.c) || !num(q.r) || q.r < 0 || q.r >= H) return null;
    // ⚠ `fall` 给了就必须是**有限正数**：给了个 NaN 说明调用方的 layout 算术坏了 ——
    //   那时候悄悄用兜底值等于把 bug 藏起来，⇒ 宁可这一手不做动画（静态棋子照样对）。
    if (q.fall !== undefined && !(num(q.fall) && q.fall > 0)) return null;
    const fall = num(q.fall) ? q.fall : fallForRow(q.r);
    const plan = planDrop(fall);
    if (!num(plan.total) || plan.total <= 0) return null;
    // 同一格重复 start（撤销后立刻重下同列）⇒ 旧的那枚让位，别叠两枚在一起
    items = items.filter(it => !(it.kind === 'drop' && it.c === q.c && it.r === q.r));
    // ⚠ 封顶只数**下落**那些，⛔ 别把赢局庆祝当成「最老的一枚」挤掉（那会让庆祝凭空消失）
    if (items.filter(it => it.kind === 'drop').length >= MAX_ACTIVE) {
      const victim = items.find(it => it.kind === 'drop');
      items = items.filter(it => it !== victim);
    }
    const it = { id: ++seq, kind: 'drop', c: q.c, r: q.r,
                 player: q.player === 1 ? 1 : 0, t: 0, g0: gameTime(clock),
                 plan: plan, landed: false };
    items.push(it);
    return it.id;
  }

  /**
   * ⭐ 起赢局庆祝（T3）。⚠ 由 main 在**判出终局的那一刻**调，此时赢的那一枚往往还在飞。
   * @param params { line: [{c,r} ×4] }  赢的那四格（顺序 = 画连线的顺序）
   * @returns id 或 null（连线坏了 ⇒ 什么都不做，调用方照常画静态赢局帧）
   *
   * ⭐⭐ `lead`（等多久才开始画线）是**算出来的**不是拍脑袋的：
   *   问在飞的那枚棋子还差多少**游戏时间**撞底，再经 Φ⁻¹ 折算成真实时间。
   *   ⛔ 写死一个 300 ms 的话，掉得浅的那些手会「线先画完、棋子后落地」——
   *     那正是 T2 交接里点名的「先飞完再看到连线」的镜像版，一样是音画不同步。
   *   ⚠ 慢放窗口就从这一刻开始 ⇒ lead 必须用**慢放后**的真实时间算（否则线会早到）。
   */
  function startWin(params) {
    const q = params || {};
    const line = normLine(q.line);
    if (!line) return null;
    items = items.filter(it => it.kind !== 'win');   // ⛔ 一局只许有一个庆祝
    slowFrom = clock;                                // ⭐ 时间从这一刻开始放慢
    let remain = 0;                                  // 还在飞的那枚离**撞底**还有多少游戏时间
    for (const it of items) {
      if (it.kind === 'drop' && it.t < it.plan.tf) remain = Math.max(remain, it.plan.tf - it.t);
    }
    const lead = Math.max(WIN_LEAD_MIN, Math.min(WIN_LEAD_MAX, warpInv(remain)));
    const it = { id: ++seq, kind: 'win', line: line, lead: lead,
                 draw: WIN_DRAW, t: 0, raw0: clock,
                 total: lead + WIN_DRAW + WIN_HOLD, drew: false, ended: false };
    items.push(it);
    return it.id;
  }

  /**
   * 推进 dtMs 毫秒。**唯一的可变操作**，且只做一件事：`clock += dt`
   * （每个 item 的 t 都是由 clock **算出来**的，⛔ 不是各自累加出来的 —— 见 ①b）。
   * @returns 事件数组：
   *   { type:'land', c, r, player, id } —— 自由落体结束、**砸到底的那一瞬间**
   *     （⭐ 落定音 land{r} + 震动挂这里，不是挂动画播完 —— 弹跳的余韵之后才响就是「音画不同步」）
   *   { type:'winline', id }            —— ⭐ 连线**开始画**的那一瞬（= 赢的那枚落地那一刻）
   *     ⇒ win/lose 的结算音挂这里，⛔ 不挂判出终局那一刻（那时棋子还在半空，声音早到半秒）
   *   { type:'winend', id }             —— ⭐ 庆祝播完 ⇒ main 把主 CTA［再来一局］点成焦点态
   * ⭐ 事件对 dt 的切分同样免疫：无论 137 ms 切成几段，每种恰好发**一次**。
   * ⚠ 负 dt / NaN dt 一律当 0（切后台回来时 ts 有可能倒退）。
   */
  function step(dtMs) {
    const dt = num(dtMs) && dtMs > 0 ? dtMs : 0;
    const evs = [];
    if (!items.length) return evs;
    clock += dt;
    const gt = gameTime(clock);
    const keep = [];
    for (const it of items) {
      if (it.kind === 'win') {
        it.t = Math.min(clock - it.raw0, it.total);   // ⭐ 庆祝走**真实**时间（它是镜头不是世界）
        if (!it.drew && it.t >= it.lead) { it.drew = true; evs.push({ type: 'winline', id: it.id }); }
        if (it.t >= it.total) {
          if (!it.ended) { it.ended = true; evs.push({ type: 'winend', id: it.id }); }
        } else keep.push(it);
        continue;
      }
      it.t = Math.min(gt - it.g0, it.plan.total);     // ⭐ 棋子走**游戏**时间（会被慢放拉长）
      if (!it.landed && it.t >= it.plan.tf) {
        it.landed = true;
        evs.push({ type: 'land', c: it.c, r: it.r, player: it.player, id: it.id });
      }
      if (it.t < it.plan.total) keep.push(it);
    }
    items = keep;                 // ⭐ 播完就摘掉 ⇒ done() 为真 ⇒ main 的 rAF 停下来（别空转烧电）
    if (!items.length) slowFrom = Infinity;   // 都播完了就把慢放窗口收掉（⛔ 别让它跨局赖着）
    return evs;
  }

  /** 当前所有在跑的动画的 pose（数组，可能为空）。⛔ 只读，别改返回的对象。
   *  ⚠ 里面**混着两种 kind**：调用方按 `p.kind` 分流（main 就是这么把 drop 与 win 拆开的）。 */
  function pose() {
    const out = [];
    for (const it of items) out.push(it.kind === 'win' ? poseWinOf(it) : poseOf(it));
    return out;
  }
  /** ⭐ 赢局庆祝的 pose，没有就 null（render 那侧用它拿 dim / prog / lit）。 */
  function poseWin() {
    for (const it of items) if (it.kind === 'win') return poseWinOf(it);
    return null;
  }
  /** ⭐ 这次庆祝一共多久（raw ms）；没有庆祝在跑时是 0。
   *  main 用它算结算节奏的**上界**（⛔ 别在 main 里写死一个数：那样调长庆祝门禁就抓不住了）。 */
  function winTotal() {
    for (const it of items) if (it.kind === 'win') return it.total;
    return 0;
  }
  /** 某一格是否正在飞（render 用它跳过静态那一枚，免得同一子画两遍）。 */
  function poseAt(c, r) {
    for (const it of items) if (it.kind === 'drop' && it.c === c && it.r === r) return poseOf(it);
    return null;
  }

  /**
   * ⭐ 曲线本身的**纯采样**（不碰状态机）：给一组 params 与时刻 t，直接算 pose。
   * 存在的理由：`step()` 播完就把 item 摘掉（done ⇒ rAF 停），⇒ `t === total` 那一帧
   * 用 pose() **取不到**。而「落点恰好停在目标格 / 收尾时 sx,sy 精确回 1」正是要在那一点断言。
   * ⛔ 它与 poseOf 共用同一段闭式解，不是另写一份（另写一份 = 测的不是跑的那个）。
   */
  function sample(params, t) {
    const q = params || {};
    if (!num(q.r) || q.r < 0 || q.r >= H) return null;
    const fall = num(q.fall) ? q.fall : fallForRow(q.r);
    if (!(fall > 0)) return null;
    return poseOf({ id: 0, kind: 'drop', c: num(q.c) ? q.c : 0, r: q.r,
                    player: q.player === 1 ? 1 : 0,
                    t: num(t) && t > 0 ? t : 0, plan: planDrop(fall) });
  }

  function done() { return items.length === 0; }
  function active() { return items.length; }
  /** ⛔ 撤销 / 换局 / 回菜单必须调：不然一枚已经不在盘上的棋子还在飞（画面上凭空多一子）。
   *  ⚠ 慢放窗口一起清 —— 撤销掉一局赢局之后新的一手要按**正常速度**落。 */
  function reset() { items = []; clock = 0; slowFrom = Infinity; }

  const API = {
    start, step, pose, poseWin, poseAt, sample, done, active, reset, winTotal,
    planDrop, dropDuration, fallForRow,
    // 慢放时钟（导出给 tests/test-fx.js 直接量 Φ 与 Φ⁻¹ 对不对）
    slowScale, warpInt, warpInv,
    // 常数导出给测试与 render 对表（⛔ 别在别处再抄一份数字）
    G_ACC, REST, HOPS, BAND, FALL_MIN, STRETCH, SQUASH, MAX_ACTIVE, H,
    WIN_DRAW, WIN_LIT, WIN_HOLD, WIN_DIM_IN, DIM_MAX, WIN_LEAD_MIN, WIN_LEAD_MAX,
    SLOW_MIN, SLOW_HOLD, SLOW_RAMP
  };
  // 与 P1 六个模块同样冻结：挡住 `C4Fx.step = () => {}` 这类「不报错、只是不动了」的误用。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Fx = API;
})(typeof self !== 'undefined' ? self : this);
