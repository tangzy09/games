// ════════════════════════════════════════
// test-ai-determinism.js —— ai.js 的门禁。
//
// ⭐ 本文件的第一职责不是「AI 下得好」，是**守住印在公平页上的那句话**（DESIGN §2.3）：
//
//     aiMove(position, tier, seed) -> column
//     入参里没有玩家历史、没有胜负记录、没有自适应状态 ⇒ 想作弊都没有入口。
//
// 这句话一旦只活在注释里就等于没有。所以下面把它拆成三条**可执行**的断言：
//   ① 不读玩家状态：往全局塞 G / PlayerProfile / 连胜 99 / 大师级存档 ⇒ 逐手不变
//   ② 撤销不改主意：撤销 N 次再重走同一条路 ⇒ 每一手逐手一致（否则被读成「它在偷看我」）
//   ③ 同参数恒等：同 (position, tier, seed) 调 1000 次 ⇒ 同一列；且列表/棋盘两种入参同答案
// 外加 ⛔ 禁 Math.random：源码正则断言 + 把 Math.random 换成抛错函数后整套照跑。
//
// 第二职责是**阶梯不许是假的**（DESIGN §3.1 / §9.2）：
//   · 顶档零失误（对拍求解器）· 低档确实会失误 · 相邻级之间有真实强弱差
//   · ⭐ **低档必须秒出、且根本不调求解器** —— 用独立子进程 + 求解器调用计数器裁决，
//     同一个计数器在高档上必须 > 0（计数器自证有效，不是「我数了个 0」）。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const AI = require('../js/ai.js');
const PRNG = require('../../../engine/prng.js');

const JS_DIR = path.resolve(__dirname, '..', 'js');
const ALL_TIERS = [];
for (let t = AI.TIER_MIN; t <= AI.TIER_MAX; t++) ALL_TIERS.push(t);

// ─────────── 局面工厂 ───────────
// ⚠ 全部走 PRNG（engine/prng.js），⛔ 不用 Math.random：测试自己不确定，就没资格断言确定性。
// ⚠⚠ **深度是被求解器成本逼出来的，不是随便选的**：没装开局库时 n ≤ 9 的一次 scoreAll 是
//    几十分钟（DESIGN §9.2：空盘 35.3 分钟）。本文件**故意不 require book.js**（那是 Task 7
//    的地盘，且软依赖会让门禁的耗时随「库在不在」漂移）⇒ 凡是要调求解器的用例一律用 n ≥ 20
//    的深局面（实测中位 < 2 ms）。低档的用例不受此限，什么深度都秒出。
function randomPositions(n, k, seed, filter) {
  const rnd = PRNG.create(seed);
  const out = [];
  let guard = 0;
  while (out.length < k && guard++ < 300000) {
    let bd = B.newBoard();
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (R.terminal(bd) !== null) { ok = false; break; }
      const ms = R.moves(bd);
      bd = B.play(bd, ms[Math.floor(rnd() * ms.length)]);
    }
    if (!ok || R.terminal(bd) !== null) continue;
    if (filter && !filter(bd)) continue;
    out.push(bd);
  }
  assert.strictEqual(out.length, k, '局面工厂没造够 ' + k + ' 个 n=' + n + ' 的局面（造了 ' + out.length + '）');
  return out;
}
const noMate = bd => R.winningMoves(bd).length === 0;

/** ⭐ **独立**的「不送头的列」真值 —— ⛔ 故意不复用 AI.safeMoves。
 *  变异体测试实锤：第一版拿 AI.safeMoves 当真值去断言「AI 没走送头列」，
 *  于是「把不送头过滤整个删掉」这个变异体让**断言和被测对象一起变**，
 *  那条断言当场退化成同义反复（它最后是被一条「样本里必须出现过送头列」的
 *  充分性守卫误打误撞拦下来的，不是被它该拦的那条拦下来的）。
 *  这里用纯函数 B.play 重写一遍（AI 内部用的是 searchBoard + playIn/undoIn，
 *  两条实现路径不同）⇒ 真正是两个独立的算法在对拍。 */
function oracleSafe(bd) {
  return R.moves(bd).filter(c => R.winningMoves(B.play(bd, c)).length === 0);
}
const searchy = bd => noMate(bd) && oracleSafe(bd).length >= 2;   // 求解器档真会搜的那一类

// AI.safeMoves 自己也必须与这份独立真值逐位相同（它是三条免搜捷径的全部依据）
{
  let n = 0;
  for (const d of [6, 14, 22, 30, 38]) {
    for (const bd of randomPositions(d, 15, 2200 + d)) {
      assert.deepStrictEqual(AI.safeMoves(bd), oracleSafe(bd),
        'AI.safeMoves 与独立真值不符（n=' + bd.n + '，手数 ' + B.toMoves(bd) + '）');
      n++;
    }
  }
  console.log('test-ai: AI.safeMoves 与独立真值逐位相同 OK（' + n + ' 局面）');
}

