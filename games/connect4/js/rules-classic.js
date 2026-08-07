// 标准 7×6 的规则层：着法生成 + 终局判定。求解器只依赖本层，不直接碰 bitboard，
// 将来 Pop Out 换一份 rules 即可复用同一套搜索骨架（⚠ 但 Pop Out 有环，见 DESIGN §1.2）。
(function (root) {
  const B = (typeof module !== 'undefined' && module.exports) ? require('./bitboard.js') : root.Bitboard;

  /** 中路优先——αβ 剪枝效率的关键，中列参与 13 条四连线、边列只有 3 条。
   *  ⛔ 内部热路径走 _ORDER（**不冻结**）、对外只导出冻结副本 ORDER，两件事都必须要：
   *     · 对外必须冻结：ORDER 若与 moves() 共享同一个数组引用，外部一次
   *       `R.ORDER.reverse()` 就会把中路优先静默改成边路优先——搜索仍能跑，只是慢
   *       几个数量级，不报错不崩溃，是最难查的一类性能回归。
   *     · 内部绝不能冻结：Object.freeze 会把数组踢出 V8 的 fast packed elements
   *       （`%HasFastPackedElements` 由 true 变 false），`Array.prototype.filter`
   *       随之退化到通用慢路径。code review 提出后本地用独立 negamax 基准复核过：
   *       深度 11 / ~45 万节点，按 DESIGN §9.1 的方法（独立进程、5 次取中位、
   *       看区间重不重叠）测得「_ORDER 不冻结」中位 18.54 M nps（区间 [17.8, 27.15]）
   *       vs 「同样代码但把 _ORDER 也冻结」中位 13.59 M nps（区间 [13.49, 13.93]）——
   *       区间不重叠，确认真实存在、且方向一致的减速，直接吃掉 DESIGN §9.1 的预算
   *       （gen-book.js 跑一夜还是三夜、Worker 同预算下能不能多搜 1-2 层）。
   *     ⛔ 别把这两步搞反：`Object.freeze(_ORDER)` 会把 _ORDER 自己也降级，白做。
   *     外部要拿一份可改的副本，`R.ORDER.slice()`（对外 ORDER 已冻结，slice 出的
   *     副本不冻结，可以随便改）。 */
  const _ORDER = [3, 2, 4, 1, 5, 0, 6];
  const ORDER = Object.freeze(_ORDER.slice());

  /** ⚠ 不检查终局：调用方必须先 terminal(bd) 非 null 就返回，别再调 moves()。
   *  在已分胜负的盘上它照样会返回非空列表（已终局的盘依然可能有空列）。
   *  @returns 新数组（每次调用重新 filter，调用方就地 sort/reverse 返回值不会
   *  污染下一次调用——negamax 加 move-ordering 启发式时几乎一定会这么做）。 */
  function moves(bd) { return _ORDER.filter(c => B.canPlay(bd, c)); }

  /** 终局枚举。⛔ 别在别处手写 'WIN_0'/'WIN_1' 这类字面量，也别再用字符串拼接构造它——
   *  跨模块的枚举只要各写一次就会漂移（同类 bug 在 solitaire 出过实锤：Solver 返回
   *  'win'、UI 判 'solvable'，`===` 永不成立，每个有解开局全被静默报成死局，
   *  没有任何一处报错）。消费端一律走 winnerOf(t) / isWin(t)：函数名打错会抛
   *  TypeError（响），字符串字面量打错只是静默 false（哑）——这就是全部区别。 */
  const WIN = Object.freeze(['WIN_0', 'WIN_1']);   // 下标即玩家号，WIN[0]='WIN_0' 等
  const DRAW = 'DRAW';

  /** @returns WIN_0 | WIN_1（用 R.WIN 比较，别用字面量） | DRAW | null（未终局）
   *  ⚠ 顺序很关键：先判 winner 再判 isFull —— 最后一手同时四连又填满盘面时，
   *    必须报 WIN_x，不许被和局判定抢先（求解器把「最后一手赢」误判成和棋是灾难性的）。 */
  function terminal(bd) {
    const w = B.winner(bd);
    if (w !== null) return WIN[w];
    return B.isFull(bd) ? DRAW : null;
  }

  /** terminal() 返回值 → 赢家 0/1；和局与未终局都是 null（区分和局用 `t === R.DRAW`）。 */
  function winnerOf(t) { return t === WIN[0] ? 0 : (t === WIN[1] ? 1 : null); }
  /** terminal() 返回值是否表示某一方获胜（DRAW / null 都是 false）。 */
  function isWin(t) { return t === WIN[0] || t === WIN[1]; }

  /** 当前行棋方一手就能赢的列（按中路优先序）。
   *  ⚠ 同样不检查终局：在已分胜负的盘上它照样返回非空列表（曾实测：先手已四连时，
   *  它仍会报后手的 [4] 是"制胜手"）。negamax 里少一句 terminal() 前置检查，就会
   *  穿过终局节点继续往下搜，结果全错且零报错。 */
  function winningMoves(bd) { return moves(bd).filter(c => B.isWinningMove(bd, c)); }

  const API = { ORDER, moves, terminal, winningMoves, WIN, DRAW, winnerOf, isWin };
  // API 本身也冻结：不在热路径上（只是属性读取，不走 filter，不受 elements-kind 影响），
  // 冻结没有性能代价，却能挡住 `R.moves = () => [0]` 这类把整个函数换掉的误用/攻击面。
  Object.freeze(API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RulesClassic = API;
})(typeof self !== 'undefined' ? self : this);
