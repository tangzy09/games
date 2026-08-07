// ════════════════════════════════════════
// bench-solver.js —— 求解器基准。**它的唯一用途是给开局库定深度 N**（DESIGN §2.1/§9.2）：
//   开局库覆盖前 N 手 ⇒ 运行时（Web Worker 里）只会碰到 n ≥ N 的局面 ⇒
//   **取「中位耗时 ≤ 200ms」的最小 plies 作为 N**。200ms 是 Worker 里玩家不觉得卡的上限
//   （再慢就要转菊花，而 DESIGN §2.4 规定超时必须降级并如实改措辞——能不降级就别降级）。
//
// ⭐⭐ **一个局面只量一个 API，量完就扔**（这是本脚本最重要的一条纪律，别改回去）。
//   1) 背靠背在**同一个局面**上先 solve 再 scoreAll，第二次是在**暖缓存**（CPU cache +
//      JIT 已单态化）上跑的，而 Worker 里每个局面只会被算一次 —— 那是**冷**的。
//      实测换序（谁先测谁慢，纯粹是顺序效应，与 API 无关）：
//          先测 solve   : solveMed 4.69ms / allMed 3.03ms   (plies 18)
//          先测 scoreAll: solveMed 3.01ms / allMed 4.74ms
//          先测 solve   : solveMed 0.49ms / allMed 0.04ms   (plies 20)
//          先测 scoreAll: solveMed 0.05ms / allMed 0.41ms   ← 差 12×
//      冷测（每个局面只碰一次）比暖测慢一截，而**冷的那个才是玩家等的那个**：
//          plies 24 → 1.05ms（暖测报 0.4）  20 → 0.46ms（报 0.0）  18 → 4.61ms（报 3.9）
//   ⇒ 前半的局面只量 solve、后半的只量 scoreAll，两列是**同分布的两份独立冷样本**。
//   ⚠ 附带的好处：两列该互相接近，差太多就说明这次测量噪声大（本机 ±30%，DESIGN §9.1）。
//
// ⚠ 为什么两列量的其实是同一份工作：solve 与 scoreAll 都走 `analyze(searchBoard(bd))`，
//   唯一差别是 solve 的「当场有制胜手 ⇒ 一个子节点都不展开」捷径 —— 而下面的 randomPosition
//   **保证轮走方没有当场制胜手**，那条捷径在本脚本里**永远不触发**。
//   ⇒ 定 N 仍然看 scoreAll 那一列（DESIGN §3.2 分层提示、§4 精准度、§3.4 妙手判定全读它，
//     一列都省不掉），但别再以为两列量的是不同的东西。
//
// ─── 本机实测水位（2026-07-31，Task 5 定稿版；给下一步做预算用）───
//   空盘 solve()：**2,391s（39.9 分钟）/ 8,256,675,460 节点 / 3.45 M nodes/s**
//     ⇒ DESIGN §2.2 的地面真值门禁（Task 6）跑一趟就是这个量级，⛔ 别把它挂进 npm test。
//     ⇒ gen-book（Task 7）逐个局面重算的总预算也照这个数推。
//   scoreAll 安静局面（7 局取中位）：n=12 → 0.74s（最慢 3.43s）；n=6 → 23.9s（最慢 104.6s）。
//     ⇒ n=6 这一档**离线可用、运行时绝不可用**，正是 DESIGN §2.1「离线预算开局库 +
//        运行时只搜中后盘」这条架构的实测依据。
//   冷测（每局面只碰一次）两个独立 seed 都给出：**中位 N = 14 / 尾部 N = 16**。
//     ⚠ 早先「暖测」版本给的是 N = 12 —— 那个 12 是**背靠背复测同一个局面**蹭到的暖缓存
//       读数，Worker 里永远享受不到。这就是抬头那条「一个局面只量一个 API」的由来。
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
//   node games/connect4/tools/bench-solver.js --budget=600000 # 单档累计耗时超 3× 它就中断（默认 60s）
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

  // ⚠ scoreAll 的返回值里没有 nodes（solver 的 API 只有 {col:score}）⇒ 节点数一列只报
  //   solve 的。别为了凑一列数去改 solver 的 API。
  // ⭐ 前半只量 solve、后半只量 scoreAll —— 一个局面只碰一次，量的是**冷**的那次（见抬头）。
  const half = Math.ceil(boards.length / 2);
  const st = [], sn = [], at = [];
  let spent = 0, aborted = false;
  for (let i = 0; i < boards.length; i++) {
    const bd = boards[i];
    const t0 = ms();
    if (i < half) { const r = S.solve(bd); const dt = ms() - t0; st.push(dt); sn.push(r.nodes); spent += dt; }
    else { S.scoreAll(bd); const dt = ms() - t0; at.push(dt); spent += dt; }
    // ⚠⚠ 预算必须**逐局**判，不能等整档量完再判：档位每浅两手就贵约一个数量级，
    //   等 15 局跑完才发现超预算 = 已经烧掉几个小时。极端情形就在本文件抬头写着 ——
    //   空盘（plies=0）单次 solve 是 **2,391 秒**，而它的中位数当然要等它跑完才有。
    //   历史上这里判在档尾，默认档位一路降到 plies=0 ⇒ 默认 `npm run bench:c4` 会跑几小时，
    //   与抬头那句「别把空盘挂进自动化」自相矛盾。
    if (spent > BUDGET * 3) { aborted = true; break; }
  }
  const row = {
    plies, count: st.length + at.length, aborted,
    solveMed: st.length ? med(st) : NaN, solveMax: st.length ? mx(st) : NaN,
    solveNodes: sn.length ? med(sn) : NaN,
    allMed: at.length ? med(at) : NaN, allMax: at.length ? mx(at) : NaN
  };
  rows.push(row);
  if (!JSON_OUT) {
    const f = v => (Number.isNaN(v) ? '—' : fmt(v));
    console.log(
      String(plies).padStart(5) + ' | ' + String(row.count).padStart(4) + ' | ' +
      f(row.solveMed).padStart(11) + ' | ' + f(row.solveMax).padStart(12) + ' | ' +
      (Number.isNaN(row.solveNodes) ? '—' : num(row.solveNodes)).padStart(14) + ' | ' +
      f(row.allMed).padStart(13) + ' | ' + f(row.allMax).padStart(13) +
      (aborted ? '   ⚠ 已超预算，样本不足，仅供参考' : '')
    );
  }
  if (aborted) {
    if (!JSON_OUT) console.log('       （本档累计 ' + fmt(spent) + ' 已超 3× 预算 ' + fmt(BUDGET)
      + '，本档中断；更浅的档不再跑。要往更浅测就加大 --budget）');
    // ⚠ 这个 break 隐含假设 PLIES 是**降序**（越往后越浅越贵）。默认档位是降序的；
    //   `--plies=0,2,4` 这种升序会在第一档就退出（那也是对的——第一档就已经超预算了），
    //   但要注意它不代表「后面的档更贵」。
    break;
  }
}

// ⭐ 定 N：scoreAll 中位 ≤ 200ms 的**最小** plies
// ⚠ 中断的档（样本不足）不许参与定 N —— 半档样本的中位数不是中位数。
const okRows = rows.filter(r => !r.aborted && r.allMed <= TARGET_MS).sort((a, b) => a.plies - b.plies);
// ⚠ 同时给出「连**最慢**都 ≤ 200ms」的那一档：中位达标不等于不卡。四子棋同一手数档里
//   耗时能差上百倍（有没有活威胁差别巨大），中位 165ms 的那一档最慢可能是 3.6s ——
//   玩家碰上的就是那 3.6s。Task 7 定 N 时**两个数都要看**：按中位定 N 就必须接受
//   DESIGN §2.4 的降级路径（超时改措辞），想不降级就得按尾部定。
const tailRows = rows.filter(r => !r.aborted && r.solveMax <= TARGET_MS && r.allMax <= TARGET_MS)
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
