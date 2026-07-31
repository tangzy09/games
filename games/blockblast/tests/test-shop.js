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

// ════════ ⛔ 插屏总闸门（2026-07-31 定稿）：前 50 盘零插屏；之后每 10 盘至多 1 个 + 2min 间隔 ════════
{
  const now0 = 1e12;
  const w = Shop.emptyWallet();
  for (let g = 1; g <= 50; g++) {
    Shop.notePlayed(w);
    assert(!Shop.canShowInterstitial(w, now0), `第 ${g} 盘仍在免广告期`);
  }
  assert.strictEqual(w.gamesPlayed, 50);
  Shop.notePlayed(w);                                        // 第 51 盘
  assert(Shop.canShowInterstitial(w, now0), '第 51 盘起才可能出第一个');
  Shop.noteAdShown(w, now0);
  assert.strictEqual(w.gamesSinceAd, 0);
  for (let g = 0; g < 9; g++) {
    Shop.notePlayed(w);
    assert(!Shop.canShowInterstitial(w, now0 + 1e7), `出过之后第 ${g + 1} 盘还不够 10 盘`);
  }
  Shop.notePlayed(w);                                        // 攒满 10 盘
  assert(Shop.canShowInterstitial(w, now0 + 1e7), '再攒满 10 盘才有下一个');
  assert(!Shop.canShowInterstitial(w, now0 + 60 * 1000), '⛔ 距上次插屏不足 2 分钟不出');
  console.log('test-shop: 插屏总闸门 OK（前 50 盘免 / 每 10 盘至 1 / 2min 间隔）');
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

// ════════ noAds 历史开关：闸门永远关死（老用户的去广告继续兑现，不收回）════════
{
  const w = Shop.emptyWallet();
  w.gamesPlayed = 999; w.gamesSinceAd = 999; w.noAds = true;
  assert(!Shop.canShowInterstitial(w, 1e12), 'noAds ⇒ 插屏一个都没有');
  console.log('test-shop: noAds 历史开关 OK');
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

// ════════ 章末宝箱：全章 ≥1 星才能领、一章一次 ════════
{
  const Levels = require('../js/levels.js');
  const ch = Levels.CHAPTERS[0];
  const w = Shop.emptyWallet();
  const prog = {};
  assert(!Shop.canClaimChest(w, prog, ch), '一关没打不能领');
  for (let id = ch.from; id <= ch.to; id++) prog[id] = 1;
  prog[ch.to] = 0;
  assert(!Shop.canClaimChest(w, prog, ch), '差一关也不能领');
  prog[ch.to] = 2;
  assert(Shop.canClaimChest(w, prog, ch), '全章 ≥1 星 → 可领');
  const before = w.coins;
  assert(Shop.claimChest(w, prog, ch));
  assert.strictEqual(w.coins, before + ch.chest, `宝箱 +${ch.chest}`);
  assert(!Shop.claimChest(w, prog, ch), '不能重复领');
  console.log('test-shop: 章末宝箱 OK');
}

// ════════ 天使图收集：顺序发放、封顶 500、返回实际新增 ════════
{
  const w = Shop.emptyWallet();
  assert.strictEqual(Shop.ANGELS.total, 500);
  assert.strictEqual(Shop.earnAngels(w, 1), 1, '每盘 +1');
  assert.strictEqual(Shop.earnAngels(w, 2), 2, '通关 +2');
  assert.strictEqual(w.angels, 3);
  w.angels = 499;
  assert.strictEqual(Shop.earnAngels(w, 3), 1, '封顶 500：只发得出 1 张');
  assert.strictEqual(w.angels, 500);
  assert.strictEqual(Shop.earnAngels(w, 1), 0, '满了不再发');
  assert.strictEqual(Shop.earnAngels(w, -5), 0, '负数不扣');
  console.log('test-shop: 天使图收集 OK');
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
