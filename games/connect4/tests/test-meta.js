// ════════════════════════════════════════
// test-meta.js —— 元游戏层的门禁（P5 · DESIGN §7）。
//
// ⚠ 这一层最容易出的不是崩溃，而是**悄悄说谎的数字**：0 局时显示「胜率 0%」、
//   任务每次刷新都换一批、等级曲线和另外三款不一样。⇒ 每条都钉死。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const M = require('../js/meta.js');

// ─────────── ① 等级曲线（⚠ 与另外三款同参数）───────────
{
  assert.strictEqual(M.levelOf(0), 1, '0 XP = 1 级');
  assert.strictEqual(M.levelOf(99), 1);
  assert.strictEqual(M.levelOf(100), 2, '第一级门槛就是 XP_BASE');
  assert.ok(M.levelOf(1e9) <= M.MAX_LEVEL, '⛔ 等级必须有上限（否则界面会写出 4 位数的级）');
  // ⭐ 单调不减 + 进度条 frac 在 [0,1]
  let last = 1;
  for (let xp = 0; xp < 20000; xp += 137) {
    const lv = M.levelOf(xp);
    assert.ok(lv >= last, '⛔ 等级不许倒退（xp=' + xp + '）');
    last = lv;
    const p = M.levelProgress(xp);
    assert.strictEqual(p.lv, lv, 'levelProgress 与 levelOf 必须一致');
    assert.ok(p.frac >= 0 && p.frac <= 1, 'frac 必须在 [0,1]（xp=' + xp + ' ⇒ ' + p.frac + '）');
    assert.ok(p.cur < p.need || lv === M.MAX_LEVEL, 'cur 必须小于 need');
  }
  // 称号六档、单调
  const seen = [];
  for (let lv = 1; lv <= M.MAX_LEVEL; lv++) {
    const k = M.titleKey(lv);
    assert.ok(/^rank\.t[1-6]$/.test(k), '称号 key 形状不对：' + k);
    if (!seen.length || seen[seen.length - 1] !== k) seen.push(k);
  }
  assert.deepStrictEqual(seen, ['rank.t1', 'rank.t2', 'rank.t3', 'rank.t4', 'rank.t5', 'rank.t6'],
    '⭐ 称号必须**顺着**升上去（⛔ 别跳档、别回退）');
  console.log('test-meta: ① 等级曲线（单调 / 有上限 / 六档称号顺序）OK');
}

// ─────────── ② ⭐ XP 由既有计数器折算（⛔ 不另存一个 xp 字段）───────────
{
  assert.strictEqual(M.xpOf({}), 0, '空计数器 ⇒ 0');
  const a = M.xpOf({ games: 10, wins: 5 });
  const b = M.xpOf({ games: 10, wins: 5, winsNoHint: 3 });
  assert.ok(b > a, '⭐ 零提示赢必须额外加分（§7.8 那才是拿去炫的口径）');
  assert.ok(M.xpOf({ games: 10 }) < M.xpOf({ games: 10, wins: 1 }), '赢一局 > 只打一局');
  assert.ok(M.xpOf({ lessonsDone: 1 }) > 0, '上完一课也给 XP（课程是留存主力）');
  // ⭐ 单调：任何一个计数器变大，XP 不许变小
  const base = { games: 7, wins: 3, winsNoHint: 1, lessonsDone: 2, bestAcc: 60 };
  for (const k of Object.keys(base)) {
    const more = Object.assign({}, base); more[k] = base[k] + 1;
    assert.ok(M.xpOf(more) >= M.xpOf(base), '⛔ ' + k + ' 变大之后 XP 反而变小了');
  }
  console.log('test-meta: ② ⭐ XP 由计数器折算（单调 / 零提示额外加）OK');
}

// ─────────── ③ ⛔⛔ 0 局时胜率是 **null**，不是 0% ───────────
// 「还没打过」与「一局没赢过」是两件事 —— 显示成 0% 就是编出来的信息（§2.4 的同一条纪律）。
{
  const s0 = M.stats({});
  assert.strictEqual(s0.rate, null, '⛔⛔ 0 局 ⇒ rate 必须是 null（不是 0）');
  assert.strictEqual(s0.noHintRate, null);
  assert.strictEqual(s0.games, 0);
  const s1 = M.stats({ games: 4, wins: 1, winsNoHint: 0 });
  assert.strictEqual(s1.rate, 25, '4 局 1 胜 ⇒ 25%');
  assert.strictEqual(s1.noHintRate, 0, '真的 0% 要算得出来 —— 它与 null 是两件事');
  // ⭐ 双口径：零提示胜率 ≤ 总胜率（⛔ 反过来就是口径搞反了）
  for (const st of [{ games: 10, wins: 7, winsNoHint: 3 }, { games: 3, wins: 3, winsNoHint: 3 }]) {
    const s = M.stats(st);
    assert.ok(s.noHintRate <= s.rate, '⛔ 零提示胜率不可能高于总胜率（口径搞反了）');
  }
  console.log('test-meta: ③ ⛔⛔ 0 局 ⇒ null（不是 0%）+ 双口径关系 OK');
}

