// ════════════════════════════════════════
// meta.js — 粘度层：等级/称号 · 天使榜 · 连续奖励阶梯 · 「下一个目标」。
//
// ⭐ 全部由**既有计数器**驱动（totalScore / streakDays / gallery / quests / ach），
//   **零新玩法、零新埋点** —— 这正是元游戏层能在三款产品间复用的原因。
//   纯函数 + 双导出，单测直接跑（浏览器里 window.Meta，node 里 require）。
//
// ⛔ 天使榜的文案红线（写成了单测）：榜上的名字**必须明示是游戏角色**，
//   **绝不出现「玩家」二字**。社会证明之所以有效，正因为看的人以为对面是真人 ——
//   既要虚构又要暗示真人，那就是伪造。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // ── ① 等级 / 称号（xp = 历史累计得分，现成的计数器）──
  //   曲线锚点取自已校准的成就档（totalScore 10k / 100k / 500k / 1M / 5M）：
  //   等级要比成就密得多（成就是里程碑，等级是「每次打开都在涨」的即时反馈）。
  const TITLES = ['t1', 't2', 't3', 't4', 't5', 't6'];    // 见 locales lvl.t1..t6
  /** 升到 l 级所需的累计分（几何增长，第 30 级 ≈ 500 万 = 成就顶档）*/
  function xpNeed(l) { return Math.round(300 * Math.pow(1.35, Math.max(1, l) - 1)); }
  function levelOf(xp) {
    let l = 1;
    while (l < 99 && (xp | 0) >= xpNeed(l)) l++;
    return l;
  }
  /** 六档称号：1-4 / 5-9 / 10-14 / 15-19 / 20-24 / 25+ */
  function titleKey(l) {
    const i = l >= 25 ? 5 : l >= 20 ? 4 : l >= 15 ? 3 : l >= 10 ? 2 : l >= 5 ? 1 : 0;
    return TITLES[i];
  }
  /** 当前等级的进度（0..1）+ 两端分值，画 XP 条用 */
  function levelProgress(xp) {
    const l = levelOf(xp);
    const from = l > 1 ? xpNeed(l - 1) : 0, to = xpNeed(l);
    return { level: l, from, to, cur: (xp | 0) - from, span: to - from,
             pct: Math.max(0, Math.min(1, ((xp | 0) - from) / Math.max(1, to - from))) };
  }

  // ── ② 天使榜：20 个**预设角色**（零后端伪社交；进度不存档，由 totalScore 推导）──
  //   ⛔ 名字是角色名（专有名词，十语不译）；⛔ 绝不出现「玩家/player」。
  //   分数按幂律铺：**前两档几关内必超**（即时爽点），尾部是数月长线。
  //   img = 天使画廊的图序号（头像复用现成素材，零新增）。
  const LADDER = [
    { name: 'Lumi',    score: 2000,    img: 12 },
    { name: 'Pip',     score: 5000,    img: 47 },
    { name: 'Nella',   score: 10000,   img: 88 },
    { name: 'Coco',    score: 18000,   img: 130 },
    { name: 'Yuzu',    score: 30000,   img: 171 },
    { name: 'Momo',    score: 48000,   img: 205 },
    { name: 'Sora',    score: 75000,   img: 233 },
    { name: 'Rin',     score: 110000,  img: 259 },
    { name: 'Aki',     score: 160000,  img: 284 },
    { name: 'Mika',    score: 230000,  img: 302 },
    { name: 'Noa',     score: 320000,  img: 321 },
    { name: 'Hana',    score: 440000,  img: 344 },
    { name: 'Kiri',    score: 600000,  img: 362 },
    { name: 'Suzu',    score: 800000,  img: 379 },
    { name: 'Mei',     score: 1050000, img: 398 },
    { name: 'Riko',    score: 1350000, img: 417 },
    { name: 'Tsumu',   score: 1700000, img: 436 },
    { name: 'Kanna',   score: 2100000, img: 455 },
    { name: 'Shiro',   score: 2550000, img: 474 },
    { name: 'Seraphi', score: 3000000, img: 492 },
  ];
  /** 已经超过几位（进度**零存档** —— 完全由累计分推导，改不了也不用迁移）*/
  function beatenCount(totalScore) {
    let n = 0;
    for (const g of LADDER) if ((totalScore | 0) > g.score) n++;
    return n;
  }
  /** 下一个要追的角色（全超完 ⇒ null）*/
  function nextTarget(totalScore) {
    for (const g of LADDER) if ((totalScore | 0) <= g.score) return g;
    return null;
  }
  /** 这一局结束后**刚刚**超过的那些角色（用来在局中/结算弹「你超过了 Coco」）*/
  function passedBetween(before, after) {
    return LADDER.filter(g => (before | 0) <= g.score && (after | 0) > g.score);
  }

  // ── ③ 连续奖励阶梯：3/7/14/30 天各发一次（断签清零重来）──
  //   ⭐ 单纯数天数没有动机；「熬到第 7 天有 8 张图鉴」才有。
  const STREAK_REWARDS = [
    { days: 3,  angels: 3,  key: 'r3' },
    { days: 7,  angels: 8,  key: 'r7' },
    { days: 14, angels: 15, key: 'r14' },
    { days: 30, angels: 30, key: 'r30' },
  ];
  /**
   * 这次打卡后该补发哪些里程碑（已领水位存在 daily.rewarded）。
   * ⛔ 水位必须**跟着 streak 一起恢复**：断签把水位清零、补签接回连续却不恢复水位，
   *   就有「故意断签 → 补签 → 次日重拿 7 天档」的刷奖循环（blockblast code review 抓到过）。
   */
  function dueRewards(streakDays, rewarded) {
    const got = rewarded || [];
    return STREAK_REWARDS.filter(r => (streakDays | 0) >= r.days && got.indexOf(r.key) < 0);
  }
  /** 下一个连续里程碑（全领完 ⇒ null）*/
  function nextStreakReward(streakDays) {
    return STREAK_REWARDS.find(r => (streakDays | 0) < r.days) || null;
  }

  // ── ④ 「下一个目标」：把散落各处的系统**串成打开即见的一句话** ──
  //   纯查询既有状态、零新系统。优先级 = 最近能拿到的那个。
  /**
   * @param ctx { totalScore, questDone, questTotal, streakDays, galleryGot, galleryTotal, setSize }
   * @returns {{key, params, act}|null}  key → locales goal.*；act → 点击直达的入口
   */
  function nextGoal(ctx) {
    const c = ctx || {};
    // 1) 今天的任务还没做完（最容易达成的一档）
    if ((c.questDone | 0) < (c.questTotal | 0)) {
      return { key: 'quests', params: { n: c.questDone | 0, m: c.questTotal | 0 }, act: 'quests' };
    }
    // 2) 连续天数就差 ≤2 天到下一档
    const nsr = nextStreakReward(c.streakDays);
    if (nsr && nsr.days - (c.streakDays | 0) <= 2) {
      return { key: 'streak', params: { n: nsr.days - (c.streakDays | 0), a: nsr.angels }, act: 'daily' };
    }
    // 3) 这一集就差 ≤3 张集齐（收集的短期目标永远比「攒到 500」有力）
    const size = c.setSize || 25;
    const inSet = (c.galleryGot | 0) % size;
    if (inSet !== 0 && size - inSet <= 3) {
      return { key: 'set', params: { n: size - inSet }, act: 'gallery' };
    }
    // 4) 榜上下一个角色差得不远（≤ 当前分的 25%）
    const nt = nextTarget(c.totalScore);
    if (nt && nt.score - (c.totalScore | 0) <= Math.max(1500, (c.totalScore | 0) * 0.25)) {
      return { key: 'ladder', params: { n: nt.score - (c.totalScore | 0), name: nt.name }, act: 'ladder' };
    }
    // 5) 兜底：升级还差多少分
    const lp = levelProgress(c.totalScore);
    return { key: 'level', params: { n: lp.to - (c.totalScore | 0), l: lp.level + 1 }, act: 'stats' };
  }

  const API = {
    TITLES, xpNeed, levelOf, titleKey, levelProgress,
    LADDER, beatenCount, nextTarget, passedBetween,
    STREAK_REWARDS, dueRewards, nextStreakReward,
    nextGoal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Meta = API;
})(typeof self !== 'undefined' ? self : this);
