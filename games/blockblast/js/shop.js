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
  const FREE = { undoPerRun: 1, refreshEveryTurns: 8, hintPerRun: 1 };   // 每局 1 次免费撤销 / 1 次免费提示；每 8 次落子充能 1 次换手

  // ── 插屏总闸门（2026-07-31 定稿：口碑优先，插屏近乎象征性存在；收入主力是自愿的激励视频）──
  //    前 50 盘（关卡/无尽/每日/挑战都算盘）**零插屏** ≈ 中位玩家前 18 天无广告，且是明面卖点；
  //    之后全局共享「每 10 盘至多 1 个」的预算，只出现在正反馈/转场时刻（通关结算、无尽「再来一局」）。
  //    ⛔ 失败/局中/每日结算永远零插屏（红线不变）。
  const AD_GATE = {
    graceGames: 50,            // 免广告期（按完成的盘数计）
    everyGames: 10,            // 之后每 10 盘至多 1 个
    minGapMs: 120 * 1000,      // 任意两个插屏至少隔 2 分钟
  };

  // ════════════════════════════════════════
  // 激励视频：**位 + 每日额度**（唯一真相表 —— 加位/改数值只动这两张表）
  //
  // ⚠ 2026-08-01 之前只有 4 个位（领币/翻倍/撤销/换手），而且「看广告领币」**零额度**：
  //   `showRewarded → coins += 25` 一路到底，没有任何 cap ⇒ 理论上无限刷金币，
  //   金币皮肤/补签这些长线出口当天就能被刷穿（snake 的教训：**线上收不回来**）。
  //
  // ⛔ 三条不变的红线：
  //   1. 拒绝/失败 ⇒ **什么也不发生**（不扣额度、不发奖励、不惩罚）
  //   2. **关卡失败永远没有广告出口**（不做「看广告复活」——那正是 DESIGN §9 痛骂的东西）
  //   3. 去广告玩家（noAds）**不失去任何功能**：同样的奖励**直接给**，但照样吃每日额度
  //      （额度是防刷穿的，不是惩罚）
  //
  // ⚠ 跨天重置必须**按 AD_CAPS 全量清**（下面的循环）：手写清 key 必漏，
  //   漏掉的那个位会永久卡在首日额度（skin 上限 1 ⇒ 玩家一辈子只能广告解锁一款皮肤）。
  // ════════════════════════════════════════
  const AD_CAPS = { coins: 5, gift: 1, boost: 1, skin: 1, quest: 2, gallery: 3, hint: 3 };
  const AD_REWARD = {
    coins: 25,                          // 🏪 商店「看广告领币」
    gift: { coins: 60, angels: 2 },     // 🎁 每日礼物（HOME，每天一次）
    boost: { undo: 1, refresh: 2 },     // 🚀 开局礼包（本局多一次免费撤销 + 两次换手）
    gallery: 5,                         // 👼 图鉴加速（直接 +5 张画像）
    // skin / quest 的奖励是「一款皮肤」「一个今日任务」，没有数值
  };
  /** 同样的东西也能用金币买 —— 不想看广告的人必须有出口，金币也必须有去处（C6）*/
  const COIN_PRICE = { boost: 200, gallery: 150 };

  const ymd = now => {
    const d = now == null ? new Date() : new Date(now);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };

  /** 今天这个位还剩几次（顺带做跨天重置）*/
  function adQuotaLeft(wallet, kind, now) {
    if (!wallet) return 0;
    const a = wallet.ads || (wallet.ads = { day: 0 });
    const today = ymd(now);
    if (a.day !== today) { a.day = today; for (const k of Object.keys(AD_CAPS)) a[k] = 0; }
    return Math.max(0, (AD_CAPS[kind] || 0) - (a[kind] || 0));
  }
  /** 记一次消耗（**看完了**才调用；拒绝绝不调用）*/
  function adUse(wallet, kind, now) {
    const a = wallet.ads || (wallet.ads = { day: 0 });
    adQuotaLeft(wallet, kind, now);            // 先过一次跨天重置
    a[kind] = (a[kind] || 0) + 1;
  }
  /**
   * 这个位现在怎么用：'ad'（看广告）| 'free'（去广告玩家直接拿）| 'no'（今天额度用完）。
   * ⚠ noAds 走 'free' 而不是 'no' —— 付费玩家绝不因为「没广告可看」而少一个功能。
   */
  function adMode(wallet, kind, now) {
    if (adQuotaLeft(wallet, kind, now) <= 0) return 'no';
    return wallet.noAds ? 'free' : 'ad';
  }

  // ── 天使图收集（500 张，素材=语言学习项目「大头萌天使」词图）──
  //    发放节奏（很容易收集，长尾靠量）：每完成一盘 +1；通关 +2；破纪录额外 +1。
  //    解锁是**顺序制**（第 n 张），钱包只存一个数 ⇒ 存档零膨胀。
  const ANGELS = { total: 500 };

  const emptyWallet = () => ({
    coins: 50,                 // 开局送一点，让玩家第一次就能用得起道具
    noAds: false,              // 历史本地开关（IAP 已封存不接；留着 = 老用户继续免广告，不收回）
    gamesPlayed: 0,            // 累计完成盘数（免广告期的计数）
    gamesSinceAd: 0,           // 距上次插屏过了几盘
    lastAdAt: 0,               // 上一个插屏的时间戳
    themes: [],                // 已购皮肤 id（金币皮肤 —— 金币的消耗出口）
    chests: [],                // 已领的章末宝箱 id
    angels: 0,                 // 天使图已收集张数（顺序解锁）
    ads: { day: 0 },           // 激励视频每日额度账本（{day:YYYYMMDD, <kind>:用了几次}）
  });

  /** 本局的道具状态（每局重置）*/
  const newRunItems = () => ({ undoFree: FREE.undoPerRun, refreshCharge: 0, turnsSinceCharge: 0, hintFree: FREE.hintPerRun });

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

  /** 每完成一盘记一笔（关卡赢/关卡输/无尽/每日/挑战都算盘 —— 免广告期和频次预算共用这个计数）*/
  function notePlayed(wallet) {
    wallet.gamesPlayed = (wallet.gamesPlayed | 0) + 1;
    wallet.gamesSinceAd = (wallet.gamesSinceAd | 0) + 1;
  }

  /**
   * 现在能不能出插屏（唯一闸门，通关结算与无尽「再来一局」转场共用）。
   * ⚠ 调用方只允许在**正反馈/转场时刻**问；失败/局中/每日结算**永远不问**（红线 3）。
   */
  function canShowInterstitial(wallet, now) {
    if (wallet.noAds) return false;                            // 历史去广告开关：继续兑现，不收回
    if ((wallet.gamesPlayed | 0) <= AD_GATE.graceGames) return false;   // 前 50 盘零插屏
    if ((wallet.gamesSinceAd | 0) < AD_GATE.everyGames) return false;   // 每 10 盘至多 1 个
    now = now == null ? Date.now() : now;
    if (now - (wallet.lastAdAt || 0) < AD_GATE.minGapMs) return false;  // 距上次 ≥2min
    return true;
  }
  function noteAdShown(wallet, now) {
    wallet.gamesSinceAd = 0;
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

  /** 天使图发放。返回实际新增张数（封顶 500 后为 0）*/
  function earnAngels(wallet, n) {
    const before = wallet.angels | 0;
    wallet.angels = Math.min(ANGELS.total, before + Math.max(0, n | 0));
    return wallet.angels - before;
  }

  // ── 激励视频各位的**发放**（纯函数，可单测；调用方只负责「广告看完了没」）──
  /** 🎁 每日礼物：金币 + 画像 */
  function grantGift(wallet) {
    wallet.coins += AD_REWARD.gift.coins;
    const got = earnAngels(wallet, AD_REWARD.gift.angels);
    return { coins: AD_REWARD.gift.coins, angels: got };
  }
  /** 🚀 开局礼包：本局多一次免费撤销 + 两次换手充能（只动 items，不碰钱包）*/
  function grantBoost(items) {
    if (!items) return false;
    items.undoFree += AD_REWARD.boost.undo;
    items.refreshCharge = Math.min(items.refreshCharge + AD_REWARD.boost.refresh, 5);
    return true;
  }
  /** 👼 图鉴加速：直接 +N 张画像。返回真正新增的张数（收满 500 后为 0）*/
  const grantGallery = wallet => earnAngels(wallet, AD_REWARD.gallery);

  /** 金币买同一件东西（不看广告的出口）。返回是否成功 */
  function buyWithCoins(wallet, kind) {
    const p = COIN_PRICE[kind];
    if (!p || wallet.coins < p) return false;
    wallet.coins -= p;
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
    PRICE, EARN, FREE, AD_GATE,
    AD_CAPS, AD_REWARD, COIN_PRICE, ymd, adQuotaLeft, adUse, adMode,
    grantGift, grantBoost, grantGallery, buyWithCoins,
    emptyWallet, newRunItems, onTurn,
    undoMode, refreshMode, payUndo, payRefresh,
    earnLevel, earnDaily, earnAd,
    endlessCoins, earnEndless, earnDouble,
    notePlayed, canShowInterstitial, noteAdShown,
    buyTheme, canClaimChest, claimChest,
    ANGELS, earnAngels,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Shop = API;
})(typeof self !== 'undefined' ? self : this);