// ════════════════════════════════════════
// ① 入参校验：⛔ 一律抛错，别静默兜底
// ════════════════════════════════════════
{
  const bd = B.newBoard();
  for (const bad of [0, 21, -1, 1.5, '5', null, undefined, NaN]) {
    assert.throws(() => AI.aiMove(bd, bad, 1), /非法难度级别/, 'tier=' + String(bad) + ' 必须抛错');
  }
  for (const bad of [1.5, '1', null, undefined, NaN]) {
    assert.throws(() => AI.aiMove(bd, 10, bad), /非法 seed/, 'seed=' + String(bad) + ' 必须抛错');
  }
  for (const bad of [null, undefined, 42, 'abc', {}]) {
    assert.throws(() => AI.aiMove(bad, 3, 1), /非法 position/, 'position=' + String(bad) + ' 必须抛错');
  }
  // 手数列表里的非法列号由 bitboard.play 收（⛔ 别在 ai.js 里再写一份校验）
  assert.throws(() => AI.aiMove(['3', 3], 3, 1), /非法着法/);
  assert.throws(() => AI.aiMove([9], 3, 1), /非法着法/);
  // 已终局：没有「该走哪一列」，⛔ 不许编一个返回值（与 solver.scoreOf 同一条纪律）
  assert.throws(() => AI.aiMove([3, 4, 3, 4, 3, 4, 3], 20, 1), /已终局/);
  const DRAW_MOVES = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                      6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];
  assert.strictEqual(R.terminal(B.fromMoves(DRAW_MOVES)), 'DRAW', '前提：这串是真和棋满盘');
  assert.throws(() => AI.aiMove(DRAW_MOVES, 1, 1), /已终局/);
  console.log('test-ai: 入参校验（tier / seed / position / 终局）OK');
}

// ════════════════════════════════════════
// ①b ⭐ 类型签名本体：aiMove 只吃三个参数。
//    DESIGN §2.3 那句「入参里没有玩家历史」印在公平页上，那它就该是**可数的**。
//    ⚠ 多一个可选参数（哪怕叫 opts）就是给「偷偷塞玩家状态」开了门 —— 拦在这里。
// ════════════════════════════════════════
{
  assert.strictEqual(AI.aiMove.length, 3, 'aiMove 必须正好是 (position, tier, seed) 三个入参');
  assert.strictEqual(AI.usesSolver.length, 2);
  console.log('test-ai: ⭐ aiMove(position, tier, seed) 三参签名 OK');
}

// ════════════════════════════════════════
// ①c 绝不修改入参棋盘（safeMoves 的 playIn/undoIn 一旦不对称就是静默灾难）
// ════════════════════════════════════════
{
  for (const n of [8, 22]) {
    for (const bd of randomPositions(n, 8, 1212 + n)) {
      const snap = JSON.stringify(bd);
      const tiers = bd.n >= 20 ? [1, 5, 6, 20] : [1, 5];
      for (const t of tiers) { AI.decide(bd, t, 3); AI.usesSolver(bd, t); AI.safeMoves(bd); }
      assert.strictEqual(JSON.stringify(bd), snap, 'AI 改了入参棋盘（n=' + n + '）');
    }
  }
  console.log('test-ai: 入参棋盘零修改 OK');
}

// ════════════════════════════════════════
// ② ⛔ 禁 Math.random —— 源码断言 + 运行时下毒
// ════════════════════════════════════════
{
  // ⚠ 必须先剥注释：ai.js 的文件头**故意**写着「⛔ 禁 Math.random」，直接正则整份源码
  //   会被自己的禁令绊倒（第一版就是这么红的）。⛔ 但别因此把这条断言删掉改成「只信运行时
  //   下毒那一条」：源码断言拦的是**没被任何用例覆盖到的分支**里偷用 Math.random。
  //   ai.js 里没有正则字面量、字符串里也没有 `//`，所以这个粗剥法足够。
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  // 剥注释器自检：代码里的要抓到，注释里的要放过（⛔ 否则这条断言可能一直在空转）
  assert.ok(/Math\.random/.test(strip('var x = Math.random();')), '剥注释器把代码也剥了');
  assert.ok(!/Math\.random/.test(strip('var x = 1; // Math.random()')), '剥注释器没剥掉行注释');
  assert.ok(!/Math\.random/.test(strip('/* Math.random */ var x = 1;')), '剥注释器没剥掉块注释');
  const src = fs.readFileSync(path.join(JS_DIR, 'ai.js'), 'utf8');
  assert.ok(/Math\.random/.test(src), '前提：ai.js 的注释里本来就写着这条禁令');
  assert.ok(!/Math\s*\.\s*random/.test(strip(src)), 'ai.js 的**代码**里出现了 Math.random（确定性当场破功）');
  console.log('test-ai: ai.js 代码零 Math.random OK（注释里的禁令不算）');
}

