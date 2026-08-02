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

// ─────────── ⑦ ⭐ forkOf：「**形成**双威胁的那一刻」（P2b T5 · DESIGN §6.4 下半）───────────
// ⚠ 判据的三条各配一个会红的反向对照 —— 「加了断言但抓不住」在本仓已经出现过五次。
const forkTrace = mv => {
  const out = [];
  for (let i = 0; i < mv.length; i++) {
    out.push(Th.forkOf(B.fromMoves(mv.slice(0, i)), B.fromMoves(mv.slice(0, i + 1))));
  }
  return out;
};
{
  // ⭐ 教科书式的双威胁：底行 `O.XXX.O`，X 的三连**两端都开着** ⇒ 落点 (1,0) 与 (5,0)，
  //   对方只堵得住一个。这也是门禁截图里那一张（旁观者一眼看得懂 = §6.4 的第三只雕）。
  const FIX = [4, 0, 4, 4, 2, 6, 3];
  const tr = forkTrace(FIX);
  assert.strictEqual(tr.filter(x => x).length, 1, '这个夹具必须**恰好**触发一次：' + JSON.stringify(tr));
  assert.ok(tr[6], '触发的必须是最后那一手（第 7 手）');
  assert.strictEqual(tr[6].player, 0);
  assert.deepStrictEqual(tr[6].cells, [{ c: 1, r: 0 }, { c: 5, r: 0 }],
    '两个落点必须按列序给出：' + JSON.stringify(tr[6].cells));
  // ⭐ 反向对照 ①：前 6 手一次都不许触发（其中第 5、6 手盘上已经有子，不是「空盘所以没有」）
  assert.ok(tr.slice(0, 6).every(x => x === null), '前 6 手不该有任何触发：' + JSON.stringify(tr));
  console.log('test-threats: ⭐ forkOf 夹具（底行两端开的三连）恰好触发一次 OK');
}
{
  // ⭐⭐ 反向对照 ②（**判据层的「别刷屏」**）：双威胁**形成之后**还留在盘上，
  //   之后每一手它都仍然成立 —— 只判「after ≥ 2」的实现会从这一手起**每落一子响一次**。
  //   这个夹具第 9 手 before=2 且 after=2，⇒ 必须被条件 ② 压掉。
  const FIX = [4, 0, 4, 4, 2, 6, 3, 0, 0];
  const a = B.fromMoves(FIX.slice(0, 8)), b = B.fromMoves(FIX);
  const ob = B.clone(b); ob.turn = a.turn;
  assert.strictEqual(R.winningMoves(a).length, 2, '前提：第 9 手之前那一方**已经**有两个制胜点');
  assert.strictEqual(R.winningMoves(ob).length, 2, '前提：走完之后仍然是两个（双威胁没被拆掉）');
  assert.strictEqual(Th.forkOf(a, b), null,
    '⛔ 双威胁**持续存在**不等于「形成」—— 只判 after≥2 的实现会在这里再响一次（刷屏）');
  assert.strictEqual(forkTrace(FIX).filter(x => x).length, 1, '整段仍然只触发一次');
  console.log('test-threats: ⭐⭐ 双威胁持续存在时不再触发（「形成的那一刻」）OK');
}
{
  // 反向对照 ③：单威胁（after = 1）不许触发；④ 这一手直接连四（终局）归赢局庆祝
  const one = B.fromMoves([4, 3, 4, 2, 4]);                 // X 有且只有 (4,3) 一个制胜点
  const ob = B.clone(one); ob.turn ^= 1;
  assert.strictEqual(R.winningMoves(ob).length, 1, '前提：这里恰好只有一个制胜点');
  assert.strictEqual(Th.forkOf(B.fromMoves([4, 3, 4, 2]), one), null, '单威胁不许触发');
  const wonMv = [3, 0, 4, 1, 5, 0, 2];
  assert.strictEqual(R.terminal(B.fromMoves(wonMv)), R.WIN[0], '前提：这一手直接连四');
  assert.strictEqual(Th.forkOf(B.fromMoves(wonMv.slice(0, -1)), B.fromMoves(wonMv)), null,
    '终局那一手归赢局庆祝（§6.3），⛔ 两套庆祝不许叠在一帧');
  // 参数顺序反了 / 不是相邻两个局面 ⇒ 一律 null（⛔ 别硬算：那会在错的一帧放特效）
  const A = B.fromMoves([4, 0, 4, 4, 2, 6]), Bd = B.fromMoves([4, 0, 4, 4, 2, 6, 3]);
  assert.strictEqual(Th.forkOf(Bd, A), null, '参数反了必须 null');
  assert.strictEqual(Th.forkOf(B.fromMoves([4, 0, 4, 4, 2]), Bd), null, '差两手必须 null');
  assert.strictEqual(Th.forkOf(null, Bd), null);
  console.log('test-threats: forkOf 的四条反向对照（单威胁 / 终局 / 反序 / 非相邻）OK');
}
{
  // ⭐ 与一份独立重写的定义随机对拍 + ⭐ 把「条件 ② 真的压掉了很多」写成断言
  //   （⛔ 否则「持续双威胁不再触发」只有一个手搓夹具撑着）
  let rng = 20260805;
  const rnd = n => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
  let games = 0, cand = 0, fired = 0, suppressed = 0;
  while (games < 300) {
    let bd = B.newBoard();
    while (R.terminal(bd) === null) {
      const ms = R.moves(bd);
      const before = bd, after = B.play(bd, ms[rnd(ms.length)]);
      // 独立定义：真的替 mover 把每一列都落一遍看谁赢（与 forkOf 不共享 winningMoves）
      const winCells = b => {
        const out = [];
        for (let c = 0; c < B.W; c++) {
          if (!B.canPlay(b, c)) continue;
          const t = B.clone(b); t.turn = before.turn;
          if (B.winner(B.play(t, c)) === before.turn) out.push({ c: c, r: b.h[c] });
        }
        return out;
      };
      const want = (R.terminal(after) === null && winCells(after).length >= 2
                    && winCells(before).length < 2)
        ? { player: before.turn, cells: winCells(after) } : null;
      assert.strictEqual(JSON.stringify(Th.forkOf(before, after)), JSON.stringify(want),
        '与独立定义不同：mv=' + JSON.stringify(after.mv));
      if (R.terminal(after) === null && winCells(after).length >= 2) {
        cand++;
        if (want) fired++; else suppressed++;
      }
      bd = after;
    }
    games++;
  }
  assert.ok(fired > 50, '随机对局里一次都没触发过（' + fired + '），这轮对拍等于没测');
  assert.ok(suppressed > 50,
    '条件 ②「形成的那一刻」几乎没压掉东西（' + suppressed + '/' + cand + '）—— '
    + '那说明这条反向对照抓不到「每手都响」的实现');
  console.log('test-threats: ⭐ forkOf 与独立定义随机对拍 ' + games + ' 局 OK（候选 ' + cand
    + ' · 触发 ' + fired + ' · 被「形成」条件压掉 ' + suppressed + '）');
}
{
  // ⛔ 不许改盘（同 ③）：forkOf 里有 clone + 两次 winningMoves
  const a = B.fromMoves([4, 0, 4, 4, 2, 6]), b = B.fromMoves([4, 0, 4, 4, 2, 6, 3]);
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  assert.ok(Th.forkOf(a, b), '前提：这一对确实会触发');
  assert.strictEqual(JSON.stringify(a), sa, 'forkOf 改了 before 盘');
  assert.strictEqual(JSON.stringify(b), sb, 'forkOf 改了 after 盘');
  console.log('test-threats: forkOf 算完两个盘面逐位未变 OK');
}

