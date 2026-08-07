// ════════════════════════════════════════
// engine-client.js —— 求解器 Worker 的**主线程门面**（P2a Task 4，DESIGN §2.4 / §9.2）。
//
// 它只做四件事，每一件都是为了同一个目的：**让「求解器没在跑」这件事在 UI 上看得见**。
//   ① 起 Worker（包 try/catch —— file:// 或 CSP 下 `new Worker` 本身就会抛）
//   ② ⭐ 启动即 ping，PING_TIMEOUT 内没回 ⇒ `state='dead'`（不是「慢」，是「死了」）
//   ③ 请求带 id，**只认最新一次**（玩家连点时旧结果必须丢弃，否则会拿上一手的答案画这一手）
//   ④ 开局库懒加载 —— 首屏不等它，未就位时调用方能查到状态
//
// ⛔⛔ **绝不谎报真值**（DESIGN §2.4）：Worker 死了的时候，`ai()/scores()` 一律 **reject**，
//   ⛔ 不许返回一个「看起来合理」的列号或分数。调用方必须 catch 并**如实改措辞**
//   （「本机算力不足，这局不显示精确评分」之类），而不是让玩家以为他看到的是数学真值。
//   ⇒ 这就是 solitaire 那条教训的 connect4 版本：降级必须**可见**，否则产品的全部卖点
//     已经悄悄不在了，而没有一处报错。
//
// ⚠ 本文件**不 import 任何求解器模块**（bitboard/solver/ai/book 全在 Worker 里）——
//   主线程一行搜索代码都不该有，否则总有一天会有人图省事在主线程上直接算，页面就冻住了。
//   ⇒ 也因此它不进 tests/test-browser-globals.js 的 LOAD_ORDER（它没有跨模块引用要验）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // ⚠ 相对 **index.html**（Worker 的 URL 按文档 base 解析），不是相对本文件。
  // ⚠ 与 index.html 的 ?v= 保持一致：钉死在 ?v=1 的话，求解器改了之后老玩家