// ════════════════════════════════════════
// ③ 全档合法 + ⛔ 绝不主动走立即败招 + 能赢必赢 + 该挡必挡
// ════════════════════════════════════════
{
  // 覆盖开局到残局的各种深度；低档在所有深度上都跑，⛔ 高档只在深局面上跑（见局面工厂的 ⚠⚠）
  const shallowTierSets = [2, 6, 10, 16, 24, 30, 36].map(n => randomPositions(n, 12, 700 + n));
  let mateCases = 0, blockCases = 0, doomedCases = 0;

  for (const set of shallowTierSets) {
    for (const bd of set) {
      const mates = R.winningMoves(bd);
      const safe = oracleSafe(bd);
      const legal = R.moves(bd);
      const tiers = bd.n >= 20 ? ALL_TIERS : ALL_TIERS.filter(t => t < AI.SOLVER_FROM);
      for (const t of tiers) {
        for (let seed = 0; seed < 6; seed++) {
          const d = AI.decide(bd, t, seed);
          // 合法列（⛔ AI 不该先产生非法列，虽然 B.play 会当场抛错）
          assert.ok(legal.indexOf(d.col) !== -1, '第 ' + t + ' 级给出非法列 ' + d.col);
          assert.ok(AI.REASON_VALUES.indexOf(d.reason) !== -1, '未知 reason ' + d.reason);
          B.play(bd, d.col);   // 真跑一遍闸口，非法会当场抛
          // 能连四就连（任何档）
          if (mates.length) {
            assert.ok(mates.indexOf(d.col) !== -1,
              '第 ' + t + ' 级在有当场制胜手时没走：mates=' + mates + ' 走了 ' + d.col);
            assert.strictEqual(d.reason, AI.REASON.WIN);
            mateCases++;
          } else if (safe.length === 0) {
            // 每列都送头 ⇒ 走哪都一样，只断言它诚实地报了 DOOMED
            assert.strictEqual(d.reason, AI.REASON.DOOMED);
            doomedCases++;
          } else {
            // ⛔ 绝不主动走立即败招（送对方当场连四）——**包括第 1 级**
            assert.ok(safe.indexOf(d.col) !== -1,
              '第 ' + t + ' 级走了立即败招 ' + d.col + '（安全列 ' + safe + '）');
            if (safe.length < legal.length) blockCases++;
          }
        }
      }
    }
  }
  assert.ok(mateCases > 0, '样本里必须真的出现过「有制胜手」的局面');
  assert.ok(blockCases > 0, '样本里必须真的出现过「有列会送头」的局面');
  console.log('test-ai: 全档合法 / 能赢必赢(' + mateCases + ') / 绝不送头(' + blockCases
    + ') / 全送头诚实报 DOOMED(' + doomedCases + ') OK');
}

// ════════════════════════════════════════
// ④ 战术前置层与求解器**对拍** —— 跳过求解器不是降级，是可证等价
//    （ai.js 的 WIN / FORCED / DOOMED 三条捷径全押在这条推论上：
//     送头列的分 = -(41-n)，安全列的分 ≥ -(39-n)，严格更好。）
// ════════════════════════════════════════
{
  let forced = 0, doomed = 0, mate = 0, checked = 0;
  for (const n of [20, 24, 28, 32]) {
    for (const bd of randomPositions(n, 30, 3300 + n)) {
      const safe = oracleSafe(bd);
      const mates = R.winningMoves(bd);
      const sa = S.scoreAll(bd);
      const legal = R.moves(bd);
      const best = Math.max.apply(null, legal.map(c => sa[c]));
      checked++;
      if (mates.length) {
        mate++;
        for (const c of mates) assert.strictEqual(sa[c], best, '制胜手必须是最优');
        assert.strictEqual(best, B.CELLS - bd.n, '制胜手的分必须是 CELLS - n');
        continue;
      }
      // 送头列的分数：必须恰好是 doomedScore(n)，且严格差于任何安全列
      for (const c of legal) {
        if (safe.indexOf(c) !== -1) continue;
        assert.strictEqual(sa[c], AI.doomedScore(bd.n),
          '送头列 ' + c + ' 的分应为 ' + AI.doomedScore(bd.n) + '，实为 ' + sa[c]);
        if (safe.length) assert.ok(sa[c] < best, '送头列必须严格差于最优');
      }
      if (safe.length === 0) { doomed++; continue; }
      if (safe.length === 1) {
        forced++;
        assert.strictEqual(sa[safe[0]], best, '唯一安全列必须就是唯一最优（FORCED 捷径的全部依据）');
        for (const t of [6, 12, 20]) {
          assert.strictEqual(AI.decide(bd, t, 7).col, safe[0]);
          assert.strictEqual(AI.decide(bd, t, 7).reason, AI.REASON.FORCED);
        }
      }
    }
  }
  assert.ok(forced > 0, '样本里必须真的出现过「只剩一列安全」的局面（否则 FORCED 这条没被测到）');
  console.log('test-ai: 前置层与求解器对拍 OK（' + checked + ' 局面：制胜 ' + mate
    + ' / 唯一安全 ' + forced + ' / 全送头 ' + doomed + '）');
}

