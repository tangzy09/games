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
// ⚠ T6（§6.8 减弱动态）将来要门控的**就是本文件的全部 `start()` 调用**：
//   reduceMotion 打开时 main 直接不调 start()，改为立刻走落定回调（音 + 震动 + 静态帧）。
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

  /** 这一次下落要多久（ms）—— 给测试与将来的结算节奏（T3）问预算用。 */
  function dropDuration(fall) { return planDrop(fall).total; }

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

  // ════════ ③ 状态机 ════════
  let items = [];
  let seq = 0;

  const num = v => typeof v === 'number' && isFinite(v);

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
    items = items.filter(it => !(it.c === q.c && it.r === q.r));
    if (items.length >= MAX_ACTIVE) items.shift();
    const it = { id: ++seq, kind: 'drop', c: q.c, r: q.r,
                 player: q.player === 1 ? 1 : 0, t: 0, plan: plan, landed: false };
    items.push(it);
    return it.id;
  }

  /**
   * 推进 dtMs 毫秒。**唯一的可变操作**，且只做一件事：`t += dt`（再夹到 total）。
   * @returns 事件数组，目前只有一种：
   *   { type:'land', c, r, player, id } —— 自由落体结束、**砸到底的那一瞬间**
   *     （⭐ 落定音 land{r} + 震动挂这里，不是挂动画播完 —— 弹跳的余韵之后才响就是「音画不同步」）
   * ⭐ 事件对 dt 的切分同样免疫：无论 137 ms 切成几段，'land' 恰好发**一次**。
   * ⚠ 负 dt / NaN dt 一律当 0（切后台回来时 ts 有可能倒退）。
   */
  function step(dtMs) {
    const dt = num(dtMs) && dtMs > 0 ? dtMs : 0;
    const evs = [];
    if (!items.length) return evs;
    const keep = [];
    for (const it of items) {
      it.t = Math.min(it.t + dt, it.plan.total);
      if (!it.landed && it.t >= it.plan.tf) {
        it.landed = true;
        evs.push({ type: 'land', c: it.c, r: it.r, player: it.player, id: it.id });
      }
      if (it.t < it.plan.total) keep.push(it);
    }
    items = keep;                 // ⭐ 播完就摘掉 ⇒ done() 为真 ⇒ main 的 rAF 停下来（别空转烧电）
    return evs;
  }

  /** 当前所有在飞棋子的 pose（数组，可能为空）。⛔ 只读，别改返回的对象。 */
  function pose() {
    const out = [];
    for (const it of items) out.push(poseOf(it));
    return out;
  }
  /** 某一格是否正在飞（render 用它跳过静态那一枚，免得同一子画两遍）。 */
  function poseAt(c, r) {
    for (const it of items) if (it.c === c && it.r === r) return poseOf(it);
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
  /** ⛔ 撤销 / 换局 / 回菜单必须调：不然一枚已经不在盘上的棋子还在飞（画面上凭空多一子）。 */
  function reset() { items = []; }

  const API = {
    start, step, pose, poseAt, sample, done, active, reset,
    planDrop, dropDuration, fallForRow,
    // 常数导出给测试与 render 对表（⛔ 别在别处再抄一份数字）
    G_ACC, REST, HOPS, BAND, FALL_MIN, STRETCH, SQUASH, MAX_ACTIVE, H
  };
  // 与 P1 六个模块同样冻结：挡住 `C4Fx.step = () => {}` 这类「不报错、只是不动了」的误用。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Fx = API;
})(typeof self !== 'undefined' ? self : this);
