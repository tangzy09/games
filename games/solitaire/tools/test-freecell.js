#!/usr/bin/env node
/**
 * test-freecell.js — FreeCell 规则 + **微软局号**的验证。
 *
 * ⭐ 这里有一个**外部的、可检验的地面真值**，不是我们自己说了算的：
 *
 *      微软 FreeCell 的 32000 局里，**只有 #11982 是无解的**。
 *      （这是 FreeCell 社区 1990s 用穷尽搜索得出的著名结论）
 *
 *   ⇒ 如果我们的发牌真的复现了微软的局号，求解器就**必须**在 #11982 上判死、
 *     在其它局上判赢。做不到 = 我们的「局号」是假的，商店页上「玩经典 #11982」就是谎话。
 *
 *   这是唯一能证明「我们的 FreeCell 是真 FreeCell」的办法 —— 不能靠读代码自我确认。
 */
'use strict';

const path = require('path');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));
const RF = require(path.join(__dirname, '../js/rules-freecell.js'));
const Cards = require(path.join(__dirname, '../js/cards.js'));

let fail = 0;
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); fail++; } else console.log('✓ ' + m); };

// ── ① 发牌基本性质 ──
{
  const s = Core.newGame(1, 3, 'freecell');
  const all = s.tableau.flatMap(c => c.cards).sort((a, b) => a - b);
  ok(all.length === 52 && all.every((v, i) => v === i), '52 张牌不重不漏');
  ok(s.tableau.length === 8, '8 列');
  const lens = s.tableau.map(c => c.cards.length);
  ok(lens.slice(0, 4).every(n => n === 7) && lens.slice(4).every(n => n === 6),
    '前 4 列 7 张、后 4 列 6 张（微软的横向发牌）');
  ok(s.tableau.every(c => c.up === c.cards.length), '⭐ 全明牌，一张暗牌都没有');
  ok(s.free.length === 4 && s.free.every(x => x === null), '4 个空 free cell');
  // 可复现
  const s2 = Core.newGame(1, 3, 'freecell');
  ok(JSON.stringify(s.tableau) === JSON.stringify(s2.tableau), 'deal 可复现（纯函数）');
}

// ── ② supermove 上限 ──
{
  const s = Core.newGame(1, 3, 'freecell');
  ok(RF.maxMove(s, false) === 5, '开局（4 空 cell、0 空列）一次最多搬 5 张');
  s.free[0] = 0; s.free[1] = 1;
  ok(RF.maxMove(s, false) === 3, '占用 2 个 cell ⇒ 只能搬 3 张');
  s.tableau[7].cards = []; s.tableau[7].up = 0;
  ok(RF.maxMove(s, false) === 6, '多 1 个空列 ⇒ 翻倍到 6 张');
  ok(RF.maxMove(s, true) === 3, '⭐ 搬进空列时，那一列不算 ⇒ 回到 3 张（漏了这条就能作弊）');
}

// ── ③ ⭐⭐ 微软局号的地面真值：#11982 是唯一无解的那一局 ──
console.log('\n验证微软局号（外部地面真值，不是我们自己说了算）：');
// best-first 找解（bfNodes）+ DFS 穷尽判无解（maxNodes）—— 见 solver.js 的分工说明
const BUDGET = { bfNodes: 150000, maxNodes: 3000000 };
{
  const r = Solver.solve(Core.newGame(11982, 3, 'freecell'), BUDGET);
  ok(r.result === 'dead',
    `⭐ #11982 无解 —— 判定「${r.result}」（${r.nodes} 节点, ${r.ms}ms）` +
    (r.result === 'unknown' ? '  ⚠ 预算不够，没穷尽，这不算验证通过' : ''));

  // 对照组：这几局必须有解（否则说明我们的规则/发牌整体就是错的）
  for (const seed of [1, 617, 1941, 31465]) {
    const x = Solver.solve(Core.newGame(seed, 3, 'freecell'), BUDGET);
    ok(x.result === 'win', `#${seed} 有解 —— 判定「${x.result}」（${x.nodes} 节点, ${x.ms}ms）`);
  }
}

// ── ④ solver 的解，用**游戏真实规则**重放必须以胜利结束（同 Klondike 的铁律）──
{
  const r = Solver.solve(Core.newGame(617, 3, 'freecell'), BUDGET);
  if (r.result === 'win') {
    const s = Core.replay(617, 3, r.moves, 'freecell');
    ok(s && s.won, `#617 的解（${r.moves.length} 步）用游戏真实规则重放 ⇒ 赢`);
  } else fail++;
}

// ── ⑤ supermove 的撤销必须是**原子**的（一次撤掉整叠）──
{
  const s = Core.newGame(1, 3, 'freecell');
  const sup = RF.legalMoves(s).find(m => m.t === 'tt' && s.tableau[m.ti].cards.length - m.idx >= 2);
  if (!sup) { console.log('  (开局没有多张 supermove 可用，跳过)'); }
  else {
    const n = s.tableau[sup.ti].cards.length - sup.idx;
    Core.apply(s, sup);
    const back = Core.undo(s);
    const s0 = Core.newGame(1, 3, 'freecell');
    ok(back && JSON.stringify(back.tableau) === JSON.stringify(s0.tableau),
      `⭐ ${n} 张的 supermove，**一次**撤销就全回来了（原子，不是撤 ${n} 次）`);
  }
}

console.log(fail ? `\n⛔ ${fail} fail` : '\n0 fail');
process.exit(fail ? 1 : 0);
