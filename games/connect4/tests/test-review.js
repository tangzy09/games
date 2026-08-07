// ════════════════════════════════════════
// test-review.js —— 判分层的门禁（P3 Task 1 · DESIGN §4 / §3.3）。
//
// review.js 是 P3 的地基：**每一手打一个标签**（最优/次优/失误/败招）⇒ 一局一个精准度 %，
// 而 §4 白纸黑字说「必须先有分数模型，否则半个元游戏层是空转的」。
//
// ⭐⭐ 本文件钉死的核心口径：**判据是「胜负态」，不是分差。**
//   solver 的分数约定是 `>0 必胜 / =0 和 / <0 必败`，`|score|` 只表示分出胜负的**早晚**。
//   ⇒ |score| 差 1 只是「晚一子赢」，那不是错误；而「必胜→和」哪怕分差只有 1，
//     也是**把整局送掉了**。⛔ 按分差扣分会把这两件事判反 —— 这条有反向对照断言（③④）。
//
// ⚠ 全部用**手摆的 scoreAll 结果**当输入，⛔ 一次都不真调求解器：
//   真调的话测的是求解器（P1 已经有它自己的门禁），而不是判分口径本身。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RV = require('../js/review.js');

// ─────────── ① 四种标签各一条 ───────────
// ⚠ scoreAll 的键**是字符串**（solver.js 明写：Object.keys 拿到的是 '3' 不是 3）——
//   下面一律用对象字面量，正好走的就是产品里那条路。
{
  assert.strictEqual(RV.labelOf({ 3: 5 }, 3), 'best', '唯一的列就是最优');
  assert.strictEqual(RV.labelOf({ 3: 5, 4: 3 }, 4), 'good',
    '同为必胜、只是赢得慢一点 ⇒ 次优（⛔ 不是失误：晚一子赢不是错误）');
  assert.strictEqual(RV.labelOf({ 3: 5, 4: 0 }, 4), 'slip', '必胜→和 = 掉一档');
  assert.strictEqual(RV.labelOf({ 3: 5, 4: -3 }, 4), 'loss', '必胜→必败 = 掉两档');
  assert.strictEqual(RV.labelOf({ 3: 0, 4: -3 }, 4), 'slip', '和→必败 = 掉一档');
  console.log('test-review: ① 四种标签（best/good/slip/loss）OK');
}

// ─────────── ② ⭐ 并列最优**全部**算 best ───────────
// ⛔ 只认第一个 = 把一半的好手判成次优，而精准度是玩家看得见的数字。
{
  assert.strictEqual(RV.labelOf({ 3: 5, 4: 5 }, 3), 'best');
  assert.strictEqual(RV.labelOf({ 3: 5, 4: 5 }, 4), 'best', '⭐ 并列最优的第二列也必须是 best');
  assert.strictEqual(RV.labelOf({ 0: 2, 3: 2, 6: 2 }, 6), 'best', '三列并列，最后一列同样 best');
  console.log('test-review: ② 并列最优全部算 best OK');
}

// ─────────── ③ ⭐⭐ 必败局面里**零扣分**（反向对照，钉死「不按分差」）───────────
// §4 那句「你输了，但这局精准度 91%，是你的新高」能成立的**前提**就是这一条：
// 你不该因为对手完美而被判失误。
{
  const sa = { 0: -5, 1: -9, 3: -3, 6: -13 };
  for (const c of [0, 1, 3, 6]) {
    const lb = RV.labelOf(sa, c);
    assert.ok(lb === 'best' || lb === 'good',
      '⭐⭐ 必败局面里走第 ' + c + ' 列被判成了 ' + lb +
      ' —— 已经输定了，任何一手都不该扣分（否则 §4 的「输了也能创纪录」整条不成立）');
  }
  // ⚠ 反过来也要成立：这里分差高达 10，若实现是「按分差扣分」，上面必然出现 slip/loss
  //   ⇒ 这一条同时是「⛔ 别改成按分差扣分」的守卫。
  assert.strictEqual(RV.labelOf(sa, 3), 'best', '必败局面里输得最慢的那列是 best');
  console.log('test-review: ③ ⭐⭐ 必败局面零扣分（分差 10 也不扣）OK');
}

