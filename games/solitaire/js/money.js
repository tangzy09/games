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
//   5. **横幅绝不遮牌** —— 布局为它**预留**空间（`Ads.bannerReserve()`），不是盖上去。
//      ⛔ 而且**横幅现在整个关着**（`bannerOn: false`，2026-08-03）—— 见下面那笔账。
//
// 横幅本来是设计上的主力收入（纸牌单次会话 10-15 分钟，曝光时长极高且不打断），
// **但那是有量之后的事**：现在没量 ⇒ 关掉，把 14.5% 的屏幕还给牌。
// 现在的两条腿：插屏（克制）+ 激励视频 = **纯增益**（外观/图鉴/金币×2）+ **救场**
//   （🃏 万能牌,2026-07-31 用户拍板,与 snake 的「AI 救场看广告」同类）——
//   ⚠ 但撤销/提示/证明这三样**永远免费**,救场绝不许挤占它们。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const K = () => CFG.key('money');
  const AD_FREE_DEALS = 30;              // ⭐ 蜜月期：前 30 盘零广告（横幅也不出——首因效应和评分关键期）
  const AD_EVERY_DEALS = 4;              // 插屏冷却：距上次 ≥4 盘（⛔ 仍只在赢局后，输局永不出）
  // ⛔ **横幅总开关 —— 现在是关的（2026-08-03 用户拍板）**。改这个值前先把下面这笔账重算一遍：
  //   横幅收入 = 曝光 × eCPM，**随量线性增长**；代价（iPhone 上 124px ≈ 屏高 14.5% + 早期差评）
  //   **立刻满格**。DAU 个位数时算下来一个月 $2-3，而这 14.5% 在纸牌（尤其 Spider 10 列）
  //   是实打实换成更小的牌。⇒ **先攒量、后开广告**，不是反过来。
  //   ⭐ 什么时候开回来：留存稳住、DAU 到几百量级（那时同样的伤害换来的钱才有意义）。
  //   开 = 这一行改 true（AdMob 后台的横幅广告位一直留着，不用动）。
  //   ⚠ 开回来时**顺手把 privacy.html 里的广告形态改回去**（那里现在照实写着「没有横幅」）。
  //   保留的两条腿：**插屏**（赢局后 + ≥4 盘冷却 + 输局永不出，零版面代价）+
  //   **激励视频**（玩家主动选的纯增益，还是金币经济的消耗端，删了整套收集就空转）。

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

  // ⭐ 开局就送的可爱款（= 新增 20 款里的一半）。⚠ **老玩家也要补发**：只写进 state 的默认值
  //   只对新档生效，已经玩过的人永远拿不到 —— 所以 load() 之后做一次并集（见下）。
  const FREE_GIFTS = {
    back:  ['hearts', 'cloud', 'paws', 'bubbles', 'daisy', 'gingham'],
    table: ['blush', 'lilac', 'teal', 'moss'],
  };

  function load() {
    try { Object.assign(state, JSON.parse(Platform.storage.get(K()) || '{}')); } catch (e) {}
    // 送的东西一律走并集补齐（幂等；玩家已有的不动，也不会因为读档把新赠品洗掉）
    let add = 0;
    for (const id of FREE_GIFTS.back) if (!state.ownedBacks.includes(id)) { state.ownedBacks.push(id); add++; }
    for (const id of FREE_GIFTS.table) if (!state.ownedTables.includes(id)) { state.ownedTables.push(id); add++; }
    if (add) save();
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
  //   2026-08-01 再加厚到 100：**一条广告就买得动一款中级牌背**（60-80 档），
  //   「看一条 → 立刻换新牌背」这笔账玩家一眼算得清，比「攒三条」有力得多。
  //   ⚠ 真正的发放量由 main.js 的 AD_GIVE.coins 传进来（按钮标签用的是同一个常量，
  //     两处各写一份必然漂）；这里的值只是缺省。
  const AD_COINS = 100;

  /** 赢局发金币。返回本次发放量 —— 结算屏「看广告 ×2」按它翻倍（纯增益，不看也拿基础金币）*/
  function earnWin(cleanWin) {
    const n = WIN_COINS + (cleanWin ? CLEAN_BONUS : 0);
    state.coins += n;
    save();
    return n;
  }
  function earnAd(n) { state.coins += (n > 0 ? n : AD_COINS); save(); }

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
    // ⭐ 可爱系 12 款（2026-08-01 用户点名「再多 20 个可爱的」）：程序化图案，零素材。
    //   **一半开局就送**（cost:0，见 FREE_GIFTS）——新玩家第一次打开收藏页就有六款可换，
    //   收集页从「一排锁」变成「我已经有一些了」，这是收集系统起步最关键的一下。
    { id: 'hearts',   cost: 0 },
    { id: 'cloud',    cost: 0 },
    { id: 'paws',     cost: 0 },
    { id: 'bubbles',  cost: 0 },
    { id: 'daisy',    cost: 0 },
    { id: 'gingham',  cost: 0 },
    { id: 'bows',     cost: 25 },
    { id: 'rainbow',  cost: 30 },
    { id: 'berry',    cost: 35 },
    { id: 'moon',     cost: 40 },
    { id: 'sprinkle', cost: 45 },
    { id: 'sweets',   cost: 55 },
    // ⭐ 可爱**高级**款 10 张（本机 Flux 无缝插画）：收集曲线的后段，定价接在 koi/peacock 那档之后。
    //   ⚠ 有意**不送**这一档 —— 送掉的是「攒币的理由」；免费送的是上面那 6 张矢量可爱款。
    { id: 'kitty',    cost: 150 },
    { id: 'bunny',    cost: 170 },
    { id: 'garden',   cost: 190 },
    { id: 'whales',   cost: 210 },
    { id: 'ribbon',   cost: 230 },
    { id: 'teatime',  cost: 260 },
    { id: 'peachy',   cost: 290 },
    { id: 'cocoa',    cost: 320 },
    { id: 'starcat',  cost: 380 },
    { id: 'lanterns', cost: 440 },
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
    // ⭐ 可爱系 8 款（暗调粉彩 + 极淡图案；⛔ 桌布必须偏暗，白牌面要浮得出来）。同样送一半。
    { id: 'blush',   cost: 0 },
    { id: 'lilac',   cost: 0 },
    { id: 'teal',    cost: 0 },
    { id: 'moss',    cost: 0 },
    { id: 'plum',    cost: 40 },
    { id: 'night',   cost: 50 },
    { id: 'sea',     cost: 60 },
    { id: 'cocoa',   cost: 70 },
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

  /**
   * ⭐ 免费解锁券兑现：**任选**一款还没有的收藏品（牌背/桌布/瀑布特效都行，含 500 币那档）。
   *   与 buy() 的唯一差别是不扣金币 —— 广告位给的是「你想要的那一款」，不是「最便宜的那款」。
   */
  function grantFree(kind, id) {
    const item = itemsOf(kind).find(x => x.id === id);
    if (!item || owns(kind, id)) return false;
    KINDS[kind].owned().push(id);
    equip(kind, id);
    save();
    return true;
  }

  /** 直接白送一款还没有的牌背（旧的外观位实现，红线测试仍在用；线上入口已换成 grantFree 券）*/
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
    // 横幅总开关（见文件头那笔账）。**可写** —— E2E 打开它来验「开回来时第 31 盘亮出」那条路径。
    bannerOn: false,
    canShowInterstitial, noteWin, adFree,
    earnWin, earnAd,
    BACKS, TABLES, FXS, owns, itemsOf, buy, equip, buyNoAds, grantCheapestBack, grantFree,
    get coins() { return state.coins; },
    get noAds() { return state.noAds; },
  };
})(typeof self !== 'undefined' ? self : this);