// ════════════════════════════════════════
// ⑤ 顶档零失误：第 20 级每一手都必须在 solve().best 里
// ════════════════════════════════════════
{
  let n20 = 0;
  for (const n of [20, 24, 28]) {
    for (const bd of randomPositions(n, 25, 5500 + n)) {
      const best = S.solve(bd).best;
      for (let seed = 0; seed < 5; seed++) {
        const d = AI.decide(bd, AI.TIER_MAX, seed);
        assert.ok(best.indexOf(d.col) !== -1,
          '第 20 级走了非最优列 ' + d.col + '（最优 ' + best + '，n=' + bd.n + '）');
        assert.strictEqual(d.slipped, false, '第 20 级不许 slip');
        n20++;
      }
    }
  }
  // p(20) 必须**精确**是 0：写成 0.001 也叫「几乎零失误」，但顶档的公平框架
  //（DESIGN §3.1：「这一档不会走错，你输了就是某一步走错了」）就变成了假话。
  assert.strictEqual(AI.params(AI.TIER_MAX).p, 0, '第 20 级的 p 必须精确为 0');
  console.log('test-ai: 顶档零失误 OK（' + n20 + ' 次决策全部 ∈ solve().best）');
}

// ════════════════════════════════════════
// ⑥ ⭐ 确定性第一条：不读玩家状态
//    往全局塞连胜 99 / 大师级存档 / 各种「自适应」钩子 ⇒ 逐手不变
// ════════════════════════════════════════
{
  const cases = [];
  for (const n of [4, 12, 22, 26]) {
    for (const bd of randomPositions(n, 6, 9100 + n)) {
      const tiers = bd.n >= 20 ? ALL_TIERS : ALL_TIERS.filter(t => t < AI.SOLVER_FROM);
      for (const t of tiers) for (let s = 0; s < 4; s++) cases.push({ bd, t, s });
    }
  }
  const before = cases.map(c => AI.aiMove(c.bd, c.t, c.s));

  const g = globalThis;
  const saved = {};
  const POISON = {
    // 玩家状态的各种常见形状：连胜、胜负记录、等级、「自适应难度」的调档钩子
    G: { streak: 99, wins: 999, losses: 0, level: 'master', aiBias: -5, ddaBoost: 3 },
    PlayerProfile: { rating: 2400, winStreak: 99, tierBeaten: 20, frustration: 1 },
    winStreak: 99, lossStreak: 0, difficultyOffset: -7, playerSkill: 1.0,
    localStorage: { getItem: () => '{"streak":99,"level":"master"}', setItem: () => {} },
    performance: g.performance, Date: g.Date
  };
  for (const k of Object.keys(POISON)) { saved[k] = g[k]; g[k] = POISON[k]; }
  // ⛔ 顺手把 Math.random 换成抛错函数：任何一处偷用它都会当场炸（响的）
  const realRandom = Math.random;
  Math.random = function () { throw new Error('ai.js 用了 Math.random —— 确定性承诺破功'); };
  let after;
  try {
    after = cases.map(c => AI.aiMove(c.bd, c.t, c.s));
  } finally {
    Math.random = realRandom;
    for (const k of Object.keys(POISON)) g[k] = saved[k];
  }
  assert.deepStrictEqual(after, before,
    '往全局塞玩家状态之后落子变了 —— 公平承诺（入参里没有玩家状态）不成立');
  console.log('test-ai: ⭐ 不读玩家状态 OK（' + cases.length
    + ' 次决策，连胜 99 / 大师存档 / Math.random 下毒之后逐手不变）');
}

// ════════════════════════════════════════
// ⑦ ⭐ 确定性第二条：撤销之后不许改主意
//    撤销 N 次再重走同一条路，AI 每一手必须逐手一致。
//    ⚠ 这一条是**随机性必须是 (position,tier,seed) 的纯函数**唯一能过的关：常规的
//      「开局 create 一次 PRNG、每手推进一格」写法在这里必挂（撤销不会把流退回去）。
// ════════════════════════════════════════
function playScripted(startMoves, aiTier, seed, plies, humanRnd) {
  // 人类脚本走法也由 PRNG 决定 ⇒ 整条对局线可复现
  let bd = B.fromMoves(startMoves);
  const aiCols = [];
  for (let i = 0; i < plies && R.terminal(bd) === null; i++) {
    if (i % 2 === 0) {
      const col = AI.aiMove(bd, aiTier, seed);
      aiCols.push({ n: bd.n, col });
      bd = B.play(bd, col);
    } else {
      const ms = R.moves(bd);
      bd = B.play(bd, ms[Math.floor(humanRnd() * ms.length)]);
    }
  }
  return { aiCols, moves: B.toMoves(bd) };
}

