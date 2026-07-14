#!/usr/bin/env node
/**
 * build-pool.js — 建「已验证可解」的牌局池（DESIGN §2.4/§2.5）。
 *
 * 三步，每一步都不能省：
 *   1. **solver 求解**（透视暗牌）→ 只要 result==='win' 的 seed，拿到**完整走法序列**
 *   2. ⭐ **用游戏真实的规则重放这条走法，必须以胜利结束** —— 否则丢弃。
 *      这是「已验证可解」唯一可信的验证方式（红队 F2）：
 *      「抽样用 solver 复验」复验的是 solver 自己，跟我们的游戏毫无关系。
 *   3. **难度分档 = 盲打 AI 能不能赢**（不是最短解长度 —— 那个区分度不够，红队 S2）。
 *      这是**玩家的真实体验**：easy = 看不见暗牌的人也能赢；hard = 有解但盲打赢不了。
 *
 * ⚠ solver 用**低节点预算**（可解的局大多几百节点就解出来；unknown 的局烧满预算才放弃）
 *   ⇒ 预算 5000 的产出率是预算 150000 的 **13 倍**。我们不在乎漏掉某些可解局（seed 空间无限）。
 *
 * 用法: node games/solitaire/tools/build-pool.js [目标数量] [draw:1|3] [起始seed]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));
const R = require(path.join(__dirname, '../js/rules-klondike.js'));

const TARGET = parseInt(process.argv[2] || '2000', 10);
const DRAW = parseInt(process.argv[3] || '3', 10) === 1 ? 1 : 3;
const START = parseInt(process.argv[4] || '1', 10);
const MAX_NODES = 5000;

// ── 盲打 AI（与 sim-blind.js 同一套启发式；难度分档靠它）──
function blindPlay(seed, drawCount) {
  const s = Core.newGame(seed, drawCount);
  const seen = new Map();
  for (let step = 0; step < 1200 && !s.won; step++) {
    const fp = s.tableau.map(c => c.cards.slice(c.cards.length - c.up).join(',') + '|' + (c.cards.length - c.up)).join(';')
      + '#' + s.waste.join(',') + '#' + s.stock.length + '#' + s.foundations.map(f => f.length).join(',');
    const n = (seen.get(fp) || 0) + 1;
    seen.set(fp, n);
    if (n > 6) break;

    const moves = R.legalMoves(s);
    if (!moves.length) break;
    const scored = moves.map((m, i) => ({ m, v: score(s, m), i }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i));
    if (!Core.apply(s, scored[0].m)) break;
  }
  return s.won;
}
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
    const card = m.t === 'tf' ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1] : s.waste[s.waste.length - 1];
    v += 20 + (R.isSafeToAutoPlay(s, card) ? 15 : -5);
  }
  if (m.t === 'wt') v += 15;
  if (m.t === 'tt') v += (flips(s, m) || empties(s, m)) ? 8 : -25;
  if (m.t === 'ft') v -= 40;
  if (m.t === 'draw') v += 1;
  if (m.t === 'recycle') v -= 10;
  return v;
}

// ── 跑 ──
console.log(`\n建池：draw-${DRAW}，目标 ${TARGET} 个已验证可解的牌局\n`);
const pool = [];
let tried = 0, verifyFail = 0;
const t0 = Date.now();

for (let seed = START; pool.length < TARGET && tried < TARGET * 20; seed++) {
  tried++;
  const r = Solver.solveSeed(seed, DRAW, { maxNodes: MAX_NODES });
  if (r.result !== 'win') continue;

  // ⭐ 步骤 2：用**游戏真实的规则**重放 solver 的解，必须以胜利结束
  const replayed = Core.replay(seed, DRAW, r.moves);
  if (!replayed || !replayed.won) {
    verifyFail++;
    console.error(`  ✗ seed ${seed}: solver 说有解，但用游戏规则重放**没赢** —— 丢弃！`);
    continue;                                  // ⛔ 绝不进包
  }

  // 步骤 3：难度 = 盲打 AI 能不能赢
  const blindWin = blindPlay(seed, DRAW);
  pool.push({ s: seed, n: r.nodes, l: r.moves.length, b: blindWin ? 1 : 0 });

  if (pool.length % 200 === 0) {
    const rate = (pool.length / tried * 100).toFixed(0);
    const eta = Math.round((Date.now() - t0) / pool.length * (TARGET - pool.length) / 1000);
    process.stdout.write(`\r  ${pool.length}/${TARGET}  (试了 ${tried} 个 seed，命中 ${rate}%，还需 ~${eta}s)   `);
  }
}
console.log();

const easy = pool.filter(p => p.b === 1);
const hard = pool.filter(p => p.b === 0);

const out = {
  draw: DRAW,
  built: new Date().toISOString().slice(0, 10),
  // ⚠ 难度 = 盲打 AI 能不能赢（玩家的真实体验），不是最短解长度
  easy: easy.map(p => p.s),
  hard: hard.map(p => p.s),
  meta: { total: pool.length, tried, verifyFail, maxNodes: MAX_NODES },
};

const file = path.join(__dirname, `../data/pool-draw${DRAW}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));

console.log(`\n✓ ${pool.length} 个已验证可解的牌局`);
console.log(`  easy（盲打 AI 也能赢）: ${easy.length}  (${(easy.length / pool.length * 100).toFixed(0)}%)`);
console.log(`  hard（有解但盲打赢不了）: ${hard.length}  (${(hard.length / pool.length * 100).toFixed(0)}%)`);
console.log(`  试了 ${tried} 个 seed，命中率 ${(pool.length / tried * 100).toFixed(0)}%`);
console.log(`  ⚠ 重放验证失败（solver 说有解但我们的规则跑不出来）: ${verifyFail} 个`);
if (verifyFail > 0) console.log('  ⛔ verifyFail > 0 说明 solver 与游戏规则不一致 —— 必须排查！');
console.log(`\n  → ${file}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
console.log(`  耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