// ─────────── ④ ⭐ 必胜局面里分差再小也算掉档 ───────────
// 与③配对：证明判据真的是「胜负态」而不是「分差大小」。
{
  assert.strictEqual(RV.labelOf({ 3: 1, 4: 0 }, 4), 'slip',
    '⭐ 分差只有 1，但必胜→和 = 把整局送掉了 ⇒ 必须是 slip');
  assert.strictEqual(RV.labelOf({ 3: 21, 4: 13 }, 4), 'good',
    '⭐ 分差高达 8，但同为必胜 ⇒ 只是次优');
  console.log('test-review: ④ ⭐ 掉档看胜负态、不看分差大小（两条反向对照）OK');
}

// ─────────── ⑤ accuracyOf：空 ⇒ null（⛔ 不是 0）───────────
// 红线：「没算过」与「0 分」在 UI 上长得一模一样 ⇒ 必须能区分，否则求解器死了会显示
// 一个理直气壮的 0%，而那正是 §2.4 说的「谎报真值」。
{
  assert.strictEqual(RV.accuracyOf([]), null, '⛔ 空 ⇒ null（不是 0）');
  assert.strictEqual(RV.accuracyOf(null), null, '⛔ null 输入 ⇒ null（不许抛，调用方就是「还没算」）');
  assert.strictEqual(RV.accuracyOf([{ ply: 0, side: 0, label: 'best' }]), 100);
  assert.strictEqual(RV.accuracyOf([{ ply: 0, side: 0, label: 'loss' }]), 0,
    '真的 0 分要算得出来 —— 它与 null 是两件事');
  console.log('test-review: ⑤ accuracyOf 空 ⇒ null、真 0 分 ⇒ 0 OK');
}

// ─────────── ⑥ ⭐ 只统计一方的手 ───────────
// ⛔ 把 AI 的手混进玩家的精准度 = 这个数字失去全部意义。
{
  const labels = [
    { ply: 0, side: 0, label: 'best' },   // 玩家
    { ply: 1, side: 1, label: 'loss' },   // AI（不该算进玩家）
    { ply: 2, side: 0, label: 'best' },
    { ply: 3, side: 1, label: 'loss' }
  ];
  assert.strictEqual(RV.accuracyOf(labels, { side: 0 }), 100, '⭐ 只看 side=0 ⇒ 两手全 best ⇒ 100');
  assert.strictEqual(RV.accuracyOf(labels, { side: 1 }), 0, '只看 side=1 ⇒ 两手全 loss ⇒ 0');
  assert.strictEqual(RV.accuracyOf(labels), 50, '不给 side ⇒ 全算（100+0+100+0)/4');
  assert.strictEqual(RV.accuracyOf(labels, { side: 0, skipPlies: [2] }), 100,
    '⭐ skipPlies 剔除指定的手（限时局里时钟代落的那几手要走这条）');
  assert.strictEqual(RV.accuracyOf(labels, { side: 0, skipPlies: [0, 2] }), null,
    '⭐⭐ 剔完之后一手都不剩 ⇒ null（⛔ 不是 0：那会显示成「精准度 0%」）');
  console.log('test-review: ⑥ ⭐ 只统计一方 + skipPlies 剔除 OK');
}

