// ════════════════════════════════════════
// achievements.js — 成就（数据表驱动，纯逻辑，可 node 单测）。
//
// 设计（DESIGN §10）：只记录「做到过什么」，**不给任何永久数值加成** ——
// 加成会毁掉分数的可比性（同一个 seed 打出的分，必须人人可比）。
//
// 两族：
//   · 累计族（cum）：读 profile 里的累计计数器
//   · 单局族（run）：读一局结束时的 stats
// 判定全部是**数据表里的纯函数**，绝不写死在游戏逻辑里。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  /** 图鉴累计收集总数（profile.crystals = { kind: n }，老档可能没有这个字段）*/
  const sumCrystals = p => Object.values(p.crystals || {}).reduce((a, v) => a + v, 0);

  // id 一旦发布就不能改（存档里存的是 id）
  const ACHIEVEMENTS = [
    // ── 累计：落子 ──
    { id: 'place100',   cat: 'cum', need: p => p.turns >= 100 },
    { id: 'place1k',    cat: 'cum', need: p => p.turns >= 1000 },
    { id: 'place5k',    cat: 'cum', need: p => p.turns >= 5000 },
    // ── 累计：消行 ──
    { id: 'line50',     cat: 'cum', need: p => p.lines >= 50 },
    { id: 'line500',    cat: 'cum', need: p => p.lines >= 500 },
    { id: 'line2k',     cat: 'cum', need: p => p.lines >= 2000 },
    // ── 累计：局数 ──
    { id: 'game10',     cat: 'cum', need: p => p.games >= 10 },
    { id: 'game100',    cat: 'cum', need: p => p.games >= 100 },
    // ── 单局：分数 ──
    { id: 'score1k',    cat: 'run', need: (p, s) => s.score >= 1000 },
    { id: 'score3k',    cat: 'run', need: (p, s) => s.score >= 3000 },
    { id: 'score6k',    cat: 'run', need: (p, s) => s.score >= 6000 },
    { id: 'score10k',   cat: 'run', need: (p, s) => s.score >= 10000 },
    // ── 单局：streak（本作的主引擎，值得多给几条）──
    { id: 'streak3',    cat: 'run', need: (p, s) => s.stats.maxStreak >= 3 },
    { id: 'streak5',    cat: 'run', need: (p, s) => s.stats.maxStreak >= 5 },
    { id: 'streak7',    cat: 'run', need: (p, s) => s.stats.maxStreak >= 7 },   // 满档 ×4
    { id: 'streak12',   cat: 'run', need: (p, s) => s.stats.maxStreak >= 12 },
    // ── 单局：SWEEP 梯度（招牌）──
    { id: 'sweep1',     cat: 'run', need: (p, s) => s.stats.sweeps + s.stats.deeps + s.stats.perfects >= 1 },
    { id: 'sweep3',     cat: 'run', need: (p, s) => s.stats.sweeps + s.stats.deeps + s.stats.perfects >= 3 },
    { id: 'deep1',      cat: 'run', need: (p, s) => s.stats.deeps + s.stats.perfects >= 1 },
    // ⚠ PERFECT：参考 AI 跑 1200 局零次 —— 这是**技巧天花板**，只有刻意去凑的人才拿得到
    { id: 'perfect1',   cat: 'run', need: (p, s) => s.stats.perfects >= 1 },
    { id: 'perfect3',   cat: 'cum', need: p => p.perfects >= 3 },
    // ── 单局：多消 ──
    { id: 'combo3',     cat: 'run', need: (p, s) => (s.stats.bestL || 0) >= 3 },
    { id: 'combo4',     cat: 'run', need: (p, s) => (s.stats.bestL || 0) >= 4 },
    // ── 关卡 ──
    { id: 'lvl1',       cat: 'cum', need: p => p.levelsWon >= 1 },
    { id: 'lvl5',       cat: 'cum', need: p => p.levelsWon >= 5 },
    { id: 'lvl10',      cat: 'cum', need: p => p.levelsWon >= 10 },
    { id: 'lvl20',      cat: 'cum', need: p => p.levelsWon >= 20 },
    { id: 'lvl30',      cat: 'cum', need: p => p.levelsWon >= 30 },   // 三章全通
    // ── 300 关（2026-08-02 扩容）之后的长线档：原来的顶档 lvl30/star90 在第 3 章就封顶了 ──
    { id: 'lvl60',      cat: 'cum', need: p => p.levelsWon >= 60 },
    { id: 'lvl150',     cat: 'cum', need: p => p.levelsWon >= 150 },
    { id: 'lvl300',     cat: 'cum', need: p => p.levelsWon >= 300 },  // 全 300 关通关
    { id: 'star10',     cat: 'cum', need: p => p.stars >= 10 },
    { id: 'star30',     cat: 'cum', need: p => p.stars >= 30 },
    { id: 'star60',     cat: 'cum', need: p => p.stars >= 60 },
    { id: 'star90',     cat: 'cum', need: p => p.stars >= 90 },   // 前 30 关全三星
    { id: 'star300',    cat: 'cum', need: p => p.stars >= 300 },
    { id: 'star600',    cat: 'cum', need: p => p.stars >= 600 },
    { id: 'star900',    cat: 'cum', need: p => p.stars >= 900 },  // 300 关全三星 = 天花板
    { id: 'cry50',      cat: 'cum', need: p => sumCrystals(p) >= 50 },    // 图鉴联动
    { id: 'cry200',     cat: 'cum', need: p => sumCrystals(p) >= 200 },
    { id: 'noUndo10',   cat: 'cum', need: p => p.cleanWins >= 10 },  // 不用撤销通关
    // ── 每日谜题 ──
    { id: 'daily1',     cat: 'cum', need: p => p.dailyDays >= 1 },
    { id: 'daily7',     cat: 'cum', need: p => p.dailyStreak >= 7 },
    { id: 'daily30',    cat: 'cum', need: p => p.dailyStreak >= 30 },
  ];

  const emptyProfile = () => ({
    turns: 0, lines: 0, games: 0, perfects: 0,
    levelsWon: 0, stars: 0, cleanWins: 0,
    dailyDays: 0, dailyStreak: 0, lastDaily: 0,
    bestDailyStreak: 0, streakRewardedAt: 0,   // 连续奖励阶梯（daily.js streakReward）
    bestStreak: 0, sweepsTotal: 0,     // 终身统计（统计页）
    crystals: {},                      // 图鉴：每种水晶的累计收集数
    quests: null,                      // 每日任务进度（quests.js ensure 按天重置）
    unlocked: [],                      // 已解锁的成就 id
    // ── 教练（coach.js）的终身账本：妙手数 + 两类失误数 ⇒「我的弱点」页 ──
    //    ⚠ 只统计**看得见的**两类：放着能消的行不消 / 一手造出 2 个以上孤格。
    //    它们都是纯逻辑可判定的，不是「我觉得你打得不好」。
    brilliants: 0,
    faults: { missLine: 0, isolate: 0 },
  });

  /**
   * 结算一局：把这局的 stats 累加进 profile，并返回**本局新解锁**的成就 id 列表。
   * 纯函数式：不碰 DOM、不碰存储。
   */
  function settle(profile, s) {
    const p = profile;
    p.turns += s.stats.turns;
    p.lines += s.stats.lines;
    p.perfects += s.stats.perfects;
    p.games += 1;
    // 终身统计（统计页用；老档缺字段用 ||0 兜）
    p.bestStreak = Math.max(p.bestStreak || 0, s.stats.maxStreak || 0);
    p.sweepsTotal = (p.sweepsTotal || 0) + (s.stats.sweeps || 0) + (s.stats.deeps || 0) + (s.stats.perfects || 0);

    const fresh = [];
    const seen = new Set(p.unlocked);
    for (const a of ACHIEVEMENTS) {
      if (seen.has(a.id)) continue;
      const got = a.cat === 'cum' ? a.need(p) : a.need(p, s);
      if (got) { p.unlocked.push(a.id); fresh.push(a.id); }
    }
    return fresh;
  }

  /** 只检查累计族（关卡过关/每日完成后调用，不算「一局」）*/
  function check(profile) {
    const fresh = [];
    const seen = new Set(profile.unlocked);
    for (const a of ACHIEVEMENTS) {
      if (seen.has(a.id) || a.cat !== 'cum') continue;
      if (a.need(profile)) { profile.unlocked.push(a.id); fresh.push(a.id); }
    }
    return fresh;
  }

  const total = () => ACHIEVEMENTS.length;
  const byId = id => ACHIEVEMENTS.find(a => a.id === id);

  /**
   * 等级 XP：把「玩过的一切」折成一个数（engine/meta.js 的 levelProgress 吃它）。
   * ⚠ 只读**既有计数器**，不新增任何埋点 —— 这正是元游戏层能跨游戏复用的前提。
   *   权重按「有多难」排：落子 1 · 消行 4 · 收集 5 · 妙手 8 · SWEEP 15 · 星 20 · 通关 60。
   */
  function xpOf(p, angels) {
    if (!p) return 0;
    return (p.turns | 0) + (p.lines | 0) * 4 + (p.levelsWon | 0) * 60 + (p.stars | 0) * 20
         + (p.sweepsTotal | 0) * 15 + (p.brilliants | 0) * 8 + (angels | 0) * 5;
  }

  const API = { ACHIEVEMENTS, emptyProfile, settle, check, total, byId, xpOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Achievements = API;
})(typeof self !== 'undefined' ? self : this);