{
  // (a) 低档：整局从空盘打（秒出，随便打）
  // (b) 顶档：从固定深局面起手（没装开局库时开局阶段搜不动，见局面工厂的 ⚠⚠）
  const DEEP = B.toMoves(randomPositions(24, 1, 424242)[0]);
  const runs = [
    { start: [], tier: 3, seed: 11, plies: 40 },
    { start: [], tier: 5, seed: 12, plies: 40 },
    { start: DEEP, tier: 20, seed: 13, plies: 10 },
    { start: DEEP, tier: 12, seed: 14, plies: 10 },
    { start: DEEP, tier: 7, seed: 15, plies: 10 }
  ];
  for (const r of runs) {
    const base = playScripted(r.start, r.tier, r.seed, r.plies, PRNG.create(777));
    // ① 一模一样再打一遍（同参数恒等）
    const again = playScripted(r.start, r.tier, r.seed, r.plies, PRNG.create(777));
    assert.deepStrictEqual(again.aiCols, base.aiCols, '同参数重打一遍，AI 落子必须逐手相同');

    // ② 撤销 N 次再重走同一条路 —— 每一步都从「撤销后的历史」重建局面
    for (let undoDepth = 1; undoDepth <= 6; undoDepth++) {
      const replay = [];
      for (const step of base.aiCols) {
        // 造出「玩家撤销了 undoDepth 手、又原样走回来」之后的局面：
        // 局面本身与 base 在同一手时完全相同，但**到达它的历史不同**（多了一段撤销）。
        const upTo = base.moves.slice(0, step.n);
        const rewound = upTo.slice(0, Math.max(r.start.length, upTo.length - undoDepth));
        let bd = B.fromMoves(rewound);
        for (let i = rewound.length; i < upTo.length; i++) bd = B.play(bd, upTo[i]);
        assert.strictEqual(bd.n, step.n, '重建后的局面手数必须对上');
        replay.push({ n: bd.n, col: AI.aiMove(bd, r.tier, r.seed) });
      }
      assert.deepStrictEqual(replay, base.aiCols,
        '撤销 ' + undoDepth + ' 手再重走同一条路之后 AI 改了主意（第 ' + r.tier + ' 级）'
        + ' —— 这会被玩家直接读成「它在偷看我要走哪」');
    }

    // ③ ⭐ 真正的现场剧本：撤销之后**走了别的线**、逛了一圈、再原路走回来。
    //    这一步比 ② 更狠：中间夹进了一大批对**别的局面**的问询。任何「模块级 PRNG 流
    //    / 按调用次数推进 / 记住上次问的是什么」的实现都会在这里当场露馅，而 ② 未必。
    for (const step of base.aiCols) {
      const upTo = base.moves.slice(0, step.n);
      const forkAt = Math.max(r.start.length, upTo.length - 4);
      let side = B.fromMoves(upTo.slice(0, forkAt));
      // 岔出去随便走几步、每步都问一次 AI（把「流」推得离原位越远越好）
      for (let k = 0; k < 5 && R.terminal(side) === null; k++) {
        const ms = R.moves(side);
        const alt = ms[(k + 3) % ms.length];
        AI.aiMove(side, r.tier, r.seed);
        side = B.play(side, alt);
      }
      // 再原路走回来
      let backBd = B.fromMoves(upTo.slice(0, forkAt));
      for (let i = forkAt; i < upTo.length; i++) backBd = B.play(backBd, upTo[i]);
      assert.strictEqual(AI.aiMove(backBd, r.tier, r.seed), step.col,
        '撤销后逛了一圈再走回来，AI 改了主意（第 ' + r.tier + ' 级，第 ' + step.n + ' 手）');
    }

    // ④ 入参形态无关：手数列表 与 棋盘对象 必须同答案
    for (const step of base.aiCols) {
      const mv = base.moves.slice(0, step.n);
      assert.strictEqual(AI.aiMove(mv, r.tier, r.seed), step.col, '手数列表入参必须与棋盘对象同答案');
      assert.strictEqual(AI.aiMove(B.fromMoves(mv), r.tier, r.seed), step.col);
    }
  }
  console.log('test-ai: ⭐ 撤销不改主意 OK（5 条对局线 × 撤销 1..6 手 × 逐手重放）');
}

// ════════════════════════════════════════
// ⑧ ⭐ 确定性第三条：同 (position, tier, seed) 恒等；换任何一个都是**另一次**抽样
// ════════════════════════════════════════
{
  const bd = randomPositions(22, 1, 60601, searchy)[0];
  for (const t of [1, 3, 8, 14, 20]) {
    const first = AI.aiMove(bd, t, 4242);
    for (let i = 0; i < 1000; i++) {
      assert.strictEqual(AI.aiMove(bd, t, 4242), first, '同参数第 ' + i + ' 次调用变了');
    }
  }
  // 换 seed / 换级别必须能产生不同的抽样（否则 seed 是摆设、级别之间会同步失误）
  const lowBd = randomPositions(10, 1, 60602)[0];
  const bySeed = new Set();
  for (let s = 0; s < 200; s++) bySeed.add(AI.aiMove(lowBd, 2, s));
  assert.ok(bySeed.size > 1, '换 seed 必须能换出不同的落子（第 2 级是高随机档）');
  console.log('test-ai: ⭐ 同参数恒等 OK（5 级 × 1000 次）；换 seed 抽样确实会变（'
    + bySeed.size + ' 种落子）');
}

