// ════════════════════════════════════════
// bench-solver.js —— 求解器基准。**它的唯一用途是给开局库定深度 N**（DESIGN §2.1/§9.2）：
//   开局库覆盖前 N 手 ⇒ 运行时（Web Worker 里）只会碰到 n ≥ N 的局面 ⇒
//   **取「中位耗时 ≤ 200ms」的最小 plies 作为 N**。200ms 是 Worker 里玩家不觉得卡的上限
//   （再慢就要转菊花，而 DESIGN §2.4 规定超时必须降级并如实改措辞——能不降级就别降级）。
//
// ⚠ 用 scoreAll 那一列定 N，不是 solve 那一列：
//   solve 有「当场制胜手 ⇒ 一个子节点都不展开」的捷径，随机局面里一大把命中，中位数被
//   拉到失真的低位；而 DESIGN §3.2 的分层提示、§4 的精准度、§3.4 的妙手判定**全部读
//   scoreAll**（每一列都要精确分，一列都省不掉）。运行时真正的耗时上限是 scoreAll。
//
// ─── 本机实测水位（2026-07-31，Task 5 定稿版；给下一步做预算用）───
//   空盘 solve()：**2,391s（39.9 分钟）/ 8,256,675,460 节点 / 3.45 M nodes/s**
//     ⇒ DESIGN §2.2 的地面真值门禁（Task 6）跑一趟就是这个量级，⛔ 别把它挂进 npm test。
//     ⇒ gen-book（Task 7）逐个局面重算的总预算也照这个数推。
//   scoreAll 安静局面（7 局取中位）：n=12 → 0.74s（最慢 3.43s）；n=6 → 23.9s（最慢 104.6s）。
//     ⇒ n=6 这一档**离线可用、运行时绝不可用**，正是 DESIGN §2.1「离线预算开局库 +
//        运行时只搜中后盘」这条架构的实测依据。
//
// ⛔ 禁 Math.random：基准必须可复现，否则「快了 20%」没法回放也没法证伪（同 DESIGN §9.1）。
// ⚠ 跨进程波动约 ±30%（DESIGN §9.1）⇒ 本表用来定**数量级/档位**，不是用来判「快了 15%」。
//   做 A/B 对比时**必须每个变体起独立进程、5 次取中位、看区间重不重叠**，别在本脚本里
//   先后 require 两个 solver（那量的是 JIT 去优化，不是算法）。
//
// 用法：
//   node games/connect4/tools/bench-solver.js                 # 默认档位，每档 15 局
//   node games/connect4/tools/bench-solver.js --n=30          # 每档 30 局
//   node games/connect4/tools/bench-solver.js --plies=12,10,8 # 只跑指定档
//   node games/connect4/tools/bench-solver.js --budget=600000 # 单档中位超过它就停（默认 60s）
//   node games/connect4/tools/bench-solver.js --json          # 机读输出（给上层脚本用）
// ════════════════════════════════════════
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');

// ─── 参数 ───
function argOf(name, dflt) {
  const p = process.argv.find(a => a.startsWith('--' + name + '='));
  return p === undefined ? dflt : p.slice(name.length + 3);
}
const COUNT = Number(argOf('n', 15));
const BUDGET = Number(argOf('budget', 60000));
const SEED = Number(argOf('seed', 20260731));
const JSON_OUT = process.argv.includes('--json');
const PLIES = String(argOf('plies', '36,32,28,24,20,16,14,12,10,8,6,4,2,0'))
  .split(',').map(Number);
const TARGET_MS = 200;                       // ⭐ 定 N 的判据

// ─── 确定性 PRNG（与 tests/test-solver.js 同一支，⛔ 不许换成 Math.random）───
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** 随机走到正好 plies 手、**未终局**、且**轮走方没有当场制胜手**的局面。
 *  ⚠ 深档（plies ≥ 30）纯随机几乎必有人中途赢 ⇒ 试到一半强制回避当场制胜手，保证一定产出。
 *  ⭐ 「轮走方没有当场制胜手」这个过滤**必须有**，否则这张表是废的：随机局面里一大半
 *     轮走方能一手连四，solve 走捷径、scoreAll 的那一列也当场返回 ⇒ 中位耗时被压成 0.0ms，
 *     而同一档的最慢值是它的**上万倍**。定 N 的判据是中位，中位失真 = N 定错 = Worker 卡死。
 *     被过滤掉的那类局面本来就不需要搜索（一眼制胜），把它们算进「求解成本」是自欺。 */
function randomPosition(rnd, plies) {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const avoid = attempt >= 150;
    let bd = B.newBoard(), ok = true;
    while (bd.n < plies) {
      let ms = R.moves(bd);
      if (avoid) {
        const safe = ms.filter(c => !B.isWinningMove(bd, c));
        if (safe.length) ms = safe;
      }
      bd = B.play(bd, ms[Math.floor(rnd() * ms.length)]);
      if (R.terminal(bd) !== null) { ok = false; break; }
    }
    if (ok && R.winningMoves(bd).length === 0) return bd;
  }
  throw new Error('造不出 ' + plies + ' 手的「未终局且轮走方无当场制胜手」局面');
}

