// ════════════════════════════════════════
// core.js — 状态 / 走子 / 撤销 / 计分 / 统计。纯逻辑，无 DOM，可 node 单测。
//
// ⭐ 撤销 = **重放 move list 到 n−1 步**，不是快照栈（DESIGN §8.1）：
//    · 存档只需 `seed + moves[]`（几百字节），不是几百个盘面快照
//    · 「恢复后不能撤销」是这个品类的经典一星 —— 重放方案天然没这个问题
//    · 白送「回放 / 分享解法」，也正是 verify-deals.js 验证 solver 解的机制
//    前提：`deal.js` 是可复现的纯函数（已在那里写死）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const Deal = isNode ? require('./deal.js') : root.Deal;
  const R = isNode ? require('./rules-klondike.js') : root.RulesK;

  const SAVE_VERSION = 1;
  const { rankOf } = Cards;

  /** 开局（纯函数：同 seed + 同 drawCount ⇒ 完全相同的一局）*/
  function newGame(seed, drawCount) {
    const d = Deal.klondike(seed);
    return {
      v: SAVE_VERSION,
      seed: seed >>> 0,
      drawCount: drawCount === 1 ? 1 : 3,     // ⚠ 开局前属性，局中不可改（改了可解性角标就失效）
      tableau: d.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
      stock: d.stock.slice(),                 // 末尾 = 下一张要翻的
      waste: [],
      foundations: [[], [], [], []],          // 按花色 0..3
      moves: [],                              // ⭐ 唯一的历史真相；撤销靠重放它
      score: 0,
      recycles: 0,
      won: false,
      // 统计口径（DESIGN §4.5）：无限撤销会把胜率架空 ⇒ 必须分开记
      usedUndo: false,
      usedHint: false,
      usedSolver: false,                      // 用过「还有解吗？」
    };
  }

  // ── 计分（Windows 标准计分）──
  function addScore(s, n) { s.score = Math.max(0, s.score + n); }

  /**
   * 走一步。move 见 rules.legalMoves() 的形状。
   * 返回事件数组（供 fx/音效消费）；非法则返回 null 且不改状态。
   */
  function apply(s, m, opts) {
    if (s.won) return null;
    const rec = !(opts && opts.replay);      // 重放时不再往 moves 里记
    const ev = [];

    const flipIfNeeded = ti => {
      const col = s.tableau[ti];
      if (col.cards.length && col.up === 0) {
        col.up = 1;
        addScore(s, 5);                       // 翻开一张暗牌 +5
        ev.push({ t: 'flip', ti, card: col.cards[col.cards.length - 1] });
      }
    };

    switch (m.t) {
      case 'draw': {
        if (!s.stock.length) return null;
        const n = Math.min(s.drawCount, s.stock.length);
        const drawn = [];
        for (let k = 0; k < n; k++) drawn.push(s.stock.pop());   // ⚠ 顺序：栈顶先出
        for (const c of drawn) s.waste.push(c);
        ev.push({ t: 'draw', cards: drawn });
        break;
      }
      case 'recycle': {
        if (s.stock.length || !s.waste.length) return null;
        // ⚠ 回收**保序**：waste 反转回 stock ⇒ 下一轮翻牌顺序与第一轮相同。
        //    这一条直接改变可解率,必须与离线 solver 的模型一致（DESIGN §1.4/§2.4）。
        s.stock = s.waste.reverse();
        s.waste = [];
        s.recycles++;
        addScore(s, s.drawCount === 1 ? -100 : -20);   // draw-1 过一遍 −100；draw-3 每次 −20
        ev.push({ t: 'recycle' });
        break;
      }
      case 'wf': {                              // waste → foundation
        if (!s.waste.length) return null;
        const c = s.waste[s.waste.length - 1];
        if (!R.canToFoundation(s, c, m.fi)) return null;
        s.waste.pop();
        s.foundations[m.fi].push(c);
        addScore(s, 10);
        ev.push({ t: 'toFoundation', card: c, fi: m.fi });
        break;
      }
      case 'wt': {                              // waste → tableau
        if (!s.waste.length) return null;
        const c = s.waste[s.waste.length - 1];
        if (!R.canToTableau(s, c, m.ti)) return null;
        s.waste.pop();
        const col = s.tableau[m.ti];
        col.cards.push(c);
        col.up++;
        addScore(s, 5);
        ev.push({ t: 'move', card: c, to: { p: 't', i: m.ti } });
        break;
      }
      case 'tf': {                              // tableau 顶牌 → foundation
        const col = s.tableau[m.ti];
        if (!col.cards.length) return null;
        const c = col.cards[col.cards.length - 1];
        if (!R.canToFoundation(s, c, m.fi)) return null;
        col.cards.pop();
        col.up = Math.max(0, col.up - 1);
        s.foundations[m.fi].push(c);
        addScore(s, 10);
        ev.push({ t: 'toFoundation', card: c, fi: m.fi });
        flipIfNeeded(m.ti);
        break;
      }
      case 'tt': {                              // tableau 序列 → tableau
        const from = s.tableau[m.ti], to = s.tableau[m.tj];
        if (m.idx >= from.cards.length) return null;
        if (!R.isValidRun(s, m.ti, m.idx)) return null;
        const card = from.cards[m.idx];
        if (!R.canToTableau(s, card, m.tj)) return null;
        const moved = from.cards.splice(m.idx);
        from.up -= moved.length;
        if (from.up < 0) from.up = 0;
        to.cards.push(...moved);
        to.up += moved.length;
        ev.push({ t: 'move', card, n: moved.length, to: { p: 't', i: m.tj } });
        flipIfNeeded(m.ti);
        break;
      }
      case 'ft': {                              // foundation → tableau（取回）
        const f = s.foundations[m.fi];
        if (!f.length) return null;
        const c = f[f.length - 1];
        if (!R.canToTableau(s, c, m.ti)) return null;
        f.pop();
        const col = s.tableau[m.ti];
        col.cards.push(c);
        col.up++;
        addScore(s, -15);                       // 取回 −15
        ev.push({ t: 'move', card: c, to: { p: 't', i: m.ti } });
        break;
      }
      default: return null;
    }

    if (rec) s.moves.push(m);
    if (R.isWon(s)) { s.won = true; ev.push({ t: 'win' }); }
    return ev;
  }

  /** 从头重放一串 move（用于撤销 / 存档恢复 / 验证 solver 的解）*/
  function replay(seed, drawCount, moves) {
    const s = newGame(seed, drawCount);
    for (const m of moves) {
      if (!apply(s, m, { replay: true })) return null;   // 任何一步非法 ⇒ 整条 move list 无效
      s.moves.push(m);
    }
    return s;
  }

  /** 撤销一步 = 重放到 n−1（⚠ 会打上 usedUndo，统计口径见 DESIGN §4.5）*/
  function undo(s) {
    if (!s.moves.length) return null;
    const next = replay(s.seed, s.drawCount, s.moves.slice(0, -1));
    if (!next) return null;
    next.usedUndo = true;                       // 一旦用过就永久留痕（「零撤销胜率」靠它）
    next.usedHint = s.usedHint;
    next.usedSolver = s.usedSolver;
    return next;
  }

  /** 一次 autoplay 能收的所有牌（安全判定见 rules.isSafeToAutoPlay）*/
  function autoPlayMoves(s) {
    const out = [];
    const sim = replay(s.seed, s.drawCount, s.moves);   // 在副本上推演
    for (let guard = 0; guard < 60; guard++) {
      let did = false;
      for (const m of R.legalMoves(sim)) {
        if (m.t !== 'tf' && m.t !== 'wf') continue;
        const card = m.t === 'tf'
          ? sim.tableau[m.ti].cards[sim.tableau[m.ti].cards.length - 1]
          : sim.waste[sim.waste.length - 1];
        if (!R.isSafeToAutoPlay(sim, card)) continue;
        apply(sim, m);
        out.push(m);
        did = true;
        break;
      }
      if (!did) break;
    }
    return out;
  }

  const API = { SAVE_VERSION, newGame, apply, replay, undo, autoPlayMoves, addScore };
  if (isNode) module.exports = API;
  else root.Core = API;
})(typeof self !== 'undefined' ? self : this);
