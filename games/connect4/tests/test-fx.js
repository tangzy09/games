// ════════════════════════════════════════
// test-fx.js —— `js/fx.js`（落子物理下落）的纯逻辑门禁。⛔ 不起浏览器、不画一个像素。
//
// 这条门禁守的是 DESIGN §6.3 那一句：**一局落 20 次子，这一个动作的手感就是这个游戏的手感。**
// 手感坏掉的三种方式，全都**不报错**（画面上只是「怪」），所以必须写成断言：
//
//   ⭐   ① 落点没恰好停在目标格 —— 棋子停在半格 / 陷进格子里；
//   ⭐⭐ ② `step()` 不是 dt 幂等的 —— 一掉帧动画就走偏。⚠ 这条最容易写错、最难发现：
//         「每帧 v += g*dt; y += v*dt」的欧拉积分在 60 fps 下看起来完全正常，
//         一到掉帧（切后台回来、低端机）就把棋子送到别的地方，而且只在卡顿时复现。
//         ⇒ 这里用**同一段总时长切成 1 / 3 / 17 段不等长**推进，最终 pose 必须一致。
//   ⭐   ③ 时长失控 —— 一局落 20 次子，每次多 200 ms 就是「这游戏怎么这么黏」。
//
// 另外两条不是「手感」而是「别炸」：
//   · pose 里任何 NaN/undefined 都会把棋子静默画到画布外（表现是「这一子不见了」，零报错）；
//   · `done()` 之后再 step 不许把状态弄坏（rAF 与主循环的收尾竞态是常态）。
//
// ⛔ 输入锁那一条**不在这里**：它是「真实鼠标在动画期间点得动点不动」，
//    只有 tests/e2e-p2b.cjs 的真实点击测得了（本仓铁律：dispatch 驱动的测试测不了那个）。
//
// 用法: node games/connect4/tests/test-fx.js   (npm run test:c4:fx / 已进 npm run test:c4)
// ════════════════════════════════════════
const assert = require('assert');
const Fx = require('../js/fx.js');

const H = 6;
const ROWS = [0, 1, 2, 3, 4, 5];
const r2 = v => Math.round(v * 100) / 100;

// ── 小工具：把一段总时长 T 切成 n 段**不等长**的 dt（和恰好 = T）──
// ⚠ 故意不等长：等长切分对某些错误实现（比如按固定步长做定点积分的）是恰好对的，
//   那样这条门禁就只能抓到一半的错。
function chunks(T, n) {
  if (n === 1) return [T];
  const w = [];
  let s = 0;
  for (let i = 0; i < n; i++) { const x = 1 + ((i * 7919) % 23) / 5; w.push(x); s += x; }
  const out = w.map(x => T * x / s);
  // 末段吸收余量，保证总和精确等于 T（浮点上尽可能接近）
  const acc = out.slice(0, n - 1).reduce((a, b) => a + b, 0);
  out[n - 1] = T - acc;
  return out;
}

/** 用 start/step 真的跑一遍（**走的就是产品跑的那条路**），返回最终 pose。 */
function runChunked(params, T, n) {
  Fx.reset();
  Fx.start('drop', params);
  let lands = 0;
  for (const dt of chunks(T, n)) lands += Fx.step(dt).filter(e => e.type === 'land').length;
  const p = Fx.pose();
  const out = { pose: p.length ? p[0] : null, lands: lands, done: Fx.done(), active: Fx.active() };
  Fx.reset();
  return out;
}

const P = { c: 3, r: 0, player: 0 };                 // 掉得最深的那一手（最长的一段动画）
const TOTAL = Fx.dropDuration(Fx.fallForRow(0));

// ═══ 1. 形状与 sanity：pose 里不许有 NaN/undefined ═══
{
  const id = Fx.start('drop', P);
  assert.ok(id > 0, 'start 应返回 id');
  assert.strictEqual(Fx.done(), false, 'start 之后 done() 必须是 false');
  assert.strictEqual(Fx.active(), 1);
  Fx.step(16);
  const p = Fx.pose()[0];
  for (const k of ['dy', 'sx', 'sy', 't', 'total']) {
    assert.ok(Number.isFinite(p[k]), 'pose.' + k + ' 必须是有限数（NaN 会把棋子静默画到画布外）');
  }
  assert.strictEqual(p.c, 3); assert.strictEqual(p.r, 0); assert.strictEqual(p.player, 0);
  assert.strictEqual(p.phase, 'fall');
  Fx.reset();
  assert.ok(Fx.done() && Fx.active() === 0, 'reset() 之后必须干净（撤销/换局靠它）');
  // 非法参数一律返回 null 且**什么都不做**（⛔ 不许带着 NaN 继续跑）
  const BAD = [
    ['r 越界（6）',    { c: 0, r: 6 }],
    ['r 为负',         { c: 0, r: -1 }],
    ['r 是 NaN',       { c: 0, r: NaN }],
    ['c 是 undefined', { r: 0 }],
    ['fall 是 NaN',    { c: 0, r: 0, fall: NaN }],
    ['fall 为 0',      { c: 0, r: 0, fall: 0 }],
    ['params 为 null', null]
  ];
  for (const [why, bad] of BAD) {
    assert.strictEqual(Fx.start('drop', bad), null, '非法参数必须返回 null：' + why);
  }
  assert.strictEqual(Fx.start('nope', P), null, '未知 kind 必须返回 null');
  assert.ok(Fx.done(), '非法 start 不许留下半个 item');
  console.log('test-fx: pose 形状 / 非法参数 fail-safe OK');
}