// ════════════════════════════════════════
// ⑨ ⭐⭐ 低档必须秒出，且**根本不调求解器**（DESIGN §9.2 断崖那节）
//    ⛔ 裁决方式：独立子进程 + 换掉求解器导出的计数探针 + **退出码**。
//       ⚠ 同一个计数器在高档上必须 > 0 —— 计数器自证有效，不是「我数了个 0」。
// ════════════════════════════════════════
{
  // ⚠ 子进程脚本**纯 ASCII**（走 execFile 不过 shell，但别赌 Windows 的编码）
  const probe = [
    "var jsdir=process.argv[1];",
    "var spath=jsdir+'/solver.js';",
    "var S=require(spath);",
    "var counts={solve:0,scoreAll:0,scoreOf:0};",
    "var spy={};",
    "Object.keys(S).forEach(function(k){spy[k]=S[k];});",
    "Object.keys(counts).forEach(function(k){var f=S[k];spy[k]=function(){counts[k]++;return f.apply(null,arguments);};});",
    "require.cache[require.resolve(spath)].exports=Object.freeze(spy);",
    "var B=require(jsdir+'/bitboard.js'),R=require(jsdir+'/rules-classic.js');",
    "var AI=require(jsdir+'/ai.js');",
    // 自带 mulberry32，别引 engine（保持探针自足）
    "function mk(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}",
    "function pos(n,k,sd,f){var r=mk(sd),out=[],g=0;while(out.length<k&&g++<200000){var bd=B.newBoard(),ok=true;",
    "for(var i=0;i<n;i++){if(R.terminal(bd)!==null){ok=false;break;}var ms=R.moves(bd);bd=B.play(bd,ms[Math.floor(r()*ms.length)]);}",
    "if(!ok||R.terminal(bd)!==null)continue;if(f&&!f(bd))continue;out.push(bd);}return out;}",
    // ── 低档：全深度、全 seed，统计每次决策耗时 ──
    "var lowMs=[],depths=[2,6,10,12,14,16,20,26,32];",
    "depths.forEach(function(n){pos(n,10,4000+n).forEach(function(bd){",
    "  for(var t=1;t<AI.SOLVER_FROM;t++){for(var s=0;s<10;s++){var a=process.hrtime.bigint();AI.aiMove(bd,t,s);lowMs.push(Number(process.hrtime.bigint()-a)/1e6);}}",
    "});});",
    "var lowCalls=counts.solve+counts.scoreAll+counts.scoreOf;",
    // ── 高档：同一个计数器必须动起来，且每手最多一次 scoreAll、零 solve、零 scoreOf ──
    "var before=JSON.parse(JSON.stringify(counts));",
    "var hi=pos(24,12,4999,function(bd){return R.winningMoves(bd).length===0&&AI.safeMoves(bd).length>=2;});",
    "var perMove=[];",
    "hi.forEach(function(bd){[6,12,20].forEach(function(t){for(var s=0;s<3;s++){",
    "  var b0=counts.scoreAll,s0=counts.solve,o0=counts.scoreOf;AI.aiMove(bd,t,s);",
    "  perMove.push([counts.scoreAll-b0,counts.solve-s0,counts.scoreOf-o0]);}});});",
    "lowMs.sort(function(a,b){return a-b;});",
    "console.log(JSON.stringify({lowCalls:lowCalls,lowN:lowMs.length,",
    "  lowMedian:lowMs[Math.floor(lowMs.length/2)],lowP99:lowMs[Math.floor(lowMs.length*0.99)],lowMax:lowMs[lowMs.length-1],",
    "  hiCalls:{solve:counts.solve-before.solve,scoreAll:counts.scoreAll-before.scoreAll,scoreOf:counts.scoreOf-before.scoreOf},",
    "  hiMoves:perMove.length,hiBad:perMove.filter(function(p){return p[0]!==1||p[1]!==0||p[2]!==0;}).length}));"
  ].join('\n');

  const out = execFileSync(process.execPath, ['-e', probe, JS_DIR], { encoding: 'utf8', timeout: 300000 });
  const r = JSON.parse(out.trim());

  assert.strictEqual(r.lowCalls, 0,
    '⛔ 第 1-' + (AI.SOLVER_FROM - 1) + ' 级调了求解器 ' + r.lowCalls + ' 次 —— '
    + '那会让轻松档在 n=10..15 段变成 1.7 秒，比顶档还重（DESIGN §9.2）');
  assert.ok(r.lowN >= 1000, '低档样本量不够（' + r.lowN + '）');
  // ⚠ 阈值给得很松（CI 机器可能很慢）：真正的判据是上面那条 lowCalls===0。
  //   这里只拦「共用代码路径悄悄把低档也拖下水」这一类回归。
  assert.ok(r.lowMedian < 1, '低档中位耗时 ' + r.lowMedian + ' ms，不该超过 1 ms');
  assert.ok(r.lowP99 < 20, '低档 p99 耗时 ' + r.lowP99 + ' ms，不该超过 20 ms');
  // 同一个计数器在高档上必须动 —— 否则「低档 0 次」只是探针没装上
  assert.ok(r.hiCalls.scoreAll > 0, '计数器在高档上也是 0 ⇒ 探针没装上，上面那条 0 不作数');
  assert.strictEqual(r.hiBad, 0,
    '求解器档不是「每手恰好一次 scoreAll、零 solve、零 scoreOf」（' + r.hiBad + '/' + r.hiMoves + ' 手不符）');
  console.log('test-ai: ⭐⭐ 低档零求解器调用 OK（' + r.lowN + ' 次决策、跨 9 种深度，'
    + '中位 ' + r.lowMedian.toFixed(4) + ' ms / p99 ' + r.lowP99.toFixed(3) + ' ms / 最慢 '
    + r.lowMax.toFixed(3) + ' ms）；高档 ' + r.hiMoves + ' 手，每手恰好 1 次 scoreAll（'
    + JSON.stringify(r.hiCalls) + '）');
}

