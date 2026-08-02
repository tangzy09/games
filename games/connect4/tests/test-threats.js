// ════════════════════════════════════════
// test-threats.js —— 威胁格计算的门禁（P2b Task 4 · DESIGN §6.4 上半）。
//
// 三件事，每一件都对应一个具体的、静默的失败模式：
//   ① **正确性**：与一份「暴力真值」逐格对拍（真的落一子下去看谁赢），⛔ 不是自己跟自己比。
//      随机 400 个局面 —— 只测手搓夹具的话，「只看当前行棋方」这个最容易犯的错会全绿。
//   ② ⛔⛔ **零搜索**：DESIGN §9.2 的断崖是每手 1,678 ms 中位，而威胁高亮**每帧**都要算。
//      判据两条：源码里（剥掉注释后）不许出现 Solver / EngineClient / scoreAll；
//      以及 20,000 次调用的实测耗时 —— 搜索一次就够超了。
//   ③ **不许改盘**：isWinningMove 是「借一下就还」的（bitboard.js:145-157），
//      一旦哪天有人把它换成 slice 版忘了还，盘面会被静默污染 ⇒ 快照逐位对比。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const Th = require('../js/threats.js');

// ─────────── ① 手搓夹具（含最关键的「两方同一格」）───────────
{
  const CASES = [
    { mv: [], want: [] },                                   // 空盘
    { mv: [3, 2, 4, 1], want: [] },                         // 有子但谁都不差一手
    // 先手底行 1/2/3 三连 ⇒ 左右两端各一个威胁；后手第 6 列竖三连 ⇒ (6,3)
    { mv: [1, 6, 2, 6, 3, 6], want: [
      { c: 0, r: 0, players: [0] }, { c: 4, r: 0, players: [0] }, { c: 6, r: 3, players: [1] }
    ] },
    // ⭐⭐ 同一格**两方都能赢**（全局最关键的一格）：players 必须是 [0,1]，⛔ 不许只回一个
    { mv: [2, 0, 2, 0, 3, 0, 0, 1, 3, 1, 3, 1, 6, 0, 6, 2], want: [
      { c: 1, r: 3, players: [1] }, { c: 3, r: 3, players: [0, 1] }
    ] }
  ];
  for (const cs of CASES) {
    const bd = B.fromMoves(cs.mv);
    assert.strictEqual(R.terminal(bd), null, '夹具必须是非终局：' + JSON.stringify(cs.mv));
    assert.strictEqual(JSON.stringify(Th.cells(bd)), JSON.stringify(cs.want),
      '夹具 ' + JSON.stringify(cs.mv) + ' 的威胁格不对：' + JSON.stringify(Th.cells(bd)));
  }
  console.log('test-threats: ' + CASES.length + ' 个手搓夹具（含「两方同一格」）OK');
}

// ─────────── ①b 已终局一律返回 [] ───────────
// ⚠ R.winningMoves **不检查终局**（rules-classic.js:53-56）：先手已经四连时它照样会
//   报后手的某一列是「制胜手」⇒ 不前置 terminal 的实现会在赢局那一帧标出一堆假威胁。
{
  // ⚠ 夹具是搜出来的：**后手已经四连**（WIN_1），而轮到走的先手手里还有一个「制胜手」——
  //   随手挑一个赢局是不够的（第一版挑的 [3,0,4,1,5,0,2] 那边 winningMoves 恰好是空的，
  //   前提断言当场红：那样的夹具证明不了「不检查终局」这件事）。
  const won = B.fromMoves([0, 6, 1, 1, 4, 2, 4, 2, 2, 1, 0, 5, 3, 1, 4, 3, 3, 1]);
  assert.strictEqual(R.terminal(won), R.WIN[1], '夹具必须已终局（后手赢）');
  assert.deepStrictEqual(R.winningMoves(won), [4],
    '前提：winningMoves 在已终局的盘上照样回非空（它不检查终局）—— 这条一变就该重挑夹具');
  assert.deepStrictEqual(Th.cells(won), [], '已终局必须没有威胁格');
  const full = B.fromMoves([3, 0, 4, 1, 5, 0, 2]);
  assert.deepStrictEqual(Th.cells(full), [], '另一种终局（先手横四连）同样没有威胁格');
  console.log('test-threats: 已终局返回 []（且前提「winningMoves 不检查终局」当场自证）OK');
}