// ═══ 2. ⭐ 落点**恰好**停在目标格（不许超调后停在半格）═══
{
  for (const r of ROWS) {
    const total = Fx.dropDuration(Fx.fallForRow(r));
    // 2a. 终点：dy / sx / sy 必须是**精确的** 0 / 1 / 1（⛔ 不给 epsilon）
    const end = Fx.sample({ c: 0, r: r, player: 0 }, total);
    assert.strictEqual(end.dy, 0, 'r=' + r + ' 终点 dy 必须精确为 0，实测 ' + end.dy);
    assert.strictEqual(end.sx, 1, 'r=' + r + ' 终点 sx 必须精确为 1（不许停在被压扁的一帧）');
    assert.strictEqual(end.sy, 1, 'r=' + r + ' 终点 sy 必须精确为 1');
    assert.strictEqual(Fx.sample({ c: 0, r: r }, total * 3).dy, 0, 'r=' + r + ' 超过 total 之后恒在终点');

    // 2b. 连续性：终点前最后一瞬也必须**已经在格心上**（否则收尾时画面跳一下）
    const nearEnd = Fx.sample({ c: 0, r: r, player: 0 }, total - 0.5);
    assert.ok(Math.abs(nearEnd.dy) < 0.01,
      'r=' + r + ' 收尾不连续：total-0.5ms 时 dy=' + nearEnd.dy.toFixed(4) + ' 格，静态帧接上去会跳');

    // 2c. 全程扫一遍：⛔ 不许穿到格子下面（dy>0）、⛔ 不许飞到起点之上（|dy|>fall）
    const fall = Fx.fallForRow(r);
    let maxBounce = 0, minDy = 0, sawFall = false, sawSettle = false;
    for (let t = 0; t <= total; t += 0.5) {
      const p = Fx.sample({ c: 0, r: r, player: 0 }, t);
      assert.ok(Number.isFinite(p.dy) && Number.isFinite(p.sx) && Number.isFinite(p.sy),
        'r=' + r + ' t=' + t + ' pose 出现非有限数');
      assert.ok(p.dy <= 1e-12, 'r=' + r + ' t=' + t + ' dy=' + p.dy + ' > 0：棋子穿到格子下面去了');
      assert.ok(p.dy >= -fall - 1e-9, 'r=' + r + ' t=' + t + ' 飞到了起点之上（dy=' + p.dy + '）');
      assert.ok(p.sx > 0.5 && p.sx < 1.6 && p.sy > 0.5 && p.sy < 1.6,
        'r=' + r + ' t=' + t + ' squash/stretch 失控：sx=' + p.sx + ' sy=' + p.sy);
      if (p.phase === 'fall') sawFall = true;
      if (p.phase === 'settle') { sawSettle = true; maxBounce = Math.max(maxBounce, -p.dy); }
      minDy = Math.min(minDy, p.dy);
    }
    assert.ok(sawFall && sawSettle, 'r=' + r + ' 两个阶段都得出现（撞底后必须有微弹）');
    // ⭐ 「**微**弹」：反弹高度要在 0.02..0.3 格之间。太小 = 看不见，太大 = 棋子在跳。
    assert.ok(maxBounce > 0.02 && maxBounce < 0.3,
      'r=' + r + ' 反弹 ' + maxBounce.toFixed(3) + ' 格，不在「微弹」区间（0.02..0.3）');
    assert.ok(Math.abs(minDy + fall) < 1e-9, 'r=' + r + ' 起点必须正好在 fall 那么高');
  }
  console.log('test-fx: ⭐ 六行落点全部精确停在格心（终点 dy===0 / sx===sy===1），微弹 OK');
}

