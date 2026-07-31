// ════════════════════════════════════════
// bitboard.js — connect4 位棋盘（标准 7×6）。**整个产品的正确性地基**：
// 求解器、AI 阶梯、分层提示、赛后复盘、16 课全部压在这个文件上。它错了，一切静默地跟着错。
//
// 表示：每列一个 6 位掩码，bit r = 该列第 r 行（r=0 是最底行）。
//   a[c] = 先手在第 c 列的掩码   b[c] = 后手   h[c] = 该列已有子数
// 为什么是「按列」而不是 49 位打包（DESIGN §9.1）：
//   1. 所有位运算都在**列内**完成 ⇒ 全部落在 32 位安全区，不用两个半字拼接，不用 BigInt；
//   2. **斜线结构性不可能跨越棋盘边缘** —— 相邻列是两个独立的数，横/斜的 c+3<W 循环
//      本身就是边界，不靠任何「哨兵行/边界掩码」这类事后补救（那类补救一旦漏一处就是静默错）；
//   3. 同理，第 5 行与下一列第 0 行不会被竖向串起来（打包表示法的经典陷阱）。
//      tests/test-bitboard.js 有两条专门钉死这两个不变量的用例，⛔ 别删。
//
// 存档策略见 DESIGN §9.3：存的是**手数列表**（mv），不是局面快照栈 ——
// 撤销/中断恢复/「从第 N 步重来」/一条 URL 分享整局，都由 fromMoves 重放白送。
// 因此 play 必须是**纯函数**（返回新盘，绝不就地改）。
// ════════════════════════════════════════
(function (root) {
  const W = 7, H = 6, CELLS = W * H;

  /** @returns 新棋盘。a=先手各列掩码 b=后手 h=各列已有子数 turn=0|1 n=总手数 mv=手数列表 */
  function newBoard() {
    return {
      a: [0, 0, 0, 0, 0, 0, 0],
      b: [0, 0, 0, 0, 0, 0, 0],
      h: [0, 0, 0, 0, 0, 0, 0],
      turn: 0, n: 0, mv: []
    };
  }

  function clone(bd) {
    return {
      a: bd.a.slice(), b: bd.b.slice(), h: bd.h.slice(),
      turn: bd.turn, n: bd.n, mv: bd.mv.slice()
    };
  }

  function canPlay(bd, c) { return c >= 0 && c < W && bd.h[c] < H; }

  /** 纯函数：返回落子后的新棋盘，绝不就地修改（存档/撤销/复盘全靠这条）。 */
  function play(bd, c) {
    const nb = clone(bd);
    const bit = 1 << nb.h[c];
    if (nb.turn === 0) nb.a[c] |= bit; else nb.b[c] |= bit;
    nb.h[c]++; nb.n++; nb.mv.push(c); nb.turn ^= 1;
    return nb;
  }

  /**
   * 某一方的列掩码数组是否含四连。
   * ⛔ 绝对不许为了让某条测试变绿而放松这里的条件——错了是静默的灾难。
   * 四个方向都只用「同列内移位 + 相邻列按位与」，没有任何跨棋盘边缘的可能。
   */
  function hasFour(m) {
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

  /** @returns 0 | 1 | null（尚未分出胜负，含和局——和局用 isFull 另判） */
  function winner(bd) {
    if (hasFour(bd.a)) return 0;
    if (hasFour(bd.b)) return 1;
    return null;
  }

  function isFull(bd) { return bd.n >= CELLS; }

  /** 落这一子会不会当场赢（求解器热路径，避免建完整新盘）。不修改 bd。 */
  function isWinningMove(bd, c) {
    if (!canPlay(bd, c)) return false;
    const m = (bd.turn === 0 ? bd.a : bd.b).slice();
    m[c] |= 1 << bd.h[c];
    return hasFour(m);
  }

  /** 重放手数列表建盘（存档/撤销/分享链接的唯一入口）。非法着法必须抛错，不许静默吃掉。 */
  function fromMoves(moves) {
    let bd = newBoard();
    for (const c of moves) {
      if (!canPlay(bd, c)) throw new Error('非法着法：列 ' + c + ' 已满或越界');
      bd = play(bd, c);
    }
    return bd;
  }

  /** @returns 手数列表的副本（外部改它不许影响棋盘） */
  function toMoves(bd) { return bd.mv.slice(); }

  const API = {
    W, H, CELLS,
    newBoard, clone, canPlay, play, winner, isFull, isWinningMove, hasFour, fromMoves, toMoves
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Bitboard = API;
})(typeof self !== 'undefined' ? self : this);
