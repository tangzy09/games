// ════════════════════════════════════════
// coach.js — 运行时求解器/教练。纯逻辑（无 DOM），可 node 单测。
//
// 为什么值得做：这个游戏**早就有一个参考 AI**（tools/verify-levels.js，用来算关卡通关率），
// 但它只跑在构建期，玩家一辈子见不到。而 solitaire 的经验是：把求解器搬到运行时，
// 它同时长出**提示 / 复盘 / 妙手 / 我的弱点**四样东西 —— 全是别家 Block-Blast 仿品没有的。
//
// ⛔ 与公平承诺的关系（必须守住）：教练**只看当前盘面 + 公开的块流**（Dealer.stream 是纯函数，
//   玩家自己在公平页也能查）。它不改变发块、不改变规则，只是把「你本来就能算出来的东西」算给你看。
//   `dealer.js` 的签名一个字都不用动。
//
// ⚠ 这里的评估函数**故意不与 tools/verify-levels.js 共用**：那个是关卡通关率门禁的地面真值，
//   改它 = 所有 par 和通关率要重标（30 关 × 200 局）。这份偏「活得久」（无尽为主），
//   两者各自为政，谁都不会悄悄污染谁。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Core = isNode ? require('./core.js') : root.Core;

  const W = 8, H = 8;
  const idx = (r, c) => r * W + c;

  /** 状态深拷贝（模拟用；Core.place 直接吃它）*/
  function clone(s) {
    const c = Object.assign({}, s);
    c.board = s.board.slice();
    c.placed = s.placed.slice();
    c.stats = Object.assign({}, s.stats);
    c.stone = s.stone ? s.stone.slice() : null;
    c.crystal = s.crystal ? s.crystal.slice() : null;
    c.collected = s.collected ? Object.assign({}, s.collected) : null;
    c.undo = null;
    return c;
  }

  /** 孤格 = 四邻（含边界）全被占的空格 —— 它几乎判死刑，是本作最该躲的东西 */
  function isolatedCount(board) {
    let n = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (board[idx(r, c)]) continue;
      let nb = 0;
      if (r === 0 || board[idx(r - 1, c)]) nb++;
      if (r === H - 1 || board[idx(r + 1, c)]) nb++;
      if (c === 0 || board[idx(r, c - 1)]) nb++;
      if (c === W - 1 || board[idx(r, c + 1)]) nb++;
      if (nb === 4) n++;
    }
    return n;
  }

  /**
   * 「还放得下大件吗」——生存的真正瓶颈不是空格数，是**空格的形状**。
   * 3×3 方块和 5 长条是块流里最难安置的两种；能放它们的位置数 = 这盘面还有多少余地。
   */
  function roomScore(board) {
    let big = 0, line = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (r <= H - 3 && c <= W - 3) {
        let ok = true;
        for (let dr = 0; dr < 3 && ok; dr++) for (let dc = 0; dc < 3; dc++) if (board[idx(r + dr, c + dc)]) { ok = false; break; }
        if (ok) big++;
      }
      if (c <= W - 5) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (board[idx(r, c + k)]) { ok = false; break; }
        if (ok) line++;
      }
      if (r <= H - 5) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (board[idx(r + k, c)]) { ok = false; break; }
        if (ok) line++;
      }
    }
    return { big, line };
  }

  /** 盘面好坏（越大越好）。无尽 = 活得久；关卡 = 打通有水晶的那条线 */
  function evalBoard(s, board) {
    let filled = 0;
    for (let i = 0; i < 64; i++) if (board[i]) filled++;
    const room = roomScore(board);
    let v = -filled - isolatedCount(board) * 14 + room.big * 9 + room.line * 2;

    if (s.mode === 'level' && s.crystal) {
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (!s.crystal[idx(r, c)]) continue;
        let rowGap = 0, colGap = 0, rowStone = false, colStone = false;
        for (let k = 0; k < 8; k++) {
          if (s.stone[idx(r, k)]) rowStone = true; else if (!board[idx(r, k)]) rowGap++;
          if (s.stone[idx(k, c)]) colStone = true; else if (!board[idx(k, c)]) colGap++;
        }
        v -= Math.min(rowStone ? 99 : rowGap, colStone ? 99 : colGap) * 6;
      }
    }
    return v;
  }

  /** 试放一手，返回落子后的盘面与收益（不改原状态）*/
  function simulate(s, board, piece, r, c) {
    const b = board.slice();
    for (const [dr, dc] of piece.cells) b[idx(r + dr, c + dc)] = 1;
    const { rows, cols } = Core.findFullLines(b, s.stone);
    let crystals = 0;
    for (const rr of rows) for (let cc = 0; cc < W; cc++) { if (s.crystal && s.crystal[idx(rr, cc)]) crystals++; b[idx(rr, cc)] = 0; }
    for (const cc of cols) for (let rr = 0; rr < H; rr++) { if (s.crystal && s.crystal[idx(rr, cc)]) crystals++; b[idx(rr, cc)] = 0; }
    return { board: b, L: rows.length + cols.length, crystals };
  }

  /** 所有合法落点，按「这一手有多好」降序。空数组 = 无路可走（= game over 的定义）*/
  function rankMoves(s) {
    const out = [];
    if (!s || s.over) return out;
    const tray = Core.tray(s);
    const isoBefore = isolatedCount(s.board);
    for (let slot = 0; slot < 3; slot++) {
      const p = tray[slot];
      if (!p) continue;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (!Core.canPlace(s.board, p, r, c)) continue;
        const sim = simulate(s, s.board, p, r, c);
        const v = evalBoard(s, sim.board) + sim.L * 34 + sim.crystals * 500;
        out.push({ slot, r, c, v, L: sim.L, crystals: sim.crystals,
                   iso: isolatedCount(sim.board) - isoBefore });
      }
    }
    out.sort((a, b) => b.v - a.v);
    return out;
  }

  /** 当前局面的最优一手（提示按钮用）*/
  function best(s) {
    const m = rankMoves(s);
    return m.length ? m[0] : null;
  }

  /**
   * 从当前局面开始，按最优策略**还能再走几步**（贪心，limit 步封顶）。
   * 这是「你其实还有救」这句话的地面真值 —— 不是启发式口号。
   */
  function survive(s, limit) {
    const cap = limit == null ? 30 : limit;
    const c = clone(s);
    let n = 0;
    while (n < cap && !c.over) {
      const m = best(c);
      if (!m) break;
      Core.place(c, m.slot, m.r, m.c);
      n++;
    }
    return n;
  }

  // ── 评价玩家的一手（**落子前**调用，拿的是当时的局面）──
  /**
   * 返回 { grade, tag, best, rank, total }：
   *   grade: 'brilliant' 妙手 ✨ | 'good' | 'ok' | 'miss' 失误
   *   tag:   'missLine'（放着能消的行不消）| 'isolate'（这一手造了孤格）| null
   *
   * ⛔ 只在两头说话：妙手（正反馈）和失误（教学）。中间一律闭嘴 ——
   *   每一手都点评的教练是烦人精，不是教练。
   */
  function judge(s, mv) {
    const all = rankMoves(s);
    if (!all.length) return null;
    const i = all.findIndex(m => m.slot === mv.slot && m.r === mv.r && m.c === mv.c);
    if (i < 0) return null;
    const me = all[i], top = all[0];
    const bestL = top.L, bestCry = all.reduce((a, m) => Math.max(a, m.crystals), 0);

    let tag = null;
    if (me.L === 0 && bestL > 0) tag = 'missLine';           // 有的消不消
    else if (me.iso >= 2) tag = 'isolate';                   // 这一手一次造出 2 个以上孤格

    let grade = 'ok';
    if (me.crystals > 0 && me.crystals >= bestCry) grade = 'brilliant';
    else if (me.L >= 2 && me.L >= bestL) grade = 'brilliant';           // 一手同消 2 条且没有更好的
    // ⚠ 顶尖手即使带 tag 也**不判失误**：偶尔「有的消不消」是有道理的（保盘面/等大件），
    //   求解器自己都把它排进前 15% 时，我们没资格说他错 —— 只是不表扬（'ok'，静默）。
    else if (i < Math.max(1, all.length * 0.15)) grade = tag ? 'ok' : 'good';
    else if (tag) grade = 'miss';
    return { grade, tag, best: top, rank: i, total: all.length };
  }

  /**
   * 死亡复盘（DESIGN §2「失败必须可归因」的下一步）：
   * 死亡序列已经证明了「剩下的每一块确实都放不下」；这里再回答**为什么会走到这一步**。
   *
   * history = 最近几手**落子前**的局面快照（[{s, mv, turn}]，最早在前）。
   * 对每个快照跑 top-K 候选的生存模拟，找出「当时换个放法能多活最多步」的那一手。
   * 返回 { turn, slot, r, c, gain, survive } 或 null（本来就无力回天 ⇒ 不编故事）。
   *
   * ⚠ 开销：K × limit × 每步 O(192) ⇒ 死亡序列动画播放期间跑一次，玩家无感。
   */
  function postmortem(history, opts) {
    const K = (opts && opts.top) || 4, LIMIT = (opts && opts.limit) || 24, MIN = (opts && opts.min) || 3;
    let bestOne = null;
    history.forEach((h, hi) => {
      const actualLeft = history.length - hi;              // 那一手之后玩家实际还走了几步
      const cands = rankMoves(h.s).slice(0, K);
      for (const m of cands) {
        if (m.slot === h.mv.slot && m.r === h.mv.r && m.c === h.mv.c) continue;   // 就是他下的那手
        const c = clone(h.s);
        Core.place(c, m.slot, m.r, m.c);
        const n = 1 + survive(c, LIMIT);
        const gain = n - actualLeft;
        if (gain >= MIN && (!bestOne || gain > bestOne.gain)) {
          bestOne = { turn: h.turn, slot: m.slot, r: m.r, c: m.c, gain, survive: n };
        }
      }
    });
    return bestOne;
  }

  const API = { clone, evalBoard, simulate, rankMoves, best, survive, judge, postmortem, isolatedCount, roomScore };
  if (isNode) module.exports = API;
  else root.Coach = API;
})(typeof self !== 'undefined' ? self : this);
