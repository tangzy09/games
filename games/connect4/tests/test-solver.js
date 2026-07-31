// ════════════════════════════════════════
// test-solver.js —— solver.js 是**会静默算错**的组件：它错了，上面每一层（诚实分档 AI、
// 分层提示、赛后复盘的转折点、课程的自动出题与判分）都会**显得工作正常**，而玩家被
// 告知的每一句话都是假的。所以本文件的核心不是「几个用例」，而是一条**独立真值**链：
//
//   ⭐ 本文件里另写一份**朴素参考求解器**（纯 minimax、零剪枝、零优化、⛔ 不 require
//      solver.js），用它对几千个残局逐个比对 **精确分数**（不只是胜负），逐位相同才算过。
//      只比「谁赢」不够：分数错而胜负对，会让「最快取胜」和赛后复盘的转折点全错。
//
// 另外钉死：best 的语义（并列最优必须**全部**返回、中路优先序）、solve 与 scoreAll 自洽、
// 不污染入参、同局面两次解结果逐位相同。
// ════════════════════════════════════════
const assert = require('assert');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');

const t_start = Date.now();

// ─────────────────────────────────────────
// 0. 分数约定（solver.js 是唯一定义处，这里复述一遍当活文档）
//    从**当前行棋方**视角：>0 必胜 / 0 和 / <0 必败；绝对值越大 = 分出胜负越早。
//    当场落子即赢 ⇒ score = CELLS - n（n = 落子前的手数）。
//    等价说法：设分出胜负那一刻盘上共 nWin 子，则胜方视角分数 = CELLS + 1 - nWin。
// ─────────────────────────────────────────
const CELLS = B.CELLS;                       // 42
/** 某局面已终局（上一手赢了）时，**轮走方**（输家）的分数。 */
function lostScoreAt(n) { return -(CELLS + 1 - n); }

// ─────────────────────────────────────────
// 1. ⭐ 朴素参考求解器：纯 minimax，零剪枝、零剪窗、零置换表、零启发。
//    它慢，但它显然正确 —— 这是全文件唯一的真值来源，⛔ 绝不许为了提速加剪枝。
//    只依赖 bitboard（纯函数 play）与 rules（terminal/moves），不碰 solver.js。
// ─────────────────────────────────────────
function refNegamax(bd) {
  const t = R.terminal(bd);
  if (t !== null) return R.isWin(t) ? lostScoreAt(bd.n) : 0;   // 赢的是**上一手**的人 ⇒ 轮走方输
  let best = -Infinity;
  for (const c of R.moves(bd)) {
    const s = -refNegamax(B.play(bd, c));
    if (s > best) best = s;
  }
  return best;
}
/** @returns { [col]: 精确分数 }，键为数字列号（ORDER 序无关，键是 map） */
function refScoreAll(bd) {
  const out = {};
  // `0 - x` 而不是 `-x`：和棋时 `-x` 会产出 `-0`（deepStrictEqual 会把它和 0 判为不等）
  for (const c of R.moves(bd)) out[c] = 0 - refNegamax(B.play(bd, c));
  return out;
}
/** 并列最优的列，**中路优先序**（R.moves 已是 ORDER 序，直接过滤即保序） */
function refBest(bd, sa) {
  let mx = -Infinity;
  for (const c of R.moves(bd)) if (sa[c] > mx) mx = sa[c];
  return R.moves(bd).filter(c => sa[c] === mx);
}

// ─────────────────────────────────────────
// 2. 确定性 PRNG + 残局生成器（⛔ 禁 Math.random：对拍必须可复现，否则红了没法回放）
// ─────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** 随机走到正好 target 手且**未终局**的局面。
 *  avoidWins=true：每步回避当场制胜手 —— 盘面上会留下大量**活威胁**，且能走到很深
 *                  （接近满盘的局面基本只能这么生成：纯随机填盘几乎必有人中途赢）。
 *  avoidWins=false：纯随机走，中途有人赢就整局重来 —— 得到的是「安静」的局面，
 *                  博弈树更深、朴素参考解更贵，也正是最能压出剪枝错误的一类。
 *  ⚠ 深目标下纯随机几乎走不到，所以试到一半强制切 avoidWins，保证一定产出（否则
 *    r 小的语料块会直接抛错，而那正是覆盖「盘快满」边界的关键块）。 */