// ════════════════════════════════════════
// ⑩ 阶梯不许是假的：低档确实会失误 · 中档的 slip 绝不是败招 · 相邻级有真实强弱差
// ════════════════════════════════════════
{
  // (a) 低档确实会失误：拿求解器当真值，数「AI 走的列不在 best 里」的比例
  let lowTotal = 0, lowWrong = 0, midTotal = 0, midWrong = 0;
  for (const n of [22, 26]) {
    for (const bd of randomPositions(n, 20, 7700 + n, searchy)) {
      const best = S.solve(bd).best;
      for (let s = 0; s < 12; s++) {
        for (const t of [1, 2, 3]) { lowTotal++; if (best.indexOf(AI.aiMove(bd, t, s)) === -1) lowWrong++; }
        for (const t of [6, 8]) { midTotal++; if (best.indexOf(AI.aiMove(bd, t, s)) === -1) midWrong++; }
      }
    }
  }
  const lowRate = lowWrong / lowTotal, midRate = midWrong / midTotal;
  assert.ok(lowRate > 0.10, '第 1-3 级几乎不失误（' + (lowRate * 100).toFixed(1) + '%）⇒ 阶梯是假的');
  assert.ok(midRate > 0.02, '第 6-8 级几乎不失误（' + (midRate * 100).toFixed(1) + '%）⇒ p 曲线没接上');
  assert.ok(midRate < lowRate, '中档的失误率必须低于低档');

  // (b) slip 出来的那一手**仍然**不是立即败招（结构性保证，这里正面验一遍）
  let slips = 0;
  for (const bd of randomPositions(24, 30, 8800, searchy)) {
    const safe = oracleSafe(bd);
    for (const t of [6, 7, 9, 11]) {
      for (let s = 0; s < 20; s++) {
        const d = AI.decide(bd, t, s);
        if (d.reason !== AI.REASON.SLIP) continue;
        slips++;
        assert.ok(safe.indexOf(d.col) !== -1, 'slip 走出了立即败招 ' + d.col);
        assert.ok(d.ranked[0].c !== d.col || d.ranked.length === 1, 'SLIP 不该落在 rank-0 上');
      }
    }
  }
  assert.ok(slips > 50, '样本里 slip 太少（' + slips + '），这条没测到');

  // (c) 相邻级之间有真实强弱差（确定性自对弈，先后手各半、和局算半分）
  function game(tA, tB, seed) {
    let bd = B.newBoard();
    while (R.terminal(bd) === null) bd = B.play(bd, AI.aiMove(bd, bd.turn === 0 ? tA : tB, seed + bd.n * 7919));
    return R.winnerOf(R.terminal(bd));
  }
  function scoreOfMatch(tA, tB, g) {
    let a = 0, d = 0;
    for (let i = 0; i < g; i++) {
      const first = i % 2 === 0;
      const w = first ? game(tA, tB, 1000 + i) : game(tB, tA, 1000 + i);
      if (w === null) d++; else if ((w === 0) === first) a++;
    }
    return (a + d / 2) / g;
  }
  // ⚠ 确定性 ⇒ 这些数字不会抖，但阈值仍给得比实测宽，留给将来微调权重的余地。
  const pairs = [[5, 4], [4, 3], [3, 2], [2, 1]];
  const got = pairs.map(([x, y]) => +scoreOfMatch(x, y, 400).toFixed(3));
  got.forEach((v, i) => assert.ok(v > 0.52,
    '第 ' + pairs[i][0] + ' 级打不过第 ' + pairs[i][1] + ' 级（得分率 ' + v + '）⇒ 这两级其实是同一级'));
  const far = +scoreOfMatch(5, 1, 400).toFixed(3);
  assert.ok(far > 0.72, '第 5 级 vs 第 1 级只有 ' + far + ' ⇒ 轻松档五级没拉开');
  console.log('test-ai: 阶梯是真的 OK（低档失误率 ' + (lowRate * 100).toFixed(1)
    + '% / 中档 ' + (midRate * 100).toFixed(1) + '%；slip ' + slips + ' 次全部非败招；'
    + '相邻级得分率 ' + JSON.stringify(got) + '，5v1 = ' + far + '）');
}

