// ════════════════════════════════════════
// layout.js — 布局规格（DESIGN §7.6）。
//
// ⚠ 纸牌 UI 最难的部分就是布局，四个约束互相打架：
//   7 列（Spider 是 10 列）× iPhone SE 竖屏 375px × 「小牌也要认得出」× 底部横幅要预留空间
//   ⇒ 必须显式取舍，不能让 render 里到处散落魔法数字。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const L = {};
  const PLAY_MAX = 620;                 // 游戏区宽度上限（再宽牌就大得可笑）
  const BANNER_H = 56;                  // ⚠ 横幅**预留**空间（不是盖上去）—— DESIGN §7.2

  function layout(opts) {
    const { SW, SH, safeTop } = GameGlobal;
    const showBanner = !(opts && opts.noBanner);

    const playW = Math.min(SW, PLAY_MAX);
    const playX = Math.round((SW - playW) / 2);

    const gap = Math.max(4, Math.round(playW * 0.014));
    const cardW = Math.floor((playW - gap * 8) / 7);      // 7 列 + 8 个间隙
    const cardH = Math.round(cardW * 1.42);               // 标准扑克比例

    const top = safeTop + 10;
    const bannerH = showBanner ? BANNER_H : 0;

    Object.assign(L, {
      playX, playW, cx: playX + playW / 2,
      gap, cardW, cardH, bannerH,
      colX: i => playX + gap + i * (cardW + gap),         // 第 i 列的 x
      // 顶排：stock + waste（左）| foundations ×4（右）
      topY: top,
      stockX: playX + gap,
      wasteX: playX + gap + (cardW + gap),
      foundX: i => playX + gap + (3 + i) * (cardW + gap),
      // tableau
      tabY: top + cardH + Math.round(cardH * 0.22),
      // 堆叠 offset：明牌/暗牌**不同**（暗牌挤一点，省高度）
      upOff: Math.round(cardH * 0.28),
      downOff: Math.round(cardH * 0.10),
      // 底部工具条（在横幅之上）
      barH: 46,
      barY: SH - bannerH - 46 - 8,
      bannerY: SH - bannerH,
    });

    // ⚠ 最长列压缩：Klondike 最长可能 6 暗 + 13 明 = 19 张。
    //    竖屏放不下 ⇒ 动态压缩 offset（而不是让牌溢出屏幕）。
    L.maxColH = L.barY - L.tabY - 8;
    L.fitOffsets = (nDown, nUp) => {
      let up = L.upOff, down = L.downOff;
      const need = () => nDown * down + Math.max(0, nUp - 1) * up + L.cardH;
      let guard = 0;
      while (need() > L.maxColH && guard++ < 40) {
        up = Math.max(8, up - 2);
        down = Math.max(3, down - 1);
        if (up === 8 && down === 3) break;               // 压到底了（极端情况允许略微溢出）
      }
      return { up, down };
    };

    return L;
  }

  const API = { layout, L, BANNER_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Layout = API;
})(typeof self !== 'undefined' ? self : this);
