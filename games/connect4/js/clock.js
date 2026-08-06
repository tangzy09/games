// ════════════════════════════════════════
// clock.js —— 限时模式的**表**（P2c Task 5 · DESIGN §6.10）。
//
// §6.10：「每手 10 秒倒计时，超时随机落子（偏中路）。四子棋在时间压力下完全是另一个游戏，
//   紧张感翻倍且一局压到 1 分钟内。⚠ **绝不能是默认** —— 休闲玩家讨厌计时。」
//
// 本文件只做一件事：**累计「这一手到现在为止，玩家真正拥有过的毫秒数」**。
// ⛔ 它不认识棋盘、不认识 G、不落子、不画一个像素 —— 超时落哪一列是 state.js 的 timeoutMove，
//    什么时候该停表是 main.js 的 clockBlock()。三件事拆开是故意的（各自能被单独钉死）。
//
// ════════ ⭐⭐ 判断①：**墙钟，⛔ 不是 C4Fx 的游戏时钟** ════════
//   P2b T3 引入了慢放时钟（赢局庆祝把时间放慢到 0.42×）。拿它当计时源会同时坏三样：
//   1. ⛔⛔ **fx 的 clock 在没有动画时根本不走** —— `C4Fx.step()` 第一行就是
//      `if (!items.length) return evs;`（clock += dt 在它下面）。玩家坐着想棋的那 10 秒里
//      屏幕上一个动画都没有 ⇒ 倒计时**永远停在 10**。这不是理论风险，是当场不能用。
//   2. 慢放是**镜头**不是世界（fx.js ①b 原话）。让「盘上真的落一手」这条**规则**去读表现层，
//      等于动画一坏规则跟着坏 —— 而 fx.js 文件头明写「整个模块删掉，游戏照样能玩完一局」。
//   3. 庆祝的慢放会把玩家的思考时间一起拉长（本 task 验收②点名的那条）。
//   ⇒ 时间源由调用方**注入**（`tick(key, now, blocked)` 的 now）：浏览器里是 performance.now()，
//     node 门禁里是一串写死的数 ⇒ **这个模块在 node 里可以被逐毫秒钉死**。
//
// ════════ ⭐⭐ 判断②：累计「用掉的」，⛔ 不是记「截止时刻」 ════════
//   最自然的写法是 `deadline = now + 10000`，然后每帧比一下。它有一个致命的性质：
//   **停不了表**。而这一条功能有五个必须停表的时刻（AI 在算 / 猜先在演 / 等对方回答悔棋 /
//   切后台 / 引擎在替玩家算提示）。⇒ 存的是 `used`（已用掉多少），停表 = 这一拍不累加。
//   ⚠ 由此白送一件事：**恢复时不用「补偿」**（补偿式实现必然出现「切回来多给了半秒」这类
//     谁都说不清的偏差）。
//
// ⚠ `MAX_STEP_MS`：单次 tick 最多计入 1 秒。切后台由 blocked 挡（⇒ 一毫秒都不算），
//   这条兜的是**主线程被卡住**（大 GC / 同步长任务）时的一跳 —— 那段时间玩家点也点不动，
//   所以夹在玩家这一侧。⛔ 别把它当成「后台节流的补丁」：后台是 blocked 管的，两件事。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  /** ⭐ 每手多少毫秒（DESIGN §6.10 的「10 秒」）。**产品数值**，⛔ 别在别处再抄一个 10000。 */
  const TURN_MS = 10000;
  /** ⭐ 剩多少毫秒起进「告急」态（倒计时条变色 + 数字变大）。⚠ 告急是**双编码**的：
   *  条的长度（形状）与数字都在变，颜色只是第三重冗余（§6.2：靠颜色区分的信息一律形状+颜色）。 */
  const URGENT_MS = 3000;
  /** 单次 tick 最多计入多少（见文件头那段 ⚠）。 */
  const MAX_STEP_MS = 1000;

  // ─── 实例状态（浏览器里就一份；node 门禁靠 forget() 复位）───
  let key = null;      // ⭐ 「这一手」的身份。变了 = 换了一手 ⇒ 表清零重来
  let used = 0;        // 这一手已经用掉的真实毫秒
  let last = 0;        // 上一次 tick 的时刻（与注入的 now 同一时基）
  let fired = false;   // ⭐ 这一手的超时已经报过了吗（⇒ **只报一次**，见 tick）

  function num(v) { return typeof v === 'number' && isFinite(v); }

  /** 这一手从头开始计时。⚠ `last = now` ⇒ 本次 tick 贡献 0 毫秒（换手那一拍不该被算进来）。 */
  function reset(k, now) { key = k; used = 0; last = num(now) ? now : 0; fired = false; }

  /** 没有任何一手在计时（HOME / 结算 / 非限时局 / 轮到 AI）。⛔ 换局/撤销必须调得到它。 */
  function forget() { key = null; used = 0; last = 0; fired = false; }

  function remain() { return Math.max(0, TURN_MS - used); }
  /** 剩余占比 0..1（倒计时条的长度）。 */
  function frac() { const f = remain() / TURN_MS; return f < 0 ? 0 : (f > 1 ? 1 : f); }
  /** 显示用的整秒：10 → … → 1 → 0（⚠ 向上取整：显示 0 的那一刻表就是真的走完了）。 */
  function seconds() { return Math.ceil(remain() / 1000); }
  function urgent() { return remain() <= URGENT_MS; }
  /** 只读快照（⭐ 门禁按它断言「停表期间 used 一毫秒没涨」）。 */
  function state() { return { key: key, used: used, fired: fired, remain: remain() }; }

  /**
   * 推进一拍。
   * @param k       这一手的身份（任意可用 `!==` 比较的值）；**null = 现在没有表在跑** ⇒ forget()
   * @param now     注入的时刻（ms，单调）
   * @param blocked 这一拍要不要停表（AI 在算 / 切后台 / 等回答悔棋 / 猜先在演…）
   * @returns { expired, used, remain }
   *   ⭐ `expired` **只在越线那一拍为 true**（之后恒 false，直到换手）——
   *      ⛔ 写成「remain===0 就为 true」的话，超时那一手落下去之前的每一拍都会再触发一次，
   *        表现是连着落好几子（而每一子看起来都合法）。
   */
  function tick(k, now, blocked) {
    if (k === null || k === undefined) { forget(); return { expired: false, used: 0, remain: TURN_MS }; }
    if (!num(now)) now = last;
    if (k !== key) {
      reset(k, now);
    } else if (blocked) {
      // ⭐ 停表 = **把基准往前挪，但不累加** —— 这一拍与下一拍之间的真实时间就此消失，
      //   ⛔ 不许「记下来回头补」（补偿式实现必然出现说不清的半秒偏差）。
      last = now;
    } else {
      const dt = now - last;
      last = now;
      if (dt > 0) used += (dt > MAX_STEP_MS ? MAX_STEP_MS : dt);
      // ⚠ dt < 0（时钟倒退 / 换了时基）当 0，⛔ 不许把 used 减回去
    }
    let expired = false;
    if (!fired && used >= TURN_MS) { fired = true; expired = true; }
    return { expired: expired, used: used, remain: remain() };
  }

  const API = {
    TURN_MS, URGENT_MS, MAX_STEP_MS,
    tick, reset, forget, remain, frac, seconds, urgent, state
  };
  // 与其余模块同样冻结：挡住 `C4Clock.tick = () => ({expired:false})` 这类
  // 「表看起来还在、只是永远不会超时」的误用（画面正常、零报错，本仓最怕的失败模式）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Clock = API;
})(typeof self !== 'undefined' ? self : this);
