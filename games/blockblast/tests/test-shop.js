const assert = require('assert');
const Shop = require('../js/shop.js');
const Core = require('../js/core.js');

// ════════ 道具的三段阶梯：免费 → 广告 → 金币（玩家永远先拿到不花钱的选项）════════
{
  const w = Shop.emptyWallet(), it = Shop.newRunItems();
  assert.strictEqual(Shop.undoMode(w, it), 'free', '每局第 1 次撤销免费');
  assert(Shop.payUndo(w, it, 'free'));
  assert.strictEqual(it.undoFree, 0);
  assert.strictEqual(Shop.undoMode(w, it), 'ad', '免费用完 → 看广告');
  // 买了去广告的玩家没有广告可看 ⇒ 走金币
  w.noAds = true;
  w.coins = 100;
  assert.strictEqual(Shop.undoMode(w, it), 'coins', '去广告用户 → 直接用金币');
  assert(Shop.payUndo(w, it, 'coins'));
  assert.strictEqual(w.coins, 0);
  assert.strictEqual(Shop.undoMode(w, it), 'no', '金币不够 → 用不了');
  console.log('test-shop: 撤销的三段阶梯 OK');
}

// ════════ 换手道具：每 8 次落子充能 1 次 ════════
{
  const w = Shop.emptyWallet(), it = Shop.newRunItems();
  assert.strictEqual(Shop.refreshMode(w, it), 'ad', '开局没电 → 看广告（不是「有电才能看广告」——那是写反了）');
  for (let i = 0; i < 7; i++) Shop.onTurn(it);
  assert.strictEqual(it.refreshCharge, 0, '7 步还没充满');
  Shop.onTurn(it);
  assert.strictEqual(it.refreshCharge, 1, '第 8 步充能 1 格');
  assert.strictEqual(Shop.refreshMode(w, it), 'free');
  assert(Shop.payRefresh(w, it, 'free'));
  assert.strictEqual(it.refreshCharge, 0);
  console.log('test-shop: 换手充能 OK');
}

// ════════ ⛔ 红线 3：插屏只在通关后、每 3 次最多 1 个；失败/局中永不出 ════════
{
  const w = Shop.emptyWallet();
  assert(!Shop.canShowInterstitial(w), '第 1 次通关不出插屏');
  Shop.noteWin(w, false);
  assert(!Shop.canShowInterstitial(w), '第 2 次也不出');
  Shop.noteWin(w, false);
  assert(!Shop.canShowInterstitial(w));
  Shop.noteWin(w, false);
  assert(Shop.canShowInterstitial(w), '第 3 次通关后才可能出一个');
  Shop.noteWin(w, true);                       // 出过了 → 计数归零
  assert(!Shop.canShowInterstitial(w), '出过之后重新计数');
  console.log('test-shop: 插屏频次红线 OK（每 3 次通关最多 1 个）');
}

// ════════ ✅ 去广告 IAP：买了之后一个非自愿广告都没有，但**功能不能变少** ════════
{
  const w = Shop.emptyWallet();
  w.noAds = true;
  assert(!Shop.canShowInterstitial(w), '买了去广告 ⇒ 插屏一个都没有');
  // 关键：付费玩家**不能失去**激励视频能拿到的东西 —— 它们改为「用金币」或直接给
  const it = Shop.newRunItems();
  it.undoFree = 0;
  assert.notStrictEqual(Shop.undoMode(w, it), 'ad', '付费玩家不该被要求看广告');
  w.coins = 999;
  assert.strictEqual(Shop.undoMode(w, it), 'coins', '改为用金币（功能还在）');
  console.log('test-shop: 去广告 IAP 不削功能 OK');
}

// ════════ 金币经济闭环（不能出现「一次撤销 = 打 10 关」那种逼氪价）════════
{
  const w = Shop.emptyWallet();
  const startCoins = w.coins;
  Shop.earnLevel(w, 3);                          // 三星通关
  const perWin = w.coins - startCoins;
  assert(perWin >= Shop.PRICE.refresh / 2, `一次通关拿 ${perWin} 币，换手要 ${Shop.PRICE.refresh} 币 —— 不能太离谱`);
  assert(Shop.PRICE.undo <= perWin * 3,
    `撤销 ${Shop.PRICE.undo} 币 ≈ ${(Shop.PRICE.undo / perWin).toFixed(1)} 次通关（原作 1300 币 ≈ 打 10 关,是逼氪价,不学）`);
  Shop.earnAd(w);
  assert(w.coins > 0);
  console.log(`test-shop: 经济闭环 OK（通关 +${perWin}，撤销 -${Shop.PRICE.undo}，换手 -${Shop.PRICE.refresh}）`);
}

// ════════ 无尽结算：得分换金币（score/100，封顶 100 —— 马拉松局不能变成刷币机）════════
{
  const w = Shop.emptyWallet();
  assert.strictEqual(Shop.endlessCoins(0), 0);
  assert.strictEqual(Shop.endlessCoins(99), 0, '不到 100 分没有币（白送的开局不产币）');
  assert.strictEqual(Shop.endlessCoins(2971), 29, '中位局 2971 分 ≈ 29 币（和通关 20-50 同量级）');
  assert.strictEqual(Shop.endlessCoins(999999), 100, '封顶 100');
  const before = w.coins;
  const n = Shop.earnEndless(w, 2971);
  assert.strictEqual(n, 29);
  assert.strictEqual(w.coins, before + 29);
  Shop.earnDouble(w, n);                          // 看广告翻倍 = 把这笔再给一遍
  assert.strictEqual(w.coins, before + 58);
  console.log('test-shop: 无尽结算金币 OK');
}

