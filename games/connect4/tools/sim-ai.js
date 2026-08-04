// ════════════════════════════════════════
// sim-ai.js —— ⭐ 20 级阶梯的**蒙特卡洛校准台**（DESIGN §3.1：`p` 由本脚本校准到目标胜率，
// 不是调参数试手感）。`npm run sim:c4`
//
// 五种模式，一条命令：
//   --mode=ladder   （默认）参考玩家 vs 每一级，出「胜/和/负 + 当前 p」整张表  ⇒ **回归基线**
//   --mode=sweep    固定一级、扫一串 p **或 blunder**（`--knob=`），出响应曲线       ⇒ **校准的依据**
//   --mode=weights  第 1-5 级中路权重表的复算（等差 vs 出厂几何，相邻级与跨度）⇒ **兑现 ai.js 里那句欠账**
//   --mode=handicap ⭐ 让子（DESIGN §6.7）真的改变胜负分布吗                  ⇒ **P2c Task 1 的验收**
//   --mode=kids     ⭐ 儿童档（DESIGN §6.7）比第 1 级更弱吗，而且仍然不是「坏了」  ⇒ **P2c Task 2 的验收**
//
// ⭐⭐ 为什么让子要**长在这个文件里**而不是另开一个脚本：本文件抬头那条「参考玩家 = 尺子」——
//   量让子必须用**同一把尺子**，否则「让 2 子涨了多少」这句话没有可比的基线。⛔ 别为了「干净」
//   把 refMove 抄一份出去（那正是本文件末尾那段删掉死导出的理由）。
//   ⚠ 摆子也必须走产品的那一份实现：`C4State.placeHandicap` / `C4State.HANDICAP_COLS`
//     ⇒ 模拟台和游戏摆的是**同一批格子**（⛔ 自己抄一份 = 量的不是这个产品）。
//
// ⭐ **要 A/B 候选曲线，用 `--pset=p6,…,p20`（求解器档）/ `--bset=b1,…,b5`（轻松档送头率），
//   ⛔ 别去改 js/ai.js**：它们只改内存里的参数表，进程一死就没了。「跑之前改源码、跑完记得改回来」正是本仓栽过的那类事故
//   （进程被 kill → finally 没跑 → 源文件留在改动态，而 `git status` 看着和正常改动一模一样）。
//   校准前的出厂线性曲线随手复现：
//     --pset=0.55,0.511,0.471,0.432,0.393,0.354,0.314,0.275,0.236,0.196,0.157,0.118,0.079,0.039,0
//
// ─────────── ⭐ 参考玩家 = 尺子（它必须独立于 ai.js）───────────
// 「AI 第 N 级有多强」这句话只有相对某个**固定的对手**才有意义。本文件里的参考玩家：
//   ① 能连四就连  ② 对手一手能连四就挡  ③ 其余按固定中路权重随机
// 即 DESIGN §3.1 那句「一个懂规则的普通人」。⛔ **绝不许拿 AI.aiMove(tier=N) 当参考玩家** ——
// 那是自己量自己：AI 的任何改动会同时移动被测者和尺子，胜率纹丝不动而实际强度已经变了。
// ⚠ 所以下面的 refMove 一行都不 require ai.js，连 posHash 都自己写一份（常数都不同）。
//
// ⭐⭐ ─── 一条用两把尺子才发现的事（2026-08-01，别再踩）───
// **轻松档与求解器档不在同一条强弱轴上，「谁更强」取决于玩家自己送不送头。**
//   求解器档**会完美惩罚送头**，轻松档不会 ⇒ 对会送头的玩家（basic）求解器档显得强得多；
//   对不送头的玩家（solid）它只剩自己走的次优手，反而显得弱。
//   实锤：p(6)=1.0 那一版在 basic 上完全单调（t5 .484 → t6 .443），
//        **在 solid 上当场倒挂**（t5 .599 → t6 .706，本工具的 ⚠倒挂 标出来了）。
// ⇒ ⛔ **改接缝附近的参数（p(6) / blunder(5)）必须两把尺子都跑**，
//   单尺子上漂亮的阶梯可能对另一半玩家是倒的。
// ⚠⚠ 参考玩家**故意不带**「不走立即败招」这一层（那是 AI 的战术前置层）。这正是它与第 1 级
//   AI 的分野：第 1 级是「瞎走但从不送头」，参考玩家是「会抓会挡但会送头」。⛔ 别顺手给它加上，
//   加了就等于把尺子换掉，本文件此前的每一个数字都作废 —— 要更强的对手请用下面的第二把尺子。
//
// ⭐ **两把尺子，不是一把**（`--ref=basic|solid`，默认 basic = 规格里定义的那个）：
//   · `basic`  会抓会挡 + 偏中路，**会送头**    —— 「刚学会规则的人」
//   · `solid`  再加一条「不落在对方赢点下面」   —— 「打过几十局、学会了别送头的人」
//   加第二把**不是为了让 AI 好看**（方向恰恰相反：尺子越强，AI 的胜率越难看），而是因为
//   basic 量出来的结论是「它大致等于第 1 级 AI」⇒ 单靠它答不了「中位级对**普通玩家**是不是
//   五五开」。两把尺子把「玩家有多强」这个产品假设变成一个**可见的区间**。
//   ⛔ 校准的锚点一律以 DESIGN §3.1 写死的目标为准，绝不许反过来挑一把让曲线好看的尺子。
//
// ─────────── 口径（与 DESIGN §9.1 同源）───────────
// · **确定性**：一局完全由 (tier, 局号, seedBase, 参数表) 决定 —— ⛔ 全文件零 Math.random，
//   多 worker 并行的调度顺序不影响任何一个数字。**已自查**（--workers 1 / 7 / 13 三次，
//   表体逐字节相同）：
//     for w in 1 7 13; do node .../sim-ai.js --mode=ladder --tiers=1-5 --games=500 \
//       --workers=$w 2>/dev/null | grep -E "^ +[0-9]+ " | md5sum; done
//   ⚠ 只比**表体**：末行的墙钟与 worker 数当然会变，把它算进去是自己给自己制造假红。
// · **先后手各半**：偶数局参考玩家执先。四子棋先手必胜，不平衡的话数字毫无意义。
// · **和局半分**：得分率 = (胜 + 和/2) / 局数。
// · 标准误 ≈ 0.5/√n（p≈0.5 处）：n=400 → .025 · n=800 → .018 · n=2000 → .011。
//   ⛔ **只认区间不重叠的结论**（DESIGN §9.1 第二条铁律的同一条纪律）。
//
// ─────────── ⚠ 成本（本机实测，2026-08-01）───────────
// 装了开局库之后**一局约 1 秒**（求解器档，中位 19-20 手；最慢的一局 6 秒）。远低于开工前
// 按 §9.2 断崖估的「单局 10-30 秒」，原因有三，都写下来免得后人再估错：
//   ① 参考玩家会送头 ⇒ 对局中位只有 19-20 手，很多局在 n<20 就结束，断崖段只经过 2-3 手；
//   ② 断崖只在 n=10..15，**且 AI 只走其中一半的手**（另一半是参考玩家在走，它零成本）；
//   ③ 战术前置层（当场制胜/唯一安全列/全送头）本来就替掉约 22% 的手，一次求解器都不调。
//   实测 AI 每手中位耗时按 n：n=10 约 660-860ms · n=11 约 300ms · n=12 约 110-160ms ·
//   n≥16 全在 10ms 以内（表越走越暖 + 剩余空间越来越小）。
// ⇒ 20 级 × 800 局 = 16,000 局，20 worker 上 **10-16 分钟**（实测 627 / 700 / 776 / 844 / 958 秒
//   五次，24 核机器上跑，随 p 曲线与尺子变化）。⛔ 别缩到没有统计意义的规模。
// ⚠ **AI 越弱反而越慢**：校准后的曲线比出厂曲线慢约 12%（对局更长、更常走进断崖段）。
//   ⇒ 「换一条更弱的 p 曲线」不等于「跑得更快」，排预算时别按直觉估。
//
// ⚠ `--keep`（S.setKeepTable(true)，跨局面复用置换表）默认**关**，且**本轮校准全程没开**
//   （上面那些数字都是关着跑的）。它在这里是合法的 —— 这是离线校准不是门禁，而且本文件
//   **任何地方都不读 nodes**，所以开不开只影响墙钟、不影响任何一个胜率。
//   ⚠ 但**别想当然以为它一定赚**：那个 5.08× 出自 **gen-book.js 抬头**（离线批量建库的口径），
//   ⛔ 不是 solver.js —— solver.js 自己记的是 **4.53× 节点 / 4.81× 墙钟**（n=14 的根 + 3 层内
//   全部 287 个去重非终局后代）。两处口径不同、数字不同，别混着引。
//   两者的共同前提都是「一个根 + 它的全部近邻后代」，而这里是**互不相关的一万六千局**
//   （solver.js 自己也记了：随机散点上它一分不赚）。
//   同一局内的连续局面确实重叠，跨局基本不重叠 —— 收益上限约等于「每局省一点」，
//   ⛔ 没实测过，别把它写成结论。⛔ worker 退出前无条件关回去。
// ════════════════════════════════════════
'use strict';
const path = require('path');
const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');

