// test-rules.js —— rules-classic.js 是求解器与 bitboard 之间的**唯一接口**：
// 它错了，求解器会把「一手能赢」看漏、把「已经赢了」当成还没完、或者搜索顺序退化到
// 慢几个数量级还不报错。本文件覆盖三件事：着法生成（含顺序）、终局判定（含优先级）、
// 制胜手识别。
const assert = require('assert');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');

// --- 着法顺序：中路优先（αβ 剪枝效率的关键）---
assert.deepStrictEqual(R.moves(B.newBoard()), [3, 2, 4, 1, 5, 0, 6]);
console.log('test-rules: 中路优先着法序 OK');

// --- 满列被排除 ---
let bd = B.newBoard();
for (let i = 0; i < 6; i++) bd = B.play(bd, 3);
assert.deepStrictEqual(R.moves(bd), [2, 4, 1, 5, 0, 6]);
console.log('test-rules: 满列被排除 OK');

// --- 终局判定 ---
assert.strictEqual(R.terminal(B.newBoard()), null, '开局不是终局');
assert.strictEqual(R.terminal(B.fromMoves([3, 4, 3, 4, 3, 4, 3])), 'WIN_0');
assert.strictEqual(R.terminal(B.fromMoves([0, 3, 0, 4, 0, 5, 1, 3, 1, 4, 1])), null);
console.log('test-rules: 终局判定 OK');

// --- 和局：满盘且无人四连 ---
// ⚠ 这串手数**照抄自** games/connect4/tests/test-bitboard.js 的 DRAW_MOVES 常量
//   （那边已用 DFS 搜出、并与独立 2D 参考实现逐格核对过是真和棋，见该文件第 224-227 行注释）。
//   ⛔ 不 require 另一个测试文件，直接把 42 个数字抄过来，避免测试之间产生依赖。
const DRAW_MOVES = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                    6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];
const drawBd = B.fromMoves(DRAW_MOVES);
assert.strictEqual(drawBd.n, 42, '前提：这串手数必须正好 42 手（满盘）');
assert.strictEqual(B.winner(drawBd), null, '前提：bitboard 层已确认这是真和棋（见 test-bitboard.js）');
assert.strictEqual(R.terminal(drawBd), 'DRAW');
console.log('test-rules: 和局 OK');

// --- moves() 对满盘返回 []（复用上面的真和棋满盘局面）---
assert.deepStrictEqual(R.moves(drawBd), [], '满盘必须无路可走');
console.log('test-rules: 满盘 moves() 为空 OK');

// --- 一手取胜可被识别 ---
const oneAway = B.fromMoves([3, 4, 3, 4, 3, 4]);   // 先手第 3 列已三连，轮先手
assert.strictEqual(oneAway.turn, 0);
assert.deepStrictEqual(R.winningMoves(oneAway), [3]);
console.log('test-rules: 一手取胜识别 OK');

// --- winningMoves() 在无制胜手时返回 [] ---
assert.deepStrictEqual(R.winningMoves(B.newBoard()), [], '开局没有一手制胜');
console.log('test-rules: 无制胜手时 winningMoves 为空 OK');

// --- terminal()：已经赢了但盘面还没满，必须是 WIN_x 而不是 null ---
{
  const wonEarly = B.fromMoves([3, 4, 3, 4, 3, 4, 3]);   // 只用 7 手就四连，远没到 42 格满盘
  assert.strictEqual(wonEarly.n, 7, '前提：远没满盘');
  assert.strictEqual(B.isFull(wonEarly), false, '前提：确实没满盘（否则这条用例测不到优先级）');
  assert.strictEqual(R.terminal(wonEarly), 'WIN_0', '赢了但没满盘，必须报 WIN_0 而不是 null');
  console.log('test-rules: 赢了但未满盘 -> WIN_x（不是 null）OK');
}

// --- terminal()：最后一手同时填满盘面且连成四连，胜负优先于和局 ---
{
  // ⚠ 这串 42 手是用离线脚本随机搜出来的（不是手算——手算试了几版都因为「填充其余列」的
  //   轮转方式与「奇偶决定先后手」的周期 2 共振，导致填充列自己先意外拼出了四连，胜负早在
  //   四十手前就定了，测不到「最后一手才分胜负」这个场景）。搜索时同时校验了两条前提：
  //   前 41 手 winner 必须是 null（还没分出胜负），第 42 手（落 c6）必须同时让盘面 isFull
  //   且 winner!==null —— 这样才是真正的「填满与四连同时发生在最后一手」。
  const LAST_MOVE_WIN_MOVES = [
    6, 5, 6, 6, 0, 6, 3, 6, 1, 4, 0, 2, 1, 2, 2, 3, 3, 5, 2, 0,
    0, 1, 2, 2, 0, 5, 5, 3, 4, 0, 3, 3, 4, 4, 4, 5, 1, 1, 5, 4, 1, 6
  ];
  const bd41 = B.fromMoves(LAST_MOVE_WIN_MOVES.slice(0, 41));
  assert.strictEqual(bd41.n, 41, '前提：前 41 手');
  assert.strictEqual(B.winner(bd41), null, '前提：前 41 手时还没分出胜负（不然就不是"最后一手"赢）');
  assert.strictEqual(B.isFull(bd41), false, '前提：41 手时还没满盘');

  const finalBd = B.fromMoves(LAST_MOVE_WIN_MOVES);
  assert.strictEqual(finalBd.n, 42, '前提：构造序列必须正好 42 手');
  assert.strictEqual(B.isFull(finalBd), true, '前提：构造出的局面必须恰好满盘');
  const w = B.winner(finalBd);
  assert.notStrictEqual(w, null, '前提：第 42 手（落 c6）必须当场四连');
  assert.strictEqual(R.terminal(finalBd), 'WIN_' + w,
    '最后一手同时填满盘面且四连，必须报 WIN_x（胜负优先于和局），不是 DRAW');
  console.log('test-rules: 最后一手四连+满盘 -> 胜负优先于和局 OK');
}

// --- ORDER 是导出常量：外部不能悄悄改它进而污染内部 moves() 的着法顺序 ---
// ⚠ 已核实：rules-classic.js 里 ORDER 与 moves() 共用同一个数组引用（没有防御性拷贝），
//   若不加保护，`R.ORDER.reverse()` 会让内部 moves() 的着法序也跟着倒过来——搜索还能跑，
//   只是从中路优先退化成边路优先，αβ 剪枝效率暴跌，且没有任何报错，是最难查的一类性能回归。
//   实现里对 ORDER 做了 Object.freeze()：就地修改方法（reverse/sort/push...）在冻结数组上
//   会**直接抛 TypeError**（Array.prototype.reverse 内部按规范总是以 throw=true 的方式写入，
//   不管调用处是否 strict mode），因此这里断言的是「抛错」而不是「静默无效」。
{
  const before = R.moves(B.newBoard());
  assert.throws(() => R.ORDER.reverse(), TypeError,
    'R.ORDER 必须是冻结的：外部代码就地修改它必须报错，不许静默改坏内部着法顺序');
  const after = R.moves(B.newBoard());
  assert.deepStrictEqual(after, before, 'ORDER 冻结失败后（抛错），内部 moves() 顺序必须原封未动');
  console.log('test-rules: R.ORDER 冻结、外部改不动，也不会静默污染内部 moves() OK');
}

console.log('test-rules: 全部通过');
