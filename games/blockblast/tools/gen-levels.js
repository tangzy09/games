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

const KIND = { B: 'blue', P: 'pink', O: 'orange', G: 'green', V: 'violet' };

/**
 * line = [type, index, kindKey, gap, crystalCount]
 *   type: 'r' 行 | 'c' 列；index: 行号/列号；gap: 留给玩家填的空格数；crystalCount: 这条线上放几颗水晶
 * pieceCry = [kindKey, every, goal] —— 拼块自带水晶（平均每 every 块驮一颗，收 goal 颗）
 *   ⛔ 带 pieceCry 的关最多 1 颗石块（validate 会拦：2 石块会造出行列双封死格）
 */
function build(id, lines, stones, note, pieceCry) {
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
  const kindShort = s => ({ blue: 'B', pink: 'P', orange: 'O', green: 'G', violet: 'V' }[s] || s);

  let out = `    { id: ${id},${note ? ` // ${note}` : ''}\n`;
  if (st.length) out += `      stones: ${fmt(st)},\n`;
  if (blocks.length) out += `      blocks: ${fmt(blocks)},\n`;
  if (pieceCry) {
    const [kk, every, goal] = pieceCry;
    out += `      crystals: ${fmt(crystals)},\n`;
    out += `      pieceCrystals: { every: ${every}, kind: ${kindShort(KIND[kk])}, goal: ${goal} } },\n`;
  } else {
    out += `      crystals: ${fmt(crystals)} },\n`;
  }
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
  // ── 第三章「翡翠林地」21-30：引入拼块自带水晶（green/violet）——
  //    水晶不再只长在盘上，托盘的块也会驮着来，落点由玩家规划。
  //    ⛔ 带 pieceCrystals 的关最多 1 颗石块（validate 拦）。
  [21, [['r', 6, 'G', 3, 2], ['r', 3, 'P', 3, 1]], [], '章三开篇：首次拼块水晶（温和引入）', ['G', 3, 2]],
  [22, [['r', 5, 'B', 4, 1], ['c', 2, 'O', 3, 1], ['r', 7, 'G', 3, 1]], [[0, 0]], ''],
  [23, [['c', 5, 'G', 4, 1], ['r', 2, 'B', 4, 1]], [], '', ['V', 3, 3]],
  // ⚠ 拼块水晶目标会把局拉长（AI 中位 11-17 步），死亡率随局长上升 ——
  //   goal 2-3 就够「新机制」的感觉了；首版 goal 4-5 + gap 5 直接把 30 关打到 46%（verify 拦下）。
  [24, [['r', 6, 'P', 3, 1], ['c', 1, 'G', 3, 1], ['r', 3, 'O', 3, 1], ['c', 6, 'B', 3, 1]], [[0, 7]], '四条线'],
  [25, [['r', 7, 'G', 3, 1], ['c', 4, 'P', 3, 1], ['r', 1, 'V', 3, 1]], [], '', ['G', 3, 2]],
  [26, [['r', 4, 'B', 4, 1], ['c', 0, 'V', 4, 1], ['r', 6, 'G', 4, 1], ['c', 7, 'O', 3, 1]], [[0, 3]], ''],
  [27, [['r', 5, 'V', 4, 1], ['c', 3, 'G', 4, 1]], [], '', ['V', 3, 3]],
  [28, [['r', 2, 'G', 4, 1], ['r', 6, 'B', 3, 1], ['c', 5, 'P', 4, 1], ['c', 1, 'O', 3, 1]], [[7, 7]], ''],
  [29, [['r', 7, 'V', 3, 1], ['c', 2, 'B', 3, 1], ['r', 4, 'G', 3, 1]], [], '', ['G', 3, 2]],
  [30, [['r', 3, 'G', 4, 1], ['r', 6, 'V', 4, 1], ['c', 4, 'B', 4, 1]], [[0, 7]], '章三收尾：三线 + 拼块水晶大考', ['V', 3, 3]],
];

let out = '';
for (const [id, lines, stones, note, pieceCry] of SPECS) out += build(id, lines, stones, note, pieceCry);
console.log(out);