// ═══ 3. ⭐⭐ `step()` 对 dt 的切分**幂等** ═══
// 同一段总时长，切成 1 / 3 / 17 段不等长推进，最终 pose 必须一致。
// ⛔ 这条红了就说明 fx.js 里出现了跨帧累积（欧拉积分之类）——掉帧会让动画走偏。
{
  const SPLITS = [1, 3, 17];
  // 取动画中段（**不是**播完的终态）：播完之后所有实现都会被夹到终点，那样这条断言恒真。
  const CUTS = [
    { name: '自由落体中段', T: TOTAL * 0.35 },
    { name: '撞底后弹跳中', T: TOTAL * 0.82 },
    { name: '几乎播完',     T: TOTAL * 0.995 }
  ];
  let worst = 0, worstWhere = '';
  for (const cut of CUTS) {
    const runs = SPLITS.map(n => runChunked(P, cut.T, n));
    const base = runs[0].pose;
    assert.ok(base, cut.name + '：这个时刻动画应该还在跑（切点选错了，断言会恒真）');
    for (let i = 1; i < runs.length; i++) {
      const p = runs[i].pose;
      assert.ok(p, cut.name + ' 切 ' + SPLITS[i] + ' 段之后动画就没了');
      for (const k of ['dy', 'sx', 'sy', 't']) {
        const d = Math.abs(p[k] - base[k]);
        if (d > worst) { worst = d; worstWhere = cut.name + '/' + k + '/' + SPLITS[i] + '段'; }
        // 1e-9 只留给浮点加法的累积误差（实测 ~1e-14）。任何**逻辑上**的 dt 依赖
        // （欧拉积分：同一段切 1 次 vs 17 次差 0.0x～0.x 格）都远远越过这条线。
        assert.ok(d < 1e-9,
          '⭐⭐ dt 不幂等！' + cut.name + '：1 段推进的 ' + k + '=' + base[k] +
          '，' + SPLITS[i] + ' 段推进的 ' + k + '=' + p[k] + '（差 ' + d + '）' +
          ' —— 掉帧会让落子动画走偏，且只在卡顿时复现');
      }
    }
    // 事件同样免疫切分：'land' 恰好发一次（多发 = 落定音连响，少发 = 没声音）
    for (let i = 0; i < runs.length; i++) {
      const want = cut.T >= Fx.planDrop(Fx.fallForRow(0)).tf ? 1 : 0;
      assert.strictEqual(runs[i].lands, want,
        cut.name + ' 切 ' + SPLITS[i] + ' 段时 land 事件发了 ' + runs[i].lands + ' 次（应为 ' + want + '）');
    }
  }
  console.log('test-fx: ⭐⭐ step 对 dt 幂等 —— 1/3/17 段不等长推进，最大偏差 ' +
    worst.toExponential(2) + '（' + (worstWhere || '无') + '），门槛 1e-9 OK');
}

// ═══ 4. 总时长在预算内 ═══
// 一局落 20 次子：太长 = 黏；太短 = 看不见（等于白做）。
{
  const durs = ROWS.map(r => Fx.dropDuration(Fx.fallForRow(r)));
  for (let r = 0; r < ROWS.length; r++) {
    assert.ok(durs[r] >= 120 && durs[r] <= 420,
      'r=' + r + ' 的下落总时长 ' + Math.round(durs[r]) + ' ms 不在 120..420 预算内');
  }
  // 掉得越深越久（不是「越深越快」也不是恒定）——加速下落的直接可观察后果
  for (let r = 1; r < ROWS.length; r++) {
    assert.ok(durs[r - 1] > durs[r], '第 ' + (r - 1) + ' 行应比第 ' + r + ' 行掉得久（掉得更深）');
  }
  // 自由落体应占大头：弹跳段只是余韵，别喧宾夺主
  const pl = Fx.planDrop(Fx.fallForRow(0));
  assert.ok(pl.tb < pl.tf * 0.6, '弹跳段 ' + Math.round(pl.tb) + ' ms 相对自由落体 ' +
    Math.round(pl.tf) + ' ms 太长了（尾巴甩过头）');
  console.log('test-fx: 时长预算 OK —— 各行 ' + durs.map(d => Math.round(d)).join('/') +
    ' ms（自由落体 ' + Math.round(pl.tf) + ' + 弹跳 ' + Math.round(pl.tb) + '）');
}

// ═══ 5. land 事件：⭐ 在**撞底那一瞬**发，不是动画播完才发 ═══
{
  Fx.reset();
  Fx.start('drop', { c: 5, r: 2, player: 1 });
  const plan = Fx.planDrop(Fx.fallForRow(2));
  let t = 0, landAt = -1;
  while (!Fx.done()) {
    const evs = Fx.step(4);
    t += 4;
    for (const e of evs) if (e.type === 'land') {
      assert.strictEqual(landAt, -1, 'land 事件只许发一次');
      assert.strictEqual(e.c, 5); assert.strictEqual(e.r, 2); assert.strictEqual(e.player, 1);
      landAt = t;
    }
    assert.ok(t < 5000, '动画没有在有限时间内结束（死循环兜底）');
  }
  assert.ok(landAt >= plan.tf && landAt < plan.tf + 8,
    'land 事件应在自由落体结束（' + Math.round(plan.tf) + ' ms）那一瞬发，实测 ' + landAt + ' ms');
  assert.ok(landAt < plan.total - 20,
    '⭐ land 事件不许等到弹跳余韵播完（' + Math.round(plan.total) + ' ms）才发 —— 那是音画不同步');
  console.log('test-fx: land 事件在 ' + landAt + ' ms 发（落体 ' + Math.round(plan.tf) +
    ' / 全程 ' + Math.round(plan.total) + '）OK');
}

