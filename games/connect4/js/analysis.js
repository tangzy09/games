// ════════════════════════════════════════
// analysis.js —— **边打边算**的调度与缓存（P3 Task 2 · DESIGN §9.2 的两段实测）。
//
// 它只做一件事：**每落一手就在 Worker 空闲时算那一手的真值**，把整局复盘的
// 0.36-3.30 s 摊进玩家想棋 / AI 思考 / 落子动画的自然间隙里
// ⇒ 终局时复盘几乎瞬开，而**总计算量一位不变**。
// ⛔ 它不判分（那是 review.js）、不画一个像素（那是 render.js）、不认识棋规
//    （它只把 moves 数组转给 Worker）。三件事拆开是故意的。
//
// ════════ ⭐⭐ 判断①：排队必须在**这一层**做，⛔ 不许甩给 EngineClient ════════
//   `engine-client.js` 的 send 是「**同一个 op 只认最新一次**」——那条设计是为了
//   「玩家连点时旧结果必须丢弃」，对 AI 落子完全正确。
//   ⚠ 但复盘会对同一个 op（`scores`）连发几十次 ⇒ 并发发出去的话，**前面的会被自己顶掉**
//     （resolve 成 `{stale:true}`），表现是「算了半天缓存里还是空的」，**零报错**。
//   ⇒ 本模块一次只放一个在飞（`inflight` 那个布尔），其余排队。
//   ⚠ 这条由 test-analysis §① 用「并发峰值必须 === 1」钉死。
//
// ════════ ⭐⭐ 判断②：缓存按**局面**存，⛔ 不按「第几手」════════
//   key = 让子前缀 + moves 前缀。⇒ **撤销白送**：撤回去再走回来，前缀局面原样命中，
//   一次都不用重算。⛔ 按 ply 号存的话，撤销之后整条线全部作废重算（而且没人看得出来，
//   只是「怎么又在转」）。
//
// ════════ ⭐ 判断③：让子局整个关掉，但**两条理由完全不同**（⛔ 别混成一条）════════
//   · **让 2 子**：性能上就不可能 —— 库 100% 落空（子数不平衡），实测整局复盘 **173.5 s**、
//     其中单个局面 **101 s**（手机再乘 3-5 倍）。
//   · **让 1 子**：⭐ 性能完全没问题（**1.19 s**，与正常局无异），卡住它的是**协议**——
//     `solver.worker.js` 的 `scores` op 走 `Bitboard.fromMoves(m.moves)`，即从空盘重放，
//     ⛔ 表达不了预置子；而 Worker 只 importScripts 了 bitboard/rules/solver/book/ai，
//     **没有 state.js** ⇒ 要支持就得改 P1 的 bitboard.js（连带门禁）或在 worker 里留
//     第二份摆子逻辑（本仓明确反对）。而让子只对「同机双人 + 轻松档」开放（§6.7），
//     同机双人局的个人精准度本来就意义不大 ⇒ **收益撑不起成本，留到 P5**。
//   ⇒ 判据只有 `enabled()/disabledReason()` 一份，UI 与本模块读同一个（照 timedAllowed 的先例）。
//
// ════════ ⭐⭐ 判断④：开局库没就位之前，**一个请求都不许发** ════════
//   `engine-client.js:209` 的原话：「⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调 scores()：
//     那是**几十分钟**（n=9 无库实测 3,992 ms，更浅的更久）。判据用 bookReady()。」
//   ⚠⚠ 而本模块**恰恰是从 n=0 的前缀开始排队的** —— 这条闸不写，边打边算会在开局那几秒里
//     （3.6 MB 的库还在下）把 Worker **焊死几十分钟**，而画面上只是「复盘一直在转」，零报错。
//   ⇒ `bookOk()` 挡在 pump 里；库到位后由 `kick()` 把积压的接着算完。
//   ⚠ 这**不是「停用」**：停用是「这一局不给算」（让子/求解器死了），⛔ 别混成一件事。
//
// ⛔ **零阻塞**：这条流水线永远不许让任何一次点击等它。没算完 = 复盘页显示进度，
//    ⛔ 不是禁用按钮、⛔ 也不是空白页。
// ⛔ **主线程一行搜索都不许有**（main.js 抬头那条纪律）：本模块只发消息给 Worker，
//    `Solver.` / `ConnectAI.` 在代码里一次都不出现（test-analysis §⑨ 源码级钉死）。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  let client = null;          // 注入的 EngineClient（门禁塞假的进来）
  const cache = new Map();    // key → scoreAll 结果
  const queue = [];           // 待算的 { key, moves, priority }
  let inflight = false;       // ⭐ 一次只放一个（见判断①）
  let want = new Set();       // 这一局「应该算」的全部 key ⇒ progress().total
  let off = '';               // 非空 = 停用，内容是**原因码**（⛔ 不是给玩家看的句子，见 disable 上方）
  let curPre = [];            // 这一局的让子前缀（进 key，见判断②）
  let stale = 0;              // ⭐ 连续被顶掉几次（见 pump 里那段 ⛔⛔）
  let epoch = 0;              // ⭐ 换了几局（在飞的请求靠它作废，见 reset）
  /** 连续 stale 的上限。⚠ 超了就丢掉这一条 —— 它是后台预算，⛔ 不值得把主线程转死。 */
  const STALE_MAX = 8;

  /** ⭐⭐ 让出一拍再泵（**宏任务**）。⛔ 别在 `then` 里同步递归 pump：
   *  那是一条 microtask 链，**优先于宏任务** ⇒ 会把浏览器的输入事件饿死
   *  （页面还能截图、evaluate 也答得动，但鼠标点不动了，零报错）。 */
  function pumpSoon() {
    if (typeof setTimeout === 'function') setTimeout(pump, 0); else pump();
  }

  /** ⭐ 缓存 key：让子前缀 + moves 前缀。⛔ 别用「第几手」当 key（撤销就全废了）。 */
  function keyOf(moves, pre) {
    return (pre && pre.length ? pre.join('.') : '') + '|' + (moves ? moves.join(',') : '');
  }

  function enabled() { return !off && !!client; }
  function disabledReason() { return off; }

  // ⭐⭐ 停用**原因码**（⛔ 不是给玩家看的句子）。
  //   ⚠ 本文件是纯模块、拿不到 `T()` ⇒ 在这里写死一句中文/英文就是**硬编码文案**，
  //     本仓铁律明令禁止（截图实测：英文界面上弹出一句中文，2026-08-06）。
  //   ⇒ 这里只返回码，翻译在 UI 层（main.js 的 `reviewBlocked`）。
  const OFF_HANDICAP = 'handicap';   // 这一局有让子
  const OFF_ENGINE = 'engine';       // 求解器不可用

  /** 停用并记下**原因码**。⚠ 第一条原因优先（后面的失败别覆盖掉真正的病因）。 */
  function disable(why) { if (!off) off = String(why || OFF_ENGINE); }

  function reset() {
    cache.clear();
    queue.length = 0;
    want = new Set();
    inflight = false;
    off = '';
    curPre = [];
    stale = 0;
    // ⭐ 换局：在飞的那一条回来时会看到 epoch 变了 ⇒ 自己作废
    //   （⛔ 否则上一局的答案会被写进这一局的缓存，而两局的 moves 前缀经常一模一样 ⇒
    //     盘面完全正确、评分却是别的局的，零报错）
    epoch++;
  }

  function attach(c) { client = c; }

  /**
   * 这一局开始。⚠ 让子局在这里就整个关掉（见判断③）。
   * @param g C4State 的对局对象（只读 `pre`）
   */
  function start(g) {
    reset();
    curPre = (g && g.pre) ? g.pre.slice() : [];
    // ⚠ 两条**不同的**理由，但对玩家是同一句话 ⇒ 同一个原因码：
    //   · 让 2 子：性能上就不可能（库 100% 落空，实测整局 173.5 s、单个局面 101 s）；
    //   · 让 1 子：协议表达不了（worker 的 scores 从空盘重放，没有预置子这一说）。
    if (curPre.length >= 1) disable(OFF_HANDICAP);
  }

  /** 已经算好的真值（null = 还没算 / 不给算）。⛔ 别把 null 当成 0。 */
  function get(moves) {
    const v = cache.get(keyOf(moves, curPre));
    return v === undefined ? null : v;
  }

  /** { done, total }。⭐ done 单调不减、⛔ 永不超过 total（撤销会让 total 变小）。 */
  function progress() {
    let done = 0;
    for (const k of want) if (cache.has(k)) done++;
    return { done: done, total: want.size };
  }

  /**
   * 排一个局面进队。
   * @param opts.priority true ⇒ **插到队首**（提示按下去的那一次走这条：
   *        玩家主动按下的等待可接受，⛔ 但不能排在几十个后台请求后面）
   */
  function request(moves, opts) {
    if (!enabled()) return;
    const key = keyOf(moves, curPre);
    want.add(key);
    if (cache.has(key)) return;
    const at = queue.findIndex(e => e.key === key);
    if (at >= 0) {
      if (!(opts && opts.priority)) return;
      queue.splice(at, 1);                       // 已在队里但现在急了 ⇒ 拎到队首
    }
    const item = { key: key, moves: moves.slice() };
    if (opts && opts.priority) queue.unshift(item); else queue.push(item);
    pump();
  }

  /**
   * ⭐ 落了一手之后调它：把**这一局到目前为止的每一个前缀局面**排进队。
   * ⚠ 已经算过的会在 request 里被缓存挡掉 ⇒ 每手实际只新增一个。
   * ⛔ 别放进 renderAll()（它每帧都跑；有副作用的东西放进去会递归 —— P2c-T5 实锤）。
   */
  function onMove(g) {
    if (!enabled() || !g || !g.moves) return;
    for (let k = 0; k <= g.moves.length; k++) {
      // ⚠ k 取到 length：**当前**这个局面（还没落子的那个）也要算 —— 提示和妙手判定要它
      request(g.moves.slice(0, k));
    }
  }

  /**
   * ⭐⭐ 开局库到位了吗。**这是本模块最要命的一道闸**（判断④）。
   * engine-client.js:209 的原话：「⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调 scores()：
   *   那是**几十分钟**（n=9 无库实测 3,992 ms，更浅的更久）。判据用 bookReady()。」
   * ⚠⚠ 而本模块**恰恰是从 n=0 的前缀开始排队的** ⇒ 少了这道闸，边打边算会在开局那几秒里
   *   把 Worker 焊死几十分钟，而画面上只是「复盘一直在转」，**零报错**。
   * ⛔ fail-closed（拿不准就当没就位，照 engine-client 对 BOOK_STATES 的处理）：
   *   ⚠ 但这**不是「停用」** —— 库到位后 kick() 会把积压的接着算完。
   */
  function bookOk() {
    return !!(client && typeof client.bookReady === 'function' && client.bookReady());
  }

  /** ⭐ 外部条件可能变了（库刚装好 / Worker 刚活过来）⇒ 再泵一次。⛔ 别让积压的请求永远躺着。 */
  function kick() { pump(); }

  /** 队列泵。⭐ 一次只放一个在飞（判断①）。 */
  function pump() {
    if (inflight || !enabled() || !queue.length) return;
    // ⭐⭐ 库没就位就**什么都不做**（⛔ 不是 disable：等它到位，见 bookOk 那段）
    if (!bookOk()) return;
    const item = queue.shift();
    if (cache.has(item.key)) { pump(); return; }
    inflight = true;
    const ep = epoch;                             // ⭐ 这一条属于哪一局（reset 会 +1）
    let p;
    try {
      p = client.scores(item.moves);
    } catch (e) {
      // 同步就抛（client 形状不对）⇒ 如实停用，⛔ 别静默吞掉
      inflight = false;
      // ⚠ 只记**码**（⛔ 别把异常消息当成给玩家看的句子：那是英文/中文混杂的技术串）
      disable(OFF_ENGINE);
      if (typeof console !== 'undefined' && console.warn) console.warn('[analysis] scores 同步抛错：' + String((e && e.message) || e));
      return;
    }
    p.then(function (r) {
      inflight = false;
      // ⚠ 被顶掉的旧请求 resolve 成 { stale:true }（engine-client 的约定）——
      //   它不是错误，重新排一次即可。
      if (r && r.stale) {
        // ⭐⭐ 被顶掉的旧请求（engine-client 的约定：同 op 只认最新一次）。
        // ⛔⛔ **绝不许无脑重排**：`then` 里同步 unshift + pump 会形成一条**microtask 链**，
        //   而 microtask **优先于宏任务** ⇒ 它把浏览器的**输入事件饿死** ——
        //   表现是「页面还能截图、evaluate 也答得动，但鼠标点不动了」，**零报错**。
        //   （2026-08-06 实锤：e2e-p2b-t7 在结算屏点［再来一局］卡死 3 分钟，就是这条。）
        // ⇒ ① 重排次数封顶；② 用宏任务（setTimeout 0）让出一拍，别在 microtask 里接着转。
        stale++;
        if (stale > STALE_MAX) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[analysis] 连续 ' + stale + ' 次 stale，放弃这一条（⛔ 别转成忙循环）');
          }
          pumpSoon();
          return;
        }
        queue.unshift(item);
        pumpSoon();
        return;
      }
      stale = 0;
      // ⭐ 换局了 ⇒ 这一条是**上一局**的答案，⛔ 别写进新一局的缓存、也别接着泵它的队列
      if (ep !== epoch) return;
      if (r && r.scores) cache.set(item.key, r.scores);
      else if (r && r.terminal !== null && r.terminal !== undefined) cache.set(item.key, {});
      // ⚠ 同上：让出一拍（宏任务）再泵，⛔ 别在 then 里同步递归（microtask 会饿死输入事件）
      pumpSoon();
    }, function (e) {
      // ⛔ 绝不吞掉 reject：吞掉的表现是「进度条停在 60% 再也不动」，零报错（§2.4）
      inflight = false;
      disable(OFF_ENGINE);
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[analysis] 求解器请求失败：' + String((e && e.message) || e));
      }
    });
  }

  const API = {
    attach, start, reset, onMove, request, get, progress, enabled, disabledReason, keyOf, kick
  };
  // 与其余模块同样冻结：挡住 `C4Analysis.get = () => ({})` 这类「复盘永远空着但页面正常」的误用。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Analysis = API;
})(typeof self !== 'undefined' ? self : this);
