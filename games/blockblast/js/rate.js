// ════════════════════════════════════════
// rate.js — 求好评（@capacitor-community/in-app-review，原生 only）。
// 合规红线（app-ratings-feedback skill）：不设前置问题、不筛选用户、弹不弹由系统裁决；
// 只在**幸福时刻**问（三星通关 / 破纪录），弹药 3 次/年 + 90 天冷却 + 15 盘门槛。
// 「调用即记账」：弹没弹系统说了算、我们按最保守算。web 零行为。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  function plugin() {
    const c = root.Capacitor;
    if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
    return (c.Plugins && c.Plugins.InAppReview) || null;
  }

  /** 幸福时刻调它；内部管全部额度门槛。记账落在 profile.rate（调用方随后 saveProfile）。*/
  function maybeAsk(G) {
    const p = plugin();
    if (!p) return false;
    const w = G.wallet, pr = G.profile;
    if (!w || !pr) return false;
    if ((w.gamesPlayed | 0) < 15) return false;                  // 太早问 = 低分邀请函
    pr.rate = pr.rate || { asked: [] };
    const now = Date.now();
    const asked = pr.rate.asked;
    if (asked.length && now - asked[asked.length - 1] < 90 * 86400e3) return false;   // 90 天冷却
    if (asked.filter(t => now - t < 365 * 86400e3).length >= 3) return false;         // 3 次/年（苹果同额度）
    asked.push(now);                                             // 调用即记账（最保守）
    try { p.requestReview(); } catch (e) {}
    return true;
  }

  root.Rate = { maybeAsk, get available() { return !!plugin(); } };
})(typeof self !== 'undefined' ? self : this);