const DIR = __dirname;
const B = require(path.join(DIR, '../js/bitboard.js'));
const R = require(path.join(DIR, '../js/rules-classic.js'));
const S = require(path.join(DIR, '../js/solver.js'));
const Book = require(path.join(DIR, '../js/book.js'));
const AI = require(path.join(DIR, '../js/ai.js'));
// ⭐ 让子只借它两样：`placeHandicap`（摆子）与 `HANDICAP_COLS`（摆哪几格）。
//   ⛔ 别在这里 new 一个 G 出来 —— 模拟台跑的是裸 bitboard，走 state.js 会白搭一层分配。
const St = require(path.join(DIR, '../js/state.js'));
const PRNG = require(path.join(DIR, '../../../engine/prng.js'));
const BOOK_PATH = path.join(DIR, '../data/book-classic.bin');

// ════════ 参考玩家（尺子）════════
// ⚠ 中路权重写死在这里，且**不跟着 ai.js 的 CENTER_W 走**：尺子必须与被测者解耦，
//   否则改一次 ai.js 的权重表就会把历史上所有的胜率数字一起改掉（而且悄无声息）。
const REF_W = [4, 3, 2, 1];   // 下标 = |c-3|；中列约是边列的 4 倍，一个正常人的偏好

/** 局面 → 32 位散列。⚠ 与 ai.js 的 posHash **是两份**（常数不同），故意的：
 *  尺子不许与被测者共享随机性来源，否则「AI 和参考玩家在同一局面上同时抽到同一串数」
 *  这种相关性会以谁都想不到的方式偏移胜率。 */
function refHash(bd) {
  let h = 0x2545f491 | 0;
  for (let c = 0; c < B.W; c++) {
    h = Math.imul(h ^ bd.a[c], 0x27220a95);
    h = Math.imul(h ^ bd.b[c], 0x27220a95);
  }
  h = Math.imul(h ^ bd.turn, 0x27220a95);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return h >>> 0;
}

/**
 * ⭐ 参考玩家的一手。**纯函数**：(局面, seed, solid) → 列号，绝不修改入参。
 * ⛔ 零 Math.random；⛔ 不 require ai.js 的任何东西。
 * @param solid true = 第二把尺子（再加一条「不落在对方赢点下面」）
 */
function refMove(bd, seed, solid) {
  const my = R.winningMoves(bd);
  if (my.length) return my[0];                 // ① 能连四就连（中路优先序里的第一个）
  // ② 对手一手能连四就挡。⚠ 在**副本**上翻 turn 去问 winningMoves —— searchBoard 是拷贝，
  //    调用方的盘一位都不会动（这是全文件唯一一处翻 turn，别在别处复制这个技巧）。
  //    ⛔ 这一步必须在 ① 之后：己方已四连的盘上 winningMoves 照样报数（rules-classic 的实锤）。
  const sb = B.searchBoard(bd);
  sb.turn ^= 1;
  const threats = R.winningMoves(sb);
  sb.turn ^= 1;
  if (threats.length) return threats[0];
  // ③ solid 尺子：把「落完之后对手一手就赢」的列筛掉（= AI 战术前置层的那一半）。
  //    ⚠ 全都送头时**不筛**（保留全部列）—— 空集合会让下面的加权抽样除零，而且那种局面
  //      本来就已经输了，走哪一列不影响结论。
  let ms = R.moves(bd);
  if (solid) {
    const keep = [];
    for (let i = 0; i < ms.length; i++) {
      B.playIn(sb, ms[i]);
      if (R.winningMoves(sb).length === 0) keep.push(ms[i]);
      B.undoIn(sb, ms[i]);
    }
    if (keep.length) ms = keep;
  }
  // ④ 其余按中路权重随机。整数权重 + 一次乘法 + floor（同 ai.js weightedPick 的理由：逐位确定）
  const rnd = PRNG.create((seed ^ Math.imul(refHash(bd), 0x9e3779b1)) >>> 0);
  let total = 0;
  for (let i = 0; i < ms.length; i++) total += REF_W[Math.abs(ms[i] - 3)];
  let r = Math.floor(rnd() * total);
  for (let i = 0; i < ms.length; i++) {
    r -= REF_W[Math.abs(ms[i] - 3)];
    if (r < 0) return ms[i];
  }
  return ms[ms.length - 1];   // 到不了（rnd()<1）；⛔ 别改成 ms[0]，那会把 bug 伪装成正常行为
}

// ════════ 一局 ════════
// 每手的 seed = 本局 seed + n*7919（与 tests/test-ai-determinism.js 的自对弈同一约定，
// 两边的数字才可以互相对照）。⚠ ai.js 内部还会再拌一次局面散列，所以这里不必再花样。
const MOVE_SALT = 7919;

/**
 * @returns { s, mistakes, blunders, feeds, aiMoves } —— s 是**参考玩家视角**的得分：1/0.5/0
 *
 * ⭐ 为什么要在胜率之外统计失误：阶梯**顶端**（第 16-20 级）的胜率全部压在 0-3% 那一段，
 *   任何规模的蒙特卡洛都分不开这几级 —— 但玩家分得开的从来不是「我赢了几局」，
 *   是**「它有没有走错」**。⇒ 顶端可区分性看下面这几列，不要看 p 也不要看胜率。
 * ⚠ 三个都不等于 p / blunder：那两个是**意图**概率，实际值恒小于它们
 *   （次优常与最优同分；「不检查」也常常正好挑到安全列）。
 *
 *   · `mistakes` = **分数严格更差**的手（decide 的 `slipped`）。⚠ 分数含「多快赢」
 *     ⇒ 它把「仍然必胜，只是慢几手」也算成失误 —— 那是玩家**观察不到**的失误。
 *   · `blunders` = ⭐ **把胜负类别走没了**的手（必胜→和/负，或和→负；比较两个分数的正负号）。
 *     **这才是玩家能抓住的那种失误**，也是难度页上该印的数字（⛔ 不是 p）。
 *   · `feeds`    = ⭐ **实际送头**的手（这一手让对手下一手就连四）。轻松档的明面指标；
 *     ⛔ 求解器档必须恒为 0（DESIGN §3.1 的按档分流，测试里是零容忍断言）。
 */
function playVsRef(tier, gameIdx, seedBase, solid, pre, aiFirst, refFirstAlways) {
  // ⭐ 让子局里**强的一方（AI）恒先手**，⛔ 不再先后手各半 —— 与产品的规则逐字一致
  //   （state.js 的 newGame：`if (handicap > 0) humanFirst = false`）。弱方既拿预置子又先走
  //   是双重优势，量出来的数字会好看但那不是这个产品。
  // ⚠ 于是「让 N 子」与「让 0 子（交替）」之间有**两处**不同（多了子 + 恒后手）⇒
  //   modeHandicap 一定要把「让 0 子 + AI 恒先手」这一档也跑出来，否则分不清涨的是哪一半。
  const hcap = (pre && pre.length) ? pre : null;
  // ⚠ `aiFirst` 是**对照组**用的（让 0 子 + AI 恒先手）：少了它就没法回答「涨的到底是
  //   让子还是先手」，而那正是这次验收唯一要回答的事。
  // ⭐⭐ `refFirstAlways` = **儿童档**（P2c T2）：孩子恒先手，**连让子局也不让给强方** ——
  //   与产品的规则逐字一致（state.js 的 newGame：`if (kids) humanFirst = true` 排在
  //   `if (handicap > 0) humanFirst = false` **之后**）。⛔ 少了这一路，儿童档 + 让子会被
  //   量成「AI 先手」那一格 —— 数字全对、量的却不是这个产品，且没有一处会报错。
  const refFirst = refFirstAlways ? true
    : ((hcap || aiFirst) ? false : (gameIdx % 2) === 0);   // ⭐ 无让子时先后手各半
  const aiSeed = (seedBase + gameIdx * 104729) | 0;
  const refSeed = (seedBase ^ 0x5bf03635) + gameIdx * 40507;
  // ⭐ 预置子归**参考玩家**（= 弱方）。摆子走产品那一份实现（⛔ 别在这里自己写重力）。
  let bd = hcap ? St.placeHandicap(B.newBoard(), hcap, refFirst ? 0 : 1) : B.newBoard();
  let t, mistakes = 0, blunders = 0, feeds = 0, aiMoves = 0;
  while ((t = R.terminal(bd)) === null) {
    const refToMove = (bd.turn === 0) === refFirst;
    let col;
    if (refToMove) {
      col = refMove(bd, (refSeed + bd.n * MOVE_SALT) | 0, solid);
    } else {
      // ⚠ 走 decide 而不是 aiMove **只为了读 slipped / safe / scores** —— aiMove 就是
      //   decide().col，同一条代码路径、同一个答案，统计不会反过来影响落子。
      const dec = AI.decide(bd, tier, (aiSeed + bd.n * MOVE_SALT) | 0);
      col = dec.col; aiMoves++;
      // ⭐ 实际**送头**（这一手让对手下一手就连四）。不需要求解器，两档都能量：
      //   ⚠ safe 为空 = 全部列都送头（DOOMED），那是局面已经输了，⛔ 不算它选错。
      if (dec.safe.length && dec.safe.indexOf(col) === -1) feeds++;
      if (dec.slipped && dec.ranked) {
        mistakes++;
        // ⚠ ranked 按分数降序且全部来自安全列 ⇒ ranked[0].score 就是这一手的最优分。
        //   ⛔ 别拿 scores[col] 与 0 比：判据是**类别下降**（1→0、1→-1、0→-1），
        //     而不是「走出了一个负分」（本来就必败的局面里每一列都是负分，那不是失误）。
        const best = dec.ranked[0].score, got = dec.scores[dec.col];
        if (Math.sign(got) < Math.sign(best)) blunders++;
      } else if (dec.slipped) {
        // 轻松档的 slipped = 真送了头（ranked 为 null，没有求解器分数）。
        // 送头 ⇒ 对手下一手就赢 ⇒ 它**必然**是一次变盘失误（安全列严格优于送头列，
        // 证明见 ai.js 的 doomedScore 那段）—— ⛔ 不必也不应该为它再调一次求解器。
        mistakes++; blunders++;
      }
    }
    bd = B.play(bd, col);
  }
  const w = R.winnerOf(t);
  const s = (w === null) ? 0.5 : (((w === 0) === refFirst) ? 1 : 0);
  return { s: s, mistakes: mistakes, blunders: blunders, feeds: feeds, aiMoves: aiMoves };
}

