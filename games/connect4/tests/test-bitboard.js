// test-bitboard.js —— 位棋盘是整个产品的正确性地基（求解器/AI/提示/复盘/课程全压在它上面）。
// 它错了是**静默**的灾难，所以本文件除了定点断言，还带一套**独立的朴素 2D 参考实现**
// 与 bitboard.js 逐手对拍（随机对局 × 每一手）——形状/边界/移位方向的任何错都会当场炸。
// ⛔ 任何断言变红时，先把盘面打印出来肉眼确认手数串，绝不许为了变绿放松 hasFourMasks 的判定。
//
// ⚠ 断言消息里的盘面图一律**惰性求值**（check(cond, () => ...)）：急求值时每手画一次
//   7×6 ASCII 图，占掉整个测试八成时间。
// ⚠ 配套的变异测试脚本自己也会静默失效——本轮就有一个变异体因为被测文件的导出行改过、
//   匹配串没命中，变异根本没植入却被计成「存活」。⇒ 变异脚本必须自检「这次替换到底生效了没有」
//   （替换前后相同就直接炸）。静默失效的验证工具比没有验证更危险：它给你一个假的绿。
const assert = require('assert');
const B = require('../js/bitboard.js');

// ════════ 独立参考实现（与 bitboard.js 零共享代码：cells[c][r] + 8 方向扫描）════════
const W = 7, H = 6;
function refCells(moves) {
  const cells = [];
  for (let c = 0; c < W; c++) cells.push(new Array(H).fill(null));
  const h = new Array(W).fill(0);
  let turn = 0;
  for (const c of moves) { cells[c][h[c]] = turn; h[c]++; turn ^= 1; }
  return cells;
}
function refWinner(cells) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
    const p = cells[c][r];
    if (p === null) continue;
    for (const [dc, dr] of dirs) {
      let k = 1;
      while (k < 4) {
        const cc = c + dc * k, rr = r + dr * k;
        if (cc < 0 || cc >= W || rr < 0 || rr >= H || cells[cc][rr] !== p) break;
        k++;
      }
      if (k === 4) return p;
    }
  }
  return null;
}
/** 出错时把盘面画出来，省得下次还要临时写脚本。⚠ 只在失败分支里调。 */
function draw(moves) {
  const cells = refCells(moves);
  let s = '\n';
  for (let r = H - 1; r >= 0; r--) {
    s += 'r' + r + ' |';
    for (let c = 0; c < W; c++) { const v = cells[c][r]; s += ' ' + (v === null ? '.' : (v === 0 ? 'X' : 'O')); }
    s += '\n';
  }
  return s + '     c0c1c2c3c4c5c6\n';
}
/** 惰性断言：msgFn 只在失败时才求值。 */
function check(cond, msgFn) { if (!cond) assert.fail(msgFn()); }
/** 定点用例：既断言期望值，也断言参考实现同意 —— 手数串写错会立刻暴露 */
function expectWinner(moves, who, label) {
  const bd = B.fromMoves(moves);
  check(refWinner(refCells(moves)) === who, () => label + '：参考实现不同意（手数串写错了？）' + draw(moves));
  check(B.winner(bd) === who, () => label + '：bitboard 判错' + draw(moves));
  // winner 与 hasFourFor 必须自洽
  assert.strictEqual(B.hasFourFor(bd, 0), who === 0, label + '：hasFourFor(bd,0) 与 winner 不自洽');
  assert.strictEqual(B.hasFourFor(bd, 1), who === 1, label + '：hasFourFor(bd,1) 与 winner 不自洽');
}

