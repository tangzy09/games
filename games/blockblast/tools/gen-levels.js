#!/usr/bin/env node
/**
 * gen-levels.js — 关卡生成器（参数化 → 直接写回 js/levels.js）。
 *
 * 关卡的难度旋钮只有三个，都很直白：
 *   · lines  —— 水晶挂在几条线上（每条线 = 玩家必须打通的一行/一列）
 *   · gap    —— 每条线留几个空格要玩家自己填（越多越难）
 *   · stones —— 石块数（封死整行整列，最强的空间约束；**绝不放在水晶所在的线上**）
 *
 * ⛔ 300 关不可能手写。**1-30 关保留手工配方**（FTUE 与三章教学是精心排的，验证过），
 *   31-300 由 `autoSpec(id)` 按难度曲线程序生成 —— 曲线**只在已知安全区里走**：
 *     · lines ≤ 4（模拟证过：4-5 线时参考 AI 通关率崩到 60%）
 *     · 2 颗石块封 4 条线 = 通关率 -20% ⇒ 石块数与线数**联动封顶**
 *     · pieceCrystals 的 goal 只取 2-3（首版 goal 5 直接把关打到 46%，verify 拦下）
 *   生成后必须跑 verify-levels.js：通关率 <80% 的关不许进包，它会**自动降难度重生成**那些关。
 *
 * 用法:
 *   node tools/gen-levels.js            # 打印（预览）
 *   node tools/gen-levels.js --write    # 直接写回 js/levels.js 的 LEVELS 与 CHAPTERS
 *   node tools/gen-levels.js --count 300
 */
'use strict';

const fs = require('fs');
const path = require('path');

const KIND = { B: 'blue', P: 'pink', O: 'orange', G: 'green', V: 'violet' };
const KEYS = ['B', 'P', 'O', 'G', 'V'];

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const COUNT = (() => { const i = args.indexOf('--count'); return i >= 0 ? parseInt(args[i + 1], 10) : 300; })();
/**
 * 某些关被 verify 判定太难时，用 --ease "35,36,90" 把它们降一档重生成。
 * ⚠ **同一个 id 写几次就降几档**（"35,35" = 降两档）—— 一档不够的关得能继续降，
 *   否则自动修复循环会卡在同几关上（tools/fix-levels.cjs 就是这么用的）。
 */
const EASE = new Map();
for (const n of ((args[args.indexOf('--ease') + 1] || '').match(/\d+/g) || []).map(Number)) {
  EASE.set(n, (EASE.get(n) || 0) + 1);
}

// ── 确定性散列：同一个 id 永远生成同一关（可复现，改一关不会连锁改动别关）──
function h32(a, b) {
  let h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 1, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2654435761) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

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
  const kindShort = s => ({ blue: 'B', pink: 'P', orange: 'O', green: 'G', violet: 'V' }[s] || s);
  const fmt = a => '[' + a.map(t => '[' + t.map(x => (typeof x === 'string' ? kindShort(x) : x)).join(',') + ']').join(',') + ']';

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