// ─────────── ⑦ ⭐ 转折点 = **第一次**胜负态下滑 ───────────
// §3.3 那句话是「你到第 14 手为止一直是必胜的」—— 它讲的是**故事的转折**，
// ⛔ 不是「扣分最多的那一手」。两者在同一局里经常不是同一手。
{
  const labels = [
    { ply: 0, side: 0, label: 'best', from: 1, to: 1 },
    { ply: 2, side: 0, label: 'slip', from: 1, to: 0 },   // ⭐ 第一次下滑
    { ply: 4, side: 0, label: 'loss', from: 0, to: -1 }   // 掉得更狠，但不是转折点
  ];
  const tp = RV.turningPoint(labels, { side: 0 });
  assert.ok(tp, '应该找得到转折点');
  assert.strictEqual(tp.ply, 2, '⭐ 转折点是**第一次**下滑那一手（ply 2），⛔ 不是掉得最狠的 ply 4');
  assert.strictEqual(tp.from, 1);
  assert.strictEqual(tp.to, 0);

  assert.strictEqual(RV.turningPoint([
    { ply: 0, side: 0, label: 'best', from: 1, to: 1 },
    { ply: 2, side: 0, label: 'good', from: 1, to: 1 }
  ], { side: 0 }), null, '全程没下滑 ⇒ null');

  assert.strictEqual(RV.turningPoint([], { side: 0 }), null, '空 ⇒ null');
  // ⚠ 只看指定一方：对方把局面下滑了不算「你的转折点」
  assert.strictEqual(RV.turningPoint([
    { ply: 1, side: 1, label: 'slip', from: 1, to: 0 }
  ], { side: 0 }), null, '⭐ 对方的下滑不是你的转折点');
  console.log('test-review: ⑦ ⭐ 转折点 = 第一次下滑（不是最狠的那次）OK');
}

// ─────────── ⑧ ⛔ 脏输入 fail-fast ───────────
// 终局局面的 scoreAll 返回 {}（solver.js 明写）——那上面没有「这一手多好」这个问题。
// ⛔ 返回一个标签 = 凭空造了一条不存在的事实。
{
  assert.throws(() => RV.labelOf({}, 3), /终局|没有合法/,
    '⛔ 空 scoreAll（终局）必须抛，不许编一个标签');
  assert.throws(() => RV.labelOf({ 3: 5 }, 4), /没有.*4|不在/,
    '⛔ 落的列不在 scoreAll 里（非法手）必须抛');
  assert.throws(() => RV.labelOf(null, 3), /scoreAll/, '⛔ null 输入必须抛');
  console.log('test-review: ⑧ ⛔ 脏输入 fail-fast OK');
}

// ─────────── ⑨ 计分表导出、且门禁读的就是产品那一份 ───────────
{
  assert.strictEqual(RV.SCORE_OF_LABEL.best, 100);
  assert.strictEqual(RV.SCORE_OF_LABEL.loss, 0);
  assert.ok(RV.SCORE_OF_LABEL.best > RV.SCORE_OF_LABEL.good, '最优必须高于次优');
  assert.ok(RV.SCORE_OF_LABEL.good > RV.SCORE_OF_LABEL.slip, '次优必须高于失误');
  assert.ok(RV.SCORE_OF_LABEL.slip > RV.SCORE_OF_LABEL.loss, '失误必须高于败招');
  assert.ok(Object.isFrozen(RV.SCORE_OF_LABEL), '计分表必须冻结');
  // ⭐ 用导出的表现算一遍，确认 accuracyOf 用的就是它（⛔ 别在实现里写第二份常量）
  const mix = [
    { ply: 0, side: 0, label: 'best' }, { ply: 2, side: 0, label: 'good' },
    { ply: 4, side: 0, label: 'slip' }, { ply: 6, side: 0, label: 'loss' }
  ];
  const want = Math.round((RV.SCORE_OF_LABEL.best + RV.SCORE_OF_LABEL.good +
    RV.SCORE_OF_LABEL.slip + RV.SCORE_OF_LABEL.loss) / 4);
  assert.strictEqual(RV.accuracyOf(mix, { side: 0 }), want,
    '⭐ accuracyOf 必须用导出的那张表算（⛔ 别在实现里再写一份数字）');
  console.log('test-review: ⑨ 计分表导出 + accuracyOf 读同一份 OK');
}

