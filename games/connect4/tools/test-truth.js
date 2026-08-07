// ════════════════════════════════════════
// test-truth.js —— ⭐⭐ **地面真值门禁**（DESIGN §2.2）。
//
// 这个产品的全部卖点 —— 诚实分档的 AI、会讲道理的提示、赛后复盘的转折点、课程的自动
// 判分 —— 都建立在一句断言上：**「我们的求解器给出的是数学真值」**。
// 本文件就是那句断言的**唯一凭据**：拿 1988 年的**外部**结论（Allis 独立解出、Allen
// 同年独立复核、Tromp 1995 强解）来判我们自己。和 solitaire 拿微软 FreeCell #11982
// 当外部真值是同一个招式 —— 门禁的期望值**不许来自我们自己的代码**，否则就是自证。
//
//   空局 ⇒ 先手必胜；正中列（0-idx 3）是**唯一**的必胜开局
//   0-idx 2 / 4 列（1-idx 3 / 5）开局 ⇒ **和**
//   0-idx 0 / 1 / 5 / 6 列（1-idx 1 / 2 / 6 / 7）开局 ⇒ **后手胜**
//
// ⛔ **对不上就是我们错了，绝不许改这里的期望值。**（排查顺序印在文件末尾的失败分支里。）
//
// ─────────── ⭐ 为什么一次 scoreAll 就把三条真值全给出（不必跑 8 次 solve）───────────
// `scoreAll(bd)` 返回 `{ [列]: 分数 }`，**每一列的分数 = 「落这一列之后」那个局面的精确
// 分数，换算回 bd 的行棋方视角**。读 solver.js 的 rootScores 可以逐行确认：
//     if (B.isWinningMove(sb, c)) s = CELLS - sb.n;      // 当场赢 ⇒ 落子方视角的正分
//     else { B.playIn(sb, c); s = 0 - exactScore(sb); }  // playIn 翻 turn ⇒ 取反回落子方视角
// ⇒ 空盘上 scoreAll 的七个值就是「先手把第一子下在这一列，先手的结局」，正好逐列对应
//   Allis 的七条结论。⭐ 本文件的 `--dry` 模式**不是靠读注释**确认这条语义，而是在一个
//   浅局面上拿 `-solve(play(bd,c)).score` 逐列复算一遍（见 semanticProbe）——语义假设被
//   钉成可执行断言，改了 rootScores 的取反方向会当场红。
//
// ─────────── 两趟、各约 40 分钟（本机实测水位见 tools/bench-solver.js 抬头）───────────
//   [1/2] solve(空盘)    —— 拿 score / best / **nodes**
//   [2/2] scoreAll(空盘) —— 拿七列精确分（Allis 的三条全在这里兑现）
// ⚠ 两趟是**同一份工作**（空盘没有当场制胜手 ⇒ solve 的捷径不触发，两者都走
//   analyze(searchBoard(bd)) 的同一条路），所以第二趟不会更快、也不会更慢。
// ⚠ 那为什么还跑第一趟？因为 **scoreAll 不返回 nodes**（API 只有 `{列: 分数}`），而
//   nodes 是这份门禁里唯一能跨机器、跨时间比对的**指纹**；顺带白拿一条真交叉检验：
//   solve 的 score/best 必须等于 scoreAll 七列的 max/argmax —— 这是产品里两条**不同**
//   的消费路径（AI 落子读 solve、提示与判分读 scoreAll），它们分家过就是灾难。
//   ⇒ 赶时间可以 `--no-fingerprint` 只跑第二趟（真值三条照样全判），但**进包前跑全的**。
//
// ─────────── 纪律 ───────────
// ⛔ **绝不 `setKeepTable(true)`**：门禁必须走和产品**完全相同**的默认路径；打开它 nodes
//    还会随调用历史漂移，指纹立刻作废。
// ⛔ **禁 `Math.random`**：门禁必须逐位可复现（同 bench-solver.js / DESIGN §9.1）。
// ⭐ **结论由退出码裁决**（0 = 全绿 / 1 = 有红或抛错）。⚠ 本仓铁律：结论类脚本不许只靠
//    输出文字 —— 长文本会被误读、会被转述成幻觉，内核退出码不会。CI 与人都只认 `$?`。
// ⚠ nodes **只打印、不断言**：将来任何合法的搜索优化都会让它变小，assert 它 = 把优化锁死。
//    但变了会在输出里显眼提示 —— 因为「没人动过求解器，nodes 却变了」是真正该查的事。
//
// 用法：
//   node games/connect4/tools/test-truth.js                  # 完整门禁（≈80 分钟）
//   node games/connect4/tools/test-truth.js --no-fingerprint # 只跑 scoreAll（≈40 分钟）
//   node games/connect4/tools/test-truth.js --dry            # 冒烟：n≈20 的浅局面，秒级
//   node games/connect4/tools/test-truth.js --dry=24         # 指定浅局面手数（1..41）
// ⛔ 别把完整模式挂进 `npm test`（40-80 分钟）；它是 DESIGN §10 的**进包前必跑**项。
// ════════════════════════════════════════
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');

