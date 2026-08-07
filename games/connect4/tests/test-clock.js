// ════════════════════════════════════════
// test-clock.js —— 限时模式那块**表**的门禁（P2c Task 5 · DESIGN §6.10）。
//
// clock.js 只有 100 行，但它承着本 task 里最要命的两条承诺：
//   · **停表期间一毫秒都不许走**（切后台不许偷跑 / AI 的思考时间不算玩家的）；
//   · **超时只报一次**（报两次 = 连着落好几子，而每一子看起来都合法）。
// ⭐ 时间是**注入**的（`tick(key, now, blocked)`）⇒ 这两条在 node 里可以逐毫秒钉死，
//   ⛔ 不用起浏览器、也不用真的等 10 秒。
//
// ⚠ 每一条都配了会红的反向对照：断言必须在「实现被改坏」时真的变红，
//   ⛔ 而不是在任何实现下都绿（本仓「加了断言但抓不住」已出现六次）。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../js/clock.js');

// ─────────── ① 产品数值 ───────────
{
  assert.strictEqual(C.TURN_MS, 10000, 'DESIGN §6.10：**每手 10 秒**');
  assert.ok(C.URGENT_MS > 0 && C.URGENT_MS < C.TURN_MS, '告急线必须在 (0, TURN_MS) 之间');
  assert.ok(Object.isFrozen(C), 'API 必须冻结（⛔ 挡住 C4Clock.tick = () => ({expired:false})：'
    + '那会让表看起来还在、只是永远不会超时 —— 画面正常、零报错）');
  console.log('test-clock: ① TURN_MS=' + C.TURN_MS + ' / URGENT_MS=' + C.URGENT_MS + ' OK');
}

// ─────────── ② 基本累加：`used` 是**真实经过的毫秒**，⛔ 不是 tick 的次数 ───────────
{
  C.forget();
  C.tick('a', 1000, false);                    // 第一拍：建表，贡献 0
  assert.strictEqual(C.state().used, 0, '换手那一拍不许被算进来');
  C.tick('a', 1300, false);
  assert.strictEqual(C.state().used, 300);
  C.tick('a', 1350, false);
  assert.strictEqual(C.state().used, 350, '⭐ 累的是**时间**不是拍数（50 ms 的一拍就只算 50）');
  assert.strictEqual(C.remain(), C.TURN_MS - 350);
  assert.strictEqual(C.frac(), (C.TURN_MS - 350) / C.TURN_MS);
  console.log('test-clock: ② 累加的是真实毫秒 OK');
}

// ─────────── ③ ⭐⭐ 停表：blocked 那几拍**一毫秒都不许走** ───────────
// 这一条同时守三件事（main.js 的 clockBlock 把它们收成一个判据）：
//   切后台不许偷跑 · AI 的思考时间不算玩家的 · 等对方回答悔棋期间不扣表。
{
  /** 按**真实节拍**（main.js 的 CLOCK_TICK_MS = 100）从 from 推到 to。
   *  ⚠ 必须一拍一拍推，⛔ 别一步跳几秒：单拍上限 MAX_STEP_MS 会把大跳夹掉（那是⑦在守的东西）。
   *  @returns 这段里 expired 报了几次 */
  function run(key, from, to, blocked, step) {
    let n = 0;
    for (let t = from + (step || 100); t <= to; t += (step || 100)) {
      if (C.tick(key, t, blocked).expired) n++;
    }
    return n;
  }
  C.forget();
  C.tick('a', 0, false);
  run('a', 0, 2000, false);
  assert.strictEqual(C.state().used, 2000, '前提：正常走了 2 秒');
  // 停表 30 秒（远超 TURN_MS）—— 期间一拍都不许累加、⛔ 更不许超时
  const ex = run('a', 2000, 32000, true);
  assert.strictEqual(C.state().used, 2000,
    '⭐⭐ 停表 30 秒之后 used 必须**一毫秒都没涨**（现在是 ' + C.state().used + '）'
    + ' —— 这就是「切后台不许偷跑」「AI 思考不算玩家的」的判据本身');
  assert.strictEqual(ex, 0, '⛔ 停表期间绝不许超时');
  // ⭐ 反向对照：同样这段时间**不停表**的话必须超时（否则上面两条在「表根本不走」的实现下也绿）
  C.forget();
  C.tick('b', 0, false);
  run('b', 0, 2000, false);
  assert.strictEqual(run('b', 2000, 32000, false), 1,
    '⭐ 反向对照：同一段时间不停表就必须超时 —— ⛔ 少了它，上面那条在「tick 什么都不做」时也绿');
  // ⭐ 恢复之后接着走（⛔ 不许「补偿」把停掉的那段补回来）
  C.forget();
  C.tick('c', 0, false);
  run('c', 0, 1000, false);          // used 1000
  run('c', 1000, 6000, true);        // 停表 5 秒
  run('c', 6000, 6500, false);       // 恢复后又走了 500
  assert.strictEqual(C.state().used, 1500,
    '⭐ 恢复之后从**停下的地方**接着走（1000+500=1500），⛔ 不许把停掉的 5 秒补回来');
  console.log('test-clock: ③ ⭐⭐ 停表一毫秒不走 / 反向对照会超时 / 恢复不补偿 OK');
}

