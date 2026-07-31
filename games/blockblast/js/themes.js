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
  ];

  const byId = id => THEMES.find(t => t.id === id) || THEMES[0];
  /** 星星皮肤：拥有多少星解锁到哪一档；金币皮肤：只认钱包里的已购列表 */
  const isUnlocked = (t, stars, owned) => (t.coins ? !!owned && owned.includes(t.id) : stars >= t.stars);
  const unlockedList = (stars, owned) => THEMES.filter(t => isUnlocked(t, stars, owned));

  const API = { THEMES, byId, isUnlocked, unlockedList };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Themes = API;
})(typeof self !== 'undefined' ? self : this);
