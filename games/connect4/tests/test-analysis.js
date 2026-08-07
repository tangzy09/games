// ════════════════════════════════════════
// test-analysis.js —— 边打边算的调度门禁（P3 Task 2 · DESIGN §9.2 的两段实测）。
//
// analysis.js 要做的事只有一句：**每落一手就在 Worker 空闲时算那一手的真值**，
// 把整局复盘的 0.36-3.30 s 摊进玩家想棋 / AI 思考 / 落子动画的自然间隙里
// ⇒ 终局时复盘几乎瞬开，而总计算量一位不变。
//
// ⚠ 全程用**假 EngineClient**注入，⛔ 不起真 Worker：
//   这里要钉的是**调度**（谁先谁后、并发几个、失败了怎么办），不是求解器。
//   真 Worker 的活性由 e2e-worker.cjs 管，两件事别混。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const AN = require('../js/analysis.js');

// ─────────── 假 EngineClient ───────────
// ⭐ 记录并发峰值 —— 「一次只在飞一个」是本文件最重要的一条断言。
function fakeClient(opts) {
  const o = opts || {};
  const st = {
    inflight: 0, peak: 0, calls: [], resolvers: [],
    alive: () => o.dead !== true,
    bookReady: () => o.noBook !== true,
    scores: function (moves) {
      st.inflight++;
      if (st.inflight > st.peak) st.peak = st.inflight;
      st.calls.push(moves.slice());
      return new Promise(function (resolve, reject) {
        st.resolvers.push(function () {
          st.inflight--;
          if (o.dead) reject(Object.assign(new Error('求解器不可用：测试'), { dead: true }));
          else resolve({ scores: { 3: 5, 4: 0 }, n: moves.length });
        });
      });
    }
  };
  /**
   * 把队列里最早那个请求放行（模拟 Worker 回话）。
   * ⚠⚠ 必须等一个**宏任务**（setTimeout 0），⛔ 不能只等 microtask ——
   *   analysis 的 pump 是**故意**用 setTimeout 让出一拍的（⛔ 在 then 里同步递归会形成
   *   microtask 链，把浏览器的输入事件饿死：页面还能截图、evaluate 也答得动，但鼠标点不动，
   *   2026-08-06 被 e2e-p2b-t7 实锤）。这里跟着它走。
   */
  const macro = () => new Promise(r => setTimeout(r, 0));
  st.flush = async function () {
    const r = st.resolvers.shift();
    if (r) r();
    await macro();
  };
  st.flushAll = async function () {
    let guard = 0;
    // ⚠ 队列可能在 flush 之后才补上新的一条（pump 是异步接力的）⇒ 空转几拍再判结束
    let idle = 0;
    while (guard++ < 400 && idle < 3) {
      if (st.resolvers.length) { idle = 0; await st.flush(); }
      else { idle++; await macro(); }
    }
  };
  return st;
}

const g0 = (moves, extra) => Object.assign({ mode: 'ai', moves: moves.slice(), pre: [], humanFirst: true }, extra || {});