// ─────────── ⑫ ⭐ 提示第一按：数「有几列不输」（P3 T3 · §3.2）───────────
// ⭐⭐ 「不输」= 与最优列**同一个胜负态**。⛔ 不是「分数 ≥ 0」——
//   必败局面里一列都不会 ≥0，那样会说出「0 列不输」这种既吓人又没用的话。
{
  // 必胜局面：3 列都通向必胜，1 列只到和
  let l1 = RV.hintLevel1({ 0: 5, 1: 3, 2: 1, 3: 0 });
  assert.strictEqual(l1.safe, 3, '三列同为必胜 ⇒ 3 列不输');
  assert.strictEqual(l1.total, 4);
  assert.strictEqual(l1.kind, 'win');

  // ⭐ 只有一列不输 —— 这正是「妙手」与「教育价值最高」的那个局面
  l1 = RV.hintLevel1({ 0: -5, 3: 2, 6: -9 });
  assert.strictEqual(l1.safe, 1, '只有一列通向必胜');
  assert.strictEqual(l1.kind, 'only', '⭐ 只有 1 列不输 ⇒ kind=only（第一按最该说的那句话）');

  // ⭐⭐ 必败局面：⛔ 绝不许说成「还有 N 列不输」
  l1 = RV.hintLevel1({ 0: -5, 3: -3, 6: -9 });
  assert.strictEqual(l1.kind, 'lost',
    '⭐⭐ 全部必败 ⇒ kind=lost —— ⛔ 绝不许说「有 N 列不输」（那是谎，§2.4）');
  assert.strictEqual(l1.safe, 3,
    '⚠ 必败局面里三列同为 LOSS ⇒ safe=3。**这个数在 kind=lost 时没有产品含义**，'
    + '⛔ 文案层绝不许把它说成「有 3 列不输」—— 判据是 kind，不是 safe');
  // ⭐⭐ 而第二按必须指「输得最慢」的那一列（-3），⛔ 不是同胜负态里的第一列（-5）
  assert.deepStrictEqual(RV.safeCols({ 0: -5, 3: -3, 6: -9 }), [3],
    '⭐⭐ 必败局面下 safeCols 必须是**分数最高**（输得最慢）的那列 —— '
    + '若按「同胜负态」挑，提示会指出一个**输得最快**的列，而产品的全部卖点就是它不会指错');
  assert.strictEqual(RV.hintLevel2({ 0: -5, 3: -3, 6: -9 }).col, 3,
    '⭐⭐ 必败局面下第二按指的仍是最优（输得最慢）的那列');

  // 和棋局面
  l1 = RV.hintLevel1({ 0: 0, 3: 0, 6: -3 });
  assert.strictEqual(l1.kind, 'draw');
  assert.strictEqual(l1.safe, 2);

  assert.throws(() => RV.hintLevel1({}), /终局/, '⛔ 终局局面上没有「该走哪」这个问题');
  console.log('test-review: ⑫ ⭐ 提示第一按（有几列不输 / 四种 kind）OK');
}

// ─────────── ⑬ ⭐ 提示第二按：理由**机械导出**，只有四条 ───────────
// §3.2：「理由从求解器评分结构**机械导出，不手写解说**。」
{
  const sa = { 0: -5, 3: 2, 6: -9 };
  // 唯一不败的一列 ⇒ 理由恒是 only（⛔ 它压过 fork：那才是这一手真正的分量）
  let h = RV.hintLevel2(sa, { makesFork: true });
  assert.strictEqual(h.col, 3, '第二按指的列必须来自 safeCols（= scoreAll 的最优之一）');
  assert.strictEqual(h.reason, 'only');

  const sa2 = { 0: 5, 3: 5, 6: 1 };
  assert.strictEqual(RV.hintLevel2(sa2, { col: 3, makesFork: true }).reason, 'makeFork');
  assert.strictEqual(RV.hintLevel2(sa2, { col: 3, blocksFork: true }).reason, 'blockFork');
  assert.strictEqual(RV.hintLevel2(sa2, { col: 3 }).reason, 'steady',
    '⚠ 三条都不成立 ⇒ 说「这一列最稳」，⛔ 别硬凑一个听起来聪明的理由（那是手写解说的开始）');

  // ⛔ 指的列**永远**是最优之一 —— 反向对照：给一个次优列，也不许采纳
  const h2 = RV.hintLevel2(sa2, { col: 6 });
  assert.ok([0, 3].indexOf(h2.col) >= 0,
    '⛔ 调用方传了个次优列（6）也不许采纳，实际给了 ' + h2.col + ' —— 提示指错列 = 产品的卖点当场破产');

  assert.deepStrictEqual(RV.safeCols(sa2), [0, 3], 'safeCols 返回全部并列最优');
  console.log('test-review: ⑬ ⭐ 提示第二按（四条机械理由 + 指的列恒最优）OK');
}

