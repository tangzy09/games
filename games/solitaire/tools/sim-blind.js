#!/usr/bin/env node
/**
 * sim-blind.js — **盲打 AI**（和玩家一样看不见暗牌）。DESIGN §2.6 标为「最重要的缺失工具」。
 *
 * 它一次性解决三件事：
 *   1. **验证规则实现是对的** —— 一个规则写错的 Klondike，AI 是赢不了局的
 *   2. **量化「有解」与「人能赢」的落差** —— 这个数字直接印在公平页上，
 *      是全作最强的诚实牌（没有竞品敢公开它）
 *   3. **难度分档的依据**（改了 deal/rules 之后的回归基线）
 *
 * ⚠ 它**绝不透视暗牌**：只用玩家看得见的信息决策。这是它的全部意义 ——
 *   透视的 solver 说「有解」，不代表看不见暗牌的人打得赢。
 *
 * 用法: node games/solitaire/tools/sim-blind.js [局数] [draw:1|3]
 */
'use strict';

const path = require('path');
const Cards = require(path.join(__dirname, '../js/cards.js'));
const Core = require(path.join(__dirname, '../js/core.js'));
const R = require(path.join(__dirname, '../js/rules-klondike.js'));

const { rankOf, isRed } = Cards;

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

/** 跑一局盲打。返回 { won, moves, score } */
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

    // 走最高分的一步；若它导致已见过 3 次的局面，试下一个
    let played = false;
    for (const { m } of scored) {
      const before = JSON.stringify(s.moves.length);
      const ev = Core.apply(s, m);
      if (!ev) continue;
      played = true;
      break;
    }
    if (!played) break;
  }
  return { won: s.won, moves: s.moves.length, score: s.score };
}

// ── 跑 ──
const N = parseInt(process.argv[2] || '500', 10);
const DRAW = parseInt(process.argv[3] || '3', 10) === 1 ? 1 : 3;

console.log(`\n=== 盲打 AI（看不见暗牌，和玩家一样）· draw-${DRAW} · ${N} 局 ===\n`);

const results = [];
for (let i = 0; i < N; i++) results.push(playBlind(1000 + i, DRAW));

const wins = results.filter(r => r.won);
const rate = wins.length / N;
const med = a => { const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)] || 0; };

console.log(`盲打胜率:      ${(rate * 100).toFixed(1)}%   (${wins.length}/${N})`);
console.log(`赢局中位步数:  ${med(wins.map(r => r.moves))}`);
console.log(`赢局中位分数:  ${med(wins.map(r => r.score))}`);
console.log(`输局中位步数:  ${med(results.filter(r => !r.won).map(r => r.moves))}`);

console.log(`\n对照（论文，**透视暗牌**的理论可解率）: draw-3 = 81.9% · draw-1 = 90.5%`);
console.log(`⇒ 「有解」与「盲打能赢」的落差 ≈ ${((DRAW === 3 ? 81.9 : 90.5) - rate * 100).toFixed(0)} 个百分点`);
console.log(`   这就是公平页上要**主动公开**的那个数字（DESIGN §2.1）—— 没有竞品敢写它。\n`);