const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const mx = a => a.reduce((s, x) => (x > s ? x : s), -Infinity);
const ms = () => Number(process.hrtime.bigint()) / 1e6;
const fmt = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 's' : v.toFixed(1) + 'ms');
const num = v => Math.round(v).toLocaleString('en-US');

const rows = [];
if (!JSON_OUT) {
  console.log('求解器基准（seed=' + SEED + '，每档 ' + COUNT + ' 局，确定性可复现）');
  console.log('plies | 局数 |  solve 中位 |   solve 最慢 | solve 中位节点 | scoreAll 中位 | scoreAll 最慢');
  console.log('------+------+-------------+--------------+----------------+---------------+--------------');
}

for (const plies of PLIES) {
  // 空盘只有一个局面，重复量它没有意义
  const count = plies === 0 ? 1 : COUNT;
  const rnd = mulberry32(SEED + plies);
  const boards = [];
  for (let i = 0; i < count; i++) boards.push(plies === 0 ? B.newBoard() : randomPosition(rnd, plies));

  // ⚠ scoreAll 的返回值里没有 nodes（solver 的 API 已冻结，只有 {col:score}），而拿同局面
  //   solve 的节点数当它的代理是**错的**（solve 有当场制胜捷径，scoreAll 没有）⇒ 节点数一列
  //   只报 solve 的，scoreAll 只报墙钟耗时。别为了凑一列数去改 solver 的 API。
  const st = [], sn = [], at = [];
  for (const bd of boards) {
    let t0 = ms(); const r = S.solve(bd); st.push(ms() - t0); sn.push(r.nodes);
    t0 = ms(); S.scoreAll(bd); at.push(ms() - t0);
  }
  const row = {
    plies, count,
    solveMed: med(st), solveMax: mx(st), solveNodes: med(sn),
    allMed: med(at), allMax: mx(at)
  };
  rows.push(row);
  if (!JSON_OUT) {
    console.log(
      String(plies).padStart(5) + ' | ' + String(count).padStart(4) + ' | ' +
      fmt(row.solveMed).padStart(11) + ' | ' + fmt(row.solveMax).padStart(12) + ' | ' +
      num(row.solveNodes).padStart(14) + ' | ' +
      fmt(row.allMed).padStart(13) + ' | ' + fmt(row.allMax).padStart(13)
    );
  }
  if (row.allMed > BUDGET) {
    if (!JSON_OUT) console.log('       （scoreAll 中位 ' + fmt(row.allMed) + ' 已超预算 ' + fmt(BUDGET) + '，更浅的档不再跑）');
    break;
  }
}

// ⭐ 定 N：scoreAll 中位 ≤ 200ms 的**最小** plies
const okRows = rows.filter(r => r.allMed <= TARGET_MS).sort((a, b) => a.plies - b.plies);
// ⚠ 同时给出「连**最慢**都 ≤ 200ms」的那一档：中位达标不等于不卡。四子棋同一手数档里
//   耗时能差上百倍（有没有活威胁差别巨大），中位 165ms 的那一档最慢可能是 3.6s ——
//   玩家碰上的就是那 3.6s。Task 7 定 N 时**两个数都要看**：按中位定 N 就必须接受
//   DESIGN §2.4 的降级路径（超时改措辞），想不降级就得按尾部定。
const tailRows = rows.filter(r => r.solveMax <= TARGET_MS && r.allMax <= TARGET_MS)
  .sort((a, b) => a.plies - b.plies);
if (JSON_OUT) {
  console.log(JSON.stringify({ seed: SEED, count: COUNT, targetMs: TARGET_MS, rows,
    suggestedN: okRows.length ? okRows[0].plies : null,
    tailSafeN: tailRows.length ? tailRows[0].plies : null }));
} else {
  console.log('');
  if (okRows.length) {
    console.log('⇒ 建议开局库深度 N = ' + okRows[0].plies
      + '（scoreAll 中位 ' + fmt(okRows[0].allMed) + ' ≤ ' + TARGET_MS + 'ms 的最浅档）');
    console.log('  含义：开局库覆盖前 ' + okRows[0].plies + ' 手；运行时只搜 n ≥ ' + okRows[0].plies
      + ' 的局面，Worker 里中位不到 ' + TARGET_MS + 'ms。');
    console.log('  ⚠ 但该档**最慢** ' + fmt(okRows[0].allMax) + ' —— 尾部才是玩家的体感。');
    console.log(tailRows.length
      ? '  ⇒ 想连最慢都 ≤ ' + TARGET_MS + 'ms（不走 DESIGN §2.4 的降级路径），N 要取 ' + tailRows[0].plies + '。'
      : '  ⇒ 所有档位的最慢值都 > ' + TARGET_MS + 'ms ⇒ 无论 N 取多少都得留降级路径。');
  } else {
    console.log('⇒ 所有档位的 scoreAll 中位都 > ' + TARGET_MS + 'ms —— 开局库必须覆盖到比最深档还深，'
      + '或者先回去优化求解器。');
  }
  console.log('⚠ 本机跨进程波动 ±30%（DESIGN §9.1）：这张表定的是档位，不是精确值。');
}