/** AI 自对弈（--mode=weights 用）：@returns tA 视角的得分 */
function playAiVsAi(tA, tB, gameIdx, seedBase) {
  const aFirst = (gameIdx % 2) === 0;
  const seed = (seedBase + gameIdx) | 0;
  let bd = B.newBoard();
  let t;
  while ((t = R.terminal(bd)) === null) {
    const aToMove = (bd.turn === 0) === aFirst;
    bd = B.play(bd, AI.aiMove(bd, aToMove ? tA : tB, (seed + bd.n * MOVE_SALT) | 0));
  }
  const w = R.winnerOf(t);
  if (w === null) return 0.5;
  return ((w === 0) === aFirst) ? 1 : 0;
}

// ════════ 任务执行（主线程与 worker 共用同一份）════════
// 一个 job = { kind, ... }，返回 { wins, draws, losses, score, n }。
// ⭐ 结果**只由 job 决定**，与它在哪个 worker、第几个跑完都无关 —— 换 --workers 数字逐位相同。
function applyParams(over) {
  AI.resetTierParams();
  if (!over) return;
  for (const k of Object.keys(over)) AI.setTierParams(+k, over[k]);
}

function runJob(job) {
  applyParams(job.params);
  let w = 0, d = 0, l = 0, mistakes = 0, blunders = 0, blunderGames = 0, feeds = 0, aiMoves = 0;
  for (let i = job.from; i < job.to; i++) {
    let s;
    if (job.kind === 'ref') {
      const r = playVsRef(job.tier, i, job.seedBase, job.solid, job.pre, job.aiFirst, job.refFirst);
      s = r.s; mistakes += r.mistakes; blunders += r.blunders;
      feeds += r.feeds; aiMoves += r.aiMoves;
      if (r.blunders) blunderGames++;
    } else {
      s = playAiVsAi(job.tA, job.tB, i, job.seedBase);
    }
    if (s === 1) w++; else if (s === 0.5) d++; else l++;
  }
  return {
    id: job.id, wins: w, draws: d, losses: l, n: job.to - job.from,
    mistakes: mistakes, blunders: blunders, blunderGames: blunderGames,
    feeds: feeds, aiMoves: aiMoves
  };
}

// ════════ 并行 ════════
function chunkJobs(jobs, workers) {
  // 每个 job 再按局数切块，让 20 个 worker 都有活干（一级 800 局切成 20 块，各 40 局）
  const out = [];
  for (const j of jobs) {
    const per = Math.max(1, Math.ceil((j.to - j.from) / workers));
    for (let s = j.from; s < j.to; s += per) {
      out.push(Object.assign({}, j, { from: s, to: Math.min(j.to, s + per) }));
    }
  }
  return out;
}

function runParallel(jobs, opt) {
  const chunks = chunkJobs(jobs, opt.workers);
  if (opt.workers <= 1) {
    initEngine(opt);
    try { return chunks.map(runJob); } finally { if (opt.keep) S.setKeepTable(false); }
  }
  return new Promise((resolve, reject) => {
    const results = [];
    let next = 0, alive = 0, failed = false;
    const t0 = Date.now();
    const spawn = () => {
      const w = new Worker(__filename, { workerData: { opt: opt } });
      alive++;
      const feed = () => {
        if (next >= chunks.length) { w.postMessage(null); return; }
        w.postMessage(chunks[next++]);
      };
      w.on('message', m => {
        results.push(m);
        // ⚠ 进度打 **stderr**：整张表要能 `> out.txt` 干净地重定向，而一个跑十几分钟、
        //   全程零输出的脚本会被读成「挂住了」（然后被人 Ctrl-C 掉，白跑）。
        const done = results.length, all = chunks.length;
        const el = (Date.now() - t0) / 1000;
        process.stderr.write('\r  ' + done + '/' + all + ' 块 · ' + el.toFixed(0)
          + 's · 预计还需 ' + (el / done * (all - done)).toFixed(0) + 's   ');
        if (done === all) process.stderr.write('\n');
        feed();
      });
      w.on('error', e => { failed = true; reject(e); });
      w.on('exit', () => { if (--alive === 0 && !failed) resolve(results); });
      feed();
    };
    for (let i = 0; i < Math.min(opt.workers, chunks.length); i++) spawn();
  });
}

function initEngine(opt) {
  const bk = Book.loadFileSync(BOOK_PATH);
  if (!bk && opt.needBook) {
    // ⛔ 没库时 n≤9 的一次 scoreAll 是**几十分钟**（DESIGN §9.2）⇒ 求解器档一局跑不完，
    //   而表现是「脚本挂住了」而不是报错。宁可当场炸。
    throw new Error('开局库没装上（' + Book.status().error + '）—— 求解器档没有库跑不动，先 npm run gen:c4book');
  }
  if (opt.keep) S.setKeepTable(true);
}

if (!isMainThread) {
  initEngine(workerData.opt);
  parentPort.on('message', job => {
    if (job === null) {
      if (workerData.opt.keep) S.setKeepTable(false);   // ⛔ 退出前无条件关回去
      parentPort.close();
      return;
    }
    parentPort.postMessage(runJob(job));
  });
}

// ════════ 汇总 ════════
function collect(results, ids) {
  const acc = {};
  for (const id of ids) acc[id] = { wins: 0, draws: 0, losses: 0, n: 0, mistakes: 0, blunders: 0, blunderGames: 0, feeds: 0, aiMoves: 0 };
  for (const r of results) {
    const a = acc[r.id];
    a.wins += r.wins; a.draws += r.draws; a.losses += r.losses; a.n += r.n;
    a.mistakes += r.mistakes || 0; a.blunders += r.blunders || 0;
    a.blunderGames += r.blunderGames || 0; a.feeds += r.feeds || 0; a.aiMoves += r.aiMoves || 0;
  }
  for (const id of ids) {
    const a = acc[id];
    a.score = (a.wins + a.draws / 2) / a.n;
    // ⭐ **真实标准误**（⛔ 不是抬头那个 0.5/√n 上界）：每局的得分是 {0, .5, 1} 上的一个随机变量，
    //   E[s²] = (胜 + 和/4)/n ⇒ Var = E[s²] − 均值²。让子那边的胜率会跑到 .9 以上，
    //   那里 0.5/√n 会把区间夸大近一倍 —— 「显著上升」这句结论必须用真区间说，别用上界糊。
    a.sd = Math.sqrt(Math.max(0, (a.wins + a.draws * 0.25) / a.n - a.score * a.score));
    a.se = a.sd / Math.sqrt(a.n);
    a.blunderGameRate = a.blunderGames / a.n;       // ⭐ 顶端可区分性看这一列
    a.blunderMoveRate = a.aiMoves ? a.blunders / a.aiMoves : 0;
    a.feedRate = a.aiMoves ? a.feeds / a.aiMoves : 0;   // ⭐ 实测送头率（难度页印这个）
  }
  return acc;
}
const se = n => 0.5 / Math.sqrt(n);   // p≈0.5 处的标准误上界