// ═══ 6. `done()` 之后再 step 不许把 pose 弄坏 ═══
{
  Fx.reset();
  Fx.start('drop', P);
  let guard = 0;
  while (!Fx.done() && guard++ < 2000) Fx.step(16);
  assert.ok(Fx.done() && Fx.active() === 0, '播完之后必须 done（⇒ main 的 rAF 停下来，别空转烧电）');
  const after = [];
  for (let i = 0; i < 5; i++) {
    const evs = Fx.step(16 * (i + 1));
    assert.deepStrictEqual(evs, [], 'done 之后 step 不许再发事件');
    after.push(Fx.pose().length);
  }
  assert.deepStrictEqual(after, [0, 0, 0, 0, 0], 'done 之后 pose 必须恒为空数组');
  assert.strictEqual(Fx.done(), true, 'done 之后再 step 仍然 done');
  // 负 dt / NaN dt（切后台回来 ts 倒退）不许把在飞的那枚弄坏
  Fx.reset();
  Fx.start('drop', P);
  Fx.step(50);
  const before = Fx.pose()[0].t;
  Fx.step(-100); Fx.step(NaN); Fx.step(undefined);
  assert.strictEqual(Fx.pose()[0].t, before, '负 dt / NaN dt 必须当 0（⛔ 不许让时间倒流）');
  Fx.reset();
  console.log('test-fx: done 之后 step 安全 / 负 dt 与 NaN dt 安全 OK');
}

// ═══ 7. 多枚同时在飞（⛔ 动画期间不许锁输入的直接后果）═══
// 本仓铁律（casual-game-meta §6）：落子动画期间点击必须照常生效 ⇒ 第二手会在第一手还在飞的
// 时候进来。fx 必须扛得住（⛔ 不是「忽略第二手」也不是「把第一手掐掉」）。
// ⚠ 「第二手真的落到盘上了没有」是 e2e-p2b.cjs 用真实鼠标测的，这里只保证 fx 这一侧不拦。
{
  Fx.reset();
  Fx.start('drop', { c: 3, r: 0, player: 0 });
  Fx.step(60);
  Fx.start('drop', { c: 4, r: 0, player: 1 });      // 第一手还在飞，第二手进来
  assert.strictEqual(Fx.active(), 2, '两枚必须能同时在飞（⛔ 后来的不许把前面的顶掉）');
  Fx.step(30);
  const ps = Fx.pose();
  assert.strictEqual(ps.length, 2);
  assert.ok(ps[0].t > ps[1].t, '两枚各有各的时钟（先起的那枚走得更远）');
  assert.ok(ps[0].c === 3 && ps[1].c === 4 && ps[1].player === 1, 'pose 与各自的参数对得上');
  assert.ok(Fx.poseAt(4, 0) && Fx.poseAt(4, 0).player === 1, 'poseAt 找得到（render 靠它跳过静态那一枚）');
  assert.strictEqual(Fx.poseAt(0, 0), null, 'poseAt 对没在飞的格子返回 null');
  // 同一格重复 start（撤销后立刻重下同列）⇒ 不许叠两枚
  Fx.start('drop', { c: 4, r: 0, player: 1 });
  assert.strictEqual(Fx.active(), 2, '同一格重复 start 不许叠');
  // 上限：连点也不许攒出一堆
  for (let c = 0; c < 7; c++) Fx.start('drop', { c: c, r: 1, player: 0 });
  assert.ok(Fx.active() <= Fx.MAX_ACTIVE, '在飞的棋子数必须封顶（实测 ' + Fx.active() + '）');
  Fx.reset();
  console.log('test-fx: 多枚同时在飞 OK（⛔ 动画不锁输入 ⇒ 这是常态不是异常）');
}

// ════════════════════════════════════════
// 以下是 P2b Task 3（赢局那 3 秒 + 结算节奏，DESIGN §6.3 最后一段 + §6.5）。
// 这一段守的三句话：
//   ⭐ 连线**逐段**画出、四枚**依次**点亮（⛔ 不是一次性全出 —— 那 P2a 就有了）
//   ⭐ 时间**放慢**半秒（⛔ 不是卡住：速率恒 > 0，每一帧棋子都在动）
//   ⭐ 庆祝 ~1.5 s 就结束（§6.5 是红线：结算超过 5 秒 = 打断节奏）
// ⚠ 「画布上那条线真的在变长」只有 e2e-p2b 量得了（这里量的是曲线，不是像素）。
// ════════════════════════════════════════
const LINE = [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 3, r: 3 }];

