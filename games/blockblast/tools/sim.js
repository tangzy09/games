#!/usr/bin/env node
/**
 * sim.js — 设计验证 / 手感回归模拟器。
 *
 * ⚠ 它**直接驱动真正的 js/core.js**（不再自带一套平行规则）——否则模拟和游戏会悄悄漂移，
 *   跑出来的数字就成了自欺欺人。改了 core 的规则，这里的数字必须跟着动。
 *
 * 回答的问题（DESIGN §0 的数据全部出自这里）：
 *   1. 单局时长 / 分数量级 —— 对得上「3-5 分钟一局」吗？
 *   2. SWEEP / PERFECT 多久出一次 —— 招牌大招是活的还是死的？
 *   3. streak 分布 —— 7 连封顶（×4）定得合不合理？
 *   4. 新手（casual）与熟手（mid）差多远？（结论：新手救不了于发牌，只能靠教学）
 *
 * 参考 AI 是**版本锁定**的回归基线：改动它需单独 review，否则基线失去意义。
 * 用法: node games/blockblast/tools/sim.js [局数]
 */
'use strict';

const path = require('path');
const Core = require(path.join(__dirname, '../js/core.js'));

// ── 盘面启发式（参考 1010!/blokie：占用格数 + 孤立空洞 + 团块度）──
function evalBoard(board) {
  let filled = 0, isolated = 0, edges = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[Core.idx(r, c)]) { filled++; continue; }
    let nb = 0;
    if (r === 0 || board[Core.idx(r - 1, c)]) nb++;
    if (r === 7 || board[Core.idx(r + 1, c)]) nb++;
    if (c === 0 || board[Core.idx(r, c - 1)]) nb++;
    if (c === 7 || board[Core.idx(r, c + 1)]) nb++;
    if (nb === 4) isolated++;
    edges += nb;
  }
  return -filled - isolated * 12 - edges * 0.15;
}

/** 试放一块 → 落子后的盘面（含消行） */
function simulate(board, piece, r, c) {
  const b = board.slice();
  for (const [dr, dc] of piece.cells) b[Core.idx(r + dr, c + dc)] = 1;
  const { rows, cols } = Core.findFullLines(b);
  for (const rr of rows) for (let cc = 0; cc < 8; cc++) b[Core.idx(rr, cc)] = 0;
  for (const cc of cols) for (let rr = 0; rr < 8; rr++) b[Core.idx(rr, cc)] = 0;
  return { board: b, L: rows.length + cols.length };
}

/**
 * 通盘规划当前这一手（剩余块的所有顺序 × 所有位置，贪心 rollout），返回最优序列。
 * ⚠ 放不下的块**跳过**、不中断规划 —— 因为后面某一步消了行，它可能又能放了。
 *   （调用方只执行 seq[0] 然后重新规划，正是为了吃到这个「消行救活卡住的块」的效应。）
 * casual = 随手放（噪声大、不穷举顺序）；mid = 全排列贪心；pro = 贪心 + 主动追清盘。
 */
function planHand(state, level, rnd) {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const tray = Core.tray(state);
  const tryPerms = level === 'casual' ? [perms[Math.floor(rnd() * 6)]] : perms;

  let best = null;
  for (const order of tryPerms) {
    let board = state.board.slice(), seq = [], gained = 0;
    for (const i of order) {
      const p = tray[i];
      if (!p) continue;
      let bv = -Infinity, bp = null;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (!Core.canPlace(board, p, r, c)) continue;
        const sim = simulate(board, p, r, c);
        let v = evalBoard(sim.board) + sim.L * 40;
        if (level === 'casual') v += rnd() * 25;
        if (level === 'pro' && Core.fillCount(sim.board) === 0) v += 1000;
        if (v > bv) { bv = v; bp = { r, c, slot: i, board: sim.board, L: sim.L }; }
      }
      if (!bp) continue;                       // 这块暂时放不下 → 跳过，先放别的（可能消行救活它）
      seq.push(bp); board = bp.board; gained += bp.L;
    }
    const val = evalBoard(board) + gained * 40 + seq.length * 30;
    if (!best || val > best.val) best = { val, seq };
    if (level === 'casual' && seq.length) break;
  }
  return best;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 逐子决策（不是一手规划死）。
 * ⚠ 必须逐子：放下能放的那块可能**消掉一行、腾出空间**，让原本放不下的块又能放。
 *   （最初这里按「一手三块规划、有块放不下就结束」写，把局判死得太早 —— 与 core 的 bug 同源。）
 */
function playGame(seed, level) {
  const rnd = mulberry32(seed ^ 0xabcdef);
  const s = Core.newGame(seed);
  for (let guard = 0; guard < 3000 && !s.over; guard++) {
    const plan = planHand(s, level, rnd);
    if (!plan || !plan.seq.length) break;      // 一块都放不下 = 真的没救（core 也会置 over）
    const mv = plan.seq[0];                    // 只执行第一步，然后**重新规划**
    Core.place(s, mv.slot, mv.r, mv.c);        // ——因为这一步若消了行，后面的可放性全变了
  }
  return s;
}

const GAMES = parseInt(process.argv[2] || '400', 10);
const med = a => { const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
const pct = (n, d) => (100 * n / d).toFixed(1) + '%';

console.log(`\n=== blockblast 手感回归（每档 ${GAMES} 局，直接驱动 js/core.js）===\n`);
const rows = [];
for (const level of ['casual', 'mid', 'pro']) {
  const R = [];
  for (let i = 0; i < GAMES; i++) R.push(playGame(1000 + i, level));
  const sum = f => R.reduce((a, s) => a + f(s), 0);
  rows.push({
    玩家: level,
    中位分: med(R.map(s => s.score)),
    中位落子数: med(R.map(s => s.stats.turns)),
    '最长streak中位': med(R.map(s => s.stats.maxStreak)),
    'streak≥7的局': pct(R.filter(s => s.stats.maxStreak >= 7).length, GAMES),
    'SWEEP局占比': pct(R.filter(s => s.stats.sweeps + s.stats.deeps + s.stats.perfects > 0).length, GAMES),
    'PERFECT局占比': pct(R.filter(s => s.stats.perfects > 0).length, GAMES),
    '消除条数/局': (sum(s => s.stats.lines) / GAMES).toFixed(1),
  });
}
console.table(rows);
console.log('基线（DESIGN §0；改了 core 的规则必须复查这几个数）:');
console.log('  mid: 中位落子 ~90-100 / 中位分 ~1700 / SWEEP 局占比 ~30% / PERFECT ~2%');
console.log('判读: SWEEP 局占比 <15% ⇒ 招牌是死的；中位落子 <40 或 >150 ⇒ 单局时长跑偏\n');