(async function () {

  // ─────────── ① 依次请求每个前缀局面，⭐ 一次只在飞一个 ───────────
  // ⛔ 甩给 EngineClient 并发是错的：它的 send 是「同一个 op 只认最新一次」
  //   ⇒ 并发发三条 scores，前两条会被自己顶掉（resolve 成 stale），
  //     表现是「算了半天缓存里还是空的」，零报错。
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    AN.onMove(g0([3, 4]));
    AN.onMove(g0([3, 4, 5]));
    await c.flushAll();
    assert.strictEqual(c.peak, 1,
      '⭐⭐ 并发峰值必须是 1（实测 ' + c.peak + '）—— EngineClient 同 op 只认最新一次，'
      + '并发发出去的会被自己顶掉，表现是「算了半天缓存还是空的」且零报错');
    assert.ok(c.calls.length >= 3, '三个前缀局面都要被请求到，实际 ' + c.calls.length);
    console.log('test-analysis: ① ⭐ 逐个排队、并发峰值 = 1 OK');
  }

  // ─────────── ② 缓存命中：算过的不再问第二遍 ───────────
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    await c.flushAll();
    const before = c.calls.length;
    AN.onMove(g0([3]));           // 同一个局面又来一次
    await c.flushAll();
    assert.strictEqual(c.calls.length, before, '同一个局面不许问第二遍');
    assert.ok(AN.get([3]) !== null, '算过的要取得到');
    console.log('test-analysis: ② 缓存命中，不重复请求 OK');
  }

  // ─────────── ③ ⭐ 撤销不作废（缓存按**局面**存，⛔ 不按第几手）───────────
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    for (const mv of [[3], [3, 4], [3, 4, 5], [3, 4, 5, 2], [3, 4, 5, 2, 1]]) AN.onMove(g0(mv));
    await c.flushAll();
    const before = c.calls.length;
    // 撤到 3 手，再往下走 —— 前 3 手的真值早算过了，⛔ 不许重算
    AN.onMove(g0([3, 4, 5]));
    await c.flushAll();
    assert.strictEqual(c.calls.length, before,
      '⭐ 撤销之后前缀局面必须命中缓存（按局面存就白送这条；按 ply 号存就会全部重算）');
    assert.ok(AN.get([3, 4]) !== null, '撤销后更早的前缀仍然取得到');
    console.log('test-analysis: ③ ⭐ 撤销不作废已算的前缀 OK');
  }

  // ─────────── ④ ⭐ 插队：提示要的那一次必须先出队 ───────────
  // ⚠ 提示是玩家**主动按下**的等待（§9.2 裁定可接受），⛔ 但不能排在几十个后台请求后面。
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    AN.onMove(g0([3, 4]));
    AN.onMove(g0([3, 4, 5]));
    // 此刻第一个在飞，后两个在排队。现在插一个高优先级的：
    const urgent = [3, 4, 5, 2];
    AN.request(urgent, { priority: true });
    await c.flush();               // 放行正在飞的那个
    await c.flush();               // 下一个出队的应该是插队的那个
    const idx = c.calls.findIndex(m => m.join(',') === urgent.join(','));
    assert.ok(idx >= 0, '插队的请求必须真的被发出去');
    assert.strictEqual(idx, 1,
      '⭐ 插队的必须是**下一个**出队的（实际排在第 ' + idx + ' 位）—— 否则提示会排在几十个后台请求后面');
    await c.flushAll();
    console.log('test-analysis: ④ ⭐ 优先请求插队 OK');
  }

  // ─────────── ⑤ ⛔ 让子局：一个请求都不发，且原因可读 ───────────
  // 两条不同的理由（⛔ 别混成一条）：让 2 子是**性能上不可能**（整局 173.5 s、单个局面 101 s）；
  // 让 1 子是**协议表达不了**（worker 的 scores 走 fromMoves，从空盘重放，没有预置子这一说）。
  {
    for (const h of [1, 2]) {
      const c = fakeClient();
      AN.attach(c);
      AN.start(g0([], { pre: h === 1 ? [3] : [3, 3] }));
      AN.onMove(g0([4], { pre: h === 1 ? [3] : [3, 3] }));
      await c.flushAll();
      assert.strictEqual(c.calls.length, 0,
        '⛔ 让 ' + h + ' 子局必须一个请求都不发（发了就是把玩家晾在那儿等一个永远不对的答案）');
      assert.strictEqual(AN.disabledReason(), 'handicap',
        '⛔ 让 ' + h + ' 子局的停用原因码必须是 handicap（空字符串 = UI 只能显示一片空白）');
      assert.strictEqual(AN.enabled(), false);
    }
    console.log('test-analysis: ⑤ ⛔ 让子局零请求 + 原因可读 OK');
  }

  // ─────────── ⑥ ⛔ 求解器死了：如实记 failed，⛔ 不许把 reject 吞掉 ───────────
  // §2.4：降级必须**可见**。吞掉 reject 的表现是「进度条停在 60% 再也不动」，零报错。
  {
    const c = fakeClient({ dead: true });
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    await c.flushAll();
    await Promise.resolve();
    assert.strictEqual(AN.enabled(), false, '求解器死了之后必须停用');
    assert.strictEqual(AN.disabledReason(), 'engine',
      '⛔ 停用原因必须是**原因码** engine，实际是「' + AN.disabledReason() + '」');
    console.log('test-analysis: ⑥ ⛔ 求解器死了 ⇒ 如实停用（不吞 reject）OK');
  }

  // ─────────── ⑥b ⛔⛔ 开局库没就位 ⇒ 一个请求都不许发 ───────────
  // engine-client.js:209 的原话：「⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调 scores()：
  //   那是**几十分钟**（n=9 无库实测 3,992 ms，更浅的更久）。判据用 bookReady()。」
  // ⚠⚠ 而本模块**恰恰是从 n=0 的前缀开始排队的** —— 这条不写，边打边算会在开局那几秒里
  //   把 Worker 焊死几十分钟，而画面上只是「复盘一直在转」，零报错。
  {
    const c = fakeClient({ noBook: true });
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    AN.onMove(g0([3, 4]));
    await c.flushAll();
    assert.strictEqual(c.calls.length, 0,
      '⛔⛔ 开局库没就位时发出了 ' + c.calls.length + ' 条 scores —— n≤9 无库是**几十分钟**，'
      + 'Worker 会被焊死，而画面上只是「一直在转」');
    assert.ok(AN.enabled(), '⚠ 这不是「停用」，只是**还没到时候**：库到位后要能自己接着算');
    // ⭐ 库到位 ⇒ kick 一下，积压的必须真的开始算（⛔ 否则等于永远不算）
    c.bookReady = () => true;
    AN.kick();
    await c.flushAll();
    assert.ok(c.calls.length >= 2,
      '⭐ 库到位后积压的请求必须自己接着跑（实际发出 ' + c.calls.length + ' 条）');
    console.log('test-analysis: ⑥b ⛔⛔ 库没就位零请求 + 到位后自动接着算 OK');
  }

  // ─────────── ⑥c ⛔⛔ 停用原因必须是**原因码**，⛔ 不是给玩家看的句子 ───────────
  // ⚠⚠ 2026-08-06 实锤：第一版在这里写死了一句中文「这局有让子，不做精确复盘」，
  //   于是**英文界面上直接弹出中文**（截图抓到的）。本文件是纯模块、拿不到 T()
  //   ⇒ 它只能返回码，翻译在 main.js 的 analysisOffText()。
  // ⇒ 这条钉死「码」这个契约：全 ASCII、无空格、短。⛔ 别再让它变回一句话。
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([], { pre: [3, 3] }));
    const code = AN.disabledReason();
    assert.ok(/^[a-z][a-z0-9_]*$/.test(code),
      '⛔⛔ 停用原因必须是**原因码**（小写 ASCII 标识符），实际是「' + code + '」——'
      + ' 本模块拿不到 T()，在这里写句子 = 硬编码文案，英文界面上会弹出中文');
    assert.ok(code.length <= 24, '原因码不该是一句话（长度 ' + code.length + '）');
    console.log('test-analysis: ⑥c ⛔⛔ 停用原因是原因码而非句子（「' + code + '」）OK');
  }

  // ─────────── ⑦ ⭐ 进度：done 单调不减，且 ⛔ 永不超过 total ───────────
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    for (const mv of [[3], [3, 4], [3, 4, 5], [3, 4, 5, 2]]) AN.onMove(g0(mv));
    let last = 0;
    for (let i = 0; i < 4; i++) {
      await c.flush();
      const p = AN.progress();
      assert.ok(p.done >= last, '⭐ done 必须单调不减（' + last + ' → ' + p.done + '）');
      assert.ok(p.done <= p.total, '⛔ done(' + p.done + ') 不许超过 total(' + p.total + ')');
      last = p.done;
    }
    await c.flushAll();
    // 撤销让 total 变小时，⛔ 也不许出现 done > total
    AN.onMove(g0([3, 4]));
    const p2 = AN.progress();
    assert.ok(p2.done <= p2.total,
      '⛔ 撤销之后 done(' + p2.done + ') 仍不许超过 total(' + p2.total + ')');
    console.log('test-analysis: ⑦ ⭐ 进度单调不减且不越界 OK');
  }

  // ─────────── ⑦b ⛔⛔ stale 不许转成忙循环（2026-08-06 实锤的那个卡死）───────────
  // engine-client 的约定：同一个 op 只认最新一次，被顶掉的旧请求 resolve 成 { stale:true }。
  // 第一版在 `then` 里同步 `unshift + pump()` ⇒ 形成一条 **microtask 链**，
  // 而 microtask **优先于宏任务** ⇒ 它把浏览器的**输入事件饿死**：
  //   页面还能截图、`evaluate` 也答得动，**但鼠标点不动了**，零报错。
  // （e2e-p2b-t7 在结算屏点［再来一局］卡死 3 分钟，就是这条。）
  {
    let calls = 0;
    const c = {
      alive: () => true, bookReady: () => true,
      scores: function () { calls++; return Promise.resolve({ stale: true }); }   // ⭐ 永远被顶掉
    };
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));   // ⚠ 这一句排 2 个前缀局面（k=0、k=1）
    // ⚠ 等若干个**宏任务**：忙循环的话 calls 会爆掉（第一版实测直接把主线程转死）
    for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0));
    // ⭐⭐ 上限按 **per-item** 算（2026-08-07 改）：重试计数挂在每条请求上，⛔ 不是模块级。
    //   模块级那两版都不对，而且方向相反：不归零 ⇒ 丢过一次后**每条只给一次机会**；
    //   归零 ⇒ 每 8 次重置一遍，**变回无限重试**。per-item 两头都对，代价是总量
    //   变成「item 数 × STALE_MAX」而不是一个常数 —— 它仍然**有界**，那才是这条要守的。
    const items = 2;
    const cap = items * (8 /* STALE_MAX */ + 1);
    assert.ok(calls <= cap,
      '⛔⛔ 恒 stale 的情况下发了 ' + calls + ' 次请求（上限 ' + cap + ' = ' + items
      + ' 条 × (STALE_MAX+1)）—— 它必须**有界**，否则就是一条把输入事件饿死的'
      + ' microtask 忙循环（页面看着好好的，鼠标就是点不动）');
    assert.ok(calls >= 1, '前提：至少真的发过一次（否则这条是空过的）');
    console.log('test-analysis: ⑦b ⛔⛔ 恒 stale 有界（' + calls + ' ≤ ' + cap + '），不转成忙循环 OK');
  }

  // ─────────── ⑦c ⭐ 换局：在飞的旧答案不许写进新一局 ───────────
  // ⚠ 两局的 moves 前缀经常一模一样 ⇒ 写串了的话盘面完全正确、评分却是别的局的，零报错。
  {
    let resolveIt = null;
    const c = {
      alive: () => true, bookReady: () => true,
      scores: () => new Promise(res => { resolveIt = res; })
    };
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    await new Promise(r => setTimeout(r, 0));
    assert.ok(resolveIt, '前提：确实有一条在飞');
    AN.reset();                                   // ⭐ 换局（在飞的那条还没回来）
    AN.start(g0([]));
    resolveIt({ scores: { 3: 99 } });              // 旧答案现在才回来
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(AN.get([]), null,
      '⭐ 换局之后，上一局在飞的答案**不许**落进新一局的缓存');
    console.log('test-analysis: ⑦c ⭐ 换局作废在飞的旧答案 OK');
  }

  // ─────────── ⑧ reset 之后干净 ───────────
  {
    const c = fakeClient();
    AN.attach(c);
    AN.start(g0([]));
    AN.onMove(g0([3]));
    await c.flushAll();
    AN.reset();
    assert.strictEqual(AN.get([3]), null, 'reset 之后缓存必须清空（⛔ 上一局的真值不许漏进这一局）');
    assert.strictEqual(AN.progress().total, 0);
    console.log('test-analysis: ⑧ reset 之后干净 OK');
  }

  // ─────────── ⑨ ⛔ 源码级红线：主线程一行搜索都不许有 ───────────
  // main.js 抬头那条：`Solver.solve` / `ConnectAI.decide` 在主线程里一次都不许出现。
  // analysis.js 是新来的主线程模块 ⇒ 同一条纪律。
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'analysis.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    for (const bad of ['Solver.', 'ConnectAI.', 'Math.random', 'importScripts']) {
      assert.ok(code.indexOf(bad) < 0,
        '⛔ analysis.js 的**代码**里出现了 "' + bad + '" —— 主线程一行搜索都不许跑，'
        + '否则页面会当场冻住（DESIGN §9.2 的断崖是 1.7 秒起）');
    }
    assert.ok(src.indexOf('Solver') >= 0 && code.indexOf('Solver.') < 0,
      '剥注释没生效（analysis.js 的注释里本该提到 Solver）');
    console.log('test-analysis: ⑨ ⛔ 源码（剥注释后）主线程零搜索 OK');
  }

  // ─────────── ⑩ API 冻结 ───────────
  {
    assert.ok(Object.isFrozen(AN), 'API 必须冻结');
    console.log('test-analysis: ⑩ API 冻结 OK');
  }

  console.log('test-analysis: 全部通过');
})().catch(e => { console.error(e); process.exit(1); });
