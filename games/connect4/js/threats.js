// ════════════════════════════════════════
// threats.js —— 威胁格的计算（P2b Task 4 · DESIGN §6.4）。
//
// 「新手读不出『我有个三连、他也有个三连』，所以他们玩的是一个平淡的游戏。」
// ⇒ **一步就能成四的格子标出来，两方用不同标记。** 本文件只回答「哪些格」，怎么画在 render.js。
// ⭐ P2b Task 5 把 §6.4 **下半**也放在这里：`forkOf(before, after)` = 「**形成**双威胁的那一刻」。
//   同一个文件是故意的 —— 两个判据用的是同一批 `isWinningMove`，「零搜索」这条红线
//   （连同 tests/test-threats.js 的源码级检查）就只有这一个文件要守。
// ⭐ P2b Task 6 又加了一条同源的：`missedWin(moves, loser)` = §6.6「你差一手就赢了」。
//   它同样只用 isWinningMove ⇒ 「让输不疼」里唯一**现在就能兑现**的那半条不欠求解器的债。
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

  /**
   * ⭐⭐ 「**形成**双威胁的那一刻」（P2b Task 5 · DESIGN §6.4 下半）——整个游戏最精彩的
   * 战术瞬间。判据同样**零搜索**（≤14 次 isWinningMove），⛔ 与本文件其余部分同一条红线。
   *
   * @param before 落子**之前**的盘（bd.turn = 刚要落子的那一方）
   * @param after  落子**之后**的盘（bd.turn = 对方）
   * @returns null（不是双威胁）或 { player, cells:[{c,r}] }（cells 按列号升序，长度 ≥ 2）
   *
   * ⭐ 判据是**三条**，缺一条这个功能就会在真实对局里变成噪音：
   *   ① after 里刚落子那一方有 **≥ 2 个**「一步成四」的落点 —— 这才叫双威胁
   *      （重力四子棋里每列只有一个落点 ⇒ 两个落点必在两列 ⇒ 对方只堵得住一个）；
   *   ② before 里他 **< 2** —— ⭐⭐ 这一条是「**形成**的那一刻」的全部含义：
   *      ⛔ 只判 ①（计划里那句「用 winningMoves 的长度即可」的字面读法）的话，
   *      双威胁一旦形成就**每一手都成立**（对方堵不掉两个），于是从这一手起
   *      直到分出胜负，**每落一子都要放一次特效 + 响一次 fork 音** —— 这正是
   *      「⚠ 别刷屏」那条要挡的东西，而且它是判据层的问题，用冷却只能盖住一半；
   *   ③ after **非终局** —— 这一手直接连四了就归赢局庆祝（§6.3），⛔ 两套庆祝不许叠在一帧。
   *
   * ⚠ 这里判的是「**战术上的**双威胁」，不是「求解器认定的必胜」：对方可能自己也有一个
   *   即将成四的点、可以抢先赢。要判「真的赢定了」就得搜 ⇒ 每手 1.7 秒的断崖（§9.2），
   *   ⛔ 绝不做。§6.4 要的本来就是「让新手看见这个**局面形状**」，不是宣布胜负。
   */
  function forkOf(before, after) {
    if (!before || !after || !before.h || !after.h) return null;
    // 参数顺序反了 / 不是相邻的两个局面 ⇒ 什么都不报（⛔ 别硬算：那会在错的一帧放特效）
    if (after.n !== before.n + 1) return null;
    const mover = before.turn;
    if (after.turn === mover) return null;
    if (R.terminal(before) !== null) return null;
    if (R.terminal(after) !== null) return null;              // ③ 连四了 ⇒ 归赢局庆祝
    if (R.winningMoves(before).length >= 2) return null;      // ② 之前就已经是双威胁 ⇒ 不是「形成」
    const ob = B.clone(after); ob.turn = mover;               // ⭐ 换回刚落子那一方的视角（同 cells）
    const w = R.winningMoves(ob);
    if (w.length < 2) return null;                            // ①
    return {
      player: mover,
      // ⚠ winningMoves 是中路优先序 ⇒ 这里排成列序（渲染与门禁都要稳定的顺序）
      cells: w.slice().sort((x, y) => x - y).map(c => ({ c: c, r: after.h[c] }))
    };
  }

  /**
   * ⭐⭐ 「你差一手就赢了」（P2b Task 6 · DESIGN §6.6「让输不疼」）。
   *
   * §6.6：「求解器知道『你差一手就赢了』——那就说出来。」
   * ⭐ 这一条**零搜索就能兑现**：把这一局重放一遍，找 `loser` 曾经站在「一步就能成四」
   *   面前的**最早**那一手。判据与本文件其余部分是同一批 `isWinningMove`（≤7 次/手、
   *   一整局 ≤ 42×7 次，微秒级），⛔ 一次都不碰求解器。
   *
   * ⚠⚠ 这句话的**真值边界**（⛔ 绝不许越过）：
   *   · 说得出口的是「那一手你有一个落下去**当场连四**的列」—— 重力四子棋里每列只有一个
   *     落点，`winningMoves` 非空 = 落下去立刻四连 = 立刻赢，是**可当场核验的事实**；
   *   · ⛔ **不是**「你本来赢定了」/「这一手是你的败因」—— 那要搜索才敢说（§9.2 的断崖），
   *     属于 P3 的精准度与转折点。⇒ 文案也必须停在事实那一侧（locales 的 nearWin*）。
   *
   * @param moves 这一局的落子列序列（= C4State 的 `g.moves`）
   * @param loser 输掉的那一方 0|1
   * @param startBd ⭐ **重放的起点盘**，默认空盘。⚠ **让子局必须传**（P2c Task 1 · DESIGN §6.7）：
   *   预置子不在 `moves` 里 ⇒ 从空盘重放出来的是**另一个局面**，于是这句话会指着一手根本
   *   不存在的「制胜手」说「你差一手就赢了」—— 而画面上一切正常、零报错。
   *   ⛔ 别在这里 require state.js 去自己取盘（那会把「零搜索的表现层」接到存档层上）：
   *     调用方传 `C4State.boardOf(C4State.rewindTo(g, 0))` 即可，那正好就是「只有预置子」的盘。
   *   ⚠ 认不出的 startBd（不是盘）⇒ 退回空盘，⛔ 不抛：本文件全是给每帧/结算调的表现层判据。
   * @returns null（没有过这样的一手 / 参数不对）或 { player, ply, cols }
   *   ply  = **1-based 的手序**（「第 ply 手该他走」，与 UI 上说的「第 N 手」同一个数）
   *   cols = 那一刻的制胜列（列序）
   */
  function missedWin(moves, loser, startBd) {
    if (!Array.isArray(moves) || (loser !== 0 && loser !== 1)) return null;
    const ok = startBd && Array.isArray(startBd.a) && Array.isArray(startBd.b)
      && Array.isArray(startBd.h) && Number.isInteger(startBd.turn) && Number.isInteger(startBd.n);
    let bd = ok ? B.clone(startBd) : B.newBoard();   // ⚠ clone：⛔ 绝不就地改调用方的盘
    for (let i = 0; i < moves.length; i++) {
      // ⚠ 两道前置：
      //   ① 只看**轮到 loser**的局面（问对手有没有制胜手是另一回事）；
      //   ② 必须**非终局** —— R.winningMoves 不查终局（rules-classic.js 那段警告：
      //      先手已经四连时它照样会报后手某一列是「制胜手」）。
      //      ⚠ 说实话：**当前调用路径够不着这一层**（`g.moves` 恒止于终局，
      //      最后一次检查的是终局前那一盘）。它是**契约的一部分**：谁把一条「走过头」的
      //      线传进来（P3 的复盘 / 假想线很可能会），少了它就会对着一个**已经结束**的盘
      //      说「你差一手就赢了」—— 正是 §6.6 最不该出的那种假话。
      //      ⇒ tests/test-threats.js 用一条**故意走过头**的序列把这一道钉住（⛔ 别删成死代码）。
      if (bd.turn === loser && R.terminal(bd) === null) {
        const w = R.winningMoves(bd);
        if (w.length) return { player: loser, ply: i + 1, cols: w.slice().sort((a, b) => a - b) };
      }
      if (!B.canPlay(bd, moves[i])) return null;   // 坏数据 ⇒ **什么都不说**（⛔ 别编）
      bd = B.play(bd, moves[i]);
    }
    return null;
  }

  const API = { cells, forPlayer, forkOf, missedWin };
  // 与 P1 五个模块同样冻结（`C4Threats.cells = () => []` 会让高亮静默消失，画面照常）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Threats = API;
})(typeof self !== 'undefined' ? self : this);
