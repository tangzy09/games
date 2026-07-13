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