// ════════ 主流程 ════════
function parseArgs(argv) {
  const o = {
    mode: 'ladder', games: 400, seedBase: 20260801, workers: Math.max(1, Math.min(20, require('os').cpus().length - 4)),
    tiers: null, ps: null, pset: null, bset: null, knob: 'p', tier: 12, q3: null,
    keep: false, needBook: true, families: 4, json: false, ref: 'basic', hcols: null
  };
  for (const a of argv) {
    const m = /^--([a-z0-9]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error('看不懂的参数：' + a);
    const [, k, v] = m;
    switch (k) {
      case 'mode': o.mode = v; break;
      case 'ref':
        if (v !== 'basic' && v !== 'solid') throw new Error('--ref 只有 basic / solid 两把尺子，收到 ' + v);
        o.ref = v; break;
      case 'games': o.games = +v; break;
      case 'seed': o.seedBase = +v; break;
      case 'workers': o.workers = +v; break;
      case 'tier': o.tier = +v; break;
      case 'q3': o.q3 = +v; break;
      case 'families': o.families = +v; break;
      case 'keep': o.keep = true; break;
      case 'json': o.json = true; break;
      case 'tiers': o.tiers = expandRange(v); break;
      case 'hcols':
        // ⭐ 只覆盖 --mode=handicap 里那一档 A/B（h2c）。理由同 --pset/--bset：
        //   ⛔ 别为了试另一种摆法去改 js/state.js 的 HANDICAP_COLS —— 「跑之前改源码、
        //   跑完记得改回来」正是本仓栽过的事故。产品那两档恒从 C4State.HANDICAP_COLS 取。
        o.hcols = v === '' ? [] : v.split(',').map(Number);
        for (const c of o.hcols) {
          if (!Number.isInteger(c) || c < 0 || c >= B.W) throw new Error('--hcols 里有非法列号：' + c);
        }
        break;
      case 'ps': o.ps = v.split(',').map(Number); break;
      case 'knob':
        if (v !== 'p' && v !== 'blunder') throw new Error('--knob 只有 p / blunder，收到 ' + v);
        o.knob = v; break;
      case 'bset':
        // ⭐ 整条候选送头率曲线（第 1..SOLVER_FROM-1 级）。理由同 --pset：⛔ 别改源码去 A/B。
        o.bset = v.split(',').map(Number);
        if (o.bset.length !== AI.SOLVER_FROM - 1) {
          throw new Error('--bset 必须给 ' + (AI.SOLVER_FROM - 1) + ' 个数（第 1..'
            + (AI.SOLVER_FROM - 1) + ' 级），收到 ' + o.bset.length + ' 个');
        }
        break;
      case 'pset':
        // ⭐ 整条候选 p 曲线（第 SOLVER_FROM..TIER_MAX 级，逗号分隔）。
        //   ⛔ 有了它就**不必为了 A/B 去改 js/ai.js** —— 「跑之前改源码、跑完记得改回来」
        //   正是本仓栽过的那类事故（进程被 kill、finally 没跑、源文件留在改动态而
        //   `git status` 看着和正常改动一模一样）。这里改的是内存里的参数表，进程一死就没了。
        o.pset = v.split(',').map(Number);
        if (o.pset.length !== AI.TIER_MAX - AI.SOLVER_FROM + 1) {
          throw new Error('--pset 必须给 ' + (AI.TIER_MAX - AI.SOLVER_FROM + 1)
            + ' 个数（第 ' + AI.SOLVER_FROM + '..' + AI.TIER_MAX + ' 级），收到 ' + o.pset.length + ' 个');
        }
        break;
      default: throw new Error('不认识的参数 --' + k + '（看文件头的三种 --mode）');
    }
  }
  return o;
}
function expandRange(v) {
  const out = [];
  for (const part of v.split(',')) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else out.push(+part);
  }
  return out;
}

async function modeLadder(o) {
  const tiers = o.tiers || Array.from({ length: AI.TIER_MAX }, (_, i) => i + 1);
  // --pset 给的整条候选曲线：只改内存里的参数表，⛔ 一个字节都不写 js/ai.js。
  let over = null;
  if (o.pset) {
    over = {};
    for (let t = AI.SOLVER_FROM; t <= AI.TIER_MAX; t++) over[t] = { p: o.pset[t - AI.SOLVER_FROM] };
  }
  if (o.bset) {
    over = over || {};
    for (let t = 1; t < AI.SOLVER_FROM; t++) over[t] = { blunder: o.bset[t - 1] };
  }
  const pOf = t => (over && over[t] && over[t].p !== undefined) ? over[t].p : AI.params(t).p;
  const bOf = t => (over && over[t] && over[t].blunder !== undefined) ? over[t].blunder : AI.params(t).blunder;
  const jobs = tiers.map(t => ({
    id: 't' + t, kind: 'ref', tier: t, from: 0, to: o.games,
    seedBase: o.seedBase, params: over, solid: o.ref === 'solid'
  }));
  const t0 = Date.now();
  const acc = collect(await runParallel(jobs, o), jobs.map(j => j.id));
  const wall = (Date.now() - t0) / 1000;
  if (o.pset || o.bset) console.log('\n⚠ 本次用的是 --pset/--bset 传进来的候选曲线，**不是** js/ai.js 的出厂表');
  console.log('\n⭐ 参考玩家[' + o.ref + '] vs 20 级阶梯（' + o.games + ' 局/级 · 先后手各半 · 和局半分 · seed '
    + o.seedBase + ' · 标准误 ≈ ' + se(o.games).toFixed(3) + '）');
  console.log('级别  模式    p/blunder  q3    参考玩家 胜/和/负        得分率  ⭐送头率  ⭐变盘失误/局  有变盘失误的局');
  let prev = null;
  const rows = [];
  for (const t of tiers) {
    const a = acc['t' + t], pr = AI.params(t);
    // ⚠ 阶梯必须**单调**（级别越高，参考玩家越难赢）。倒挂就在行尾标出来 —— 相邻级差在
    //   噪声里是正常的（DESIGN 说相邻角色五五开是对的），但**方向性的倒挂**是阶梯错了。
    const inverted = prev !== null && a.score > prev + 2 * se(o.games);
    const inv = inverted ? '  ⚠倒挂' : '';
    // ⭐ 门禁与这个 ⚠倒挂 标记**读同一个变量** —— ⛔ 别让门禁自己再算一遍判据：
    //   两份判据迟早漂移，那时屏幕上标着 ⚠倒挂 而退出码是 0（或反过来），谁都不知道该信哪个。
    rows.push({ tier: t, score: a.score, inverted: inverted, prevScore: prev });
    prev = a.score;
    // ⚠ 「p/blunder」一列对求解器档是 p、对轻松档是 blunder —— 两者是**同一件事在两段的
    //   不同实现**（都是「这一手打算走坏」的意图概率），并排读才看得出整条阶梯的走势。
    console.log(String(t).padStart(3) + '   ' + pr.mode.padEnd(8)
      + (pr.mode === 'solver' ? pOf(t).toFixed(3) : bOf(t).toFixed(3)).padEnd(10)
      + (pr.mode === 'solver' ? pr.q3.toFixed(2) : ' - ').padEnd(6)
      + (a.wins + '/' + a.draws + '/' + a.losses).padEnd(20)
      + a.score.toFixed(3)
      + (a.feedRate * 100).toFixed(1).padStart(8) + '%'
      + (a.blunders / a.n).toFixed(2).padStart(13)
      + (a.blunderGameRate * 100).toFixed(0).padStart(14) + '%' + inv);
  }
  console.log('（' + wall.toFixed(1) + 's · ' + o.workers + ' worker · '
    + (wall * o.workers / (tiers.length * o.games) * 1000).toFixed(0) + ' ms/局·核）');
  if (o.json) console.log('JSON ' + JSON.stringify(tiers.map(t => ({ tier: t, p: AI.params(t).p, score: acc['t' + t].score }))));
  return { acc: acc, gate: ladderGate(o, rows) };
}

