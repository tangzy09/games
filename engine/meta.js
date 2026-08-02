// ════════════════════════════════════════
// meta.js — 粘度层的**共享**部分：等级 / 称号 / XP 条。纯函数，双导出，零存档。
//
// ⭐ 为什么在 engine：这套东西已经在 snake（js/meta.js）和 solitaire（main.js 的 levelOf）
//   各写过一遍，blockblast 是第三份 —— 按仓库老规矩（drag.js：第三个用例出现才抽），抽在这里。
//
// ⭐ 设计（三份的共同形状，别破坏）：
//   · **只吃既有计数器**（累计分 / 落子数 / 收集数…）—— 零新玩法、零新埋点
//   · **进度零存档** —— 等级由 xp 现算，换设备/清缓存不会"掉级"，也没有可作弊的字段
//   · 曲线是几何增长：前几级几局就升（即时反馈），尾部按月计（长线）
//
// 游戏侧只需两件事：给一个 xp 数（怎么算由自己定），和 6 个称号文案（locales 里的 t1..t6）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const TITLES = ['t1', 't2', 't3', 't4', 't5', 't6'];

  /** 升到 l 级所需的累计 xp。base/ratio 可调 —— 各游戏的 xp 尺度差好几个量级 */
  function xpNeed(l, base, ratio) {
    const b = base || 300, k = ratio || 1.35;
    return Math.round(b * Math.pow(k, Math.max(1, l) - 1));
  }
  function levelOf(xp, base, ratio) {
    let l = 1;
    while (l < 99 && (xp | 0) >= xpNeed(l, base, ratio)) l++;
    return l;
  }
  /** 六档称号：1-4 / 5-9 / 10-14 / 15-19 / 20-24 / 25+ */
  function titleKey(l) {
    return TITLES[l >= 25 ? 5 : l >= 20 ? 4 : l >= 15 ? 3 : l >= 10 ? 2 : l >= 5 ? 1 : 0];
  }
  /** 画 XP 条要的一切：当前级 / 本级两端 / 进度 0..1 */
  function levelProgress(xp, base, ratio) {
    const l = levelOf(xp, base, ratio);
    const from = l > 1 ? xpNeed(l - 1, base, ratio) : 0, to = xpNeed(l, base, ratio);
    return {
      level: l, title: titleKey(l), from, to,
      cur: (xp | 0) - from, span: to - from,
      pct: Math.max(0, Math.min(1, ((xp | 0) - from) / Math.max(1, to - from))),
    };
  }

  const API = { TITLES, xpNeed, levelOf, titleKey, levelProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Meta = API;
})(typeof self !== 'undefined' ? self : this);
