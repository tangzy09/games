// test-bitboard.js —— 位棋盘是整个产品的正确性地基（求解器/AI/提示/复盘/课程全压在它上面）。
// 它错了是**静默**的灾难，所以本文件除了定点断言，还带一套**独立的朴素 2D 参考实现**
// 与 bitboard.js 逐手对拍（随机对局 × 每一手）——形状/边界/移位方向的任何错都会当场炸。
// ⛔ 任何断言变红时，先把盘面打印出来肉眼确认手数串，绝不许为了变绿放松 hasFour 的判定。
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
/** 出错时把盘面画出来，省得下次还要临时写脚本 */
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
/** 定点用例：既断言期望值，也断言参考实现同意 —— 手数串写错会立刻暴露 */
function expectWinner(moves, who, label) {
  const bd = B.fromMoves(moves);
  assert.strictEqual(refWinner(refCells(moves)), who, label + '：参考实现不同意（手数串写错了？）' + draw(moves));
  assert.strictEqual(B.winner(bd), who, label + '：bitboard 判错' + draw(moves));
}

// ════════ 建盘 ════════
let bd = B.newBoard();
assert.strictEqual(bd.n, 0);
assert.strictEqual(bd.turn, 0);
assert.strictEqual(B.winner(bd), null);
assert.strictEqual(B.isFull(bd), false);
assert.strictEqual(B.hasFour(bd.a), false);
assert.strictEqual(B.W, 7);
assert.strictEqual(B.H, 6);
assert.strictEqual(B.CELLS, 42);
console.log('test-bitboard: 新盘 OK');

// ════════ 落子与列高 ════════
bd = B.play(B.newBoard(), 3);
assert.strictEqual(bd.h[3], 1);
assert.strictEqual(bd.n, 1);
assert.strictEqual(bd.turn, 1, '落子后换手');
console.log('test-bitboard: 落子/列高/换手 OK');

// ════════ play 不改原棋盘（纯函数）════════
const before = B.newBoard();
B.play(before, 0);
assert.strictEqual(before.n, 0, 'play 必须返回新盘，不许就地改');
assert.strictEqual(before.a[0], 0, 'play 不许改原盘的掩码');
assert.strictEqual(before.h[0], 0, 'play 不许改原盘的列高');
assert.deepStrictEqual(before.mv, [], 'play 不许改原盘的手数列表');
console.log('test-bitboard: play 是纯函数 OK');

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
let full = B.newBoard();
for (let i = 0; i < 6; i++) full = B.play(full, 0);
assert.strictEqual(B.canPlay(full, 0), false);
assert.strictEqual(B.canPlay(full, 1), true);
assert.strictEqual(B.canPlay(full, -1), false);
assert.strictEqual(B.canPlay(full, 7), false);
console.log('test-bitboard: 列满/越界 OK');

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

// ════════ 斜线绝不许跨越棋盘边缘（结构性不变量）════════
// 先手在 c6 行0-2、c0 行0-2 各三子；第 6 列与第 0 列相邻是**表示法的假象**，不是棋盘事实。
expectWinner([6, 5, 6, 5, 6, 5, 0, 4, 0, 4, 0], null, '第 6 列与第 0 列不许被判成四连');
console.log('test-bitboard: 斜线不跨边缘 OK');

// ════════ 列与列之间不许竖向串起来（针对「42 位连续打包」表示法的经典陷阱）════════
// 先手同时占 (5,5) 与 (6,0)(6,1)(6,2)。若按「每列 6 位连续打包、无哨兵行」存，
// 这四格恰好是连续的 bit 35/36/37/38，v&(v>>1)&(v>>2)&(v>>3) 会假报竖四连。
// 每列一个独立掩码 ⇒ 结构性不可能。（局面由 DFS 搜出，全程无人成四）
expectWinner(
  [6, 4, 4, 4, 3, 0, 1, 4, 1, 4, 6, 3, 2, 1, 4, 0, 3, 3, 3, 3, 1, 5, 6, 1, 5, 5, 5, 6, 1, 2, 0, 6, 5, 2, 6, 0, 5],
  null, 'c5 顶格 + c6 底三格不许被串成竖四连');
console.log('test-bitboard: 列间不串竖线 OK');

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

