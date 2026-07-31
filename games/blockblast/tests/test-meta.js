const assert = require('assert');
const Core = require('../js/core.js');
const Dealer = require('../js/dealer.js');
const Ach = require('../js/achievements.js');
const Themes = require('../js/themes.js');
const Daily = require('../js/daily.js');

// ════════ 成就：数据表驱动，绝不给数值加成 ════════
{
  assert(Ach.total() >= 30, `至少 30 条成就，实际 ${Ach.total()}`);
  const ids = Ach.ACHIEVEMENTS.map(a => a.id);
  assert.strictEqual(new Set(ids).size, ids.length, '成就 id 唯一（id 一旦发布不能改，存档里存的就是它）');
  assert(Ach.ACHIEVEMENTS.every(a => typeof a.need === 'function'), '判定是数据表里的纯函数');
  assert(Ach.ACHIEVEMENTS.every(a => a.cat === 'cum' || a.cat === 'run'));
  // ⚠ 成就里不许有任何「加成」字段 —— 永久数值加成会毁掉分数的可比性（同 seed 的分必须人人可比）
  assert(Ach.ACHIEVEMENTS.every(a => !('bonus' in a) && !('buff' in a) && !('reward' in a)),
    '成就绝不给数值加成');
  console.log(`test-meta: ${Ach.total()} 条成就，结构 OK`);
}

// ════════ 成就结算：累计 + 单局 ════════
{
  const p = Ach.emptyProfile();
  const s = Core.newGame(1);
  s.score = 1200;
  s.stats = { turns: 60, lines: 30, sweeps: 1, deeps: 0, perfects: 0, maxStreak: 5, bestL: 2 };

  const fresh = Ach.settle(p, s);
  assert(fresh.includes('score1k'), '单局 1200 分 → score1k');
  assert(fresh.includes('streak5'), 'maxStreak 5 → streak5');
  assert(fresh.includes('streak3'), '低档也一起解锁');
  assert(fresh.includes('sweep1'), '触发过 SWEEP');
  assert(!fresh.includes('score3k'), '没到 3000 分');
  assert(!fresh.includes('streak7'), 'streak 没到 7');
  assert(!fresh.includes('perfect1'), '没有 PERFECT');
  assert.strictEqual(p.turns, 60, '累计落子');
  assert.strictEqual(p.games, 1);

  // 再打一局：已解锁的不重复
  const again = Ach.settle(p, s);
  assert(!again.includes('score1k'), '已解锁的不再重复上报');
  assert.strictEqual(p.games, 2);
  assert.strictEqual(p.turns, 120, '累计继续加');
  console.log('test-meta: 成就结算（单局 + 累计 + 不重复）OK');
}

