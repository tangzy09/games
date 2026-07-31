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

// --- winningMoves()：多个制胜手时必须**全部**返回，且按中路优先序 ---
// ⚠ 上面那条 oneAway 用例只有一个制胜列，一元数组测不出「顺序」也测不出「只返回第一个」
//   这类截断 bug。求解器要靠这个列表做「对手有两个制胜点 ⇒ 必输」的判定，漏一个就是错判。
{
  const two = B.fromMoves([2, 2, 3, 3, 4, 4]);   // 先手底行 c2,c3,c4 三连 ⇒ c1 与 c5 都制胜
  assert.strictEqual(two.turn, 0, '前提：轮先手');
  assert.strictEqual(B.isWinningMove(two, 1), true, '前提：c1 确实制胜');
  assert.strictEqual(B.isWinningMove(two, 5), true, '前提：c5 确实制胜');
  assert.deepStrictEqual(R.winningMoves(two), [1, 5],
    '两个制胜手必须都返回，且按 ORDER 的中路优先序（1 在 5 之前）');

  // ⚠ 上面这条 [1,5] 凑巧也是数值升序——按数值 sort() 而不是按 ORDER 排的变异体测不出来
  //   （已用变异测试脚本核实：只有这一条时该变异体存活）。这里换一组「ORDER 序 ≠ 数值升序」
  //   的制胜列：ORDER=[3,2,4,1,5,0,6] 里 4 排在 0 前面，但数值上 0<4。
  //   先手底行 c1,c2,c3 三连（左右都空）⇒ c0 与 c4 都制胜，期望 [4, 0]（不是数值升序的 [0, 4]）。
  const twoReordered = B.fromMoves([1, 6, 2, 6, 3, 6]);
  assert.strictEqual(twoReordered.turn, 0, '前提：轮先手');
  assert.strictEqual(B.isWinningMove(twoReordered, 0), true, '前提：c0 确实制胜');
  assert.strictEqual(B.isWinningMove(twoReordered, 4), true, '前提：c4 确实制胜');
  assert.deepStrictEqual(R.winningMoves(twoReordered), [4, 0],
    '按 ORDER 的中路优先序应是 [4,0]，不是数值升序的 [0,4]（能杀「按数值排序」这个变异体）');
  console.log('test-rules: 多个制胜手全返回 + 中路优先序 OK');
}

// --- moves() 必须返回**新数组**：调用方就地改它不许污染内部状态 ---
// negamax 加 move-ordering 启发式时几乎一定会就地 sort() moves() 的返回值。
{
  const m = R.moves(B.newBoard());
  assert.notStrictEqual(m, R.ORDER, 'moves() 不许把 ORDER 本身交出去');
  m.reverse(); m.push(99);
  assert.deepStrictEqual(R.moves(B.newBoard()), [3, 2, 4, 1, 5, 0, 6],
    '改调用方拿到的返回值，不许影响后续 moves() 调用');
  console.log('test-rules: moves() 返回新数组、调用方改不动内部状态 OK');
}

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
  // ⚠ 不用 'WIN_' + w 去算期望值——那是同义反复：期望值用和实现一模一样的公式算出来，
  //   标签怎么改都不会红。这里先把 winner 钉死成具体数字，再用字面量断言。
  assert.strictEqual(B.winner(finalBd), 1, '前提：第 42 手（落 c6）必须是后手当场四连');
  assert.strictEqual(R.terminal(finalBd), 'WIN_1',
    '最后一手同时填满盘面且四连，必须报 WIN_1（胜负优先于和局），不是 DRAW');
  console.log('test-rules: 最后一手四连+满盘 -> 胜负优先于和局 OK');
}

// --- ORDER 是导出常量：外部不能悄悄改它进而污染内部 moves() 的着法顺序 ---
// ⚠ rules-classic.js 内部用的是 _ORDER（热路径，故意不冻结——冻结会把数组踢出 V8 的
//   fast packed elements，Array.prototype.filter 退化到慢路径，实测真实 negamax 慢
//   2.4× 以上，见 rules-classic.js 顶部注释与本次 code review）；对外只导出它的**冻结副本**
//   ORDER。就地修改在冻结数组上会**直接抛 TypeError**（Array.prototype.reverse 内部按
//   规范总是以 throw=true 的方式写入，不管调用处是否 strict mode）。
//   即便冻结这层保护失效，ORDER 与 _ORDER 也是结构上不同的两个数组——外部拿到的那份
//   物理上够不着内部 moves() 真正遍历的数组，这才是这条防线真正的底牌。
{
  const before = R.moves(B.newBoard());
  assert.throws(() => R.ORDER.reverse(), TypeError,
    'R.ORDER 必须是冻结的：外部代码就地修改它必须报错，不许静默改坏着法顺序');
  const after = R.moves(B.newBoard());
  assert.deepStrictEqual(after, before, 'ORDER 冻结失败后（抛错），moves() 顺序必须原封未动');
  console.log('test-rules: R.ORDER 冻结、外部改不动，也不会静默污染内部 moves() OK');
}

