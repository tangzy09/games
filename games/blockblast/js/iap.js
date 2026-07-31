// ════════════════════════════════════════
// iap.js — 去广告买断（RevenueCat @revenuecat/purchases-capacitor）。
//
// 三方一字对齐（差一个字都不解锁）：
//   App Store productId = cubeblast_noads（非消耗型 $2.99，ASC 已建，READY_TO_SUBMIT）
//   RevenueCat store_identifier = cubeblast_noads，挂 entitlement `noads`（$rc_lifetime 包）
//   本文件 PRODUCT / ENTITLEMENT = 同上
//
// web / 插件缺失 = 回退到本地开关（web 版没有支付渠道，行为与 1.0 相同）。
// ⚠ apiKey 从 GAME_CONFIG.rc.ios 读（appl_ 公开 key，可进 git）；没配 = 不初始化、走回退。
// ⚠ 恢复购买是苹果对非消耗型的硬性要求（商店页有 Restore 按钮，见 render 的 renderShop）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const PRODUCT = 'cubeblast_noads';
  const ENTITLEMENT = 'noads';
  let ready = false;

  function plugin() {
    const c = root.Capacitor;
    if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
    return (c.Plugins && c.Plugins.Purchases) || null;
  }

  const hasPro = info => {
    if (!info || !info.customerInfo) return false;
    const ci = info.customerInfo;
    if (ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENTITLEMENT]) return true;
    // 兜底：entitlement 没配好时直接看非订阅交易里有没有这个产品
    return (ci.nonSubscriptionTransactions || []).some(t => (t.productIdentifier || t.productId) === PRODUCT);
  };

  async function init(apiKey) {
    const p = plugin();
    if (!p || !apiKey) return false;
    try {
      await p.configure({ apiKey });
      ready = true;
    } catch (e) { console.warn('IAP init failed', e); }
    return ready;
  }

  /** 静默查询当前是否已购（换机/重装恢复用；boot 时调，别打扰玩家）*/
  async function isPro() {
    const p = plugin();
    if (!p || !ready) return false;
    try { return hasPro(await p.getCustomerInfo()); } catch (e) { return false; }
  }

  /**
   * 买去广告。返回 { ok, web }：
   *   web=true = 无支付渠道的回退（web 版），调用方沿用本地开关行为。
   *   ok=false = 玩家取消/失败 ⇒ 什么也不发生（绝不惩罚）。
   */
  async function buy() {
    const p = plugin();
    if (!p || !ready) return { ok: true, web: true };
    try {
      // 优先走 offering 的 lifetime 包；没有就直接按产品买（两条路都到同一个 App Store 商品）
      try {
        const offs = await p.getOfferings();
        const pkgs = offs && offs.current && offs.current.availablePackages || [];
        const pkg = pkgs.find(k => k.product && k.product.identifier === PRODUCT) || pkgs[0];
        if (pkg) {
          const r = await p.purchasePackage({ aPackage: pkg });
          return { ok: hasPro(r) };
        }
      } catch (e) { /* offering 没配好 → 走产品直购 */ }
      const prods = await p.getProducts({ productIdentifiers: [PRODUCT] });
      const prod = prods && prods.products && prods.products[0];
      if (!prod) return { ok: false };
      const r = await p.purchaseStoreProduct({ product: prod });
      return { ok: hasPro(r) };
    } catch (e) {
      return { ok: false };                    // 取消/网络失败：静默，玩家没损失
    }
  }

  /** 恢复购买（苹果对非消耗型的硬性要求）*/
  async function restore() {
    const p = plugin();
    if (!p || !ready) return { ok: false };
    try { return { ok: hasPro(await p.restorePurchases()) }; }
    catch (e) { return { ok: false }; }
  }

  const API = { init, isPro, buy, restore, get native() { return !!plugin(); } };
  root.IAP = API;
})(typeof self !== 'undefined' ? self : this);
