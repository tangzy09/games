// ════════════════════════════════════════
// rules-spider.js — Spider（蜘蛛纸牌）规则 + 发牌 + 走子。三合一的第三块。
//
// ⭐ 与前两种玩法的**根本区别**（决定它在本作里的定位）：
//   Spider **不筛可解局、solver 帮不上忙**（104 张的状态空间远超 Klondike，4 花色人类胜率 <10%）。
//   ⇒ 它是唯一**兑现不了「已验证可解」卖点**的玩法 —— 所以 UI 上绝不给它打「✓ 有解」角标，
//     也不进可解池。它在这里的价值是**品类覆盖**（spider solitaire 是这个品类第三大搜索词）。
//   ⇒ 但**难度分档是诚实的**：1 花色 ≈ 新手可通、4 花色 ≈ 硬核，这是规则本身给的，不是我们编的。
//
// ⚠ 牌 id 是 **0..103**（两副）：`id % 52` 才是牌面 ⇒ 取 rank/suit 一律先 %52。
//   忘了取模 = rankOf 返回 13..25，一切比较静默失效（没有报错，只是永远搬不动牌）。
//
// ⚠ 两个**复合动作**必须原子（DESIGN §1.4 红队 S12）：
//   ① `deal10` 一次给 10 列各发一张；② 凑齐 K→A 同花 13 张**自动移走**。
//   在我们这儿是白送的：撤销 = 重放 move list 到 n−1，**一个复合动作就是一个 move**。
//
// ⚠ 「发牌前不许有空列」**不是死锁**（空列永远能被任意单牌填上），但玩家点了 stock 却
//   「什么都没发生」= 经典的「这是不是 bug」投诉 ⇒ UI 必须给明确反馈（见 main.js 的 toast）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const Deal = isNode ? require('./deal.js') : root.Deal;
  const { rankOf, suitOf } = Cards;

  const COLS = 10;
  const face = id => id % 52;                    // ⚠ 两副牌:先取模再看点数/花色
  const rk = id => rankOf(face(id));
  const st = id => suitOf(face(id));

  /**
   * 发牌：104 张（两副），suits ∈ {1,2,4} 决定用几种花色。
   * 10 列：前 4 列 6 张、后 6 列 5 张（共 54），每列仅顶牌明；余 50 张 = 5 次 × 10 张。
   */
  function deal(seed, suits) {
    const n = suits === 1 ? 1 : suits === 2 ? 2 : 4;
    // 构造 104 张 = **8 个 13 张的副本**（1 花色 = 8 副 ♠；2 花色 = ♠♥ 各 4 副；4 花色 = 每花色 2 副）。
    // ⚠ id = copy*52 + rank*4 + suit，copy 0..7 ⇒ id 上限 415，**不是 103**。
    //   （曾按「两副」写成 copy 0..1 ⇒ 1 花色时 104 张里只有 26 个唯一 id，单测当场抓出。）
    const deck = [];
    for (let k = 0; k < 104; k++) {
      const rank = k % 13;
      const copy = Math.floor(k / 13);                     // 0..7
      const suit = [0, 1, 2, 3][copy % n];                 // ♠♥♣♦ 取前 n 种
      deck.push(copy * 52 + rank * 4 + suit);
    }
    const rand = Deal.rng(seed);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    const tableau = [];
    let p = 0;
    for (let c = 0; c < COLS; c++) {
      const cnt = c < 4 ? 6 : 5;
      tableau.push({ cards: deck.slice(p, p + cnt), up: 1 });   // 只有顶牌明
      p += cnt;
    }
    return { tableau, stock: deck.slice(p) };                   // 50 张待发
  }

  // ── 规则 ──
  /** 叠放：**不看花色**，只要点数刚好小 1（这是 Spider 与另两种玩法最大的手感差异）*/
  const canStack = (card, onto) => rk(card) === rk(onto) - 1;

  /** 从 idx 起是不是可整体搬动的序列：**必须同花且连续降序**（叠得下 ≠ 搬得动）*/
  function isValidRun(s, ti, idx) {
    const c = s.tableau[ti].cards;
    if (idx < 0 || idx >= c.length) return false;
    const nDown = c.length - s.tableau[ti].up;
    if (idx < nDown) return false;                       // 暗牌不能搬
    for (let i = idx; i < c.length - 1; i++) {
      if (st(c[i]) !== st(c[i + 1])) return false;       // 同花
      if (rk(c[i + 1]) !== rk(c[i]) - 1) return false;   // 连续降序
    }
    return true;
  }

  /** 空列收任何牌；否则点数差 1（不看花色）*/
  function canToTableau(s, card, tj) {
    const col = s.tableau[tj];
    if (!col.cards.length) return true;
    return canStack(card, col.cards[col.cards.length - 1]);
  }

  /** 有空列吗（发牌的前置条件）*/
  const hasEmptyCol = s => s.tableau.some(c => c.cards.length === 0);

  /** 这一列尾部是不是刚好凑成同花 K→A 的完整 13 张 */
  function completedAt(s, ti) {
    const col = s.tableau[ti];
    const c = col.cards;
    if (c.length < 13) return -1;
    const start = c.length - 13;
    if (c.length - col.up > start) return -1;            // 这 13 张必须全是明牌
    if (rk(c[start]) !== 12 || rk(c[c.length - 1]) !== 0) return -1;   // K 打头、A 收尾
    for (let i = start; i < c.length - 1; i++) {
      if (st(c[i]) !== st(c[i + 1])) return -1;
      if (rk(c[i + 1]) !== rk(c[i]) - 1) return -1;
    }
    return start;
  }

  /** 翻开该列顶端的暗牌（搬走牌之后）*/
  function flipIfNeeded(s, ti, ev) {
    const col = s.tableau[ti];
    if (col.cards.length && col.up === 0) {
      col.up = 1;
      ev.push({ t: 'flip', ti, card: col.cards[col.cards.length - 1] });
    }
  }

  /**
   * 收走所有已完成的同花组（自动，且是**同一个 move 的一部分** ⇒ undo 整体回滚）。
   * 每组 +100 分（微软计分）。
   */
  function collect(s, ev) {
    let again = true;
    while (again) {
      again = false;
      for (let ti = 0; ti < s.tableau.length; ti++) {
        const at = completedAt(s, ti);
        if (at < 0) continue;
        const col = s.tableau[ti];
        const grp = col.cards.splice(at, 13);
        col.up = Math.max(0, col.up - 13);
        s.foundations.push(grp);                       // foundations = 已完成的 8 组
        s.score += 100;
        ev.push({ t: 'complete', ti, suit: st(grp[0]), n: s.foundations.length });
        flipIfNeeded(s, ti, ev);
        again = true;                                  // 移走后可能又露出一组
      }
    }
  }

  /** 全部合法走法（提示/AI 用；⚠ 不含 deal，翻牌由 UI 单独给）*/
  function legalMoves(s) {
    const out = [];
    for (let ti = 0; ti < s.tableau.length; ti++) {
      const col = s.tableau[ti];
      const nDown = col.cards.length - col.up;
      for (let idx = nDown; idx < col.cards.length; idx++) {
        if (!isValidRun(s, ti, idx)) continue;
        const card = col.cards[idx];
        for (let tj = 0; tj < s.tableau.length; tj++) {
          if (tj === ti) continue;
          if (!canToTableau(s, card, tj)) continue;
          // ⚠ 整列搬到另一个空列 = 无意义空转（同 Klondike 的 K 空列空转）
          if (idx === nDown && nDown === 0 && !s.tableau[tj].cards.length) continue;
          out.push({ t: 'tt', ti, idx, tj });
        }
      }
    }
    return out;
  }

  /** 走一步。返回事件数组，非法返回 null（不改状态）*/
  function apply(s, m) {
    const ev = [];
    if (m.t === 'tt') {
      const from = s.tableau[m.ti], to = s.tableau[m.tj];
      if (!from || !to || m.ti === m.tj) return null;
      if (!isValidRun(s, m.ti, m.idx)) return null;
      const card = from.cards[m.idx];
      if (card == null || !canToTableau(s, card, m.tj)) return null;
      const moved = from.cards.splice(m.idx);
      from.up = Math.max(0, from.up - moved.length);
      to.cards.push(...moved);
      to.up += moved.length;
      ev.push({ t: 'move', card, n: moved.length, to: { p: 't', i: m.tj } });
      flipIfNeeded(s, m.ti, ev);
    } else if (m.t === 'deal10') {
      // ⚠ 复合动作①:一次给 10 列各发一张。**有空列就不许发**(微软规则)
      if (!s.stock.length) return null;
      if (hasEmptyCol(s)) return null;
      const dealt = [];
      for (let ti = 0; ti < s.tableau.length && s.stock.length; ti++) {
        const id = s.stock.pop();
        s.tableau[ti].cards.push(id);
        s.tableau[ti].up++;
        dealt.push(id);
      }
      ev.push({ t: 'deal10', cards: dealt });
    } else {
      return null;
    }
    s.score -= 1;                       // 微软计分:每走一步 −1(含 undo,那是重放出来的)
    collect(s, ev);                     // ⚠ 复合动作②:自动收走完成的组
    // ⛔ **`s.won` 必须在这里置位**（2026-08-01 实测 bug）：core.apply 对 Spider 是**提前 return**
    //   的分支，走不到它末尾那句 `if (R.isWon(s)) s.won = true` ⇒ 集齐 8 组后 won 恒 false，
    //   结算屏（画在 `s.won` 上）**永远不出**，玩家赢了却像卡在空盘面上。
    //   FreeCell 的规则里有这一行，Spider 漏了 —— 三种玩法各自 return 的结构就是这么埋雷的。
    if (isWon(s)) { s.won = true; ev.push({ t: 'win' }); }
    return ev;
  }

  /** 8 组全部完成 = 赢 */
  const isWon = s => s.foundations.length >= 8;

  /** autoplay 的安全判定：Spider 没有「收进 foundation」的手动动作 ⇒ 恒 false */
  const isSafeToAutoPlay = () => false;

  const API = { COLS, deal, canStack, canToTableau, isValidRun, legalMoves, apply, isWon,
                completedAt, hasEmptyCol, isSafeToAutoPlay, face, rk, st };
  if (isNode) module.exports = API;
  else root.RulesS = API;
})(typeof self !== 'undefined' ? self : this);