function randomPosition(rnd, target, avoidWins) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const av = avoidWins || attempt >= 120;
    let bd = B.newBoard(), ok = true;
    while (bd.n < target) {
      let ms = R.moves(bd);
      if (av) {
        const safe = ms.filter(c => !B.isWinningMove(bd, c));
        if (safe.length) ms = safe;
      }
      bd = B.play(bd, ms[Math.floor(rnd() * ms.length)]);
      if (R.terminal(bd) !== null) { ok = false; break; }
    }
    if (ok) return bd;
  }
  throw new Error('生成器失败：' + target + ' 手的非终局局面没生成出来');
}

// ⚠ 先自检参考求解器本身：它是全文件的真值锚点，它哑了整场对拍就是自我确认。
// ⛔ 自检只许用**接近满盘**的局面：零剪枝的 minimax 在 30+ 空格上是天文数字，
//    一个「看起来人畜无害」的 refScoreAll(6 手局面) 就能把整个测试挂死。
{
  const mate1 = B.fromMoves([3, 4, 3, 4, 3, 4]);        // 先手 c3 已竖三连，轮先手
  assert.strictEqual(mate1.turn, 0);
  assert.deepStrictEqual(R.winningMoves(mate1), [3], '前提：c3 是唯一当场制胜手');
  // 只递归一层（子局面已终局，refNegamax 当场返回）⇒ 校验的是「终局分数 + 取反」这条约定本身
  assert.strictEqual(-refNegamax(B.play(mate1, 3)), CELLS - mate1.n,
    '参考解：一手取胜必须给 42-n');
  console.log('test-solver: 参考求解器自检 OK');
}

// ─────────────────────────────────────────
// 3. 定点用例（不依赖参考求解器，人工可核对）
// ─────────────────────────────────────────

// 3.1 一手取胜 ⇒ score === 42 - n，best = 那一列
{
  const bd = B.fromMoves([3, 4, 3, 4, 3, 4]);   // 先手 (3,0)(3,1)(3,2)；后手 (4,0)(4,1)(4,2)
  assert.strictEqual(bd.n, 6);
  assert.strictEqual(bd.turn, 0);
  assert.deepStrictEqual(R.winningMoves(bd), [3], '前提：先手落 c3 成竖四，且只有这一列');
  const r = S.solve(bd);
  assert.strictEqual(r.score, CELLS - 6, '一手取胜 ⇒ 42 - n = 36');
  assert.strictEqual(r.score, 36);
  assert.deepStrictEqual(r.best, [3]);
  console.log('test-solver: 一手取胜 score=42-n OK');
}

// 3.2 并列最优必须**全部**返回，且中路优先序
//     底行 c2,c3,c4 是先手三连、两端 c1/c5 都空 ⇒ 两个当场制胜手，同分。
{
  const bd = B.fromMoves([2, 2, 3, 3, 4, 4]);
  assert.strictEqual(bd.turn, 0);
  assert.strictEqual(B.isWinningMove(bd, 1), true, '前提：c1 制胜');
  assert.strictEqual(B.isWinningMove(bd, 5), true, '前提：c5 制胜');
  const r = S.solve(bd);
  assert.strictEqual(r.score, CELLS - 6);
  assert.deepStrictEqual(r.best, [1, 5], '两个并列最优都要返回，且 1 在 5 之前（ORDER 序）');
  console.log('test-solver: 并列最优全返回 + 中路优先序 OK');
}

// 3.3 只剩一格且无人能赢 ⇒ score === 0
//     ⚠ 这串 42 手是**真和棋**（照抄自 test-bitboard.js 的 DRAW_MOVES，那边已用独立 2D
//       参考实现逐格核对过）。下面仍在本文件里独立复核一次，不靠注释背书。
const DRAW_MOVES = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                    6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];
{
  const full = B.fromMoves(DRAW_MOVES);
  assert.strictEqual(full.n, 42, '前提：满盘');
  assert.strictEqual(B.winner(full), null, '前提：无人四连（真和棋）');

  const bd = B.fromMoves(DRAW_MOVES.slice(0, 41));   // 只剩最后一格
  // 去掉若干子不可能凭空造出四连 ⇒ 前缀必然也未终局；仍显式断言一次。
  assert.strictEqual(R.terminal(bd), null, '前提：只剩一格时还没分胜负');
  assert.deepStrictEqual(R.moves(bd), [1], '前提：只有 c1 还能落子');
  assert.deepStrictEqual(refScoreAll(bd), { 1: 0 }, '参考解也必须判和（真值锚点的第二道自检）');
  const r = S.solve(bd);
  assert.strictEqual(r.score, 0, '走完最后一格无人赢 ⇒ 和 ⇒ 0');
  assert.deepStrictEqual(r.best, [1]);
  assert.ok(r.nodes > 0, 'nodes 必须是真实计数');
  assert.deepStrictEqual(S.scoreAll(bd), { 1: 0 }, 'scoreAll 与 solve 自洽');
  console.log('test-solver: 只剩一格且无人能赢 score=0 OK');
}

