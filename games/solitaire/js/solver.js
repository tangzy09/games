// ════════════════════════════════════════
// solver.js — Klondike 求解器（thoughtful / 透视暗牌）。**纯 JS，node 与浏览器共用同一份**。
//
// ⭐ 为什么自己写而不是引 lonelybot(Rust/WASM) 或 Solvitaire(GPL)：
//   1. **它必须与我们的 rules-klondike.js 规则完全一致** —— 否则「已验证可解」是系统性谎言
//      （红队 F2）。用同一份 core.apply 推演，这个问题从根上消失。
//   2. node 离线建池 + 浏览器实时判定「这局还有解吗」**同一份代码**，零 WASM、零 GPL。
//
// ⚠ 它**透视暗牌**（thoughtful solitaire）—— 这正是论文那 81.9% 的口径。
//   ⇒ 它说「有解」**不等于**玩家能赢（玩家看不见暗牌）。措辞红线见 DESIGN §2.1。
//
// 返回：{ result: 'win' | 'dead' | 'unknown', moves: [...], nodes: n }
//   'unknown' = 超过节点/时间预算 —— ⛔ **绝不把「不知道」说成「有解」**。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Core = isNode ? require('./core.js') : root.Core;
  const R = isNode ? require('./rules-klondike.js') : root.RulesK;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const { rankOf } = Cards;

  /** 紧凑克隆（比 JSON 快一个数量级；solver 每个节点都要克隆）*/
  function clone(s) {
    return {
      v: s.v, seed: s.seed, drawCount: s.drawCount,
      tableau: s.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
      stock: s.stock.slice(),
      waste: s.waste.slice(),
      foundations: s.foundations.map(f => f.slice()),
      moves: [],                          // solver 不需要在克隆里记历史（外面单独存路径）
      score: s.score, recycles: s.recycles, won: s.won,
      usedUndo: false, usedHint: false, usedSolver: false,
    };
  }

  /** 局面指纹（透视：包含暗牌，因为 solver 看得见）*/
  function key(s) {
    let k = '';
    // 列的顺序无关（两列内容互换是同一个局面）⇒ 排序后再拼，能砍掉大量重复
    const cols = s.tableau.map(c => c.cards.join(',') + '/' + c.up).sort();
    k = cols.join(';') + '#' + s.waste.join(',') + '#' + s.stock.join(',');
    return k;
  }

  const foundTotal = s => s.foundations.reduce((a, f) => a + f.length, 0);

  /** 走法排序：好棋先试（决定了 solver 的实际速度）*/
  function orderMoves(s, moves) {
    const val = m => {
      if (m.t === 'wf' || m.t === 'tf') {
        const card = m.t === 'tf'
          ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1]
          : s.waste[s.waste.length - 1];
        return R.isSafeToAutoPlay(s, card) ? 100 : 60;    // 安全收牌几乎总是对的
      }
      if (m.t === 'tt') {
        const col = s.tableau[m.ti];
        const flips = m.idx > 0 && col.cards.length - m.idx === col.up;   // 翻暗牌
        const empties = m.idx === 0 && col.cards.length === col.up;       // 清空列
        return flips ? 80 : (empties ? 50 : 10);
      }
      if (m.t === 'wt') return 40;
      if (m.t === 'draw') return 20;
      if (m.t === 'recycle') return 5;
      if (m.t === 'ft') return 1;                          // 取回：几乎总是坏棋，最后试
      return 0;
    };
    return moves.map((m, i) => ({ m, v: val(m), i }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i))
      .map(x => x.m);
  }

  /**
   * 求解。opts: { maxNodes, timeoutMs }
   * ⚠ 超预算返回 'unknown' —— 诚实红线：不知道就说不知道。
   */
  function solve(state, opts) {
    const o = opts || {};
    const MAX_NODES = o.maxNodes || 200000;
    const TIMEOUT = o.timeoutMs || 0;                      // 0 = 不限时（离线建池用）
    const t0 = Date.now();

    const seen = new Set();
    let nodes = 0;
    let timedOut = false;
    const path = [];

    function dfs(s) {
      if (s.won || foundTotal(s) === 52) return true;
      if (++nodes > MAX_NODES) { timedOut = true; return false; }
      if (TIMEOUT && (nodes & 255) === 0 && Date.now() - t0 > TIMEOUT) { timedOut = true; return false; }

      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);

      // ⭐ 关键剪枝：**安全收牌直接走，不分支**。
      //    一张「安全」的牌（不可能再被 tableau 需要）收进 foundation 永远不会变坏 ——
      //    所以没必要为它开一个分支。这一条把搜索树砍掉一大截。
      const forced = R.legalMoves(s).find(m => {
        if (m.t !== 'tf' && m.t !== 'wf') return false;
        const card = m.t === 'tf'
          ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1]
          : s.waste[s.waste.length - 1];
        return R.isSafeToAutoPlay(s, card);
      });
      if (forced) {
        const next = clone(s);
        if (Core.apply(next, forced, { replay: true })) {
          path.push(forced);
          if (dfs(next)) return true;
          path.pop();
          return false;                       // 安全收牌是无损的 ⇒ 不必再试别的分支
        }
      }

      for (const m of orderMoves(s, R.legalMoves(s))) {
        const next = clone(s);
        if (!Core.apply(next, m, { replay: true })) continue;
        path.push(m);
        if (dfs(next)) return true;
        path.pop();
        if (timedOut) return false;
      }
      return false;
    }

    const won = dfs(clone(state));
    return {
      result: won ? 'win' : (timedOut ? 'unknown' : 'dead'),
      moves: won ? path.slice() : [],
      nodes,
      ms: Date.now() - t0,
    };
  }

  /** 便捷：直接从 seed 求解一整局 */
  function solveSeed(seed, drawCount, opts) {
    return solve(Core.newGame(seed, drawCount), opts);
  }

  const API = { solve, solveSeed, clone, key };
  if (isNode) module.exports = API;
  else root.Solver = API;
})(typeof self !== 'undefined' ? self : this);