// ════════ 建盘 ════════
{
  const bd = B.newBoard();
  assert.strictEqual(bd.n, 0);
  assert.strictEqual(bd.turn, 0);
  assert.strictEqual(B.winner(bd), null);
  assert.strictEqual(B.isFull(bd), false);
  assert.strictEqual(B.hasFourFor(bd, 0), false);
  assert.strictEqual(B.hasFourFor(bd, 1), false);
  assert.strictEqual(B.W, 7);
  assert.strictEqual(B.H, 6);
  assert.strictEqual(B.CELLS, 42);
  // 列数组必须由 W 生成：硬编码 7 个 0 的话，把 W 改成 8 会让第 8 列静默永远不可落子
  assert.strictEqual(bd.a.length, B.W, 'a 的长度必须跟着 W 走');
  assert.strictEqual(bd.b.length, B.W, 'b 的长度必须跟着 W 走');
  assert.strictEqual(bd.h.length, B.W, 'h 的长度必须跟着 W 走');
  console.log('test-bitboard: 新盘 OK');
}

// ════════ 落子与列高 ════════
{
  const bd = B.play(B.newBoard(), 3);
  assert.strictEqual(bd.h[3], 1);
  assert.strictEqual(bd.n, 1);
  assert.strictEqual(bd.turn, 1, '落子后换手');
  console.log('test-bitboard: 落子/列高/换手 OK');
}

// ════════ play 不改原棋盘（纯函数）════════
{
  const before = B.newBoard();
  B.play(before, 0);
  assert.strictEqual(before.n, 0, 'play 必须返回新盘，不许就地改');
  assert.strictEqual(before.a[0], 0, 'play 不许改原盘的掩码');
  assert.strictEqual(before.h[0], 0, 'play 不许改原盘的列高');
  assert.deepStrictEqual(before.mv, [], 'play 不许改原盘的手数列表');
  console.log('test-bitboard: play 是纯函数 OK');
}

// ⚠ 表示法不变量（绕回 / 列间串线）这两节**故意排在下面的 C1 之前**：
//   C1 那个局面碰巧也是个绕回探针，会把绕回的错抢先判成「前提断言挂了」，
//   让人跑去怀疑局面写错，而不是去看 hasFourMasks。归因优先级：先怪表示法，再怪守卫。

// ════════ ⭐ 绝不许从棋盘一侧「绕回」另一侧（表示法不变量）════════
// ⚠ 这几条要真有牙，先手就必须**占满 4 个绕回后才相邻的格子**——只占 c0/c6 两列是空转的
//    （绕回四连要 4 个连续列，两列怎么都凑不齐，任何实现都判 null，抓不到东西）。
{
  // (a) 同一行的 c5,c6,c0,c1：任何「列号按 7 取模/循环移位」的实现都会把它看成四连。
  expectWinner([0, 2, 1, 3, 5, 4, 6], null, '绕回：行0 的 c5,c6,c0,c1 不许成四连');
  // (b) (5,0)(6,0)(0,1)(1,1)：若按**行主序**打包（index = r*W+c，横向移位 1），
  //     这四格恰是连续的 bit 5/6/7/8，横向检查会从行尾绕到下一行行首。
  // (a) 与 (b) 打的是**不同**的表示法陷阱，各自单独验过能杀掉对应的绕回变异体，别删任何一条。
  expectWinner([5, 0, 6, 1, 0, 3, 1], null, '绕回：行主序下 (5,0)(6,0)(0,1)(1,1) 不许成四连');
  console.log('test-bitboard: 不许绕回边缘 OK');
}

// ════════ ⭐ 列与列之间不许竖向串起来（针对「42 位连续打包」表示法的经典陷阱）════════
// 先手同时占 (5,5) 与 (6,0)(6,1)(6,2)。若按「每列 6 位连续打包、无哨兵行」存，
// 这四格恰好是连续的 bit 35/36/37/38，v&(v>>1)&(v>>2)&(v>>3) 会假报竖四连。
// 每列一个独立掩码 ⇒ 结构性不可能。（局面由 DFS 搜出，全程无人成四）
expectWinner(
  [6, 4, 4, 4, 3, 0, 1, 4, 1, 4, 6, 3, 2, 1, 4, 0, 3, 3, 3, 3, 1, 5, 6, 1, 5, 5, 5, 6, 1, 2, 0, 6, 5, 2, 6, 0, 5],
  null, 'c5 顶格 + c6 底三格不许被串成竖四连');
