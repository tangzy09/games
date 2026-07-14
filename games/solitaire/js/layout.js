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

    // 列数随模式变：Klondike 7 列，FreeCell 8 列（Spider 将来 10 列）
    const cols = (opts && opts.cols) || 7;
    const gap = Math.max(3, Math.round(playW * 0.014));
    const cardW = Math.floor((playW - gap * (cols + 1)) / cols);
    const cardH = Math.round(cardW * 1.42);               // 标准扑克比例

    // ⚠ HUD（分数 / 牌局号 / 「✓ 有解」角标）必须有**自己的一行**，且落在 safeTop 之下。
    //   踩过的坑：HUD 原来画在 topY-24 = safeTop 之上，直接侵入状态栏/刘海区，
    //   而右上角那块正好被 DOM 控制栏（#controls: fixed, top:8px right:8px, z-index 20）压住
    //   ⇒ **「✓ 有解」角标（进公平页的唯一入口）点不动** —— E2E 真实鼠标点击才抓出来。
    const hudY = safeTop + 6;
    const hudH = 20;
    const top = hudY + hudH + 8;
    const bannerH = showBanner ? BANNER_H : 0;

    Object.assign(L, {
      playX, playW, cx: playX + playW / 2,
      gap, cardW, cardH, bannerH,
      cols,
      colX: i => playX + gap + i * (cardW + gap),         // 第 i 列的 x
      hudY, hudH,
      // 顶排（Klondike）：stock + waste（左）| foundations ×4（右）
      topY: top,
      stockX: playX + gap,
      wasteX: playX + gap + (cardW + gap),
      foundX: i => playX + gap + (cols - 4 + i) * (cardW + gap),   // 永远靠右 4 格
      // 顶排（FreeCell）：free cell ×4（左）| foundations ×4（右）
      cellX: i => playX + gap + i * (cardW + gap),
      // tableau
      tabY: top + cardH + Math.round(cardH * 0.22),
      // 堆叠 offset：明牌/暗牌**不同**（暗牌挤一点，省高度）
      upOff: Math.round(cardH * 0.28),
      downOff: Math.round(cardH * 0.10),
      // 底部工具条（在横幅之上）
      barH: 46,
      barY: SH - bannerH - 46 - 8,
      bannerY: SH - bannerH,
      // ⭐ 「这局还有解吗？」条 —— 一等公民，占正经版面（在工具条正上方）
      proveH: 40,
      proveY: SH - bannerH - 46 - 8 - 40 - 6,
    });

    // ⚠ 最长列压缩：Klondike 最长可能 6 暗 + 13 明 = 19 张。
    //    竖屏放不下 ⇒ 动态压缩 offset（而不是让牌溢出屏幕）。
    L.maxColH = L.proveY - L.tabY - 8;      // ⚠ 牌区高度要给证明条让位，否则最长的列会被它盖住
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

  /**
   * 一张牌**当前**画在哪（滑牌动画要用：算源/目标坐标）。
   * loc: {p:'t', ti, i} | {p:'f', fi} | {p:'w'} | {p:'c', ci} | {p:'stock'}
   * ⚠ 必须与 render 的绘制逻辑**完全一致** —— 不一致的话牌会从错误的地方飞出来。
   */
  function cardXY(s, loc) {
    if (loc.p === 'f') return { x: L.foundX(loc.fi), y: L.topY };
    if (loc.p === 'c') return { x: L.cellX(loc.ci), y: L.topY };
    if (loc.p === 'stock') return { x: L.stockX, y: L.topY };
    if (loc.p === 'w') {
      // waste 是扇形展开的：顶牌在第 show-1 个位置（与 render 一致）
      const show = Math.min(s.drawCount === 1 ? 1 : 3, s.waste.length);
      const fan = Math.round(L.cardW * 0.22);
      return { x: L.wasteX + Math.max(0, show - 1) * fan, y: L.topY };
    }
    // tableau：逐张累加 offset（明/暗 offset 不同，且列长时会被压缩）
    const col = s.tableau[loc.ti];
    const nDown = col.cards.length - col.up;
    const off = L.fitOffsets(nDown, col.up);
    let y = L.tabY;
    for (let i = 0; i < loc.i; i++) y += (i >= nDown) ? off.up : off.down;
    return { x: L.colX(loc.ti), y };
  }

  const API = { layout, L, BANNER_H, cardXY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Layout = API;
})(typeof self !== 'undefined' ? self : this);
