// ════════════════════════════════════════
// themes.js — 皮肤（调色板切换）。靠星星解锁，是三星评级的兑现出口（DESIGN §10/§11）。
//
// ⚠ 渲染必须**确定性**：主题只提供颜色，绝不含 Math.random / 时间相关的东西 ——
//   否则同一盘面每帧长得不一样（snake 实踩过）。
// ⚠ 颜色纯装饰：消除只看行列是否填满，**从不看颜色**。换皮肤不改变任何规则。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const THEMES = [
    {
      id: 'candy', stars: 0,                     // 默认，免费
      bg1: '#6d3fb4', bg2: '#8e5ad0',
      boardBg: 'rgba(40,26,74,0.55)', cellEmpty: 'rgba(255,255,255,0.06)',
      accent: '#ffe08a',
      blocks: ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'],
    },
    {
      id: 'ocean', stars: 15,
      bg1: '#0e3a5f', bg2: '#1668a4',
      boardBg: 'rgba(4,26,44,0.55)', cellEmpty: 'rgba(255,255,255,0.07)',
      accent: '#7dd3fc',
      blocks: ['#06b6d4', '#0ea5e9', '#3b82f6', '#14b8a6', '#22d3ee', '#60a5fa', '#5eead4'],
    },
    {
      id: 'forest', stars: 30,
      bg1: '#1f3d2b', bg2: '#2f6b45',
      boardBg: 'rgba(10,32,20,0.55)', cellEmpty: 'rgba(255,255,255,0.07)',
      accent: '#fde68a',
      blocks: ['#65a30d', '#16a34a', '#84cc16', '#facc15', '#f59e0b', '#10b981', '#a3e635'],
    },
    {
      id: 'sunset', stars: 45,
      bg1: '#7c2d12', bg2: '#c2410c',
      boardBg: 'rgba(60,20,10,0.55)', cellEmpty: 'rgba(255,255,255,0.08)',
      accent: '#fef08a',
      blocks: ['#ef4444', '#f97316', '#f59e0b', '#facc15', '#fb7185', '#e11d48', '#fdba74'],
    },
    // ── 金币皮肤（`coins` 字段 = 售价；星星买不到 —— 两条赛道分开）──
    //    这是金币经济的**消耗出口**（DESIGN §9 原表里写了 800-1500 但一直没实现）：
    //    没有出口，「看广告领币」就是在发一种花不出去的货币。
    {
      id: 'neon', coins: 800,
      bg1: '#0f1024', bg2: '#1b1440',
      boardBg: 'rgba(0,0,0,0.45)', cellEmpty: 'rgba(255,255,255,0.07)',
      accent: '#22d3ee',
      blocks: ['#f43f5e', '#fb923c', '#fde047', '#4ade80', '#22d3ee', '#a78bfa', '#f472b6'],
    },
    {
      id: 'sakura', coins: 1200,
      bg1: '#a3446e', bg2: '#d98aa8',
      boardBg: 'rgba(60,15,35,0.50)', cellEmpty: 'rgba(255,255,255,0.09)',
      accent: '#ffd6e7',
      blocks: ['#e11d48', '#fb7185', '#f9a8d4', '#f472b6', '#c084fc', '#fda4af', '#fbbf24'],
    },
    // ── 高价位金币皮肤（2026-08-01 加）：老玩家的金币**必须有地方去**。
    //    原来只有 neon/sakura 两款（2000 币封顶），玩到中期金币就开始溢出 ——
    //    溢出的货币 = 死货币，「看广告领币」那个位当场变成没人点的死位。
    {
      id: 'aurora', coins: 1600,
      bg1: '#0b2d3a', bg2: '#125c62',
      boardBg: 'rgba(2,24,32,0.52)', cellEmpty: 'rgba(255,255,255,0.08)',
      accent: '#99f6e4',
      blocks: ['#2dd4bf', '#22d3ee', '#38bdf8', '#a78bfa', '#4ade80', '#f0abfc', '#fde047'],
    },
    {
      id: 'volcano', coins: 2000,
      bg1: '#3f0d0d', bg2: '#7f1d1d',
      boardBg: 'rgba(30,4,4,0.52)', cellEmpty: 'rgba(255,255,255,0.08)',
      accent: '#fdba74',
      blocks: ['#f87171', '#ef4444', '#f97316', '#fbbf24', '#fca5a5', '#dc2626', '#fde68a'],
    },
    {
      id: 'galaxy', coins: 2600,
      bg1: '#160b34', bg2: '#3b1d78',
      boardBg: 'rgba(6,2,22,0.55)', cellEmpty: 'rgba(255,255,255,0.07)',
      accent: '#c4b5fd',
      blocks: ['#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#38bdf8', '#f472b6', '#fef08a'],
    },
    {
      id: 'cotton', coins: 3200,
      bg1: '#b0568c', bg2: '#e8a7cd',
      boardBg: 'rgba(70,20,52,0.48)', cellEmpty: 'rgba(255,255,255,0.10)',
      accent: '#fff1f2',
      blocks: ['#fda4af', '#f9a8d4', '#d8b4fe', '#a5b4fc', '#99f6e4', '#fde68a', '#fbcfe8'],
    },
    // ── 盘数皮肤（`games` 字段 = 玩满 N 盘解锁，输赢都算）——「很容易收集到」的一档：
    //    2~40 盘的阶梯，头几天几乎每天都有新皮肤开，白送的持续正反馈。──
    { id: 'lavender', games: 2, bg1: '#7c6bb8', bg2: '#a394d6', boardBg: 'rgba(40,26,74,0.45)', cellEmpty: 'rgba(255,255,255,0.07)', accent: '#ffe9a8',
      blocks: ['#e879f9', '#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#f472b6', '#fbbf24'] },
    { id: 'mint', games: 4, bg1: '#1f7a63', bg2: '#3aa98b', boardBg: 'rgba(6,38,30,0.50)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#d1fae5',
      blocks: ['#34d399', '#10b981', '#6ee7b7', '#fbbf24', '#f472b6', '#60a5fa', '#a3e635'] },
    { id: 'peach', games: 6, bg1: '#c2664b', bg2: '#e8926f', boardBg: 'rgba(70,26,14,0.45)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#ffedd5',
      blocks: ['#fb923c', '#f97316', '#fdba74', '#f43f5e', '#fbbf24', '#fb7185', '#f59e0b'] },
    { id: 'midnight', games: 9, bg1: '#111827', bg2: '#1f2937', boardBg: 'rgba(0,0,0,0.40)', cellEmpty: 'rgba(255,255,255,0.06)', accent: '#93c5fd',
      blocks: ['#60a5fa', '#3b82f6', '#818cf8', '#22d3ee', '#a78bfa', '#f472b6', '#34d399'] },
    { id: 'coral', games: 12, bg1: '#b83a5a', bg2: '#e06a86', boardBg: 'rgba(60,12,26,0.45)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#ffe4e6',
      blocks: ['#fb7185', '#f43f5e', '#fda4af', '#fb923c', '#f472b6', '#e879f9', '#fbbf24'] },
    { id: 'ice', games: 16, bg1: '#23607d', bg2: '#4f93b8', boardBg: 'rgba(8,32,46,0.45)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#e0f2fe',
      blocks: ['#7dd3fc', '#38bdf8', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fde047'] },
    { id: 'gold', games: 20, bg1: '#92600e', bg2: '#c98a1b', boardBg: 'rgba(50,32,4,0.45)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#fef9c3',
      blocks: ['#fbbf24', '#f59e0b', '#fde047', '#fb923c', '#ef4444', '#a3e635', '#f97316'] },
    { id: 'rose', games: 25, bg1: '#9d2450', bg2: '#c94f7c', boardBg: 'rgba(52,10,26,0.45)', cellEmpty: 'rgba(255,255,255,0.08)', accent: '#fce7f3',
      blocks: ['#f9a8d4', '#f472b6', '#ec4899', '#fb7185', '#e879f9', '#fda4af', '#fbbf24'] },
    { id: 'grape', games: 30, bg1: '#4c1d95', bg2: '#6d28d9', boardBg: 'rgba(24,8,50,0.45)', cellEmpty: 'rgba(255,255,255,0.07)', accent: '#ddd6fe',
      blocks: ['#a78bfa', '#8b5cf6', '#c084fc', '#e879f9', '#818cf8', '#f472b6', '#22d3ee'] },
    { id: 'slate', games: 40, bg1: '#334155', bg2: '#64748b', boardBg: 'rgba(10,16,26,0.45)', cellEmpty: 'rgba(255,255,255,0.07)', accent: '#f1f5f9',
      blocks: ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee'] },
  ];

  const byId = id => THEMES.find(t => t.id === id) || THEMES[0];
  /**
   * 三条解锁赛道：星星（stars 字段）/ 金币（coins 字段，认钱包已购）/ 盘数（games 字段，玩满即开）。
   * ⚠ 盘数皮肤**也认 owned**：激励视频「皮肤解锁」位会把还没玩够盘数的那款提前塞进 owned
   *   （广告只提前给外观，绝不绕过星星赛道 —— 星星是三星通关的兑现，不卖）。
   */
  const isUnlocked = (t, stars, owned, games) =>
    (t.coins ? !!owned && owned.includes(t.id)
      : t.games != null ? ((games | 0) >= t.games || (!!owned && owned.includes(t.id)))
      : stars >= t.stars);
  const unlockedList = (stars, owned, games) => THEMES.filter(t => isUnlocked(t, stars, owned, games));

  const API = { THEMES, byId, isUnlocked, unlockedList };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Themes = API;
})(typeof self !== 'undefined' ? self : this);
