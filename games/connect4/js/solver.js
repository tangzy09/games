// ════════════════════════════════════════
// solver.js —— 完美求解器（negamax + alpha-beta）。**整个产品的心脏。**
// 诚实分档的 AI、会讲道理的提示、赛后复盘的「你第 14 手之后从必胜变必败」、课程的
// 自动出题与自动判分 —— 全部读这个文件的输出。⛔ 它静默算错，上面每一层都会**显得
// 工作正常**，而玩家被告知的每一句话都是假的。所以：宁可慢，绝不许「大概对」。
//
// ⚠ 本版**只求正确，不求快**：没有置换表、没有 move-ordering 启发（除了 rules 层白送
//   的中路优先）。空盘解不动是预期之内的（置换表与基准是另一轮的事，见 DESIGN §2.1）。
//
// ─────────── ⭐ 分数约定（本文件是唯一定义处，别处一律引用这里）───────────
// 从**当前行棋方**视角：
//     score > 0 ⇒ 必胜        score === 0 ⇒ 和        score < 0 ⇒ 必败
//     |score| 越大 ⇒ 分出胜负越早（这条是赛后复盘「最快取胜 / 转折点」的全部依据）
// 锚点：**当场落子即赢 ⇒ score = CELLS - n**（n = 落子前的手数）。
// 等价的闭式：设分出胜负那一刻盘上共 nWin 子，则**胜方视角** score = CELLS + 1 - nWin，
//             负方视角取相反数。negamax 每层取反，绝对值沿路径不变 ⇒ 与节点自身的 n 无关。
//
// ─────────── ⭐ alpha-beta 的上界 max（写错不报错，只会悄悄剪掉正确答案）───────────
// 进入下面的循环前，我们**已经确认当前方不能当场取胜**（前一段的 isWinningMove 扫描全
// 部落空）。那么本方最早的取胜时刻是「我 → 对手 → 我」之后，即 nWin = n + 3：
//     40 - n = CELLS + 1 - (n + 3) = CELLS - 2 - n
// ⚠⚠ **但这还不是上界，必须再夹一次 `max(…, 0)`**，理由是「n+3 手」这个假设在盘快满
//    的时候不成立：
//      · n ≤ 39 ⇒ 40 - n ≥ 1 > 0，夹不夹一样；
//      · n = 40（剩 2 格）⇒ 公式给 0，恰好也对（我方已不可能赢，最好就是和）；
//      · n = 41（剩 1 格）⇒ 公式给 **-1**，可真值是 **0**：填掉最后一格就是和棋。
//    这一格之差不是小事：该节点会返回 -1（「我在最后一子上输」），**父节点取反后得到
//    +1，凭空长出一个「用最后一子取胜」的必胜**。实锤——本文件初版照裸公式写，
//    tests/test-solver.js 的大规模对拍第 11 个局面就抓到 `solver=1 / 参考=0`。
//    （Pons 的 C++ 参考实现用「半手」计分 `(CELLS+1-nWin)/2`，整数除法在 n=41 处
//     自动向 0 取整，所以那边看不到这个坑；本文件不halve，必须显式夹。）
// ⛔ 一般化的正确写法：`max(CELLS - 2 - n, 0)` —— 真分数只可能是「胜(≤40-n 且需 n≤39)
//    / 和(0) / 负(<0)」，取二者较大者必定不小于真值，永远不会剪掉正确答案。
// ⚠ 反过来，若把它写成比真值**小**的数（如 CELLS - 3 - n），αβ 会静默剪掉「三手取胜」
//   这个真答案；写成偏大的数（CELLS - n）则只是白剪、不影响正确性。
// ════════════════════════════════════════
(function (root) {
  const inNode = (typeof module !== 'undefined' && module.exports);
  const B = inNode ? require('./bitboard.js') : root.Bitboard;
  const R = inNode ? require('./rules-classic.js') : root.RulesClassic;

  // 严格大于任何可能出现的分数（最快的四连是 nWin=7 ⇒ |score| ≤ CELLS+1-7 = 36）。
  // 用有限整数而不是 ±Infinity：搜索窗全程留在 SMI，且 -INF 仍是精确整数。
  const INF = B.CELLS + 1;

  // 节点计数器。求解是**同步**递归、单线程、无 await ⇒ 模块级计数器不会被交错污染。
  // ⚠ 将来若把搜索改成可中断/分片的协程，这里必须改成显式传入的上下文对象。
  let _nodes = 0;

  /**
   * 负极大搜索。bd 必须是 **searchBoard**（会被就地修改再原样还原）。
   * ⛔ 前置条件：bd **未终局**（上一手没有成四）。调用方保证：
   *    · 根：solve/scoreAll 先查 R.terminal；
   *    · 递归：只对「非制胜手」recurse（制胜手在上面那段就返回了）。
   *    少这一条就会穿过终局节点继续搜、结果全错且零报错（rules 层故意不查终局）。
   * @returns 当前行棋方视角的精确分数（在 (alpha, beta) 窗内；窗外返回的是同向的界）
   */
  function negamax(bd, alpha, beta) {
    _nodes++;
    if (bd.n === B.CELLS) return 0;                     // 满盘且无人四连 ⇒ 和

    const ms = R.moves(bd);
    // 先看能不能当场赢：这是唯一能拿到 CELLS - n 的情形，也保证了下面 recurse 的
    // 每个子节点都不是「已经被赢掉」的局面（negamax 的前置条件由此自我维持）。
    for (const c of ms) if (B.isWinningMove(bd, c)) return B.CELLS - bd.n;

    // 上界：不能当场赢 ⇒ 最早 nWin = n+3 ⇒ CELLS+1-(n+3) = CELLS-2-n。**但必须夹到 ≥ 0**，
    // 推导与实锤见文件头「上界 max」一节 —— n = CELLS-1 时裸公式给 -1，会凭空造出 +1。
    let max = B.CELLS - 2 - bd.n;
    if (max < 0) max = 0;
    if (beta > max) { beta = max; if (alpha >= beta) return beta; }

    for (const c of ms) {
      B.playIn(bd, c);
      const score = -negamax(bd, -beta, -alpha);
      B.undoIn(bd, c);                                  // ⚠ 必须与 playIn 成对且同列
      if (score >= beta) return score;                  // fail-soft：返回下界
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /**
   * 内部：逐列算**精确**分数。sb 必须是非终局的 searchBoard。
   * @returns [{ c, score }]，按 R.moves 的中路优先序
   * ⚠ 每列都用满窗 (-INF, INF) 单独搜 —— 用「上一列的 alpha」收窄会更快，但那样非最优
   *   列拿到的只是上界而不是精确分，而 scoreAll 的精确分正是提示/精准度/妙手的输入。
   *   慢一档换「每一列都是真值」，本任务的取舍就是这个。
   */
  function rootScores(sb) {
    _nodes++;                                           // 根也是一个访问过的节点
    const out = [];
    for (const c of R.moves(sb)) {
      let s;
      if (B.isWinningMove(sb, c)) {
        s = B.CELLS - sb.n;                             // 当场取胜，无需搜索
      } else {
        B.playIn(sb, c);
        // ⚠ 写 `0 - x` 而不是 `-x`：和棋时 `-0` 会漏到外面去。JS 里 `-0 === 0` 为真，
        //    所以搜索本身不受影响，但 `Object.is(score, 0)`、assert.deepStrictEqual、
        //    以及复盘曲线的 `(-0).toFixed(1) === '-0.0'` 都会当场翻脸 —— 一个只在
        //    「和棋」这一支出现的怪异分支，最难查。`0 - 0` 恒为 `+0`，在边界一次夹干净。
        s = 0 - negamax(sb, -INF, INF);
        B.undoIn(sb, c);
      }
      out.push({ c: c, score: s });
    }
    return out;
  }

  /**
   * ⭐ 求解一个局面。
   * @param bd 普通盘或搜索盘皆可；**绝不会被修改**（内部一律先 searchBoard 复制一份）
   * @returns { score, best, nodes }
   *   score —— 当前行棋方视角的精确分数（约定见文件头）
   *   best  —— **全部**并列最优的列，中路优先序（⚠ 不是「随便一个最优解」：
   *            AI 阶梯要从并列里按 seed 挑、提示要说「有几列不输」、妙手判定要数
   *            「只有 1 列不输」—— 漏返回一列，这三件事同时开始撒谎）
   *   nodes —— 本次访问的搜索节点数（含根）
   * ⚠ 已终局的局面返回 { score: 0, best: [], nodes: 0 }：局面已经结束，「当前方的最优着法」
   *   这个问题不成立。⛔ 消费端别把这个 0 读成「和棋」——先自己查 R.terminal。
   */
  function solve(bd) {
    _nodes = 0;
    if (R.terminal(bd) !== null) return { score: 0, best: [], nodes: 0 };

    const sb = B.searchBoard(bd);
    // 捷径：有当场制胜手时 CELLS - n 就是这个节点**理论上的最大分**（不可能更早赢），
    // 于是并列最优 = 全部制胜手，其余列一定更差，一个节点都不用搜。
    // 这条让「AI 落子 / 提示」在任何深度的战术局面上都是瞬时的。
    const mates = R.winningMoves(sb);
    if (mates.length) { _nodes = 1; return { score: B.CELLS - sb.n, best: mates, nodes: _nodes }; }

    const rs = rootScores(sb);
    let score = -INF;
    for (const e of rs) if (e.score > score) score = e.score;
    const best = [];
    for (const e of rs) if (e.score === score) best.push(e.c);
    return { score: score, best: best, nodes: _nodes };
  }

  /**
   * ⭐ 每一个合法列的精确分数（同样是**当前行棋方**视角，约定见文件头）。
   * 提示的「有几列不输」、精准度的每手打标签、妙手判定、课程的自动判分全读它。
   * @returns { [col]: score }（键是列号；已终局的局面返回 {}）
   * ⚠ 它比 solve 贵得多：solve 有「当场制胜」捷径，它没有（它必须给出每一列的真值）。
   */
  function scoreAll(bd) {
    _nodes = 0;
    const out = {};
    if (R.terminal(bd) !== null) return out;
    for (const e of rootScores(B.searchBoard(bd))) out[e.c] = e.score;
    return out;
  }

  // 与 rules-classic.js 同样冻结：不在热路径上（只是属性读取），零代价，却能挡住
  // `S.solve = () => ({score:0,best:[3]})` 这类把真值整个换掉的误用 —— 求解器被悄悄
  // 替换掉，上面每一层仍会「正常工作」，正是本文件最怕的失败模式。
  const API = Object.freeze({ solve, scoreAll });
  // ⚠ 浏览器侧按 root.Bitboard / root.RulesClassic 取依赖 ⇒ index.html 里
  //   bitboard.js → rules-classic.js → solver.js 的**脚本顺序不能乱**（乱了是
  //   「B is undefined」当场炸，响的，不是静默错，但仍别踩）。
  if (inNode) module.exports = API;
  else root.Solver = API;
})(typeof self !== 'undefined' ? self : this);