// ═══ 9. win pose 的形状 / 非法参数 fail-safe ═══
{
  Fx.reset();
  assert.strictEqual(Fx.poseWin(), null, '没有庆祝在跑时 poseWin() 必须是 null');
  assert.strictEqual(Fx.winTotal(), 0, '没有庆祝在跑时 winTotal() 必须是 0');
  const BAD = [
    ['line 缺省', {}],
    ['line 只有一格', { line: [{ c: 0, r: 0 }] }],
    ['line 里有 NaN', { line: [{ c: 0, r: NaN }, { c: 0, r: 1 }] }],
    ['line 不是数组', { line: 'nope' }],
    ['params 为 null', null]
  ];
  for (const [why, bad] of BAD) {
    assert.strictEqual(Fx.start('win', bad), null, '非法连线必须返回 null：' + why);
    assert.ok(Fx.done(), '非法 start(win) 不许留下半个 item：' + why);
  }
  const id = Fx.start('win', { line: LINE });
  assert.ok(id > 0 && !Fx.done(), 'start(win) 应返回 id 且 done() 变 false');
  const w = Fx.poseWin();
  assert.strictEqual(w.kind, 'win');
  for (const k of ['dim', 'prog', 't', 'total', 'lead']) {
    assert.ok(Number.isFinite(w[k]), 'winPose.' + k + ' 必须是有限数');
  }
  assert.strictEqual(w.lit.length, 4, 'lit 必须每枚一个');
  assert.ok(w.lit.every(Number.isFinite), 'lit 里不许有 NaN（会把整条线画没）');
  // 两种写法都收（与 render.normLine 同一条约定）
  Fx.reset();
  assert.ok(Fx.start('win', { line: [[3, 0], [3, 1], [3, 2], [3, 3]] }) > 0, '[[c,r]] 写法也要收');
  assert.deepStrictEqual(Fx.poseWin().line[2], { c: 3, r: 2 });
  // 一局只许有一个庆祝（⛔ 别叠两条线）
  Fx.start('win', { line: LINE });
  assert.strictEqual(Fx.active(), 1, '重复 start(win) 不许叠出两个庆祝');
  Fx.reset();
  console.log('test-fx: win pose 形状 / 非法连线 fail-safe OK');
}

// ═══ 10. ⭐ 逐段画出 + 依次点亮（⛔ 不是一次性全出）═══
{
  Fx.reset();
  Fx.start('win', { line: LINE });
  const total = Fx.winTotal();
  const trace = [];
  for (let t = 0; t <= total; t += 8) {
    Fx.reset(); Fx.start('win', { line: LINE }); Fx.step(t);
    const w = Fx.poseWin() || { prog: 1, lit: [1, 1, 1, 1], dim: Fx.DIM_MAX, t: total };
    trace.push(w);
  }
  // 10a. prog 单调不减、从 0 起、到 1 止 —— 「可见长度在增长」的曲线侧真值
  for (let i = 1; i < trace.length; i++) {
    assert.ok(trace[i].prog >= trace[i - 1].prog - 1e-12,
      '⭐ 连线长度倒退了：t 序号 ' + i + ' prog ' + trace[i - 1].prog + ' → ' + trace[i].prog);
  }
  assert.strictEqual(trace[0].prog, 0, '⭐ 第一帧连线长度必须是 0（⛔ 不许一上来就整条画好）');
  assert.strictEqual(trace[trace.length - 1].prog, 1, '播完之后连线必须是整条');
  // ⛔ 反向对照：中段必须**真的**处在「画了一半」——否则「逐段」只是个名字
  const mids = trace.filter(w => w.prog > 0.15 && w.prog < 0.85);
  assert.ok(mids.length >= 8,
    '⭐ 至少要有 8 帧处在「画了一部分」的中间态（实测 ' + mids.length + ' 帧）—— ' +
    '⛔ 一次性全出的实现在这里恒为 0');
  // 10b. 四枚**依次**点亮：起亮时刻严格错开，且顺序与连线方向一致
  const litAt = [0, 1, 2, 3].map(i => {
    for (const w of trace) if (w.lit[i] > 0) return w.t;
    return Infinity;
  });
  for (let i = 1; i < 4; i++) {
    assert.ok(litAt[i] > litAt[i - 1] + 40,
      '⭐ 第 ' + i + ' 枚与第 ' + (i - 1) + ' 枚点亮时刻只差 ' + (litAt[i] - litAt[i - 1]).toFixed(0) +
      ' ms —— 太近就是「一起亮」，⛔ 不是依次点亮');
  }
  // 播完时四枚必须**全亮**（⛔ 别停在「最后一枚还半亮」那一帧）
  const end = trace[trace.length - 1];
  assert.deepStrictEqual(end.lit, [1, 1, 1, 1], '播完时四枚必须精确全亮，实测 ' + JSON.stringify(end.lit));
  assert.strictEqual(end.dim, Fx.DIM_MAX, '播完时变暗必须精确到位（静态帧接上去不许跳）');
  assert.ok(trace[0].dim === 0, '第一帧不许已经是暗的（变暗要渐入，⛔ 不是一帧切黑）');
  Fx.reset();
  console.log('test-fx: ⭐ 连线逐段画出（中间态 ' + mids.length + ' 帧）+ 四枚依次点亮 at ' +
    litAt.map(v => Math.round(v)).join('/') + ' ms OK');
}