// ── 1-30 关：手工配方（FTUE + 三章教学，别动）──────────────────────
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
  [19, [['r', 6, 'B', 4, 1], ['r', 1, 'P', 3, 1], ['c', 2, 'O', 3, 1]], [[0, 0]], ''],
  [20, [['r', 4, 'B', 5, 1], ['r', 7, 'P', 4, 1], ['c', 0, 'O', 4, 1], ['c', 6, 'B', 3, 1]], [[0, 7]], '收尾：四条线 + 最大空缺'],
  // ── 第三章「翡翠林地」21-30：引入拼块自带水晶（green/violet）──
  [21, [['r', 6, 'G', 3, 2], ['r', 3, 'P', 3, 1]], [], '章三开篇：首次拼块水晶（温和引入）', ['G', 3, 2]],
  [22, [['r', 5, 'B', 4, 1], ['c', 2, 'O', 3, 1], ['r', 7, 'G', 3, 1]], [[0, 0]], ''],
  [23, [['c', 5, 'G', 4, 1], ['r', 2, 'B', 4, 1]], [], '', ['V', 3, 3]],
  [24, [['r', 6, 'P', 3, 1], ['c', 1, 'G', 3, 1], ['r', 3, 'O', 3, 1], ['c', 6, 'B', 3, 1]], [[0, 7]], '四条线'],
  [25, [['r', 7, 'G', 3, 1], ['c', 4, 'P', 3, 1], ['r', 1, 'V', 3, 1]], [], '', ['G', 3, 2]],
  [26, [['r', 4, 'B', 4, 1], ['c', 0, 'V', 4, 1], ['r', 6, 'G', 4, 1], ['c', 7, 'O', 3, 1]], [[0, 3]], ''],
  [27, [['r', 5, 'V', 4, 1], ['c', 3, 'G', 4, 1]], [], '', ['V', 3, 3]],
  [28, [['r', 2, 'G', 4, 1], ['r', 6, 'B', 3, 1], ['c', 5, 'P', 4, 1], ['c', 1, 'O', 3, 1]], [[7, 7]], ''],
  [29, [['r', 7, 'V', 3, 1], ['c', 2, 'B', 3, 1], ['r', 4, 'G', 3, 1]], [], '', ['G', 3, 2]],
  [30, [['r', 3, 'G', 4, 1], ['r', 6, 'V', 4, 1], ['c', 4, 'B', 4, 1]], [[0, 7]], '章三收尾：三线 + 拼块水晶大考', ['V', 3, 3]],
];

// ════════════════════════════════════════
// 31 关往后：按难度曲线**程序生成**
//
// 难度 d ∈ [0,1] 由「章序」和「章内位置」共同决定：章内由易到难（一章走完一个小波），
// 章与章之间缓慢加压。⛔ 但 d 只映射到**已知安全区**里的参数，不许一路顶到线数 5 / 石块 3。
// ════════════════════════════════════════
const PER_CHAPTER = 10;

function autoSpec(id) {
  const ch = Math.ceil(id / PER_CHAPTER);              // 第几章（1-based）
  const inCh = (id - 1) % PER_CHAPTER;                 // 章内位置 0..9
  let d = Math.min(1, (ch - 3) / 40) * 0.42 + (inCh / (PER_CHAPTER - 1)) * 0.58;
  if (EASE.has(id)) d = Math.max(0, d - 0.30 * EASE.get(id));   // verify 判太难 ⇒ 每记一次降一档

  const nLines = 2 + Math.round(d * 2);                       // 2..4（⛔ 不到 5）
  const gap = 2 + Math.round(d * 2.6);                        // 2..5
  // 拼块水晶：每章第 3、8 关（从第 4 章起）—— 它把局拉长，别每关都来
  const withPiece = ch >= 4 && (inCh === 2 || inCh === 7);
  // ⛔ 石块与线数联动：4 条线时最多 1 颗（2 颗封 4 线 = -20% 通关率）；带拼块水晶的关最多 1 颗
  let nStones = d > 0.72 ? 2 : d > 0.42 ? 1 : 0;
  if (nLines >= 4) nStones = Math.min(nStones, 1);
  if (withPiece) nStones = Math.min(nStones, 1);

  // ── 选线：行/列各自不重复 ──
  const rows = [], cols = [];
  const lines = [];
  for (let k = 0; k < nLines; k++) {
    const hh = h32(id, k);
    const isRow = ((hh >>> 3) & 1) === 0 || cols.length >= 3;
    const pool = isRow ? rows : cols;
    let idx = hh % 8, guard = 0;
    while (pool.includes(idx) && guard++ < 8) idx = (idx + 1) % 8;
    pool.push(idx);
    // 颜色：每章两种主色（跟着章节主题走，视觉上一章一个调子）
    const kk = KEYS[(ch * 2 + (k % 2)) % KEYS.length];
    // 头两条线的 gap 略小 —— 一关里全是最难的线会劝退
    lines.push([isRow ? 'r' : 'c', idx, kk, Math.max(1, gap - (k < 2 ? 0 : 1)), k === 0 && d < 0.3 ? 2 : 1]);
  }

  // ── 选石块：**必须落在没有水晶的行且没有水晶的列**（否则那颗水晶行列双封 = 软锁死）──
  const stones = [];
  const rowSet = new Set(rows), colSet = new Set(cols);
  for (let k = 0; k < nStones; k++) {
    let found = null;
    for (let tryN = 0; tryN < 64 && !found; tryN++) {
      const hh = h32(id, 100 + k * 7 + tryN);
      const r = hh % 8, c = (hh >>> 8) % 8;
      if (rowSet.has(r) || colSet.has(c)) continue;
      if (stones.some(([sr, sc]) => sr === r && sc === c)) continue;
      found = [r, c];
    }
    if (found) stones.push(found);
  }

  const pieceCry = withPiece
    ? [KEYS[(ch + 3) % KEYS.length], 3, d > 0.6 ? 3 : 2]
    : null;
  const note = inCh === 0 ? `第 ${ch} 章` : '';
  return [id, lines, stones, note, pieceCry];
}