// ════════ 皮肤：靠星星解锁；且**绝不影响规则** ════════
{
  assert(Themes.THEMES.length >= 4);
  assert.strictEqual(Themes.THEMES[0].stars, 0, '默认皮肤免费');
  assert(Themes.THEMES.every(t => /^#[0-9a-f]{6}$/i.test(t.bg1)), '颜色是合法 hex（不许有全角字符等脏数据）');
  assert(Themes.THEMES.every(t => t.blocks.length === 7 && t.blocks.every(c => /^#[0-9a-f]{6}$/i.test(c))));
  assert.strictEqual(Themes.unlockedList(0).length, 1, '0 星 0 盘只有默认皮肤');
  assert(Themes.unlockedList(15).length >= 2, '15 星解锁第二套');
  const starThemes = Themes.THEMES.filter(t => !t.coins && t.games == null);
  assert.strictEqual(Themes.unlockedList(999).length, starThemes.length,
    '星够多解锁全部**星星皮肤**（金币/盘数是另两条赛道）');
  const paidIds = Themes.THEMES.filter(t => t.coins).map(t => t.id);
  assert.strictEqual(Themes.unlockedList(999, paidIds, 999).length, Themes.THEMES.length,
    '星星 + 已购 + 盘数 ⇒ 全解锁');
  // 盘数皮肤（很容易收集）：2 盘就开第一套，阶梯全部 ≤40 盘
  const gameThemes = Themes.THEMES.filter(t => t.games != null);
  assert(gameThemes.length >= 10, `盘数皮肤 ≥10 套（现 ${gameThemes.length}）`);
  assert(Math.min(...gameThemes.map(t => t.games)) <= 2, '最早 2 盘就开新皮肤');
  assert(Math.max(...gameThemes.map(t => t.games)) <= 40, '最迟 40 盘全开（很容易收集）');
  const gt = gameThemes[0];
  assert(!Themes.isUnlocked(gt, 999, [], gt.games - 1), '差一盘不开');
  assert(Themes.isUnlocked(gt, 0, [], gt.games), '盘数够就开（与星星/金币无关）');
  // ⚠ 主题里绝不能有随机/时间相关的东西（否则同一盘面每帧长得不一样 —— snake 实踩）
  // 只扫**真实代码**：注释里提到这些词是正常的（第一版这条断言就误伤了自己的注释）
  const raw = require('fs').readFileSync(require('path').join(__dirname, '../js/themes.js'), 'utf8');
  const code = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/Math\.random|Date\.now|new Date/.test(code), '主题必须确定性：代码里禁 Math.random / Date');
  console.log(`test-meta: ${Themes.THEMES.length} 套皮肤，解锁门槛 OK`);
}

// ════════ 每日任务：确定性、进度、完成、跨天重置 ════════
{
  const Quests = require('../js/quests.js');
  const day = 20500;
  const a = Quests.todays(day), b = Quests.todays(day);
  assert.deepStrictEqual(a, b, '同一天全球同一组任务（确定性）');
  assert.strictEqual(a.length, 3);
  assert.strictEqual(new Set(a.map(q => q.t)).size, 3, '3 个任务类型互不相同');
  assert.notDeepStrictEqual(Quests.todays(day + 1).map(q => q.t + q.target),
    a.map(q => q.t + q.target), '隔天任务不同（极小概率撞，撞了换个 day 数字）');

  const p = { };
  // 找一个 sum 型任务喂进度
  const sumQ = a.find(q => q.mode === 'sum');
  let done = [];
  for (let i = 0; i < sumQ.target; i++) done = done.concat(Quests.bump(p, day, sumQ.t, 1));
  assert.strictEqual(done.length, 1, '攒满目标恰好完成一次');
  assert.deepStrictEqual(Quests.bump(p, day, sumQ.t, 99), [], '完成后不重复发');
  const st = Quests.status(p, day);
  assert(st.find(q => q.t === sumQ.t).done, 'status 反映完成态');
  // max 型：低值不倒退
  const maxQ = a.find(q => q.mode === 'max');
  if (maxQ) {
    Quests.bump(p, day, maxQ.t, maxQ.target - 1);
    Quests.bump(p, day, maxQ.t, 1);
    assert.strictEqual(Quests.status(p, day).find(q => q.t === maxQ.t).prog, maxQ.target - 1, 'max 型取最大不累加');
  }
  // 跨天重置
  Quests.ensure(p, day + 1);
  assert.strictEqual(p.quests.day, day + 1);
  assert.deepStrictEqual(p.quests.done, [], '新的一天进度清零');
  console.log('test-meta: 每日任务 OK');
}

// ════════ 连续奖励阶梯 + 金币补签 ════════
{
  const Daily = require('../js/daily.js');
  const p = { dailyStreak: 0, dailyBest: {} };
  p.dailyStreak = 3;
  const m3 = Daily.streakReward(p);
  assert(m3 && m3.days === 3, '3 天里程碑触发');
  assert(!Daily.streakReward(p), '同一档只发一次');
  p.dailyStreak = 7;
  assert(Daily.streakReward(p).days === 7, '7 天档接着发');
  p.dailyStreak = 1; p.streakRewardedAt = 0;             // 断签重置（settleDaily 负责清零）
  p.dailyStreak = 3;
  assert(Daily.streakReward(p).days === 3, '断签后 3 天档可再拿（阶梯从头再来）');

  // 补签：恰好漏 1 天才给机会；花 100 币接回 prev+1
  const p2 = { dailyStreak: 5, dailyDays: 5, lastDaily: 1000, dailyBest: {} };
  const d = new Date(2026, 6, 31);
  p2.lastDaily = Daily.dayNo(d) - 2;                     // 恰好漏了昨天
  const r = Daily.settleDaily(p2, d, 900);
  assert.strictEqual(r.broken, 5, '断签时报告之前的连续天数');
  assert.strictEqual(p2.dailyStreak, 1, '未补签前 streak 归 1');
  const w = { coins: 150 };
  assert(Daily.repairStreak(p2, w, r.broken, Daily.REPAIR_COST), '金币够 → 补签成功');
  assert.strictEqual(p2.dailyStreak, 6, '接回 5+1=6 天');
  assert.strictEqual(w.coins, 50, '扣 100 币');
  // ⛔ 经济漏洞回归（code review 抓到）：补签必须恢复里程碑水位——
  //    否则「故意断签→补签→重拿已领档位」每轮净赚
  assert.strictEqual(p2.streakRewardedAt, 3, '补签恢复里程碑水位到 ≤6 的最高档(3)');
  assert(!Daily.streakReward(p2), '已领过的 3 天档不再发');
  p2.dailyStreak = 7;
  assert.strictEqual(Daily.streakReward(p2).days, 7, '但 7 天档照常能拿（水位只封已过的档）');
  assert(!Daily.repairStreak(p2, { coins: 10 }, 5, Daily.REPAIR_COST), '金币不够拒绝');
  // 漏 2 天不给机会
  const p3 = { dailyStreak: 5, lastDaily: Daily.dayNo(d) - 3, dailyBest: {} };
  assert.strictEqual(Daily.settleDaily(p3, d, 100).broken, 0, '漏 2 天以上不可补签');
  console.log('test-meta: 连续奖励阶梯 + 金币补签 OK');
}

// ════════ 天使榜（预设分数追赶）：进度由分数推导、零存档 ════════
{
  const Ghosts = require('../js/ghosts.js');
  const L = Ghosts.LADDER;
  assert(L.length >= 20, '至少 20 个角色');
  for (let i = 1; i < L.length; i++) assert(L[i].score > L[i - 1].score, '梯子严格递增');
  assert(L[0].score <= 300, '第一档几盘内就能超掉（即时爽点）');
  assert(L.every(g => g.img >= 0 && g.img < 500), '头像序号在天使画廊范围内');
  assert(L.every(g => !/player|玩家/i.test(g.name)), '⛔ 名字绝不含「玩家」（DESIGN §7 红线）');
  assert.strictEqual(Ghosts.beatenCount(0), 0);
  assert.strictEqual(Ghosts.beatenCount(201), 1, '201 分超过第一档(200)');
  assert.strictEqual(Ghosts.beatenCount(200), 0, '平分不算超过');
  assert.strictEqual(Ghosts.beatenCount(999999), L.length, '全超');
  assert.strictEqual(Ghosts.nextTarget(0).score, 200);
  assert.strictEqual(Ghosts.nextTarget(2101).score, 2600);
  assert.strictEqual(Ghosts.nextTarget(999999), null);
  const cr = Ghosts.crossed(180, 700);
  assert.deepStrictEqual(cr.map(g => g.score), [200, 400, 650], '一步跨多档全部报出');
  assert.deepStrictEqual(Ghosts.crossed(700, 700), [], '分数没动不报');
  console.log('test-meta: 天使榜 OK');
}

// ════════ 每日补玩（backfill）：只记成绩，绝不动 streak/天数/首次标记 ════════
{
  const Daily = require('../js/daily.js');
  const p = { dailyStreak: 5, dailyDays: 9, lastDaily: Daily.dayNo(new Date(2026, 6, 30)), dailyBest: {} };
  const past = new Date(2026, 6, 27);                       // 三天前的题
  const r = Daily.settleDaily(p, past, 1234, true);
  assert.strictEqual(r.first, false, '补玩永远不算「首次」（不发首次金币）');
  assert.strictEqual(p.dailyStreak, 5, '⛔ 补玩不动连续天数');
  assert.strictEqual(p.dailyDays, 9, '⛔ 补玩不动累计天数');
  assert.strictEqual(p.lastDaily, Daily.dayNo(new Date(2026, 6, 30)), '⛔ 补玩不改「最后完成日」');
  assert.strictEqual(p.dailyBest[20260727], 1234, '成绩记到**那道题的日期**上');
  Daily.settleDaily(p, past, 900, true);
  assert.strictEqual(p.dailyBest[20260727], 1234, '低分不覆盖');
  console.log('test-meta: 每日补玩不污染 streak OK');
}

// ════════ 每日谜题：同一天全球同一条块流（只有预生成块流才做得到）════════
{
  const d1 = new Date(2026, 6, 13, 8, 0, 0);
  const d2 = new Date(2026, 6, 13, 23, 59, 0);   // 同一天，另一个时刻
  const d3 = new Date(2026, 6, 14, 8, 0, 0);     // 第二天

  const a = Daily.newDaily(d1), b = Daily.newDaily(d2), c = Daily.newDaily(d3);
  assert.strictEqual(a.seed, b.seed, '同一天 = 同一个种子');
  assert.notStrictEqual(a.seed, c.seed, '换天换种子');

  // 逐块比对：真正的「同一道题」
  const seqA = Array.from({ length: 60 }, (_, i) => Dealer.stream(a.seed, i).id);
  const seqB = Array.from({ length: 60 }, (_, i) => Dealer.stream(b.seed, i).id);
  assert.deepStrictEqual(seqA, seqB, '同一天的块流**逐块相同** ⇒ 分数可比、可做榜');

  // ⚠ 而且两个人**落法不同也不影响后面的块** —— 这正是块流方案的价值
  const p1 = Daily.newDaily(d1), p2 = Daily.newDaily(d1);
  const t1 = Core.tray(p1), t2 = Core.tray(p2);
  Core.place(p1, 0, 0, 0);                                    // 玩家 1 放左上
  const pl = Core.placements(p2.board, t2[0]);
  Core.place(p2, 0, pl[pl.length - 1][0], pl[pl.length - 1][1]);  // 玩家 2 放别处
  assert.deepStrictEqual(Core.tray(p1).map(x => x && x.id), Core.tray(p2).map(x => x && x.id),
    '落法不同，剩下的块**依然一样** —— 依赖棋盘的 dealer 做不到这点');
  console.log('test-meta: 每日谜题（同一天逐块相同 + 落法不影响块流）OK');
}

// ════════ 每日连续天数：改系统时间也刷不出 streak ════════
{
  const p = Ach.emptyProfile();
  const day = n => new Date(2026, 6, n);

  let r = Daily.settleDaily(p, day(1), 500);
  assert(r.first && r.streak === 1);
  assert(Daily.playedToday(p, day(1)), '今天玩过了');

  r = Daily.settleDaily(p, day(1), 900);                 // 同一天再玩
  assert(!r.first, '同一天第二次不算新的一天');
  assert.strictEqual(p.dailyStreak, 1, 'streak 不涨');
  assert.strictEqual(p.dailyBest[Daily.dayId(day(1))], 900, '刷新当天最好成绩');

  r = Daily.settleDaily(p, day(2), 100);                 // 第二天
  assert.strictEqual(r.streak, 2, '连续 → +1');
  r = Daily.settleDaily(p, day(5), 100);                 // 跳了两天
  assert.strictEqual(r.streak, 1, '断签 → 从 1 重来');

  // 把时间往回改，不该增加任何东西
  const before = JSON.stringify(p);
  Daily.settleDaily(p, day(3), 100);                     // 回到过去
  assert.strictEqual(p.dailyStreak, 1, '往回改时间刷不出 streak');
  console.log('test-meta: 每日连续天数 + 防改时间 OK');
}

// ════════ 成就与每日/关卡打通 ════════
{
  const p = Ach.emptyProfile();
  p.levelsWon = 1; p.stars = 3;
  let fresh = Ach.check(p);
  assert(fresh.includes('lvl1'), '通关 1 关 → lvl1');
  assert(!fresh.includes('star10'), '3 星不够 star10');

  p.stars = 12;
  fresh = Ach.check(p);
  assert(fresh.includes('star10'));

  p.dailyStreak = 7;
  fresh = Ach.check(p);
  assert(fresh.includes('daily7'), '连续 7 天');
  console.log('test-meta: 成就 × 关卡/每日 联动 OK');
}