console.log('test-bitboard: 列间不串竖线 OK');

// ════════ ⭐ play 必须校验合法性（否则会造出「第 7 行的幽灵子」并被判成竖四连）════════
{
  // c0 已满：先手占 r3,r4,r5（三连），后手占 r0,r1,r2，轮到先手。
  // 不校验的话 play(bd,0) 会写进不存在的第 7 行，凑成 bit 3/4/5/6 的假竖四连。
  // ⚠ 顺带说明：这个局面**碰巧**也是个绕回探针（后手占 c4,c5,c6 的行0 + c0 的行0-2，
  //   绕回实现下会误判后手赢），所以下面那条 winner===null 的前提断言也守着绕回。
  //   将来换局面时别把这层附带覆盖悄悄弄没了——但真正负责绕回的是上面那一节。
  const bd = B.fromMoves([1, 0, 2, 0, 3, 0, 0, 4, 0, 5, 0, 6]);
  assert.strictEqual(bd.h[0], 6, '前提：c0 已满');
  assert.strictEqual(bd.turn, 0, '前提：轮到先手');
  assert.strictEqual(B.winner(bd), null, '前提：此时还没人赢');
  assert.throws(() => B.play(bd, 0), /列 0/, '往满列落子必须抛错（不然就是幽灵子假四连）');
  assert.throws(() => B.play(B.newBoard(), 7), /列 7/, '越界列必须抛错（不然 a 会被撑到 8 个元素、turn 空翻）');
  assert.throws(() => B.play(B.newBoard(), -1), /列 -1/, '负列必须抛错');
  // 抛错后原盘必须一点没动
  assert.strictEqual(bd.h[0], 6);
  assert.strictEqual(bd.n, 12);
  assert.strictEqual(bd.turn, 0);

  // ⭐ 类型也在 play 这个唯一闸口收：字符串列号会被静默接受（JS 里 arr['3'] 就是 arr[3]，
  //    盘面**完全正确**），但 mv 被污染成 ["3",...]，复盘/精准度/妙手全线静默失效。
  //    `play(bd, e.target.dataset.col)`（dataset 天生是字符串）是 P2 写 UI 时最自然的一手。
  const fresh = B.newBoard();
  assert.throws(() => B.play(fresh, '3'), /整数列号/, '字符串列号必须抛错');
  assert.throws(() => B.play(fresh, 3.5), /整数列号/, '小数必须抛错');
  assert.throws(() => B.play(fresh, NaN), /整数列号/, 'NaN 必须抛错');
  assert.throws(() => B.play(fresh, null), /整数列号/, 'null 必须抛错');
  assert.throws(() => B.play(fresh, undefined), /整数列号/, 'undefined 必须抛错');
  // 抛错后原盘零改动（尤其 mv 不许被塞进字符串）
  assert.strictEqual(fresh.n, 0);
  assert.strictEqual(fresh.turn, 0);
  assert.deepStrictEqual(fresh.mv, []);
  assert.deepStrictEqual(fresh.h, [0, 0, 0, 0, 0, 0, 0]);
  console.log('test-bitboard: play 校验列号类型/非法列 OK');
}

// ════════ clone 与原盘完全独立 ════════
{
  const src = B.fromMoves([3, 3, 4]);
  const cp = B.clone(src);
  cp.a[0] = 0x3f; cp.b[1] = 0x3f; cp.h[2] = 5; cp.mv.push(9); cp.n = 99; cp.turn = 1;
  assert.strictEqual(src.a[0], 0);
  assert.strictEqual(src.b[1], 0);
  assert.strictEqual(src.h[2], 0);
  assert.strictEqual(src.n, 3);
  assert.deepStrictEqual(src.mv, [3, 3, 4]);
  console.log('test-bitboard: clone 独立 OK');
}

// ════════ 列满不可落 ════════
{
  let full = B.newBoard();
  for (let i = 0; i < 6; i++) full = B.play(full, 0);
  assert.strictEqual(B.canPlay(full, 0), false);
  assert.strictEqual(B.canPlay(full, 1), true);
  assert.strictEqual(B.canPlay(full, -1), false);
  assert.strictEqual(B.canPlay(full, 7), false);
  console.log('test-bitboard: 列满/越界 OK');
}

