// test-meta.js — 粘度层单测：等级/称号 · 天使榜 · 连续奖励阶梯 · 「下一个目标」
const assert = require('assert');
const M = require('../js/meta.js');

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('test-meta: ' + name + ' OK'); };

ok('等级曲线单调、锚在已校准的成就档上', () => {
  assert.strictEqual(M.levelOf(0), 1);
  assert.strictEqual(M.levelOf(-999), 1);              // 脏数据不能算出 0 级/负级
  let prev = 0;
  for (let l = 1; l <= 40; l++) {
    const need = M.xpNeed(l);
    assert.ok(need > prev, '第 ' + l + ' 级的门槛必须严格递增');
    prev = need;
  }
  // 等级要比成就密：成就第一档 totalScore=10000，那时应该已经十几级了（每次打开都在涨）
  const lv10k = M.levelOf(10000);
  assert.ok(lv10k >= 8 && lv10k <= 16, '累计 1 万分应落在 8-16 级，实际 ' + lv10k);
  // 成就顶档 500 万分时不该顶到 99 级（还有的升）
  const lv5m = M.levelOf(5000000);
  assert.ok(lv5m >= 25 && lv5m < 60, '累计 500 万分应落在 25-60 级，实际 ' + lv5m);
});

ok('称号六档、边界不跳空', () => {
  const seen = new Set();
  for (let l = 1; l <= 40; l++) seen.add(M.titleKey(l));
  assert.strictEqual(seen.size, 6, '六档称号都要够得着');
  assert.strictEqual(M.titleKey(1), M.TITLES[0]);
  assert.strictEqual(M.titleKey(4), M.TITLES[0]);
  assert.strictEqual(M.titleKey(5), M.TITLES[1]);
  assert.strictEqual(M.titleKey(25), M.TITLES[5]);
  assert.strictEqual(M.titleKey(99), M.TITLES[5]);
});

ok('XP 条进度落在 0..1，且升级瞬间归零', () => {
  for (const xp of [0, 1, 299, 300, 12345, 999999]) {
    const p = M.levelProgress(xp);
    assert.ok(p.pct >= 0 && p.pct <= 1, 'pct 越界 @' + xp + ' = ' + p.pct);
    assert.ok(p.cur >= 0 && p.cur <= p.span, 'cur 越界 @' + xp);
  }
  const need = M.xpNeed(3);
  assert.strictEqual(M.levelProgress(need).cur, 0, '刚好升级时进度应从 0 开始');
});

ok('⛔ 天使榜文案红线：全是角色名，绝不出现「玩家/player」', () => {
  // ⚠ 用**词边界**匹配，别用 includes —— 'Mei' 里含 'me'，子串匹配会把正常角色名误判
  const names = M.LADDER.map(g => g.name.toLowerCase());
  for (const bad of ['player', 'user', 'guest', '玩家', 'you', 'me', 'anon']) {
    const hit = names.filter(n => new RegExp('(^|[^a-z])' + bad + '([^a-z]|$)').test(n));
    assert.strictEqual(hit.length, 0, '榜上出现了疑似真人的字样「' + bad + '」：' + hit.join(','));
  }
  assert.strictEqual(new Set(M.LADDER.map(g => g.name)).size, M.LADDER.length, '名字不许重名');
});

ok('天使榜分数严格递增、头像序号在 500 张范围内', () => {
  let prev = -1;
  for (const g of M.LADDER) {
    assert.ok(g.score > prev, '榜位分数必须严格递增：' + g.name);
    prev = g.score;
    assert.ok(g.img >= 0 && g.img < 500, g.name + ' 的头像序号越界：' + g.img);
  }
  assert.strictEqual(M.LADDER.length, 20);
});

ok('⭐ 前两档必须几关内就能超（即时爽点），尾档是长线但可达', () => {
  // 成就第一档 totalScore=10000 ⇒ 早期量级；前两档要明显低于它
  assert.ok(M.LADDER[0].score <= 3000, '第 1 位太高，新手超不动：' + M.LADDER[0].score);
  assert.ok(M.LADDER[1].score <= 6000, '第 2 位太高：' + M.LADDER[1].score);
  // 尾档不许超过成就顶档（5,000,000）—— 榜尾不可达是坏设计
  assert.ok(M.LADDER[M.LADDER.length - 1].score <= 5000000, '榜尾超过了成就顶档 = 不可达');
});

