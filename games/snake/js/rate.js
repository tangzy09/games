// rate.js — 求好评（@capacitor-community/in-app-review，原生 only）
//
// 合规红线（app-ratings-feedback skill）：不设前置问题、不筛选用户、弹不弹由系统裁决。
// 只在**幸福时刻**问（集齐一集 / 三星通关），额度 = 15 关门槛 + 90 天冷却 + 3 次/年。
// 「调用即记账」——弹没弹系统说了算，我们按最保守算。web 端零行为。

function ratePlugin() {
  const c = (typeof window !== 'undefined') ? window.Capacitor : null;
  if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
  return (c.Plugins && c.Plugins.InAppReview) || null;
}

/** 幸福时刻调它；内部管全部额度门槛。改了 save.rate，调用方随后 persist()。返回是否真的问了。*/
function rateMaybeAsk(save) {
  const p = ratePlugin();
  if (!p || !save) return false;
  if ((save.stats.levelsCleared | 0) < 15) return false;          // 太早问 = 低分邀请函
  if (!save.rate) save.rate = { asked: [] };
  if (!Array.isArray(save.rate.asked)) save.rate.asked = [];
  const now = Date.now(), asked = save.rate.asked;
  if (asked.length && now - asked[asked.length - 1] < 90 * 86400000) return false;    // 90 天冷却
  if (asked.filter(t => now - t < 365 * 86400000).length >= 3) return false;          // 3 次/年（同苹果额度）
  asked.push(now);                                                 // 调用即记账（最保守）
  try { p.requestReview(); } catch (e) {}
  return true;
}

const Rate = { maybeAsk: rateMaybeAsk, get available() { return !!ratePlugin(); } };
if (typeof module !== 'undefined' && module.exports) module.exports = Rate;
