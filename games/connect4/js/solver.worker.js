// ════════════════════════════════════════
// solver.worker.js —— 把完美求解器搬进 Web Worker（DESIGN §9.2 断崖 / §2.4 降级纪律，P2a Task 4）。
//
// ⚠ **为什么必须在 Worker 里**：`n = 10..15` 的 `scoreAll` 中位 1,678 ms、尾部 3,952 ms，
//   而这一段**每局必经**（一局 20-40 手）。跑在主线程 = 整个页面冻住几秒，
//   连「思考中」的转菊花都转不动（主线程被占死，连动画帧都不发）。
//
// ⛔⛔ **本文件的第一纪律：Worker 挂了必须表现成「挂了」，不许表现成「有点慢」。**
//   solitaire 实锤（prover.worker.js:21 上方）：漏了一个 importScripts ⇒ Worker 一 new 就抛 ⇒
//   `onerror` 把结果兜成 unknown ⇒ 看起来像「算不出来」，其实是证明器**从没跑起来过**。
//   connect4 的版本更毒：Worker 死了 ⇒ 提示/AI 走降级 ⇒ 玩家只觉得「有点慢」，
//   而产品的全部卖点（数学真值）已经悄悄不在了，**没有一处报错**。
//   ⇒ 所以 `ping` **不是回一个 pong 就算数**，见下面 selfTest()。
// ════════════════════════════════════════
'use strict';

// ⚠ 顺序 = 依赖顺序。路径相对**本文件自身**（worker 的 base URL 是它自己的脚本 URL），
//   不是相对 index.html —— 所以是 `bitboard.js` 而不是 `js/bitboard.js`。
// ⭐ **prng.js 必须排在最前**：engine/prng.js 顶层写的是 `const PRNG = {...}`，那是**全局词法
//   绑定、不是 self 的属性**（`self.PRNG === undefined`，见 tests/test-browser-globals.js），
//   ai.js 取的是**裸标识符 PRNG** ⇒ 它必须在 ai.js 求值之前就已经绑定好。
//   P1 终审就栽在这条上（浏览器里 AI 100% 崩，而 node 侧 14 条门禁全绿）。
importScripts(
  '../../../engine/prng.js',
  'bitboard.js',
  'rules-classic.js',
  'solver.js',
  'book.js',
  'ai.js'
);

// ⭐ 跨手保留置换表（DESIGN §9.2 的结构性缓解）：同一局的连续局面都在同一棵子树里，
//   重叠极大（离线那条 setKeepTable 实测 5.08× 节点就是同一个原理）。
// ⛔ 但它使 `nodes` 不再「只由局面决定」⇒ **门禁与基准一律关着跑**，这一行只许出现在产品侧。
//   （复用是**无损**的：表里存的是「这个局面的真分数 ≥/≤/= v」这种与窗口、与调用者无关的
//    绝对事实，换个局面来查照样成立 —— 答案一位都不会变，只是更快。）
Solver.setKeepTable(true);

// 开局库：懒加载，首屏不等它（DESIGN §9.2）。路径同样相对本文件。
const BOOK_URL = '../data/book-classic.bin';

// ─────────── ⭐ 活性自检：这才是「Worker 真的活着」的判据 ───────────
// ⛔ 只回 pong 是**不够的**。六个依赖各漏一次的实测（tests/e2e-worker.cjs ⑦，逐条跑过）：
//   · 漏 prng / bitboard / rules-classic / solver ⇒ **加载期就炸**（ai.js:95 取裸 PRNG、
//     solver.js:62 顶层读 B.CELLS、solver.js:68 读 R.ORDER、本文件顶层 Solver.setKeepTable）
//     ⇒ 走 onerror，主线程一定看得见。
//   · ⭐⭐ 漏 **book.js / ai.js** ⇒ **一声不吭**：Worker 起得来、消息也通、
//     `postMessage({op:'ping'})` 照样有回音（实测 onerror 恒 null）。少了 book.js 的后果是
//     「每个 n≤9 的请求要几十分钟」——**正是「有点慢」这层伪装**。
//   ⇒ 所以自检必须是**真调用**，且横跨 prng / bitboard / rules / solver / book / ai 六个。
//     ⛔ 谁要是哪天把它简化回「只回 pong」，漏 book/ai 这两条就重新变成静默的了。
//   预算：整套 ≈ 10 ms（只在 start 时跑一次）。
const PROBE_POS = [2, 3, 5, 1, 6, 3, 0, 0, 2, 4, 6, 2, 0, 2, 5, 5, 2, 0, 5, 2];
const PROBE_SCORE = -5;      // ⭐ 这是**局面自身的事实**（真分数），与库、与窗口、与调用历史无关。
const PROBE_EASY = { moves: [3, 3, 4], tier: 1, seed: 12345, col: 1 };  // 轻松档：不碰求解器，微秒级