// ─────────── ⭐ 期望值：来自 Allis 1988，⛔ 不许改 ───────────
// 逐列（0-indexed）「先手把第一子下在这里」的结局。'W' = 先手胜 / 'D' = 和 / 'L' = 后手胜。
const ALLIS = ['L', 'L', 'D', 'W', 'D', 'L', 'L'];
// ⭐ 中列的**精确**分数（不只是符号）。分数约定见 solver.js 文件头：
//   胜方视角 score = CELLS + 1 - nWin = 43 - nWin ⇒ score 2 ⇔ nWin 41 ⇔ 先手第 41 子取胜，
//   与 Allis「先手在第 41 手兑现」逐位一致。⭐ 钉住这个数比只钉符号强得多：一个把胜负算对、
//   却把「多快取胜」算错的求解器，会让复盘的转折点、最快取胜、妙手判定全部撒谎而门禁全绿。
const CENTER_COL = 3;
const CENTER_SCORE = 2;
// 已知节点指纹（本机 Task 5 定稿版，两个 agent 各自独立跑出、逐位相同）。**只比对，不断言。**
const KNOWN_NODES = 8256675460;

// ─────────── 参数（⛔ 无随机源）───────────
const ARGV = process.argv.slice(2);
const hasFlag = (name) => ARGV.some(a => a === '--' + name || a.startsWith('--' + name + '='));
const valOf = (name, dflt) => {
  const p = ARGV.find(a => a.startsWith('--' + name + '='));
  return p === undefined ? dflt : p.slice(name.length + 3);
};
if (hasFlag('help') || hasFlag('h')) {
  console.log('用法：node games/connect4/tools/test-truth.js [--no-fingerprint] [--dry[=手数]]');
  process.exit(0);
}
const DRY = hasFlag('dry');
const DRY_PLIES = Number(valOf('dry', 20));
const WANT_FINGERPRINT = !hasFlag('no-fingerprint');
// ⛔ 手数必须合法且**不为 0**：`--dry=abc` ⇒ NaN ⇒ 构造循环一次都不跑 ⇒ 拿到的是**空盘**，
//   于是「秒级冒烟」会静默变成一趟 40 分钟的满盘搜索（而且不判真值）。当场炸掉，别让它跑。
if (DRY && !(Number.isInteger(DRY_PLIES) && DRY_PLIES >= 1 && DRY_PLIES <= B.CELLS - 1)) {
  console.log('❌ --dry=<手数> 必须是 1..' + (B.CELLS - 1) + ' 的整数，收到 ' + valOf('dry', 20));
  process.exit(1);
}

// ─────────── 断言：**不抛错**，记账 ───────────
// ⚠ 故意不用 assert：这份门禁跑一趟要几十分钟，第一条红就 throw 会把后面六列的读数一起
//   埋掉 —— 而「哪几列错了」正是排查方向的关键信息（只有中列错 vs 全部符号翻转，指向的
//   是完全不同的 bug）。所以全部跑完、逐条打勾，最后由退出码裁决。
let FAILS = 0;
function check(ok, msg) {
  if (!ok) FAILS++;
  console.log((ok ? '  [ OK ] ' : '  [FAIL] ') + msg);
  return ok;
}

