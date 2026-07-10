// games/snake/js/fruits.js — 果子数据表与常量(纯数据,双导出)
// 分类: score(得分) reveal(揭图) surv(生存) misc(杂项)
// rare = 类内权重稀有系数(数值,越小越稀有;省略 = 1 常规):0.35 稀有,0.12 极稀有
const FRUITS = {
  twin:     { emoji: '💫', cat: 'score' },              // 双子星:场上多刷 2 个苹果
  gold:     { emoji: '👑', cat: 'score', rare: 0.12 },  // 金苹果:+50 分、连击 +2(极稀有)
  demon:    { emoji: '😈', cat: 'score' },              // 小恶魔:5s 提速 50%、得分 ×2
  meteor:   { emoji: '🌠', cat: 'score', rare: 0.35 },  // 流星:斜穿棋盘,飞过即揭,追上 +40
  feather:  { emoji: '🌈', cat: 'reveal' },             // 彩虹羽毛:随机揭 3×3
  trail:    { emoji: '✨', cat: 'reveal' },              // 圣光足迹:8s 走过揭 3 格宽
  cloud:    { emoji: '☁️', cat: 'surv' },               // 慢慢云:8s 减速 30%
  scissors: { emoji: '✂️', cat: 'surv', rare: 0.35 },   // 天使之剪:蛇身 -3
  halo:     { emoji: '😇', cat: 'surv' },               // 光环:6s 幽灵穿身
  heart:    { emoji: '💖', cat: 'surv' },               // 守护爱心:护盾 +1
  magnet:   { emoji: '🧲', cat: 'misc' },               // 磁力圣环:8s 果子向蛇头漂移
  gift:     { emoji: '🎁', cat: 'misc' },               // 天国礼盒:随机其他一种效果
};
// 设计 §13 待校准:前期偏得分,后期偏生存/揭图
const CAT_WEIGHTS = {
  early: { score: 6, reveal: 2, surv: 1, misc: 1 },
  late:  { score: 2, reveal: 3, surv: 4, misc: 1 },
};
const FRUIT_TIMES = {                // 全部 ms,待校准
  specialLife: 8000, blinkAt: 2500,
  cloud: 8000, demon: 5000, halo: 6000, trail: 8000, magnet: 8000,
  magnetStep: 500, meteorStep: 160,
};
const Fruits = { FRUITS, CAT_WEIGHTS, FRUIT_TIMES };
if (typeof module !== 'undefined' && module.exports) module.exports = Fruits;