//   会拿到**旧 worker + 新主线程**（2026-08-07 抓到）。改 js 时这里要跟着 bump。
const WORKER_URL = 'js/solver.worker.js?v=16';

  // ⭐ 启动探针的超时。3s 是「够慢的手机把 3.6 MB 之外的六个脚本解析完」与
  //   「玩家还没开始怀疑页面坏了」之间的取值；⚠ 它**只管启动**，
  //   ⛔ 绝不能拿来卡后续请求：n=10..15 的 scoreAll 合法地要 1.7-4 秒，
  //     拿 3s 去掐它会把**正常工作的求解器**报成 dead —— 那是比不报更糟的谎。
  const PING_TIMEOUT = 3000;

  // ⭐ book.js 的状态字符串闭集（DESIGN §11b「P2 开工前先做掉的」第 1 条的**本地防线**）。
  //   跨模块比字符串是全仓唯一没有单一来源的活口：UI 写成 `=== 'load'` 会**静默恒假**，
  //   在库没就位时放行 n≤9 的 scoreAll —— 那是几十分钟，且零报错。
  //   ⇒ 这里把值域钉死：收到集合外的状态就当**没有库**（fail-closed）并记错误，绝不静默放行。
  const BOOK_STATES = ['none', 'loading', 'ready', 'failed'];

  let worker = null;
  let seq = 0;
  const pending = new Map();          // id → { op, resolve, reject }
  const latest = Object.create(null); // op → 最新一次的 id（只认它）
  const listeners = [];

  const st = {
    // idle（还没 start）| starting（ping 在飞）| alive | dead
    worker: 'idle',
    error: '',
    probe: '',            // ping 自检回来的指纹（Worker 里真调过六个依赖的证据）
    pingMs: 0,
    book: 'none',         // book.js 的状态字符串（值域 = BOOK_STATES）
    bookPly: 0,
    bookCount: 0,
    bookError: ''
  };

  function notify() { for (const fn of listeners) { try { fn(state()); } catch (e) { /* 监听者的错不许弄死引擎 */ } } }
  function state() {
    return { worker: st.worker, error: st.error, probe: st.probe, pingMs: st.pingMs,
             book: st.book, bookPly: st.bookPly, bookCount: st.bookCount, bookError: st.bookError };
  }
  function alive() { return st.worker === 'alive'; }
  /** ⭐ UI 判「这一手能不能问求解器」的唯一入口（⛔ 别在别处再写一次 `=== 'ready'`）。 */
  function bookReady() { return st.book === 'ready'; }

  function deadError(why) {
    const e = new Error('求解器不可用：' + why);
    e.dead = true;
    return e;
  }

  /** 记 dead 并把所有在飞的请求**如实拒掉**。⛔ 不许在这里编返回值。 */
  function die(why) {
    if (st.worker === 'dead') return;
    st.worker = 'dead';
    st.error = String(why || '');
    if (typeof console !== 'undefined') console.error('[engine-client] Worker 已判定为不可用：' + st.error);
    const err = deadError(st.error);
    for (const [, p] of pending) p.reject(err);
    pending.clear();
    notify();
  }

  /**
   * 起 Worker 并发出启动探针。幂等（已 start 过就直接返回同一个 promise）。
   * @param opts.url 覆盖 Worker 路径（⚠ 只给门禁用：它要起「故意漏一个依赖」的变体来
   *        确认探针当场报 dead —— 那条断言若没有真的失败过，就只是一行没验过的注释）
   * @returns Promise<boolean> —— true = 探针回来了且自检通过；false = dead（**不 reject**，
   *        因为「Worker 起不来」是一条正常的产品路径，不是异常）
   */
  let started = null;
  function start(opts) {
    if (started) return started;
    const url = (opts && opts.url) || WORKER_URL;
    st.worker = 'starting';
    notify();

    started = new Promise(function (resolve) {
      try {
        worker = new Worker(url);
      } catch (e) {
        // file:// 直开、CSP 拦截、路径打错 —— 全走这里
        worker = null;
        die('new Worker 失败：' + String((e && e.message) || e));
        resolve(false);
        return;
      }

      worker.onmessage = function (e) { onMessage(e.data); };
      // ⭐ Worker 顶层抛错（比如 importScripts 少了一个、或 404）走这里。
      //   ⚠ 它可能在 ping 超时之前就到 —— 两条路都必须记 dead，别只留一条。
      worker.onerror = function (e) {
        die('Worker 报错：' + ((e && e.message) || 'onerror') + (e && e.filename ? ' @' + e.filename + ':' + e.lineno : ''));
        resolve(false);
      };
      worker.onmessageerror = function () { die('Worker 消息无法反序列化'); resolve(false); };

      let done = false;
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        // ⚠ 「没回」和「回了但自检没过」都是 dead，措辞分开只是为了排查。
        die('启动探针 ' + PING_TIMEOUT + ' ms 无响应');
        resolve(false);
      }, PING_TIMEOUT);

      send('ping', {}).then(function (r) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        st.worker = 'alive';
        st.probe = r.probe || '';
        st.pingMs = r.ms || 0;
        setBookState(r.book);
        notify();
        resolve(true);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // send 的 reject 分两种：worker 已 dead（die 里拒的）/ Worker 自检抛错
        if (st.worker !== 'dead') die('启动探针自检失败：' + String((e && e.message) || e));
        resolve(false);
      });
    });
    return started;
  }

  /** 关掉（页面切走 / 门禁跑下一个场景）。之后可以再 start()。 */
  function dispose() {
    if (worker) { try { worker.terminate(); } catch (e) { /* 已经死了 */ } }
    worker = null; started = null;
    for (const [, p] of pending) p.reject(deadError('已 dispose'));
    pending.clear();
    for (const k in latest) delete latest[k];
    st.worker = 'idle'; st.error = ''; st.probe = ''; st.pingMs = 0;
    st.book = 'none'; st.bookPly = 0; st.bookCount = 0; st.bookError = '';
    notify();
  }

  function setBookState(s) {
    if (BOOK_STATES.indexOf(s) < 0) {
      // ⛔ 不认识的状态字符串 = book.js 改过而这里没跟上 ⇒ fail-closed 当没有库，并留下痕迹。
      st.book = 'failed';
      st.bookError = 'book.js 返回了未知状态「' + String(s) + '」（engine-client 的值域没跟上）';
      if (typeof console !== 'undefined') console.error('[engine-client] ' + st.bookError);
      return;
    }
    st.book = s;
  }

  /**
   * 发一条请求。⭐ **同一个 op 只认最新一次**：玩家连点撤销/换档时，旧的那次即便算完了
   * 也必须丢弃（它算的是上一个局面，画到这一手上就是**错的答案**，而且看起来毫无破绽）。
   * ⚠ 被顶掉的旧请求 resolve 成 `{ stale: true }`（不是 reject）—— 它不是错误，
   *   调用方看到 stale 就什么都别做，等新的那次。
   */
  function send(op, payload) {
    if (st.worker === 'dead') return Promise.reject(deadError(st.error || '已判定不可用'));
    if (!worker) return Promise.reject(deadError('还没 start()'));
    const id = ++seq;
    const prev = latest[op];
    latest[op] = id;
    if (prev !== undefined && pending.has(prev)) {
      const p = pending.get(prev);
      pending.delete(prev);
      p.resolve({ stale: true });
    }
    const msg = { id: id, op: op };
    for (const k in payload) msg[k] = payload[k];
    return new Promise(function (resolve, reject) {
      pending.set(id, { op: op, resolve: resolve, reject: reject });
      worker.postMessage(msg);
    });
  }

  function onMessage(d) {
    const p = d && pending.get(d.id);
    if (!p) return;                       // 已被顶掉的旧结果 ⇒ 丢弃（这正是「只认最新一次」）
    pending.delete(d.id);
    if (d.ok) p.resolve(d);
    else p.reject(new Error(d.error || 'Worker 返回了 ok:false'));
  }

  // ─────────── 对外的三个业务入口 ───────────

  /**
   * ⭐ 懒加载开局库。首屏**别 await 它**（DESIGN §9.2：让玩家先落子，库到位后自然变快）。
   * @returns Promise<state()> —— 永不 reject（Worker 死了也只是 book 停在 'none'）
   * ⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调 scores()/求解器档 ai()：那是**几十分钟**
   *   （DESIGN §9.2 的断崖，n=9 无库实测 3,992 ms、更浅的更久）。判据用 bookReady()。
   */
  function ensureBook() {
    if (!alive()) return Promise.resolve(state());
    if (st.book === 'ready') return Promise.resolve(state());   // 已装好就别再把状态推回 loading
    st.book = 'loading';
    notify();
    return send('book', {}).then(function (r) {
      if (r.stale) return state();
      setBookState(r.state);
      st.bookPly = r.ply || 0;
      st.bookCount = r.count || 0;
      st.bookError = r.error || st.bookError;
      notify();
      return state();
    }, function (e) {
      setBookState('failed');
      st.bookError = String((e && e.message) || e);
      notify();
      return state();
    });
  }

  /**
   * AI 落子。@returns Promise<{col, reason, usedSolver, n, ms} | {stale:true}>
   * ⛔ Worker 不可用时 **reject**（`err.dead === true`）—— 调用方必须自己决定降级怎么说，
   *   本文件不替它编一个列号。
   * ⚠ 轻松档（1-5 级）根本不调求解器、必须仍然秒出（DESIGN §11b 第 3 条）：
   *   UI 别拿共用的「思考中」把它们也拖慢，判据是 ConnectAI.usesSolver —— 但那在 Worker 里，
   *   主线程侧用返回的 `usedSolver` 事后校正，或直接按档位判（1-5 不转菊花）。
   */
  function ai(moves, tier, seed) { return send('ai', { moves: moves, tier: tier, seed: seed }); }

  /** 每列精确分。@returns Promise<{scores, terminal, n, ms} | {stale:true}>，同样 reject on dead。 */
  function scores(moves) { return send('scores', { moves: moves }); }

  function onChange(fn) { listeners.push(fn); }

  const API = {
    PING_TIMEOUT: PING_TIMEOUT, BOOK_STATES: BOOK_STATES,
    start: start, dispose: dispose, ready: function () { return started || Promise.resolve(false); },
    state: state, alive: alive, bookReady: bookReady, onChange: onChange,
    ensureBook: ensureBook, ai: ai, scores: scores
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EngineClient = API;
})(typeof self !== 'undefined' ? self : this);
