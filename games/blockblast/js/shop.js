// ════════════════════════════════════════
// shop.js — 金币经济 + 道具 + 广告闸门（DESIGN §9）。纯逻辑，可 node 单测。
//
// ⛔ 三条红线（调研结论：这个品类的第一杀手是广告，不是发块）：
//   1. **绝不局中插屏**（Woodoku 重灾区：广告盖住棋盘导致误放块 = 直接偷走玩家一局）
//   2. **绝不在玩家拒绝复活广告后强塞一个无奖励广告**（Block Blast 被骂最狠的一条：
//      它拿走了玩家「我不看」的选择权）
//   3. **关卡失败零广告**；插屏**只在正反馈时刻**（通关结算后）且**每 3 局最多一次**
//
// ✅ 必做：一次性「去除所有广告」IAP。Woodoku 被骂多年的正是没有这个选项
//    （「我愿意付钱你都不让」比广告本身更招恨）。
//    ⚠ 买了去广告之后：**激励视频保留，且奖励直接给**（点一下就到手）——
//    绝不让付费玩家**失去**功能，那是经典的一星差评来源。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // ── 经济表（DESIGN §9）──
  const PRICE = { undo: 100, refresh: 50 };          // 金币价
  const EARN = { levelWin: [20, 30, 50], daily: 50, adCoins: 25, sweep: 2, perfect: 20 };
  const FREE = { undoPerRun: 1, refreshEveryTurns: 8 };   // 每局 1 次免费撤销；每 8 次落子充能 1 次换手
  const INTERSTITIAL_EVERY = 3;                      // 每 3 次通关最多 1 个插屏

  // ── 插屏护栏（数量闸门之外再加时间闸门）──
  //    「合理的广告」= 位置(只在正反馈/转场) + 频次(每 3 次一个) + 间隔(≥2min) + 首日免打扰。
  //    首日零插屏：D1 体验和商店评分比首日 eCPM 值钱得多（这个品类差评第一条就是广告）。
  const AD_GUARD = {
    minGapMs: 120 * 1000,      // 任意两个插屏至少隔 2 分钟（通关/无尽共用一个时钟）
    minRunMs: 90 * 1000,       // 无尽局不满 90s（= 挫败局）不出转场插屏
    graceMs: 24 * 3600 * 1000, // 安装后 24h 内零插屏
    endlessEvery: 3,           // 每 3 局无尽最多 1 个转场插屏
  };

  const emptyWallet = () => ({
    coins: 50,                 // 开局送一点，让玩家第一次就能用得起道具
    noAds: false,              // 一次性 IAP
    winsSinceAd: 0,            // 距上次插屏过了几次通关
    runsSinceAd: 0,            // 距上次插屏过了几局无尽
    lastAdAt: 0,               // 上一个插屏的时间戳（通关/无尽共用）
    installAt: 0,              // 首次启动时间（boot 时补齐；0 = 老钱包，不做首日判断）
    themes: [],                // 已购皮肤 id（金币皮肤 —— 金币的消耗出口）
    chests: [],                // 已领的章末宝箱 id
  });

  /** 本局的道具状态（每局重置）*/
  const newRunItems = () => ({ undoFree: FREE.undoPerRun, refreshCharge: 0, turnsSinceCharge: 0 });

  /** 每落一子：给换手道具充能 */
  function onTurn(items) {
    items.turnsSinceCharge++;
    if (items.turnsSinceCharge >= FREE.refreshEveryTurns) {
      items.turnsSinceCharge = 0;
      items.refreshCharge = Math.min(items.refreshCharge + 1, 3);
    }
  }

  /**
   * 一个道具当前该怎么用 —— 返回 'free' | 'ad' | 'coins' | 'no'（no = 金币也不够）。
   * ⚠ 顺序是「免费 → 看广告 → 花金币」：玩家永远先拿到不花钱的选项。
   *   （原作的撤销要 1300 金币，是明显的逼氪价；我们不装这个坑。）
   */
  function undoMode(wallet, items) {
    if (items.undoFree > 0) return 'free';
    if (!wallet.noAds) return 'ad';                  // 看广告换一次
    if (wallet.coins >= PRICE.undo) return 'coins';  // 去广告用户直接用金币
    return wallet.coins >= PRICE.undo ? 'coins' : 'no';
  }
  function refreshMode(wallet, items) {
    if (items.refreshCharge > 0) return 'free';
    if (!wallet.noAds) return 'ad';
    return wallet.coins >= PRICE.refresh ? 'coins' : 'no';
  }

  /** 扣费（调用方已确认 mode）。返回是否成功。*/
  function payUndo(wallet, items, mode) {
    if (mode === 'free' && items.undoFree > 0) { items.undoFree--; return true; }
    if (mode === 'ad') return true;                                  // 广告的「费用」是看完广告本身
    if (mode === 'coins' && wallet.coins >= PRICE.undo) { wallet.coins -= PRICE.undo; return true; }
    return false;
  }
  function payRefresh(wallet, items, mode) {
    if (mode === 'free' && items.refreshCharge > 0) { items.refreshCharge--; return true; }
    if (mode === 'ad') return true;
    if (mode === 'coins' && wallet.coins >= PRICE.refresh) { wallet.coins -= PRICE.refresh; return true; }
    return false;
  }

  const earnLevel = (wallet, stars) => {
    const n = EARN.levelWin[Math.max(0, Math.min(2, stars - 1))];
    wallet.coins += n;
    return n;                                        // 调用方要拿它做「看广告翻倍」
  };
  const earnDaily = wallet => { wallet.coins += EARN.daily; };
  const earnAd = wallet => { wallet.coins += EARN.adCoins; };

  /** 无尽结算：得分换金币。score/100、封顶 100 —— 中位局 2971 分 ≈ 29 币，和通关同量级；
   *  封顶是防「马拉松局刷币」（无尽局长尾很长，不封顶经济会被顶级局冲垮）。*/
  const endlessCoins = score => Math.max(0, Math.min(Math.floor(score / 100), 100));
  function earnEndless(wallet, score) {
    const n = endlessCoins(score);
    wallet.coins += n;
    return n;
  }
  /** 看广告翻倍：把刚结算的那笔再给一遍（拒绝 ⇒ 什么也不发生，红线 2）*/
  const earnDouble = (wallet, n) => { wallet.coins += n; };

  /** 首日免打扰。installAt=0 = 升级上来的老钱包，查不到装机时间就不拦（行为不回退）。*/
  const inGrace = (wallet, now) => wallet.installAt > 0 && now - wallet.installAt < AD_GUARD.graceMs;
  const tooSoon = (wallet, now) => now - (wallet.lastAdAt || 0) < AD_GUARD.minGapMs;

  /**
   * 通关结算后能不能出插屏（红线 3）。
   * ⚠ 只有**通关**（正反馈时刻）才问这个；失败/局中**永远不问**。
   * 数量闸门（每 3 次通关）之外还有时间闸门：首日零插屏、距上次任何插屏 ≥2min。
   */
  function canShowInterstitial(wallet, now) {
    if (wallet.noAds) return false;                  // 买了去广告 = 一个非自愿广告都没有
    now = now == null ? Date.now() : now;
    if (inGrace(wallet, now) || tooSoon(wallet, now)) return false;
    return wallet.winsSinceAd >= INTERSTITIAL_EVERY;
  }
  function noteWin(wallet, shown, now) {
    wallet.winsSinceAd = shown ? 0 : wallet.winsSinceAd + 1;
    if (shown) wallet.lastAdAt = now == null ? Date.now() : now;
  }

  /**
   * 无尽「再来一局」转场能不能出插屏。⚠ 不在死亡瞬间出（那是失败时刻，红线 3 的精神）——
   * 只在玩家已经点了「再来一局」、决定继续之后的转场里出。四重护栏见 AD_GUARD。
   */
  function canShowEndlessInterstitial(wallet, runMs, now) {
    if (wallet.noAds) return false;
    now = now == null ? Date.now() : now;
    if (inGrace(wallet, now) || tooSoon(wallet, now)) return false;
    if (!(runMs >= AD_GUARD.minRunMs)) return false; // 短局（挫败局）不出
    return (wallet.runsSinceAd | 0) >= AD_GUARD.endlessEvery;
  }
  /** 一局无尽结束了（不管出没出广告都要记账）*/
  const noteEndlessRun = wallet => { wallet.runsSinceAd = (wallet.runsSinceAd | 0) + 1; };
  function noteEndlessAdShown(wallet, now) {
    wallet.runsSinceAd = 0;
    wallet.lastAdAt = now == null ? Date.now() : now;
  }

  /** 章末宝箱：该章每一关都拿到 ≥1 星才能领，一章一次 */
  function canClaimChest(wallet, progress, ch) {
    if (wallet.chests && wallet.chests.includes(ch.id)) return false;
    for (let id = ch.from; id <= ch.to; id++) if (!(progress[id] > 0)) return false;
    return true;
  }
  function claimChest(wallet, progress, ch) {
    if (!canClaimChest(wallet, progress, ch)) return false;
    if (!wallet.chests) wallet.chests = [];
    wallet.chests.push(ch.id);
    wallet.coins += ch.chest;
    return true;
  }

  /** 买金币皮肤（金币的消耗出口 —— 没有出口，「看广告领币」就是个死广告位）*/
  function buyTheme(wallet, theme) {
    if (!theme || !theme.coins) return false;
    if (wallet.themes && wallet.themes.includes(theme.id)) return false;
    if (wallet.coins < theme.coins) return false;
    wallet.coins -= theme.coins;
    if (!wallet.themes) wallet.themes = [];
    wallet.themes.push(theme.id);
    return true;
  }

  const API = {
    PRICE, EARN, FREE, INTERSTITIAL_EVERY, AD_GUARD,
    emptyWallet, newRunItems, onTurn,
    undoMode, refreshMode, payUndo, payRefresh,
    earnLevel, earnDaily, earnAd,
    endlessCoins, earnEndless, earnDouble,
    canShowInterstitial, noteWin,
    canShowEndlessInterstitial, noteEndlessRun, noteEndlessAdShown,
    buyTheme, canClaimChest, claimChest,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Shop = API;
})(typeof self !== 'undefined' ? self : this);