// ════════ 竖四连（先手 0 连成）════════
expectWinner([3, 4, 3, 4, 3, 4, 3], 0, '竖四连 c3 行0-3');
console.log('test-bitboard: 竖四连 OK');

// ════════ 横四连 ════════
expectWinner([0, 0, 1, 1, 2, 2, 3], 0, '横四连 行0 c0-c3');
console.log('test-bitboard: 横四连 OK');

// ════════ 斜 ↗ 四连 ════════
// 先手占 (0,0)(1,1)(2,2)(3,3)（已用独立 2D 实现打印盘面核对）
expectWinner([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3], 0, '斜↗ (0,0)(1,1)(2,2)(3,3)');
console.log('test-bitboard: 斜↗ 四连 OK');

// ════════ 斜 ↘ 四连 ════════
// 先手占 (3,0)(2,1)(1,2)(0,3)
expectWinner([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0], 0, '斜↘ (0,3)(1,2)(2,1)(3,0)');
console.log('test-bitboard: 斜↘ 四连 OK');

// ════════ 三连不算赢 ════════
expectWinner([3, 4, 3, 4, 3], null, '三连不算赢');
console.log('test-bitboard: 三连不算赢 OK');

// ════════ 四连出现在列的中段/上段也要认（不是只认行 0-3）════════
expectWinner([0, 3, 3, 0, 3, 0, 3, 0, 3], 0, '竖四连 c3 行1-4');
expectWinner([0, 3, 1, 3, 3, 0, 3, 1, 3, 0, 3], 0, '竖四连 c3 行2-5');
console.log('test-bitboard: 竖四连 行1-4 / 行2-5 OK');

// ════════ 横四连贴最右边界（c3-c6）════════
expectWinner([3, 3, 4, 4, 5, 5, 6], 0, '横四连 行0 c3-c6');
console.log('test-bitboard: 横四连贴右边界 OK');

// ════════ 后手连成四连时 winner 必须是 1 ════════
expectWinner([0, 3, 1, 3, 2, 3, 6, 3], 1, '后手竖四连 c3');
console.log('test-bitboard: 后手获胜 OK');

// ⚠ 这串是 DFS 搜出来并用独立 2D 实现验过的真和棋。
// （「每列各下 6 手」那种规整序列不是和棋——它会让每一整行同色，横四连遍地。）
const DRAW_MOVES = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                    6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];

// ════════ 满盘和：42 手真的无人连四 ════════
{
  const drawBd = B.fromMoves(DRAW_MOVES);
  assert.strictEqual(drawBd.n, 42);
  assert.strictEqual(B.isFull(drawBd), true);
  check(refWinner(refCells(DRAW_MOVES)) === null, () => '这串手数必须真的是和棋' + draw(DRAW_MOVES));
  check(B.winner(drawBd) === null, () => '满盘和不许有赢家' + draw(DRAW_MOVES));
  for (let c = 0; c < 7; c++) assert.strictEqual(B.canPlay(drawBd, c), false, '满盘后第 ' + c + ' 列还能落？');
  for (let c = 0; c < 7; c++) assert.strictEqual(B.isWinningMove(drawBd, c), false, '满盘后不该有制胜手');
  console.log('test-bitboard: 满盘和 OK');
}

// ════════ isFull 的边界正好在 42（41 手时必须还没满）════════
{
  const bd41 = B.fromMoves(DRAW_MOVES.slice(0, 41));
  assert.strictEqual(bd41.n, 41);
  assert.strictEqual(B.isFull(bd41), false, '41 手不算满盘（isFull 写成 >= CELLS-1 就会在这里炸）');
  const bd42 = B.play(bd41, DRAW_MOVES[41]);
  assert.strictEqual(B.isFull(bd42), true, '第 42 手落下必须满盘');
  console.log('test-bitboard: isFull 边界 OK');
}