// ─────────── 小工具 ───────────
const fmtN = (n) => n.toLocaleString('en-US');
const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's' + (ms >= 60000 ? '（' + (ms / 60000).toFixed(1) + ' 分钟）' : '');
/** 分数 ⇒ 结论码。⚠ 用 `> 0` / `< 0` 而不是 `>= 1`：分数是整数，但别把「0 也算和」写成
 *  三处不同的判据，两份判据迟早会漂移。 */
function verdictOf(s) { return s > 0 ? 'W' : (s < 0 ? 'L' : 'D'); }
const VERDICT_ZH = { W: '先手胜', D: '和　棋', L: '后手胜' };
/** 分出胜负那一刻盘上的子数。|score| = 43 - nWin（两个视角都成立，negamax 每层取反、
 *  绝对值沿路径不变）⇒ nWin = 43 - |score|。和棋没有 nWin（落满 42 子）。 */
function nWinOf(s) { return s === 0 ? null : (B.CELLS + 1 - Math.abs(s)); }
/** 换算成文献常见的「半手」记法（Pons 的参考实现）：**胜方还剩几个子没下 + 1**，
 *  即 `22 - k`（k = 胜方在取胜那一刻已下的子数，每方共 21 子）。**只作参考打印**，
 *  本门禁不拿它当判据 —— 我们自己的约定不 halve（理由见 solver.js 的上界 max 那一段）。
 *
 * ⛔⛔ **别写成 `Math.trunc(s / 2)`** —— 初版就是这么写的，实测当场露馅：
 *   我们的 |s| = 43 - nWin，而 k = ceil(nWin / 2)（胜方是先手时 k=(nWin+1)/2，后手时 k=nWin/2）
 *   ⇒ |半手分| = 22 - ceil(nWin/2) = **ceil(|s| / 2)**，不是 trunc(|s|/2)：
 *     · |s| 偶（如中列 2 ⇒ nWin 41）⇒ 两种写法都给 1，看不出错；
 *     · |s| 奇（如边列 -3 ⇒ nWin 40）⇒ 正确是 -2，trunc 给 **-1**。
 *   踩点正在「胜方是后手」那一侧 —— 空盘七列里正好只有输的那四列是奇数，于是错的写法
 *   把 -2 -1 印成 -1 0，和紧跟其后那行「文献是 -2 -1 0 +1 0 -1 -2」自相矛盾。
 *   ⚠ 这一列不参与判定，所以**门禁照样全绿**，只有那行参考值把它顶出来了。
 *   ⭐ 教训与 solver.js 的 `max(…, 0)` 同源：半手制的整数除法在两个视角上不对称，
 *     照抄「除以 2」而不照抄它的定义，就会在其中一侧悄悄差一格。 */
function halfMove(s) { return s === 0 ? 0 : Math.sign(s) * Math.ceil(Math.abs(s) / 2); }

/** 七列表格。⚠ 中文结论串统一 3 个字（'和　棋' 补全角空格）⇒ 终端里列宽才对得齐。
 *  @param withAllis 空盘之外（--dry）Allis 那两列**无意义**，整列留空 —— 别让冒烟输出里
 *         凭空出现一片「✗ 不符」，那正是「读输出文字下结论」最容易被误读的地方。 */
