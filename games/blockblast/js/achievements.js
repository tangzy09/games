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
    { id: 'star10',     cat: 'cum', need: p => p.stars >= 10 },
    { id: 'star30',     cat: 'cum', need: p => p.stars >= 30 },
    { id: 'star60',     cat: 'cum', need: p => p.stars >= 60 },   // 20 关全三星
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
    unlocked: [],                      // 已解锁的成就 id
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

  const API = { ACHIEVEMENTS, emptyProfile, settle, check, total, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Achievements = API;
})(typeof self !== 'undefined' ? self : this);
