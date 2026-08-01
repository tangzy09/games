// ════════════════════════════════════════
// test-book.js —— 开局库的**一致性门禁**（P1 Task 7，DESIGN §9.2 / §10）。
//
// ⛔⛔ 为什么这份门禁本身就是这个 task 的正确性：
//   开局库一旦说谎，**提示、赛后复盘、精准度、妙手判定、课程判分会全部一起说谎，且无一处报错**
//   —— 它们读的是同一个分数。这与 solitaire 的教训同源（规则一改，「已验证可解」立刻变成
//   系统性谎言，而每一处都「正常工作」）。所以库不是缓存，是**真值的副本**，必须逐条对得上。
//
// 四层，从便宜到贵：
//   §1 格式层（合成数据，毫秒级）：编码/解码往返、校验和抓字节损坏、截断/魔数/版本全被拒。
//   §2 ⭐ **库缺失/损坏 ⇒ 游戏照常可玩**（DESIGN §9.2 的第一红线）：文件不在、文件坏了、
//      版本不对，一律「没有库」，求解器答案一位不变。
//   §3 ⭐ **机制层**（合成深层小库，毫秒级）：装库前后 solve/scoreAll **逐位相同**，且
//      **nodes 严格变小**（证明探查真的在生效 —— 没有这条，把 solver 里那段库探查整个删掉，
//      全部语料一位不差，静默失效）。再加一个**变异体**：库里塞错值 ⇒ 答案必须跟着变。
//   §4 ⭐ **真库**（data/book-classic.bin）：
//      a. 条目集合与枚举出的清单**逐条相同**（完整性，不只是抽查）
//      b. 每条的**奇偶与范围**（分数的结构不变量，全量，O(条目数)）
//      c. ⭐⭐ 拿库当叶子**纯回溯**到空盘 ⇒ 七列必须 = Allis 1988 的 −3 −1 0 +2 0 −1 −3
//         （**外部真值**，不搜索，几秒钟；DESIGN §2.2 那趟 80 分钟的门禁在这里被秒级复现）
//      d. ⭐ 抽样与**现场求解逐个一致**（按时间预算；`npm run verify:c4book` 加大样本）
//
// 用法：node games/connect4/tests/test-book.js [--budget=8000] [--k=250] [--quiet]
// ════════════════════════════════════════
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');
const GEN = require('../tools/gen-book.js');

const argOf = (n, d) => { const p = process.argv.find(a => a.startsWith('--' + n + '=')); return p === undefined ? d : p.slice(n.length + 3); };
const BUDGET_MS = Number(argOf('budget', 8000));
const SAMPLE_K = Number(argOf('k', 0));            // >0 = 固定样本数，忽略预算
const BOOK_PATH = path.resolve(argOf('book', path.join(__dirname, '..', 'data', 'book-classic.bin')));
const num = v => Math.round(v).toLocaleString('en-US');
const ms = () => Number(process.hrtime.bigint()) / 1e6;

// ⛔ 全程 keepTable 必须是**关**的：本文件读 nodes 做判据（§3 的「装库后 nodes 严格变小」），
//   开着的话 nodes 随调用历史漂移，那条判据立刻失真。这里不是「顺手关一下」，是前提。
S.setKeepTable(false);
S.setBook(null);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * ⭐ **拿库当叶子做全宽回溯**：零剪枝、零搜索，每个 ply < N 的局面按 keyOf 只算一次。
 * @returns { cols: {[列]: 分数}, score: 根自身的分, memo, leaves, mates }
 *   cols 的语义与 `S.scoreAll(root)` 完全相同（当前行棋方视角、落这一列之后取反）。
 * ⚠ **它同时也是完整性检查**：全宽 ⇒ 根能到达的每一个 ply-N 局面都会被查一次，
 *   缺一条就当场抛错（抽样永远做不到这一点）。
 * ⛔ 这段逻辑被 §3（拿合成小库跟**现场 scoreAll** 逐位对）和 §4c（拿真库跟 **Allis 1988** 对）
 *    **共用同一份**：只有 §3 先证明「这个回溯本身是对的」，§4c 那七个数才有资格当判据。
 */