function printTable(sa, withAllis) {
  console.log('');
  console.log('  列(1-idx)  列(0-idx)   分数   结论      取胜手数 nWin   半手分'
    + (withAllis ? '   Allis 期望   判定' : ''));
  console.log('  ─────────  ─────────  ─────  ────────  ─────────────  ───────'
    + (withAllis ? '  ──────────  ──────' : ''));
  for (let c = 0; c < B.W; c++) {
    const s = sa[c];
    const v = verdictOf(s), w = nWinOf(s);
    console.log(
      '  ' + String(c + 1).padStart(6) + '     ' + String(c).padStart(6) + '    '
      + String(s).padStart(4) + '   ' + VERDICT_ZH[v] + '   '
      // ⚠ 两个分支的**显示宽度必须一样**（全角字符算 2 列）：'   第 22 子' 与 '     -     '
      //   都是 11 列，否则和棋那一行会把右边整片列错开 —— 表格错位不算 bug，但这份输出是给人
      //   **照着 Allis 逐条核对**用的，错位会让人核错行。
      // ⛔ 和棋这一格别用全角破折号 '—'（U+2014）：它是 East-Asian **Ambiguous** 宽度，
      //   同一份输出在不同终端里占 1 列或 2 列，对齐必然在某处裂开。ASCII '-' 恒占 1 列。
      + (w === null ? '     -     ' : ('   第 ' + String(w).padStart(2) + ' 子')) + '     '
      + String(halfMove(s)).padStart(4)
      + (withAllis ? ('     ' + VERDICT_ZH[ALLIS[c]] + '      ' + (v === ALLIS[c] ? '✓' : '✗ 不符')) : '')
    );
  }
  console.log('');
  if (withAllis) {
    console.log('  参考：文献常见的「半手」记法下，空盘七列是 -2 -1 0 +1 0 -1 -2 —— 2026-08-01 本机');
    console.log('  实跑与它**逐列相同**（不只是符号，连每一列的取胜手数都对上了）。');
    console.log('  ⚠ 这一列**只打印不判**（本门禁的判据是上面的符号 + 中列精确分）：它是我们自己的');
    console.log('    分数经一次换算得来的，不是独立观测 —— 拿它当断言等于给门禁加一条自证。');
    console.log('');
  }
}

// ─────────── 七列真值判定（全部断言集中在这里）───────────
function judge(sa) {
  // (0) 形状：七列必须全部在场。⚠ scoreAll 的键是**字符串**（JS 对象），`sa[c]` 用数字下标
  //     读得到，但 Object.keys 拿到的是 '0'..'6' —— 数个数就够，别拿键去做严格比较。
  const keys = Object.keys(sa);
  check(keys.length === B.W, '空盘的 scoreAll 必须给出全部 ' + B.W + ' 列，实得 ' + keys.length + ' 列');
  for (let c = 0; c < B.W; c++) {
    check(Number.isInteger(sa[c]), '列 ' + c + ' 的分数必须是整数，实得 ' + sa[c]);
    // ⚠ `-0`：DESIGN §2.1b 的同源坑。搜索本身不受影响（-0 === 0），但复盘曲线的
    //   `(-0).toFixed(1) === '-0.0'`、`Object.is(s,0)`、deepStrictEqual 会当场翻脸，
    //   且**只在和棋这一支出现** —— 最难查，所以在真值门禁里顺手钉死。
    check(!Object.is(sa[c], -0), '列 ' + c + ' 的分数不许是 -0（rootScores 的 `0 - x` 该洗干净）');
  }
  printTable(sa, true);
  // (1) ⭐ Allis 的三条：逐列符号
  for (let c = 0; c < B.W; c++) {
    check(verdictOf(sa[c]) === ALLIS[c],
      '第 ' + (c + 1) + ' 列（0-idx ' + c + '）开局 ⇒ Allis 1988 判「' + VERDICT_ZH[ALLIS[c]]
      + '」，我们判「' + VERDICT_ZH[verdictOf(sa[c])] + '」（分数 ' + sa[c] + '）');
  }
  // (2) ⭐ 中列的精确分：钉死「第 41 手兑现」
  const centerOK = sa[CENTER_COL] === CENTER_SCORE;
  check(centerOK,
    '正中列（0-idx ' + CENTER_COL + '）的精确分必须是 ' + CENTER_SCORE + '（⇔ 先手第 '
    + (B.CELLS + 1 - CENTER_SCORE) + ' 子取胜，Allis 1988），实得 ' + sa[CENTER_COL]
    // ⚠ 这句提醒只在**红**的时候才有意义，别无条件拼上去 —— 绿行里挂一句「取胜手数错」
    //   是典型的「输出文字自相矛盾」，而这份输出正是要给人当凭据看的。
    + (!centerOK && sa[CENTER_COL] > 0
      ? '（⚠ 胜负对了但取胜手数错 ⇒ 复盘的转折点 / 最快取胜 / 妙手判定会撒谎而胜负门禁全绿）' : ''));
  // (3) 唯一性：必胜开局有且只有中列一条
  const winners = [];
  for (let c = 0; c < B.W; c++) if (sa[c] > 0) winners.push(c);
  check(winners.length === 1 && winners[0] === CENTER_COL,
    '必胜开局必须**有且只有**正中列，实得 [' + winners.join(',') + ']');
  // (4) 左右镜像：四子棋规则关于中列完全对称 ⇒ 空盘上 c 与 6-c 必然同分。
  //     ⚠ 这条不是 Allis 的结论，是**几何**的结论 —— 它红了说明的是别的东西
  //     （盘面表示 / hasFourMasks 的某个方向不对称），所以单列一条。
  for (let c = 0; c < Math.floor(B.W / 2); c++) {
    check(sa[c] === sa[B.W - 1 - c],
      '空盘左右对称：列 ' + c + ' 与列 ' + (B.W - 1 - c) + ' 必须同分，实得 '
      + sa[c] + ' vs ' + sa[B.W - 1 - c]);
  }
}