// 3.4 终局局面 ⇒ { score: 0, best: [], nodes: 0 }
{
  const won = B.fromMoves([3, 4, 3, 4, 3, 4, 3]);
  assert.ok(R.isWin(R.terminal(won)), '前提：这是已分胜负的盘');
  assert.ok(R.moves(won).length > 0, '前提：已终局但仍有空列（rules 层不查终局，求解器必须自己查）');
  assert.deepStrictEqual(S.solve(won), { score: 0, best: [], nodes: 0 });
  assert.deepStrictEqual(S.scoreAll(won), {});
  const drawn = B.fromMoves(DRAW_MOVES);
  assert.strictEqual(R.terminal(drawn), R.DRAW);
  assert.deepStrictEqual(S.solve(drawn), { score: 0, best: [], nodes: 0 });
  console.log('test-solver: 终局局面返回空 best OK');
}

// 3.5 被将死一方 ⇒ score < 0，且 best 是**唯一**的防守手
//     ⚠ 不硬编码一串我肉眼看过的手数（这类测试数据在本项目已被纠正过三次），改为
//       确定性扫描 + **可独立推导的**性质断言：
//         · 对方有且仅有一个当场制胜点 t，我方无当场制胜手
//         ⇒ 我方走**任何 c ≠ t**，对方下一手在 t 成四 ⇒ 该列分数必然正好 = -(41 - n)
//           （这条不需要求解器也能推出来，是纯逻辑）
//         · 扫描条件里要求「堵 t 严格更好」（由**参考求解器**判定，不是被测对象）
//       于是 best 只可能是 [t]。
{
  const rnd = mulberry32(0xC4DEAD);
  let found = null;
  for (let i = 0; i < 4000 && !found; i++) {
    const bd = randomPosition(rnd, CELLS - (6 + (i % 5)), i % 3 !== 0);
    if (R.winningMoves(bd).length) continue;                 // 我方有当场制胜手 ⇒ 不是被将死
    const flipped = B.clone(bd); flipped.turn ^= 1;
    const threats = R.winningMoves(flipped);                  // 对方的当场制胜点
    if (threats.length !== 1) continue;
    const t = threats[0];
    if (R.moves(bd).length < 2) continue;
    const sa = refScoreAll(bd);
    const loseNow = -(CELLS - 1 - bd.n);                      // = -(41 - n)
    if (sa[t] <= loseNow) continue;                           // 堵了也不更好 ⇒ 防守手不唯一
    if (Math.max(...Object.values(sa)) >= 0) continue;        // 要求确实是**被将死**（<0）
    found = { bd, t, sa, loseNow };
  }
  assert.ok(found, '没扫到「被将死且防守手唯一」的局面（生成器或规则层出问题了）');
  const { bd, t, sa, loseNow } = found;
  assert.strictEqual(loseNow, lostScoreAt(bd.n + 2), '不堵 ⇒ 对方在第 n+2 子成四');
  for (const c of R.moves(bd)) {
    if (c === t) continue;
    assert.strictEqual(sa[c], loseNow, '不堵的每一列都必须正好是「下一手被杀」的分数：列 ' + c);
  }
  // ⚠ 复现信息必须进**断言 message**，不能只放在成功那行 console.log 里 —— 失败时
  //   那行永远执行不到，只剩一句 `3 !== -1`，零线索。这条断言恰好是最先抓到剪枝错误的
  //   一条（「上界过紧」「窗口反号」两类变异体都死在这里）。
  const rep = 'mv=[' + B.toMoves(bd).join(',') + '] n=' + bd.n + ' 堵 c' + t;
  const r = S.solve(bd);
  assert.ok(r.score < 0, '被将死一方分数必须 < 0，实得 ' + r.score + '：' + rep);
  assert.strictEqual(r.score, sa[t], 'solve.score 与参考解不符：' + rep);
  assert.deepStrictEqual(r.best, [t], 'best 必须是唯一的防守手 c' + t + '：' + rep);
  assert.deepStrictEqual(S.scoreAll(bd), sa, 'scoreAll 必须与参考解逐位相同：' + rep);
  console.log('test-solver: 被将死 ⇒ score<0 且 best 唯一防守手 OK（' + rep + ' 得 ' + sa[t] + '）');
}