function backupFromBook(root, N, bk) {
  const memo = new Map();
  let leaves = 0, mates = 0;
  function val(bd) {
    if (bd.n === N) {
      if (R.winningMoves(bd).length) { mates++; return B.CELLS - bd.n; }   // 一手连四：不入库，值是白送的
      const k = S.keyOf(bd);
      const v = bk.get(k);
      if (v === undefined) throw new Error('回溯时库里缺 key ' + k + '（手数 ' + bd.n + '）');
      leaves++;
      return v;
    }
    const k = S.keyOf(bd);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let best;
    if (R.winningMoves(bd).length) best = B.CELLS - bd.n;
    else {
      best = -100;
      for (const c of R.moves(bd)) {
        // ⚠ 子局面必未终局：本方没有一手连四 ⇒ 落完这一子没人赢
        const v = 0 - val(B.play(bd, c));
        if (v > best) best = v;
      }
    }
    memo.set(k, best);
    return best;
  }
  const cols = {};
  for (const c of R.moves(root)) cols[c] = 0 - val(B.play(root, c));
  let score = -100;
  for (const c of Object.keys(cols)) if (cols[c] > score) score = cols[c];
  return { cols: cols, score: score, memo: memo.size, leaves: leaves, mates: mates };
}

// ════════ §1 格式层 ════════
{
  const rnd = mulberry32(20260801);
  const n = 4000;
  const keys = new Float64Array(n), scores = new Int8Array(n);
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    let k;
    do {
      // 随机 49 位整数（≥1）。⚠ 两段拼：Math.random 类的浮点乘 2^49 会丢低位。
      k = Math.floor(rnd() * 33554432) * 16777216 + Math.floor(rnd() * 16777216) + 1;
    } while (seen.has(k) || k >= Math.pow(2, 49));
    seen.add(k);
    keys[i] = k;
    scores[i] = Math.floor(rnd() * 85) - 42;       // [-42, 42]
  }
  const buf = BOOK.encode({ ply: 10, keys, scores, srcHash: 0xDEADBEEF, ruleset: BOOK.RULESET_CLASSIC });
  assert.strictEqual(buf.length, BOOK.byteSize(n), 'byteSize 必须与实际字节数一致');

  const bk = BOOK.parse(buf);
  assert.strictEqual(bk.ply, 10);
  assert.strictEqual(bk.count, n);
  assert.strictEqual(bk.ruleset, BOOK.RULESET_CLASSIC);
  assert.strictEqual(bk.srcHash, 0xDEADBEEF);
  for (let i = 0; i < n; i++) {
    assert.strictEqual(bk.get(keys[i]), scores[i], '第 ' + i + ' 条往返不一致');
  }
  // 分数 0 必须是 +0（复盘曲线的 (-0).toFixed(1) === '-0.0' 会当场翻脸）
  const zi = scores.indexOf(0);
  if (zi >= 0) assert.strictEqual(Object.is(bk.get(keys[zi]), 0), true, '和棋分数必须是 +0，不许是 -0');
  // 不在库里的 key 必须是 undefined（⛔ 不是 0、不是 null —— 0 是「和棋」）
  let miss = 0;
  for (let i = 0; i < 2000; i++) {
    const k = Math.floor(rnd() * 33554432) * 16777216 + Math.floor(rnd() * 16777216) + 1;
    if (seen.has(k)) continue;
    miss++;
    assert.strictEqual(bk.get(k), undefined, '库里没有的 key 必须返回 undefined');
  }
  assert.ok(miss > 1500, '抽了太少的「不存在的 key」');
  assert.strictEqual(bk.get(0), undefined);
  assert.strictEqual(bk.get(-5), undefined);
  assert.strictEqual(bk.get(1.5), undefined);
  assert.strictEqual(bk.get('3'), undefined, '非数字入参不许被当成 key（JS 的 arr["3"] 陷阱）');
  assert.strictEqual(bk.get(Math.pow(2, 49)), undefined, '越界 key 必须落空而不是崩');

  // at(i)：按 key 升序，且与 get 自洽
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const e = bk.at(i);
    assert.ok(e.key > prev, 'at() 必须按 key 严格升序');
    prev = e.key;
    assert.strictEqual(bk.get(e.key), e.score);
  }
  console.log('test-book §1: 编码/解码往返 ' + num(n) + ' 条 + 缺失键返回 undefined OK');

  // ─ 损坏必须被抓住 ─
  for (const at of [BOOK.HEADER + 8, Math.floor(buf.length / 2), buf.length - 1]) {
    const bad = Uint8Array.from(buf); bad[at] ^= 0xFF;
    assert.strictEqual(BOOK.tryParse(bad), null, '第 ' + at + ' 字节被改 ⇒ 必须被校验和抓住');
    assert.throws(() => BOOK.parse(bad), /校验和/);
  }
  assert.strictEqual(BOOK.tryParse(buf.slice(0, buf.length - 10)), null, '截断（没下完）必须被拒');
  assert.strictEqual(BOOK.tryParse(new Uint8Array(4)), null, '太短必须被拒');
  { const bad = Uint8Array.from(buf); bad[0] = 0x58; assert.strictEqual(BOOK.tryParse(bad), null, '魔数不对必须被拒'); }
  { const bad = Uint8Array.from(buf); bad[4] = 99; assert.strictEqual(BOOK.tryParse(bad), null, '格式版本不认必须被拒'); }
  console.log('test-book §1: 字节损坏 / 截断 / 魔数 / 版本 全部被拒 OK');

  // ─ 编码期的自检（这些是「生成端写错了」的最后一道拦网）─
  assert.throws(() => BOOK.encode({ ply: 10, keys: [5, 5], scores: [0, 0], srcHash: 0, ruleset: 0 }), /重复/);
  assert.throws(() => BOOK.encode({ ply: 10, keys: [1], scores: [200], srcHash: 0, ruleset: 0 }), /分数越界/);
  assert.throws(() => BOOK.encode({ ply: 10, keys: [Math.pow(2, 49)], scores: [0], srcHash: 0, ruleset: 0 }), /key 越界/);
  assert.throws(() => BOOK.encode({ ply: 0, keys: [1], scores: [0], srcHash: 0, ruleset: 0 }), /ply/);
  assert.throws(() => BOOK.encode({ ply: 10, keys: [1, 2], scores: [0], srcHash: 0, ruleset: 0 }), /长度/);
  console.log('test-book §1: 编码端自检（重复 key / 越界分数 / 越界 key / 长度不符）OK');
}