// ════════ fromMoves / toMoves 往返（存档靠它，规格 §9.3）════════
{
  const moves = [3, 3, 4, 2, 5, 1];
  assert.deepStrictEqual(B.toMoves(B.fromMoves(moves)), moves);
  const bd = B.fromMoves(moves);
  const out = B.toMoves(bd);
  out.push(99);
  assert.deepStrictEqual(B.toMoves(bd), moves, 'toMoves 必须返回副本，改它不许影响棋盘');
  console.log('test-bitboard: 手数列表往返 OK');
}

// ════════ fromMoves 遇非法着法必须抛错（不许静默吃掉）════════
{
  assert.throws(() => B.fromMoves([0, 0, 0, 0, 0, 0, 0]), /列 0/, '第 7 次落满列必须抛错');
  assert.throws(() => B.fromMoves([7]), /列 7/, '越界列必须抛错');
  assert.throws(() => B.fromMoves([-1]), /列 -1/, '负列必须抛错');
  // ⭐ 类型守卫由 play 提供，fromMoves 靠**委托**覆盖（这几条同时证明委托生效，别删）。
  //    `'3,3,4'.split(',')` 忘了 .map(Number) 是分享链接最自然的写法。
  assert.throws(() => B.fromMoves(['3']), /整数列号/, '字符串列号必须抛错');
  assert.throws(() => B.fromMoves([3, '3']), /整数列号/, '混进一个字符串也必须抛错');
  assert.throws(() => B.fromMoves([3.5]), /整数列号/, '小数必须抛错');
  assert.throws(() => B.fromMoves([null]), /整数列号/, 'null 必须抛错');
  assert.throws(() => B.fromMoves([NaN]), /整数列号/, 'NaN 必须抛错');
  // 正确的解析方式必须照常工作，且往返后仍是数字
  const parsed = B.fromMoves('3,3,4,2,5,1'.split(',').map(Number));
  assert.deepStrictEqual(B.toMoves(parsed), [3, 3, 4, 2, 5, 1]);
  assert.ok(B.toMoves(parsed).every((c) => typeof c === 'number'), '往返出来的必须是数字');
  console.log('test-bitboard: 非法着法/非整数列号抛错 OK');
}

// ════════ hasFourFor 是推荐入口；⛔ 那个吃掩码数组的原始函数不许叫 hasFour ════════
{
  assert.strictEqual(typeof B.hasFour, 'undefined',
    '⛔ 别把吃掩码数组的函数导出成 hasFour：hasFour(bd) 是极自然的手滑，' +
    '它会静默返回 false（=永远没人赢），是最难查的一类错。用 hasFourMasks / hasFourFor。');
  const won = B.fromMoves([3, 4, 3, 4, 3, 4, 3]);
  assert.strictEqual(B.hasFourFor(won, 0), true);
  assert.strictEqual(B.hasFourFor(won, 1), false);
  assert.strictEqual(B.hasFourMasks(won.a), true);
  assert.strictEqual(B.hasFourMasks(won.b), false);
  // a↔先手(0) / b↔后手(1) 的绑定别接反。⚠ 内部的 maskOf 刻意不导出（它返回活引用，
  // 改它能在不动 h 的情况下破坏重力不变量），所以这里用**行为等价**的写法钉死绑定。
  assert.strictEqual(typeof B.maskOf, 'undefined',
    'maskOf 返回的是活引用，默认不导出；求解器将来真要用，导出时 JSDoc 必须写明这点，再改这条断言');
  const one = B.fromMoves([3]);
  assert.strictEqual(one.a[3], 1, '先手的子必须落进 a');
  assert.strictEqual(one.b[3], 0);
  const two = B.fromMoves([3, 4]);
  assert.strictEqual(two.b[4], 1, '后手的子必须落进 b');
  assert.strictEqual(two.a[4], 0);
  console.log('test-bitboard: hasFourFor / hasFourMasks / 先后手绑定 OK');
}

