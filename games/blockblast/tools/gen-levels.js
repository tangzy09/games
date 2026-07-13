#!/usr/bin/env node
/**
 * gen-levels.js — 关卡生成器（参数化 → 生成 levels.js 的数据）。
 *
 * 关卡的难度旋钮只有三个，都很直白：
 *   · lines  —— 水晶挂在几条线上（每条线 = 玩家必须打通的一行/一列）
 *   · gap    —— 每条线留几个空格要玩家自己填（越多越难）
 *   · stones —— 石块数（封死整行整列，最强的空间约束；**绝不放在水晶所在的线上**）
 *
 * 生成后必须跑 verify-levels.js：通关率 <80% 的关不许进包。
 * 用法: node tools/gen-levels.js > /tmp/levels-body.txt
 */
'use strict';

const KIND = { B: 'blue', P: 'pink', O: 'orange' };

/**
 * line = [type, index, kindKey, gap, crystalCount]
 *   type: 'r' 行 | 'c' 列；index: 行号/列号；gap: 留给玩家填的空格数；crystalCount: 这条线上放几颗水晶
 */
function build(id, lines, stones, note) {
  const board = new Map();          // "r,c" → 'block' | 'crystal:kind' | 'stone'
  const key = (r, c) => `${r},${c}`;

  for (const [r, c] of stones || []) board.set(key(r, c), 'stone');

  for (const [type, i, kk, gap, nc] of lines) {
    const cells = [];
    for (let j = 0; j < 8; j++) cells.push(type === 'r' ? [i, j] : [j, i]);
    const free = cells.filter(([r, c]) => !board.has(key(r, c)));      // 石块占的格跳过
    const ncry = nc || 1;
    // 水晶放这条线的头部，空格留在尾部，中间全是预置块
    let placed = 0;
    for (let k = 0; k < free.length; k++) {
      const [r, c] = free[k];
      const already = board.get(key(r, c));
      if (already && already.startsWith('crystal')) continue;          // 交叉点已是水晶
      if (placed < ncry && !already) { board.set(key(r, c), 'crystal:' + KIND[kk]); placed++; continue; }
      if (k >= free.length - gap) { board.delete(key(r, c)); continue; }   // 尾部留空给玩家
      if (!already) board.set(key(r, c), 'block');
    }
  }

  const crystals = [], blocks = [], st = [];
  for (const [k, v] of board) {
    const [r, c] = k.split(',').map(Number);
    if (v === 'stone') st.push([r, c]);
    else if (v === 'block') blocks.push([r, c]);
    else if (v.startsWith('crystal')) crystals.push([r, c, v.split(':')[1]]);
  }
  const fmt = a => '[' + a.map(t => '[' + t.map(x => (typeof x === 'string' ? kindShort(x) : x)).join(',') + ']').join(',') + ']';
  const kindShort = s => ({ blue: 'B', pink: 'P', orange: 'O' }[s] || s);

  let out = `    { id: ${id},${note ? ` // ${note}` : ''}\n`;
  if (st.length) out += `      stones: ${fmt(st)},\n`;
  if (blocks.length) out += `      blocks: ${fmt(blocks)},\n`;
  out += `      crystals: ${fmt(crystals)} },\n`;
  return out;
}

// ── 20 关的配方 ──────────────────────────────────────────
// 关 1-2: FTUE（一两步就见到消行 + 收集）
// 关 3-5: 教「消列也算」「行列交汇一步双消」
// 关 6-10: 2-3 条线，gap 渐增
// 关 11-15: 加石块（避开水晶线！）
// 关 16-20: 4-5 条线 + gap 4-5 + 2 石块
const SPECS = [
  [1,  [['r', 7, 'B', 1, 2]], [], 'FTUE: 一步消掉第一行'],
  [2,  [['r', 7, 'B', 1, 2], ['r', 6, 'P', 1, 1]], [], 'FTUE: 连消两行 = 第一次 streak'],
  [3,  [['r', 7, 'B', 2, 2], ['r', 6, 'P', 2, 1]], [], ''],
  [4,  [['c', 0, 'B', 2, 2], ['c', 7, 'P', 2, 1]], [], '教「消列也收集」'],
  [5,  [['r', 7, 'B', 2, 1], ['c', 7, 'P', 2, 1]], [], '行列交汇'],
  [6,  [['r', 5, 'B', 3, 1], ['r', 7, 'P', 2, 1], ['c', 0, 'O', 2, 1]], [], ''],
  [7,  [['r', 6, 'B', 3, 2], ['c', 2, 'P', 3, 1]], [], ''],
  [8,  [['r', 3, 'B', 3, 1], ['r', 6, 'P', 3, 1], ['c', 7, 'O', 3, 1]], [], ''],
  [9,  [['c', 1, 'B', 3, 1], ['c', 6, 'P', 3, 1], ['r', 7, 'O', 3, 1]], [], ''],
  [10, [['r', 2, 'B', 4, 1], ['r', 5, 'P', 3, 1], ['c', 3, 'O', 3, 1]], [], ''],
  [11, [['r', 7, 'B', 3, 1], ['r', 5, 'P', 2, 1], ['c', 2, 'O', 2, 1]], [[0, 0]], '首次石块（在第 0 行/第 0 列，避开所有水晶线）'],
  [12, [['r', 6, 'B', 3, 1], ['c', 5, 'P', 3, 1], ['c', 1, 'O', 3, 1]], [[0, 7]], ''],
  [13, [['r', 4, 'B', 4, 1], ['r', 7, 'P', 3, 1], ['c', 6, 'O', 3, 1]], [[0, 0]], ''],
  [14, [['r', 3, 'B', 4, 1], ['c', 0, 'P', 4, 1], ['r', 6, 'O', 3, 1]], [[7, 7]], ''],
  [15, [['r', 5, 'B', 4, 1], ['r', 2, 'P', 4, 1], ['c', 4, 'O', 4, 1]], [[0, 0], [7, 7]], ''],
  [16, [['r', 1, 'B', 4, 1], ['r', 6, 'P', 4, 1], ['c', 0, 'O', 4, 1]], [], '三条线 + 大空缺'],
  [17, [['r', 7, 'B', 4, 1], ['c', 1, 'P', 4, 1], ['c', 6, 'O', 3, 1]], [[0, 0]], ''],
  [18, [['r', 2, 'B', 4, 1], ['r', 5, 'P', 4, 1], ['c', 3, 'O', 4, 1]], [[0, 0]], ''],
  [19, [['r', 6, 'B', 4, 1], ['r', 1, 'P', 3, 1], ['c', 2, 'O', 3, 1]], [[0, 0]], ''],   // 2 个石块封死 4 条线 = 太狠(77%)，减成 1 个、难度改由 gap 提供
  [20, [['r', 4, 'B', 5, 1], ['r', 7, 'P', 4, 1], ['c', 0, 'O', 4, 1], ['c', 6, 'B', 3, 1]], [[0, 7]], '收尾：四条线 + 最大空缺'],
];

let out = '';
for (const [id, lines, stones, note] of SPECS) out += build(id, lines, stones, note);
console.log(out);