// ════════ §2 库缺失 / 损坏 ⇒ 游戏照常可玩 ════════
{
  // 基准：**没有库**时的真答案（后面所有「照常可玩」都跟它比）
  S.setBook(null);
  const probe = B.fromMoves([3, 3, 4, 4, 5, 2, 3, 1, 0, 6, 2, 2, 5, 1, 4, 0, 6, 6, 5, 1, 0, 3, 2, 4]);
  const truth = S.solve(probe);
  const truthAll = S.scoreAll(probe);

  BOOK.uninstall();
  assert.strictEqual(BOOK.loadFileSync(path.join(__dirname, '_不存在的开局库.bin')), null,
    '文件不在 ⇒ 必须返回 null，不许抛');
  assert.strictEqual(BOOK.status().state, 'failed');
  assert.deepStrictEqual(S.solve(probe), truth, '库缺失时 solve 必须一位不变');
  assert.deepStrictEqual(S.scoreAll(probe), truthAll, '库缺失时 scoreAll 必须一位不变');

  const junk = BOOK.encode({ ply: 5, keys: [7, 9], scores: [0, 1], srcHash: 0, ruleset: 0 });
  junk[junk.length - 1] ^= 0x5A;                       // 一个字节的损坏
  assert.strictEqual(BOOK.tryParse(junk), null);
  assert.deepStrictEqual(S.solve(probe), truth, '库损坏时 solve 必须一位不变');

  // ⛔ setBook 对形状不对的东西必须**当场抛**：一个「装上了但没生效」的库最难查
  assert.throws(() => S.setBook({ ply: 0, get: () => 1 }), /ply/);
  assert.throws(() => S.setBook({ ply: 10 }), /get/);
  S.setBook(null);
  assert.deepStrictEqual(S.solve(probe), truth);
  console.log('test-book §2: 库缺失 / 损坏 / 形状不对 ⇒ 求解器答案一位不变 OK');
}