// ── 组装 ──────────────────────────────────────────
const specs = [];
for (const s of SPECS) if (s[0] <= COUNT) specs.push(EASE.has(s[0]) ? autoSpec(s[0]) : s);   // 手工关也允许被降
for (let id = SPECS.length + 1; id <= COUNT; id++) specs.push(autoSpec(id));

let body = '';
for (const [id, lines, stones, note, pieceCry] of specs) body += build(id, lines, stones, note, pieceCry);

// ── 章节表（30 章；宝箱奖励随章递增，封顶 800）──
const chapters = [];
const ACCENTS = ['#f0abfc', '#7dd3fc', '#86efac', '#fdba74', '#c4b5fd', '#fca5a5', '#5eead4', '#fde047'];
for (let ch = 1; ch * PER_CHAPTER <= COUNT; ch++) {
  chapters.push(`    { id: ${ch}, from: ${(ch - 1) * PER_CHAPTER + 1}, to: ${ch * PER_CHAPTER}, ` +
                `chest: ${Math.min(800, 150 + (ch - 1) * 25)}, accent: '${ACCENTS[(ch - 1) % ACCENTS.length]}' },`);
}
const chBody = chapters.join('\n') + '\n';

if (!WRITE) {
  console.log(body);
  console.log('// CHAPTERS:\n' + chBody);
  console.error(`（预览）${specs.length} 关 / ${chapters.length} 章。加 --write 写回 js/levels.js`);
  process.exit(0);
}

// ── 写回 js/levels.js（只换两段数组，其余一字不动）──
const P = path.join(__dirname, '..', 'js', 'levels.js');
let src = fs.readFileSync(P, 'utf8');
const swap = (label, startMark, newBody) => {
  const i = src.indexOf(startMark);
  if (i < 0) throw new Error('找不到锚点: ' + startMark);
  const j = src.indexOf('\n  ];', i);
  if (j < 0) throw new Error('找不到 ' + label + ' 的结尾');
  src = src.slice(0, i + startMark.length) + '\n' + newBody + src.slice(j + 1);
};
swap('LEVELS', '  const LEVELS = [', body);
swap('CHAPTERS', '  const CHAPTERS = [', chBody);
fs.writeFileSync(P, src, 'utf8');

// ── 地面真值：写完立刻读回来，用真正的 validate 校验 ──
delete require.cache[require.resolve(P)];
const Levels = require(P);
const errs = Levels.validate();
console.log(`写回 js/levels.js：${Levels.count()} 关 / ${Levels.CHAPTERS.length} 章`);
if (errs.length) {
  console.error('✗ validate 不过（前 20 条）:\n' + errs.slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('✓ validate 全过 —— 接着必须跑 verify-levels.js（通关率门禁）');