/** solve 与 scoreAll 必须自洽：score = 七列 max、best = 全部 argmax（中路优先序）。
 *  ⭐ 产品里这是**两条不同的消费路径**（AI 落子读 solve，提示/精准度/妙手/判分读
 *  scoreAll）—— 它们分家过一次，玩家看到的「最佳着法」和「每列分数」就会互相打脸。 */
function crossCheck(r, sa) {
  let mx = -Infinity;
  for (let c = 0; c < B.W; c++) if (sa[c] > mx) mx = sa[c];
  const arg = [];
  for (const c of R.ORDER) if (sa[c] === mx) arg.push(c);
  check(r.score === mx, 'solve().score 必须等于 scoreAll 的最大列分：' + r.score + ' vs ' + mx);
  check(r.best.length === arg.length && r.best.every((c, i) => c === arg[i]),
    'solve().best 必须等于 scoreAll 的全部 argmax（中路优先序）：['
    + r.best.join(',') + '] vs [' + arg.join(',') + ']');
}

// ═════════════ 冒烟模式（--dry）═════════════
// 目的**不是**验真值（浅局面上没有外部真值可比），而是在几秒内验证**这份脚本自己**：
// 盘面构造、七列取数、nWin 换算、表格渲染、交叉检验、退出码 —— 以及最要紧的那条：
// ⭐ **scoreAll 的语义假设**。40 分钟的正式跑之前必须先绿这一趟。

/** 确定性浅局面（⛔ 无随机）：固定列序轮转，跳过「当场取胜」的落子以保证不终局。 */
function dryBoard(plies) {
  const seq = [3, 2, 4, 1, 5, 0, 6];
  let bd = B.newBoard();
  for (let i = 0; i < plies; i++) {
    let played = false;
    for (let k = 0; k < B.W; k++) {
      const c = seq[(i * 3 + k) % B.W];
      if (!B.canPlay(bd, c)) continue;
      if (B.isWinningMove(bd, c)) continue;      // 保证局面非终局
      bd = B.play(bd, c); played = true; break;
    }
    if (!played) break;                          // 只剩制胜手（本档不会发生，防御性）
  }
  // ⭐ 再走到「轮走方手上**没有**当场制胜手」为止：否则 solve 会命中「有制胜手就一个子节点
  //   都不展开」的捷径（nodes=1）、scoreAll 也几乎全走 isWinningMove 分支 —— 那样这趟冒烟
  //   只验了取数与渲染，**根本没碰到搜索**，正式跑之前最想验的那条路径反而是空的。
  let guard = 0;
  while (R.winningMoves(bd).length && guard++ < 2 * B.W) {
    const c = R.moves(bd).find(x => !B.isWinningMove(bd, x));
    if (c === undefined) break;                  // 全部合法着法都是制胜手 ⇒ 认了
    bd = B.play(bd, c);
  }
  return bd;
}

