// ════════════════════════════════════════
// shop.js —— 变现闸门（P5 · DESIGN §8）。
//
// §8 抬头就写着「**⚠ 结构与 solitaire 相反，别照抄**」：
//   「纸牌单次 session 10-15 分钟 ⇒ 横幅是主力。**四子棋一局 1-3 分钟，横幅曝光时长
//     差一个量级。** ⇒ **激励视频是主力，横幅是补充，插屏是姿态。**」
//
// ⛔⛔ 三条红线（每一条都在 E2E 里有断言）：
//   ① **提示 / 复盘 / 悔棋 / 全部课程 —— 永远免费，永不看广告**（§3.2 / §8）。
//      竞品把提示做成 9 次限量道具，**这正是不学的东西**。
//   ② **前 50 盘零插屏**（一局 2 分钟 ⇒ 约前 100 分钟），**写进商店页当明面卖点**。
//   ③ ⛔⛔ **输局永不出插屏**。刚输完就弹广告是这个品类最招差评的一件事，
//      而且它与 §6.6「让输不疼」正面冲突 —— 那一整节的设计会被一个插屏全部抵消。
//
// ⛔ 不做体力、不做押注金币、金币买不到任何玩法优势（§8 末条）。
//
// ⛔ 本文件是**纯函数**：只回答「这一刻该不该放」，⛔ 不碰 Ads、不读存储、不认识 UI
//   ⇒ 每条闸门规则都能在 node 里钉死（源码级检查在 test-shop.js）。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  /** ⭐ 前多少盘一个插屏都不出（§8 的明面卖点 ⇒ ⛔ 别偷偷调小）。 */
  const FREE_ROUNDS = 50;
  /** 之后每多少盘至多一个。 */
  const EVERY_N = 10;
  /** 距上一个插屏至少多久（ms）。 */
  const MIN_GAP_MS = 120000;

  /**
   * ⭐⭐ 这一局结束时该不该放插屏。**纯函数**。
   * @param ctx.rounds   累计打了几盘（含这一盘）
   * @param ctx.won      这一局玩家赢了吗（⚠ 平局按「没输」算 —— 见 lost）
   * @param ctx.lost     ⭐ 这一局玩家**输了**吗（⛔ 输局永不出，见红线③）
   * @param ctx.now      现在（ms）
   * @param ctx.lastAt   上一个插屏的时刻（ms；0 = 还没出过）
   * @returns { show, why } —— why 是**不放的原因**（给门禁/调试看，⛔ 不给玩家看）
   */
  function interstitial(ctx) {
    const c = ctx || {};
    const rounds = c.rounds | 0;
    // ⛔⛔ 红线③：输局永不出。⚠ 放在**最前面** —— 它压过其余一切条件。
    if (c.lost) return { show: false, why: 'lost' };
    // ⭐ 红线②：前 50 盘零插屏
    if (rounds <= FREE_ROUNDS) return { show: false, why: 'freeRounds' };
    // 每 10 盘至多一个
    if (rounds % EVERY_N !== 0) return { show: false, why: 'cadence' };
    // 距上次 ≥2min
    const last = c.lastAt | 0;
    if (last > 0 && (c.now | 0) - last < MIN_GAP_MS) return { show: false, why: 'tooSoon' };
    return { show: true, why: '' };
  }

  // ════════ ⭐ 激励视频（主力）════════
  //
  // ⚠⚠ 每一个位都必须满足两条，否则**不许存在**：
  //   · 它给的是**收集品 / 装饰 / 便利**，⛔ 绝不是玩法优势（§8 末条）；
  //   · 不看它**也拿得到**（只是慢一点）—— ⛔ 广告不许是唯一通路。
  // ⛔ **这里没有「提示」「复盘」「悔棋」「课程」** —— 那四样永远免费（红线①）。
  //   ⇒ 下面这张表就是「哪些位存在」的**唯一真相**，门禁拿它反查红线①。
  const REWARD_SLOTS = Object.freeze([
    { id: 'skin', key: 'ad.skin', gives: 'cosmetic' },      // 皮肤（棋子/棋盘）
    { id: 'card', key: 'ad.card', gives: 'collectible' },   // ⭐ 棋谱卡（§7.6 的收集三层）
    { id: 'coin2x', key: 'ad.coin2x', gives: 'currency' },  // 金币 ×2
    { id: 'daily', key: 'ad.daily', gives: 'currency' }     // 每日礼物
  ]);
  /** ⛔ 永远免费、永不看广告的那几件事（红线①）。门禁用它反查 REWARD_SLOTS。 */
  const NEVER_PAID = Object.freeze(['hint', 'review', 'undo', 'lesson']);

  /** 每个位每天最多看几次（⚠ 额度护住长线收集：⛔ 零 cap 会让当天被刷穿）。 */
  const CAPS = Object.freeze({ skin: 3, card: 5, coin2x: 5, daily: 1 });

  /** 今天这个位还剩几次。@param used { id: n } */
  function quotaLeft(id, used) {
    const cap = CAPS[id];
    if (cap === undefined) return 0;                 // ⛔ 不认识的位 ⇒ 0（fail-closed）
    return Math.max(0, cap - ((used && used[id]) | 0));
  }
  function slotOf(id) { for (const s of REWARD_SLOTS) if (s.id === id) return s; return null; }

  const API = {
    FREE_ROUNDS, EVERY_N, MIN_GAP_MS, REWARD_SLOTS, NEVER_PAID, CAPS,
    interstitial, quotaLeft, slotOf
  };
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Shop = API;
})(typeof self !== 'undefined' ? self : this);