// 3.6 不污染入参 + 确定性（单独钉一次，massive 对拍里还会再逐个查）
{
  const bd = B.fromMoves(DRAW_MOVES.slice(0, 36));
  const before = JSON.stringify(bd);
  const r1 = S.solve(bd);
  assert.strictEqual(JSON.stringify(bd), before, 'solve 不许修改调用方的盘（含 mv）');
  const r2 = S.solve(bd);
  assert.deepStrictEqual(r1, r2, '同一局面解两次 score/best/nodes 必须全等');
  S.scoreAll(bd);
  assert.strictEqual(JSON.stringify(bd), before, 'scoreAll 也不许修改入参');
  console.log('test-solver: 入参不被污染 + 确定性 OK');
}

// ─────────────────────────────────────────
// 4. ⭐⭐ 大规模对拍：solve/scoreAll vs 朴素参考求解器，**精确分数逐位相同**
// ─────────────────────────────────────────
// r = 剩余空格数。⭐ 必须**同时**压两头：
//   · r 小（盘快满）：朴素解几乎免费，而 αβ 的上界公式恰恰在这里出边界错 ——
//     初版 `max = CELLS-2-n` 在 n=41 给 -1（真值 0），父节点取反凭空长出 +1 必胜。
//   · r 大：树深、剪枝多，是剪枝逻辑本身出错的地方（也是唯一贵的部分）。
//
// ⛔⛔ **`r: 3` 与 `r: 4` 这两块是 n=41 夹取的回归测试，动它们等于把门禁拆了。**
//    去掉 `if (max < 0) max = 0;` 后逐块实测错列数：**r=1 → 0、r=2 → 0、r=3 → 127、r=4 → 81**。
//    ⚠ 别以为「越满盘越能抓到」而砍成只留 r ≤ 2 —— 那样回归测试当场消失而测试全绿：
//      · r=1：唯一子节点 n=42，在 negamax 的 `bd.n === CELLS` 那行就返回了，**根本走不到**夹取；
//      · r=2：走得到 n=41 的夹取，但根给的是满窗（alpha=-INF）⇒ `alpha >= beta` 不成立，
//             不会走那条 `return beta`，循环里的 fail-soft 高侧仍然返回真值 0。
//      要触发这个 bug，得在进入 n=41 时 alpha 已经 ≥ -1（即已有一条不差的兄弟着法），
//      那要求 n=41 之上还有真正的选择 —— 从 r=3 起才出现。
const CORPUS_SHALLOW = [
  { r: 1,  count: 300 }, { r: 2,  count: 300 }, { r: 3,  count: 300 },
  { r: 4,  count: 300 }, { r: 5,  count: 300 }, { r: 6,  count: 300 },
  { r: 7,  count: 300 }, { r: 8,  count: 400 }, { r: 9,  count: 400 },
  { r: 10, count: 400 }, { r: 11, count: 300 }, { r: 12, count: 250 },
];
// ⚠ r ≥ 13 单独成块、由 `npm run test:c4:deep` 跑（--deep）：零剪枝的参考解在这两块要
//   ~150ms / ~580ms 一个局面，实测占整份测试 ~79% 的时间，而 9 个变异体**全部**在
//   ≤210ms 内死在定点用例或 r ≤ 3 —— 深块对变异杀伤力的边际贡献为零。
//   ⛔ 但它不是被删掉的：深块是真实覆盖，进包前必须跑（DESIGN §10 已列为门禁）。
const CORPUS_DEEP = [{ r: 13, count: 80 }, { r: 14, count: 30 }];
const DEEP = process.argv.includes('--deep');
const CORPUS = DEEP ? CORPUS_DEEP : CORPUS_SHALLOW;
{
  let total = 0, ties = 0, wins = 0, draws = 0, losses = 0, withMate = 0, solverNodes = 0;
  for (const { r, count } of CORPUS) {
    // ⚠ 每块一条**独立**的随机流：共用一条流时，改任何一块的 count 都会把后面所有块
    //   整体洗牌 —— 上面那些抓 bug 的 r=3/4 局面会静默换成另一批，门禁悄悄失效。
    const rnd = mulberry32(20260731 + r);
    for (let i = 0; i < count; i++) {
      const bd = randomPosition(rnd, CELLS - r, i % 2 === 0);
      const tag = 'r=' + r + ' #' + i + ' mv=[' + B.toMoves(bd).join(',') + ']';
      const before = JSON.stringify(bd);

      // (5) 不许污染入参
      const res = S.solve(bd);
      assert.strictEqual(JSON.stringify(bd), before, '入参被改了：' + tag);
      const sa = S.scoreAll(bd);
      assert.strictEqual(JSON.stringify(bd), before, '入参被 scoreAll 改了：' + tag);

      // (6) 确定性
      assert.deepStrictEqual(S.solve(bd), res, '同局面两次 solve 不一致：' + tag);
      assert.deepStrictEqual(S.scoreAll(bd), sa, '同局面两次 scoreAll 不一致：' + tag);

      // (2) 精确分数逐位对拍
      const ref = refScoreAll(bd);
      const legal = R.moves(bd);
      assert.deepStrictEqual(Object.keys(sa).map(Number).sort((x, y) => x - y),
        legal.slice().sort((x, y) => x - y), 'scoreAll 的列集合不对：' + tag);
      for (const c of legal) {
        assert.strictEqual(sa[c], ref[c],
          '分数不符 ' + tag + ' 列 ' + c + '：solver=' + sa[c] + ' 参考=' + ref[c]);
        // -0 不许漏出去：`-0 === 0` 为真所以上一行拦不住它，但它会毒到
        // Object.is / deepStrictEqual / toFixed 这些下游（复盘曲线、判分器）。
        assert.ok(!Object.is(sa[c], -0), '分数是 -0（应为 +0）：' + tag + ' 列 ' + c);
      }
      assert.ok(!Object.is(res.score, -0), 'solve.score 是 -0（应为 +0）：' + tag);

      // (3)(4) best 语义 + solve/scoreAll 自洽
      const rbest = refBest(bd, ref);
      const rmax = ref[rbest[0]];
      assert.strictEqual(res.score, rmax, 'solve.score 不等于参考最大值：' + tag);
      assert.strictEqual(res.score, Math.max(...Object.values(sa)),
        'solve.score 必须 = max(scoreAll)：' + tag);
      assert.deepStrictEqual(res.best, rbest,
        'best 必须是全部并列最优、按中路优先序：' + tag);
      assert.deepStrictEqual(res.best, legal.filter(c => sa[c] === res.score),
        'best 必须恰好是 scoreAll 里取到最大值的那些列：' + tag);
      assert.ok(res.nodes > 0, 'nodes 必须 > 0：' + tag);

      // 一手取胜的捷径也必须给出全部并列制胜手
      const mates = R.winningMoves(bd);
      if (mates.length) {
        withMate++;
        assert.strictEqual(res.score, CELLS - bd.n, '有制胜手时 score 必须 = 42-n：' + tag);
        assert.deepStrictEqual(res.best, mates, '有制胜手时 best 必须正好是这些列：' + tag);
      }

      total++; solverNodes += res.nodes;
      if (rbest.length > 1) ties++;
      if (rmax > 0) wins++; else if (rmax === 0) draws++; else losses++;
    }
  }
  // 语料不能退化（全是「随便走都赢」之类的平凡局面就等于没测）
  assert.strictEqual(total, CORPUS.reduce((s, x) => s + x.count, 0));
  assert.ok(wins > total * 0.05 && losses > total * 0.05,
    '语料退化：胜/负 = ' + wins + '/' + losses);
  // 和棋几乎只出现在接近满盘的块里 ⇒ 只对浅块（默认门禁）要求，--deep 那两块本就该没有
  if (!DEEP) assert.ok(draws > 0, '浅块里一个和棋都没有，说明 r 小的语料块被人动过');
  assert.ok(ties > total * 0.05, '并列最优的局面太少（' + ties + '），best 的顺序/完整性没被真正压到');

  // ⭐ 剪枝有效性的门禁：节点总数封顶。
  // 语料由固定 PRNG 生成、搜索全同步 ⇒ 这个数**完全确定**（不是计时，零 flaky）。
  // 为什么需要它：剪枝退化**不会报错也不会算错**，只是变慢 —— 与 DESIGN §9.1 里
  // 「_ORDER 被冻结导致慢几个数量级却零报错」是同一类病。实测两个变异体：
  //   · 上界放松 `CELLS-1-n`      ⇒ 结果逐位不变、节点 **1.31×**
  //   · fail-high 的 `>=` 写成 `>` ⇒ 结果逐位不变、节点 **7.30×**
  // 两者都躲过了全部正确性断言（它们确实不改答案），只有这条能拦。
  // ⚠ 上限只在**变松**时才该改：加置换表 / 更好的 move ordering 会让它降，那一律通过。
  //   要调高之前先想清楚是不是剪枝坏了。
  const NODE_CEILING = DEEP ? 12500 : 62000;
  assert.ok(solverNodes <= NODE_CEILING,
    '剪枝退化：solver 共访问 ' + solverNodes + ' 节点，超过上限 ' + NODE_CEILING
    + '（结果可能仍然全对——这条专门拦「只变慢不算错」）');
  console.log('test-solver: ⭐ 大规模对拍 OK —— ' + total + ' 个局面'
    + (DEEP ? '（--deep：剩 13-14 手的深块）' : '（剩 1-12 手）')
    + '，**每一列的精确分数**与朴素参考求解器逐位相同');
  console.log('            分布：必胜 ' + wins + ' / 和 ' + draws + ' / 必败 ' + losses
    + '；有并列最优 ' + ties + '；有当场制胜手 ' + withMate
    + '；solver 共访问 ' + solverNodes + ' 节点');
}

