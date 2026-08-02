// ════════════════════════════════════════
// threats.js —— 威胁格的计算（P2b Task 4 · DESIGN §6.4 上半）。
//
// 「新手读不出『我有个三连、他也有个三连』，所以他们玩的是一个平淡的游戏。」
// ⇒ **一步就能成四的格子标出来，两方用不同标记。** 本文件只回答「哪些格」，怎么画在 render.js。
//
// ⛔⛔ 本文件的头号红线：**判据必须是零搜索的。**
//   DESIGN §9.2 的断崖：n=10..15 的 `scoreAll` 中位 1,678 ms / 尾部 3,952 ms，而这一段
//   **每局必经**。威胁高亮是**每一帧**都要的东西 —— 一旦它走求解器，整局就是一段一段的卡顿，
//   而且是那种「看起来只是掉帧」的、没人会去怀疑求解器的卡顿。
//   ⇒ 判据是每个可落列一次 `B.isWinningMove`（P1 已优化成「借位算完还回去」，微秒级），
//     ⛔ 局中绝不许出现 `Solver.scoreAll` / `Solver.solve` / `EngineClient.scores`。
//   ⭐ 这条写成了断言：tests/e2e-p2b-t4.cjs 整局跑完 `EngineClient.scores` 必须**调用 0 次**
//     （用真实鼠标下完一整局人机，同时 `EngineClient.ai` 计数 > 0 ⇒ 证明引擎通道确实在用，
//      只是威胁这条路没碰它）。
//   ⚠ 本文件同时被 tests/test-threats.js 做源码级检查：不许出现 Solver / EngineClient /
//     scoreAll 这些词 —— 「注释里写了不许搜」和「真的没搜」是两件事。
//
// ⚠⚠ 「对方的威胁」必须换**对手视角**：`B.clone(bd)` 之后 `turn ^= 1` 再问 winningMoves。
//   ⛔ 直接在原盘上问只会拿到当前行棋方的那一半 —— 画面上就是「只有我有威胁」，
//     而这条提示存在的全部理由正是让新手看见**对方**那个三连。
//   ⛔ 也别图省事就地翻 `bd.turn` 再翻回来：bd 是 C4State.boardOf 交出来的对外盘，
//     中途抛一次错就永久地把先后手翻了（而且盘面照常能画，零报错）。clone 是微秒级的。
//
// 坐标约定与 render.js 同一套：**r = 0 是最底行**；威胁格恒是某一列的**落点格**（重力）——
// 「一步就能成四」按定义就只可能发生在落点上，上方那些格子这一手够不着。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);
  const B = inNode ? require('./bitboard.js') : root.Bitboard;
  const R = inNode ? require('./rules-classic.js') : root.RulesClassic;

  /**
   * 这个盘面上「一步就能成四」的格子。
   *
   * @param bd bitboard 形状的盘面（对外盘或搜索盘都行，**不会被修改**）
   * @returns [{ c, r, players }]，按列号升序；`players` 是 [0] / [1] / **[0,1]**（同一格
   *   两方都能赢 —— 那正是全局最关键的一格，render 会把两个标记都画出来）。
   *   ⚠ 已终局（有人连四 / 满盘）一律返回 **[]**：胜负已定还标「一步能赢」是纯噪音，
   *     而且 R.winningMoves **不检查终局**（rules-classic.js:53-56 那段警告），
   *     先手已经四连时它照样会报后手的某一列是「制胜手」。
   */
  function cells(bd) {
    if (!bd || !bd.h || !bd.a || !bd.b) return [];
    if (R.terminal(bd) !== null) return [];

    const me = bd.turn;
    const mine = R.winningMoves(bd);                 // ≤ 7 次 isWinningMove（借位算完还回去）
    const ob = B.clone(bd); ob.turn ^= 1;            // ⭐ 对手视角（见文件头）
    const theirs = R.winningMoves(ob);               // 再 ≤ 7 次 —— 全部预算就这 14 次

    const byCol = new Map();
    const add = (c, p) => {
      let e = byCol.get(c);
      if (!e) { e = { c: c, r: bd.h[c], players: [] }; byCol.set(c, e); }
      if (e.players.indexOf(p) < 0) e.players.push(p);
    };
    for (const c of mine) add(c, me);
    for (const c of theirs) add(c, me ^ 1);

    const out = Array.from(byCol.values());
    out.sort((x, y) => x.c - y.c);                   // ⚠ winningMoves 是**中路优先序**，不是列序；
    for (const e of out) e.players.sort();           //   渲染与门禁都想要稳定的列序
    return out;
  }

  /** 某一方一步能赢的格子（复盘 / 课程将来会分别要一边）。 */
  function forPlayer(bd, player) {
    return cells(bd).filter(t => t.players.indexOf(player) >= 0);
  }

  const API = { cells, forPlayer };
  // 与 P1 五个模块同样冻结（`C4Threats.cells = () => []` 会让高亮静默消失，画面照常）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Threats = API;
})(typeof self !== 'undefined' ? self : this);
