// ════════════════════════════════════════
// test-kids.js —— 儿童档的门禁（DESIGN §6.7 · P2c Task 2）。
//
// §6.7：「**儿童档**：AI 明显放水、不说难懂的话、赢了大撒花、更大的字与按钮。」
//
// ⭐⭐ 本文件只回答**一个**问题，而且是这条功能最容易做砸的那一个：
//
//        「明显放水」和「它坏了」之间那条线，儿童档站在哪一边？
//
//   DESIGN §3.1 护栏②白纸黑字：**最低档也要「能连四就连、多数时候会挡」，只是挡的概率 < 1。**
//   一个退化成掷骰子的对手，孩子三局之内就会发现对面在乱下 —— **那比赢不了更伤**。
//   ⇒ 「它仍然在下棋」必须是一个**量出来的、有对照基线的**断言，⛔ 不是一句注释。
//
// ⭐ 判据三条，各自独立可失败（对照基线 = **纯随机**：在合法列里等概率乱走）：
//   ① **兑现率**：手上有当场连四时，儿童档必须 **100%** 走出来（结构性，REASON.WIN）。
//      纯随机基线只有 mates/legal ≈ 两成 ⇒ 这一条把「它连自己赢都看不见」挡在门外。
//   ② ⭐⭐ **封堵率**：对方有当场赢点时，儿童档落进「不送头的列」的比例必须**显著高于**
//      纯随机基线。⚠ 基线是**精确算**的（safe.length / legal.length 的均值），不是采样 ——
//      同一批局面上两个数直接可比，⛔ 没有统计噪声这个借口。
//   ③ ⭐ **但它不许是 1.000**：护栏②的另一半 —— 一个从不漏挡的第 1 级 AI 就不是新手了
//      （DESIGN §3.1 那条规格修订的由来：旧规格让最弱的第 1 级都强过懂规则的玩家）。
//
// ⚠⚠ ⭐⭐ **本文件的 ② 已经真的开过一次火**（这不是假设）：儿童档最初被定成「阶梯最弱的
//   第 1 级」，② 当场把它打回来 —— 第 1 级的封堵率只有 **33.9% vs 纯随机 31.7%（1.07×）**，
//   在「会不会挡」这件事上它统计上就是个随机玩家。⇒ 产品因此改成
//   **KIDS_TIER=3 + KIDS_HANDICAP=2**（「更弱」靠让子与先手，不靠让 AI 更笨），
//   全过程记在 js/state.js 的「儿童档的两个产品数值」那一节。
//
// ⚠⚠ 变异测试（本仓「加了断言但抓不住」已出现六次）：把 KIDS_TIER 那一级的 blunder 拧到 1.0
//   （= 连「按概率挡」都没有了，DESIGN §3.1 明令禁止的那条路 (a)）⇒ ② 必须当场红。
//   把它拧到 0（= 从不送头的「克制高手」）⇒ ③ 必须当场红。两头都要会响，这条断言才有牙。
//
// ⚠ 儿童档恒在**轻松档**（`C4State.KIDS_TIER` < `AI.SOLVER_FROM`）⇒ 一次求解器都不调，
//   整份文件毫秒级 —— 这既是性能也是硬约束：让子局面在开局库里 100% 落空（§9.2 的断崖）。
//   ⛔ 别为了「更全面」把求解器档也跑进来：那要开局库，而这条门禁在 `npm run test:c4` 里。
// ════════════════════════════════════════
const assert = require('assert');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const AI = require('../js/ai.js');
const St = require('../js/state.js');
const PRNG = require('../../../engine/prng.js');

const T = St.KIDS_TIER;