// ════════ 满盘和：42 手真的无人连四 ════════
// ⚠ 这串是 DFS 搜出来并用独立 2D 实现验过的真和棋。
// （「每列各下 6 手」那种规整序列不是和棋——它会让每一整行同色，横四连遍地。）
const drawMoves = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                   6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];
const drawBd = B.fromMoves(drawMoves);
assert.strictEqual(drawBd.n, 42);
assert.strictEqual(B.isFull(drawBd), true);
assert.strictEqual(refWinner(refCells(drawMoves)), null, '这串手数必须真的是和棋' + draw(drawMoves));
assert.strictEqual(B.winner(drawBd), null, '满盘和不许有赢家' + draw(drawMoves));
for (let c = 0; c < 7; c++) assert.strictEqual(B.canPlay(drawBd, c), false, '满盘后第 ' + c + ' 列还能落？');
for (let c = 0; c < 7; c++) assert.strictEqual(B.isWinningMove(drawBd, c), false, '满盘后不该有制胜手');
console.log('test-bitboard: 满盘和 OK');

// ════════ fromMoves / toMoves 往返（存档靠它，规格 §9.3）════════
const mv = [3, 3, 4, 2, 5, 1];
assert.deepStrictEqual(B.toMoves(B.fromMoves(mv)), mv);
{
  const bd2 = B.fromMoves(mv);
  const out = B.toMoves(bd2);
  out.push(99);
  assert.deepStrictEqual(B.toMoves(bd2), mv, 'toMoves 必须返回副本，改它不许影响棋盘');
}
console.log('test-bitboard: 手数列表往返 OK');

// ════════ fromMoves 遇非法着法必须抛错（不许静默吃掉）════════
assert.throws(() => B.fromMoves([0, 0, 0, 0, 0, 0, 0]), /列 0/, '第 7 次落满列必须抛错');
assert.throws(() => B.fromMoves([7]), /列 7/, '越界列必须抛错');
assert.throws(() => B.fromMoves([-1]), /列 -1/, '负列必须抛错');
console.log('test-bitboard: 非法着法抛错 OK');

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
  const snapshot = JSON.stringify(t);
  B.isWinningMove(t, 3);
  assert.strictEqual(JSON.stringify(t), snapshot, 'isWinningMove 不许改棋盘（求解器热路径）');
  console.log('test-bitboard: isWinningMove 基本行为 OK');
}

// ════════ 随机对拍：逐手比对 bitboard 与独立 2D 参考实现 ════════
// 覆盖所有位置/所有方向/所有边界，这是防「静默错」的主力。
{
  let seed = 20260731 >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let games = 0, plies = 0, wins = [0, 0], draws = 0;
  for (let g = 0; g < 3000; g++) {
    let b = B.newBoard();
    const moves = [];
    for (;;) {
      // 1) winner 与参考实现一致
      const rw = refWinner(refCells(moves));
      assert.strictEqual(B.winner(b), rw, '随机对拍：winner 不一致' + draw(moves));
      // 2) isWinningMove 与「落子后 winner」一致（对每一列穷举）
      if (rw === null && !B.isFull(b)) {
        for (let c = 0; c < 7; c++) {
          const expect = B.canPlay(b, c) && B.winner(B.play(b, c)) === b.turn;
          assert.strictEqual(B.isWinningMove(b, c), expect,
            '随机对拍：isWinningMove(c=' + c + ') 与落子后 winner 不一致' + draw(moves));
        }
      }
      // 3) 结构不变量
      assert.strictEqual(b.n, moves.length);
      assert.strictEqual(b.turn, moves.length % 2);
      assert.deepStrictEqual(B.toMoves(b), moves);
      let sum = 0;
      for (let c = 0; c < 7; c++) {
        sum += b.h[c];
        assert.ok(b.h[c] >= 0 && b.h[c] <= 6, '列高越界');
        assert.strictEqual(b.a[c] & b.b[c], 0, '同一格不许被两方同时占');
        assert.strictEqual((b.a[c] | b.b[c]) >>> 0, ((1 << b.h[c]) - 1) >>> 0, '掩码必须是从底往上的连续段（重力）');
      }
      assert.strictEqual(sum, b.n, '列高之和必须等于手数');
      if (rw !== null) { wins[rw]++; break; }
      if (B.isFull(b)) { draws++; break; }
      const legal = [];
      for (let c = 0; c < 7; c++) if (B.canPlay(b, c)) legal.push(c);
      const c = legal[(rnd() * legal.length) | 0];
      moves.push(c);
      b = B.play(b, c);
      plies++;
    }
    games++;
  }
  assert.ok(wins[0] > 0 && wins[1] > 0 && draws > 0, '随机对局应当三种结局都出现过（覆盖不足？）');
  console.log('test-bitboard: 随机对拍 OK（' + games + ' 局 / ' + plies + ' 手，先手胜 ' +
              wins[0] + ' 后手胜 ' + wins[1] + ' 和 ' + draws + '）');
}

console.log('test-bitboard: 全部通过');
