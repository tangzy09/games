#!/usr/bin/env node
/**
 * measure-deadlock.js — 回答一个**产品级**的问题：
 *
 *   「一个**本来有解**的牌局，玩家能靠乱走把它**走成死局**吗？」
 *
 * 这不是学术问题。它决定了「这局还有解吗？」这个按钮的**真实语义**：
 *   - 如果很难走死 ⇒ 按钮几乎永远答「仍有解」⇒ 这是**产品承诺的兑现**，
 *     而且 DESIGN §2.1 那颗「你在第 12 步走错了」的语义炸弹**根本引爆不了**。
 *   - 如果很容易走死 ⇒ 「第 N 步之后无解」的措辞就是天天要面对的，必须极度小心。
 *
 * 做法：从池里（**已证明有解**）取 seed，用**随机乱走**的玩家模型走 N 步，
 *   再用大预算 solver 问「还有解吗」。统计走死的比例。
 *
 * 用法: node games/solitaire/tools/measure-deadlock.js [局数] [draw]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));
const R = require(path.join(__dirname, '../js/rules-klondike.js'));

const N = parseInt(process.argv[2] || '30', 10);
const DRAW = parseInt(process.argv[3] || '3', 10) === 1 ? 1 : 3;
const BUDGET = 300000;
const STEPS = 150;

// 确定性伪随机（可复现）
let rng = 12345;
const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ⚠ MODE=blind 用**盲打 AI（≈真人水平）**走，而不是纯随机。
// 这才是「玩家真实输掉时，按钮会说什么」的答案 —— 纯随机的 46% 死局率不代表人。
const MODE = process.argv[4] || 'random';

const pool = JSON.parse(fs.readFileSync(path.join(__dirname, `../data/pool-draw${DRAW}.json`), 'utf8'));
// ⚠ 取样必须用 **hard 桶**（= 盲打 AI 赢不了的局 = **玩家真实会输掉的局**）。
// 用 easy 桶测「输掉时是不是死局」是自相矛盾的：easy 的定义就是「AI 能赢」⇒ 恒 100% 胜，测了个寂寞。
const seeds = (MODE === 'blind' ? pool.hard : pool.easy.concat(pool.hard)).slice(0, N);

let dead = 0, alive = 0, unknown = 0, won = 0, stuck = 0;
console.log(`\n从**已证明有解**的 ${seeds.length} 个 draw-${DRAW} 牌局出发，${MODE === 'blind' ? '用**盲打 AI（≈真人）**打到它认输' : `随机乱走 ${STEPS} 步`}，再问「还有解吗」`);
console.log(MODE === 'blind' ? '（取样 = hard 桶 = 盲打 AI 赢不了的局 = **玩家真实会输掉的局**）\n' : '');

function flips(s, m) {
  if (m.t === 'tf') { const c = s.tableau[m.ti]; return c.up === 1 && c.cards.length > 1; }
  if (m.t === 'tt') { const c = s.tableau[m.ti]; return c.cards.length - m.idx === c.up && m.idx > 0; }
  return false;
}
function empties(s, m) {
  if (m.t === 'tt') { const c = s.tableau[m.ti]; return m.idx === 0 && c.cards.length === c.up; }
  if (m.t === 'tf') return s.tableau[m.ti].cards.length === 1;
  return false;
}
function score(s, m) {
  let v = 0;
  if (flips(s, m)) v += 100;
  if (empties(s, m)) v += 60;
  if (m.t === 'tf' || m.t === 'wf') {
    const c = m.t === 'tf' ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1] : s.waste[s.waste.length - 1];
    v += 20 + (R.isSafeToAutoPlay(s, c) ? 15 : -5);
  }
  if (m.t === 'wt') v += 15;
  if (m.t === 'tt') v += (flips(s, m) || empties(s, m)) ? 8 : -25;
  if (m.t === 'ft') v -= 40;
  if (m.t === 'draw') v += 1;
  if (m.t === 'recycle') v -= 10;
  return v;
}

for (const seed of seeds) {
  const s = Core.newGame(seed, DRAW);
  const seen = new Map();
  for (let i = 0; i < (MODE === 'blind' ? 1200 : STEPS) && !s.won; i++) {
    const ms = R.legalMoves(s);
    if (!ms.length) { stuck++; break; }
    if (MODE === 'blind') {
      // 盲打 AI：看不见暗牌，和玩家掌握同样的信息（与 sim-blind.js 同一套启发式）
      const fp = s.tableau.map(c => c.cards.slice(c.cards.length - c.up).join(',') + '|' + (c.cards.length - c.up)).join(';')
        + '#' + s.waste.join(',') + '#' + s.stock.length + '#' + s.foundations.map(f => f.length).join(',');
      const n = (seen.get(fp) || 0) + 1;
      seen.set(fp, n);
      if (n > 6) break;                                   // AI 开始原地打转 = 它认输了
      const best = ms.map((m, k) => ({ m, v: score(s, m), k }))
        .sort((a, b) => (b.v - a.v) || (a.k - b.k))[0];
      if (!Core.apply(s, best.m)) break;
    } else {
      Core.apply(s, ms[Math.floor(rnd() * ms.length)]);   // ⭐ 纯随机 —— 制造损失最狠
    }
  }
  if (s.won) { won++; continue; }
  const r = Solver.solve(s, { maxNodes: BUDGET }).result;
  if (r === 'win') alive++;
  else if (r === 'dead') dead++;
  else unknown++;
}

const judged = alive + dead;
console.log(`  仍然有解 : ${alive}`);
console.log(`  ⛔ 走成死局: ${dead}`);
console.log(`  算不出来 : ${unknown}`);
console.log(`  随机走赢 : ${won}   无路可走(僵局): ${stuck}`);
if (judged) {
  const pct = (dead / judged * 100).toFixed(0);
  if (MODE === 'blind') {
    // ⭐ 本产品最重要的一个数字（公平页 / 商店页 / 「还有解吗」按钮的语义全靠它）
    console.log(`\n  ⇒ 玩家（≈盲打 AI）输掉的局里：`);
    console.log(`       **${(alive / judged * 100).toFixed(0)}% 其实还有解 —— 只是没找到**（撤销回去还能赢）`);
    console.log(`       ${pct}% 真的已经走成死局（该换一局了）`);
    console.log(`\n     ⇒ 「这局还有解吗？」约一半会说「还有解」= 真实留存；另一半说「没解了」= 尊重时间。`);
    console.log(`        两边都不是「你活该」。也正因如此，**提示/撤销必须永远免费** ——`);
    console.log(`        近一半的输局能救回来，把它锁在广告后 = 收钱才让你知道自己还有救。`);
  } else {
  console.log(`\n  ⇒ **随机乱走 ${STEPS} 步，把一个有解局走成死局的比例：${pct}%**（${dead}/${judged}）`);
  }
  if (dead === 0) {
    console.log(`\n  ⭐ 一个都没走死 —— Klondike 的绝大多数操作是可逆的（搬牌、从 foundation 取回、`);
    console.log(`     stock 循环回收），唯一不可逆的「翻暗牌」还总是好事。`);
    console.log(`     ⇒ 「这局还有解吗？」几乎永远答「仍有解」= **产品承诺的兑现**，`);
    console.log(`        而不是一个用来指责玩家的工具。`);
  }
}
console.log();