// ─────────── 局面工厂（照 test-ai-determinism.js 的口径：全程 PRNG，⛔ 零 Math.random）───────────
function randomPositions(n, k, seed) {
  const rnd = PRNG.create(seed);
  const out = [];
  let guard = 0;
  while (out.length < k && guard++ < 300000) {
    let bd = B.newBoard();
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (R.terminal(bd) !== null) { ok = false; break; }
      const ms = R.moves(bd);
      bd = B.play(bd, ms[Math.floor(rnd() * ms.length)]);
    }
    if (!ok || R.terminal(bd) !== null) continue;
    out.push(bd);
  }
  assert.strictEqual(out.length, k, '局面工厂没造够 ' + k + ' 个 n=' + n + ' 的局面');
  return out;
}

/** ⭐ **独立**的「不送头的列」真值 —— ⛔ 故意不复用 AI.safeMoves。
 *  理由与 test-ai-determinism.js 里那份逐字相同：拿被测对象当真值，删掉过滤会让
 *  断言和被测**一起变**，那条断言当场退化成同义反复。这里用纯函数 B.play 重写一遍。 */
function oracleSafe(bd) {
  return R.moves(bd).filter(c => R.winningMoves(B.play(bd, c)).length === 0);
}

// ════════════════════════════════════════
// ⭐⭐ 「它仍然在下棋」——三条量化判据 + 纯随机对照基线
// ════════════════════════════════════════
const stat = {
  mateN: 0, mateHit: 0, mateRand: 0,          // ① 兑现率
  blockN: 0, blockHit: 0, blockRand: 0,       // ② 封堵率
  perfectN: 0, perfectHit: 0                  // 上锚：第 20 级在同一批局面上必须 100%
};

for (const n of [4, 8, 12, 16, 20, 24, 28, 32, 36]) {
  for (const bd of randomPositions(n, 60, 31400 + n)) {
    const legal = R.moves(bd);
    const mates = R.winningMoves(bd);
    if (mates.length) {
      // ① 手上有当场连四
      for (let s = 0; s < 8; s++) {
        stat.mateN++;
        const d = AI.decide(bd, T, s);
        if (mates.indexOf(d.col) !== -1) stat.mateHit++;
        // ⚠ 纯随机基线**精确算**（⛔ 不采样）：等概率乱走时命中制胜列的概率。
        stat.mateRand += mates.length / legal.length;
        assert.strictEqual(d.reason, AI.REASON.WIN, '儿童档手上有连四却没报 WIN');
      }
      continue;
    }
    // ② 对方有当场赢点（= 有列会送头，且不是「每列都送头」那种已经输定的局面）
    const safe = oracleSafe(bd);
    if (safe.length === 0 || safe.length === legal.length) continue;
    for (let s = 0; s < 8; s++) {
      stat.blockN++;
      if (safe.indexOf(AI.decide(bd, T, s).col) !== -1) stat.blockHit++;
      stat.blockRand += safe.length / legal.length;
      // 上锚：同一个局面上第 20 级必须 100% 不送头（计数器自证有效，⛔ 不是「我数了个高分」）
      stat.perfectN++;
      if (safe.indexOf(AI.decide(bd, AI.TIER_MAX, s).col) !== -1) stat.perfectHit++;
    }
  }
}

const mateRate = stat.mateHit / stat.mateN;
const mateBase = stat.mateRand / stat.mateN;
const blockRate = stat.blockHit / stat.blockN;
const blockBase = stat.blockRand / stat.blockN;
const perfectRate = stat.perfectHit / stat.perfectN;

console.log('test-kids: 样本 —— 有制胜手 ' + stat.mateN + ' 次决策 / 必须挡 ' + stat.blockN + ' 次决策');
console.log('test-kids: ① 兑现率  儿童档 ' + (mateRate * 100).toFixed(1)
  + '%  vs 纯随机 ' + (mateBase * 100).toFixed(1) + '%');
console.log('test-kids: ② 封堵率  儿童档 ' + (blockRate * 100).toFixed(1)
  + '%  vs 纯随机 ' + (blockBase * 100).toFixed(1) + '%  （第 20 级 '
  + (perfectRate * 100).toFixed(1) + '%）');