// ════════ §3 机制层：合成一个深层小库 ════════
{
  // 一个 16 手的根；库放在 ply 20（根往下 4 层）。这一档的局面每个只要几毫秒，整节秒级跑完。
  // ⚠ 根别取太深：越深空列越少，ply+4 那一层的去重局面就越少（24 手的根只剩 138 个，
  //   小到证明不了什么）。
  const ROOT = B.fromMoves([3, 3, 4, 4, 5, 2, 3, 1, 0, 6, 2, 2, 5, 1, 4, 0]);
  const BPLY = ROOT.n + 4;
  assert.strictEqual(R.terminal(ROOT), null, '前提：根未终局');

  // 枚举根的全部 ply-BPLY 后代（未终局、非「一手连四」），逐个求精确分
  const keys = [], scores = [];
  const seen = new Set();
  (function walk(bd) {
    if (bd.n === BPLY) {
      const k = S.keyOf(bd);
      if (seen.has(k)) return;
      seen.add(k);
      if (R.winningMoves(bd).length) return;          // 这类不入库（negamax 在探查前就返回了）
      keys.push(k); scores.push(S.scoreOf(bd).score);
      return;
    }
    for (const c of R.moves(bd)) {
      const nb = B.play(bd, c);
      if (R.terminal(nb) === null) walk(nb);
    }
  })(ROOT);
  assert.ok(keys.length > 200, '合成库太小，覆盖不到东西：' + keys.length);

  S.setBook(null);
  const before = S.solve(ROOT);
  const beforeAll = S.scoreAll(ROOT);

  const bk = BOOK.parse(BOOK.encode({ ply: BPLY, keys, scores, srcHash: 0, ruleset: 0 }));
  BOOK.install(bk);
  assert.strictEqual(BOOK.status().state, 'ready');
  const after = S.solve(ROOT);
  const afterAll = S.scoreAll(ROOT);

  assert.strictEqual(after.score, before.score, '⛔ 装库不许改变分数');
  assert.deepStrictEqual(after.best, before.best, '⛔ 装库不许改变最优列集合');
  assert.deepStrictEqual(afterAll, beforeAll, '⛔ 装库不许改变任何一列的分数');
  // ⭐ 没有这条，把 solver.js 里那段库探查整个删掉，上面三条**一位不差**地照样绿 —— 静默失效。
  assert.ok(after.nodes < before.nodes,
    '⛔ 装库后 nodes 必须严格变小（' + num(after.nodes) + ' < ' + num(before.nodes) + '），否则探查根本没生效');
  console.log('test-book §3: 装库前后答案逐位相同，nodes ' + num(before.nodes) + ' → ' + num(after.nodes) +
    '（' + (before.nodes / after.nodes).toFixed(2) + '×，' + keys.length + ' 条合成库）OK');

  // ─ 变异体：库里塞错值 ⇒ 答案必须跟着变（证明返回值真的被采信）─
  let changed = 0;
  for (const wrong of [40, -40]) {
    const bad = BOOK.parse(BOOK.encode({ ply: BPLY, keys, scores: keys.map(() => wrong), srcHash: 0, ruleset: 0 }));
    BOOK.install(bad);
    const r = S.solve(ROOT);
    if (r.score !== before.score || JSON.stringify(r.best) !== JSON.stringify(before.best)) changed++;
  }
  assert.strictEqual(changed, 2, '⛔ 库里的值被改成假的，solve 却没变 ⇒ 探查是死代码');
  console.log('test-book §3: 变异体（库塞假值）⇒ 答案跟着变 OK');

  BOOK.uninstall();
  assert.deepStrictEqual(S.solve(ROOT), before, '卸库必须回到原状');

  // ─ ⭐⭐ 回溯算法本身的门禁：拿合成库全宽回溯，必须逐位等于**现场 scoreAll** ─
  // ⛔ 没有这一条，§4c 那七个数就是「用一段没被验证过的代码算出来的」——
  //    回溯写错（漏了取反、漏了一手连四的叶子、memo 串了 ply）照样能凑出七个数，
  //    而它们对不上 Allis 时，我们分不清是**库错了**还是**回溯错了**。
  const bu = backupFromBook(ROOT, BPLY, bk);
  const wantCols = {};
  for (const k of Object.keys(beforeAll)) wantCols[k] = beforeAll[k];
  assert.deepStrictEqual(bu.cols, wantCols,
    '⛔ 全宽回溯出的每列分数必须与现场 scoreAll 逐位相同');
  assert.strictEqual(bu.score, before.score, '⛔ 回溯出的根分数必须与 solve 相同');
  console.log('test-book §3: ⭐ 全宽回溯（' + bu.memo + ' 个浅层 / ' + bu.leaves + ' 次查库 / ' +
    bu.mates + ' 个一手连四叶子）与现场 scoreAll 逐位相同 OK —— §4c 的判据由此才可信');
}

