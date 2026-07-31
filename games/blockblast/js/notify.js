// ════════════════════════════════════════
// notify.js — 本地推送提醒（@capacitor/local-notifications，原生 only）。
// 两枪：① 每日 19:00「今日谜题已刷新」（重复）；② 今晚 21:30 streak 保护
// （只在「有 ≥2 天连续 且 今天还没玩」时排一枪；玩过就撤——绝不放空炮）。
// 开关在设置页（G.opts.remind，默认关；开时才申请权限）。web/插件缺失全静默。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const ID_DAILY = 11, ID_STREAK = 12;

  function plugin() {
    const c = root.Capacitor;
    if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
    return (c.Plugins && c.Plugins.LocalNotifications) || null;
  }

  /** 重排全部提醒（开关切换 / boot / 每日完成后都调这个，幂等）*/
  async function reschedule(opts, profile) {
    const p = plugin();
    if (!p) return;
    try {
      await p.cancel({ notifications: [{ id: ID_DAILY }, { id: ID_STREAK }] }).catch(() => {});
      if (!opts || !opts.remind) return;
      const perm = await p.requestPermissions();
      if (!perm || perm.display !== 'granted') return;

      const notifs = [];
      // ① 每日谜题 19:00（重复）
      const at = new Date();
      at.setHours(19, 0, 0, 0);
      if (at <= new Date()) at.setDate(at.getDate() + 1);
      notifs.push({
        id: ID_DAILY,
        title: T('blockblast.notifDailyT'),
        body: T('blockblast.notifDailyB'),
        schedule: { at, every: 'day' },
      });
      // ② streak 保护：今晚 21:30 一枪（有连续、今天还没玩、且还没过点）
      const streak = (profile && profile.dailyStreak) || 0;
      const played = profile && Daily.playedToday(profile, new Date());
      if (streak >= 2 && !played) {
        const at2 = new Date();
        at2.setHours(21, 30, 0, 0);
        if (at2 > new Date()) {
          notifs.push({
            id: ID_STREAK,
            title: T('blockblast.notifStreakT'),
            body: T('blockblast.notifStreakB', { n: streak }),
            schedule: { at: at2 },
          });
        }
      }
      await p.schedule({ notifications: notifs });
    } catch (e) { /* 权限被拒/插件异常：静默，绝不影响游戏 */ }
  }

  root.Notify = { reschedule, get available() { return !!plugin(); } };
})(typeof self !== 'undefined' ? self : this);