// ─────────── ④ ⭐ 超时**只报一次** ───────────
// ⛔ 写成「remain===0 就为 true」的话，超时手落下去之前的每一拍都会再触发一次
//    ⇒ 连着落好几子，而每一子看起来都合法（零报错）。
{
  C.forget();
  C.tick('a', 0, false);
  let n = 0;
  for (let t = 1000; t <= 30000; t += 1000) { if (C.tick('a', t, false).expired) n++; }
  assert.strictEqual(n, 1, '⭐ 同一手只许报一次超时，实际报了 ' + n + ' 次');
  assert.strictEqual(C.state().fired, true);
  // 换一手 ⇒ 表清零、可以再报
  const r = C.tick('b', 31000, false);
  assert.strictEqual(r.used, 0, '换手 ⇒ used 清零');
  assert.strictEqual(r.remain, C.TURN_MS);
  assert.strictEqual(C.state().fired, false, '换手 ⇒ 超时标志也要清（否则第二手永远不会超时）');
  let n2 = 0;
  for (let t = 32000; t <= 60000; t += 1000) { if (C.tick('b', t, false).expired) n2++; }
  assert.strictEqual(n2, 1, '⭐ 反向对照：下一手照样会超时（⛔ fired 忘了清 = 全局只超时一次）');
  console.log('test-clock: ④ ⭐ 超时只报一次 / 换手能再报 OK');
}

// ─────────── ⑤ key：**手数一样但不是同一手** 也必须重开表 ───────────
// ⚠ main.js 的 turnKey 里带了 aiSeq 正是为这条：撤销之后手数可能回到同一个数。
{
  C.forget();
  C.tick('1:3', 0, false);
  for (let t = 100; t <= 4000; t += 100) C.tick('1:3', t, false);
  assert.strictEqual(C.state().used, 4000);
  const r = C.tick('2:3', 4000, false);      // 手数还是 3，但 aiSeq 变了 ⇒ 另一手
  assert.strictEqual(r.used, 0, '⭐ key 变了就必须清零（撤销回到同一手数时，那是另一手）');
  console.log('test-clock: ⑤ key 变化即重开表 OK');
}

// ─────────── ⑥ key = null：没有表在跑（HOME / 结算 / 轮到 AI / 非限时局）───────────
{
  C.forget();
  C.tick('a', 0, false);
  C.tick('a', 5000, false);
  const r = C.tick(null, 6000, false);
  assert.strictEqual(r.expired, false);
  assert.strictEqual(r.remain, C.TURN_MS);
  assert.strictEqual(C.state().key, null, 'key=null ⇒ 整个表被忘掉');
  assert.strictEqual(C.state().used, 0);
  // ⭐ 关键：轮到 AI 的那段时间里表**根本不存在** ⇒ 不可能触发超时（⛔ 绝不许替 AI 落子）
  let ex = false;
  for (let t = 7000; t <= 60000; t += 1000) { if (C.tick(null, t, false).expired) ex = true; }
  assert.strictEqual(ex, false,
    '⭐⭐ key=null（轮到 AI / 结算 / HOME）时**永远不会超时** —— ⛔ 否则时钟会替 AI 落一手');
  console.log('test-clock: ⑥ key=null ⇒ 无表、永不超时 OK');
}

