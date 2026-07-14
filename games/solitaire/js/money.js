// ════════════════════════════════════════
// money.js — 变现（DESIGN §7.4）。
//
// ⛔ 这个品类的差评是被广告逼出来的，红线**写成代码**，不是写成注释：
//
//   1. **撤销 / 提示 / 重开 / 换一局 / 「这局还有解吗」—— 永远免费，永远不看广告。**
//      玩家原话：「他们**故意让你更容易无路可走**，好逼你看广告拿提示。」
//      ⭐ 而且我们实测过：**玩家输掉的局里有 45% 其实还有解**（tools/measure-deadlock.js）——
//      把提示锁在广告后面 = **收钱才让你知道自己还有救**。这事我们不干。
//   2. **绝不局间连播插屏**（微软那个「12 连播」是本品类最致命的叙事）。
//      插屏只在**赢局结算后**出，且每 3 局最多 1 个，输局永远不出。
//   3. **不要体力，不要押注式金币**（Klondike 玩家零容忍）。
//   4. **一次性去广告 IAP，不是订阅**（「付费还看广告」是微软最毒的一条差评）。
//   5. **横幅绝不遮牌** —— 布局为它**预留**空间（Layout.BANNER_H），不是盖上去。
//
// 主力收入是**横幅**：纸牌单次会话 10-15 分钟（所有休闲品类里最长的之一）
// ⇒ 曝光时长极高且不打断。激励视频只用于**纯增益**（牌背/桌布皮肤）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const K = () => CFG.key('money');
  const INTERSTITIAL_EVERY = 3;          // 每 3 次**赢局**最多 1 个插屏

  const state = {
    noAds: false,                        // 一次性 IAP
    winsSinceAd: 0,
    coins: 0,                            // 只能靠赢局/看广告赚，**不能买**（不做押注经济）
    ownedBacks: ['classic'],             // 已解锁的牌背
    ownedTables: ['felt'],               // 已解锁的桌布
    back: 'classic',
    table: 'felt',
  };

  function load() {
    try { Object.assign(state, JSON.parse(Platform.storage.get(K()) || '{}')); } catch (e) {}
  }
  function save() {
    try { Platform.storage.set(K(), JSON.stringify(state)); } catch (e) {}
  }

  // ── 插屏：只在赢局后，且节流 ──
  /** ⚠ 输局**永远**不出插屏 —— 刚输完还甩你一脸广告，是这个品类最招恨的做法 */
  function canShowInterstitial() {
    if (state.noAds) return false;
    return state.winsSinceAd + 1 >= INTERSTITIAL_EVERY;
  }
  function noteWin(shown) {
    state.winsSinceAd = shown ? 0 : state.winsSinceAd + 1;
    save();
  }

  // ── 金币：赢局给，看广告给。**没有任何东西能用金币买到「优势」** ──
  //    金币只能换外观（牌背/桌布）。这是「消耗端」，没有它激励视频约等于零收入。
  const WIN_COINS = 10;
  const CLEAN_BONUS = 15;                // 零撤销零提示赢 —— 奖励「真本事」
  const AD_COINS = 25;

  function earnWin(cleanWin) {
    state.coins += WIN_COINS + (cleanWin ? CLEAN_BONUS : 0);
    save();
  }
  function earnAd() { state.coins += AD_COINS; save(); }

  // ── 收藏品（激励视频的消耗端）──
  const BACKS = [
    { id: 'classic', cost: 0 },
    { id: 'waves',   cost: 60 },
    { id: 'plaid',   cost: 80 },
    { id: 'stars',   cost: 120 },
    { id: 'gold',    cost: 200 },
  ];
  const TABLES = [
    { id: 'felt',    cost: 0 },
    { id: 'midnight', cost: 60 },
    { id: 'wood',    cost: 100 },
    { id: 'rose',    cost: 150 },
  ];

  const owns = (kind, id) => (kind === 'back' ? state.ownedBacks : state.ownedTables).includes(id);
  const itemsOf = kind => (kind === 'back' ? BACKS : TABLES);

  function buy(kind, id) {
    const item = itemsOf(kind).find(x => x.id === id);
    if (!item || owns(kind, id) || state.coins < item.cost) return false;
    state.coins -= item.cost;
    (kind === 'back' ? state.ownedBacks : state.ownedTables).push(id);
    equip(kind, id);
    save();
    return true;
  }
  function equip(kind, id) {
    if (!owns(kind, id)) return false;
    if (kind === 'back') state.back = id; else state.table = id;
    save();
    return true;
  }

  function buyNoAds() { state.noAds = true; save(); }

  root.Money = {
    load, save, state,
    canShowInterstitial, noteWin,
    earnWin, earnAd,
    BACKS, TABLES, owns, itemsOf, buy, equip, buyNoAds,
    get coins() { return state.coins; },
    get noAds() { return state.noAds; },
  };
})(typeof self !== 'undefined' ? self : this);