// ════════ isWinningMove：不越界、不改盘、且与「落子后 winner」完全一致 ════════
{
  // ⚠ 手数必须是偶数才轮到先手：[3,4,3,4,3] 是 5 手、轮到后手，那时 c3 是「堵」不是制胜手。
  const t = B.fromMoves([3, 4, 3, 4, 3, 4]);       // 先手 c3 三连且轮到先手 ⇒ c3 是制胜手
  assert.strictEqual(t.turn, 0, '这条用例前提是轮到先手');
  assert.strictEqual(B.winner(t), null);
  assert.strictEqual(B.isWinningMove(t, 3), true);
  assert.strictEqual(B.isWinningMove(t, 4), false, 'c4 是后手的三连，先手落上去不算赢');
  assert.strictEqual(B.isWinningMove(t, 0), false);
  assert.strictEqual(B.isWinningMove(t, -1), false);
  assert.strictEqual(B.isWinningMove(t, 7), false);
  // 内部用「借一位算完再还回去」，所以必须钉死对外看棋盘一点没变
  const snapshot = JSON.stringify(t);
  B.isWinningMove(t, 3);
  B.isWinningMove(t, 4);
  assert.strictEqual(JSON.stringify(t), snapshot, 'isWinningMove 不许改棋盘（借了必须还）');
  console.log('test-bitboard: isWinningMove 基本行为 OK');
}

// ════════ 搜索盘：不带 mv，且 toMoves 必须明确拒绝它 ════════
{
  const src = B.fromMoves([3, 3, 4]);
  const sb = B.searchBoard(src);
  assert.strictEqual(sb.mv, null, '搜索盘故意不带手数列表');
  assert.strictEqual(sb.n, 3);
  assert.strictEqual(sb.turn, src.turn);
  assert.throws(() => B.toMoves(sb), /搜索盘不带手数列表/, '搜索盘不许被当存档用');
  assert.strictEqual(B.clone(sb).mv, null, 'clone 搜索盘不许把 null 变成别的东西');
  // 搜索盘与来源盘互不影响
  B.playIn(sb, 5);
  assert.strictEqual(src.h[5], 0, 'searchBoard 必须拷贝，不许与来源共享数组');

  // ⭐ playIn 必须拒绝带 mv 的「对外盘」：就地改它会让手数列表与盘面静默脱钩，
  //    而存档/撤销/「从第 N 步重来」/URL 分享全押在 mv 上（DESIGN §9.3）。
  const outer = B.fromMoves([3, 3, 4]);
  assert.throws(() => B.playIn(outer, 5), /searchBoard/,
    'playIn 吃到带 mv 的盘必须抛错，不然 n 走了 mv 没走，存档会静默存成另一局');
  assert.strictEqual(outer.n, 3, '被拒之后原盘一点没动');
  assert.strictEqual(outer.h[5], 0);
  assert.deepStrictEqual(B.toMoves(outer), [3, 3, 4], '被拒之后手数列表仍与盘面一致');
  assert.strictEqual(B.fromMoves(B.toMoves(outer)).n, outer.n, '手数列表往返必须还是同一局');
  console.log('test-bitboard: 搜索盘 OK');
}