// ─────────── ④ 成就：每条都挂在既有计数器上 ───────────
{
  const none = M.achievements({});
  assert.strictEqual(none.filter(a => a.got).length, 0, '空档 ⇒ 一条都没拿到');
  assert.strictEqual(M.achievedCount({}), 0);
  const some = M.achievements({ games: 100, wins: 25, bestAcc: 96, lessonsDone: 16, brilliants: 10, winsNoHint: 5 });
  assert.strictEqual(some.filter(a => a.got).length, some.length, '全部计数器拉满 ⇒ 全拿到');
  // ⭐ 顺序稳定（UI 不许跳来跳去）
  assert.deepStrictEqual(M.achievements({}).map(a => a.id), M.ACHIEVEMENTS.map(a => a.id));
  // ⭐ 每条成就的 stat 必须是**真实存在**的计数器名（⛔ 打错字 = 永远拿不到，且零报错）
  const KNOWN = ['games', 'wins', 'winsNoHint', 'bestAcc', 'brilliants', 'lessonsDone'];
  for (const a of M.ACHIEVEMENTS) {
    assert.ok(KNOWN.indexOf(a.stat) >= 0,
      '⛔ 成就 ' + a.id + ' 挂在未知计数器「' + a.stat + '」上 —— 那条会永远拿不到，且零报错');
    assert.ok(a.need > 0, '门槛必须为正');
  }
  console.log('test-meta: ④ 成就（挂既有计数器 / 顺序稳定 / 计数器名有效）OK');
}

// ─────────── ⑤ ⭐ 三档星级是**阶梯** ───────────
{
  assert.strictEqual(M.starsOf(false, false, 99), 0,
    '⛔ 没赢就是 0 星 —— 「输了但精准度 95%」由**精准度新高**兑现（§4），⛔ 不是靠星级');
  assert.strictEqual(M.starsOf(true, true, 99), 1, '用了提示 ⇒ 最多 ★1');
  assert.strictEqual(M.starsOf(true, false, 50), 2, '零提示赢 ⇒ ★2');
  assert.strictEqual(M.starsOf(true, false, 95), 3, '零提示 + 精准度 ≥95 ⇒ ★3');
  assert.strictEqual(M.starsOf(true, false, 94), 2, '94 差一点 ⇒ 仍是 ★2');
  console.log('test-meta: ⑤ ⭐ 三档星级（阶梯语义）OK');
}

// ─────────── ⑥ ⭐⭐ 每日任务：**同一天恒同一批**（⛔ 刷新不换）───────────
{
  const a = M.questsOf(20000).map(q => q.id);
  const b = M.questsOf(20000).map(q => q.id);
  assert.deepStrictEqual(a, b, '⛔⛔ 同一天必须恒是同一批任务（用 Math.random 的话刷新就换）');
  assert.strictEqual(a.length, 3, '§7.4：每日**三个**任务');
  assert.strictEqual(new Set(a).size, 3, '⛔ 三个任务不许重复');
  // 换一天要真的换（否则「每日」没有意义）
  let differ = 0;
  for (let d = 20000; d < 20030; d++) {
    if (M.questsOf(d).map(q => q.id).join() !== a.join()) differ++;
  }
  assert.ok(differ >= 20, '⭐ 不同的天要给出不同的任务组合（30 天里只有 ' + differ + ' 天不同）');
  // 进度
  const p = M.questProgress(20000, { games: 99, wins: 0 });
  assert.strictEqual(p.length, 3);
  for (const q of p) {
    assert.ok(q.cur <= q.need, '⛔ 进度不许超过门槛（那会画出 99/3 这种条）');
    assert.strictEqual(q.done, q.cur >= q.need);
  }
  // 每条任务的 stat 也必须是真实计数器
  const KNOWN = ['games', 'wins', 'winsNoHint', 'brilliants', 'dayBestAcc', 'lessonsDone'];
  for (const q of M.QUESTS) {
    assert.ok(KNOWN.indexOf(q.stat) >= 0, '⛔ 任务 ' + q.id + ' 挂在未知计数器「' + q.stat + '」上');
  }
  console.log('test-meta: ⑥ ⭐⭐ 每日任务（同一天恒同批 / 三个不重复 / 换天真的换）OK');
}

// ─────────── ⑦ dayNo：按**本地**零点分界 ───────────
{
  const t = Date.UTC(2026, 7, 6, 12, 0, 0);
  assert.strictEqual(M.dayNoOf(t), M.dayNoOf(t + 1000), '同一时刻附近同一天');
  assert.strictEqual(M.dayNoOf(t + 86400000), M.dayNoOf(t) + 1, '加一天 ⇒ dayNo +1');
  assert.ok(Number.isInteger(M.dayNoOf(t)), 'dayNo 必须是整数');
  console.log('test-meta: ⑦ dayNo（本地零点分界 / 加一天 +1）OK');
}

// ─────────── ⑧ ⛔ 源码红线：纯函数 + ⛔⛔ 一个字节都不许流进 AI ───────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'meta.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const bad of ['ConnectAI', 'Solver', 'EngineClient', 'localStorage', 'Math.random']) {
    assert.ok(code.indexOf(bad) < 0,
      '⛔ meta.js 的**代码**里出现了 "' + bad + '"。⚠ 尤其是前三个：元游戏算出来的东西'
      + '**一个字节都不许流进 AI 的决策**（§3.1 的公平承诺由跨进程指纹守着）');
  }
  assert.ok(src.indexOf('ConnectAI') >= 0 && code.indexOf('ConnectAI') < 0, '剥注释没生效');
  assert.ok(Object.isFrozen(M), 'API 必须冻结');
  console.log('test-meta: ⑧ ⛔ 源码红线（零 AI / 零存储 / 零随机）+ API 冻结 OK');
}

console.log('test-meta: 全部通过');
