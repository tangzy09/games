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
   * 结算今天的谜题：更新 profile 的连续天数与最好成绩。
   * 返回 { first: 今天第一次完成?, streak: 连续天数 }
   */
  function settleDaily(profile, date, score) {
    const today = dayNo(date);
    const id = dayId(date);
    profile.dailyBest = profile.dailyBest || {};

    const first = profile.lastDaily !== today;
    if (first) {
      // 连续：昨天玩过 → +1；否则从 1 重新开始
      profile.dailyStreak = (profile.lastDaily === today - 1) ? (profile.dailyStreak || 0) + 1 : 1;
      profile.dailyDays = (profile.dailyDays || 0) + 1;
      profile.lastDaily = today;
    }
    const prev = profile.dailyBest[id] || 0;
    if (score > prev) profile.dailyBest[id] = score;
    return { first, streak: profile.dailyStreak, best: profile.dailyBest[id] };
  }

  /** 今天玩过了吗 */
  const playedToday = (profile, date) => profile.lastDaily === dayNo(date);

  const API = { dayNo, dayId, newDaily, settleDaily, playedToday };
  if (isNode) module.exports = API;
  else root.Daily = API;
})(typeof self !== 'undefined' ? self : this);