// ═══ 11. ⭐ 时间放慢半秒 —— 且 ⛔ 不是「卡住」 ═══
{
  // 11a. Φ 与 Φ⁻¹ 真的互逆（lead 全靠 Φ⁻¹ 算，错了就是「线比棋子先到」）
  let worst = 0;
  for (let u = 0; u <= 900; u += 3) {
    const back = Fx.warpInv(Fx.warpInt(u));
    worst = Math.max(worst, Math.abs(back - u));
  }
  assert.ok(worst < 1e-6, 'Φ⁻¹(Φ(u)) 最大偏差 ' + worst + '，慢放窗口的时间折算是错的');
  // 11b. ⛔ 放慢 ≠ 暂停：速率恒 > 0，且窗口之外恒 = 1
  for (let u = 0; u <= 900; u += 5) {
    const s = Fx.slowScale(u);
    assert.ok(s >= Fx.SLOW_MIN && s <= 1, 'u=' + u + ' 速率 ' + s + ' 越界');
  }
  assert.strictEqual(Fx.slowScale(Fx.SLOW_HOLD + Fx.SLOW_RAMP + 1), 1, '慢放窗口结束后必须恢复 1.0×');
  // 11c. ⭐ 同一枚棋子：有庆祝时**落地明显更晚**（这就是「时间放慢」的可观察后果）
  const landOf = (withWin) => {
    Fx.reset();
    Fx.start('drop', { c: 3, r: 0, player: 0 });
    if (withWin) Fx.start('win', { line: LINE });
    let t = 0, land = -1, minStepDy = Infinity, prev = null;
    for (let i = 0; i < 500 && land < 0; i++) {
      const evs = Fx.step(16); t += 16;
      const p = Fx.pose().find(x => x.kind === 'drop');
      if (p && prev !== null) minStepDy = Math.min(minStepDy, p.dy - prev);   // 每帧下落量（格）
      if (p) prev = p.dy;
      for (const e of evs) if (e.type === 'land') land = t;
    }
    Fx.reset();
    return { land: land, minStepDy: minStepDy };
  };
  const fast = landOf(false), slow = landOf(true);
  assert.ok(slow.land > fast.land * 1.4,
    '⭐ 时间没有真的放慢：正常落地 ' + fast.land + ' ms，赢局时 ' + slow.land + ' ms（应显著更久）');
  assert.ok(slow.land < fast.land * 2.6,
    '慢放过头了（正常 ' + fast.land + ' → 赢局 ' + slow.land + ' ms）：那不是慢动作，是黏住');
  // ⛔ 每一帧都还在往下走 —— 「卡住 / 掉帧」的实现在这里会给出 0
  assert.ok(slow.minStepDy > 0.005,
    '⛔ 慢放期间出现了「一帧没动」（最小单帧位移 ' + slow.minStepDy.toFixed(5) +
    ' 格）—— 玩家会读成掉帧，不是慢动作');
  console.log('test-fx: ⭐ 时间放慢 OK —— 落地 ' + fast.land + ' → ' + slow.land +
    ' ms（' + (slow.land / fast.land).toFixed(2) + '×），最慢 ' + Fx.SLOW_MIN +
    '× 且每帧都在动（最小单帧 ' + slow.minStepDy.toFixed(3) + ' 格）');
}

// ═══ 12. ⭐⭐ 慢放之后 `step()` 仍然对 dt 幂等 ═══
// ⛔ 这条是本 task 最容易翻车的地方：慢放天然想写成「t += dt * scale(t)」，那就是欧拉积分，
//    一掉帧棋子就落在别处。⇒ 同一段总时长切 1 / 3 / 17 段，drop 与 win 的 pose 必须逐位一致。
{
  const SPLITS = [1, 3, 17];
  const run = (T, n) => {
    Fx.reset();
    Fx.start('drop', { c: 3, r: 0, player: 0 });
    Fx.start('win', { line: LINE });
    const evs = [];
    for (const dt of chunks(T, n)) for (const e of Fx.step(dt)) evs.push(e.type);
    const all = Fx.pose();
    const out = {
      drop: all.find(p => p.kind === 'drop') || null,
      win: all.find(p => p.kind === 'win') || null,
      evs: evs.sort()
    };
    Fx.reset();
    return out;
  };
  const WT = Fx.reset() || (function () { Fx.start('win', { line: LINE }); const t = Fx.winTotal(); Fx.reset(); return t; })();
  const CUTS = [
    { name: '慢放最慢那一段', T: 120 },
    { name: '慢放回弹中',     T: 380 },
    { name: '连线画到一半',   T: WT * 0.72 },
    { name: '几乎播完',       T: WT * 0.995 }
  ];
  let worst = 0, where = '';
  for (const cut of CUTS) {
    const runs = SPLITS.map(n => run(cut.T, n));
    const base = runs[0];
    for (let i = 1; i < runs.length; i++) {
      assert.deepStrictEqual(runs[i].evs, base.evs,
        cut.name + '：切 ' + SPLITS[i] + ' 段之后事件不一样了（' + JSON.stringify(runs[i].evs) + '）');
      for (const kind of ['drop', 'win']) {
        const a = base[kind], b = runs[i][kind];
        assert.strictEqual(!!a, !!b, cut.name + '：切 ' + SPLITS[i] + ' 段之后 ' + kind + ' 在不在都变了');
        if (!a) continue;
        const keys = kind === 'drop' ? ['dy', 'sx', 'sy', 't'] : ['prog', 'dim', 't'];
        for (const k of keys) {
          const d = Math.abs(a[k] - b[k]);
          if (d > worst) { worst = d; where = cut.name + '/' + kind + '.' + k + '/' + SPLITS[i] + '段'; }
          assert.ok(d < 1e-9, '⭐⭐ 慢放之后 dt 不幂等！' + cut.name + ' ' + kind + '.' + k +
            '：1 段 = ' + a[k] + '，' + SPLITS[i] + ' 段 = ' + b[k] + '（差 ' + d + '）');
        }
        if (kind === 'win') for (let j = 0; j < 4; j++) {
          assert.ok(Math.abs(a.lit[j] - b.lit[j]) < 1e-9, cut.name + ' lit[' + j + '] 不幂等');
        }
      }
    }
  }
  console.log('test-fx: ⭐⭐ 慢放之后仍然 dt 幂等（最大偏差 ' + worst.toExponential(2) +
    '，' + (where || '无') + '）OK');
}