// ════════ ⛔ 无尽转场插屏的四重护栏：首日零插屏 / 短局不出 / 距上次 ≥120s / 每 3 局最多 1 个 ════════
{
  const DAY = 24 * 3600 * 1000;
  const now = 10 * DAY;                            // 固定时钟，测试不依赖真实时间
  const okRun = 120 * 1000;                        // 一局 2 分钟（≥90s 门槛）
  const w = Shop.emptyWallet();
  w.installAt = now - 2 * DAY;                     // 装了两天的老玩家
  w.runsSinceAd = 3;
  assert(Shop.canShowEndlessInterstitial(w, okRun, now), '四个条件全满足 → 可以出');

  // 每个护栏单独都能拦下
  assert(!Shop.canShowEndlessInterstitial(Object.assign({}, w, { noAds: true }), okRun, now), '去广告 ⇒ 永不');
  assert(!Shop.canShowEndlessInterstitial(Object.assign({}, w, { installAt: now - DAY / 2 }), okRun, now),
    '⛔ 安装后 24h 内零插屏（首日体验 > 首日收入）');
  assert(!Shop.canShowEndlessInterstitial(w, 30 * 1000, now), '⛔ 短局（<90s = 挫败局）不出');
  assert(!Shop.canShowEndlessInterstitial(Object.assign({}, w, { lastAdAt: now - 60 * 1000 }), okRun, now),
    '⛔ 距上次插屏不足 120s 不出');
  assert(!Shop.canShowEndlessInterstitial(Object.assign({}, w, { runsSinceAd: 2 }), okRun, now), '⛔ 不满 3 局不出');

  // 出过之后：计数与时钟都归位
  Shop.noteEndlessAdShown(w, now);
  assert.strictEqual(w.runsSinceAd, 0);
  assert.strictEqual(w.lastAdAt, now);
  assert(!Shop.canShowEndlessInterstitial(w, okRun, now + 1000), '刚出过 → 至少再等 3 局 + 120s');
  Shop.noteEndlessRun(w); Shop.noteEndlessRun(w); Shop.noteEndlessRun(w);
  assert(Shop.canShowEndlessInterstitial(w, okRun, now + 200 * 1000), '3 局 + 120s 之后才可能再出');
  console.log('test-shop: 无尽插屏四重护栏 OK');
}

// ════════ 通关插屏也吃「首日 + 间隔」护栏（老签名不带时钟的调用仍然成立）════════
{
  const DAY = 24 * 3600 * 1000, now = 10 * DAY;
  const w = Shop.emptyWallet();
  w.winsSinceAd = 3;
  assert(Shop.canShowInterstitial(w), 'installAt=0（老钱包）→ 不做首日判断，行为不变');
  w.installAt = now - DAY / 2;
  assert(!Shop.canShowInterstitial(w, now), '⛔ 首日通关也不出插屏');
  w.installAt = now - 2 * DAY;
  w.lastAdAt = now - 60 * 1000;
  assert(!Shop.canShowInterstitial(w, now), '⛔ 距上次任何插屏不足 120s 不出（和无尽共用时钟）');
  w.lastAdAt = now - 300 * 1000;
  assert(Shop.canShowInterstitial(w, now), '护栏全过 → 可以出');
  console.log('test-shop: 通关插屏护栏 OK');
}

// ════════ 金币皮肤：买 → 入手 + 扣款；重复买 / 钱不够都拒绝 ════════
{
  const Themes = require('../js/themes.js');
  const paid = Themes.THEMES.filter(t => t.coins);
  assert(paid.length >= 2, '至少 2 套金币皮肤（金币要有出口，不然「看广告领币」是个死广告位）');
  const w = Shop.emptyWallet();
  const t = paid[0];
  assert(!Shop.buyTheme(w, t), '开局 50 币买不起（不是白送）');
  w.coins = t.coins + 10;
  assert(Shop.buyTheme(w, t), '钱够 → 买到');
  assert.strictEqual(w.coins, 10, '扣款正确');
  assert(w.themes.includes(t.id), '入手记录在钱包里');
  assert(!Shop.buyTheme(w, t), '重复买拒绝（不重复扣款）');
  assert(Themes.isUnlocked(t, 0, w.themes), '买了就解锁（与星星无关）');
  assert(!Themes.isUnlocked(t, 999, []), '金币皮肤**不能**靠星星解锁（两条赛道分开）');
  console.log('test-shop: 金币皮肤 OK');
}

// ════════ 换一手：块流是预生成的 ⇒ 换手只是跳过，**换不出更合意的块** ════════
{
  const s = Core.newGame(2024);
  const before = Core.tray(s).map(p => p.id);
  const nextBefore = Core.nextHand(s).map(p => p.id);   // 换手前看到的「下一手」
  assert(Core.refreshHand(s));
  const after = Core.tray(s).map(p => p.id);
  assert.deepStrictEqual(after, nextBefore,
    '换一手 = 直接拿到「下一手」—— 不是重抽（预览过的块不会被偷偷换掉，这是公平承诺的一部分）');
  assert.notDeepStrictEqual(after, before);
  assert.strictEqual(s.undo, null, '换过手就不能再撤销回去（否则可以来回刷）');
  console.log('test-shop: 换一手不是重抽 OK');
}