// ════════════════════════════════════════
// ⑪ p 曲线与 ⭐ Task 9 的校准接口
// ════════════════════════════════════════
{
  // ⚠ 单调性只在**求解器档**（6..20）内部成立：轻松档的 p 恒为 0，它们的强弱轴是中路权重
  //   不是 p，把 1..20 串起来比会得到「第 6 级 0.55 > 第 5 级 0」这种假红（第一版就是这么红的）。
  for (let t = AI.SOLVER_FROM + 1; t <= AI.TIER_MAX; t++) {
    assert.ok(AI.params(t).p <= AI.params(t - 1).p,
      'p 必须逐级不增（第 ' + t + ' 级 ' + AI.params(t).p + ' > 第 ' + (t - 1) + ' 级 ' + AI.params(t - 1).p + '）');
  }
  // 轻松档的强弱轴：中路权重必须逐级更偏中路（中列/边列之比严格递增）
  for (let t = 2; t < AI.SOLVER_FROM; t++) {
    const a = AI.params(t - 1).w, b = AI.params(t).w;
    assert.ok(b[0] / b[b.length - 1] > a[0] / a[a.length - 1],
      '第 ' + t + ' 级的中路偏好没比第 ' + (t - 1) + ' 级更强 ⇒ 这两级其实是同一级');
  }
  for (let t = 1; t < AI.SOLVER_FROM; t++) {
    assert.strictEqual(AI.params(t).mode, 'shallow');
    assert.strictEqual(AI.params(t).p, 0, '轻松档没有 p');
  }
  for (let t = AI.SOLVER_FROM; t <= AI.TIER_MAX; t++) assert.strictEqual(AI.params(t).mode, 'solver');
  assert.strictEqual(AI.params(AI.SOLVER_FROM).p, 0.55);
  assert.strictEqual(AI.params(AI.TIER_MAX).p, 0);
  assert.ok(AI.params(19).p > 0, '第 19 级必须还有失误（否则它和第 20 级是同一级）');
  // 参数对象冻结：⛔ 别让调用方 `AI.params(8).p = 0` 静默改掉明面阶梯
  assert.throws(() => { 'use strict'; AI.params(8).p = 0.9; }, TypeError);

  // 校准接口：Task 9 的 tools/sim-ai.js 靠它把 p 拧到目标胜率
  const bd = randomPositions(24, 1, 91011, searchy)[0];
  const beforeMove = AI.aiMove(bd, 8, 5);
  AI.setTierParams(8, { p: 1 });      // 必失误
  assert.strictEqual(AI.params(8).p, 1);
  const forcedSlip = AI.decide(bd, 8, 5);
  assert.strictEqual(forcedSlip.reason, AI.REASON.SLIP, 'p=1 时必须每手都 slip');
  AI.setTierParams(8, { p: 0 });      // 必最优
  assert.strictEqual(AI.decide(bd, 8, 5).reason, AI.REASON.BEST, 'p=0 时不许 slip');
  assert.ok(S.solve(bd).best.indexOf(AI.decide(bd, 8, 5).col) !== -1);
  // ⛔ 不许把轻松档改成求解器档（会让轻松档突然搜 1.7 秒）
  assert.throws(() => AI.setTierParams(3, { p: 0.5 }), /轻松档/);
  assert.throws(() => AI.setTierParams(9, { w: [1, 1, 1, 1] }), /求解器档/);
  assert.throws(() => AI.setTierParams(9, { p: 1.5 }), /p 必须是/);
  assert.throws(() => AI.setTierParams(2, { w: [1, 1, 1] }), /w 必须是/);
  assert.throws(() => AI.setTierParams(2, { w: [1, 0, 1, 1] }), /w 必须是/);
  AI.resetTierParams();
  assert.strictEqual(AI.params(8).p, AI.pCurve(8));
  assert.strictEqual(AI.aiMove(bd, 8, 5), beforeMove, 'resetTierParams 之后必须回到出厂行为');

  // usesSolver：UI 用它决定要不要显示「思考中」/ 要不要先等开局库
  for (let t = 1; t < AI.SOLVER_FROM; t++) assert.strictEqual(AI.usesSolver(bd, t), false, '轻松档永远不搜');
  assert.strictEqual(AI.usesSolver(bd, 20), true);
  assert.strictEqual(AI.usesSolver([3, 4, 3, 4, 3], 20), false, '有当场制胜手时不必搜');
  console.log('test-ai: p 曲线单调 + 校准接口 + usesSolver OK（p(6)=' + AI.pCurve(6)
    + ' … p(15)=' + AI.pCurve(15).toFixed(3) + ' … p(20)=' + AI.pCurve(20) + '）');
}

console.log('test-ai-determinism: 全部通过');
