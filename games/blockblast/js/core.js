// ════════════════════════════════════════
// core.js — 棋盘 / 放置 / 消除 / 计分 / streak / SWEEP / game-over / 撤销。
// 纯逻辑，无 DOM，可 node 单测。所有规则的唯一真相在这里（DESIGN §1/§3/§4）。
//
// 术语（DESIGN §1，别混）：
//   回合 turn = 一次落子(place)。streak/计分/计数器一律以落子为单位。
//   一手 hand = 托盘的 3 块。**三块必须全部放完**才补下一手。
//   game over = 托盘中**剩余的每一块都放不下**（不是「任一块放不下」——先放能放的那块，
//               可能消掉一行腾出空间，卡住的块就又能放了）。
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
  /** 可消除的占用格数（**石块不算**）。SWEEP 的 left/before 都用它 ——
   *  否则含石块的关卡永远触发不了 SWEEP（石块占的格子永远清不掉，left 永远 > 0）。*/
  const levelFill = s => {
    if (!s.stone) return fillCount(s.board);
    let n = 0;
    for (let i = 0; i < N; i++) if (s.board[i] && !s.stone[i]) n++;
    return n;
  };

  // ── 消除：填满的整行/整列全清 ──
  // ⚠ 石块（stone）是**不可消除的惰性格**：它占着格子（不能往上放块），
  //   且**含石块的行/列永远消不掉**（DESIGN §6.1）—— 这是关卡的空间约束工具。
  //   所以判「满」时，含石块的行/列直接排除。stone 省略时 = 无尽模式，行为不变。
  function findFullLines(board, stone) {
    const rows = [], cols = [];
    for (let r = 0; r < H; r++) {
      let full = true;
      for (let c = 0; c < W; c++) {
        if (stone && stone[idx(r, c)]) { full = false; break; }   // 含石块 → 这行永远不满
        if (!board[idx(r, c)]) { full = false; break; }
      }
      if (full) rows.push(r);
    }
    for (let c = 0; c < W; c++) {
      let full = true;
      for (let r = 0; r < H; r++) {
        if (stone && stone[idx(r, c)]) { full = false; break; }
        if (!board[idx(r, c)]) { full = false; break; }
      }
      if (full) cols.push(c);
    }
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
      stats: { turns: 0, lines: 0, sweeps: 0, deeps: 0, perfects: 0, maxStreak: 0, bestL: 0 },
      undo: null,                     // 只存 1 步
      // ── 关卡模式（无尽模式下这些是空的，逻辑完全不受影响）──
      mode: 'endless',
      stone: null,                    // 不可消除的惰性格
      crystal: null,                  // 每格的水晶（null = 无）
      goals: null,                    // { blue: 7, pink: 3, ... } 需要收集的数量
      collected: null,                // 已收集
      par: 0,                         // 三星基准落子数（由 verify-levels 标定）
      won: false,
      levelId: null,
      usedUndo: false,
    };
    return s;
  }

  /** 开一个关卡（levelDef 见 levels.js）*/
  function newLevel(def, seed) {
    const s = newGame(seed);
    s.mode = 'level';
    s.levelId = def.id;
    s.par = def.par || 0;
    s.stone = new Array(N).fill(0);
    s.crystal = new Array(N).fill(null);
    s.collected = {};
    (def.stones || []).forEach(([r, c]) => { s.stone[idx(r, c)] = 1; s.board[idx(r, c)] = 1; });
    (def.blocks || []).forEach(([r, c]) => { s.board[idx(r, c)] = 1; });          // 普通预置块（可消）
    (def.crystals || []).forEach(([r, c, kind]) => {
      s.board[idx(r, c)] = 1;                                                      // 水晶长在方块上
      s.crystal[idx(r, c)] = kind;
    });
    // 目标 = 盘上该种水晶的总数（全部收集才算过关）—— 目标数与盘面**永远一致**，不可能凑不齐
    s.goals = {};
    (def.crystals || []).forEach(([, , kind]) => { s.goals[kind] = (s.goals[kind] || 0) + 1; });
    Object.keys(s.goals).forEach(k => { s.collected[k] = 0; });
    return s;
  }

  /** 目标是否全部达成 */
  function goalsMet(s) {
    if (s.mode !== 'level') return false;
    return Object.keys(s.goals).every(k => (s.collected[k] || 0) >= s.goals[k]);
  }

  /**
   * ⚠ 不可胜检测（红队 F4 的第三道防线）—— 关卡模式最致命的坑：
   *   石块永不消 ⇒ 含石块的行/列永远清不掉。若一颗水晶所在的**行和列都含石块**，
   *   它就永远收集不到；而玩家又死不了（总有块能放）⇒ 无限磨、既不 win 也不 lose = 软锁死。
   *   构建期由 levels.validate() 拦住，运行时这里兜底：一旦不可胜 → 立刻判负 + **免费重开**（不推广告）。
   */
  function isUnwinnable(s) {
    if (s.mode !== 'level') return false;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = idx(r, c);
      if (!s.crystal[i]) continue;                       // 只看还留在盘上的水晶
      let rowBlocked = false, colBlocked = false;
      for (let k = 0; k < W; k++) if (s.stone[idx(r, k)]) { rowBlocked = true; break; }
      for (let k = 0; k < H; k++) if (s.stone[idx(k, c)]) { colBlocked = true; break; }
      if (rowBlocked && colBlocked) return true;         // 这颗水晶永远清不掉
    }
    return false;
  }

  /** 三星：按落子数（不限步 ⇒ 不会输，但要三星就得省步）*/
  function starsFor(s) {
    if (!s.par) return 1;
    if (s.usedUndo) return Math.min(2, s.stats.turns <= Math.ceil(s.par * 1.4) ? 2 : 1);  // 用过撤销：最高两星
    if (s.stats.turns <= s.par) return 3;
    if (s.stats.turns <= Math.ceil(s.par * 1.4)) return 2;
    return 1;
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
    crystal: s.crystal ? s.crystal.slice() : null,           // 关卡：撤销必须把已收集的水晶吐回来
    collected: s.collected ? Object.assign({}, s.collected) : null,
    over: s.over, won: s.won, unwinnable: !!s.unwinnable,    // 否则在结算浮层上撤销会「复活」出畸形状态
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
    const before = levelFill(s);                         // SWEEP 的奖励基数：落子前的已占格数（石块不算）

    for (const [dr, dc] of piece.cells) s.board[idx(r + dr, c + dc)] = 1;
    s.placed[slot] = true;
    s.score += piece.size;
    s.stats.turns++;
    events.push({ t: 'place', slot, r, c, piece: piece.id });

    const { rows, cols } = findFullLines(s.board, s.stone);
    const L = rows.length + cols.length;

    if (L > 0) {
      // 收集水晶 —— **只在这里**（该格被消除时）才计数。
      // 这是关卡模式的全部乐趣来源：水晶 = 「必须打通那一行/列」的定点目标。
      const gained = [];
      const collectAt = i => {
        if (s.mode === 'level' && s.crystal && s.crystal[i]) {
          const kind = s.crystal[i];
          s.crystal[i] = null;
          s.collected[kind] = (s.collected[kind] || 0) + 1;
          gained.push({ i, kind });
        }
      };
      for (const rr of rows) for (let cc = 0; cc < W; cc++) { collectAt(idx(rr, cc)); s.board[idx(rr, cc)] = 0; }
      for (const cc of cols) for (let rr = 0; rr < H; rr++) { collectAt(idx(rr, cc)); s.board[idx(rr, cc)] = 0; }

      s.streak++;
      s.dryTurns = 0;
      s.score += clearScore(L, s.streak);
      s.stats.lines += L;
      s.stats.bestL = Math.max(s.stats.bestL || 0, L);      // 单局最大同消条数（成就用）
      events.push({ t: 'clear', rows, cols, L, streak: s.streak });
      if (gained.length) events.push({ t: 'collect', gained });

      const left = levelFill(s);
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

    // ── 关卡模式的结算（顺序要紧：先赢、再不可胜、最后才是 no-moves）──
    if (s.mode === 'level') {
      if (goalsMet(s)) {
        s.won = true; s.over = true;
        events.push({ t: 'win', stars: starsFor(s), turns: s.stats.turns, par: s.par });
        return events;
      }
      if (isUnwinnable(s)) {
        // 软锁死兜底：目标已不可能达成 ⇒ 立刻判负 + **免费重开**（绝不推广告 —— DESIGN §6.2）
        s.over = true;
        events.push({ t: 'unwinnable' });
        return events;
      }
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
    if (u.crystal) s.crystal = u.crystal.slice();
    if (u.collected) s.collected = Object.assign({}, u.collected);
    s.over = u.over; s.won = u.won; s.unwinnable = u.unwinnable;
    s.usedUndo = true;                                       // 用过撤销 ⇒ 最高两星（DESIGN §6.4）
    s.undo = null;
    return true;
  }

  const API = {
    W, H, N, SAVE_VERSION, idx, canPlace, placements, canPlaceAnywhere, fillCount,
    findFullLines, comboTier, streakMult, clearScore, sweepOf,
    newGame, tray, nextHand, remaining, isOver, place, undo, snapshot,
    newLevel, goalsMet, isUnwinnable, starsFor, levelFill,
  };
  if (isNode) module.exports = API;
  else root.Core = API;
})(typeof self !== 'undefined' ? self : this);