// ─────────── ⑦ 坏时间：倒退 / NaN / 巨大跳变 ───────────
{
  C.forget();
  C.tick('a', 1000, false);
  C.tick('a', 1500, false);
  assert.strictEqual(C.state().used, 500);
  C.tick('a', 900, false);                    // 时钟倒退
  assert.strictEqual(C.state().used, 500, '⛔ dt<0 当 0，绝不许把 used 减回去（那会白送时间）');
  C.tick('a', NaN, false);
  assert.strictEqual(C.state().used, 500, 'NaN 的 now 不许污染 used');
  assert.ok(Number.isFinite(C.state().used));
  // ⭐ 单拍上限：主线程被卡住一整分钟时，最多只算 MAX_STEP_MS
  C.forget();
  C.tick('a', 0, false);
  C.tick('a', 60000, false);
  assert.strictEqual(C.state().used, C.MAX_STEP_MS,
    '⭐ 单拍最多计入 MAX_STEP_MS=' + C.MAX_STEP_MS + '（主线程卡死那段玩家点也点不动，'
    + '夹在玩家这一侧）—— 实际 ' + C.state().used);
  console.log('test-clock: ⑦ 倒退/NaN/巨大跳变都不炸也不白扣 OK');
}

// ─────────── ⑧ 显示量：seconds / urgent 的边界 ───────────
{
  /** 把表推到「已用掉 used 毫秒」。⚠ 一拍一拍推（单拍上限 MAX_STEP_MS，见 ⑦）。 */
  const at = used => {
    C.forget(); C.tick('a', 0, false);
    for (let t = 100; t < used; t += 100) C.tick('a', t, false);
    C.tick('a', used, false);
  };
  C.forget(); C.tick('a', 0, false);
  assert.strictEqual(C.seconds(), 10, '开局显示 10');
  assert.strictEqual(C.urgent(), false);
  at(500);  assert.strictEqual(C.seconds(), 10, '还剩 9.5 秒 ⇒ 显示 10（向上取整）');
  at(7000); assert.strictEqual(C.seconds(), 3);
  assert.strictEqual(C.urgent(), true, '⭐ 剩 3.0 秒 = 告急（判据是 remain <= URGENT_MS）');
  at(6999); assert.strictEqual(C.urgent(), false, '⭐ 反向对照：剩 3001 ms 还不告急');
  at(9999); assert.strictEqual(C.seconds(), 1);
  at(10000); assert.strictEqual(C.seconds(), 0);
  assert.strictEqual(C.frac(), 0);
  at(99999); assert.strictEqual(C.remain(), 0, '⛔ remain 不许出负数');
  assert.strictEqual(C.frac(), 0);
  C.forget();
  console.log('test-clock: ⑧ seconds / urgent / frac 边界 OK');
}

// ─────────── ⑨ ⭐⭐ 源码红线：⛔ 不许有 Math.random，⛔ 不许自己去读时钟 ───────────
// ⚠ 这两条是本 task 的两个承诺在**源码层**的兜底（同 e2e-p2c-t3 扫猜先那一节的做法）：
//   · `Math.random` ⇒ 超时手不可重放（撤销 = 重放，§9.3）；
//   · clock.js 自己去调 `Date.now()` / `performance.now()` ⇒ 时间就不是**注入**的了，
//     node 侧这整份门禁会退化成「等真的过 10 秒」，而停表那几条根本没法测。
{
  const SRC = f => fs.readFileSync(path.resolve(__dirname, '..', 'js', f), 'utf8')
    // ⚠ 先把注释剥掉：本仓的注释里大量出现「⛔ 不许 Math.random」这类**反例文字**
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const clock = SRC('clock.js'), state = SRC('state.js');
  assert.ok(clock.indexOf('Math.random') < 0, '⛔ clock.js 里不许出现 Math.random');
  assert.ok(state.indexOf('Math.random') < 0,
    '⛔ state.js 里不许出现 Math.random —— 超时手必须可重放（撤销 = 重放，DESIGN §9.3）');
  for (const bad of ['Date.now', 'performance.now', 'new Date']) {
    assert.ok(clock.indexOf(bad) < 0,
      '⛔ clock.js 不许自己读时钟（' + bad + '）：时间必须由调用方**注入**，'
      + '否则这份门禁里「停表一毫秒不走」那几条根本没法在 node 里量');
  }
  // ⭐ 反向对照：把这把尺子对准一个**真的含 Math.random 的**串，它必须会红
  assert.ok('var x = Math.random();'.indexOf('Math.random') >= 0, '前提：这把尺子量得动');
  console.log('test-clock: ⑨ ⭐⭐ 源码红线（零 Math.random / 时间靠注入）OK');
}

console.log('test-clock: 全部通过');