// ════════ ⭐ 退出码门禁（本仓铁律：结论类脚本用**退出码**裁决，⛔ 不靠人读输出）════════
//
// 基线（2026-08-01 本机实测，`npm run sim:c4` = ladder · basic · 800 局/级 · seed 20260801 ·
// 参数表指纹 da3c3d1d · 809.9s）：
//   级别  1     2     3     4     5  |  6     7     8     9    10    11    12
//   得分 .885  .786  .694  .607  .498| .370  .338  .354  .296  .304  .278  .231
//   级别 13    14    15    16    17   18    19    20
//   得分 .191  .171  .121  .109  .086 .032  .026  .000
//
// ⚠⚠ **下界不是产品目标本身**，这一条最容易被后人改错，所以写清楚：
//   DESIGN §3.1 的锚点是「第 1 级 ≈ 参考玩家 90%」，而实测点估计是 **.885**（同处已记：
//   4,000 局复测 .892 / SE .008，目标 .90 落在 CI 内但点估计低 1-1.5 个百分点）。
//   ⇒ 直接 `assert score1 >= 0.90` 会**当场红**，而那不是回归，是**已知且已被产品接受的现状**。
//     把门禁写成一条明知会红的断言，等于第二天就被人注释掉 —— 那才是最坏的结果。
//   ⇒ 下界取 **.86** = 4,000 局复测点估计 .892 − 4×SE(.008)，再向下取到百分位。
//     它的含义是「第 1 级比今天**显著**退步了」才红，⛔ 不是「没打到 .90 就红」。
//   ⭐ **什么时候必须收紧**：产品若采纳 DESIGN §3.1 里那条「第 1 级改偏边路」（实测 w=[10,14,20,28]
//     给 .938），这个下界要跟着抬到 .90 以上 —— 否则它就退化成一条永远绿的摆设。
//
// ⚠ 锚点只在 `--ref=basic` 上判：solid 是第二把**更强**的尺子，同一条阶梯在它上面整体高一大截
//   （ai.js 记的接缝实测 solid t5 .610 → t6 .603），拿 basic 的数字去卡 solid 是纯粹的假红。
//   ⛔ 但**单调性对两把尺子都判** —— 「单尺子上漂亮的阶梯可能对另一半玩家是倒的」正是本文件
//   抬头那条实锤，只在 basic 上判单调性等于把那条教训扔了。solid 的锚点要等它自己的基线跑出来。
const GATE = Object.freeze({
  MIN_GAMES: 400,          // 少于这个局数噪声太大（SE > .025），判不动，只打印不裁决
  T1_MIN: 0.86,            // 第 1 级下界（推导见上）
  TOP_MAX: 0.02,           // 顶档上界：第 20 级零失误 ⇒ 实测 0/0/800，给 16 个半分的余量
  MIN_SPAN: 0.75,          // 第 1 级 − 第 20 级（实测 .885）
  CHECKPOINTS: [1, 5, 10, 15, 20],
  MIN_CHECKPOINT_DROP: 0.05 // 相邻检查点之间必须真的降（实测最小一段 .121→.000 = .121）
});

function ladderGate(o, rows) {
  const fails = [];
  const skips = [];
  const full = GATE.CHECKPOINTS.every(t => rows.some(r => r.tier === t));
  if (o.games < GATE.MIN_GAMES) {
    skips.push('--games=' + o.games + ' < ' + GATE.MIN_GAMES + '（SE=' + se(o.games).toFixed(3)
      + '，噪声太大，判不动）');
  } else {
    // ① ⭐ 单调性：**任何 ladder 跑都判**，包括 --pset/--bset 的候选曲线。
    //    ⚠ 第一版只在出厂表上判，是**写反了**：候选曲线恰恰是最需要这条的场合 ——
    //      T9 那个「p(6)=1.0 在 solid 上倒挂」就是拿候选曲线跑出来的。把它豁免掉，
    //      等于让门禁在唯一可能发现倒挂的场合闭眼。
    //    ⚠ 也正因为它对候选曲线生效，这条判据才**可测**：给一条故意倒挂的 --pset
    //      就能验证门禁真的会红（⛔ 否则唯一的验证办法是改 ai.js 源码，正是本仓的事故源）。
    for (const r of rows) {
      if (r.inverted) {
        fails.push('第 ' + r.tier + ' 级倒挂：得分率 ' + r.score.toFixed(3)
          + ' > 第 ' + (r.tier - 1) + ' 级 ' + r.prevScore.toFixed(3) + ' + 2×SE('
          + (2 * se(o.games)).toFixed(3) + ') ⇒ 级别越高反而越好赢，阶梯方向错了');
      }
    }
    // ② 锚点与量程：只对**出厂表 + basic + 跑满检查点**判 —— 它们是「和基线比」，
    //    而候选曲线本来就不该等于基线。
    if (o.pset || o.bset) skips.push('用了 --pset/--bset 候选曲线 ⇒ 只判单调性，不判锚点/量程（锚点是出厂表的基线）');
    else if (o.ref !== 'basic') skips.push('--ref=' + o.ref + '：锚点/量程只在 basic 上有基线，本次只判了单调性');
    else if (!full) skips.push('本次没跑满第 ' + GATE.CHECKPOINTS.join('/') + ' 级，锚点/量程跳过');
    else {
        const at = t => rows.find(r => r.tier === t).score;
        if (at(1) < GATE.T1_MIN) {
          fails.push('第 1 级得分率 ' + at(1).toFixed(3) + ' < 下界 ' + GATE.T1_MIN
            + ' ⇒ 最容易的一档比基线显著退步了（DESIGN §3.1 锚点：新手该赢约九成）');
        }
        if (at(AI.TIER_MAX) > GATE.TOP_MAX) {
          fails.push('第 ' + AI.TIER_MAX + ' 级得分率 ' + at(AI.TIER_MAX).toFixed(3) + ' > 上界 '
            + GATE.TOP_MAX + ' ⇒ 顶档不再是零失误（它是完美求解器，参考玩家本不该赢得下来）');
        }
        const span = at(1) - at(AI.TIER_MAX);
        if (span < GATE.MIN_SPAN) {
          fails.push('阶梯量程只有 ' + span.toFixed(3) + ' < ' + GATE.MIN_SPAN
            + ' ⇒ 20 个级挤在太窄的胜率区间里，玩家分不出来');
        }
        for (let i = 1; i < GATE.CHECKPOINTS.length; i++) {
          const a = at(GATE.CHECKPOINTS[i - 1]), b = at(GATE.CHECKPOINTS[i]);
          if (a - b < GATE.MIN_CHECKPOINT_DROP) {
            fails.push('第 ' + GATE.CHECKPOINTS[i - 1] + '→' + GATE.CHECKPOINTS[i] + ' 级只降了 '
              + (a - b).toFixed(3) + ' < ' + GATE.MIN_CHECKPOINT_DROP + ' ⇒ 这一段是平的，不是阶梯');
          }
        }
      }
  }
  for (const s of skips) console.log('\n⚠ 门禁部分跳过：' + s);
  if (fails.length) {
    console.log('\n⛔ 门禁未通过（' + fails.length + ' 条）：');
    for (const f of fails) console.log('   · ' + f);
    console.log('⛔ 别改这里的下界让它变绿 —— 先确认是不是真的改坏了阶梯；'
      + '确实是有意的产品改动，就连同上面 GATE 那段的推导一起重写。');
    return { ok: false, fails: fails };
  }
  console.log('\n✅ 门禁通过：单调（无倒挂）'
    + (o.ref === 'basic' && !o.pset && !o.bset && o.games >= GATE.MIN_GAMES && full
      ? ' · 第 1 级 ≥ ' + GATE.T1_MIN + ' · 第 ' + AI.TIER_MAX + ' 级 ≤ ' + GATE.TOP_MAX
        + ' · 量程 ≥ ' + GATE.MIN_SPAN : ''));
  return { ok: true, fails: [] };
}

