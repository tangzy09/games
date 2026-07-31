// notify.js — 本地推送提醒（@capacitor/local-notifications，原生 only）
//
// 两枪：① 每日 19:00「今天的天使可以领了」（重复）；② 今晚 21:30 streak 保护
//（只在「有 ≥2 天连续 且 今天还没领」时排一枪——⚠ 领过就必须撤掉，绝不放空炮）。
// 开关在主界面设置（save.settings.remind，默认关；开时才申请权限）。web/插件缺失全静默。

const NOTIFY_ID_DAILY = 21, NOTIFY_ID_STREAK = 22;

function notifyPlugin() {
  const c = (typeof window !== 'undefined') ? window.Capacitor : null;
  if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
  return (c.Plugins && c.Plugins.LocalNotifications) || null;
}

/**
 * 重排全部提醒（开关切换 / boot / 领完每日礼物后都调这个，幂等）。
 * claimable = 今天的天使还没领（main.js 的 dailyClaimable()）。
 */
async function notifyReschedule(save, claimable) {
  const p = notifyPlugin();
  if (!p || !save) return;
  try {
    await p.cancel({ notifications: [{ id: NOTIFY_ID_DAILY }, { id: NOTIFY_ID_STREAK }] }).catch(() => {});
    if (!save.settings || !save.settings.remind) return;
    const perm = await p.requestPermissions();
    if (!perm || perm.display !== 'granted') return;

    const list = [];
    const at = new Date(); at.setHours(19, 0, 0, 0);
    if (at <= new Date()) at.setDate(at.getDate() + 1);
    list.push({ id: NOTIFY_ID_DAILY, title: T('notif.dailyT'), body: T('notif.dailyB'), schedule: { at, every: 'day' } });

    const streak = (save.daily && save.daily.giftStreak) || 0;
    if (streak >= 2 && claimable) {
      const at2 = new Date(); at2.setHours(21, 30, 0, 0);
      if (at2 > new Date()) {
        list.push({ id: NOTIFY_ID_STREAK, title: T('notif.streakT'), body: T('notif.streakB', { n: streak }), schedule: { at: at2 } });
      }
    }
    await p.schedule({ notifications: list });
  } catch (e) { /* 权限被拒/插件异常：静默，绝不影响游戏 */ }
}

const Notify = { reschedule: notifyReschedule, get available() { return !!notifyPlugin(); } };
if (typeof module !== 'undefined' && module.exports) module.exports = Notify;