// ════════ 随机对拍：逐手比对 bitboard 与独立 2D 参考实现 ════════
// 覆盖所有位置/所有方向/所有边界，这是防「静默错」的主力。
// 同时对拍 playIn/undoIn 这对可变 API —— 它一旦不对称就是静默灾难。
{
  const GAMES = 30000;
  const DEEP_GAMES = 3000;    // 前这么多局额外做「每列穷举 isWinningMove vs 落子后 winner」
  let seed = 20260731 >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let plies = 0;
  const wins = [0, 0];
  let draws = 0;
  const empty = B.searchBoard(B.newBoard());

  for (let g = 0; g < GAMES; g++) {
    let b = B.newBoard();
    const sb = B.searchBoard(B.newBoard());     // 可变搜索盘，与纯函数盘并行推进
    const moves = [];
    for (;;) {
      // 1) winner 与参考实现一致
      const rw = refWinner(refCells(moves));
      check(B.winner(b) === rw, () => '随机对拍：winner 不一致' + draw(moves));
      // 2) 搜索盘与纯函数盘必须逐位一致（playIn 的正确性）
      check(sb.turn === b.turn && sb.n === b.n, () => '随机对拍：搜索盘 turn/n 不一致' + draw(moves));
      for (let c = 0; c < 7; c++) {
        check(sb.a[c] === b.a[c] && sb.b[c] === b.b[c] && sb.h[c] === b.h[c],
          () => '随机对拍：playIn 与 play 状态不一致（c=' + c + '）' + draw(moves));
      }
      check(B.winner(sb) === rw, () => '随机对拍：搜索盘 winner 不一致' + draw(moves));
      // 3) isWinningMove 与「落子后 winner」一致（每列穷举；只在前 DEEP_GAMES 局做，它要建新盘）
      if (g < DEEP_GAMES && rw === null && !B.isFull(b)) {
        for (let c = 0; c < 7; c++) {
          const expect = B.canPlay(b, c) && B.winner(B.play(b, c)) === b.turn;
          check(B.isWinningMove(b, c) === expect,
            () => '随机对拍：isWinningMove(c=' + c + ') 与落子后 winner 不一致' + draw(moves));
          check(B.isWinningMove(sb, c) === expect,
            () => '随机对拍：搜索盘 isWinningMove(c=' + c + ') 不一致' + draw(moves));
        }
      }
      // 4) 结构不变量
      check(b.n === moves.length, () => 'n 与手数不符' + draw(moves));
      check(b.turn === moves.length % 2, () => 'turn 与手数奇偶不符' + draw(moves));
      let sum = 0;
      for (let c = 0; c < 7; c++) {
        sum += b.h[c];
        check(b.h[c] >= 0 && b.h[c] <= 6, () => '列高越界' + draw(moves));
        check((b.a[c] & b.b[c]) === 0, () => '同一格不许被两方同时占' + draw(moves));
        check(((b.a[c] | b.b[c]) >>> 0) === (((1 << b.h[c]) - 1) >>> 0),
          () => '掩码必须是从底往上的连续段（重力）' + draw(moves));
      }
      check(sum === b.n, () => '列高之和必须等于手数' + draw(moves));

      if (rw !== null) { wins[rw]++; break; }
      if (B.isFull(b)) { draws++; break; }

      const legal = [];
      for (let c = 0; c < 7; c++) if (B.canPlay(b, c)) legal.push(c);
      const c = legal[(rnd() * legal.length) | 0];
      moves.push(c);
      b = B.play(b, c);
      B.playIn(sb, c);
      plies++;
    }
    // 5) 全部 undoIn 回退后必须**完全**还原成空盘（一处不对称就在这里炸）
    for (let i = moves.length - 1; i >= 0; i--) B.undoIn(sb, moves[i]);
    check(sb.n === 0 && sb.turn === 0, () => 'undoIn 全回退后 n/turn 没还原' + draw(moves));
    for (let c = 0; c < 7; c++) {
      check(sb.a[c] === empty.a[c] && sb.b[c] === empty.b[c] && sb.h[c] === empty.h[c],
        () => 'undoIn 全回退后第 ' + c + ' 列没还原成空' + draw(moves));
    }
  }
  // ⚠ 随机对局里和棋极罕见（约千分之一），别把它当断言 —— 局数一调就会红，与正确性无关。
  //   和棋路径真正的保障是上面那条 42 手定点用例。这里只要求双方都赢过（说明覆盖到两侧）。
  assert.ok(wins[0] > 0 && wins[1] > 0, '随机对局里双方都该赢过（覆盖不足？）');
  console.log('test-bitboard: 随机对拍 OK（' + GAMES + ' 局 / ' + plies + ' 手，先手胜 ' +
              wins[0] + ' 后手胜 ' + wins[1] + ' 和 ' + draws +
              '；其中前 ' + DEEP_GAMES + ' 局做了 isWinningMove 穷举）');
}

console.log('test-bitboard: 全部通过');
