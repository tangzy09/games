// ════════════════════════════════════════
// quests.js — 每日任务（纯逻辑，可 node 单测）。
//
// 「今天该干嘛」的答案：每天 3 个轻任务，完成即发（金币 + 天使图），无需手动领取。
// 任务由 dayNo **确定性生成**（同一天全球同一组，与每日谜题同一世界观）——
// 不存任务定义，只存进度 ⇒ 存档零膨胀、换设备不丢一致性。
// ⛔ 任务只做「顺手能完成」的轻目标：它是回访理由，不是第二套肝度系统。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // 任务池：t=类型（进度事件），mode=计数方式（sum 累加 / max 单盘最大），targets=难度轮换
  const POOL = [
    { t: 'lines',    mode: 'sum', targets: [10, 15, 20] },   // 消行
    { t: 'games',    mode: 'sum', targets: [2, 3, 4] },      // 完成盘数（输赢都算）
    { t: 'crystals', mode: 'sum', targets: [3, 5, 8] },      // 收集水晶
    { t: 'win',      mode: 'sum', targets: [1, 2, 2] },      // 通关
    { t: 'sweep',    mode: 'sum', targets: [1, 1, 2] },      // SWEEP
    { t: 'score',    mode: 'max', targets: [600, 1000, 1500] },  // 单盘分数
    { t: 'streak',   mode: 'max', targets: [3, 4, 5] },      // 单盘最长连击
  ];
  const REWARD = { coins: 30, angels: 1 };                   // 每个任务的奖励

  const h32 = (a, b) => {
    let h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 1, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2654435761) >>> 0;
    return (h ^ (h >>> 13)) >>> 0;
  };

  /** 今天的 3 个任务（确定性：同 dayNo 恒同组）*/
  function todays(day) {
    const picked = [];
    let salt = 0;
    while (picked.length < 3) {
      const q = POOL[h32(day, salt) % POOL.length];
      salt++;
      if (picked.some(p => p.t === q.t)) continue;
      picked.push({ t: q.t, mode: q.mode, target: q.targets[h32(day, salt + 100) % q.targets.length] });
    }
    return picked;
  }

  /** 确保 profile.quests 是「今天」的（跨天自动重置）*/
  function ensure(profile, day) {
    if (!profile.quests || profile.quests.day !== day) {
      profile.quests = { day, prog: {}, done: [] };
    }
    return profile.quests;
  }

  /**
   * 上报进度。返回**这次新完成**的任务列表（调用方发奖励）。
   * mode=max 的类型传当前值（如本盘分数），sum 的传增量。
   */
  function bump(profile, day, type, n) {
    const st = ensure(profile, day);
    const qs = todays(day);
    const completed = [];
    qs.forEach((q, i) => {
      if (q.t !== type || st.done.includes(i)) return;
      const cur = st.prog[i] || 0;
      st.prog[i] = q.mode === 'max' ? Math.max(cur, n) : cur + n;
      if (st.prog[i] >= q.target) { st.done.push(i); completed.push(q); }
    });
    return completed;
  }

  /** 任务页/目标条用：[{t, target, prog, done}] */
  function status(profile, day) {
    const st = ensure(profile, day);
    return todays(day).map((q, i) => ({
      t: q.t, target: q.target,
      prog: Math.min(st.prog[i] || 0, q.target),
      done: st.done.includes(i),
    }));
  }

  const API = { POOL, REWARD, todays, ensure, bump, status };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Quests = API;
})(typeof self !== 'undefined' ? self : this);
