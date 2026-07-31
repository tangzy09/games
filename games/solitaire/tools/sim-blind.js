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
 * ⚠ AI 本体在 `js/ai-blind.js`（游戏内「每日挑战 AI 对比」共用同一份 ——
 *   两边必须是同一个 AI，否则游戏里展示的 AI 结果和公平页的基线数字对不上）。
 *
 * 用法: node games/solitaire/tools/sim-blind.js [局数] [draw:1|3]
 */
'use strict';

const path = require('path');
const { playBlind } = require(path.join(__dirname, '../js/ai-blind.js'));

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
