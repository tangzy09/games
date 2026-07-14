// ════════════════════════════════════════
// deal.js — 发牌。
//
// ⚠ **契约：deal 必须是可复现的纯函数** `deal(seed) → 完全相同的牌局`。
//   这不是「最好有」，是整个设计的地基：
//     · 存档存的是 `seed + move list`（不是盘面快照）⇒ 恢复靠重放 ⇒ 发牌必须能复现
//     · 「牌局编号」= seed ⇒ 玩家报编号我们就能复现同一局
//     · 可解 seed 池里存的是 seed ⇒ 池外的验证器要能还原出同一副牌
//   ⇒ **绝不允许 Math.random 进入这个文件。**
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;

  /** mulberry32：可注种子、跨平台确定 */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Fisher-Yates（自后向前），完全由 seed 决定 */
  function shuffle(seed) {
    const d = Cards.freshDeck();
    const rand = rng(seed);
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  /**
   * Klondike 发牌：7 列（第 i 列 i+1 张，仅顶牌明），其余进 stock。
   * 返回**纯数据**（不含任何 UI 状态）：
   *   tableau: [{ cards: [id...], up: n }]   —— 末尾 n 张是明牌
   *   stock:   [id...]                       —— 末尾是「下一张要翻的」
   */
  function klondike(seed) {
    const d = shuffle(seed);
    const tableau = [];
    let k = 0;
    for (let col = 0; col < 7; col++) {
      const cards = d.slice(k, k + col + 1);
      k += col + 1;
      tableau.push({ cards, up: 1 });          // 只有顶牌是明的
    }
    const stock = d.slice(k);                  // 剩 24 张
    return { tableau, stock };
  }

  /** 随机开一局用的种子（唯一用到不确定性的地方；每日挑战改用日期） */
  const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

  const API = { rng, shuffle, klondike, randomSeed };
  if (isNode) module.exports = API;
  else root.Deal = API;
})(typeof self !== 'undefined' ? self : this);
