#!/usr/bin/env node
/**
 * verify-levels.js — 关卡可解性验证 + 三星 par 标定（DESIGN §6.1，P2 的一等公民）。
 *
 * ⚠ 为什么必须有它：关卡目标是固定的，但**发块是随机的**（每局种子不同）。
 *   没有它，「这一关打得过吗」就只能靠拍脑袋 —— 玩家会碰到运气不好就通不了的关，
 *   而那种关的唯一出口是看广告 = 正是我们在 DESIGN §9 痛骂的东西。
 *
 * 做两件事：
 *   1. 每关跑 N 个不同种子的参考 AI，统计**通关率**；<80% 的关**不许进包**（退出码 1）。
 *   2. 用通关局的**落子数中位数**标定 `par`（三星阈值），写回 levels.js。
 *
 * 用法:
 *   node tools/verify-levels.js            # 验证（CI/提交前）
 *   node tools/verify-levels.js --write    # 验证 + 把标定出的 par 写回 levels.js
 *   node tools/verify-levels.js --runs 300 # 加大样本
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Core = require(path.join(__dirname, '../js/core.js'));
const Levels = require(path.join(__dirname, '../js/levels.js'));

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const RUNS = (() => { const i = args.indexOf('--runs'); return i >= 0 ? parseInt(args[i + 1], 10) : 200; })();
const PASS_RATE_MIN = 0.80;                 // 通关率低于此 ⇒ 这一关不许进包

// ── 参考 AI 的盘面启发式：关卡模式下，**优先打通有水晶的行/列** ──
function evalBoard(s, board) {
  let filled = 0, isolated = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const i = Core.idx(r, c);
    if (board[i]) { filled++; continue; }
    let nb = 0;
    if (r === 0 || board[Core.idx(r - 1, c)]) nb++;
    if (r === 7 || board[Core.idx(r + 1, c)]) nb++;
    if (c === 0 || board[Core.idx(r, c - 1)]) nb++;
    if (c === 7 || board[Core.idx(r, c + 1)]) nb++;
    if (nb === 4) isolated++;
  }
  let v = -filled - isolated * 12;

  // 关卡：让「有水晶的行/列」尽量接近填满（这是通关的唯一路径）
  if (s.mode === 'level') {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (!s.crystal[Core.idx(r, c)]) continue;
      let rowGap = 0, colGap = 0, rowStone = false, colStone = false;
      for (let k = 0; k < 8; k++) {
        if (s.stone[Core.idx(r, k)]) rowStone = true; else if (!board[Core.idx(r, k)]) rowGap++;
        if (s.stone[Core.idx(k, c)]) colStone = true; else if (!board[Core.idx(k, c)]) colGap++;
      }
      const best = Math.min(rowStone ? 99 : rowGap, colStone ? 99 : colGap);
      v -= best * 6;                          // 离「打通那条线」越近越好
    }
  }
  return v;
}

function simulate(s, board, piece, r, c) {
  const b = board.slice();
  for (const [dr, dc] of piece.cells) b[Core.idx(r + dr, c + dc)] = 1;
  const { rows, cols } = Core.findFullLines(b, s.stone);
  let crystals = 0;
  for (const rr of rows) for (let cc = 0; cc < 8; cc++) { if (s.crystal && s.crystal[Core.idx(rr, cc)]) crystals++; b[Core.idx(rr, cc)] = 0; }
  for (const cc of cols) for (let rr = 0; rr < 8; rr++) { if (s.crystal && s.crystal[Core.idx(rr, cc)]) crystals++; b[Core.idx(rr, cc)] = 0; }
  return { board: b, L: rows.length + cols.length, crystals };
}

/** 一局：参考 AI 逐子贪心（放能放的，消行可能救活卡住的块）*/
function playLevel(def, seed) {
  const s = Core.newLevel(def, seed);
  for (let guard = 0; guard < 400 && !s.over; guard++) {
    const tray = Core.tray(s);
    let bv = -Infinity, best = null;
    for (let slot = 0; slot < 3; slot++) {
      const p = tray[slot];
      if (!p) continue;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (!Core.canPlace(s.board, p, r, c)) continue;
        const sim = simulate(s, s.board, p, r, c);
        const v = evalBoard(s, sim.board) + sim.L * 30 + sim.crystals * 500;   // 收水晶压倒一切
        if (v > bv) { bv = v; best = { slot, r, c }; }
      }
    }
    if (!best) break;
    Core.place(s, best.slot, best.r, best.c);
  }
  return s;
}

// ── 跑 ──
const errs = Levels.validate();
if (errs.length) {
  console.error('✗ 关卡数据校验不过:\n' + errs.join('\n'));
  process.exit(1);
}

console.log(`\n验证 ${Levels.count()} 关 × ${RUNS} 个种子（参考 AI）\n`);
console.log('关卡  通关率   落子中位  par(三星)  水晶  石块  判定');
const pars = {};
let failed = 0;

for (const def of Levels.LEVELS) {
  const results = [];
  for (let k = 0; k < RUNS; k++) results.push(playLevel(def, 1000 + k * 7));
  const wins = results.filter(s => s.won);
  const rate = wins.length / RUNS;
  const turns = wins.map(s => s.stats.turns).sort((a, b) => a - b);
  const median = turns.length ? turns[Math.floor(turns.length / 2)] : 0;
  // ⚠ par 不能直接用 AI 的中位步数：那是「最优解」，真人几乎不可能每关都打到，
  //    结果就是三星永远拿不到、星星经济废掉（E2E 抓到：第 1 关 par=1，稍微绕一步就掉到 1 星）。
  //    给 50% 缓冲 + 1 步兜底 ⇒ 「打得不错」就能三星，「乱放」才掉星。
  const par = Math.ceil(median * 1.5) + 1;
  pars[def.id] = par;

  const nCry = (def.crystals || []).length, nSt = (def.stones || []).length;
  const ok = rate >= PASS_RATE_MIN;
  if (!ok) failed++;
  // 不可胜的局（软锁死兜底触发）单独报——正常关卡里应该是 0
  const unwinnable = results.filter(s => s.over && !s.won && Core.isUnwinnable(s)).length;
  console.log(
    `${String(def.id).padStart(3)}   ${(rate * 100).toFixed(0).padStart(4)}%   ${String(median).padStart(6)}    ${String(par).padStart(6)}   ${String(nCry).padStart(3)}   ${String(nSt).padStart(3)}   ` +
    (ok ? '✓' : `✗ 通关率 < ${PASS_RATE_MIN * 100}%`) + (unwinnable ? `  ⚠ ${unwinnable} 局不可胜!` : '')
  );
}

if (WRITE) {
  const p = path.join(__dirname, '../js/levels.js');
  let src = fs.readFileSync(p, 'utf8');
  for (const [id, par] of Object.entries(pars)) {
    const re = new RegExp(`(\\{ id: ${id},)( par: \\d+,)?`);
    src = src.replace(re, `$1 par: ${par},`);
  }
  fs.writeFileSync(p, src);
  console.log(`\n✓ par 已写回 levels.js（${Object.keys(pars).length} 关）`);
}

if (failed) {
  console.error(`\n✗ ${failed} 关通关率不达标 —— **不许进包**（因运气打不过的关，出口只能是广告，正是我们禁止的）`);
  process.exit(1);
}
console.log('\n✓ 全部关卡可解（通关率 ≥ 80%）');