// ─────────── ⑭ ⭐ 妙手：只有 1 列不输、而他走的正是那一列（P3 T4 · §3.4）───────────
{
  const only = { 0: -5, 3: 2, 6: -9 };        // 只有第 3 列通向必胜
  assert.strictEqual(RV.isBrilliant(only, 3), true, '⭐ 走对唯一那列 ⇒ 妙手');
  assert.strictEqual(RV.isBrilliant(only, 0), false, '⛔ 走错 ⇒ 不给（反向对照）');
  assert.strictEqual(RV.isBrilliant(only, 6), false, '⛔ 走错 ⇒ 不给');

  // ⛔ 有多列都不输时**不是**妙手 —— 那一手没什么了不起
  assert.strictEqual(RV.isBrilliant({ 0: 5, 3: 5, 6: -1 }, 3), false,
    '⛔ 两列都通向必胜 ⇒ 走对了也不是妙手（§3.4 的价值全在「只有 1 列」）');

  // ⭐⭐ **必败局面里绝不给妙手**（这条最容易被写漏）
  assert.strictEqual(RV.isBrilliant({ 0: -5, 3: -3, 6: -9 }, 3), false,
    '⭐⭐ 必败局面里 safeCols 是「输得最慢」的那列，找到它当然不坏，'
    + '但庆祝成妙手是**谎报**（§2.4）—— 玩家会以为自己下了步好棋，其实局面早就没了');

  // 和棋局面里「只有一列守得住」同样算妙手（守和也是本事）
  assert.strictEqual(RV.isBrilliant({ 0: -5, 3: 0, 6: -9 }, 3), true,
    '和棋局面里唯一守得住的那列 ⇒ 妙手（守和也是本事）');

  // ⭐ 判据必须与 hintLevel1 **是同一个**（⛔ 别另立一套：漂了就会出现
  //   「提示说只有这一列，走了却不给妙手」，而两边看起来都合理）
  for (const sa of [only, { 0: 5, 3: 5 }, { 0: -5, 3: -3 }, { 0: 0, 3: -3 }]) {
    const l1 = RV.hintLevel1(sa);
    const cols = RV.safeCols(sa);
    for (const c of Object.keys(sa).map(Number)) {
      assert.strictEqual(RV.isBrilliant(sa, c),
        l1.kind === 'only' && cols.indexOf(c) >= 0,
        '⭐ isBrilliant 必须恒等于「hintLevel1().kind === only 且落在 safeCols 里」');
    }
  }
  console.log('test-review: ⑭ ⭐ 妙手判据（含必败局面不给 + 与 hintLevel1 同源）OK');
}

// ─────────── ⑩ ⛔⛔ 源码级红线：纯函数，零 IO ───────────
// ⚠ 剥掉注释再查 —— 本文件与 review.js 的注释里都写着这些词，不剥的话恒红。
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'review.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const bad of ['Solver', 'EngineClient', 'Math.random', 'require(', 'fetch', 'localStorage']) {
    assert.ok(code.indexOf(bad) < 0,
      '⛔ review.js 的**代码**里出现了 "' + bad + '" —— 它必须是纯函数：'
      + '判分口径是产品的灵魂，一旦它开始自己去取数据，就没法在 node 里逐条钉死了');
  }
  // ⭐ 反证：剥注释这一步真的做了事（⛔ 否则上面那圈断言可能只是恒真）
  assert.ok(src.indexOf('Solver') >= 0 && code.indexOf('Solver') < 0,
    '剥注释没生效（review.js 的注释里本该有一段解释为什么它不碰 Solver）');
  console.log('test-review: ⑩ ⛔⛔ 源码（剥注释后）零 Solver/IO/随机 OK');
}

// ─────────── ⑪ API 冻结 ───────────
// 与其余模块同一条：挡住 `C4Review.labelOf = () => 'best'` 这类「精准度永远 100%」的误用
// （画面正常、零报错，本仓最怕的失败模式）。
{
  assert.ok(Object.isFrozen(RV), 'API 必须冻结');
  console.log('test-review: ⑪ API 冻结 OK');
}

console.log('test-review: 全部通过');
