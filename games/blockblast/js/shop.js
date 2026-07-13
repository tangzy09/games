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

  const emptyWallet = () => ({
    coins: 50,                 // 开局送一点，让玩家第一次就能用得起道具
    noAds: false,              // 一次性 IAP
    winsSinceAd: 0,            // 距上次插屏过了几次通关
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

  const earnLevel = (wallet, stars) => { wallet.coins += EARN.levelWin[Math.max(0, Math.min(2, stars - 1))]; };
  const earnDaily = wallet => { wallet.coins += EARN.daily; };
  const earnAd = wallet => { wallet.coins += EARN.adCoins; };

  /**
   * 通关结算后能不能出插屏（红线 3）。
   * ⚠ 只有**通关**（正反馈时刻）才问这个；失败/局中**永远不问**。
   */
  function canShowInterstitial(wallet) {
    if (wallet.noAds) return false;                  // 买了去广告 = 一个非自愿广告都没有
    return wallet.winsSinceAd >= INTERSTITIAL_EVERY;
  }
  function noteWin(wallet, shown) {
    wallet.winsSinceAd = shown ? 0 : wallet.winsSinceAd + 1;
  }

  const API = {
    PRICE, EARN, FREE, INTERSTITIAL_EVERY,
    emptyWallet, newRunItems, onTurn,
    undoMode, refreshMode, payUndo, payRefresh,
    earnLevel, earnDaily, earnAd,
    canShowInterstitial, noteWin,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Shop = API;
})(typeof self !== 'undefined' ? self : this);