function render(bd) {
  const out = [];
  for (let r = B.H - 1; r >= 0; r--) {
    let line = '  ';
    for (let c = 0; c < B.W; c++) {
      const bit = 1 << r;
      line += (bd.a[c] & bit) ? ' ●' : ((bd.b[c] & bit) ? ' ○' : ' ·');
    }
    out.push(line);
  }
  out.push('   0 1 2 3 4 5 6');
  return out.join('\n');
}

/** ⭐⭐ 语义探针：逐列验证 `scoreAll(bd)[c]` 就是「**bd 的行棋方**视角、**落这一列之后**
 *  的精确分数」。用一条**独立**路径复算：`-solve(play(bd,c)).score`（play 是纯函数版，
 *  与 solver 内部的 playIn/undoIn 是两套代码）。
 *  ⚠ 当场取胜的列要单独算：那种局面 play 之后已终局，solve 对终局返回 0（不是「和」）。 */
function semanticProbe(bd, sa) {
  for (const c of R.moves(bd)) {
    let expect;
    if (B.isWinningMove(bd, c)) {
      expect = B.CELLS - bd.n;                                   // 当场落子即赢
    } else {
      const child = B.play(bd, c);
      const t = R.terminal(child);
      // 非制胜手 ⇒ child 只可能因「满盘」而终局，那就是和棋 0。
      expect = t !== null ? 0 : 0 - S.solve(child).score;
    }
    check(sa[c] === expect,
      '语义探针 列 ' + c + '：scoreAll=' + sa[c] + ' 必须 = -solve(落子后).score=' + expect
      + '（⇒ scoreAll 的每列分数确实是「当前行棋方视角、落这一列之后」）');
  }
}

function runDry() {
  const bd = dryBoard(DRY_PLIES);
  console.log('════ 冒烟模式（--dry）：**不是**地面真值门禁，只验脚本自身 ════');
  console.log('局面：n=' + bd.n + '（' + (bd.turn === 0 ? '先手 ●' : '后手 ○') + ' 行棋），手数 '
    + bd.mv.join(','));
  console.log(render(bd));
  check(R.terminal(bd) === null, '冒烟局面必须非终局');
  const t0 = Date.now();
  const sa = S.scoreAll(bd);
  const r = S.solve(bd);
  console.log('  scoreAll + solve 耗时 ' + fmtSec(Date.now() - t0)
    + '，solve: score=' + r.score + ' best=[' + r.best.join(',') + '] nodes=' + fmtN(r.nodes));
  // 表格照打（验渲染与 nWin 换算），但 Allis 那两列在非空盘上**无意义** ⇒ 整列不打。
  printTable(sa, false);
  crossCheck(r, sa);
  semanticProbe(bd, sa);
  for (const c of R.moves(bd)) check(!Object.is(sa[c], -0), '列 ' + c + ' 不许是 -0');
  return FAILS;
}