// ═══ 13. ⭐ 结算节奏：庆祝 ~1.5 s（DESIGN §6.5 红线）═══
{
  const budgets = ROWS.map(r => {
    Fx.reset();
    Fx.start('drop', { c: 3, r: r, player: 0 });     // 赢的那一枚还在飞（真实场景）
    Fx.start('win', { line: LINE });
    const t = Fx.winTotal();
    Fx.reset();
    return t;
  });
  for (let r = 0; r < budgets.length; r++) {
    assert.ok(budgets[r] <= 1500,
      '⭐ r=' + r + ' 的庆祝 ' + Math.round(budgets[r]) + ' ms 超过 §6.5 的「~1.5 s」预算');
    assert.ok(budgets[r] >= 700,
      'r=' + r + ' 的庆祝只有 ' + Math.round(budgets[r]) + ' ms —— 短到看不清赢在哪，等于白做');
  }
  // ⭐ lead 是**算出来**的：掉得越深、等得越久（写死一个常数在这里会红）
  for (let r = 1; r < budgets.length; r++) {
    assert.ok(budgets[r - 1] > budgets[r],
      '第 ' + (r - 1) + ' 行赢的那手应比第 ' + r + ' 行等得久（棋子掉得更深）：' +
      Math.round(budgets[r - 1]) + ' vs ' + Math.round(budgets[r]) + ' ms');
  }
  // 没有棋子在飞时（减弱动态兜底 / 撤销后重放）也得有个起手拍，不许 lead=0
  Fx.reset(); Fx.start('win', { line: LINE });
  assert.ok(Fx.poseWin().lead >= Fx.WIN_LEAD_MIN, '没棋子在飞时 lead 也不许是 0');
  Fx.reset();
  console.log('test-fx: ⭐ 庆祝时长 ' + budgets.map(b => Math.round(b)).join('/') +
    ' ms（§6.5 预算 ≤1500）OK');
}