ok('榜进度零存档：完全由累计分推导', () => {
  assert.strictEqual(M.beatenCount(0), 0);
  assert.strictEqual(M.beatenCount(2001), 1);
  assert.strictEqual(M.beatenCount(M.LADDER[4].score + 1), 5);
  assert.strictEqual(M.beatenCount(99999999), M.LADDER.length);
  assert.strictEqual(M.nextTarget(0).name, M.LADDER[0].name);
  assert.strictEqual(M.nextTarget(99999999), null, '全超完 ⇒ 没有下一个');
  // 边界：分数**正好等于**榜位分不算超过（要严格超过才算赢）
  assert.strictEqual(M.beatenCount(M.LADDER[0].score), 0);
  assert.strictEqual(M.nextTarget(M.LADDER[0].score).name, M.LADDER[0].name);
});

ok('刚刚超过谁：只报这一局跨过的那几位', () => {
  const p = M.passedBetween(1500, 12000);
  assert.deepStrictEqual(p.map(g => g.name), ['Lumi', 'Pip', 'Nella']);
  assert.strictEqual(M.passedBetween(12000, 12500).length, 0, '没跨过谁就别弹');
  assert.strictEqual(M.passedBetween(0, 0).length, 0);
});

ok('连续奖励：到档才发、发过不重发', () => {
  assert.deepStrictEqual(M.dueRewards(1, []).map(r => r.key), []);
  assert.deepStrictEqual(M.dueRewards(3, []).map(r => r.key), ['r3']);
  assert.deepStrictEqual(M.dueRewards(7, []).map(r => r.key), ['r3', 'r7'], '中途进来要补齐前面的');
  assert.deepStrictEqual(M.dueRewards(7, ['r3']).map(r => r.key), ['r7']);
  assert.deepStrictEqual(M.dueRewards(30, ['r3', 'r7', 'r14', 'r30']).map(r => r.key), []);
  assert.strictEqual(M.nextStreakReward(0).days, 3);
  assert.strictEqual(M.nextStreakReward(3).days, 7);
  assert.strictEqual(M.nextStreakReward(30), null);
});

ok('⛔ 断签→补签的刷奖循环：水位恢复了就不该重发', () => {
  // 场景：连到 7 天领过 r3/r7 → 断签（streak 归 1、水位若被清空）→ 补签接回 8 天
  // 若水位没恢复，dueRewards(8, []) 会把 r3/r7 **再发一遍** ⇒ 可复现的刷奖套路。
  assert.deepStrictEqual(M.dueRewards(8, []).map(r => r.key), ['r3', 'r7'],
    '水位为空时确实会重发——所以补签必须连水位一起恢复');
  assert.deepStrictEqual(M.dueRewards(8, ['r3', 'r7']).map(r => r.key), [],
    '水位恢复后不再重发（这就是修法）');
});

ok('「下一个目标」按优先级取最近的一个', () => {
  const base = { totalScore: 50000, questDone: 3, questTotal: 3, streakDays: 5,
                 galleryGot: 100, galleryTotal: 500, setSize: 25 };
  // 任务没做完 ⇒ 优先推任务
  assert.strictEqual(M.nextGoal({ ...base, questDone: 1 }).key, 'quests');
  // 任务做完了、连续差 2 天到下一档 ⇒ 推连续
  assert.strictEqual(M.nextGoal({ ...base, streakDays: 5 }).key, 'streak');
  // 连续刚过档、这一集差 2 张 ⇒ 推集齐
  assert.strictEqual(M.nextGoal({ ...base, streakDays: 7, galleryGot: 123 }).key, 'set');
  // 都不急 ⇒ 榜上下一个差得不远就推榜
  const g = M.nextGoal({ ...base, streakDays: 7, galleryGot: 100, totalScore: 45000 });
  assert.ok(g.key === 'ladder' || g.key === 'level');
  // 永远有目标（兜底是升级）—— 空按钮/空提示条不给人点进去的理由
  const any = M.nextGoal({ totalScore: 0, questDone: 0, questTotal: 0, streakDays: 0,
                           galleryGot: 0, galleryTotal: 500, setSize: 25 });
  assert.ok(any && any.key, '任何状态下都必须给出一个目标');
});

ok('脏存档不崩（字段缺失/类型不对）', () => {
  assert.ok(M.nextGoal({}).key);
  assert.ok(M.nextGoal(null).key);
  assert.strictEqual(M.beatenCount(undefined), 0);
  assert.strictEqual(M.beatenCount(null), 0);
  assert.ok(M.levelOf(undefined) >= 1);
  assert.deepStrictEqual(M.dueRewards(undefined, undefined), []);
});

console.log('\ntest-meta: 全部通过（' + pass + ' 组）');
