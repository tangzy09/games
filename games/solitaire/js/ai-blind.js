// ════════════════════════════════════════
// ai-blind.js — 盲打 AI（**绝不透视暗牌**，只用玩家看得见的信息决策）。
//
// 抽自 tools/sim-blind.js（那边 require 本文件，基线数字不变）。游戏内用它跑
// 「每日挑战 AI 对比」：同一副牌、同样看不见暗牌 —— 它赢不了的局你赢了，
// 是真实的成就（伪社交：零后端、确定性、不可作弊）。
//
// ⚠ 启发式**不许随手调**：7.6% / 32.3% 是公平页印在脸上的数字，
//   改了这里 = 那两个数字作废，必须重跑 sim-blind.js 并改公平页文案。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const Core = isNode ? require('./core.js') : root.Core;
  const R = isNode ? require('./rules-klondike.js') : root.RulesK;
  void Cards;

  /** 局面指纹（用于防循环）—— 只含玩家可见 + 结构信息 */
  function fingerprint(s) {
    return s.tableau.map(c => c.cards.slice(c.cards.length - c.up).join(',') + '|' + (c.cards.length - c.up)).join(';')
      + '#' + s.waste.join(',') + '#' + s.stock.length
      + '#' + s.foundations.map(f => f.length).join(',');
  }

  /** 这一步能不能翻开一张暗牌？（盲打玩家最看重的事） */
  function flipsHidden(s, m) {
    if (m.t === 'tf') {
      const col = s.tableau[m.ti];
      return col.up === 1 && col.cards.length > 1;      // 搬走顶牌后会露出暗牌
    }
    if (m.t === 'tt') {
      const col = s.tableau[m.ti];
      const movedCount = col.cards.length - m.idx;
      return movedCount === col.up && m.idx > 0;        // 整个明牌段被搬走 ⇒ 露出暗牌
    }
    return false;
  }

  /** 会不会清空一列（空列是 Klondike 最值钱的资源） */
  function emptiesColumn(s, m) {
    if (m.t === 'tt') {
      const col = s.tableau[m.ti];
      return m.idx === 0 && col.cards.length === col.up;   // 整列搬走
    }
    if (m.t === 'tf') {
      const col = s.tableau[m.ti];
      return col.cards.length === 1;
    }
    return false;
  }

  /**
   * 给一步打分（启发式，纯盲打）。分越高越先走。
   * 依据：翻暗牌 > 空列 > 收 foundation > 挪动序列 > 翻牌堆
   */
  function scoreMove(s, m) {
    let v = 0;
    if (flipsHidden(s, m)) v += 100;                     // 翻暗牌是第一目标
    if (emptiesColumn(s, m)) v += 60;                    // 清空一列

    if (m.t === 'tf' || m.t === 'wf') {
      const card = m.t === 'tf'
        ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1]
        : s.waste[s.waste.length - 1];
      v += 20;
      if (R.isSafeToAutoPlay(s, card)) v += 15;          // 安全收牌无风险
      else v -= 5;                                        // 过早收牌可能锁死 tableau
    }

    if (m.t === 'wt') v += 15;                            // 从 waste 拿牌（解放 waste 顶）
    if (m.t === 'tt') {
      // ⚠ 一个既不翻暗牌、也不清空列的 tt，只是把序列换个位置 —— **几乎总是坏棋**：
      //    它把牌埋起来、浪费步数，还让 AI 在两列之间来回搬（第一版就栽在这，胜率 0%）。
      v += (flipsHidden(s, m) || emptiesColumn(s, m)) ? 8 : -25;
    }
    if (m.t === 'ft') v -= 40;                            // 从 foundation 取回：几乎总是坏棋（−15 分且倒退）
    if (m.t === 'draw') v += 1;
    if (m.t === 'recycle') v -= 10;                       // 回收有代价（扣分 + 可能绕圈）
    return v;
  }

  /** 跑一局盲打。返回 { won, moves, score }。确定性：同 seed ⇒ 同结果 */
  function playBlind(seed, drawCount, maxMoves) {
    let s = Core.newGame(seed, drawCount);
    const seen = new Map();                               // 指纹 → 见过几次（防循环）
    const MAX = maxMoves || 1200;

    for (let step = 0; step < MAX; step++) {
      if (s.won) break;

      const fp = fingerprint(s);
      const n = (seen.get(fp) || 0) + 1;
      seen.set(fp, n);
      if (n > 6) break;                                   // 同一局面反复出现 ⇒ 真的卡死了（真人也会翻很多轮牌堆）

      const moves = R.legalMoves(s);
      if (!moves.length) break;

      // 打分排序；同分时保持稳定（可复现）
      const scored = moves.map((m, i) => ({ m, v: scoreMove(s, m), i }))
        .sort((a, b) => (b.v - a.v) || (a.i - b.i));

      let played = false;
      for (const { m } of scored) {
        const ev = Core.apply(s, m);
        if (!ev) continue;
        played = true;
        break;
      }
      if (!played) break;
    }
    return { won: s.won, moves: s.moves.length, score: s.score };
  }

  const API = { playBlind, scoreMove, fingerprint };
  if (isNode) module.exports = API;
  else root.AIBlind = API;
})(typeof self !== 'undefined' ? self : this);
