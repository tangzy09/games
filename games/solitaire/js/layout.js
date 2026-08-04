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
  const PLAY_MAX = 760;                 // 手机：游戏区宽度上限（再宽牌就大得可笑）
  // ⭐ 平板单独一档（2026-08-01 出商店截图时实拍抓到）：760 铺在 1024 宽的 iPad 上
  //   = **正中一条窄带**，两侧各空 130px、牌只有手机上的两倍大一点，四周全是空牌桌 ——
  //   审核员看 iPad 截图的第一印象就是「没适配 iPad」。放到 1000 后牌宽 124px（手机 56），
  //   垂直方向也正好被 gameH(playW×1.35) 吃满，不再需要居中偏移去填空。
  const PLAY_MAX_TABLET = 1000;
  const BANNER_H = 56;                  // ⚠ 横幅**预留**空间（不是盖上去）—— DESIGN §7.2
  //   ⛔ 但 56 只是**网页占位条**的高度，绝不是真机的横幅高度（2026-08-03 实机踩到）：
  //   iOS 的 ADAPTIVE_BANNER 按设备屏高分档（屏高 >720 ⇒ **90pt**），且它贴在
  //   safe area 之上 ⇒ 还要再让开 home indicator 的 safeBottom(34) ⇒ 真机实际要 ~124px。
  //   写死 56 = 底部工具条被广告压掉大半（正是「横幅绝不遮牌」这条红线本身）。
  //   ⇒ 真机一律问 `Ads.bannerReserve()`（真值来自插件的 bannerAdSizeChanged 事件）。
  const TABLET_W = 700;                 // ≥ 这个宽度算平板

  // 本次布局要为底部横幅让出多少 px。
  // ⚠ `noBanner`（菜单/图鉴等二级页）只免掉**网页的占位条** —— 原生横幅是**常驻**的
  //   （showBanner 一次就一直贴在那儿，进菜单不会消失）⇒ 真机上任何页面都必须让位，
  //   否则底部按钮同样被广告盖住（和牌桌是同一个 bug，只是没人只盯着菜单看）。
  function bannerReserve(noBanner) {
    const native = (typeof Ads !== 'undefined' && Ads && Ads.bannerReserve) ? Ads.bannerReserve() : 0;
    if (native > 0) return native;                  // 真实横幅高度 + 底部安全区
    return noBanner ? (GameGlobal.safeBottom || 0) : BANNER_H;
  }

  function layout(opts) {
    const { SW, SH, safeTop } = GameGlobal;
    const showBanner = !(opts && opts.noBanner);

    const tablet = SW >= TABLET_W;
    const playW = tablet ? Math.min(SW - 40, PLAY_MAX_TABLET) : Math.min(SW, PLAY_MAX);
    const playX = Math.round((SW - playW) / 2);

    // 列数随玩法变：Klondike 7 / FreeCell 8 / **Spider 10**（10 列最窄，牌角横排的价值在这最大）
    const cols = (opts && opts.cols) || 7;
    const gap = Math.max(3, Math.round(playW * 0.014));
    const cardW = Math.floor((playW - gap * (cols + 1)) / cols);
    const cardH = Math.round(cardW * 1.42);               // 标准扑克比例

    // ⚠ HUD（分数 / 牌局号 / 「✓ 有解」角标）必须有**自己的一行**，且落在 safeTop 之下。
    //   踩过的坑：HUD 原来画在 topY-24 = safeTop 之上，直接侵入状态栏/刘海区，
    //   而右上角那块正好被 DOM 控制栏（#controls: fixed, top:8px right:8px, z-index 20）压住
    //   ⇒ **「✓ 有解」角标（进公平页的唯一入口）点不动** —— E2E 真实鼠标点击才抓出来。
    const bannerH = bannerReserve(!showBanner);

    // ⚠ **iPad 必须单独处理**：手机的布局直接铺到 1024×1366 上，牌会挤在左上角、
    //   右边和下面全是空的 —— 在 App Store 的 iPad 截图里不只是难看，
    //   审核员会直接判定「没适配 iPad」（Capacitor 默认支持 iPad，这套截图躲不掉）。
    //   ⇒ 平板上把整个游戏区**垂直居中**（像放大的手机布局），而不是顶着屏幕顶端。
    const isTablet = tablet;                     // （宽度那步已经算过一次，别重复定义）
    const availH = SH - bannerH - safeTop - 16;
    // ⚠ 这个系数决定 iPad 上「牌桌 + 工具条」这一整块的高度。
    //   设太松（>= 可用高度）居中偏移就恒为 0，等于没居中 —— 第一版 1.72 就是这样，白改。
    const gameH = isTablet ? Math.min(availH, Math.round(playW * 1.35)) : availH;
    const gameTop = isTablet ? safeTop + Math.round((availH - gameH) / 2) : safeTop;

    // HUD 两行（2026-07-31 布局改版,参照头部竞品）:
    //   行1 = ‹菜单 | ⚙ | 🎨 | 居中分数胶囊(右侧留白给引擎语言控件)
    //   行2 = Stage ×M | Moves | Time 三栏
    const hudY = gameTop + 6;
    const hudH = 30;
    const hud2Y = hudY + hudH + 2;
    const hud2H = 16;
    const top = hud2Y + hud2H + 8;
    const gameBottom = gameTop + gameH;

    Object.assign(L, {
      playX, playW, cx: playX + playW / 2,
      gap, cardW, cardH, bannerH,
      cols,
      colX: i => playX + gap + i * (cardW + gap),         // 第 i 列的 x
      hudY, hudH, hud2Y, hud2H,
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
      //  ⭐ 明牌间距跟着**可用高度**走（2026-08-01）：固定 0.28×cardH 在高屏/iPad 上把牌全挤在
      //    上半截、下面一大片空牌桌（出商店截图时实拍到）。这里按「12 张明牌正好占满牌区」反算，
      //    并夹在 [0.28, 0.55]×cardH 之间 —— 更松 = 每张牌露出的部分更多，也更好认。
      //    ⚠ 只吃屏幕尺寸、**不吃当前牌局** ⇒ 打牌过程中间距恒定，不会边打边跳。
      upOff: 0,      // ↓ 下面按 maxColH 反算后回填（这里占位，别直接用）
      downOff: Math.round(cardH * 0.10),
      // 底部工具条：大圆按钮 + 标签（平板上跟着居中的游戏区走，不是贴着屏幕最底）
      barH: 72,
      barY: gameBottom - 72 - 6,
      bannerY: SH - bannerH,                 // 横幅永远贴屏幕底（原生横幅就在那儿）
      // ⭐ 内容底边 —— **所有页面的底部元素都要用它，别再写 `SH - 70`**。
      //   二级页的「‹ 返回」原本按裸 SH 定位 ⇒ 真机上整颗按钮被横幅盖住、点不动。
      botY: SH - bannerH,
      // ⭐ 「这局还有解吗？」条 —— 一等公民，占正经版面（在工具条正上方）
      proveH: 40,
      proveY: gameBottom - 72 - 6 - 40 - 6,
    });

    // ⚠ 最长列压缩：Klondike 最长可能 6 暗 + 13 明 = 19 张。
    //    竖屏放不下 ⇒ 动态压缩 offset（而不是让牌溢出屏幕）。
    L.maxColH = L.proveY - L.tabY - 8;      // ⚠ 牌区高度要给证明条让位，否则最长的列会被它盖住
    // 明牌间距：让 12 张明牌正好吃满牌区（12 是实战里常见的最长列；再长的由 fitOffsets 压缩）
    L.upOff = Math.max(Math.round(cardH * 0.28),
                       Math.min(Math.round(cardH * 0.55), Math.floor((L.maxColH - cardH) / 11)));
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
