// ════════════════════════════════════════
// daily.js — 每日谜题（DESIGN §11.2）。
//
// 这个功能**只有靠预生成块流才成立**：块流是纯函数 stream(seed, i)，
// 同一天用同一个 seed ⇒ 全球玩家拿到**逐块相同**的出块序列 ⇒ 真正的同一道题、分数可比。
// （v3 那版依赖棋盘状态的 dealer 做不到这一点：两个人第一手落法不同，后面发的块就不同了。）
//
// 防作弊（改系统时间）：本地日期只决定「今天玩哪道题」；连续天数按**日期序号**递增判断，
// 往回改时间不会增加 streak，往前跳会断签（和真实作弊收益一样是零）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Dealer = isNode ? require('./dealer.js') : root.Dealer;
  const Core = isNode ? require('./core.js') : root.Core;

  /** 日期 → 天序号（1970-01-01 起的天数），用来判「昨天/今天」*/
  const dayNo = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  /** 日期 → YYYYMMDD（既是种子，也是「哪一天」的标识）*/
  const dayId = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  /** 开今天的谜题（无尽规则 + 固定块流）*/
  function newDaily(date) {
    const s = Core.newGame(Dealer.dailySeed(date));
    s.daily = dayId(date);
    return s;
  }

  /**
   * 结算一道谜题：更新 profile 的连续天数与最好成绩。
   * backfill = 补玩过去的题（日历页入口）：**只记成绩，不动 streak/天数/首次奖励** ——
   * 否则补玩会把「连续天数」改写成过去的日期，真实的连续记录就被污染了。
   * 返回 { first: 第一次完成?, streak: 连续天数, best }
   */
  function settleDaily(profile, date, score, backfill) {
    const today = dayNo(date);
    const id = dayId(date);
    profile.dailyBest = profile.dailyBest || {};

    if (backfill) {
      const prev0 = profile.dailyBest[id] || 0;
      if (score > prev0) profile.dailyBest[id] = score;
      return { first: false, streak: profile.dailyStreak || 0, best: profile.dailyBest[id] };
    }

    const first = profile.lastDaily !== today;
    let broken = 0;                                    // 断签信息（恰好漏 1 天才可补签）
    if (first) {
      // 连续：昨天玩过 → +1；否则从 1 重新开始
      if (profile.lastDaily === today - 1) {
        profile.dailyStreak = (profile.dailyStreak || 0) + 1;
      } else {
        // 恰好漏了 1 天且之前有 ≥2 天连续 ⇒ 给「金币补签」的机会（调用方弹按钮）
        if (profile.lastDaily === today - 2 && (profile.dailyStreak || 0) >= 2) broken = profile.dailyStreak;
        profile.dailyStreak = 1;
        profile.streakRewardedAt = 0;                  // 断了 ⇒ 里程碑奖励从头再来
      }
      profile.dailyDays = (profile.dailyDays || 0) + 1;
      profile.bestDailyStreak = Math.max(profile.bestDailyStreak || 0, profile.dailyStreak);
      profile.lastDaily = today;
    }
    const prev = profile.dailyBest[id] || 0;
    if (score > prev) profile.dailyBest[id] = score;
    return { first, streak: profile.dailyStreak, best: profile.dailyBest[id], broken };
  }

  // ── 连续天数奖励阶梯（3/7/14/30 天；断签后从头再来）──
  const STREAK_MILESTONES = [
    { days: 3, coins: 50, angels: 2 },
    { days: 7, coins: 120, angels: 5 },
    { days: 14, coins: 250, angels: 10 },
    { days: 30, coins: 600, angels: 20 },
  ];

  /** 查这次 streak 有没有跨过新的里程碑（一档只发一次）。返回里程碑或 null（调用方发奖励）。*/
  function streakReward(profile) {
    const s = profile.dailyStreak || 0;
    const last = profile.streakRewardedAt || 0;
    let hit = null;
    for (const m of STREAK_MILESTONES) if (s >= m.days && m.days > last) hit = m;
    if (hit) profile.streakRewardedAt = hit.days;
    return hit;
  }

  /**
   * 金币补签：断签（恰好漏 1 天）后，花金币把连续接回来（prevStreak + 今天 = prev+1）。
   * 只在 settleDaily 返回 broken>0 的当场有效（调用方管 UI 与时效）。
   */
  function repairStreak(profile, wallet, prevStreak, cost) {
    if (!(prevStreak >= 2) || wallet.coins < cost) return false;
    wallet.coins -= cost;
    profile.dailyStreak = prevStreak + 1;
    profile.bestDailyStreak = Math.max(profile.bestDailyStreak || 0, profile.dailyStreak);
    return true;
  }

  /** 今天玩过了吗 */
  const playedToday = (profile, date) => profile.lastDaily === dayNo(date);

  const API = { dayNo, dayId, newDaily, settleDaily, playedToday,
                STREAK_MILESTONES, streakReward, repairStreak, REPAIR_COST: 100 };
  if (isNode) module.exports = API;
  else root.Daily = API;
})(typeof self !== 'undefined' ? self : this);