// ═════════════ 正式门禁 ═════════════
function runTruth() {
  console.log('════ ⭐ Connect-4 地面真值门禁（DESIGN §2.2 / Allis 1988）════');
  console.log('局面：空局（n=0，先手行棋）。期望来自 **外部文献**，⛔ 对不上是我们错了。');
  console.log('  · 正中列（1-idx 4 / 0-idx 3）⇒ 先手胜，且精确分 = ' + CENTER_SCORE
    + '（先手第 ' + (B.CELLS + 1 - CENTER_SCORE) + ' 子取胜）');
  console.log('  · 1-idx 3 / 5 列 ⇒ 和；1-idx 1 / 2 / 6 / 7 列 ⇒ 后手胜');
  console.log('本机水位：每趟约 40 分钟 / 82.6 亿节点。⛔ 全程不开 setKeepTable，走产品默认路径。');
  console.log('');

  const tAll = Date.now();
  let r = null;
  if (WANT_FINGERPRINT) {
    console.log('[1/2] solve(空盘) 开始 …  ' + new Date().toISOString());
    const t0 = Date.now();
    r = S.solve(B.newBoard());
    const dt = Date.now() - t0;
    console.log('[1/2] 完成，耗时 ' + fmtSec(dt) + '  ⇒ score=' + r.score
      + '  best=[' + r.best.join(',') + ']  nodes=' + fmtN(r.nodes)
      + '  （' + (r.nodes / (dt / 1000) / 1e6).toFixed(2) + ' M nodes/s）');
    // ⚠ nodes **不断言**（合法优化会让它变），但变了必须显眼 —— 见文件头。
    if (r.nodes === KNOWN_NODES) {
      console.log('      节点指纹 ✓ 与已知值 ' + fmtN(KNOWN_NODES) + ' 逐位一致（求解器行为未变）');
    } else {
      console.log('      ⚠⚠ 节点指纹**变了**：' + fmtN(r.nodes) + ' ≠ 已知 ' + fmtN(KNOWN_NODES)
        + '（' + (r.nodes / KNOWN_NODES).toFixed(3) + '×）');
      console.log('      ⇒ **求解器的搜索行为已变**。这不是失败，但必须确认是**有意的优化**而不是退化/');
      console.log('        误改；确认后把本文件的 KNOWN_NODES 更新成新值，并在提交信息里写清原因。');
    }
    console.log('');
  } else {
    console.log('[1/2] 跳过（--no-fingerprint）⇒ 本趟**没有**节点指纹与 solve/scoreAll 交叉检验。');
    console.log('');
  }

  console.log('[2/2] scoreAll(空盘) 开始 …  ' + new Date().toISOString());
  const t1 = Date.now();
  const sa = S.scoreAll(B.newBoard());
  console.log('[2/2] 完成，耗时 ' + fmtSec(Date.now() - t1));

  judge(sa);
  if (r) crossCheck(r, sa);

  console.log('');
  console.log('总耗时 ' + fmtSec(Date.now() - tAll));
  return FAILS;
}

// ─────────── 入口。⭐ 裁决权只在退出码上 ───────────
// ⚠ 整个跑在 try 里：任何抛错（含 OOM 之外的一切）都必须落到**退出码 1**，绝不许因为
//   「脚本自己炸了」而被读成「没红 = 通过」。
try {
  const fails = DRY ? runDry() : runTruth();
  console.log('');
  if (fails === 0) {
    console.log(DRY
      ? '✅ 冒烟通过（⚠ 这**不是**地面真值门禁，正式门禁请不带 --dry 跑）'
      : '✅✅ 地面真值门禁**全绿** —— 求解器与 Allis 1988 的外部结论逐条相符。');
    process.exit(0);
  }
  console.log('❌ ' + fails + ' 条不符。');
  if (!DRY) {
    console.log('⛔ **不许改本文件的期望值**（它们来自 1988 年的外部文献，Allis 与 Allen 独立解出、');
    console.log('   Tromp 1995 强解复核）。错的是我们。排查顺序：');
    console.log('   ① bitboard.hasFourMasks 的四个方向（尤其两条斜线的移位方向/跨列对齐）');
    console.log('   ② solver 的置换表：key 是否无损、界的类型 EXACT/LOWER/UPPER 判反');
    console.log('   ③ 分数约定的正负号（rootScores 的 `0 - exactScore`、negamax 每层取反）');
    console.log('   ④ αβ 上界的夹取 `max(CELLS-2-n, 0)`（DESIGN §2.1b，写小了会静默剪掉真答案）');
  }
  process.exit(1);
} catch (e) {
  console.log('');
  console.log('❌ 抛错：' + (e && e.stack ? e.stack : e));
  process.exit(1);
}
