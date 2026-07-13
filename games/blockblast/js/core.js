// ════════════════════════════════════════
// core.js — 棋盘 / 放置 / 消除 / 计分 / streak / SWEEP / game-over / 撤销。
// 纯逻辑，无 DOM，可 node 单测。所有规则的唯一真相在这里（DESIGN §1/§3/§4）。
//
// 术语（DESIGN §1，别混）：
//   回合 turn = 一次落子(place)。streak/计分/计数器一律以落子为单位。
//   一手 hand = 托盘的 3 块。**三块必须全部放完**才补下一手。
//   game over = 托盘中**剩余的任一块**无处可放（不是「三块都放不下」）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Pieces = isNode ? require('./pieces.js') : root.Pieces;
  const Dealer = isNode ? require('./dealer.js') : root.Dealer;

  const W = 8, H = 8, N = W * H;
  const SAVE_VERSION = 1;

  const idx = (r, c) => r * W + c;
  const inBounds = (r, c) => r >= 0 && r < H && c >= 0 && c < W;

  // ── 放置 ──
  function canPlace(board, piece, r, c) {
    for (const [dr, dc] of piece.cells) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc) || board[idx(rr, cc)]) return false;
    }
    return true;
  }
  function placements(board, piece) {
    const out = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (canPlace(board, piece, r, c)) out.push([r, c]);
    return out;
  }
  const canPlaceAnywhere = (board, piece) => {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (canPlace(board, piece, r, c)) return true;
    return false;
  };
  const fillCount = board => board.reduce((a, v) => a + (v ? 1 : 0), 0);

  // ── 消除：填满的整行/整列全清 ──
  function findFullLines(board) {
    const rows = [], cols = [];
    for (let r = 0; r < H; r++) { let full = true; for (let c = 0; c < W; c++) if (!board[idx(r, c)]) { full = false; break; } if (full) rows.push(r); }
    for (let c = 0; c < W; c++) { let full = true; for (let r = 0; r < H; r++) if (!board[idx(r, c)]) { full = false; break; } if (full) cols.push(c); }
    return { rows, cols };
  }

  // ── 计分（DESIGN §3：streak 是主引擎，多消只是锦上添花）──
  const comboTier = L => (L <= 0 ? 0 : L === 1 ? 1.0 : L === 2 ? 1.5 : L === 3 ? 2.2 : 3.0);
  const streakMult = s => 1 + 0.5 * Math.min(Math.max(s - 1, 0), 6);   // 7 连封顶 ×4（模拟校准：最长 streak 中位 = 7）
  const clearScore = (L, streak) => Math.round(20 * L * comboTier(L) * streakMult(streak));

  // ── SWEEP 梯度（DESIGN §4）：奖励挂钩「本次落子前的已占格数」before ⇒ 清空盘的价值随盘面涨。
  //    ⚠ SWEEP_FLOOR：盘面不到 16 格时**一律不触发** —— 否则开局空盘上顺手清掉 8 格就能拿一大笔
  //    （单测抓到的：8×30+300 = 540 分 ≈ 中位一局总分 1698 的三分之一 = 可稳定复现的白嫖套路）。
  //    「清盘」要成为壮举，前提是那盘面本来很满。
  const SWEEP_FLOOR = 16;
  function sweepOf(left, before) {
    if (before < SWEEP_FLOOR) return null;
    if (left === 0)  return { kind: 'perfect', score: before * 30 + 300, streak: 3 };
    if (left <= 4)   return { kind: 'deep',    score: before * 15,       streak: 2 };
    if (left <= 8)   return { kind: 'sweep',   score: before * 8,        streak: 1 };
    return null;
  }

  // ── 新局 ──
  function newGame(seed) {
    const s = {
      v: SAVE_VERSION,
      seed: seed >>> 0,
      streamIndex: 0,                 // 当前一手在块流中的起点
      board: new Array(N).fill(0),
      placed: [false, false, false],  // 当前一手里，哪几块已经放下
      score: 0, streak: 0, dryTurns: 0,
      over: false,
      stats: { turns: 0, lines: 0, sweeps: 0, deeps: 0, perfects: 0, maxStreak: 0 },
      undo: null,                     // 只存 1 步
    };
    return s;
  }

  /** 当前托盘：已放下的槽位为 null */
  const tray = s => Dealer.hand(s.seed, s.streamIndex).map((p, i) => (s.placed[i] ? null : p));
  /** 下一手预览（块流是预生成的 ⇒ 预览天然成立，且绝不会被偷偷换掉）*/
  const nextHand = s => Dealer.hand(s.seed, s.streamIndex + 3);
  /** 托盘里还没放下的块 */
  const remaining = s => tray(s).filter(Boolean);

  /**
   * game over = 剩余的**每一块**都无处可放。
   *
   * ⚠ 不是「任一块放不下就结束」（这是最初的错，实机被玩家一眼看穿）：
   *   托盘剩 2 块、一块能放一块不能，玩家有权先把能放的放下 ——
   *   那一步可能**消掉一行、腾出空间**，原本放不下的块就又能放了。
   *   只有当所有剩余块都塞不进去，才真的没救。
   */
  function isOver(s) {
    const rem = remaining(s);
    if (!rem.length) return false;                       // 刚好放完，等补牌
    return rem.every(p => !canPlaceAnywhere(s.board, p));
  }

  const snapshot = s => ({
    streamIndex: s.streamIndex, board: s.board.slice(), placed: s.placed.slice(),
    score: s.score, streak: s.streak, dryTurns: s.dryTurns, stats: Object.assign({}, s.stats),
  });

  /**
   * 落子。slot ∈ {0,1,2}，(r,c) = 拼块 bounding box 左上角在棋盘上的位置。
   * 返回事件数组（供 fx/音效消费）；非法落子返回 null 且不改状态。
   */
  function place(s, slot, r, c) {
    if (s.over) return null;
    const t = tray(s);
    const piece = t[slot];
    if (!piece || !canPlace(s.board, piece, r, c)) return null;

    s.undo = snapshot(s);                                // 撤销只需 1 步；streamIndex 在内 ⇒ 撤销不会刷出不同的块
    const events = [];
    const before = fillCount(s.board);                   // SWEEP 的奖励基数：落子前的已占格数

    for (const [dr, dc] of piece.cells) s.board[idx(r + dr, c + dc)] = 1;
    s.placed[slot] = true;
    s.score += piece.size;
    s.stats.turns++;
    events.push({ t: 'place', slot, r, c, piece: piece.id });

    const { rows, cols } = findFullLines(s.board);
    const L = rows.length + cols.length;

    if (L > 0) {
      for (const rr of rows) for (let cc = 0; cc < W; cc++) s.board[idx(rr, cc)] = 0;
      for (const cc of cols) for (let rr = 0; rr < H; rr++) s.board[idx(rr, cc)] = 0;

      s.streak++;
      s.dryTurns = 0;
      s.score += clearScore(L, s.streak);
      s.stats.lines += L;
      events.push({ t: 'clear', rows, cols, L, streak: s.streak });

      const left = fillCount(s.board);
      const sw = sweepOf(left, before);
      if (sw) {
        s.score += sw.score;
        s.streak += sw.streak;
        if (sw.kind === 'perfect') s.stats.perfects++;
        else if (sw.kind === 'deep') s.stats.deeps++;
        else s.stats.sweeps++;
        events.push({ t: 'sweep', kind: sw.kind, score: sw.score });
      }
    } else {
      s.dryTurns++;
      // 宽限：连续 2 次零消除才断（手气差的一步不该毁掉苦心经营的连击）。
      // 宽限中的那一次：streak 保持不变、也不增长。
      if (s.dryTurns >= 2) s.streak = 0;
    }
    s.stats.maxStreak = Math.max(s.stats.maxStreak, s.streak);

    // 三块全放完 → 补下一手（这是唯一的补牌时机）
    if (s.placed.every(Boolean)) {
      s.streamIndex += 3;
      s.placed = [false, false, false];
      events.push({ t: 'refill' });
    }

    if (isOver(s)) { s.over = true; events.push({ t: 'over' }); }
    return events;
  }

  /** 撤销上一步（含棋盘/分数/streak/streamIndex/统计的精确复原）*/
  function undo(s) {
    if (!s.undo) return false;
    const u = s.undo;
    s.streamIndex = u.streamIndex; s.board = u.board.slice(); s.placed = u.placed.slice();
    s.score = u.score; s.streak = u.streak; s.dryTurns = u.dryTurns;
    s.stats = Object.assign({}, u.stats);
    s.over = false;
    s.undo = null;
    return true;
  }

  const API = {
    W, H, N, SAVE_VERSION, idx, canPlace, placements, canPlaceAnywhere, fillCount,
    findFullLines, comboTier, streakMult, clearScore, sweepOf,
    newGame, tray, nextHand, remaining, isOver, place, undo, snapshot,
  };
  if (isNode) module.exports = API;
  else root.Core = API;
})(typeof self !== 'undefined' ? self : this);