async function modeSweep(o) {
  // ⭐ 关键观察：求解器档（6-20 级）的行为**只由 (p, q3) 决定** —— tier 本身只参与 PRNG 混种。
  //   所以扫一遍 p 就拿到了整条 p → 胜率 的响应曲线，不必对 15 个级各做一次二分（省 15×）。
  //   ⚠ 但 tier 参与混种 ⇒ 同一个 p 在不同 tier 上会有**噪声级**的差异，用多 seed 家族估它。
  const ps = o.ps || [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const jobs = [];
  for (const p of ps) {
    for (let f = 0; f < o.families; f++) {
      const par = {}; par[o.tier] = {};
      par[o.tier][o.knob] = p;
      if (o.q3 !== null) par[o.tier].q3 = o.q3;
      jobs.push({
        id: 'p' + p + '#' + f, kind: 'ref', tier: o.tier, from: 0, to: o.games,
        seedBase: (o.seedBase + f * 1000003) | 0, params: par, solid: o.ref === 'solid'
      });
    }
  }
  const t0 = Date.now();
  const acc = collect(await runParallel(jobs, o), jobs.map(j => j.id));
  console.log('\n⭐ ' + o.knob + ' → 参考玩家[' + o.ref + ']得分率（第 ' + o.tier + ' 级 · q3='
    + (o.q3 === null ? AI.params(o.tier).q3 : o.q3) + ' · ' + o.games + ' 局 × '
    + o.families + ' 家族 · 单家族标准误 ≈ ' + se(o.games).toFixed(3) + '）');
  console.log('  ' + o.knob.padEnd(6) + ' ' + Array.from({ length: o.families }, (_, f) => ('家族' + f).padStart(7)).join(' ') + '   合并    胜/和/负（合并）');
  for (const p of ps) {
    let w = 0, d = 0, l = 0, n = 0;
    const cells = [];
    for (let f = 0; f < o.families; f++) {
      const a = acc['p' + p + '#' + f];
      cells.push(a.score.toFixed(3).padStart(7));
      w += a.wins; d += a.draws; l += a.losses; n += a.n;
    }
    console.log(String(p).padEnd(7) + cells.join(' ') + '   ' + ((w + d / 2) / n).toFixed(3)
      + '   ' + w + '/' + d + '/' + l);
  }
  console.log('（' + ((Date.now() - t0) / 1000).toFixed(1) + 's · ' + o.workers + ' worker）');
  return acc;
}

// ⭐ ─── 第 1-5 级中路权重表的复算（兑现 ai.js CENTER_W 上方那句欠账）───
// ai.js 里那张表选了**几何加速**的间距而不是等差，理由是「跨度」（第 1 级到第 5 级拉得开）。
// 那段注释自称实测，但脚本一直没落地 —— 这里把它变成跑得出来的东西。
// 等差版的定义照抄注释：bias 1.0/1.3/1.6/1.9/2.2，w[d] = round(10 × bias^(3−d))。
const W_ARITH = [
  [10, 10, 10, 10],     // bias 1.0
  [22, 17, 13, 10],     // bias 1.3
  [41, 26, 16, 10],     // bias 1.6
  [69, 36, 19, 10],     // bias 1.9
  [106, 48, 22, 10]     // bias 2.2
];
async function modeWeights(o) {
  const pairs = [[5, 4], [4, 3], [3, 2], [2, 1], [5, 1]];
  const variants = { '几何(出厂)': null, '等差': W_ARITH };
  const jobs = [];
  for (const vn of Object.keys(variants)) {
    for (const [x, y] of pairs) {
      for (let f = 0; f < o.families; f++) {
        // ⚠⚠ **两个变体都把 blunder 清零**：这一组只回答「权重表该不该是几何间距」，
        //   带着送头率跑会被主旋钮完全盖过（送头率的量程比中路偏好大一个数量级），
        //   量出来的是 blunder 表而不是权重表 —— 一次看不出来的口径错。
        const par = {};
        for (let t = 1; t < AI.SOLVER_FROM; t++) {
          par[t] = { blunder: 0 };
          if (variants[vn]) par[t].w = variants[vn][t - 1];
        }
        jobs.push({
          id: vn + '|' + x + 'v' + y + '|' + f, kind: 'ai', tA: x, tB: y,
          from: 0, to: o.games, seedBase: (o.seedBase + f * 1000003) | 0, params: par
        });
      }
    }
  }
  const t0 = Date.now();
  // ⚠ 轻松档一次求解器都不调 ⇒ 一局几十微秒，不值得起 worker（起 worker 的开销比跑完还贵）
  const acc = collect(await runParallel(jobs, Object.assign({}, o, { workers: 1, needBook: false })),
    jobs.map(j => j.id));
  console.log('\n⭐ 第 1-5 级中路权重表复算（确定性自对弈 · 先后手各半 · 和局半分 · '
    + o.games + ' 局/组 × ' + o.families + ' 个 seed 家族 · 标准误 ≈ ' + se(o.games).toFixed(3) + '）');
  console.log('            ' + pairs.map(([x, y]) => (x + 'v' + y).padStart(28)).join(''));
  for (const vn of Object.keys(variants)) {
    const row = pairs.map(([x, y]) =>
      Array.from({ length: o.families }, (_, f) => acc[vn + '|' + x + 'v' + y + '|' + f].score.toFixed(3)).join(' ').padStart(28)
    ).join('');
    console.log(vn.padEnd(12) + row);
  }
  console.log('（' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
  console.log('读法：**跨度**（5v1）才是这张表的产品诉求 —— 五级是五个棋手角色，跨度不够就是');
  console.log('      「五个头像共用一种棋风」。相邻级只要单调即可，两个相邻角色接近五五开是对的。');
  return acc;
}

// ════════ ⭐⭐ 让子：它**真的**改变胜负分布吗（DESIGN §6.7 · P2c Task 1 的验收）════════
//
// ⛔⛔ 这一节存在的全部理由：**「盘上多了两枚子」不是验收。** 让子是给 5 岁孩子和家长
//   打得有来有回用的；「有来有回」是一个**胜率**上的断言，只有蒙特卡洛答得了。
//
// ⭐ 四个（可选五个）对照档，缺一个结论就说不干净：
//   · `h0-alt` 让 0 子 · 先后手各半  —— 与 DESIGN §3.1 那张阶梯表**同口径**的基线
//   · `h0-ai`  让 0 子 · AI 恒先手   —— ⭐ **把「先手」那一半减掉的对照组**：让子局里 AI 恒先手，
//                                      少了这一档，「让 1 子涨了 N 个点」里就分不清哪些是子、
//                                      哪些只是「参考玩家从此恒后手」
//   · `h1` / `h2` 产品的两档（HANDICAP_COLS）
//   · `h2@3,3` ⭐ A/B：让 2 子**叠中列**。产品选了分放两列（[2,4]），⛔ 但那个选择必须有数据 ——
//              「叠中列强得离谱」在实测之前只是一句猜想。
//
// ⚠ 只跑轻松档（1-5 级）：求解器档根本不许让子（让子局面在开局库里 100% 落空 ⇒ §9.2 的断崖，
//   一手要几秒到几十分钟）。⛔ 别拿 `--tiers=12` 来跑这个模式，它会「看起来挂住了」。
// ⚠ 标签由**实际摆的格子**现算（⛔ 别写死字符串：改一次 HANDICAP_COLS 就会出现
//   「表头写着 [2,4]、量的是 [3,3]」——数字全对、结论全错，且没有一处会报错。实锤过一次）。
const HCAP_ALT = [3, 2];   // A/B 那一档的默认备选摆法（`--hcols=` 可覆盖）
const HCAP_CASES = [
  { id: 'h0-alt', label: '让0子·交替先手', pre: [], aiFirst: false },
  { id: 'h0-ai',  label: '让0子·AI恒先手', pre: [], aiFirst: true  },
  { id: 'h1',     pre: null, aiFirst: true, hc: 1 },
  { id: 'h2',     pre: null, aiFirst: true, hc: 2 },
  { id: 'h2c',    pre: HCAP_ALT, aiFirst: true, ab: true }
];
const Z95 = 1.959964;

async function modeHandicap(o) {
  const tiers = o.tiers || [1, 3, 5];
  const cases = HCAP_CASES.map(c => {
    // ⭐ 产品的两档一律从 C4State.HANDICAP_COLS 取（⛔ 别在本文件写死格子：
    //   那张表一调，这里就会静默地继续量旧格子）。`--hcols=` 只覆盖 A/B 那一档。
    const pre = c.hc ? St.HANDICAP_COLS[c.hc].slice() : ((c.ab && o.hcols) ? o.hcols : c.pre);
    const label = c.label || ((c.ab ? 'A/B 备选 让' : '让') + pre.length + '子 [' + pre.join(',') + ']');
    return Object.assign({}, c, { pre: pre, label: label });
  });
  const jobs = [];
  for (const t of tiers) {
    for (const c of cases) {
      jobs.push({
        id: 't' + t + '|' + c.id, kind: 'ref', tier: t, from: 0, to: o.games,
        seedBase: o.seedBase, solid: o.ref === 'solid', pre: c.pre, aiFirst: c.aiFirst
      });
    }
  }
  const t0 = Date.now();
  const acc = collect(await runParallel(jobs, o), jobs.map(j => j.id));
  const wall = (Date.now() - t0) / 1000;

  console.log('\n⭐⭐ 让子（DESIGN §6.7）对胜负分布的影响 · 参考玩家[' + o.ref + '] · '
    + o.games + ' 局/格 · seed ' + o.seedBase);
  console.log('   ⚠ 让子局里 **AI 恒先手**（弱方既拿子又先走 = 双重优势）⇒ 必须对照 h0-ai 那一行读。');
  console.log('   ⚠ 区间是 95% CI，标准误由**实测方差**算（⛔ 不是 0.5/√n 那个上界）。\n');
  console.log('级别  对照档                    参考玩家 胜/和/负        得分率   95% CI              vs 让0子·AI先手');
  const rows = [];
  for (const t of tiers) {
    const base = acc['t' + t + '|h0-ai'];
    for (const c of cases) {
      const a = acc['t' + t + '|' + c.id];
      const lo = a.score - Z95 * a.se, hi = a.score + Z95 * a.se;
      let delta = '';
      if (c.id !== 'h0-ai') {
        const d = a.score - base.score;
        const sed = Math.sqrt(a.se * a.se + base.se * base.se);
        // ⭐ 「显著」= 差值的 95% CI 不跨 0。⛔ 别用「点估计涨了」当结论（那是本仓的老毛病）。
        const sig = Math.abs(d) > Z95 * sed;
        delta = (d >= 0 ? '+' : '') + d.toFixed(3) + ' ±' + (Z95 * sed).toFixed(3)
          + (sig ? (d > 0 ? '  ⭐显著上升' : '  ⚠显著下降') : '  （不显著）');
      }
      console.log(String(t).padStart(3) + '   ' + c.label.padEnd(24)
        + (a.wins + '/' + a.draws + '/' + a.losses).padEnd(20)
        + a.score.toFixed(3)
        + ('[' + lo.toFixed(3) + ', ' + hi.toFixed(3) + ']').padStart(20) + '  ' + delta);
      rows.push({ tier: t, id: c.id, score: a.score, se: a.se, n: a.n,
                  base: base.score, baseSe: base.se });
    }
    console.log('');
  }
  console.log('（' + wall.toFixed(1) + 's · ' + o.workers + ' worker）');
  return { gate: handicapGate(o, rows) };
}

// ⭐ 实测基线（2026-08-02，`npm run sim:c4:handicap` · 20,000 局/格 · seed 20260801 ·
//   参数表指纹 da3c3d1d · 出厂 HANDICAP_COLS = [] / [3] / [3,3]）。**参考玩家得分率**：
//
//   级别            1      2      3      4      5
//   让0子·交替    .889   .806   .687   .598   .513     ← 与 DESIGN §3.1 那张阶梯表同口径
//   让0子·AI先手  .856   .752   .623   .531   .451     ← ⭐ 让子局的**同口径基线**
//   让1子 [3]     .934   .883   .785   .715   .661
//   让2子 [3,3]   .972   .946   .886   .839   .775
//   （solid 尺子上同一组：让0子·AI先手 .914/.835/.729/.642/.562 →
//     让1子 .969/.935/.869/.807/.752 → 让2子 .990/.977/.939/.905/.855）
//
//   ⭐ 读法：**每加一枚子，弱方的得分率抬约 +0.1 ~ +0.2**，且两把尺子上都单调。
//     产品话术：第 5 级（轻松档顶）上「让 0 子 .451 → 让 1 子 .661 → 让 2 子 .775」——
//     一个打不过家长的孩子，让两子之后**明显占上风**，这正是 §6.7 要的「有来有回」。
//   ⚠ **如实记一笔**：第 1 级 + 让 2 子在 solid 尺子上是 **.990**（19803/13/184）——
//     那不是「必胜」（还有 184 局是输的），但已经接近。⛔ 别把它当 bug 修：
//     「最弱的一档 + 最大的让子」本来就是给 4-5 岁孩子的那个角落，压倒性正是它的用途。
//
// ⭐ 退出码门禁：**让子必须真的改变胜负分布**（⛔ 不是「盘上多了两枚子」）。
//   判据 = 每一个跑到的级别上，`h1` 与 `h2` 相对 `h0-ai` 的**差值 95% CI 不跨 0 且为正**。
//   ⚠ 局数不够就只打印不裁决（与 ladderGate 同一条纪律：判不动就别假装判了）。
//   ⛔ 红了别改判据 —— 先确认是不是真把让子做没了（最常见的两种：`pre` 没进存档就被
//     boardOf 忽略；或 UI 把让子静默降成 0）。
function handicapGate(o, rows) {
  const fails = [];
  if (o.games < 400) {
    console.log('\n⚠ 门禁跳过：--games=' + o.games + ' < 400，判不动');
    return { ok: true, fails: [] };
  }
  for (const r of rows) {
    if (r.id !== 'h1' && r.id !== 'h2') continue;
    const d = r.score - r.base;
    const half = Z95 * Math.sqrt(r.se * r.se + r.baseSe * r.baseSe);
    if (!(d - half > 0)) {
      fails.push('第 ' + r.tier + ' 级 ' + r.id + '：得分率 ' + r.score.toFixed(3)
        + ' vs 让0子·AI先手 ' + r.base.toFixed(3) + '，差 ' + d.toFixed(3) + ' ±' + half.toFixed(3)
        + ' ⇒ **没有显著上升**（让子没起作用，或者起的作用小到玩家感觉不到）');
    }
  }
  if (fails.length) {
    console.log('\n⛔ 让子门禁未通过（' + fails.length + ' 条）：');
    for (const f of fails) console.log('   · ' + f);
    return { ok: false, fails: fails };
  }
  console.log('\n✅ 让子门禁通过：每一级上让 1 子 / 让 2 子都**显著**高于同口径基线（差值 95% CI 不跨 0）');
  return { ok: true, fails: [] };
}

// ════════ ⭐⭐ 儿童档：它**真的**比第 1 级更弱吗，还是已经「坏了」（DESIGN §6.7 · P2c Task 2）════════
//
// ⛔⛔ 这一节存在的全部理由和让子那节同源：**「界面上多了一个儿童档按钮」不是验收。**
//   「AI 明显放水」是一个**胜率**上的断言，只有蒙特卡洛答得了；而「放水」与「坏了」之间
//   那条线（DESIGN §3.1 护栏②）也只有数字划得出来。
//
// ⭐ 五个对照档，缺一个结论就说不干净：
//   · `t1-alt`  第 1 级 · 让0子 · **交替先手** —— 与 DESIGN §3.1 那张阶梯表**同口径**的基线，
//                                                「儿童档比第 1 级更弱」比的就是它
//   · `kids0`   儿童档 · 让0子（**孩子恒先手**）—— ⭐ 把儿童档自己那个旋钮**单独**量出来：
//                                                这一格与 t1-alt 的差**只有先手**这一件事
//   · `kids1`   儿童档 · 让1子（孩子恒先手）—— **产品默认**（C4State.KIDS_HANDICAP）
//   · `kids2`   儿童档 · 让2子（孩子恒先手）—— 「最弱档 + 最大让子」那个角落
//   · `h1-ai`   让1子 · **AI 先手**（T1 那一档）—— 与 kids1 只差先手 ⇒ 两个旋钮各值多少一目了然
//
// ⚠ 儿童档恒第 1 级（C4State.KIDS_TIER），但 `--tiers=` 仍然放行：把同一组对照跑在第 3/5 级上
//   能看出「先手 + 让子」这两个旋钮的收益随对手变强怎么衰减 —— ⛔ 但产品只认第 1 级那一行。
const KIDS_CASES = [
  { id: 'alt',   label: '让0子·交替先手（本级阶梯基线）', hc: 0, refFirst: false },
  { id: 'kids0', label: '儿童档·让0子（孩子先手）', hc: 0, refFirst: true },
  { id: 'kids1', label: '儿童档·让1子（孩子先手）', hc: 1, refFirst: true },
  { id: 'kids2', label: '儿童档·让2子（孩子先手）', hc: 2, refFirst: true },
  { id: 'h1-ai', label: '让1子·AI先手（T1 口径）', hc: 1, refFirst: false, aiFirst: true }
];
// ⭐⭐ **锚点是「第 1 级 · 让0子 · 交替先手」，固定不动**（⛔ 不随 --tiers 变）：
//   产品的断言是「儿童档比**第 1 级**更弱」，而 `--tiers=1-5` 时每一级都有自己的阶梯基线 ——
//   拿本级基线当锚会让第 3 级的儿童档去和「第 3 级」比，**表头写着第 1 级、量的是第 3 级**，
//   数字全对、结论全错，且没有一处会报错（同 modeHandicap 那条「标签由实际格子现算」的教训）。
const KIDS_ANCHOR_TIER = 1;
/** ⭐ 目标**定在校准之前**（理由三条写在 state.js 的 KIDS_HANDICAP 上方）：
 *  儿童档开箱在 basic 上 ≥ .93，且两把尺子都 < .99、绝不 1.000。 */
const KIDS_TARGET_BASIC = 0.93;
const KIDS_CEILING = 0.99;

async function modeKids(o) {
  const tiers = o.tiers || [St.KIDS_TIER];
  const cases = KIDS_CASES.map(c => Object.assign({}, c, { pre: St.HANDICAP_COLS[c.hc].slice() }));
  const jobs = [];
  const mk = (id, t, c) => ({
    id: id, kind: 'ref', tier: t, from: 0, to: o.games,
    seedBase: o.seedBase, solid: o.ref === 'solid',
    pre: c.pre, aiFirst: !!c.aiFirst, refFirst: !!c.refFirst
  });
  // 固定锚点（第 1 级 · 让0子 · 交替先手）—— ⚠ 即使 --tiers 里没有第 1 级也要跑
  jobs.push(mk('anchor', KIDS_ANCHOR_TIER, cases[0]));
  for (const t of tiers) {
    for (const c of cases) jobs.push(mk('t' + t + '|' + c.id, t, c));
  }
  const t0 = Date.now();
  const acc = collect(await runParallel(jobs, o), jobs.map(j => j.id));
  const wall = (Date.now() - t0) / 1000;

  const base = acc['anchor'];
  console.log('\n⭐⭐ 儿童档（DESIGN §6.7）· 参考玩家[' + o.ref + '] · ' + o.games + ' 局/格 · seed ' + o.seedBase);
  console.log('   ⚠ 儿童档里 **孩子恒先手**（连让子局也不让给强方）—— 与产品的 newGame 逐字一致。');
  console.log('   ⚠ 区间是 95% CI，标准误由**实测方差**算。');
  console.log('   ⭐ 锚点 = **第 ' + KIDS_ANCHOR_TIER + ' 级 · 让0子 · 交替先手** = '
    + base.score.toFixed(3) + '（固定，⛔ 不随 --tiers 变）\n');
  console.log('级别  对照档                            参考玩家 胜/和/负        得分率   95% CI              vs 第1级锚点');
  const rows = [];
  for (const t of tiers) {
    for (const c of cases) {
      const a = acc['t' + t + '|' + c.id];
      const lo = a.score - Z95 * a.se, hi = a.score + Z95 * a.se;
      let delta = '';
      if (!(t === KIDS_ANCHOR_TIER && c.id === 'alt')) {
        const d = a.score - base.score;
        const sed = Math.sqrt(a.se * a.se + base.se * base.se);
        const sig = Math.abs(d) > Z95 * sed;
        delta = (d >= 0 ? '+' : '') + d.toFixed(3) + ' ±' + (Z95 * sed).toFixed(3)
          + (sig ? (d > 0 ? '  ⭐显著更弱' : '  ⚠显著更强') : '  （不显著）');
      }
      console.log(String(t).padStart(3) + '   ' + c.label.padEnd(32)
        + (a.wins + '/' + a.draws + '/' + a.losses).padEnd(20)
        + a.score.toFixed(3)
        + ('[' + lo.toFixed(3) + ', ' + hi.toFixed(3) + ']').padStart(20) + '  ' + delta);
      rows.push({ tier: t, id: c.id, score: a.score, se: a.se, n: a.n, losses: a.losses,
                  base: base.score, baseSe: base.se });
    }
    console.log('');
  }
  console.log('（' + wall.toFixed(1) + 's · ' + o.workers + ' worker）');
  return { gate: kidsGate(o, rows) };
}

/**
 * ⭐ 退出码门禁 —— 三条，各自独立可失败：
 *   ① **比第 1 级更弱**：产品默认那一格（kids{KIDS_HANDICAP}）相对 `t1-alt` 的差值 95% CI
 *      不跨 0 且为正。⛔ 不是「点估计涨了」。
 *   ② ⭐⭐ **仍然不是「坏了」**（DESIGN §3.1 护栏②）：得分率必须 < KIDS_CEILING，
 *      **且真的输过至少一局**。「它必须仍然偶尔赢」是产品要求，不是统计洁癖 ——
 *      一个从不赢的对手，孩子三局之内就会发现，那比赢不了更伤。
 *   ③ **目标**（只在 basic 尺子上裁决，见 KIDS_TARGET_BASIC）：≥ .93。
 * ⛔ 红了别改判据也别改目标 —— 先确认是不是儿童档的两个旋钮（先手 / 让子）真的接上了。
 */
function kidsGate(o, rows) {
  const fails = [];
  if (o.games < 400) {
    console.log('\n⚠ 门禁跳过：--games=' + o.games + ' < 400，判不动');
    return { ok: true, fails: [] };
  }
  const defId = 'kids' + St.KIDS_HANDICAP;
  for (const r of rows) {
    if (r.tier !== St.KIDS_TIER) continue;         // 产品只认第 1 级那一行
    if (r.id !== defId) continue;
    const d = r.score - r.base;
    const half = Z95 * Math.sqrt(r.se * r.se + r.baseSe * r.baseSe);
    if (!(d - half > 0)) {
      fails.push('① 儿童档默认档（' + defId + '）得分率 ' + r.score.toFixed(3) + ' vs 第 1 级基线 '
        + r.base.toFixed(3) + '，差 ' + d.toFixed(3) + ' ±' + half.toFixed(3)
        + ' ⇒ **没有显著更弱**（儿童档的两个旋钮没接上，或收益小到孩子感觉不到）');
    }
    if (!(r.score < KIDS_CEILING) || !(r.losses > 0)) {
      fails.push('② ⭐ 儿童档得分率 ' + r.score.toFixed(3) + '（输 ' + r.losses + ' 局 / ' + r.n
        + '）⇒ 越过 ' + KIDS_CEILING + ' 或一局都没输过 —— 那不是「放水」是「坏了」（护栏②）');
    }
    if (o.ref === 'basic' && !(r.score >= KIDS_TARGET_BASIC)) {
      fails.push('③ 儿童档在 basic 上只有 ' + r.score.toFixed(3) + '，够不着**校准前就定下**的目标 '
        + KIDS_TARGET_BASIC + ' ⇒ ⛔ 别改目标，改 C4State.KIDS_HANDICAP（或如实报告够不着）');
    }
  }
  if (!rows.some(r => r.tier === St.KIDS_TIER && r.id === defId)) {
    console.log('\n⚠ 门禁跳过：这一轮没跑第 ' + St.KIDS_TIER + ' 级的 ' + defId + ' 那一格');
    return { ok: true, fails: [] };
  }
  if (fails.length) {
    console.log('\n⛔ 儿童档门禁未通过（' + fails.length + ' 条）：');
    for (const f of fails) console.log('   · ' + f);
    return { ok: false, fails: fails };
  }
  console.log('\n✅ 儿童档门禁通过：① 显著弱于第 1 级 · ② 仍然会赢（不是「坏了」）· ③ 打到了校准前定下的目标');
  return { ok: true, fails: [] };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.mode === 'weights') o.needBook = false;
  // ⚠ 儿童档恒第 1 级（轻松档，一次求解器都不调）⇒ 不必有开局库。⛔ 同 handicap，硬传求解器档进来仍要真。
  if (o.mode === 'kids') o.needBook = (o.tiers || [St.KIDS_TIER]).some(t => t >= AI.SOLVER_FROM);
  // ⚠ 让子只跑轻松档（1-5 级，一次求解器都不调）⇒ 不必有开局库，一局几十微秒。
  //   ⛔ 但若有人硬传求解器档进来，needBook 仍要为真，否则它会「看起来挂住」而不是当场炸。
  if (o.mode === 'handicap') o.needBook = (o.tiers || [1, 3, 5]).some(t => t >= AI.SOLVER_FROM);
  console.log('sim-ai · mode=' + o.mode + ' · ref=' + o.ref + ' · workers=' + o.workers + ' · seed=' + o.seedBase
    + ' · 参数表指纹 ' + AI.paramsDigest().hash);
  if (o.mode === 'ladder') return (await modeLadder(o)).gate;
  else if (o.mode === 'sweep') { await modeSweep(o); return null; }
  else if (o.mode === 'weights') { await modeWeights(o); return null; }
  else if (o.mode === 'handicap') return (await modeHandicap(o)).gate;
  else if (o.mode === 'kids') return (await modeKids(o)).gate;
  else throw new Error('不认识的 --mode=' + o.mode + '（ladder | sweep | weights | handicap | kids）');
}

if (isMainThread && require.main === module) {
  // ⭐ **退出码即结论**（DESIGN §10 / 本仓铁律，与 tools/test-truth.js 同一条纪律）：
  //   0 = 阶梯还是那条阶梯 · 1 = 门禁不过或跑挂了。⛔ 别退回无条件 exit(0)：
  //   那样 `npm run sim:c4` 挂进 CI 之后**永远是绿的**，而它守的是「20 级阶梯真的是 20 级」。
  //   ⚠ sweep / weights 是**探索**模式（没有基线可比），它们返回 null ⇒ 恒 0，这是有意的。
  main()
    .then(g => process.exit(g && g.ok === false ? 1 : 0))
    .catch(e => { console.error(e); process.exit(1); });
}
// ⛔ 这里原本有一行 `module.exports = { refMove, playVsRef, playAiVsAi, REF_W, W_ARITH }` ——
//   **死导出，已删**（全仓零 require：worker 走的是 `new Worker(__filename, {workerData})`，
//   那是重新执行整个文件，不是 require）。留着的害处不是占地方，是它**看起来是被支持的 API**：
//   下一个人会以为可以 require 进来复用参考玩家，而 refMove 依赖本文件的模块级状态与
//   workerData 约定，require 进去大概率静默拿到错的尺子 —— 而尺子错了，本文件所有数字全废。
//   ⇒ 真要复用，先给它写消费者和测试，再连同这段注释一起删。
//   （同源纪律：bitboard.js 明确不导出 maskOf，也是「没有非它不可的用途就不导出」。）
