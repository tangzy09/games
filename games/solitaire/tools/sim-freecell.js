#!/usr/bin/env node
/**
 * sim-freecell.js — FreeCell 的可解率 + 难度分布（用 solver 跑，**不是**用贪心 AI 跑）。
 *
 * ⚠ **为什么这里不能像 Klondike 那样用「AI 胜率」体检规则**：
 *   FreeCell **全明牌，赢它靠的是规划**（人类前瞻十几步，胜率 ~99%）。
 *   1 步贪心 / 爬山法天然只有个位数胜率 —— 那是 **AI 弱**，不是规则错。
 *   实测：修好 canFound 的花色 bug 后（solver 提速 437×，规则已被证明正确），
 *   同一个贪心 AI 依然只有 9% —— 拿它当判据会永远误报「规则写错了」。
 *
 * ✅ **FreeCell 规则的真正体检 = tools/test-freecell.js**：
 *   微软 #11982 无解（外部地面真值）+ 对照组必须有解 + solver 的解用真实规则重放必须赢。
 *
 * 本工具的用途：
 *   ① **可解率**（应 ≈100%：微软 32000 局里只有 #11982 无解）
 *   ② **难度分档 = solver 求解节点数**（#1 只要 342 节点 = 送分；#617 要 13021 = 硬仗）。
 *      FreeCell 全明牌、没有运气 ⇒ 难度就是「有多难想」，节点数正是它的度量。
 *
 * 用法: node games/solitaire/tools/sim-freecell.js [局数] [起始seed]
 */
'use strict';
const path = require('path');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));

const N = parseInt(process.argv[2] || '100', 10);
const START = parseInt(process.argv[3] || '1', 10);
const BUDGET = { bfNodes: 200000, maxNodes: 3000000 };

let win = 0, dead = 0, unknown = 0;
const nodes = [];
const t0 = Date.now();

for (let seed = START; seed < START + N; seed++) {
  const r = Solver.solve(Core.newGame(seed, 3, 'freecell'), BUDGET);
  if (r.result === 'win') { win++; nodes.push(r.nodes); }
  else if (r.result === 'dead') { dead++; console.log(`  ⚠ #${seed} 无解`); }
  else { unknown++; console.log(`  ? #${seed} 算不出来（${r.nodes} 节点）`); }
}

nodes.sort((a, b) => a - b);
const q = p => nodes[Math.floor(nodes.length * p)] || 0;
const easy = nodes.filter(n => n < 2000).length;
const normal = nodes.filter(n => n >= 2000 && n < 20000).length;
const hard = nodes.filter(n => n >= 20000).length;

console.log(`\nFreeCell #${START}..#${START + N - 1}（solver，不是贪心 AI）`);
console.log(`  有解 ${win}   无解 ${dead}   算不出来 ${unknown}    耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`\n  难度（求解节点数分位）：中位 ${q(0.5)}   75% ${q(0.75)}   90% ${q(0.9)}   最难 ${nodes[nodes.length - 1] || 0}`);
console.log(`  分档：简单(<2k) ${easy}   普通(2k-20k) ${normal}   困难(≥20k) ${hard}`);