// ════════ §4 真库 ════════
if (!fs.existsSync(BOOK_PATH)) {
  console.error('');
  console.error('⛔ 找不到开局库 ' + BOOK_PATH);
  console.error('   先跑 `npm run gen:c4book`（离线几小时，可中断续跑）再来。');
  console.error('   ⚠ 库缺失时**游戏本身照常可玩**（§2 已经把这条钉住了），但没有库 = DESIGN §2.1');
  console.error('     那条「离线预算开局库 + 运行时只搜中后盘」的架构根本没落地 ⇒ 门禁判红。');
  process.exit(1);
}
{
  const raw = fs.readFileSync(BOOK_PATH);
  const bk = BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length));
  const N = bk.ply;
  console.log('test-book §4: ' + path.basename(BOOK_PATH) + '  ply=' + N + '  ' + num(bk.count) +
    ' 条  ' + (raw.length / 1048576).toFixed(2) + ' MiB');

  // ─ a. 完整性：条目集合 == 枚举出来的清单，逐条 ─
  const t0 = ms();
  const want = GEN.enumerateFrontier(N).keys;
  assert.strictEqual(bk.count, want.length,
    '条目数与枚举不符：库 ' + num(bk.count) + ' vs 枚举 ' + num(want.length) + ' ⇒ 库不完整或多了东西');
  for (let i = 0; i < want.length; i++) {
    if (bk.get(want[i]) === undefined) throw new Error('库里缺 key ' + want[i] + '（第 ' + i + ' 条）');
  }
  console.log('test-book §4a: 条目集合与枚举清单逐条相同（' + num(want.length) + ' 条，' +
    ((ms() - t0) / 1000).toFixed(1) + 's）OK');

  // ─ b. 每条的结构不变量（奇偶 + 范围），全量 ─
  // ⭐ 奇偶是**推导出来的硬约束**，不是经验规律：s = 43 - nWin。
  //    s > 0（轮走方赢）⇒ nWin ≡ n+1 (mod 2) ⇒ s ≡ n (mod 2)
  //    s < 0（对手赢）  ⇒ nWin ≡ n   (mod 2) ⇒ |s| ≡ n+1 (mod 2)
  //    空盘那一行正好验证它：+2（偶，n=0 ✅）、−3 / −1（奇 ✅）。
  //    一条奇偶不对的记录 = 「取胜手数」算错，而复盘转折点 / 最快取胜 / 妙手判定全读手数。
  const loBound = 0 - (B.CELLS - 1 - N), hiBound = Math.max(B.CELLS - 2 - N, 0);
  const hist = {};
  for (let i = 0; i < bk.count; i++) {
    const s = bk.at(i).score;
    hist[s] = (hist[s] || 0) + 1;
    if (s > hiBound || s < loBound) throw new Error('第 ' + i + ' 条分数越界：' + s + ' ∉ [' + loBound + ',' + hiBound + ']');
    if (s > 0 && ((s - N) & 1)) throw new Error('第 ' + i + ' 条：胜分 ' + s + ' 的奇偶与 n=' + N + ' 不符');
    if (s < 0 && (((-s) - N - 1) & 1)) throw new Error('第 ' + i + ' 条：负分 ' + s + ' 的奇偶与 n=' + N + ' 不符');
    assert.strictEqual(Object.is(s, -0), false, '分数不许是 -0');
  }
  const win = Object.keys(hist).filter(k => +k > 0).reduce((a, k) => a + hist[k], 0);
  const draw = hist[0] || 0;
  console.log('test-book §4b: 全部 ' + num(bk.count) + ' 条的奇偶与范围 OK（轮走方胜 ' +
    (win * 100 / bk.count).toFixed(1) + '% / 和 ' + (draw * 100 / bk.count).toFixed(1) + '% / 负 ' +
    ((bk.count - win - draw) * 100 / bk.count).toFixed(1) + '%）');

  // ─ c. ⭐⭐ 拿库当叶子纯回溯 ⇒ 空盘七列必须等于 Allis 1988 ─
  // ⛔ 期望值来自 1988 年的外部文献（DESIGN §2.2），红了**不许改这里**。
  // ⚠ 全宽回溯，零剪枝、零搜索：每个 ply<N 的局面只算一次（按 keyOf 记忆化）。
  //   ⇒ 它检验的是**库的内容**，不是求解器 —— 库里任何一条被搜索用到的记录错了，
  //     这七个数极难还正好对上。
  // ⭐ 用的是 §3 刚刚拿「现场 scoreAll」验证过的**同一个** backupFromBook —— 顺序不能倒。
  const t1 = ms();
  const bu = backupFromBook(B.newBoard(), N, bk);
  const cols = [];
  for (const c of Object.keys(bu.cols)) cols[+c] = bu.cols[c];
  const ALLIS = [-3, -1, 0, 2, 0, -1, -3];       // ⛔ 外部真值，红了不许改这一行
  assert.deepStrictEqual(cols, ALLIS,
    '⛔⛔ 从库倒推出的空盘七列 ' + JSON.stringify(cols) + ' ≠ Allis 1988 的 ' + JSON.stringify(ALLIS) +
    ' —— 库在说谎（或求解器变了而库没重建）。排查顺序：1) 库是不是这版求解器生成的（srcHash）' +
    ' 2) npm run verify:c4truth 先确认求解器本身还对 3) 重新 gen:c4book');
  assert.strictEqual(bu.score, 2, '空盘最优 = 中列 +2（先手第 41 子取胜）');
  console.log('test-book §4c: ⭐ 拿库倒推空盘七列 = ' + JSON.stringify(cols) +
    ' = Allis 1988 ✅（' + num(bu.memo) + ' 个浅层局面 / ' + num(bu.leaves) + ' 次查库 / ' +
    num(bu.mates) + ' 个一手连四叶子 / ' + ((ms() - t1) / 1000).toFixed(1) + 's）');

  // ─ d. ⭐ 抽样与现场求解逐个一致 ─
  // ⛔ 现场求解前必须**先卸库**：不卸的话它会拿库自己回答自己，门禁变成一句同义反复。
  BOOK.uninstall();
  S.setBook(null);
  const rnd = mulberry32(0x5EED7);
  const order = [];
  for (let i = 0; i < bk.count; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const t2 = ms();
  let checked = 0, worst = 0;
  for (const idx of order) {
    if (SAMPLE_K > 0 ? checked >= SAMPLE_K : (ms() - t2) > BUDGET_MS) break;
    const e = bk.at(idx);
    const bd = GEN.decodeKey(e.key);
    GEN.assertLegal(bd, e.key);
    const t3 = ms();
    const live = S.scoreOf(bd).score;
    worst = Math.max(worst, ms() - t3);
    if (live !== e.score) {
      throw new Error('⛔⛔ 库说谎：key ' + e.key + '（手数 ' + bd.n + '，着法列高 ' + bd.h.join('') +
        '）库里 ' + e.score + '，现场求解 ' + live + '。⇒ 整本库不可信，重新 gen:c4book。');
    }
    checked++;
  }
  console.log('test-book §4d: ⭐ 抽样 ' + num(checked) + ' 条与现场求解逐个一致（' +
    ((ms() - t2) / 1000).toFixed(1) + 's，单条最慢 ' + (worst / 1000).toFixed(2) + 's）OK' +
    (SAMPLE_K > 0 ? '' : '  ⚠ 默认只跑 ' + BUDGET_MS + 'ms 预算，深查用 `npm run verify:c4book`'));
  assert.ok(checked >= 3, '抽样数太少（' + checked + '），预算给太紧了');

  // ─ e. 源码哈希：只提示，不判红（判据是上面四条）─
  const now = GEN.srcHash();
  if (now !== bk.srcHash) {
    console.log('⚠ 注意：库生成时的源码哈希 0x' + bk.srcHash.toString(16) +
      ' ≠ 当前 0x' + now.toString(16) + ' —— solver/bitboard/rules 改过了。');
    console.log('  上面的 §4c/§4d 刚刚证明这份库**在当前这版求解器上仍然是对的**，所以不判红；');
    console.log('  但只要改的是**行为**（不是注释），就必须 `npm run gen:c4book` 重建（DESIGN §9.2）。');
  } else {
    console.log('test-book §4e: 源码哈希与生成时一致（0x' + now.toString(16) + '）OK');
  }
}

