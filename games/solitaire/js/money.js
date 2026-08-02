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
//      插屏只在**赢局结算后**出、输局永远不出；节奏（2026-07-31 拍板）=
//      前 30 盘蜜月零广告（横幅同步，见 main.js）+ 之后距上次 ≥4 盘冷却。
//   3. **不要体力，不要押注式金币**（Klondike 玩家零容忍）。
//   4. **不做去广告 IAP**（2026-07-31 拍板）。noAds/buyNoAds 只是死开关（红线测试用），别接 StoreKit。
//   5. **横幅绝不遮牌** —— 布局为它**预留**空间（Layout.BANNER_H），不是盖上去。
//
// 主力收入是**横幅**：纸牌单次会话 10-15 分钟（所有休闲品类里最长的之一）
// ⇒ 曝光时长极高且不打断。激励视频 = **纯增益**（外观/图鉴/金币×2）+ **救场**
//   （🃏 万能牌,2026-07-31 用户拍板,与 snake 的「AI 救场看广告」同类）——
//   ⚠ 但撤销/提示/证明这三样**永远免费**,救场绝不许挤占它们。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const K = () => CFG.key('money');
  const AD_FREE_DEALS = 30;              // ⭐ 蜜月期：前 30 盘零广告（横幅也不出——首因效应和评分关键期）
  const AD_EVERY_DEALS = 4;              // 插屏冷却：距上次 ≥4 盘（⛔ 仍只在赢局后，输局永不出）

  const state = {
    noAds: false,                        // 死开关（IAP 不做，红线测试用）
    lastAdDeal: 0,                       // 上次插屏时的盘数（stats.played 口径）
    coins: 0,                            // 只能靠赢局/看广告赚，**不能买**（不做押注经济）
    ownedBacks: ['classic'],             // 已解锁的牌背
    ownedTables: ['felt'],               // 已解锁的桌布
    ownedFx: ['classic'],                // 已解锁的瀑布特效
    back: 'classic',
    table: 'felt',
    fx: 'classic',
  };

  function load() {
    try { Object.assign(state, JSON.parse(Platform.storage.get(K()) || '{}')); } catch (e) {}
  }
  function save() {
    try { Platform.storage.set(K(), JSON.stringify(state)); } catch (e) {}
  }

  // ── 插屏：只在赢局后，且按盘数节流 ──
  /** 蜜月期判定（横幅与插屏共用；played = G.stats.played）*/
  const adFree = played => (played || 0) <= AD_FREE_DEALS;
  /** ⚠ 输局**永远**不出插屏 —— 刚输完还甩你一脸广告，是这个品类最招恨的做法 */
  function canShowInterstitial(played) {
    if (state.noAds) return false;
    if (adFree(played)) return false;
    return (played || 0) - (state.lastAdDeal || 0) >= AD_EVERY_DEALS;
  }
  function noteWin(shown, played) {
    if (shown) state.lastAdDeal = played || 0;
    save();
  }

  // ── 金币：赢局给，看广告给。**没有任何东西能用金币买到「优势」** ──
  //    金币只能换外观（牌背/桌布）。这是「消耗端」，没有它激励视频约等于零收入。
  const WIN_COINS = 10;
  const CLEAN_BONUS = 15;                // 零撤销零提示赢 —— 奖励「真本事」
  // 激励视频要「一次见效」：25 币连最便宜的牌背都买不动 ⇒ 看了也没感觉（skill 实锤）。
  //   60 币 = 三次广告换一款高级牌背，玩家读得懂这笔账。
  const AD_COINS = 60;

  /** 赢局发金币。返回本次发放量 —— 结算屏「看广告 ×2」按它翻倍（纯增益，不看也拿基础金币）*/
  function earnWin(cleanWin) {
    const n = WIN_COINS + (cleanWin ? CLEAN_BONUS : 0);
    state.coins += n;
    save();
    return n;
  }
  function earnAd() { state.coins += AD_COINS; save(); }

  // ── 收藏品（激励视频的消耗端）──
  const BACKS = [
    { id: 'classic', cost: 0 },
    { id: 'waves',   cost: 60 },
    { id: 'plaid',   cost: 80 },
    { id: 'stars',   cost: 120 },
    { id: 'gold',    cost: 200 },
    // ⭐ 易收集 10 款（2026-07-31 用户点名「很容易能收集到」）：20-80 金币,几局一款,
    //   新玩家的第一波收集爽感（Flux 无缝图案,assets/backs/）
    { id: 'cherry',   cost: 20 },
    { id: 'sunset',   cost: 25 },
    { id: 'ocean',    cost: 30 },
    { id: 'sakura',   cost: 35 },
    { id: 'mint',     cost: 40 },
    { id: 'honey',    cost: 45 },
    { id: 'snow',     cost: 50 },
    { id: 'maple',    cost: 60 },
    { id: 'lavender', cost: 70 },
    { id: 'candy',    cost: 80 },
    // ⭐ 高级款（本机 Flux 整幅插画，assets/backs/）：收集曲线的后段，定价压着瀑布特效走
    { id: 'koi',     cost: 260 },
    { id: 'peacock', cost: 320 },
    { id: 'nebula',  cost: 400 },
    { id: 'deco',    cost: 500 },
  ];
  const TABLES = [
    { id: 'felt',    cost: 0 },
    { id: 'midnight', cost: 60 },
    { id: 'wood',    cost: 100 },
    { id: 'rose',    cost: 150 },
    // ⭐ 高级材质款（本机 Flux，assets/tables/）
    { id: 'walnut',  cost: 200 },
    { id: 'bamboo',  cost: 260 },
    { id: 'velvet',  cost: 340 },
    { id: 'marble',  cost: 420 },
  ];
  // 瀑布特效（贴着产品灵魂的收藏品 —— 瀑布是玩家记了三十年的画面,比多一张牌背值钱）。
  // 定价比牌背高:它是收集曲线的后段,防止几十局就毕业、激励视频那条腿断掉(§7.2.1)。
  const FXS = [
    { id: 'classic',  cost: 0 },
    { id: 'rainbow',  cost: 150 },
    { id: 'comet',    cost: 220 },
    { id: 'confetti', cost: 300 },
  ];

  const KINDS = {
    back:  { list: BACKS,  owned: () => state.ownedBacks,  get cur() { return state.back; },  set cur(v) { state.back = v; } },
    table: { list: TABLES, owned: () => state.ownedTables, get cur() { return state.table; }, set cur(v) { state.table = v; } },
    fx:    { list: FXS,    owned: () => state.ownedFx,     get cur() { return state.fx; },    set cur(v) { state.fx = v; } },
  };

  const owns = (kind, id) => KINDS[kind].owned().includes(id);
  const itemsOf = kind => KINDS[kind].list;

  function buy(kind, id) {
    const item = itemsOf(kind).find(x => x.id === id);
    if (!item || owns(kind, id) || state.coins < item.cost) return false;
    state.coins -= item.cost;
    KINDS[kind].owned().push(id);
    equip(kind, id);
    save();
    return true;
  }
  function equip(kind, id) {
    if (!owns(kind, id)) return false;
    KINDS[kind].cur = id;
    save();
    return true;
  }

  /** 直接白送一款还没有的牌背（激励视频的外观位；挑最便宜的那款——先易后难才有收集节奏）*/
  function grantCheapestBack() {
    const cand = BACKS.filter(b => b.cost > 0 && !owns('back', b.id))
                      .sort((a, b) => a.cost - b.cost);
    if (!cand.length) return null;
    KINDS.back.owned().push(cand[0].id);
    equip('back', cand[0].id);
    save();
    return cand[0].id;
  }

  function buyNoAds() { state.noAds = true; save(); }

  root.Money = {
    load, save, state,
    canShowInterstitial, noteWin, adFree,
    earnWin, earnAd,
    BACKS, TABLES, FXS, owns, itemsOf, buy, equip, buyNoAds, grantCheapestBack,
    get coins() { return state.coins; },
    get noAds() { return state.noAds; },
  };
})(typeof self !== 'undefined' ? self : this);