// --- ORDER 必须是 0..W-1 的一个排列：漏一列 = 该列永远不可落子，静默 ---
{
  assert.strictEqual(R.ORDER.length, B.W, 'ORDER 必须覆盖全部 W 列（漏一列=该列永远不可落子，静默）');
  assert.deepStrictEqual([...R.ORDER].sort((a, b) => a - b), [...Array(B.W).keys()],
    'ORDER 必须是 0..W-1 的排列，不重不漏');
  console.log('test-rules: ORDER 是 0..W-1 的完整排列 OK');
}

// --- WIN / DRAW / winnerOf / isWin：新增的枚举辅助函数 ---
// ⚠ 全仓 grep 'WIN_1' 这个字面量之前零命中——生产者只存在于字符串拼接里，未来写 negamax
//   的人 grep 消费端比较值会找不到生产者、两端无法对照。改用 R.WIN[player] 生成、
//   R.winnerOf/R.isWin 消费，杜绝跨模块字面量漂移（solitaire 出过这个真实事故）。
{
  assert.deepStrictEqual(R.WIN, ['WIN_0', 'WIN_1'], 'WIN[0]/WIN[1] 下标即玩家号');
  assert.strictEqual(R.DRAW, 'DRAW');

  const p0Won = B.fromMoves([3, 4, 3, 4, 3, 4, 3]);
  assert.strictEqual(R.terminal(p0Won), R.WIN[0], 'terminal() 必须用 R.WIN 生成，不是手写字面量');
  assert.strictEqual(R.winnerOf(R.terminal(p0Won)), 0, 'winnerOf(WIN_0) === 0');
  assert.strictEqual(R.isWin(R.terminal(p0Won)), true);

  assert.strictEqual(R.terminal(finalBdForWinTest()), R.WIN[1]);
  assert.strictEqual(R.winnerOf(R.terminal(finalBdForWinTest())), 1, 'winnerOf(WIN_1) === 1');

  assert.strictEqual(R.winnerOf(R.DRAW), null, '和局的 winnerOf 必须是 null');
  assert.strictEqual(R.isWin(R.DRAW), false, '和局不算 isWin');
  assert.strictEqual(R.winnerOf(null), null, '未终局的 winnerOf 必须是 null');
  assert.strictEqual(R.isWin(null), false, '未终局不算 isWin');
  console.log('test-rules: WIN/DRAW/winnerOf/isWin 自洽 OK');
}

// --- API 对象本身也冻结：不许把内部函数整体换掉 ---
// ⚠ 这里断言的是「赋值静默无效」而不是「抛错」——对普通对象的属性赋值（不同于
//   Array.prototype.reverse 那种内部方法），non-strict 模式下写只读属性会静默失败，
//   不抛错（已用 node -e 实测确认）。真正的保护是「R.moves 引用没变」这件事本身。
{
  const originalMoves = R.moves;
  assert.strictEqual(Object.isFrozen(R), true, 'API 对象必须是 Object.freeze 过的');
  R.moves = () => [0];   // 冻结对象上的赋值：non-strict 下静默无效，不抛错
  assert.strictEqual(R.moves, originalMoves,
    'API 对象已冻结：外部改写 R.moves 这类导出函数必须静默无效，不许把实现换掉');
  console.log('test-rules: 导出的 API 对象已冻结（改写静默无效）OK');
}

console.log('test-rules: 全部通过');

// 复用上面「最后一手四连+满盘」用例的手数，供 WIN/DRAW 那节测 winnerOf(WIN_1)。
// ⚠ 故意写成函数而不是提升变量，避免与上面 block 作用域里的 finalBd 混淆。
function finalBdForWinTest() {
  return B.fromMoves([
    6, 5, 6, 6, 0, 6, 3, 6, 1, 4, 0, 2, 1, 2, 2, 3, 3, 5, 2, 0,
    0, 1, 2, 2, 0, 5, 5, 3, 4, 0, 3, 3, 4, 4, 4, 5, 1, 1, 5, 4, 1, 6
  ]);
}
