// ════════════════════════════════════════
// e2e-worker.cjs —— 求解器 Worker 的门禁（P2a Task 4）。
//
// ⚠ **必须是真浏览器**：node 里没有 Worker / importScripts / fetch 的浏览器语义，
//   而本 task 的全部风险恰恰长在这三样上（相对路径怎么解析、顶层 const 是不是 self 的属性、
//   少一个 import 会不会静默）。⇒ 照本仓惯例单独挂 script（`npm run test:c4:worker`），
//   ⛔ 不进 `npm test`（它要起浏览器 + 读 3.6 MiB 开局库）。
//
// ⭐⭐ 本文件最重要的一节是 ⑤「故意漏依赖」：
//   solitaire 实锤是漏了 cards.js ⇒ Worker 一 new 就抛 ⇒ onerror 把结果兜成 unknown ⇒
//   **看起来像「算不出来」，其实证明器从没跑起来过**。connect4 的版本更毒：Worker 死了 ⇒
//   提示/AI 走降级 ⇒ 玩家只觉得「有点慢」，而产品的全部卖点（数学真值）已经悄悄不在了。
//   ⇒ 这里**真的**起两个漏依赖的 Worker 变体，确认探针当场报 dead、且 ai() 是 reject
//     而不是「给了个看起来合理的列号」。断言若没有真的失败过，它就只是一行没验过的注释。
//   ⚠ 变体是**服务器现改现发**的（内存里删掉一条 importScripts），⛔ 磁盘上的
//     js/solver.worker.js 一个字节都不动 —— 门禁跑挂了也不会在仓库里留下一个坏文件。
// ════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8177;
const WORKER_REL = '/games/connect4/js/solver.worker.js';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); failed++; } else console.log('✓ ' + m); };
const eq = (got, want, m) => ok(JSON.stringify(got) === JSON.stringify(want),
  m + (JSON.stringify(got) === JSON.stringify(want) ? '' : '\n    got  ' + JSON.stringify(got) + '\n    want ' + JSON.stringify(want)));

// ─────────── 服务器：可按 ?drop=<名> 现改现发一个「少一个 importScripts」的 Worker ───────────
function mutate(src, drop) {
  // ⚠ 用 [ \t] 而不是 \s：\s 含换行，贪婪之后会一口吃掉后面几行 import（变异就不止一条了）
  const re = new RegExp("^[ \\t]*'[^']*" + drop + "\\.js',?[ \\t]*\\r?\\n", 'm');
  if (!re.test(src)) throw new Error('变异失败：importScripts 里找不到 ' + drop + '.js —— 依赖列表改过了？');
  return src.replace(re, '');
}

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      const u = req.url.split('?');
      const p = decodeURIComponent(u[0]);
      const q = new URLSearchParams(u[1] || '');
      const f = path.join(ROOT, p);
      if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      if (p === WORKER_REL && q.get('drop')) {
        let body;
        try { body = mutate(fs.readFileSync(f, 'utf8'), q.get('drop')); }
        catch (e) { rep.writeHead(500); rep.end(String(e.message)); return; }
        rep.writeHead(200, { 'Content-Type': 'text/javascript' });
        rep.end(body); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error('端口 ' + PORT + ' 被占用') : e));
    srv.listen(PORT, () => res(srv));
  });
}

// ─────────── node 侧的期望值（同一份模块，直接 require）───────────
// ⭐ 分数与落子都是**局面自身的事实**，与装不装库无关 ⇒ node 侧一律装着库算（快），
//   再拿去比浏览器**无库**算出来的那一份 —— 对上了同时证明两件事：
//   Worker 里跑的是真求解器，且库没有改变任何一个答案。
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const Book = require('../js/book.js');
const AI = require('../js/ai.js');

// 夹具（都自证合法：非终局）
const FIX = {
  easy: { moves: [3, 3, 4], tier: 1, seed: 12345 },            // 轻松档：不碰求解器，微秒级
  deep: { moves: [1, 2, 6, 4, 0, 3, 1, 1, 4, 2, 2, 4, 5, 4, 4, 5], tier: 20, seed: 7 },  // n=16，求解器档真的搜
  deep2: { moves: [2, 3, 5, 1, 6, 3, 0, 0, 2, 4, 6, 2, 0, 2, 5, 5, 2, 0, 5, 2] },        // n=20
  n9a: { moves: [1, 2, 2, 2, 2, 6, 3, 6, 3] },                 // 装库**前**问它（无库实测 ~4 s）
  n9b: { moves: [1, 2, 0, 0, 4, 2, 4, 5, 1] },                 // 装库**后**问它（必须秒回）
  over: { moves: [3, 3, 4, 4, 2, 2, 5] }                        // 已终局：AI 必须**报错**，不许编一手
};