// ─────────── ② ⭐ 与暴力真值逐格对拍（随机 400 局面）───────────
// 暴力法：对每一列，**真的**用 B.play 落一子下去，再问 B.winner —— 与被测实现共享的
// 只有 bitboard 的落子与胜负判定，威胁的定义本身是独立重写的。
function bruteThreats(bd) {
  if (R.terminal(bd) !== null) return [];
  const out = [];
  for (let c = 0; c < B.W; c++) {
    if (!B.canPlay(bd, c)) continue;
    const players = [];
    for (const p of [0, 1]) {
      // 让 p 来走这一手：turn 不是 p 时先造一个「轮到 p」的盘
      const b0 = B.clone(bd); b0.turn = p;
      const b1 = B.play(b0, c);
      if (B.winner(b1) === p) players.push(p);
    }
    if (players.length) out.push({ c: c, r: bd.h[c], players: players });
  }
  return out;
}
{
  let rng = 20260802;
  const rnd = n => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
  let n = 0, withThreat = 0, both = 0, twoSided = 0;
  while (n < 400) {
    let bd = B.newBoard();
    while (R.terminal(bd) === null) {
      const got = Th.cells(bd);
      assert.strictEqual(JSON.stringify(got), JSON.stringify(bruteThreats(bd)),
        '与暴力真值不同：mv=' + JSON.stringify(bd.mv) + '\n  got   ' + JSON.stringify(got)
        + '\n  brute ' + JSON.stringify(bruteThreats(bd)));
      if (got.length) withThreat++;
      if (got.some(t => t.players.length === 2)) both++;
      // 「两方各有威胁」的局面 —— 只看当前行棋方的实现在这里才会露馅
      if (got.some(t => t.players.indexOf(0) >= 0) && got.some(t => t.players.indexOf(1) >= 0)) twoSided++;
      n++;
      const ms = R.moves(bd);
      bd = B.play(bd, ms[rnd(ms.length)]);
    }
  }
  // ⭐ 前提写成断言：覆盖率为零的话上面那一堆比较全是「[] === []」，等于没测
  assert.ok(withThreat > 60, '随机局面里有威胁的太少（' + withThreat + '/' + n + '），这轮对拍没测到东西');
  assert.ok(twoSided > 10, '「两方各有威胁」的局面太少（' + twoSided + '），抓不住「只看当前行棋方」的实现');
  assert.ok(both > 0, '「同一格两方都能赢」一次都没出现（' + both + '），[0,1] 那条路没被覆盖');
  console.log('test-threats: ⭐ 与暴力真值逐格对拍 ' + n + ' 个局面 OK（有威胁 ' + withThreat
    + ' · 两方各有 ' + twoSided + ' · 同一格两方 ' + both + '）');
}

// ─────────── ③ ⛔ 不许改盘（isWinningMove 的「借位还回去」还在不在）───────────
{
  const bd = B.fromMoves([1, 6, 2, 6, 3, 6]);
  const before = JSON.stringify(bd);
  Th.cells(bd); Th.forPlayer(bd, 1);
  assert.strictEqual(JSON.stringify(bd), before, '算威胁改了盘面（借位没还回去 / 就地翻了 turn）');
  console.log('test-threats: 算完盘面逐位未变 OK');
}

// ─────────── ④ ⛔⛔ 零搜索：源码级 ───────────
// ⚠ 剥掉注释再查 —— 本文件顶头那一大段注释里就写着这些词，不剥的话这条断言恒红。
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'threats.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const bad of ['Solver', 'EngineClient', 'scoreAll', 'solve(', 'book', 'Book']) {
    assert.ok(code.indexOf(bad) < 0,
      'threats.js 的**代码**里出现了 "' + bad + '" —— 威胁高亮每帧都要算，'
      + '走求解器就是 DESIGN §9.2 那条每手 1,678 ms 的断崖');
  }
  // 反向对照：剥注释这一步本身是有效的（注释里确实有这些词，否则上面等于没查）
  assert.ok(src.indexOf('Solver') >= 0 && code.indexOf('Solver') < 0,
    '剥注释没生效（源码里本该有一段解释为什么不许用 Solver 的注释）');
  console.log('test-threats: ⛔ 源码（剥注释后）零 Solver / EngineClient / scoreAll OK');
}

// ─────────── ⑤ ⭐ 零搜索：实测耗时 ───────────
// §9.2：n=10..15 的 scoreAll 中位 1,678 ms。这里 20,000 次调用（≈ 一局的几百帧）必须远远够不着。
{
  const boards = [
    B.fromMoves([1, 6, 2, 6, 3, 6]),
    B.fromMoves([3, 3, 4, 4, 2, 2, 5, 5, 1, 1]),
    B.fromMoves([2, 0, 2, 0, 3, 0, 0, 1, 3, 1, 3, 1, 6, 0, 6, 2])
  ];
  const N = 20000;
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < N; i++) acc += Th.cells(boards[i % boards.length]).length;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(acc > 0, '一次威胁都没算出来，这条计时等于没测');
  assert.ok(ms < 500, N + ' 次威胁计算用了 ' + ms.toFixed(1) + ' ms —— 超过 500 ms 说明它在搜索');
  console.log('test-threats: ⭐ ' + N + ' 次调用 ' + ms.toFixed(1) + ' ms（' +
    (ms / N * 1000).toFixed(2) + ' µs/次，⇔ 一次 scoreAll 的 1,678 ms 够跑 ' +
    Math.round(1678 / (ms / N)) + ' 万次）OK');
}

// ─────────── ⑥ forPlayer 与 cells 一致 ───────────
{
  const bd = B.fromMoves([2, 0, 2, 0, 3, 0, 0, 1, 3, 1, 3, 1, 6, 0, 6, 2]);
  assert.deepStrictEqual(Th.forPlayer(bd, 0).map(t => t.c), [3]);
  assert.deepStrictEqual(Th.forPlayer(bd, 1).map(t => t.c), [1, 3]);
  console.log('test-threats: forPlayer 分边 OK');
}

console.log('test-threats: 全部通过');