/** 跑一遍六个依赖的真调用；任何一处不对就**抛** ⇒ ping 回 ok:false ⇒ 主线程记 dead。 */
function selfTest() {
  const bd = Bitboard.fromMoves(PROBE_POS);          // bitboard
  if (RulesClassic.terminal(bd) !== null) throw new Error('自检夹具竟是终局（夹具坏了）');  // rules
  const r = Solver.solve(bd);                        // solver
  if (r.score !== PROBE_SCORE) {
    throw new Error('自检局面的分数 ' + r.score + ' ≠ 真值 ' + PROBE_SCORE + '（求解器行为已变）');
  }
  const col = ConnectAI.aiMove(PROBE_EASY.moves, PROBE_EASY.tier, PROBE_EASY.seed);  // ai + prng
  if (col !== PROBE_EASY.col) {
    throw new Error('自检的轻松档落子 ' + col + ' ≠ ' + PROBE_EASY.col + '（PRNG 或参数表已变）');
  }
  const bkState = Book.status().state;                // book
  return 'solve=' + r.score + ' ai=' + col + ' book=' + bkState;
}

// ─────────── 开局库（懒加载，同一时刻只许一个 load 在飞）───────────
// ⚠ book.js 的 _state/_fail/_book 是模块级单例，两个并发 load 会互相踩状态 ⇒ 这里 memoize。
//   失败之后清掉 promise，允许调用方稍后重试（换了网络/重进页面都可能成功）。
let bookFlight = null;
function ensureBook() {
  if (!bookFlight) {
    bookFlight = Book.load(BOOK_URL).then(function () {
      const st = Book.status();
      if (st.state !== 'ready') bookFlight = null;    // 失败不缓存，留一条重试的路
      return st;
    });
  }
  return bookFlight;
}

function reply(msg) { self.postMessage(msg); }

// ─────────── 协议：{id, op, ...} → {id, ok, ...} ───────────
// ⛔ 失败一律 `{ok:false, error}`，**绝不编一个看起来合理的返回值**（DESIGN §2.4）——
//   一个编出来的列号会被提示/复盘/精准度当成真值用下去，且无一处报错。
self.onmessage = function (e) {
  const m = (e && e.data) || {};
  const id = m.id;
  const t0 = Date.now();
  try {
    switch (m.op) {
      // ⭐ 活性探针。主线程 start 之后立刻发一条，超时没回 ⇒ 记 dead。
      case 'ping': {
        const probe = selfTest();
        reply({ id: id, ok: true, pong: true, book: Book.status().state, probe: probe, ms: Date.now() - t0 });
        break;
      }

      // 懒加载开局库。⚠ 永不 reject：库没到 = 慢，不是错（book.js 第一纪律）。
      case 'book': {
        ensureBook().then(function (st) {
          reply({ id: id, ok: true, state: st.state, ply: st.ply, count: st.count, error: st.error, ms: Date.now() - t0 });
        }, function (err) {
          reply({ id: id, ok: false, error: String((err && err.message) || err) });
        });
        break;
      }

      // AI 落子。⚠ 已终局的局面没有着法 —— decide() 会抛，我们照实转成 ok:false。
      case 'ai': {
        const d = ConnectAI.decide(m.moves, m.tier, m.seed);
        reply({ id: id, ok: true, col: d.col, reason: d.reason, usedSolver: d.usedSolver, n: d.n, ms: Date.now() - t0 });
        break;
      }

      // 每列的精确分（P3 的提示 / 复盘 / 精准度 / 妙手都读它）。
      // ⚠ 终局局面 scoreAll 返回 {} —— 那不是「算不出来」，所以把 terminal 一起带回去，
      //   让调用方分得清「没有分数可言」与「我们没算出来」（§2.4）。
      case 'scores': {
        const bd = Bitboard.fromMoves(m.moves);
        const term = RulesClassic.terminal(bd);
        reply({ id: id, ok: true, scores: Solver.scoreAll(bd), terminal: term, n: bd.n, ms: Date.now() - t0 });
        break;
      }

      default:
        reply({ id: id, ok: false, error: '未知 op：' + String(m.op) });
    }
  } catch (err) {
    reply({ id: id, ok: false, error: String((err && err.message) || err) });
  }
};
