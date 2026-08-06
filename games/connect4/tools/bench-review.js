// ════════════════════════════════════════
// bench-review.js —— **整局复盘要等多久**（P3 开工前的决定性测量，DESIGN §3.3 / §9.2）。
//
// P3 的赛后复盘要给**每一手**算真值（胜负曲线 / 转折点 / 精准度 / 妙手），
// = 一局 n 手就要 n 次 `scoreAll`。而 §9.2 那个断崖说 n=10..15 每次 1.7 秒
// ⇒ 天真实现的整局复盘可能是**十几秒起步**。这脚本要回答的就是：到底多久，以及怎么变快。
//
// ⭐⭐ 本脚本的核心假设（要证伪的那个）：**置换表跨手保留在复盘里比在对局里强得多**。
//   §9.2 记的 5.08× 是「同一局连续局面重叠极大」——而复盘是把**同一局的全部局面**
//   一次算完，重叠程度是这条性质的极限情况。
//   ⇒ 三个变体：
//     · fwd    正序（n=0→末）+ keepTable
//     · rev    **倒序**（末→n=0）+ keepTable ——「残局先算，填满表，前面的白捡」
//     · nokeep 正序 + 关表（对照组：不开这个优化会是什么下场）
//
// ⛔ **每个变体必须独立进程**（bench-solver.js 抬头那条纪律）：先后 require 两次量到的是
//    JIT 去优化，不是算法。⇒ 本脚本一次只跑一个 mode，由 --mode 指定。
//
// 用法：
//   node games/connect4/tools/bench-review.js --mode=fwd     # 正序 + keepTable
//   node games/connect4/tools/bench-review.js --mode=rev     # 倒序 + keepTable
//   node games/connect4/tools/bench-review.js --mode=nokeep  # 正序 + 关表（对照）
//   加 --seed=N 换一局；--json 只输出一行 JSON（给对比脚本吃）
// ════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');
const AI = require('../js/ai.js');

function argOf(k, d) {
  const p = process.argv.find(a => a.startsWith('--' + k + '='));
  return p ? p.slice(k.length + 3) : d;
}
const MODE = argOf('mode', 'fwd');
const SEED = parseInt(argOf('seed', '12345'), 10) | 0;
const JSON_ONLY = process.argv.includes('--json');
if (['fwd', 'rev', 'nokeep'].indexOf(MODE) < 0) {
  console.error('⛔ --mode 只能是 fwd / rev / nokeep');
  process.exit(2);
}
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;

// ─── 装真库（没有库的话 n≤9 是几十分钟，测出来的数没有意义）───
const BOOK_PATH = path.join(__dirname, '..', 'data', 'book-classic.bin');
if (!fs.existsSync(BOOK_PATH)) {
  console.error('⛔ 找不到开局库 ' + BOOK_PATH + ' —— 先 `npm run gen:c4book`');
  process.exit(2);
}
{
  const raw = fs.readFileSync(BOOK_PATH);
  const bk = BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length));
  if (!bk) { console.error('⛔ 开局库解析失败'); process.exit(2); }
  S.setBook(bk);
  if (!JSON_ONLY) console.log('库 ply=' + bk.ply + '  ' + bk.count.toLocaleString() + ' 条');
}

// ─── 造一局真实对局（⛔ 禁 Math.random：基准必须可复现）───
// ⚠ 用中档对打：太弱的档会下出短局，太强的会互相逼成教科书线，都不代表玩家的真实一局。
const MOVE_SALT = 0x9e3779b1;
function playGame(seed) {
  let bd = B.newBoard();
  const moves = [];
  while (R.terminal(bd) === null) {
    const col = AI.aiMove(bd, bd.n % 2 === 0 ? 8 : 6, (seed + bd.n * MOVE_SALT) | 0);
    moves.push(col);
    bd = B.play(bd, col);
  }
  return moves;
}
const moves = playGame(SEED);

// ⭐ 复盘要算的是「每一手落下之**前**」的局面 ⇒ 前缀 0..len-1（len 个局面）。
const boards = [];
{
  let bd = B.newBoard();
  for (let i = 0; i < moves.length; i++) { boards.push(bd); bd = B.play(bd, moves[i]); }
}
if (!JSON_ONLY) console.log('样本对局 seed=' + SEED + '  ' + moves.length + ' 手  ⇒ ' + boards.length + ' 个局面要算');

// ─── 跑 ───
S.setKeepTable(MODE !== 'nokeep');
const order = [];
for (let i = 0; i < boards.length; i++) order.push(i);
if (MODE === 'rev') order.reverse();

const per = new Array(boards.length).fill(0);
const t0 = ms();
for (const i of order) {
  const a = ms();
  S.scoreAll(boards[i]);
  per[i] = ms() - a;
}
const total = ms() - t0;

// ─── 报 ───
const worst = per.reduce((m, v, i) => (v > per[m] ? i : m), 0);
const out = {
  mode: MODE, seed: SEED, plies: boards.length,
  totalMs: +total.toFixed(1),
  worstN: worst, worstMs: +per[worst].toFixed(1),
  // ⭐ 断崖段（n=10..15）单独报：整局的账基本全在这六手上
  cliffMs: +per.slice(10, 16).reduce((a, b) => a + b, 0).toFixed(1),
  perMs: per.map(v => +v.toFixed(1))
};
if (JSON_ONLY) { console.log(JSON.stringify(out)); process.exit(0); }

console.log('\n每个局面的耗时（ms，下标 = 该局面已有几手）：');
for (let i = 0; i < per.length; i += 10) {
  console.log('  n=' + String(i).padStart(2) + '..' + String(Math.min(i + 9, per.length - 1)).padStart(2) + '  ' +
    per.slice(i, i + 10).map(v => v.toFixed(1).padStart(8)).join(''));
}
console.log('\n⭐ mode=' + MODE + '  整局复盘 = ' + (total / 1000).toFixed(2) + ' s' +
  '   最慢单个局面 n=' + worst + ' 的 ' + (per[worst] / 1000).toFixed(2) + ' s' +
  '   断崖段(n=10..15) 合计 ' + (out.cliffMs / 1000).toFixed(2) + ' s');