// ════════ §5 web 懒加载路径（DESIGN §9.2：首屏不等库）════════
// ⭐ 这一节把 `Book.load()` 的契约钉死：**永不 reject**，失败只是 resolve(false) + state='failed'。
//   ⛔ 它要是会 reject，UI 那边一个没接住的 promise 就能把首屏点没了 —— 而库本来只是「让提示变快」。
// ⚠ 用替身 fetch，不起真 HTTP 服务：要测的是**本文件的分支**，不是网络栈（起服务会带来端口/时序抖动）。
(function () {
  const realFetch = global.fetch;
  const good = BOOK.encode({ ply: 12, keys: [11, 22, 33], scores: [0, -3, 4], srcHash: 1, ruleset: 0 });
  const bad = Uint8Array.from(good); bad[bad.length - 2] ^= 0xFF;

  function withFetch(fn) { global.fetch = fn; }
  const cases = [
    ['404', () => Promise.resolve({ ok: false, status: 404 }), false, 'failed'],
    ['断网', () => Promise.reject(new Error('network down')), false, 'failed'],
    ['没有 fetch 这个函数', null, false, 'failed'],
    ['字节损坏', () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bad.buffer) }), false, 'failed'],
    ['正常', () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(good.buffer) }), true, 'ready']
  ];
  // 基准真值（没有库时）
  BOOK.uninstall();
  const probe = B.fromMoves([3, 3, 4, 4, 5, 2, 3, 1, 0, 6, 2, 2, 5, 1, 4, 0, 6, 6, 5, 1, 0, 3, 2, 4]);
  const truth = S.solve(probe);

  let chain = Promise.resolve();
  for (const [name, f, wantOk, wantState] of cases) {
    chain = chain.then(() => {
      BOOK.uninstall();
      withFetch(f);
      return BOOK.load('https://example.invalid/book-classic.bin').then(okv => {
        assert.strictEqual(okv, wantOk, '[' + name + '] load() 的返回值');
        assert.strictEqual(BOOK.status().state, wantState, '[' + name + '] 状态机');
        // ⛔ 无论成败，求解器都必须还给出同一个答案（库只影响快慢）
        assert.deepStrictEqual(S.solve(probe), truth, '[' + name + '] 加载结果不许改变答案');
      });
    });
  }
  return chain.then(() => {
    global.fetch = realFetch;
    BOOK.uninstall();
    console.log('test-book §5: web 懒加载 5 种情形（404 / 断网 / 没有 fetch / 损坏 / 正常）永不 reject OK');
    S.setBook(null);
    S.setKeepTable(false);
    console.log('test-book: 全部通过');
  });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