(async () => {
  // 前提写成断言：夹具真的是（非）终局，别让夹具坏了被读成被测代码坏了
  for (const k of ['easy', 'deep', 'deep2', 'n9a', 'n9b']) {
    if (R.terminal(B.fromMoves(FIX[k].moves)) !== null) throw new Error('夹具 ' + k + ' 竟是终局');
  }
  if (R.terminal(B.fromMoves(FIX.over.moves)) === null) throw new Error('夹具 over 必须是终局');
  if (!AI.usesSolver(FIX.deep.moves, FIX.deep.tier)) throw new Error('夹具 deep 竟然不调求解器（那就证不了 Worker 里跑的是真求解器）');

  const bk = Book.loadFileSync(path.join(__dirname, '..', 'data', 'book-classic.bin'));
  if (!bk) throw new Error('node 侧开局库读不到：' + Book.status().error);
  const WANT = {
    easyCol: AI.aiMove(FIX.easy.moves, FIX.easy.tier, FIX.easy.seed),
    deepCol: AI.aiMove(FIX.deep.moves, FIX.deep.tier, FIX.deep.seed),
    n9a: S.scoreAll(B.fromMoves(FIX.n9a.moves)),
    n9b: S.scoreAll(B.fromMoves(FIX.n9b.moves)),
    deep2: S.scoreAll(B.fromMoves(FIX.deep2.moves)),
    bookPly: bk.ply, bookCount: bk.count
  };

  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/games/connect4/index.html');
  await page.waitForFunction(() => window.EngineClient, null, { timeout: 5000 });

  // ─────────── ① 活性探针 ───────────
  const boot = await page.evaluate(async () => {
    const t0 = performance.now();
    const alive = await EngineClient.start();
    return { alive, ms: performance.now() - t0, st: EngineClient.state() };
  });
  ok(boot.alive === true, 'ping 回来了（' + boot.ms.toFixed(0) + ' ms，探针预算 ' + '3000 ms）');
  ok(boot.ms < 3000, 'ping 在 3 s 内');
  ok(boot.st.worker === 'alive', "state().worker === 'alive'（实际 " + boot.st.worker + '，' + boot.st.error + '）');
  ok(/solve=-5 ai=1 book=none/.test(boot.st.probe || ''),
    '⭐ 自检指纹证明六个依赖都真调过了：' + JSON.stringify(boot.st.probe));
  // ⚠ 这里**不能**断言 `book === 'none'`（原来是这么写的，T6 之后红了）：
  //   `main.js` 现在 boot 时就调 `EngineClient.start()` 并在后台拉库——那正是「懒加载」的
  //   本意（**不阻塞**，不是**不开始**）。而库加载 ~21 ms、ping ~28 ms，两者是赛跑关系
  //   ⇒ 读 start() 之后的**当前快照**天生 flaky，以前一直绿只是因为 main.js 还没启动它。
  // ⭐ 真正证明「首屏没有阻塞在库上」的是**上一条**：探针指纹里的 `book=none` 是 Worker
  //   内部在 ping 那一刻抓的，它为真就说明 ping 没有等库。这里只做值域闭集检查。
  ok(['none', 'loading', 'ready'].includes(boot.st.book),
    '开局库状态必须落在闭集内（实际 ' + boot.st.book + '）；「没阻塞」由上一条的探针指纹证明');

  // ─────────── ② Worker 的 AI 与 node 逐位相同 ───────────
  const easy = await page.evaluate(f => EngineClient.ai(f.moves, f.tier, f.seed), FIX.easy);
  eq(easy.col, WANT.easyCol, '轻松档（tier 1）落子 = node 的 AI.aiMove');
  ok(easy.usedSolver === false, '轻松档没调求解器（usedSolver=false，必须秒出）');

  const deep = await page.evaluate(f => EngineClient.ai(f.moves, f.tier, f.seed), FIX.deep);
  eq(deep.col, WANT.deepCol, '⭐ 求解器档（tier 20 / n=16）落子 = node 的 AI.aiMove');
  ok(deep.usedSolver === true, '⭐ 这一手确实走了求解器（usedSolver=true ⇒ Worker 里跑的不是降级路径）');

  // ─────────── ③ 装库前：n≤9 是断崖（DESIGN §9.2），但答案必须已经是真值 ───────────
  const pre = await page.evaluate(async f => {
    const t0 = performance.now();
    const r = await EngineClient.scores(f.moves);
    return { scores: r.scores, ms: performance.now() - t0 };
  }, FIX.n9a);
  eq(pre.scores, WANT.n9a, '⭐ 无库的 n=9 scoreAll 与 node（装库）逐位相同 —— 库不改变任何答案');
  console.log('  ⏱ 无库 n=9：' + pre.ms.toFixed(0) + ' ms（这就是 §9.2 的断崖，也是懒加载必须挡住它的原因）');

  // ─────────── ④ 开局库懒加载 ───────────
  const bookSt = await page.evaluate(async () => {
    const before = EngineClient.bookReady();
    const t0 = performance.now();
    const st = await EngineClient.ensureBook();
    return { before, st, ready: EngineClient.bookReady(), ms: performance.now() - t0 };
  });
  // ⚠ 这里**不能**断言 `before === false`（原来是这么写的，偶发红）：它读的是第 ③ 步那次
  //   ~5 秒 `scoreAll` **之后**的快照，而 `main.js` boot 时就在后台拉库（那正是懒加载的本意：
  //   **不阻塞**，不是**不开始**）⇒ 谁先到是竞态，与产品对错无关。
  // ⭐ 「懒加载」这条性质由**第 ① 步的探针指纹**证明（`book=none` 是 Worker 内部在 ping
  //   那一刻抓的，它为真就说明 ping 没等库）——这里只做值域检查，别重复且 racy 地再断一次。
  // ⚠ 同一个坑本文件已经踩过一次（见 ① 上方注释）：**读「当前快照」去证明「没阻塞」永远是竞态**。
  ok(typeof bookSt.before === 'boolean',
    'bookReady() 必须返回布尔（懒加载的「没阻塞」由 ① 的探针指纹证明，实际 ' + bookSt.before + '）');
  ok(bookSt.st.book === 'ready', "装库后 status().state === 'ready'（实际 " + bookSt.st.book + ' / ' + bookSt.st.bookError + '）');
  eq([bookSt.st.bookPly, bookSt.st.bookCount], [WANT.bookPly, WANT.bookCount], '库的 ply/条目数与 node 读到的相同');
  ok(bookSt.ready === true, 'bookReady() = true');
  console.log('  ⏱ 装库（fetch 3.63 MiB + 校验和 + 解析）：' + bookSt.ms.toFixed(0) + ' ms');

  const post = await page.evaluate(async f => {
    const t0 = performance.now();
    const r = await EngineClient.scores(f.moves);
    return { scores: r.scores, ms: performance.now() - t0 };
  }, FIX.n9b);
  eq(post.scores, WANT.n9b, '装库后的 n=9 scoreAll 与 node 逐位相同');
  ok(post.ms < 200, '⭐ 装库后 n=9 秒回：' + post.ms.toFixed(1) + ' ms（< 200 ms）');
  ok(pre.ms / Math.max(post.ms, 0.1) > 10,
    '⭐ 库真的生效了：无库 ' + pre.ms.toFixed(0) + ' ms → 有库 ' + post.ms.toFixed(1) + ' ms（'
    + (pre.ms / Math.max(post.ms, 0.1)).toFixed(0) + '×）');

  // ─────────── ⑤ 只认最新一次（玩家连点时旧结果必须丢弃）───────────
  const race = await page.evaluate(async f => {
    const p1 = EngineClient.scores(f.a);      // 立刻被下面这条顶掉
    const p2 = EngineClient.scores(f.b);
    return { r1: await p1, r2: await p2 };
  }, { a: FIX.deep.moves, b: FIX.deep2.moves });
  ok(race.r1.stale === true, '⭐ 被顶掉的旧请求 resolve 成 {stale:true}（不是给一个过期的答案）');
  eq(race.r2.scores, WANT.deep2, '最新那一次拿到的是**它自己**的分数（不是上一条的）');

  // ─────────── ⑥ 终局局面：照实报错，⛔ 不许编一手 ───────────
  const over = await page.evaluate(async f => {
    const sc = await EngineClient.scores(f.moves);
    let aiErr = null;
    try { await EngineClient.ai(f.moves, 20, 1); } catch (e) { aiErr = String(e.message); }
    return { sc, aiErr };
  }, FIX.over);
  ok(over.sc.terminal !== null && over.sc.terminal !== undefined,
    '终局局面 scores 带回 terminal=' + JSON.stringify(over.sc.terminal) + '（分得清「没有分数」与「算不出来」）');
  ok(over.aiErr && /终局/.test(over.aiErr), '终局局面 ai() 报错而不是编一个列号：' + over.aiErr);

  ok(errs.length === 0, '页面零 pageerror' + (errs.length ? '：' + errs[0] : ''));

  // ─────────── ⑦⭐⭐ 故意漏依赖：探针必须**当场报 dead** ───────────
  // ⚠ 六个依赖**每一个都漏一次**，因为它们的死法分两类，而第二类才是真正的杀手：
  //   · how='load'     漏 prng / bitboard / rules-classic / solver ⇒ 加载期就抛
  //                    （ai.js:95 取裸 PRNG、solver.js:62 读 B.CELLS、solver.js:68 读 R.ORDER、
  //                     worker 顶层 Solver.setKeepTable）⇒ 走 onerror，怎么写都看得见。
  //   · ⭐⭐ how='selftest'  漏 **book / ai** ⇒ **一声不吭**：五个模块写的都是
  //                    `const X = inNode ? require(...) : root.Y;`，取不到时**不抛**，
  //                    只是存下 undefined ⇒ Worker 起得来、消息通、ping 有回音
  //                    （下面 RAW 那两条把这件事钉死：onerror 恒 null）。
  //                    ⇒ **如果 ping 只回一个 pong，这两条就是完全静默的**，
  //                      而少了 book.js 的后果是「每个 n≤9 要几十分钟」= 玩家眼里的「有点慢」。
  //                      这就是 ping 里 selfTest() 存在的唯一理由。
  const DROPS = [
    { name: 'prng', how: 'load' }, { name: 'bitboard', how: 'load' },
    { name: 'rules-classic', how: 'load' }, { name: 'solver', how: 'load' },
    { name: 'book', how: 'selftest' }, { name: 'ai', how: 'selftest' }
  ];
  for (const d of DROPS) {
    const r = await page.evaluate(async n => {
      EngineClient.dispose();
      const t0 = performance.now();
      const alive = await EngineClient.start({ url: 'js/solver.worker.js?drop=' + n });
      const st = EngineClient.state();
      let aiOut = null, aiErr = null, dead = false;
      try { const x = await EngineClient.ai([3, 3, 4], 1, 12345); aiOut = x && x.col; }
      catch (e) { aiErr = String(e.message); dead = e.dead === true; }
      return { alive, st, aiOut, aiErr, dead, ms: performance.now() - t0 };
    }, d.name);
    ok(r.alive === false && r.st.worker === 'dead',
      '⭐⭐ 漏 ' + d.name + '.js ⇒ 探针当场判 dead（' + r.ms.toFixed(0) + ' ms）：' + r.st.error);
    ok(r.aiOut === null && r.dead === true,
      '   └ ai() **reject**（err.dead）而不是「有结果但慢」：' + r.aiErr);
    // 死法本身也钉住：selftest 那两条一旦变成 load，说明有人给模块加了顶层引用；
    // 反过来 load 变 selftest 无所谓 —— 但 selftest 变「没死」就是灾难，上面第一条会红。
    const byLoad = /Worker 报错/.test(r.st.error), bySelf = /自检/.test(r.st.error);
    ok(d.how === 'load' ? byLoad : bySelf,
      '   └ 死法 = ' + (byLoad ? 'load（onerror）' : bySelf ? 'selftest（ping 的真调用）' : '??') + '，与预期一致');
  }

  // ⭐⭐ RAW：证明 how='selftest' 那两条**在传输层是活的** —— 裸 Worker 不报 onerror、
  //    ping 有回音。⇒ 「只回 pong」的探针会把它们判成健康，这一条就是那个反事实的实证。
  for (const d of ['book', 'ai']) {
    const raw = await page.evaluate(n => new Promise(res => {
      const w = new Worker('js/solver.worker.js?drop=' + n);
      const out = { onerror: null, resp: null };
      w.onerror = e => { out.onerror = e.message; res(out); };
      w.onmessage = e => { out.resp = e.data; w.terminate(); res(out); };
      w.postMessage({ id: 1, op: 'ping' });
      setTimeout(() => { w.terminate(); res(out); }, 2500);
    }), d);
    ok(raw.onerror === null && raw.resp && raw.resp.ok === false,
      '⭐⭐ 漏 ' + d + '.js 的裸 Worker **没有 onerror**、ping 照样有回音 ⇒ 只有自检抓得到它：'
      + JSON.stringify(raw.resp && raw.resp.error));
  }

  // ─────────── ⑧ 还原（同一个页面换回真 Worker）必须照常活 ───────────
  const back = await page.evaluate(async () => {
    EngineClient.dispose();
    const alive = await EngineClient.start();
    const c = await EngineClient.ai([3, 3, 4], 1, 12345);
    return { alive, col: c.col, st: EngineClient.state() };
  });
  ok(back.alive === true && back.st.worker === 'alive', '换回未变异的 Worker ⇒ 又活了');
  eq(back.col, WANT.easyCol, '还原后落子仍与 node 相同');

  await browser.close();
  srv.close();
  console.log(failed === 0 ? '\ne2e-worker: 全部通过' : '\ne2e-worker: ' + failed + ' 条失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('e2e-worker 抛错：', e); process.exit(1); });
