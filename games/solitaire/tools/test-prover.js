#!/usr/bin/env node
/**
 * test-prover.js — 「这局还有解吗？」的正确性测试。
 *
 * ⚠ **这是全仓最不能出错的一个判断**：说错一次 dead，就是当着玩家的面撒谎
 *   （「这局没救了」→ 玩家撤销回去、真的赢了 → 一星差评 +「它连自己的核心功能都是假的」）。
 *
 * 地面真值来自池：**池里的 seed 是我们已经证明过有解的**。
 *   ⇒ 证明器在**开局**问它们，必须 100% 回答 solvable。
 *     答 dead  = 致命 bug（撒谎）
 *     答 unknown = 预算不够（可容忍，但比例要低，否则功能没用）
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));
const R = require(path.join(__dirname, '../js/rules-klondike.js'));

const BUDGET = 300000;          // 与 prover.worker.js 保持一致
let fail = 0;

// ── ① 池里的 seed，开局必答 solvable ──
for (const draw of [3, 1]) {
  const pool = JSON.parse(fs.readFileSync(path.join(__dirname, `../data/pool-draw${draw}.json`), 'utf8'));
  const sample = pool.easy.concat(pool.hard).slice(0, 40);
  let win = 0, unknown = 0, lied = 0;

  for (const seed of sample) {
    const r = Solver.solve(Core.newGame(seed, draw), { maxNodes: BUDGET });
    if (r.result === 'win') win++;
    else if (r.result === 'unknown') unknown++;
    else {
      lied++;                                    // ⛔ 说已知有解的局「无解」
      console.error(`  ⛔ 撒谎！draw-${draw} seed ${seed}: 池里说有解，证明器却答 dead`);
    }
  }
  const ok = lied === 0;
  if (!ok) fail++;
  console.log(`test-prover: draw-${draw} 池内 seed 开局判定  ` +
    `solvable ${win}/${sample.length}  unknown ${unknown}  **撒谎 ${lied}**  ${ok ? 'OK' : 'FAIL'}`);
  if (unknown > sample.length * 0.25) {
    console.log(`  ⚠ unknown 比例偏高（${unknown}/${sample.length}）—— 预算 ${BUDGET} 可能不够，功能会常答「算不出来」`);
  }
}

// ── ② 真死局必须被识别（把牌走进死胡同）──
// 构造：反复只 draw/recycle，直到 stock 循环耗尽且无其它走法 —— 这类局面天然是死的。
// 更硬的构造：让 solver 用小预算跑一个 unknown 的 seed，我们不用它；
// 这里用一个确定性的死局：所有牌都进不了 foundation 且 tableau 无法动。
{
  // 用 replay 造一个人为死局较难；改用「已被证明无解的局面」：
  // 取一个池外 seed（solver 大预算判 dead 的），确认 dead 是稳定可复现的。
  let deadSeed = null;
  for (let seed = 1; seed < 400 && !deadSeed; seed++) {
    const r = Solver.solve(Core.newGame(seed, 3), { maxNodes: BUDGET });
    if (r.result === 'dead') deadSeed = seed;
  }
  if (deadSeed == null) {
    console.log('test-prover: 未找到确定无解的 seed（不是失败，只是样本内没有）— SKIP');
  } else {
    // 复跑一次：dead 的判定必须稳定（穷尽搜索 ⇒ 确定性）
    const r2 = Solver.solve(Core.newGame(deadSeed, 3), { maxNodes: BUDGET });
    const ok = r2.result === 'dead';
    if (!ok) fail++;
    console.log(`test-prover: 无解 seed ${deadSeed} 判定可复现  ${ok ? 'OK' : 'FAIL'}`);
  }
}

// ── ③ 二分定位：走进死局后，deadFrom 之前必须仍有解 ──
// 取一个有解的 seed，故意走一步烂棋（把一张不该动的牌搬走），看能否定位。
{
  const pool = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/pool-draw3.json'), 'utf8'));
  const seed = pool.hard[0];
  const s = Core.newGame(seed, 3);
  // 一路走烂棋，**直到真的走死为止**（Klondike 比想象中宽容，24 步远远走不死）。
  // 最烂的棋 = 把明牌堆回暗牌上（tt 且不翻牌不清列）+ 死活不收 foundation。
  const moves = [];
  let cur = 'win';
  for (let i = 0; i < 140; i++) {
    const ms = R.legalMoves(s);
    if (!ms.length) break;
    const bad = ms.find(m => m.t === 'tt') || ms.find(m => m.t === 'ft')
             || ms.find(m => m.t === 'draw') || ms.find(m => m.t === 'recycle') || ms[0];
    if (!Core.apply(s, bad)) break;
    moves.push(bad);
    if (moves.length % 12 === 0) {                      // 每 12 步探一次，别每步都跑大预算
      cur = Solver.solve(s, { maxNodes: BUDGET }).result;
      if (cur === 'dead') break;
    }
  }
  if (cur !== 'dead') cur = Solver.solve(s, { maxNodes: BUDGET }).result;

  if (cur !== 'dead') {
    console.log(`test-prover: 二分定位 — 乱走 ${moves.length} 步后仍 ${cur}，没走死（不是失败）— SKIP`);
  } else {
    // 二分（与 worker 同逻辑）
    let lo = 0, hi = moves.length, bailed = false;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const st = Core.replay(seed, 3, moves.slice(0, mid));
      const r = st.won ? 'win' : Solver.solve(st, { maxNodes: 60000 }).result;
      if (r === 'win') lo = mid;
      else if (r === 'dead') hi = mid;
      else { bailed = true; break; }
    }
    if (bailed) {
      console.log('test-prover: 二分中途 unknown → 正确地放弃报步数（不冤枉玩家）  OK');
    } else {
      // ⭐ 核心断言：deadFrom-1 步时必须**仍有解**，deadFrom 步时必须**无解**
      const before = Core.replay(seed, 3, moves.slice(0, hi - 1));
      const after = Core.replay(seed, 3, moves.slice(0, hi));
      const rb = Solver.solve(before, { maxNodes: BUDGET }).result;
      const ra = after.won ? 'win' : Solver.solve(after, { maxNodes: BUDGET }).result;
      const ok = rb === 'win' && ra === 'dead';
      if (!ok) fail++;
      console.log(`test-prover: 二分定位 seed ${seed} → 第 ${hi} 步之后无解  ` +
        `(第 ${hi - 1} 步:${rb} / 第 ${hi} 步:${ra})  ${ok ? 'OK' : 'FAIL'}`);
    }
  }
}

console.log(fail ? `\n⛔ ${fail} fail` : '\n0 fail');
process.exit(fail ? 1 : 0);