// ─────────── ⑧ ⭐ missedWin：§6.6「你差一手就赢了」（P2b Task 6）───────────
// ⚠ 这句话会被**印在输局结算上**，说错就是编造 ⇒ 正反两个方向都要有会红的门禁。
{
  // 正向：X 底行 1/2/3 三连、两端都开着（(0,0) 与 (4,0) 都是制胜点），第 7 手轮到他却去了别处，
  //   紧接着被 O 在第 6 列竖四。⇒ 「你差一手就赢了」在这一局上是**可当场核验的事实**。
  const MV = [1, 6, 2, 6, 3, 6, 5, 6];
  const bd = B.fromMoves(MV);
  assert.strictEqual(R.terminal(bd), R.WIN[1], '前提：这一局是后手（O）赢的');
  for (let i = 1; i < MV.length; i++) {
    assert.strictEqual(R.terminal(B.fromMoves(MV.slice(0, i))), null, '前提：中途不许终局');
  }
  const pre = B.fromMoves(MV.slice(0, 6));
  assert.strictEqual(pre.turn, 0, '前提：第 7 手轮到先手');
  assert.deepStrictEqual(R.winningMoves(pre).slice().sort(), [0, 4],
    '前提：那一刻先手落第 0 或第 4 列就当场连四');
  const mw = Th.missedWin(MV, 0);
  assert.ok(mw, '⭐ 输方（先手）确实曾经差一手就赢，missedWin 必须报出来');
  assert.strictEqual(mw.ply, 7, '⭐ 报的是**最早**的那一手（第 7 手）：' + JSON.stringify(mw));
  assert.deepStrictEqual(mw.cols, [0, 4]);
  assert.strictEqual(mw.player, 0);

  // ⭐ 反向对照 ①：问**赢家**（后手）——他也可能有过制胜点，但那不是 §6.6 要说的事；
  //   这里的判据必须真的按 loser 分边，⛔ 不许「盘上有过威胁就报」。
  //   ⚠ 这一条只有在两边确实不同的时候才有意义 ⇒ 先把「后手那一侧的答案」算出来对比。
  const mwO = Th.missedWin(MV, 1);
  assert.notDeepStrictEqual(mw, mwO,
    '两边给的答案必须不同（否则 loser 这个参数是摆设）：' + JSON.stringify(mwO));

  // ⭐ 反向对照 ②：一局**谁都没差过一手**的对局 ⇒ 必须是 null（⛔ 不许硬凑一句安慰话）
  const CLEAN = [0, 1, 0, 1, 6, 5];
  for (let i = 0; i <= CLEAN.length; i++) {
    const b = B.fromMoves(CLEAN.slice(0, i));
    assert.strictEqual(R.winningMoves(b).length, 0, '前提：这一局全程没有任何制胜点');
  }
  assert.strictEqual(Th.missedWin(CLEAN, 0), null, '⭐ 没有过就必须 null（⛔ 别编）');
  assert.strictEqual(Th.missedWin(CLEAN, 1), null);

  // ⭐ 反向对照 ③：一整局**输方从没站在制胜点前面**（⚠ 但终局盘上 winningMoves 非空 ——
  //   那正是下面 ④ 要挡的陷阱；这一条先证「正常路径」上确实是 null）
  const WON = [2, 0, 4, 0, 6, 0, 3, 0];               // 后手第 0 列竖四（第 8 手结束）
  assert.strictEqual(R.terminal(B.fromMoves(WON)), R.WIN[1], '前提：第 8 手就分出胜负了');
  for (let i = 1; i < WON.length; i++) {
    assert.strictEqual(R.terminal(B.fromMoves(WON.slice(0, i))), null, '前提：中途不许终局');
  }
  assert.ok(R.winningMoves(B.fromMoves(WON)).length > 0,
    '前提：**已终局**的这个盘上 winningMoves 仍然非空（X 的三连是最后一手才连起来的）');
  assert.strictEqual(Th.missedWin(WON, 0), null, '⭐ 输方全程没有过制胜点 ⇒ 必须 null');

  // ⭐⭐ 反向对照 ④：**终局之后的局面不许被算进去**。
  //   ⚠ 诚实地说：**当前调用路径够不着这一层**（`g.moves` 恒止于终局）——
  //     所以这条门禁必须**自己造**一条「走过头」的线，否则那个 terminal 前置就是死代码，
  //     而「删掉它照样全绿」正是本仓「加了断言但抓不住」的经典形状（已出现六次）。
  //   ⭐ 这条线是这样的：第 7 手先手底行 2/3/4/5 连四（局面结束），却又硬走了第 8 手；
  //     此时**后手**第 0 列已经三枚，落 (0,3) 就是竖四 ⇒ 少了 terminal 前置就会报
  //     「他第 8 手差一手就赢了」—— 对着一个**已经输掉**的局面说的假话。
  const PAST = [3, 0, 4, 0, 5, 0, 2, 1];
  const at7 = B.fromMoves(PAST.slice(0, 7));
  assert.strictEqual(R.terminal(at7), R.WIN[0], '前提：第 7 手就结束了（先手连四）');
  assert.strictEqual(at7.turn, 1, '前提：那一刻名义上轮到后手');
  assert.deepStrictEqual(R.winningMoves(at7), [0],
    '前提：**已终局**的这个盘上 winningMoves 仍然报后手的第 0 列 —— 陷阱本体');
  assert.strictEqual(Th.missedWin(PAST, 1), null,
    '⭐⭐ 走过头的线里，终局之后的局面必须被跳过；⛔ 把 `R.terminal(bd) === null` 去掉，这条当场红');

  // 坏参数一律 null（⛔ 别抛：结算屏不该被一句锦上添花的文案带走）
  assert.strictEqual(Th.missedWin(null, 0), null);
  assert.strictEqual(Th.missedWin(MV, 2), null);
  assert.strictEqual(Th.missedWin([0, 0, 0, 0, 0, 0, 0], 0), null, '列满了的非法序列 ⇒ null');
  console.log('test-threats: ⭐ missedWin 正向 + 四条反向对照（分边 / 没有过 / 终局盘 / 走过头）OK');
}
{
  // ⭐ 与一份独立重写的定义随机对拍（⛔ 不是自己跟自己比），并把覆盖率写成断言
  let rng = 20260806;
  const rnd = n => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
  let games = 0, hit = 0, miss = 0;
  while (games < 400) {
    const mv = [];
    let bd = B.newBoard();
    while (R.terminal(bd) === null) {
      const ms = R.moves(bd);
      const c = ms[rnd(ms.length)];
      mv.push(c);
      bd = B.play(bd, c);
    }
    const w = R.winnerOf(R.terminal(bd));
    if (w !== null) {
      const loser = w ^ 1;
      // 独立定义：重放一遍，第一个「轮到 loser 且他能一手连四」的手序（真的替他落一遍看谁赢）
      let want = null, b2 = B.newBoard();
      for (let i = 0; i < mv.length && !want; i++) {
        if (b2.turn === loser && R.terminal(b2) === null) {
          for (let c = 0; c < B.W && !want; c++) {
            if (!B.canPlay(b2, c)) continue;
            if (B.winner(B.play(b2, c)) === loser) want = i + 1;
          }
        }
        b2 = B.play(b2, mv[i]);
      }
      const got = Th.missedWin(mv, loser);
      assert.strictEqual(got ? got.ply : null, want,
        '与独立定义不同：mv=' + JSON.stringify(mv) + ' loser=' + loser
        + ' got=' + JSON.stringify(got) + ' want=' + want);
      if (want) hit++; else miss++;
    }
    games++;
  }
  assert.ok(hit > 40, '随机对局里「输方曾差一手」一次都没出现（' + hit + '），正向没被覆盖');
  assert.ok(miss > 20, '「输方从没差过一手」太少（' + miss + '），反向没被覆盖');
  console.log('test-threats: ⭐ missedWin 与独立定义随机对拍 ' + games + ' 局 OK（差过 '
    + hit + ' · 没差过 ' + miss + '）');
}
{
  // ⛔ 不许改盘 / ⛔ 零搜索（同 ③⑤）：整局重放 ≤ 42×7 次 isWinningMove，必须是微秒级
  const MV = [1, 6, 2, 6, 3, 6, 5, 6];
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < 20000; i++) acc += Th.missedWin(MV, 0) ? 1 : 0;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(acc, 20000, '一次都没报出来，这条计时等于没测');
  assert.ok(ms < 800, '20,000 次 missedWin 用了 ' + ms.toFixed(1) + ' ms —— 超了说明它在搜索');
  console.log('test-threats: ⭐ missedWin 20,000 次 ' + ms.toFixed(1) + ' ms（零搜索）OK');
}

console.log('test-threats: 全部通过');