assert.ok(stat.mateN > 200, '「有制胜手」的样本太少（' + stat.mateN + '）⇒ ① 判不动');
assert.ok(stat.blockN > 400, '「必须挡」的样本太少（' + stat.blockN + '）⇒ ② 判不动');

// ① 能连四就连 —— **结构性的 100%**（护栏②的上半句）
assert.strictEqual(mateRate, 1,
  '⛔ 儿童档没能 100% 兑现当场连四（' + (mateRate * 100).toFixed(1) + '%）'
  + ' —— 那不是「放水」，那是它连自己赢都看不见（DESIGN §3.1 护栏②）');

// ② ⭐⭐ 会挡，而且**明显比乱走会挡**（护栏②的下半句「多数时候会挡」）
//   ⚠ 阈值照实测给（本轮：儿童档 56.3% / 纯随机 31.7%，比值 **1.77**），留了余量但不宽 ——
//   ⛔⛔ 别为了让某次改动变绿把它往下调：调到 1.07 以下这条断言就再也拦不住「儿童档 = 第 1 级」
//     那个已经被它抓过一次的错，退化成一条恒绿的装饰。要动 KIDS_TIER 请先跑
//     `npm run sim:c4:kids` 看胜率有没有掉出目标区间。
assert.ok(blockRate > blockBase * 1.45,
  '⛔ 儿童档的封堵率（' + (blockRate * 100).toFixed(1) + '%）没有明显高于纯随机基线（'
  + (blockBase * 100).toFixed(1) + '%）⇒ 它已经退化成掷骰子。孩子会发现对面在乱下 ——'
  + ' 那比赢不了更伤（DESIGN §3.1 护栏②）');
assert.ok(blockRate > 0.5,
  '⛔ 儿童档「多数时候会挡」不成立（' + (blockRate * 100).toFixed(1) + '%）');

// ③ ⭐ 但它**不许**是 100% —— 从不漏挡的第 1 级就不是新手（DESIGN §3.1 的规格修订）
assert.ok(blockRate < 0.95,
  '⛔ 儿童档几乎从不漏挡（' + (blockRate * 100).toFixed(1) + '%）⇒ 它是个「克制的高手」不是新手；'
  + ' DESIGN §3.1 实测过：这样的 AI 会让最弱的一档都打赢懂规则的玩家');

// 上锚：同一个计数器在第 20 级上必须是 100%（否则 ② 那两个数只是「我数了个数」）
assert.strictEqual(perfectRate, 1,
  '第 20 级在同一批局面上也漏挡了 ⇒ 封堵率这个量本身算错了，② 的结论不作数');

