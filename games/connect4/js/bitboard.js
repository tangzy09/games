// ════════════════════════════════════════
// bitboard.js — connect4 位棋盘（标准 7×6）。**整个产品的正确性地基**：
// 求解器、AI 阶梯、分层提示、赛后复盘、16 课全部压在这个文件上。它错了，一切静默地跟着错。
//
// 表示：每列一个 6 位掩码，bit r = 该列第 r 行（r=0 是最底行）。
//   a[c] = **先手**（player 0，即 turn===0 的一方）在第 c 列的掩码
//   b[c] = **后手**（player 1，即 turn===1 的一方）
//   h[c] = 该列已有子数（= 下一个可落的行号）   turn = 该谁走   n = 总手数
// ⚠ a↔0 / b↔1 这条绑定散落到各处就是错源，所以只在 maskOf() 一个地方写。
//
// 为什么是「按列」而不是 49 位打包（DESIGN §9.1）：
//   1. 所有位运算都在**列内**完成 ⇒ 全部落在 32 位安全区，不用两个半字拼接，不用 BigInt；
//   2. **斜线结构性不可能跨越棋盘边缘** —— 相邻列是两个独立的数，横/斜的 c+3<W 循环
//      本身就是边界，不靠任何「哨兵行/边界掩码」这类事后补救（那类补救一旦漏一处就是静默错）；
//   3. 同理，第 5 行与下一列第 0 行不会被竖向串起来（打包表示法的经典陷阱）。
//      tests/test-bitboard.js 有专门钉死这两个不变量的用例，⛔ 别删。
//
// 存档策略见 DESIGN §9.3：存的是**手数列表**（mv），不是局面快照栈 ——
// 撤销/中断恢复/「从第 N 步重来」/一条 URL 分享整局，都由 fromMoves 重放白送。
// 因此 play 必须是**纯函数**（返回新盘，绝不就地改）。
//
// ⭐ 两套 API，别混用：
//   · 对外/UI/存档 → newBoard / play / clone / toMoves（纯函数，带 mv，校验合法性）
//   · 求解器内部  → searchBoard / playIn / undoIn（可变、零分配、不带 mv、不校验）
//     实测 negamax 吞吐差数倍：mv 的拷贝一项就占纯函数版约四成时间。
// ════════════════════════════════════════
(function (root) {
  const W = 7, H = 6, CELLS = W * H;

  /** @returns 新棋盘。列数组一律由 W 生成 —— 硬编码 7 个 0 的话，把 W 改成 8 会
   *  让 h[7] 是 undefined、`undefined < H` 为 false ⇒ 第 8 列永远不可落子，不报错不崩溃。 */
  function newBoard() {
    return {
      a: new Array(W).fill(0),
      b: new Array(W).fill(0),
      h: new Array(W).fill(0),
      turn: 0, n: 0, mv: []
    };
  }

  /** a↔先手(0) / b↔后手(1) 的**唯一**映射点。V8 会内联（已跑微基准确认不掉速）。
   *  ⛔ 内部函数，**不导出**：它返回的是**活引用**，`maskOf(bd,0)[6] = 0x0f` 能在不动 h 的
   *     情况下让 winner() 变成 0（重力不变量被破坏且无人察觉），而对外没有任何非它不可的用途
   *     —— 要读掩码直接读 bd.a / bd.b，要判胜负用 hasFourFor / winner。
   *     将来求解器若真需要它，导出时这段警告必须一并写进 JSDoc。 */
  function maskOf(bd, player) { return player === 0 ? bd.a : bd.b; }

  /** mv 为 null 时保持 null（搜索盘故意不带手数列表，见 searchBoard）。 */
  function clone(bd) {
    return {
      a: bd.a.slice(), b: bd.b.slice(), h: bd.h.slice(),
      turn: bd.turn, n: bd.n, mv: bd.mv ? bd.mv.slice() : null
    };
  }

  function canPlay(bd, c) { return c >= 0 && c < W && bd.h[c] < H; }

  /** 纯函数：返回落子后的新棋盘，绝不就地修改（存档/撤销/复盘全靠这条）。
   *  ⛔ 列号的**类型**和**合法性**都在这里收干净——这是全仓落子的唯一闸口，fromMoves 委托它。
   *  1) 非整数列号：JS 里 `arr['3']` 就是 `arr[3]`，所以字符串列号会让盘面**完全正确地**建出来，
   *     但 mv 被污染成 ["3",...]，下游一切严格比较静默失效。两条现实路径都很自然：
   *     UI 的 `play(bd, e.target.dataset.col)`（dataset 天生是字符串）、
   *     分享链接的 `'3,3,4'.split(',')` 忘了 .map(Number)。
   *     后果一样：整局被复盘逐手判成「非最优」，精准度失真、妙手一个不亮，零报错。
   *  2) 非法列必须抛错，别改成静默返回原盘：不校验时往满列上落子会写进**第 7 行的幽灵子**，
   *     v&(v>>1)&(v>>2)&(v>>3) 当场假报竖四连；越界列还会把 a 数组撑到 8 个元素、
   *     h[7] 变 NaN、并且**没落子却把 turn 翻了一次**（之后整局先后手全错）。 */
  function play(bd, c) {
    if (!Number.isInteger(c)) throw new Error('非法着法：必须是整数列号，收到 ' + (typeof c) + ' ' + String(c));
    if (!canPlay(bd, c)) throw new Error('非法着法：列 ' + c + ' 已满或越界');
    const nb = clone(bd);
    maskOf(nb, nb.turn)[c] |= 1 << nb.h[c];
    nb.h[c]++; nb.n++; nb.turn ^= 1;
    if (nb.mv) nb.mv.push(c);
    return nb;
  }

  // ─────────── 求解器专用：可变、零分配 ───────────

  /** 给搜索用的轻量盘：故意**不带 mv**（mv:null）——搜索不需要手数列表，
   *  而 clone 它占了纯函数版约四成的时间。
   *  ⚠ 它是**可变**的，只许搜索内部持有，绝不许交给 UI / 存档（toMoves 会对它抛错）。 */
  function searchBoard(bd) {
    return { a: bd.a.slice(), b: bd.b.slice(), h: bd.h.slice(), turn: bd.turn, n: bd.n, mv: null };
  }

  /** 就地落子 / 悔子（**必须成对调用**）。不校验**着法**合法性：调用方是求解器，着法由 canPlay 生成。
   *  ⛔ 但必须拒绝带 mv 的盘：就地改一个「对外盘」会让手数列表与盘面**静默脱钩**——
   *     playIn(正常盘,5) 之后 n=4 而 mv 还是 3 手，fromMoves(toMoves(bd)) 就变成了另一局，
   *     而存档/撤销/「从第 N 步重来」/URL 分享（DESIGN §9.3）全押在 mv 上，全程无人报错。
   *     这不是着法合法性校验，是「你递错了盘的类型」；实测无可测量开销。
   *     ⚠ undoIn 故意**不加**对称守卫：成对调用是 negamax 的结构性性质，
   *       守卫也挡不住「悔错列」这类同样成对的错，真保障是测试里的递归逐手对拍。
   *  ⚠ 这一对一旦不对称就是静默灾难 —— tests 里有随机对局逐手对拍 + 全回退必须还原成空盘。 */
  function playIn(bd, c) {
    if (bd.mv) throw new Error('playIn 只许用于 searchBoard（这个盘带 mv，就地改会让手数列表与盘面脱钩）');
    const m = maskOf(bd, bd.turn);
    m[c] |= 1 << bd.h[c];
    bd.h[c]++; bd.n++; bd.turn ^= 1;
  }
  function undoIn(bd, c) {
    bd.turn ^= 1; bd.n--; bd.h[c]--;
    const m = maskOf(bd, bd.turn);
    m[c] &= ~(1 << bd.h[c]);
  }

  // ─────────── 胜负判定 ───────────

  /**
   * 某一方的**列掩码数组**是否含四连（原始入口，热路径；一般请用 hasFourFor(bd, player)）。
   * ⛔ 绝对不许为了让某条测试变绿而放松这里的条件——错了是静默的灾难。
   * ⛔ 也别在这里加 Array.isArray 之类的守卫：每个搜索节点都要调它好几次。
   * 四个方向都只用「同列内移位 + 相邻列按位与」，没有任何跨棋盘边缘的可能。
   * 位宽：掩码只占低 H 位，`m << 3` 最高触到 bit (H-1+3)；H ≤ 28 都碰不到符号位，
   *       现在 H=6（最高 bit 8）非常安全。⚠ 若做 H > 28 的变体，必须改用 >>> 并复核。
   */
  function hasFourMasks(m) {
    for (let c = 0; c < W; c++) {
      const v = m[c];
      if (v & (v >> 1) & (v >> 2) & (v >> 3)) return true;          // 竖：(c,r..r+3)
    }
    for (let c = 0; c + 3 < W; c++) {
      const m0 = m[c], m1 = m[c + 1], m2 = m[c + 2], m3 = m[c + 3];
      if (m0 & m1 & m2 & m3) return true;                            // 横：同一行跨 4 列
      if (m0 & (m1 >> 1) & (m2 >> 2) & (m3 >> 3)) return true;       // 斜 ↗：(c,r)(c+1,r+1)(c+2,r+2)(c+3,r+3)
      if (m0 & (m1 << 1) & (m2 << 2) & (m3 << 3)) return true;       // 斜 ↘：(c,r)(c+1,r-1)(c+2,r-2)(c+3,r-3)
    }
    return false;
  }

  /** ⭐ 推荐入口：某一方在这个**棋盘**上是否已连成四子。@param player 0=先手 1=后手
   *  （名字刻意与 hasFourMasks 分开：传错参数——比如把整个棋盘传给吃掩码数组的那个——
   *   会静默返回 false，也就是「永远没人赢」，是最难查的一类错。） */
  function hasFourFor(bd, player) { return hasFourMasks(maskOf(bd, player)); }

  /** @returns 0 | 1 | null（尚未分出胜负，含和局——和局用 isFull 另判） */
  function winner(bd) {
    if (hasFourMasks(bd.a)) return 0;
    if (hasFourMasks(bd.b)) return 1;
    return null;
  }

  function isFull(bd) { return bd.n >= CELLS; }

  /** 落这一子会不会当场赢（求解器热路径）。
   *  「借一下就还」而不是 slice()：hasFourMasks 只读 m、不抛错、不持有引用，
   *  所以中间不可能有别人观察到这个临时位；对外看 bd 完全没被改过（测试用快照钉死）。
   *  实测比每次 slice 快 ~1.7×。 */
  function isWinningMove(bd, c) {
    if (!canPlay(bd, c)) return false;
    const m = maskOf(bd, bd.turn);
    const old = m[c];
    m[c] = old | (1 << bd.h[c]);
    const r = hasFourMasks(m);
    m[c] = old;
    return r;
  }

  // ─────────── 存档 ───────────

  /** 重放手数列表建盘（存档/撤销/分享链接的**唯一入口**）。
   *  ⛔ 列号的类型与合法性一律**委托 play** —— 别在这里再写一份，两份迟早会漂移。
   *     （`'3,3,4'.split(',')` 忘了 .map(Number) 会在 play 里当场炸，见那边的注释。） */
  function fromMoves(moves) {
    let bd = newBoard();
    for (const c of moves) bd = play(bd, c);
    return bd;
  }

  /** @returns 手数列表的副本（外部改它不许影响棋盘）。
   *  搜索盘不带 mv ⇒ 抛错。这是**设计**不是 bug：搜索盘只许留在求解器内部。 */
  function toMoves(bd) {
    if (!bd.mv) throw new Error('搜索盘不带手数列表');
    return bd.mv.slice();
  }

  const API = {
    W, H, CELLS,
    newBoard, clone, canPlay, play, winner, isFull, isWinningMove,
    hasFourMasks, hasFourFor,
    searchBoard, playIn, undoIn,
    fromMoves, toMoves
  };
  // 与 rules-classic.js / solver.js 对齐：API 对象冻结，挡住 `B.play = ...`、
  // `B.isWinningMove = () => false` 这类把最深的真值源整个换掉的误用（换掉之后
  // 上面每一层仍会「正常工作」，正是本仓最怕的失败模式）。
  // ⚠ 零性能代价，且**只冻结这个容器**：里面全是函数与数字，没有任何数组值 ——
  //   Object.freeze 会把数组踢出 V8 的 fast packed elements（rules-classic 的
  //   _ORDER 实锤减速），所以 newBoard()/searchBoard() **产出**的 a/b/h 数组和
  //   R.moves() 的返回值一律不许冻结。⛔ 别顺手 deep-freeze。
  Object.freeze(API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Bitboard = API;
})(typeof self !== 'undefined' ? self : this);
