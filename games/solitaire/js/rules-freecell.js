// ════════════════════════════════════════
// rules-freecell.js — FreeCell 规则 + 发牌 + 走子。
//
// ⭐ FreeCell 与 Klondike 的**根本区别**（决定了整个产品叙事）：
//   **FreeCell 没有暗牌 —— 52 张全部可见。**
//   ⇒ 「有解」和「你能赢」之间**没有信息差**。solver 看到的和你看到的一模一样。
//   ⇒ 所以这里我们敢说 Klondike 那边**绝对不敢说**的话：
//      「这局有解。你输了，是因为你没找到，不是因为你看不见。」
//   ⇒ 也因此 **FreeCell 不需要可解池**：99.999% 的局本来就有解（32000 局里只有 #11982 无解）。
//
// supermove（一次搬一叠）：能搬的张数 = (1 + 空 free cell 数) × 2^(空列数)。
//   ⚠ **撤销必须是原子的**（一次撤掉整叠，不是撤 15 次单张）——
//     在我们这儿是白送的：撤销 = 重放 move list 到 n−1，而一个 supermove **就是一个 move**。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const { suitOf, rankOf, isRed } = Cards;

  // ── 发牌：微软 FreeCell 的局号（这样玩家能玩「经典 #11982」）──
  // 微软的 LCG：seed = (seed*214013 + 2531011) & 0x7FFFFFFF; rand = seed >> 16
  // ⚠ 微软的花色顺序是 0=♣ 1=♦ 2=♥ 3=♠，我们是 0=♠ 1=♥ 2=♣ 3=♦ ⇒ 必须映射，
  //   否则「#11982」发出来的不是那副传说中的牌，局号这个卖点就是假的。
  const MS_SUIT = [2, 3, 1, 0];               // 微软 suit → 我们的 suit

  function deal(seed) {
    let s = seed >>> 0;
    const rand = () => { s = (Math.imul(s, 214013) + 2531011) & 0x7fffffff; return s >>> 16; };

    // 微软的牌值：rank*4 + msSuit（rank 0=A..12=K）→ 直接映射成我们的 id
    const deck = [];
    for (let i = 0; i < 52; i++) deck.push(rankOf(i) * 4 + MS_SUIT[i & 3]);

    let left = 52;
    const order = [];
    for (let i = 0; i < 52; i++) {
      const j = rand() % left;
      order.push(deck[j]);
      deck[j] = deck[--left];                 // 微软的「拿走后用末尾补位」
    }

    const tableau = Array.from({ length: 8 }, () => ({ cards: [], up: 0 }));
    order.forEach((id, i) => tableau[i % 8].cards.push(id));   // 横向发牌
    tableau.forEach(c => { c.up = c.cards.length; });          // ⭐ 全明牌，没有暗牌
    return { tableau };
  }

  // ── 规则 ──
  const canStack = (card, onto) =>
    isRed(card) !== isRed(onto) && rankOf(card) === rankOf(onto) - 1;
  /**
   * ⚠ **foundation fi 固定只收花色 fi** —— 这一句漏不得（Klondike 那边一直是对的，
   *   FreeCell 这边最初漏了，代价惨重）：
   *   少了它，任何 A 都能进任何空 foundation，而 solver 的局面指纹只记
   *   `foundations.map(f => f.length)` ⇒ 「foundation[0] 放♠A」和「放♥A」**指纹相同** ⇒
   *   不同的局面被当成重复剪掉 ⇒ **有解的路径被剪没了**，solver 烧 15 万节点也解不出一局。
   */
  const canFound = (card, f, fi) =>
    suitOf(card) !== fi ? false
    : f.length ? (rankOf(card) === rankOf(f[f.length - 1]) + 1)
               : rankOf(card) === 0;

  /** 从 idx 起是不是一条合法的可搬序列（交替色降序）*/
  function isValidRun(s, ti, idx) {
    const c = s.tableau[ti].cards;
    if (idx < 0 || idx >= c.length) return false;
    for (let i = idx; i < c.length - 1; i++) if (!canStack(c[i + 1], c[i])) return false;
    return true;
  }

  const freeCount = s => s.free.filter(x => x == null).length;
  const emptyCols = s => s.tableau.filter(c => !c.cards.length).length;

  /**
   * 一次能搬几张：(1 + 空 cell) × 2^(空列)。
   * ⚠ 若**目标本身是空列**，那一列不能算进去（它已经被这次搬运占用了）——
   *   漏了这一条，游戏会允许一个物理上做不到的搬运，玩家能靠它赢下无解的局。
   */
  function maxMove(s, toEmptyCol) {
    const e = emptyCols(s) - (toEmptyCol ? 1 : 0);
    return (1 + freeCount(s)) * Math.pow(2, Math.max(0, e));
  }

  function legalMoves(s) {
    const out = [];
    // free cell → foundation / tableau
    s.free.forEach((id, ci) => {
      if (id == null) return;
      for (let fi = 0; fi < 4; fi++) if (canFound(id, s.foundations[fi], fi)) out.push({ t: 'cf', ci, fi });
      s.tableau.forEach((col, tj) => {
        const top = col.cards[col.cards.length - 1];
        if (!col.cards.length || canStack(id, top)) out.push({ t: 'ct', ci, tj });
      });
    });
    // tableau → foundation / free cell / tableau
    s.tableau.forEach((col, ti) => {
      if (!col.cards.length) return;
      const top = col.cards[col.cards.length - 1];
      for (let fi = 0; fi < 4; fi++) if (canFound(top, s.foundations[fi], fi)) out.push({ t: 'tf', ti, fi });
      const ci = s.free.indexOf(null);
      if (ci >= 0) out.push({ t: 'tc', ti, ci });

      // supermove：从每个合法起点搬到每个合法落点
      for (let idx = col.cards.length - 1; idx >= 0; idx--) {
        if (!isValidRun(s, ti, idx)) break;
        const n = col.cards.length - idx;
        const card = col.cards[idx];
        s.tableau.forEach((dst, tj) => {
          if (tj === ti) return;
          const empty = !dst.cards.length;
          if (n > maxMove(s, empty)) return;
          if (empty || canStack(card, dst.cards[dst.cards.length - 1])) out.push({ t: 'tt', ti, idx, tj });
        });
      }
    });
    return out;
  }

  /** 一张牌收进 foundation 后，还会不会被 tableau 需要（用于「自动收牌」）*/
  function isSafeToAutoPlay(s, card) {
    const r = rankOf(card);
    if (r <= 1) return true;                  // A/2 无条件安全（与 Klondike 同理）
    const need = r - 1;
    // 只有**异色**的 (r−1) 会需要落在这张牌上 ⇒ 异色两门都已收到 ≥ r−1 时，收它是无损的
    const redDone = [1, 3].every(su => {
      const f = s.foundations[su];
      return f.length && rankOf(f[f.length - 1]) >= need;
    });
    const blackDone = [0, 2].every(su => {
      const f = s.foundations[su];
      return f.length && rankOf(f[f.length - 1]) >= need;
    });
    return isRed(card) ? blackDone : redDone;
  }

  const isWon = s => s.foundations.reduce((n, f) => n + f.length, 0) === 52;

  /** 执行一个 move；非法返回 null。返回事件（给动画/音效用）*/
  function apply(s, m) {
    const ev = [];
    if (m.t === 'tf') {
      const col = s.tableau[m.ti];
      const id = col.cards[col.cards.length - 1];
      if (id == null || !canFound(id, s.foundations[m.fi], m.fi)) return null;
      col.cards.pop(); col.up = col.cards.length;
      s.foundations[m.fi].push(id);
      ev.push({ t: 'found', id });
    } else if (m.t === 'cf') {
      const id = s.free[m.ci];
      if (id == null || !canFound(id, s.foundations[m.fi], m.fi)) return null;
      s.free[m.ci] = null;
      s.foundations[m.fi].push(id);
      ev.push({ t: 'found', id });
    } else if (m.t === 'tc') {
      const col = s.tableau[m.ti];
      if (!col.cards.length || s.free[m.ci] != null) return null;
      s.free[m.ci] = col.cards.pop(); col.up = col.cards.length;
      ev.push({ t: 'cell' });
    } else if (m.t === 'ct') {
      const id = s.free[m.ci];
      const dst = s.tableau[m.tj];
      if (id == null) return null;
      if (dst.cards.length && !canStack(id, dst.cards[dst.cards.length - 1])) return null;
      s.free[m.ci] = null;
      dst.cards.push(id); dst.up = dst.cards.length;
      ev.push({ t: 'move' });
    } else if (m.t === 'tt') {
      const src = s.tableau[m.ti], dst = s.tableau[m.tj];
      if (m.ti === m.tj || !isValidRun(s, m.ti, m.idx)) return null;
      const n = src.cards.length - m.idx;
      const empty = !dst.cards.length;
      if (n > maxMove(s, empty)) return null;                 // ⚠ supermove 上限（见 maxMove）
      const card = src.cards[m.idx];
      if (!empty && !canStack(card, dst.cards[dst.cards.length - 1])) return null;
      const run = src.cards.splice(m.idx, n);
      src.up = src.cards.length;
      dst.cards.push(...run); dst.up = dst.cards.length;
      ev.push({ t: 'move', n });
    } else return null;

    // ⚠ **不在这里 push moves** —— 那是 core 的职责（core.replay 会 push，这里再 push 会重复）
    if (isWon(s)) { s.won = true; ev.push({ t: 'win' }); }
    return ev;
  }

  /**
   * ⭐ solver 专用的走法生成 —— legalMoves 的**无损**去冗余版。
   *
   * legalMoves 必须列出玩家能做的**每一件事**（UI 要用）；但那里面绝大多数是冗余的，
   * 直接拿去搜索会把分支因子炸到几十，DFS 烧 200 万节点都解不出一局。
   *
   * 三条剪枝，每一条都**不会剪掉任何通往解的路径**（这点必须守死 ——
   * 剪错一条，有解的局就会被判「无解」，正是这个产品最不能犯的错）：
   *   ① 搬到**非空列**时，run 里能接上目标顶牌的牌**唯一**（rank−1 且异色）⇒ 只生成那一个 idx。
   *   ② 多个**空列彼此等价** ⇒ 只用第一个（搬到哪个空列结果一样）。
   *   ③ 多个**空 free cell 彼此等价** ⇒ 只用第一个。
   */
  function solverMoves(s) {
    const out = [];
    const firstEmptyCol = s.tableau.findIndex(c => !c.cards.length);
    const firstFreeCell = s.free.indexOf(null);

    // free cell → foundation / tableau
    s.free.forEach((id, ci) => {
      if (id == null) return;
      for (let fi = 0; fi < 4; fi++) if (canFound(id, s.foundations[fi], fi)) out.push({ t: 'cf', ci, fi });
      s.tableau.forEach((col, tj) => {
        if (!col.cards.length) { if (tj === firstEmptyCol) out.push({ t: 'ct', ci, tj }); return; }  // ②
        if (canStack(id, col.cards[col.cards.length - 1])) out.push({ t: 'ct', ci, tj });
      });
    });

    s.tableau.forEach((col, ti) => {
      if (!col.cards.length) return;
      const n = col.cards.length;
      const top = col.cards[n - 1];

      for (let fi = 0; fi < 4; fi++) if (canFound(top, s.foundations[fi], fi)) out.push({ t: 'tf', ti, fi });
      if (firstFreeCell >= 0) out.push({ t: 'tc', ti, ci: firstFreeCell });                          // ③

      // 最长可搬序列的起点
      let runStart = n - 1;
      while (runStart > 0 && canStack(col.cards[runStart], col.cards[runStart - 1])) runStart--;

      s.tableau.forEach((dst, tj) => {
        if (tj === ti) return;
        if (!dst.cards.length) {
          if (tj !== firstEmptyCol) return;                                                          // ②
          // 空列可以接 run 的任意后缀 ⇒ 这里**不剪**（空列很少，分支不大；剪了可能丢解）
          for (let idx = runStart; idx < n; idx++) {
            if (idx === 0) continue;                        // 整列搬到空列 = 白搬
            if (n - idx <= maxMove(s, true)) out.push({ t: 'tt', ti, idx, tj });
          }
          return;
        }
        // ① 非空列：能接上的那张**唯一**
        const dt = dst.cards[dst.cards.length - 1];
        for (let idx = runStart; idx < n; idx++) {
          if (canStack(col.cards[idx], dt)) {
            if (n - idx <= maxMove(s, false)) out.push({ t: 'tt', ti, idx, tj });
            break;
          }
        }
      });
    });
    return out;
  }

  const API = { deal, legalMoves, solverMoves, apply, isValidRun, isSafeToAutoPlay, isWon,
                maxMove, freeCount, emptyCols, canStack, canFound };
  if (isNode) module.exports = API;
  else root.RulesF = API;
})(typeof self !== 'undefined' ? self : this);