// ════════════════════════════════════════
// ⭐ 儿童档的**绑定**：恒第 1 级、恒人机局、孩子恒先手（⛔ 连让子局也是）
// ════════════════════════════════════════
{
  // ⛔ **结构性**约束（⛔ 不是「必须等于 3」那种会随校准过期的断言）：儿童档必须在轻松档里，
  //   否则让子局面撞 §9.2 的断崖（开局库 100% 落空 ⇒ 每手几秒到几十分钟）。
  assert.ok(St.KIDS_TIER >= 1 && St.KIDS_TIER < AI.SOLVER_FROM,
    '儿童档必须落在轻松档（1..' + (AI.SOLVER_FROM - 1) + '）—— 求解器档不许让子（§9.2 断崖）');
  assert.ok(St.KIDS_HANDICAP >= 0 && St.KIDS_HANDICAP <= St.HANDICAP_MAX, 'KIDS_HANDICAP 越界');
  assert.strictEqual(St.handicapAllowed('ai', St.KIDS_TIER), true,
    '儿童档那一级必须允许让子（否则 KIDS_HANDICAP 开局当场抛）');

  // ⛔ 别的 tier / 双人局一律**当场抛**（⛔ 不静默改写：那会让「我选了进阶档」开出一局儿童局）
  assert.throws(() => St.newGame({ mode: 'ai', tier: St.KIDS_TIER === 1 ? 2 : 1, gameNo: 0, kids: true }),
    /儿童档恒为第/);
  assert.throws(() => St.newGame({ mode: 'ai', tier: 20, gameNo: 0, kids: true }), /儿童档恒为第/);
  assert.throws(() => St.newGame({ mode: 'human', gameNo: 0, kids: true }), /只对人机局/);
  assert.throws(() => St.newGame({ mode: 'ai', tier: 1, gameNo: 0, kids: 1 }), /布尔/);

  // ⭐⭐ 孩子恒先手，**且不逐局交替，且让子局也不让给强方**（T1 那条规则在儿童档里让位）
  for (let n = 0; n < 6; n++) {
    for (let h = 0; h <= St.HANDICAP_MAX; h++) {
      const g = St.newGame({ mode: 'ai', tier: St.KIDS_TIER, gameNo: n, kids: true, handicap: h });
      assert.strictEqual(g.humanFirst, true,
        '儿童档第 ' + n + ' 局 · 让 ' + h + ' 子：孩子必须先手（这是儿童档自己的那个放水旋钮）');
      assert.strictEqual(St.kidsOf(g), true);
      assert.strictEqual(g.pre.length, h, '让子照常生效（儿童档与让子是两个正交的旋钮）');
    }
  }
  // 反向对照：**同样的让子、不开儿童档** ⇒ T1 的「强方先手」照旧（⛔ 少了这条，上面那组
  // 可能只是「humanFirst 恒 true」之类的假绿）
  for (let h = 1; h <= St.HANDICAP_MAX; h++) {
    assert.strictEqual(
      St.newGame({ mode: 'ai', tier: St.KIDS_TIER, gameNo: 0, kids: false, handicap: h }).humanFirst,
      false, '不开儿童档时，让子局仍必须是强方先手（T1 的规则）');
  }
  // 不开儿童档、不让子 ⇒ 逐局交替（第三个方向的对照）
  assert.strictEqual(St.newGame({ mode: 'ai', tier: St.KIDS_TIER, gameNo: 1, kids: false }).humanFirst, false);

  console.log('test-kids: ⭐ 绑定 OK（恒第 ' + St.KIDS_TIER + ' 级 / 恒人机局 / 孩子恒先手，'
    + '让子局也是；不开儿童档时 T1 的强方先手照旧）');
}

// ════════════════════════════════════════
// ⭐ 存档：儿童档必须**存得住**，且坏组合一律丢弃
// ════════════════════════════════════════
{
  const g = St.newGame({ mode: 'ai', tier: St.KIDS_TIER, gameNo: 0, kids: true,
                         handicap: St.KIDS_HANDICAP, seed: 7 });
  const back = St.deserialize(St.serialize(g));
  assert.deepStrictEqual(back, g, '儿童档的存档必须逐字段无损往返');
  assert.strictEqual(back.kids, true);

  // ⛔ 缺字段 = 这份档不是我们写的 ⇒ 丢弃（⛔ 别宽容成 false：那会把一局儿童档静默读成普通局）
  const raw = JSON.parse(St.serialize(g));
  delete raw.kids;
  assert.strictEqual(St.deserialize(JSON.stringify(raw)), null, '缺 kids 字段的存档必须丢弃');
  // ⛔ 手改出来的非法组合（儿童档 + 求解器档）也必须丢弃 —— 否则手改一份档就绕过了 newGame
  const bad = JSON.parse(St.serialize(g));
  bad.kids = true; bad.tier = 12;
  assert.strictEqual(St.deserialize(JSON.stringify(bad)), null, '「儿童档 + 第 12 级」的存档必须丢弃');
  const bad2 = JSON.parse(St.serialize(g));
  bad2.kids = 'yes';
  assert.strictEqual(St.deserialize(JSON.stringify(bad2)), null, 'kids 不是布尔的存档必须丢弃');
  console.log('test-kids: ⭐ 存档往返 + 三类坏档丢弃 OK');
}

console.log('test-kids: 全部通过');