// ─────────────────────────────────────────
// 5. ⭐ 第三个独立真值：**分数绝对值必须兑现成真实的对局长度**
//    前面的对拍是「两个求解器互相印证」；这一节完全不碰参考求解器，改成**照 best 打完**，
//    看结果对不对得上分数：
//        score > 0 ⇒ 当前方赢，且分出胜负那手正好是第 (CELLS+1-score) 子
//        score < 0 ⇒ 对方赢，同上取反      score === 0 ⇒ 走满 42 格且无人四连
//    ⭐ 这正是赛后复盘要对玩家说的话（「你第 14 手之后从必胜变必败」「最快 5 手取胜」）。
//    分数的**符号**对而**绝对值**错，前面的胜负判定看不出来，这一节能看出来。
//    ⚠ 双方都走 best ⇒ 赢家在抢最快、输家在拖最久，长度才是被 score 唯一钉死的。
// ─────────────────────────────────────────
{
  const rnd = mulberry32(0x5C0E);
  let cw = 0, cd = 0, cl = 0;
  for (let i = 0; i < 300; i++) {
    const bd0 = randomPosition(rnd, CELLS - (4 + (i % 9)), i % 2 === 0);
    const pred = S.solve(bd0);
    const mover = bd0.turn;
    const tag = 'mv=[' + B.toMoves(bd0).join(',') + '] 预言 score=' + pred.score;

    let bd = bd0;
    while (R.terminal(bd) === null) {
      const r = S.solve(bd);
      assert.ok(r.best.length > 0, '未终局却没有 best：' + tag);
      bd = B.play(bd, r.best[0]);        // 并列最优取 ORDER 第一个（确定性；同分怎么选都不改长度）
    }
    const t = R.terminal(bd);
    if (pred.score > 0) {
      assert.strictEqual(R.winnerOf(t), mover, '预言必胜却没赢：' + tag);
      assert.strictEqual(pred.score, CELLS + 1 - bd.n,
        '取胜手数与分数对不上：' + tag + ' 实际在第 ' + bd.n + ' 子分胜负');
      cw++;
    } else if (pred.score === 0) {
      assert.strictEqual(t, R.DRAW, '预言和棋却分出了胜负：' + tag);
      assert.strictEqual(bd.n, CELLS, '和棋必须走满 42 格：' + tag);
      cd++;
    } else {
      assert.strictEqual(R.winnerOf(t), mover ^ 1, '预言必败却没输：' + tag);
      assert.strictEqual(pred.score, -(CELLS + 1 - bd.n),
        '落败手数与分数对不上：' + tag + ' 实际在第 ' + bd.n + ' 子分胜负');
      cl++;
    }
  }
  assert.ok(cw > 0 && cd > 0 && cl > 0, '三种结局都得覆盖到：' + cw + '/' + cd + '/' + cl);
  console.log('test-solver: ⭐ 分数绝对值兑现成真实对局长度 OK —— 300 局照 best 打完，'
    + '必胜 ' + cw + ' / 和 ' + cd + ' / 必败 ' + cl + ' 的**分出胜负手数**逐个对上');
}

console.log('test-solver: 全部通过（' + ((Date.now() - t_start) / 1000).toFixed(1) + 's）');
