// 标准 7×6 的规则层：着法生成 + 终局判定。求解器只依赖本层，不直接碰 bitboard，
// 将来 Pop Out 换一份 rules 即可复用同一套搜索骨架（⚠ 但 Pop Out 有环，见 DESIGN §1.2）。
(function (root) {
  const B = (typeof module !== 'undefined' && module.exports) ? require('./bitboard.js') : root.Bitboard;

  /** 中路优先——αβ 剪枝效率的关键，中列参与 13 条四连线、边列只有 3 条。
   *  ⛔ Object.freeze：这是**导出的**常量，`moves()` 内部直接遍历它——
   *     外部代码若拿到 R.ORDER 后调用 .reverse()/.sort() 等就地方法，
   *     没有这层冻结的话会静默改坏内部的着法顺序（搜索仍能跑，只是慢几个数量级，
   *     不报错不崩溃，是最难查的一类性能回归）。冻结后这类就地修改在非严格模式下静默失败，
   *     数组内容不变；要拿一份可改的副本，用 R.ORDER.slice()。 */
  const ORDER = Object.freeze([3, 2, 4, 1, 5, 0, 6]);

  function moves(bd) { return ORDER.filter(c => B.canPlay(bd, c)); }

  /** @returns 'WIN_0' | 'WIN_1' | 'DRAW' | null（未终局）
   *  ⚠ 顺序很关键：先判 winner 再判 isFull —— 最后一手同时四连又填满盘面时，
   *    必须报 WIN_x，不许被和局判定抢先（求解器把「最后一手赢」误判成和棋是灾难性的）。 */
  function terminal(bd) {
    const w = B.winner(bd);
    if (w !== null) return 'WIN_' + w;
    return B.isFull(bd) ? 'DRAW' : null;
  }

  /** 当前行棋方一手就能赢的列（按中路优先序）。 */
  function winningMoves(bd) { return moves(bd).filter(c => B.isWinningMove(bd, c)); }

  const API = { ORDER, moves, terminal, winningMoves };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RulesClassic = API;
})(typeof self !== 'undefined' ? self : this);
