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
  assert.strictEqual(Themes.unlockedList(0).length, 1, '0 星只有默认皮肤');
  assert(Themes.unlockedList(15).length >= 2, '15 星解锁第二套');
  assert.strictEqual(Themes.unlockedList(999).length, Themes.THEMES.length, '星够多全解锁');
  // ⚠ 主题里绝不能有随机/时间相关的东西（否则同一盘面每帧长得不一样 —— snake 实踩）
  // 只扫**真实代码**：注释里提到这些词是正常的（第一版这条断言就误伤了自己的注释）
  const raw = require('fs').readFileSync(require('path').join(__dirname, '../js/themes.js'), 'utf8');
  const code = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/Math\.random|Date\.now|new Date/.test(code), '主题必须确定性：代码里禁 Math.random / Date');
  console.log(`test-meta: ${Themes.THEMES.length} 套皮肤，解锁门槛 OK`);
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
