// ════════════════════════════════════════
// rules-klondike.js — Klondike 的**全部规则**，纯函数，无 DOM。
//
// ⚠ 这个文件是「本局存在解法」这个承诺的**真相来源**：
//   离线 solver 导出的解，会用**这里的规则**逐步重放验证（DESIGN §2.4）。
//   solver 的建模假设与这里差一处，池里标「可解」的牌局在游戏里就可能真的无解。
//   ⇒ 下面每一条边界都必须显式、可测、有据可依。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;

  const { suitOf, rankOf, isRed } = Cards;

  // ── 位置表示（move list 里用的就是它）──
  //   { p: 'stock' } | { p: 'waste' } | { p: 'f', i: 0..3 } | { p: 't', i: 0..6, n: 从该列末尾数第 n 张起 }

  /** 一张牌能否放上 foundation（同花、比顶牌大 1；空 foundation 只接 A）*/
  function canToFoundation(s, card, fi) {
    if (suitOf(card) !== fi) return false;               // foundation i 固定收 suit i
    const f = s.foundations[fi];
    return f.length === 0 ? rankOf(card) === 0 : rankOf(card) === rankOf(f[f.length - 1]) + 1;
  }

  /** 一张牌（及其下面带的序列）能否放到 tableau 第 ti 列（交替色降序；空列只放 K）*/
  function canToTableau(s, card, ti) {
    const col = s.tableau[ti].cards;
    if (col.length === 0) return rankOf(card) === 12;    // ⚠ 空列只放 K（含 K 打头的序列）
    const top = col[col.length - 1];
    if (!isFaceUp(s, ti, col.length - 1)) return false;  // 顶牌是暗牌 ⇒ 不能往上放
    return isRed(top) !== isRed(card) && rankOf(top) === rankOf(card) + 1;
  }

  /** 第 ti 列、下标 idx 的牌是不是明牌（末尾 up 张为明）*/
  function isFaceUp(s, ti, idx) {
    const col = s.tableau[ti];
    return idx >= col.cards.length - col.up;
  }

  /** 从第 ti 列的 idx 位置起，到列尾，是不是一个合法的可搬序列（交替色降序，且全明）*/
  function isValidRun(s, ti, idx) {
    const col = s.tableau[ti].cards;
    if (!isFaceUp(s, ti, idx)) return false;
    for (let k = idx; k + 1 < col.length; k++) {
      const a = col[k], b = col[k + 1];
      if (rankOf(a) !== rankOf(b) + 1 || isRed(a) === isRed(b)) return false;
    }
    return true;
  }

  /**
   * ⭐ autoplay 的「安全收牌」判定。
   *
   * 经典规则：一张牌可以无脑收 ⟺ **两个异色花色的 foundation 都已到 rank−1**
   *   （即：不可能再有牌需要落在它上面）
   *
   * ⚠ 但它在 rank ≤ 2（A 和 2）时**过于保守，是个真 bug**（红队 S12）：
   *   黑 2 收走后，**没有任何牌需要它承接** —— 红 A 会直接进 foundation，不需要落在黑 2 上。
   *   保守的后果：玩家看着一张明明该收的 2 不被自动收走，觉得「它怎么不收」。
   *   ⇒ **rank <= 1（0-based：A 和 2）无条件安全。**
   */
  function isSafeToAutoPlay(s, card) {
    const r = rankOf(card);
    if (r <= 1) return true;                             // ⚠ A / 2 无条件安全（见上）
    // 两个异色花色的 foundation 都到了 r-1（0-based 比较）
    const wantRed = !isRed(card);                        // 需要检查的是**异色**的两门
    let ok = true;
    for (let fi = 0; fi < 4; fi++) {
      const dummy = fi;                                  // suit fi 的颜色
      const fiRed = (fi & 1) === 1;
      if (fiRed !== wantRed) continue;                   // 只看异色的两门
      const f = s.foundations[fi];
      const top = f.length ? rankOf(f[f.length - 1]) : -1;
      if (top < r - 1) { ok = false; break; }
    }
    return ok;
  }

  // ── 合法移动枚举（hint / AI / solver 都用它）──
  /** 返回当前所有合法移动（move 对象数组）*/
  function legalMoves(s) {
    const out = [];

    // waste 顶牌 → foundation / tableau
    if (s.waste.length) {
      const c = s.waste[s.waste.length - 1];
      for (let fi = 0; fi < 4; fi++) if (canToFoundation(s, c, fi)) out.push({ t: 'wf', fi });
      for (let ti = 0; ti < 7; ti++) if (canToTableau(s, c, ti)) out.push({ t: 'wt', ti });
    }

    for (let ti = 0; ti < 7; ti++) {
      const col = s.tableau[ti].cards;
      if (!col.length) continue;

      // 列顶牌 → foundation
      const top = col[col.length - 1];
      for (let fi = 0; fi < 4; fi++) if (canToFoundation(s, top, fi)) out.push({ t: 'tf', ti, fi });

      // 列内任一合法序列 → 另一列
      const upStart = col.length - s.tableau[ti].up;
      for (let idx = upStart; idx < col.length; idx++) {
        if (!isValidRun(s, ti, idx)) continue;
        const card = col[idx];
        for (let tj = 0; tj < 7; tj++) {
          if (tj === ti) continue;
          // ⚠ 把整列的 K 搬到另一个空列 = 无意义的空转（solver 会绕圈）⇒ 禁掉
          if (s.tableau[tj].cards.length === 0 && idx === 0 && col.length === s.tableau[ti].up) continue;
          if (canToTableau(s, card, tj)) out.push({ t: 'tt', ti, idx, tj });
        }
      }
    }

    // foundation → tableau（标准计分 −15；solver 需要它，某些局非取回不可）
    for (let fi = 0; fi < 4; fi++) {
      const f = s.foundations[fi];
      if (!f.length) continue;
      const c = f[f.length - 1];
      for (let ti = 0; ti < 7; ti++) if (canToTableau(s, c, ti)) out.push({ t: 'ft', fi, ti });
    }

    if (s.stock.length) out.push({ t: 'draw' });
    else if (s.waste.length) out.push({ t: 'recycle' });

    return out;
  }

  const isWon = s => s.foundations.reduce((a, f) => a + f.length, 0) === 52;

  const API = {
    canToFoundation, canToTableau, isFaceUp, isValidRun, isSafeToAutoPlay, legalMoves, isWon,
  };
  if (isNode) module.exports = API;
  else root.RulesK = API;
})(typeof self !== 'undefined' ? self : this);