// ═══ 14. ⭐ 双威胁的专属特效（P2b T5 · DESIGN §6.4 下半）═══
// 三件事：① 光环与那枚棋子**落地对齐**（lead 是算出来的）；② 'fork' 事件恰好发一次且
// 对 dt 的切分免疫；③ 曲线是闭式的 ⇒ 切 1/3/17 段结果逐位一致。
const FORK_CELLS = [{ c: 1, r: 0 }, { c: 5, r: 0 }];
{
  // ① lead = 那枚棋子还差多久落地（⛔ 写死一个数就是音画不同步）
  const leadOf = r => {
    Fx.reset();
    Fx.start('drop', { c: 3, r: r, player: 0 });
    Fx.start('fork', { cells: FORK_CELLS, player: 0 });
    const p = Fx.poseFork();
    Fx.reset();
    return p.lead;
  };
  const leads = ROWS.map(leadOf);
  for (let r = 1; r < leads.length; r++) {
    assert.ok(leads[r - 1] > leads[r],
      '第 ' + (r - 1) + ' 行的 lead 应比第 ' + r + ' 行长（掉得更深）：' + r2(leads[r - 1]) + ' vs ' + r2(leads[r]));
  }
  // 与自由落体时长对得上（⭐ 就是「等它撞底」，不是随便一个数）
  for (const r of ROWS) {
    assert.ok(Math.abs(leads[r] - Fx.planDrop(Fx.fallForRow(r)).tf) < 1e-9,
      'lead 与自由落体时长对不上（r=' + r + '）');
  }
  // 没有棋子在飞（撤销后重放 / 减弱动态兜底）⇒ lead = 0，立刻炸开
  Fx.reset(); Fx.start('fork', { cells: FORK_CELLS, player: 0 });
  assert.strictEqual(Fx.poseFork().lead, 0, '没棋子在飞时该立刻炸开');
  const total0 = Fx.poseFork().total;
  Fx.reset();
  assert.ok(total0 > 300 && total0 < 900,
    '⚠ 这是**局中**特效不是结算：' + Math.round(total0) + ' ms 超出「短促」的范围（300..900）');
  console.log('test-fx: ⭐ 双威胁 lead = ' + leads.map(v => Math.round(v)).join('/') +
    ' ms（= 那枚棋子撞底的时刻），总时长 ' + Math.round(total0) + ' ms OK');
}
{
  // ② 'fork' 事件恰好发一次 + ③ dt 幂等（切 1/3/17 段）
  const run = (T, n) => {
    Fx.reset();
    Fx.start('drop', { c: 3, r: 0, player: 0 });
    Fx.start('fork', { cells: FORK_CELLS, player: 0 });
    let forks = 0;
    for (const dt of chunks(T, n)) for (const e of Fx.step(dt)) if (e.type === 'fork') forks++;
    const p = Fx.poseFork();
    const out = { forks: forks, pose: p ? { rings: p.rings.slice(), flash: p.flash, t: p.t } : null };
    Fx.reset();
    return out;
  };
  Fx.reset();
  Fx.start('drop', { c: 3, r: 0, player: 0 });
  Fx.start('fork', { cells: FORK_CELLS, player: 0 });
  const FTOTAL = Fx.poseFork().total, FLEAD = Fx.poseFork().lead;
  Fx.reset();
  let worst = 0;
  for (const cut of [{ n: '炸开前一瞬', T: FLEAD * 0.9 }, { n: '第一圈刚起', T: FLEAD + 40 },
                     { n: '两圈都在散', T: FLEAD + Fx.FORK_GAP + Fx.FORK_RING * 0.5 },
                     { n: '几乎播完', T: FTOTAL * 0.995 }]) {
    const runs = [1, 3, 17].map(n => run(cut.T, n));
    for (let i = 1; i < runs.length; i++) {
      assert.strictEqual(runs[i].forks, runs[0].forks,
        cut.n + '：切段数一变，fork 事件次数就变了（' + runs[0].forks + ' vs ' + runs[i].forks + '）');
      assert.strictEqual(!!runs[i].pose, !!runs[0].pose, cut.n + '：pose 在不在都变了');
      if (!runs[0].pose) continue;
      for (const k of ['flash', 't']) {
        const d = Math.abs(runs[0].pose[k] - runs[i].pose[k]);
        worst = Math.max(worst, d);
        assert.ok(d < 1e-9, '⭐⭐ fork 的 ' + k + ' 对 dt 不幂等（' + cut.n + '，差 ' + d + '）');
      }
      for (let j = 0; j < runs[0].pose.rings.length; j++) {
        const d = Math.abs(runs[0].pose.rings[j] - runs[i].pose.rings[j]);
        worst = Math.max(worst, d);
        assert.ok(d < 1e-9, '⭐⭐ fork 的 rings[' + j + '] 对 dt 不幂等（' + cut.n + '）');
      }
    }
    // 炸开之前一次都不许发，之后恰好一次
    assert.strictEqual(runs[0].forks, cut.T < FLEAD ? 0 : 1,
      cut.n + '：'+ (cut.T < FLEAD ? '棋子还没落地就先响了' : "'fork' 事件不是恰好一次") +
      '（发了 ' + runs[0].forks + ' 次）');
  }
  console.log('test-fx: ⭐ fork 事件恰好一次、且切 1/3/17 段逐位一致（最大偏差 ' +
    worst.toExponential(2) + '）OK');
}
{
  // 参数校验：少于两个落点 / 越界 / 坏数 ⇒ **什么都不做**（⛔ 别带着 NaN 去画）
  const bad = [undefined, {}, { cells: [] }, { cells: [{ c: 1, r: 0 }] },
               { cells: [{ c: 1, r: 0 }, { c: 7, r: 0 }] },
               { cells: [{ c: 1, r: 0 }, { c: 5, r: 6 }] },
               { cells: [{ c: 1, r: 0 }, { c: NaN, r: 0 }] }];
  for (const q of bad) {
    Fx.reset();
    assert.strictEqual(Fx.start('fork', q), null, '坏参数必须返回 null：' + JSON.stringify(q));
    assert.strictEqual(Fx.poseFork(), null, '坏参数不许留下 item：' + JSON.stringify(q));
  }
  // 同时只许有一个（⛔ 别叠两圈光环）
  Fx.reset();
  Fx.start('fork', { cells: FORK_CELLS, player: 0 });
  Fx.start('fork', { cells: [{ c: 0, r: 0 }, { c: 2, r: 0 }], player: 1 });
  assert.strictEqual(Fx.pose().filter(p => p.kind === 'fork').length, 1, '同时只许有一个 fork 动画');
  assert.strictEqual(Fx.poseFork().player, 1, '后起的那个说了算');
  // pose() 里混着三种 kind —— 调用方按 kind 分流，⛔ 别让 fork 被当成 drop 画到 L.center(undefined)
  Fx.start('drop', { c: 3, r: 0, player: 0 });
  Fx.start('win', { line: LINE });
  const kinds = Fx.pose().map(p => p.kind).sort();
  assert.deepStrictEqual(kinds, ['drop', 'fork', 'win'], 'pose() 应同时给出三种：' + kinds);
  Fx.reset();
  assert.strictEqual(Fx.poseFork(), null, 'reset 之后必须一个不剩');
  console.log('test-fx: fork 参数校验 / 只留一个 / 三种 kind 分流 OK');
}

// ═══ 8. 冻结：⛔ 别被「不报错只是不动了」的误用改掉 ═══
{
  const orig = Fx.step;
  try { Fx.step = () => {}; } catch (e) {}
  assert.strictEqual(Fx.step, orig, 'C4Fx 必须冻结（`C4Fx.step = () => {}` 不报错、只是动画静默死掉）');
  console.log('test-fx: API 冻结 OK');
}

console.log('test-fx: 全部通过（下落 ' + r2(TOTAL) + ' ms，dt 幂等，落点精确）');
