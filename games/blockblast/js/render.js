// ════════════════════════════════════════
// render.js — 布局 + 全屏重画（引擎契约：每帧 clearHits() → 从 G 重画 → addHit()）。
// ⚠ 棋盘/托盘区域**故意不 addHit()**：它们由 drag.js 用 pointer 事件处理。
//    引擎 Input 的 tap 因此在这些区域无区域可命中，放下拼块的那次 pointerup
//    不会被 hitTest 误判成一次点击（DESIGN §5）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // 调色板由**当前皮肤**决定（Themes）。皮肤只换颜色，**绝不改任何规则**。
  const PAL = {
    bg1: '#6d3fb4', bg2: '#8e5ad0',
    boardBg: 'rgba(40,26,74,0.55)', cellEmpty: 'rgba(255,255,255,0.06)',
    text: '#ffffff', sub: 'rgba(255,255,255,0.75)',
    ghostOk: 'rgba(255,255,255,0.35)', lineHint: 'rgba(255,236,140,0.55)',
  };
  let COLORS = Themes.THEMES[0].blocks.slice();
  const COLOR_BY_ID = {};
  // ⚠ 按块在表中的**序号**取色，不要用 id 的字符串哈希 —— 哈希会撞车，
  //    实机出现过「一手三块全是黄的」（34 块 % 7 色，序号取色则均匀铺开）。
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  function applyTheme(id) {
    const t = Themes.byId(id);
    PAL.bg1 = t.bg1; PAL.bg2 = t.bg2; PAL.boardBg = t.boardBg; PAL.cellEmpty = t.cellEmpty;
    PAL.accent = t.accent;
    PAL.lineHint = hexA(t.accent, 0.55);        // 消行预览的高亮跟着主题走
    COLORS = t.blocks.slice();
    Pieces.PIECES.forEach((p, i) => { COLOR_BY_ID[p.id] = COLORS[i % COLORS.length]; });
    if (typeof API !== 'undefined') API.COLORS = COLORS;
  }
  const colorOf = id => COLOR_BY_ID[id] || COLORS[4];
  // ⚠ 不能在这里调 applyTheme('candy')：它内部要写 API.COLORS，而 API 在文件末尾才定义
  //    ⇒ TDZ 报错「Cannot access 'API' before initialization」，整个 render 模块挂掉。
  //    初始化挪到 API 定义之后（见文件末尾）。

  const L = {};   // 布局（drag.js 也用）

  // ⚠ 所有 UI 都相对「居中的游戏区 play」排布，**不是相对屏幕全宽**。
  // 用 SW 当基准在手机竖屏下看不出问题，一到桌面宽屏就把托盘甩到屏幕两端、Best 贴边（实机踩到）。
  const PLAY_MAX = 480;                       // 游戏区宽度上限：再宽就不像手游了

  function layout() {
    const { SW, SH, safeTop } = GameGlobal;
    const playW = Math.min(SW, PLAY_MAX);
    const playX = Math.round((SW - playW) / 2);
    const avail = SH - safeTop;

    // 棋盘：受游戏区宽度和可用高度双重约束（要给 HUD/Next/托盘留位）
    const boardW = Math.min(playW - 24, avail * 0.50);
    const cell = Math.floor(boardW / 8);
    const bw = cell * 8;

    L.playX = playX; L.playW = playW;
    L.cx = playX + playW / 2;                 // 游戏区中心（浮字/HUD 都用它，别再用 SW/2）
    L.cell = cell;
    L.boardX = Math.round(playX + (playW - bw) / 2);
    L.boardW = bw;
    L.trayH = Math.round(cell * 3.4);         // 够放下 3 格高的块（>3 高的块很少，见 computeTray）

    // 整块内容（HUD → Next → 棋盘 → 托盘）**垂直居中**于可用高度。
    // 不居中的话，桌面高屏下内容全挤在上半屏、底下一大片空白（实机踩到）。
    const gapNext = 48, gapBoard = Math.round(cell * 0.7), gapTray = Math.round(cell * 0.55);
    const contentH = 76 + gapNext + gapBoard + bw + gapTray + L.trayH;   // 76 = 金币行 + 分数行 + Best 行
    const top = Math.max(safeTop + 8, safeTop + (avail - contentH) / 2);

    L.hudY = Math.round(top + 46);            // 金币行画在 hudY-34,所以 hudY 上方要留空间
    L.nextY = Math.round(L.hudY + gapNext);
    L.boardY = Math.round(L.nextY + gapBoard);
    L.trayY = Math.round(L.boardY + bw + gapTray);
    return L;
  }

  /** 棋盘坐标 → 屏幕 */
  const cellXY = (r, c) => ({ x: L.boardX + c * L.cell, y: L.boardY + r * L.cell });
  /** 屏幕 → 棋盘格（可能越界，调用方自己判断）*/
  const cellAt = (x, y) => ({ r: Math.floor((y - L.boardY) / L.cell), c: Math.floor((x - L.boardX) / L.cell) });
  /**
   * 托盘布局：块**按实际大小（= 棋盘格 cell）显示**，拿起来不再变大。
   *
   * ⚠ 物理约束：三块最坏情况（都 5 格宽）横排要 15 格宽，而棋盘只有 8 格宽 —— 永远塞不下。
   *   所以按「这一手的实际尺寸」动态定 scale：绝大多数手 scale=1（真·实际大小、拖起来零跳变），
   *   只有碰到超宽/超高的块才略缩，避免相邻块重叠。
   * 槽位按**原始三块**（含已放下的）算，所以拖走一块后，剩下的块不会乱跳。
   */
  function computeTray(s) {
    const hand = Dealer.hand(s.seed, s.streamIndex);      // 原始一手（不管放没放）
    const cell = L.cell;
    const availW = L.playW - 12;
    const cellsW = hand.reduce((a, p) => a + p.wdt, 0);   // 三块的总格宽
    const maxH = Math.max(...hand.map(p => p.h));

    // 先压间距、再缩块 —— 这样「实际大小」能覆盖尽可能多的手。
    // ⚠ GAP_MIN 不能太小:压到 5px 时三块会糊成连续一排,玩家看不出是三块独立的块(截图验收发现)。
    const GAP_MIN = Math.max(10, Math.round(cell * 0.28)), GAP_NICE = Math.round(cell * 0.4);
    let scale = 1;
    let gap = (availW - cellsW * cell) / 2;               // 1:1 时还剩多少空间当间距
    if (gap < GAP_MIN || maxH * cell > L.trayH) {
      // 这一手实在放不下（超宽或超高）才缩：把间距压到最小，剩下的靠缩放
      scale = Math.min((availW - GAP_MIN * 2) / (cellsW * cell), L.trayH / (maxH * cell));
      gap = GAP_MIN;
    } else {
      gap = Math.min(gap, GAP_NICE);
    }

    const size = cell * scale;
    const totalW = cellsW * size + gap * 2;
    let x = L.playX + (L.playW - totalW) / 2;
    L.trayScale = scale;
    L.traySlots = hand.map(p => {
      const bw = p.wdt * size, bh = p.h * size;
      const rect = { x, y: L.trayY + (L.trayH - bh) / 2, w: bw, h: bh, size, piece: p };
      x += bw + gap;
      return rect;
    });
  }

  /** 托盘槽的中心 */
  function traySlotCenter(i) {
    const r = L.traySlots[i];
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  /** 屏幕点命中哪个托盘槽（-1 = 没命中）。给一点容差，手指不必压得很准。*/
  function traySlotAt(x, y) {
    if (!L.traySlots) return -1;                  // 菜单界面没有托盘（兜底，别抛）
    const pad = L.cell * 0.35;
    for (let i = 0; i < L.traySlots.length; i++) {
      const r = L.traySlots[i];
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return i;
    }
    return -1;
  }

  // ── 一个方块（高光斜角立体感）──
  function drawBlock(x, y, size, color, alpha) {
    const g = size * 0.14;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    fillRR(x + 1, y + 1, size - 2, size - 2, size * 0.18, color);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';                       // 顶部高光
    roundRect(x + g, y + g * 0.7, size - g * 2, size * 0.22, size * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';                             // 底部阴影
    roundRect(x + g, y + size - g * 1.6, size - g * 2, size * 0.16, size * 0.08); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── 水晶（消行时才收集，所以它长在方块上）──
  const CRYSTAL = {
    blue:   { fill: '#67e8f9', edge: '#0891b2', emoji: '💎' },
    pink:   { fill: '#f0abfc', edge: '#a21caf', emoji: '🔮' },
    orange: { fill: '#fdba74', edge: '#c2410c', emoji: '🔶' },
    green:  { fill: '#86efac', edge: '#15803d', emoji: '🟢' },   // 第三章「翡翠矿脉」
    violet: { fill: '#c4b5fd', edge: '#6d28d9', emoji: '🟣' },
  };
  // ── 生成美术（本机 Flux 出图 + InSPyReNet 抠图，comfyui-flux-local skill 管线）──
  //    engine makeArt 缺图自动回退 ⇒ 零改码换图：图没加载完/被删都退回矢量/emoji。
  const ART = makeArt('art', ['cry_blue', 'cry_pink', 'cry_orange', 'cry_green', 'cry_violet',
                              'ch_candy', 'ch_ocean', 'ch_forest', 'chest']);
  ART.load();
  const CH_ART = { 1: 'ch_candy', 2: 'ch_ocean', 3: 'ch_forest' };

  // ── 共享 UI 图标库（engine/assets/ui/*.webp，全仓只此一份）──
  //    系统 emoji 每个平台长得都不一样、和游戏世界观也没关系 ⇒ 显眼位置一律换自制图标。
  //    ⛔ 绝不在 games/blockblast/assets/ui/ 放第二份（tools/check-ui-icons.cjs 会拦）。
  //    缺图自动回退 emoji（drawArtIcon 的老规矩）。
  const UI = makeUIArt(['star', 'lock', 'coin', 'gem', 'trophy', 'gift', 'calendar', 'fire',
                        'crown', 'check', 'video-ad', 'shop', 'palette', 'chart', 'scroll',
                        'frame', 'settings', 'medal', 'sparkle', 'info']);
  UI.load();
  /** 画一个共享 UI 图标（居中）；缺图回退 emoji */
  const uiIcon = (id, emoji, cx, cy, size, color, font) =>
    drawArtIcon(UI, id, emoji, cx, cy, size, color || '#fff', font || Math.round(size * 0.9) + 'px sans-serif');

  /** 星星：得到的用共享库那颗（够可爱），没得到的同一颗压到很淡 —— 形状一致才整齐 */
  function drawStar(cx, cy, r, on) {
    const im = UI.get('star');
    if (im) {
      ctx.globalAlpha = on ? 1 : 0.15;
      ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.beginPath();                                   // 回退矢量五角星（图没加载完的那一瞬）
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.44 : r * 0.95;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = on ? '#ffd54a' : 'rgba(255,255,255,0.15)'; ctx.fill();
  }

  /** hex 变暗（结算卡的**不透明**底色要跟着皮肤走）*/
  function darken(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = v => Math.round(v * k);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  /** 页脚装饰：内容排完总有富余高度（关卡地图尤其明显）⇒ 底下画几块淡拼图补白。
   *  用**游戏自己的拼块**而不是随机方块：一眼看得出是这个游戏，也不像坏掉的模糊色块。
   *  ⚠ 位置全写死（确定性），**禁 Math.random** —— 每帧重画会闪成雪花。不接 hit。*/
  function drawFooterArt(SW, SH, fromY) {
    const room = SH - fromY;
    if (room < 70) return;
    const P = Pieces.PIECES;
    const size = Math.max(11, Math.min(20, room / 7));
    const base = SH - 16;
    [[0.09, 4, 0], [0.34, 13, 16], [0.60, 21, 0], [0.84, 28, 14]].forEach(([fx, pi, up]) => {
      const p = P[pi % P.length];
      drawPieceAt(p, SW * fx - p.wdt * size / 2, base - p.h * size - up, size, 0.13);
    });
  }

  // ════════════════════════════════════════
  // 🏠 主界面装饰层（"可可爱爱"批，照 snake 的天国开场做 canvas 版）
  //
  // ⚠ 一切位置都走**确定性散列**，⛔ 禁 Math.random —— 每帧重抽的话星星会疯狂乱跳（snake 实锤）。
  // ⚠ 动效受设置里的「粒子/动态」开关门控（FX.enabled）：关掉 = 一张静止的漂亮背景，不是白屏。
  // ⚠ 预算：整层 < 60 个图元。主界面为它进入了每帧重画，别往里堆东西。
  // ════════════════════════════════════════
  function hash2(i) {
    let h = Math.imul(i + 1, 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h ^ (h >>> 13)) >>> 0;
  }
  function drawHomeDeco(SW, SH, t) {
    // ── 极光：三条横向柔光带，缓慢起伏 ──
    const AUR = ['255,214,240', '186,230,253', '253,230,138'];
    for (let i = 0; i < 3; i++) {
      const yy = SH * (0.09 + i * 0.085) + Math.sin(t * (0.16 + i * 0.05) + i * 2.1) * SH * 0.022;
      const hgt = SH * 0.085;
      const g = ctx.createLinearGradient(0, yy - hgt, 0, yy + hgt);
      // ⚠ alpha 别抠：0.15 在紫色底上肉眼几乎看不见（实拍），要 0.26 才"有那么点极光的意思"
      g.addColorStop(0, 'rgba(' + AUR[i] + ',0)');
      g.addColorStop(0.5, 'rgba(' + AUR[i] + ',0.26)');
      g.addColorStop(1, 'rgba(' + AUR[i] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, yy - hgt, SW, hgt * 2);
    }
    // ── 星星：确定性位置，各自节奏地眨 ──
    for (let i = 0; i < 26; i++) {
      const h = hash2(i);
      const x = (h % 997) / 997 * SW;
      const y = ((h >>> 10) % 991) / 991 * SH * 0.78;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 1.7));
      const r = 0.9 + (h % 3) * 0.55;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * tw).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // ── 云海：底部两层交叠的圆顶（上下必须交叠，否则层间会露出一条横带 —— snake 踩过）──
    for (let layer = 0; layer < 2; layer++) {
      const baseY = SH * (0.875 + layer * 0.06) + Math.sin(t * 0.1 + layer) * 3;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.16 + layer * 0.1).toFixed(2) + ')';
      ctx.beginPath();
      ctx.moveTo(0, SH);
      for (let k = 0; k <= 6; k++) {
        const cxk = (k / 6) * SW + Math.sin(t * 0.12 + k * 1.3 + layer) * 8;
        ctx.arc(cxk, baseY, SW * 0.13, Math.PI, 0);
      }
      ctx.lineTo(SW, SH); ctx.closePath(); ctx.fill();
    }
  }
  /** hero 背后的圣光：径向光晕 + 缓慢转的光芒线（点题：这是天使画像）*/
  function drawHalo(cx, cy, r, t) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.15);
    g.addColorStop(0, 'rgba(255,246,200,0.34)');
    g.addColorStop(0.6, 'rgba(255,224,180,0.14)');
    g.addColorStop(1, 'rgba(255,224,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.06);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = 'rgba(255,250,220,' + (i % 2 ? 0.05 : 0.09) + ')';
      ctx.beginPath();
      ctx.moveTo(-r * 0.035, r * 0.62); ctx.lineTo(r * 0.035, r * 0.62);
      ctx.lineTo(0, r * 1.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /** 画水晶：有生成图用图（目标条/图鉴等大尺寸处），没有回退矢量 drawCrystal。
   *  ⚠ 用图时**仍要叠一枚形状角标** —— 5 张生成图之间只有颜色不同，
   *    对色盲玩家来说「收集目标是哪一种」在这些地方就成了猜谜。*/
  function drawCrystalArt(x, y, size, kind) {
    const im = ART.get('cry_' + kind);
    if (!im) { drawCrystal(x, y, size, kind); return; }
    ctx.drawImage(im, x, y, size, size);
    const bs = size * 0.36;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    crystalPath(x + size - bs * 0.9, y + size - bs * 0.9, bs, kind);
    ctx.fillStyle = (CRYSTAL[kind] || CRYSTAL.blue).edge;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /**
   * ⛔ 无障碍双编码（casual-game-meta 的红线）：5 种水晶**不能只靠颜色区分** ——
   *   它们是关卡的收集目标，灰度下必须一眼分清。⇒ 一色一形：
   *   蓝=菱形 · 粉=六边形 · 橙=三角 · 绿=圆角方 · 紫=五角星。
   */
  function crystalPath(x, y, size, kind) {
    const cx = x + size / 2, cy = y + size / 2, r = size * 0.5;
    const poly = (n, rot) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + i * Math.PI * 2 / n;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    if (kind === 'pink') poly(6, -Math.PI / 2);
    else if (kind === 'orange') poly(3, -Math.PI / 2);
    else if (kind === 'green') roundRect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64, r * 0.3);
    else if (kind === 'violet') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else poly(4, -Math.PI / 2);                       // blue：菱形（老形状，别动）
  }

  function drawCrystal(x, y, size, kind) {
    const cr = CRYSTAL[kind] || CRYSTAL.blue;
    const cx = x + size / 2, cy = y + size / 2, r = size * 0.26;
    crystalPath(cx - r, cy - r, r * 2, kind);
    ctx.fillStyle = cr.fill; ctx.fill();
    ctx.strokeStyle = cr.edge; ctx.lineWidth = Math.max(1.5, size * 0.05); ctx.stroke();
    ctx.beginPath();                                    // 高光
    ctx.moveTo(cx - r * 0.35, cy - r * 0.2); ctx.lineTo(cx, cy - r * 0.62); ctx.lineTo(cx + r * 0.18, cy - r * 0.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }
  // 石块：不可消除的惰性格 —— 视觉上必须一眼看出「这玩意儿不会消失」
  function drawStone(x, y, size) {
    fillRR(x + 1, y + 1, size - 2, size - 2, size * 0.18, '#6b7280');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x + size * 0.16, y + size * 0.12, size * 0.68, size * 0.18, size * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const [dx, dy, w, h] of [[0.22, 0.42, 0.2, 0.12], [0.55, 0.55, 0.22, 0.14], [0.3, 0.7, 0.3, 0.1]]) {
      roundRect(x + size * dx, y + size * dy, size * w, size * h, size * 0.04); ctx.fill();
    }
  }

  function drawPieceAt(piece, x, y, size, alpha) {
    const col = colorOf(piece.id);
    for (const [dr, dc] of piece.cells) drawBlock(x + dc * size, y + dr * size, size, col, alpha);
  }

  /** 主菜单 + 关卡地图（关卡是「审核员 5 秒能看见」的外壳之一，也是进度感的载体）*/
  /**
   * 🏠 主界面 —— 启动落点，也是这个游戏的门面。
   *
   * ⭐ 为什么单独做一屏：原来的 MENU 一屏塞了**章节页签 + 30 关网格 + 宝箱 + 每日 + 无尽 +
   *   四个 tab + 三个小钮 + 目标条**，功能全但一眼看过去是「设置页」不是游戏。
   *   HOME 只留**门面**（主视觉 / 一个主按钮 / 六个带角标的入口），
   *   MENU 原样保留成「关卡地图」，从 HOME 的「关卡」格子进 —— 一样也没少。
   *
   * ⚠ 布局用「先量后画」：canvas 没有 flex/gap，固定块高度先算出来、把富余高度平摊进间隙，
   *   否则高屏底部一大片死白（solitaire 实锤）。
   * ⛔ 整屏起点 = safeTop + ctrlH：主视觉是最宽的一块，只躲刘海会顶到右上角引擎语言下拉。
   */
  function renderHome() {
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    // 🌈 装饰层（极光 / 星星 / 云海）。⚠ 画在最底，之后所有 UI 都盖在它上面。
    //    动效关掉时用一个**固定时刻**去画 —— 静止但依然好看，不是白背景。
    drawHomeDeco(SW, SH, FX.enabled ? (root.G.animClock || 0) : 8.5);

    const cx = L.cx, w = Math.min(L.playW - 36, 360);
    const tall = SH >= 760;

    // ── 先量 ──
    const hs = Math.min(w * 0.55, SH * (tall ? 0.21 : 0.185));
    const ch = tall ? 64 : 56;            // 收集卡（天使进度 + 等级/称号 XP 条）
    const bh = tall ? 52 : 44;            // 主按钮（▶ 玩 / 🗺 关卡 —— 两颗同样大）
    const dh = tall ? 40 : 34;            // 每日
    const gh = tall ? 44 : 38;            // 入口格
    const sh2 = tall ? 38 : 32;           // 底部小钮
    const titleH = tall ? 32 : 25, tagH = tall ? 26 : 0;   // ⚠ 矮屏直接砍掉 tagline，给两颗大按钮腾地方
    const fixed = hs + 10 + titleH + tagH + ch + bh * 2 + 8 + dh + 3 * gh + 2 * 8 + sh2;
    const GAPS = 8, base = tall ? 10 : 5;
    const top0 = GameGlobal.safeTop + GameGlobal.ctrlH + (tall ? 6 : 2);
    const slack = SH - top0 - 12 - fixed - GAPS * base;
    const gap = base + Math.max(0, Math.min(22, slack / GAPS));
    let y = top0;

    // ── 👼 hero：玩家**最近解锁的那张**天使（是「我的收藏」，不是装饰画）──
    const got = G.wallet.angels | 0, totA = Shop.ANGELS.total;
    const hx = cx - hs / 2;
    // ⭐ **每次进主界面换一张**（2026-08-01 用户定）：从**已解锁的**里随机抽，
    //   它是「我的收藏」不是装饰画。⚠ 只在 heroIdx 为空时抽一次 —— renderHome 每帧都跑，
    //   每帧重抽的话图会疯狂闪；离开 HOME 时由 renderAll 清空，下次进来才换。
    // ⚠ `< 0` 这一条不能少：零解锁时抽到的 -1 会一直粘着 —— 在主界面上领了每日礼物
    //   （+2 张画像）之后 hero 仍是空白方块，直到你离开再进来才好。
    if (G.heroIdx == null || G.heroIdx < 0 || G.heroIdx >= got) {
      G.heroIdx = got > 0 ? Math.floor(Math.random() * got) : -1;
    }
    drawHalo(cx, y + hs / 2, hs * 0.78, FX.enabled ? (G.animClock || 0) : 8.5);   // 圣光在卡片之前画
    fillRR(hx - 5, y - 5, hs + 10, hs + 10, 22, 'rgba(255,255,255,0.88)');
    if (got > 0) {
      drawAngel(G.heroIdx, hx, y, hs, hs, 18);
    } else {
      // 还没解锁 ⇒ 回退画一小片方块（零素材依赖，绝不空着）
      fillRR(hx, y, hs, hs, 18, 'rgba(255,255,255,0.92)');
      const q = hs / 4.6, ox = hx + hs / 2 - q * 1.5, oy = y + hs / 2 - q * 1.5;
      [[0, 0], [1, 0], [2, 1], [0, 1], [1, 2], [2, 2]].forEach((p, i) => {
        fillRR(ox + p[0] * q + 3, oy + p[1] * q + 3, q - 6, q - 6, 5, COLORS[i % COLORS.length]);
      });
    }
    addHit(hx, y, hs, hs, 'PAGE_ANG', {});        // 点大图 = 进天使图鉴
    y += hs + gap;

    // ── 标题 + 一句话卖点（「出块序列开局前就定死」= 这个产品的全部差异化）──
    txt(T('blockblast.title'), cx, y + (tall ? 14 : 12), '#fff', 'bold ' + (tall ? 30 : 25) + 'px sans-serif');
    y += titleH;
    // ⚠ 标题居中 ⇒ tagline 也必须居中（txtLWrap 是**左**对齐的，混用一眼就不齐）
    if (tagH) {
      ctx.font = '11px sans-serif';               // ⚠ wrapLines 按当前 font 量宽
      wrapLines(T('blockblast.tagline'), w - 10, 2)
        .forEach((ln, i) => txt(ln, cx, y + 8 + i * 14, PAL.sub, '11px sans-serif'));
    }
    y += tagH + gap - base;

    // ── 收集进度卡（天使 n/500 + 条 + 星星/金币）。图标一律走**共享 UI 库**，别用系统 emoji ──
    fillRR(cx - w / 2, y, w, ch, 11, 'rgba(0,0,0,0.26)');
    uiIcon('frame', '\u{1F47C}', cx - w / 2 + 21, y + 15, 17);
    txtL(T('blockblast.angelsGot', { n: got, m: totA }),
         cx - w / 2 + 33, y + 15, '#fff', 'bold 12px sans-serif');
    txtR((got / totA * 100).toFixed(1) + '%', cx + w / 2 - 12, y + 15, PAL.accent, 'bold 12px sans-serif');
    fillRR(cx - w / 2 + 12, y + 25, w - 24, 7, 4, 'rgba(255,255,255,0.16)');
    if (got) fillRR(cx - w / 2 + 12, y + 25, Math.max(4, (w - 24) * got / totA), 7, 4, PAL.accent);
    // ── 等级 / 称号 / XP 条（engine/meta.js）──
    //    ⭐ xp 全部由**既有计数器**折算（落子/消行/星/通关/SWEEP/妙手/收集），零新埋点、零存档：
    //      等级现算 ⇒ 换设备不会掉级，也没有可作弊的字段。点这张卡进统计页看明细。
    const lvY = y + (tall ? 42 : 38);
    if (tall) {
      const stars0 = Object.values(G.progress).reduce((a, v) => a + v, 0);
      drawStar(cx - w / 2 + 18, lvY, 7, true);
      txtL(String(stars0), cx - w / 2 + 28, lvY, 'rgba(255,255,255,0.75)', 'bold 10px sans-serif');
    }
    const lp = Meta.levelProgress(Achievements.xpOf(G.profile, got));
    txtL('Lv.' + lp.level + '  ' + T('blockblast.rank.' + lp.title),
         cx - w / 2 + (tall ? 56 : 12), lvY, '#fff', 'bold 10px sans-serif');
    ctx.font = 'bold 10px sans-serif';
    uiIcon('coin', '\u{1FA99}', cx + w / 2 - 20 - ctx.measureText(String(G.wallet.coins)).width, lvY, 14);
    txtR(String(G.wallet.coins), cx + w / 2 - 12, lvY, PAL.accent, 'bold 10px sans-serif');
    fillRR(cx - w / 2 + 12, lvY + 9, w - 24, 5, 3, 'rgba(255,255,255,0.14)');
    fillRR(cx - w / 2 + 12, lvY + 9, Math.max(3, (w - 24) * lp.pct), 5, 3, '#a78bfa');
    addHit(cx - w / 2, y, w, ch, 'PAGE_STATS', {});
    y += ch + gap;

    // ── ▶ 主按钮：**智能续继**（无尽局没打完 ⇒ 接着打，别把人扔回新局）
    //    ⚠ 有未完局时旁边必须给一个 ↻「新开一局」—— 否则想重开的人**没有出口**
    //      （关卡地图瘦身后这个入口只剩这里了；e2e-p1 有断言钉死两个入口同时在）──
    const rs = resumableScore();
    const BW = Math.min(w, 232);                  // 两颗大按钮同宽同高（用户：关卡要和 Play 一样大）
    const bx0 = cx - BW / 2;
    const mw = rs !== null ? BW - 42 : BW;
    fillRR(bx0, y, mw, bh, 14, rs !== null ? '#f59e0b' : '#22c55e');
    txt(rs !== null ? T('blockblast.continueRun') + '  ' + rs : T('blockblast.homePlay'),
        bx0 + mw / 2, y + bh / 2, '#fff', 'bold ' + (tall ? 18 : 16) + 'px sans-serif');
    addHit(bx0, y, mw, bh, 'PLAY_ENDLESS', {});
    if (rs !== null) {
      // ⚠ 有未完局时这颗「新开一局」**别删** —— 不然想重开的人没有出口（e2e-p1 钉死两个入口同时在）
      fillRR(bx0 + BW - 34, y, 34, bh, 12, 'rgba(255,255,255,0.18)');
      txt('↻', bx0 + BW - 17, y + bh / 2, '#fff', 'bold 17px sans-serif');
      addHit(bx0 + BW - 34, y, 34, bh, 'NEW_RUN', {});
    }
    y += bh + 8;

    // ── 🗺 关卡：和 ▶ 一样大的第二颗主按钮（原来它只是六格里的一小格 —— 关卡是主玩法之一，不该那么小）
    {
      const totalStars = Levels.count() * 3;
      const starsNow = Object.values(G.progress).reduce((a, v) => a + v, 0);
      fillRR(bx0, y, BW, bh, 14, '#7c3aed');
      ctx.font = 'bold ' + (tall ? 18 : 16) + 'px sans-serif';
      const lab = T('blockblast.levels');
      const lw = ctx.measureText(lab).width;
      uiIcon('star', '⭐', bx0 + BW / 2 - lw / 2 - 15, y + bh / 2 - 6, 21);
      txtL(lab, bx0 + BW / 2 - lw / 2, y + bh / 2 - 6, '#fff', 'bold ' + (tall ? 18 : 16) + 'px sans-serif');
      txt(starsNow + ' / ' + totalStars, bx0 + BW / 2, y + bh - 12, 'rgba(255,255,255,0.72)', '10px sans-serif');
      addHit(bx0, y, BW, bh, 'MENU', {});
    }
    y += bh + Math.min(gap, 12);

    // ── 📅 每日谜题（回访钩子：连续天数摆在按钮上）──
    const doneToday = Daily.playedToday(G.profile, new Date());
    const st0 = G.profile.dailyStreak | 0;
    const dw = 168;                       // ⚠ 右边让出 🎁 每日礼物（同「新开一局」那颗的做法）
    const dcx = cx - 105 + dw / 2;
    fillRR(cx - 105, y, dw, dh, 11, doneToday ? 'rgba(255,255,255,0.18)' : '#ffd84d');
    {
      // \u56fe\u6807\u548c\u6587\u5b57**\u5206\u5f00\u91cf\u5bbd**\u518d\u6392\uff1a\u628a emoji \u62fc\u8fdb\u5b57\u7b26\u4e32\u91cc\u9760 measureText \u731c\u4f4d\u7f6e\uff0c
      // \u6362\u6210\u56fe\u6807\u540e\u5fc5\u7136\u53e0\u5b57\uff08\u5b9e\u62cd\u6293\u5230\u300cDaily Puzzle\ud83d\udd255\u300d\u7cca\u6210\u4e00\u56e2\uff09
      const name = T('blockblast.daily'), fg = doneToday ? '#fff' : '#3a2a00';
      ctx.font = 'bold 13px sans-serif';
      const nameW = ctx.measureText(name).width;
      const stW = st0 ? 17 + ctx.measureText(String(st0)).width : 0;
      let lx = dcx - (20 + nameW + (st0 ? 10 + stW : 0)) / 2;
      uiIcon(doneToday ? 'check' : 'calendar', doneToday ? '\u2713' : '\u{1F4C5}', lx + 9, y + dh / 2, 17);
      lx += 20;
      txtL(name, lx, y + dh / 2, fg, 'bold 13px sans-serif');
      if (st0) {
        lx += nameW + 10;
        uiIcon('fire', '\u{1F525}', lx + 8, y + dh / 2, 16);
        txtL(String(st0), lx + 17, y + dh / 2, fg, 'bold 13px sans-serif');
      }
    }
    addHit(cx - 105, y, dw, dh, 'PLAY_DAILY', {});
    // ── 🎁 每日礼物（激励视频，每天 1 次）：进来点一下就有东西拿 = 最轻的回访理由。
    //    ⚠ 领过就画成灰的、并且**不挂 hit** —— 点了没反应比按钮灰着更让人恼火。
    {
      const canGift = Shop.adQuotaLeft(G.wallet, 'gift') > 0;
      fillRR(cx + 71, y, 34, dh, 11, canGift ? '#f472b6' : 'rgba(255,255,255,0.14)');
      uiIcon('gift', '\u{1F381}', cx + 88, y + dh / 2, 19);
      if (canGift) addHit(cx + 71, y, 34, dh, 'AD_GIFT', {});
    }
    y += dh + gap;

    // ── 2×3 入口网格：每格挂一个「你在这儿有多少东西」的角标 ──
    const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    const qd = Quests.status(G.profile, Daily.dayNo(new Date())).filter(q => q.done).length;
    const skinN = Themes.THEMES.filter(t =>
      Themes.isUnlocked(t, 0, G.wallet.skins || [], G.wallet.gamesPlayed)).length;
    const cells = [
      // \u26a0 \u56fe\u6807\u4e00\u5f8b\u53d6**\u5171\u4eab UI \u5e93**\uff08engine/assets/ui\uff09\uff1a\u7cfb\u7edf emoji \u6bcf\u4e2a\u5e73\u53f0\u957f\u5f97\u90fd\u4e0d\u4e00\u6837\u3001
      //   \u8ddf\u6e38\u620f\u4e16\u754c\u89c2\u4e5f\u6ca1\u5173\u7cfb\u3002\u7b2c\u4e8c\u4e2a\u53c2\u6570\u662f\u7f3a\u56fe\u65f6\u7684\u56de\u9000 emoji\uff08drawArtIcon \u7684\u8001\u89c4\u77e9\uff09\u3002
      // \u26a0 \u300c\u5173\u5361\u300d\u5df2\u63d0\u6210\u4e0a\u9762\u90a3\u9897\u5927\u6309\u94ae \u21d2 \u8fd9\u4e00\u683c\u6362\u6210\u539f\u6765**\u6839\u672c\u6ca1\u6709\u5165\u53e3**\u7684\u5929\u4f7f\u699c
      ['medal', '\u{1F3C5}', T('blockblast.ladder'), String(Ghosts.beatenCount(G.best)) + '/' + Ghosts.LADDER.length, 'PAGE_LADDER'],
      ['frame', '\u{1F47C}', T('blockblast.angels'), String(got), 'PAGE_ANG'],
      ['trophy', '\u{1F3C6}', T('blockblast.achievements'), G.profile.unlocked.length + '/' + Achievements.total(), 'PAGE_ACH'],
      ['scroll', '\u{1F4CB}', T('blockblast.quests'), qd + '/3', 'PAGE_QUESTS'],
      ['palette', '\u{1F3A8}', T('blockblast.skins'), skinN + '/' + Themes.THEMES.length, 'PAGE_SKIN'],
      ['chart', '\u{1F4CA}', T('blockblast.stats'), '', 'PAGE_STATS'],
    ];
    const gw = (w - 8) / 2;
    cells.forEach(function (c2, i) {
      const bx = cx - w / 2 + (i % 2) * (gw + 8), by = y + Math.floor(i / 2) * (gh + 8);
      fillRR(bx, by, gw, gh, 10, 'rgba(0,0,0,0.26)');
      uiIcon(c2[0], c2[1], bx + 23, by + gh / 2, 21);
      ctx.font = 'bold 11px sans-serif';           // ⚠ 量宽前必须设 font（截断的老坑）
      txtL(c2[2], bx + 41, by + gh / 2, '#fff', 'bold 11px sans-serif');
      if (c2[3]) txtR(c2[3], bx + gw - 10, by + gh / 2, PAL.accent, 'bold 11px sans-serif');
      addHit(bx, by, gw, gh, c2[4], {});
    });
    y += 3 * gh + 2 * 8 + gap;

    // ── 底部四钮：⚠ **纯图标认不出来**（15px emoji），一律配一行小字 ──
    const sw = (w - 24) / 4;
    [['shop', '\u{1FA99}', T('blockblast.shop'), 'PAGE_SHOP'],
     ['gem', '\u{1F48E}', T('blockblast.codex'), 'PAGE_DEX'],
     ['info', '\u2696\ufe0f', T('blockblast.fair'), 'PAGE_FAIR'],
     ['settings', '\u2699', T('blockblast.settings'), 'PAGE_SET']].forEach(function (b, i) {
      const bx = cx - w / 2 + i * (sw + 8);
      // ⚠ 底色要**深**：共享库的图标是浅色贴纸风，压在半透明白按钮上会糊成一团（实拍抓到）
      fillRR(bx, y, sw, sh2, 10, 'rgba(0,0,0,0.26)');
      uiIcon(b[0], b[1], bx + sw / 2, y + sh2 / 2 - 5, 18);
      ctx.font = '8px sans-serif';
      txt(b[2], bx + sw / 2, y + sh2 - 8, 'rgba(255,255,255,0.72)', '8px sans-serif');
      addHit(bx, y, sw, sh2, b[3], {});
    });
  }

  /**
   * 🗺 关卡地图 —— **只做一件事：选关**。
   *
   * ⛔ 每日谜题 / 无尽 / 成就 / 皮肤 / 公平 / 设置 / 商店 / 图鉴 / 目标条**一律不再画在这里**：
   *   🏠 HOME 上一模一样有一份，两屏重复正是这页原来「像设置页」的病根
   *   （2026-08-01 用户：「MENU 和主界面重复了」）。这页现在只有
   *   **返回 + 章节页签 + 10 关 + 章末宝箱**，去别处一次点击回 HOME 就到。
   *   ⇒ 子页面的返回键也一律回 HOME（backButton），不再中转这张地图。
   *
   * ⚠ 布局照 renderHome 的「先量后画」：固定块高度先加总，富余高度平摊进间隙 ——
   *   原来写死 `safeTop + 116` 起排，高屏下半屏一片死白、矮屏又挤成一团。
   */
  function renderMenu() {
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const cx = L.cx;
    const w = Math.min(L.playW - 24, 380);
    const x0 = cx - w / 2;
    const chs = Levels.CHAPTERS;
    if (!G.chapter) {
      // 自动定位到「第一个还没打完的关」所在章；全通了就停在最后一章
      const cur = Levels.LEVELS.find(lv => !(G.progress[lv.id] > 0) && (lv.id === 1 || (G.progress[lv.id - 1] || 0) > 0));
      G.chapter = cur ? Levels.chapterOf(cur.id).id : chs[chs.length - 1].id;
    }
    const ch = chs.find(c2 => c2.id === G.chapter) || chs[0];
    const openLv = id => id === 1 || (G.progress[id - 1] || 0) > 0;

    // ── 先量：固定块高度加总，富余高度先喂间隙（有上限），剩下的把整块往下推一点居中 ──
    const tall = SH >= 760;
    const cell = Math.min(tall ? 76 : 66, (w - 4 * 9) / 5);
    const headH = 32, tabH = tall ? 62 : 58, gridH = cell * 2 + 10, chestH = tall ? 56 : 50;
    const top0 = GameGlobal.safeTop + GameGlobal.ctrlH + 6;
    const GAPS = 3;
    const slack = SH - top0 - 20 - (headH + tabH + gridH + chestH) - GAPS * 12;
    const slot = Math.max(0, Math.min(44, slack / (GAPS + 1)));
    const gap = 12 + slot;
    // 喂完间隙还剩的高度：**几乎全留给底部**（那儿有 drawFooterArt 的装饰），顶部只让一丁点 ——
    // ⚠ 系数从 0.35 → 0.1 → 0.03：出商店截图时（932 高）顶部还是空出一大条，白占版面
    let y = top0 + slot + Math.max(0, slack - slot * (GAPS + 1)) * 0.03;

    // ── 顶栏：‹ 返回主页 · 「关卡」 · 总星数 ──
    fillRR(x0, y, 62, headH, 10, 'rgba(255,255,255,0.16)');
    txt('‹ ' + T('blockblast.back'), x0 + 31, y + headH / 2, '#fff', '12px sans-serif');
    addHit(x0, y, 62, headH, 'HOME', {});
    txt(T('blockblast.levels'), cx, y + headH / 2, '#fff', 'bold 19px sans-serif');
    const totalStars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    const pw = 80;
    fillRR(x0 + w - pw, y, pw, headH, 10, 'rgba(0,0,0,0.26)');
    drawStar(x0 + w - pw + 18, y + headH / 2, 9, true);
    txtL(totalStars + '/' + Levels.LEVELS.length * 3, x0 + w - pw + 31, y + headH / 2, '#ffe08a', 'bold 12px sans-serif');
    y += headH + gap;

    // ── 章节选择器：**‹ 当前章 ›**（2026-08-02 从「3 个并排页签」改过来）
    //    ⚠ 关卡扩到 300 关 = 30 章，30 个并排页签是不可能的；一次只显示当前章 + 左右翻，
    //      信息量反而更大（章徽/章名/★n/10 关全放得下）。
    const ARROW = 44, tabW = w - (ARROW + 8) * 2;
    {
      const prev = chs.find(c2 => c2.id === ch.id - 1), next = chs.find(c2 => c2.id === ch.id + 1);
      const arrow = (bx, label, target, enabled) => {
        fillRR(bx, y, ARROW, tabH, 12, enabled ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)');
        txt(label, bx + ARROW / 2, y + tabH / 2, enabled ? '#fff' : 'rgba(255,255,255,0.25)', 'bold 20px sans-serif');
        if (enabled) addHit(bx, y, ARROW, tabH, 'CHAPTER', { id: target });
      };
      arrow(x0, '‹', prev && prev.id, !!prev);
      arrow(x0 + w - ARROW, '›', next && next.id, !!next);

      const tx = x0 + ARROW + 8;
      let st = 0; for (let id = ch.from; id <= ch.to; id++) st += G.progress[id] || 0;
      const open = openLv(ch.from);
      fillRR(tx, y, tabW, tabH, 14, hexA(ch.accent, 0.34));
      strokeRR(tx, y, tabW, tabH, 14, ch.accent, 2);
      const im = ART.get(CH_ART[ch.id]);
      ctx.globalAlpha = open ? 1 : 0.35;
      if (im) ctx.drawImage(im, tx + tabW / 2 - 14, y + 5, 28, 28);
      else drawCrystal(tx + tabW / 2 - 14, y + 5, 28, Levels.KINDS[(ch.id - 1) % Levels.KINDS.length]);
      ctx.globalAlpha = 1;
      if (!open) uiIcon('lock', '\u{1F512}', tx + tabW / 2 + 16, y + 12, 16);
      // 前三章有专名，之后统一「第 N 章」（30 个专名没意义，也没法十语维护）
      const nm = ch.id <= 3 ? T('blockblast.chapter' + ch.id) : T('blockblast.chapterN', { n: ch.id });
      txt(nm, tx + tabW / 2, y + 40, '#fff', 'bold 12px sans-serif');
      const per = (ch.to - ch.from + 1) * 3;
      if (st >= per) uiIcon('crown', '\u{1F451}', tx + tabW / 2 - 22, y + 53, 16);
      else drawStar(tx + tabW / 2 - 22, y + 53, 7, st > 0);
      txtL(st + '/' + per, tx + tabW / 2 - 11, y + 53, ch.accent, 'bold 10px sans-serif');
      txtR(chs.length > 1 ? ch.id + '/' + chs.length : '', tx + tabW - 10, y + 12, 'rgba(255,255,255,0.5)', '9px sans-serif');
    }
    y += tabH + gap;

    // ── 当前章的 10 关（2 行 × 5）：通关 = 章节色 + 三颗星点；当前关 = 白底 + 呼吸描边；
    //    未解锁 = 暗底 + **共享库的锁**（原来是系统 emoji 🔒，每个平台长得都不一样）──
    const gx0 = cx - (5 * cell + 4 * 9) / 2;
    for (let id = ch.from; id <= ch.to; id++) {
      const i = id - ch.from, r = (i / 5) | 0, c = i % 5;
      const x = gx0 + c * (cell + 9), ty = y + r * (cell + 10);
      const stars = G.progress[id] || 0;
      const open = openLv(id);
      if (stars) {
        const g2 = ctx.createLinearGradient(0, ty, 0, ty + cell);
        g2.addColorStop(0, hexA(ch.accent, 0.85)); g2.addColorStop(1, hexA(ch.accent, 0.42));
        ctx.fillStyle = g2; roundRect(x, ty, cell, cell, 14); ctx.fill();
        strokeRR(x, ty, cell, cell, 14, 'rgba(255,255,255,0.30)', 1.5);
      } else {
        fillRR(x, ty, cell, cell, 14, open ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.28)');
      }
      if (open && !stars) {                    // 「该打这一关」—— 呼吸描边把视线拽过去
        const p = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(G.animClock * 3));
        strokeRR(x - 3, ty - 3, cell + 6, cell + 6, 17, hexA(ch.accent, +p.toFixed(2)), 2.5);
      }
      if (open) {
        txt(String(id), x + cx * 0 + cell / 2, ty + cell * (stars ? 0.38 : 0.46),
            stars ? '#fff' : darken(ch.accent, 0.55), 'bold ' + Math.round(cell * 0.36) + 'px sans-serif');
        if (stars) for (let k = 0; k < 3; k++) drawStar(x + cell / 2 - 13 + k * 13, ty + cell - 13, 6.5, k < stars);
        addHit(x, ty, cell, cell, 'PLAY_LEVEL', { id });
      } else {
        uiIcon('lock', '\u{1F512}', x + cell / 2, ty + cell / 2, cell * 0.44);
      }
    }
    y += gridH + gap;

    // ── 章末宝箱：全章 10 关都 ≥1 星才能领（星星经济的章节兑现点）──
    const claimed = (G.wallet.chests || []).includes(ch.id);
    const claimable = Shop.canClaimChest(G.wallet, G.progress, ch);
    let doneN = 0; for (let id = ch.from; id <= ch.to; id++) if (G.progress[id] > 0) doneN++;
    fillRR(x0, y, w, chestH, 14, claimable ? '#f59e0b' : 'rgba(0,0,0,0.24)');
    if (claimable) strokeRR(x0, y, w, chestH, 14, 'rgba(255,255,255,0.45)', 1.5);
    drawArtIcon(ART, 'chest', '\u{1F381}', x0 + 32, y + chestH / 2, 34, '#fff', '20px sans-serif');
    if (claimed) {
      txtL(T('blockblast.chestDone'), x0 + 58, y + chestH / 2, '#7ef2a0', 'bold 13px sans-serif');
      uiIcon('check', '✓', x0 + w - 26, y + chestH / 2, 18);
    } else if (claimable) {
      txtL(T('blockblast.chestClaim', { n: ch.chest }), x0 + 58, y + chestH / 2, '#fff', 'bold 14px sans-serif');
      addHit(x0, y, w, chestH, 'CHEST', { id: ch.id });
    } else {
      txtL(T('blockblast.chest'), x0 + 58, y + 17, '#fff', 'bold 12px sans-serif');
      uiIcon('coin', '\u{1FA99}', x0 + w - 52, y + 17, 15);
      txtL('+' + ch.chest, x0 + w - 42, y + 17, PAL.accent, 'bold 11px sans-serif');
      const barW = w - 58 - 54;
      fillRR(x0 + 58, y + 31, barW, 7, 4, 'rgba(255,255,255,0.16)');
      if (doneN) fillRR(x0 + 58, y + 31, Math.max(5, barW * doneN / 10), 7, 4, ch.accent);
      txtR(doneN + '/10', x0 + w - 14, y + 34, PAL.sub, 'bold 11px sans-serif');
    }
    drawFooterArt(SW, SH, y + chestH);        // 底下的富余高度用淡拼块补白
  }

  /** 成就页 */
  function renderAchievements() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.achievements'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(T('blockblast.achProgress', { a: G.profile.unlocked.length, b: Achievements.total() }),
        cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');

    // 分页（每页 20 条 = 2 列 × 10 行，任何屏都放得下）——
    // 原来「放不下就不画」，矮屏后半成就永远看不见：看不见的成就 = 不存在的留存钩子。
    const got = new Set(G.profile.unlocked);
    const PER = 20, all = Achievements.ACHIEVEMENTS;
    const pages = Math.max(1, Math.ceil(all.length / PER));
    const page = Math.max(0, Math.min(pages - 1, G.achPage || 0));
    const cols = 2, cw = (L.playW - 24) / cols, ch = 34;
    all.slice(page * PER, page * PER + PER).forEach((a, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = L.playX + 12 + c * cw, y = GameGlobal.safeTop + 76 + r * ch;
      const on = got.has(a.id);
      fillRR(x + 2, y, cw - 6, ch - 4, 7, on ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)');
      if (on) drawStar(x + 15, y + (ch - 4) / 2, 7, true);
      txtL(T('blockblast.ach.' + a.id), x + (on ? 25 : 12), y + (ch - 4) / 2,
           on ? PAL.accent : 'rgba(255,255,255,0.45)', '11px sans-serif');
    });
    if (pages > 1) {
      const py = GameGlobal.safeTop + 76 + 10 * ch + 10;
      txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
      if (page > 0) {
        fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx - 110, py, 44, 32, 'ACH_PAGE', { d: -1 });
      }
      if (page < pages - 1) {
        fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx + 66, py, 44, 32, 'ACH_PAGE', { d: 1 });
      }
    }
    backButton();
  }

  /** 皮肤页（靠星星解锁 —— 三星评级的兑现出口）*/
  function renderSkins() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    txt(T('blockblast.skins'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(T('blockblast.stars', { n: stars }), cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');

    ctx.font = 'bold 13px sans-serif';
    txtR(String(G.wallet.coins), L.playX + L.playW - 28, GameGlobal.safeTop + 54, PAL.accent, 'bold 13px sans-serif');
    uiIcon('coin', '\u{1FA99}', L.playX + L.playW - 36 - ctx.measureText(String(G.wallet.coins)).width, GameGlobal.safeTop + 54, 16);
    // ── 📺 看广告解锁下一款（每天 1 款）：先给「玩满 N 盘」那档（本来就白送，只是提前），
    //    没有了才给金币款。⛔ 星星皮肤永远不在这个池子里 —— 星星是三星通关的兑现，不卖。
    const adSkinY = GameGlobal.safeTop + 74;
    const adSkinLeft = Shop.adQuotaLeft(G.wallet, 'skin');
    {
      const on = adSkinLeft > 0 && Themes.THEMES.some(t =>
        (t.games != null || t.coins) && !Themes.isUnlocked(t, stars, G.wallet.themes, G.wallet.gamesPlayed));
      fillRR(L.playX + 14, adSkinY, L.playW - 28, 34, 10, on ? '#7c3aed' : 'rgba(255,255,255,0.10)');
      ctx.font = 'bold 12px sans-serif';
      const lab0 = T('blockblast.adSkin');
      uiIcon('video-ad', '\u{1F4FA}', cx - ctx.measureText(lab0).width / 2 - 13, adSkinY + 17, 17);
      txtL(lab0, cx - ctx.measureText(lab0).width / 2, adSkinY + 17,
           on ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 12px sans-serif');
      txtR(T('blockblast.adLeft', { n: adSkinLeft }), L.playX + L.playW - 26, adSkinY + 17,
           'rgba(255,255,255,0.55)', '10px sans-serif');
      if (on) addHit(L.playX + 14, adSkinY, L.playW - 28, 34, 'AD_SKIN', {});
    }

    // 分页（20 套 = 4 页 × 5）
    const PER = 5;
    const pages = Math.max(1, Math.ceil(Themes.THEMES.length / PER));
    const page = Math.max(0, Math.min(pages - 1, G.skinPage || 0));
    Themes.THEMES.slice(page * PER, page * PER + PER).forEach((t, i) => {
      const y = GameGlobal.safeTop + 116 + i * 76;
      const on = Themes.isUnlocked(t, stars, G.wallet.themes, G.wallet.gamesPlayed), cur = G.theme === t.id;
      fillRR(L.playX + 14, y, L.playW - 28, 66, 12, cur ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.20)');
      txtL(T('blockblast.theme.' + t.id), L.playX + 28, y + 20, on ? '#fff' : 'rgba(255,255,255,0.4)', 'bold 14px sans-serif');
      t.blocks.forEach((c, k) => { fillRR(L.playX + 28 + k * 22, y + 34, 18, 18, 4, c); });   // 色板预览
      if (!on && t.coins) {
        // 金币皮肤：显示价格；买得起就整行可点（金币经济的消耗出口）
        const afford = G.wallet.coins >= t.coins;
        const lab = t.coins + '  ' + T('blockblast.buy');
        ctx.font = 'bold 11px sans-serif';
        uiIcon('coin', '🪙', L.playX + L.playW - 36 - ctx.measureText(lab).width, y + 20, 14);
        txtR(lab, L.playX + L.playW - 28, y + 20,
             afford ? PAL.accent : 'rgba(255,255,255,0.4)', 'bold 11px sans-serif');
        if (afford) addHit(L.playX + 14, y, L.playW - 28, 66, 'BUY_SKIN', { id: t.id });
      } else if (!on && t.games != null) {
        // 盘数皮肤：玩满 N 盘白送（进度直接写在行上）
        const lab2 = T('blockblast.skinPlays', { a: Math.min(G.wallet.gamesPlayed | 0, t.games), b: t.games });
        ctx.font = '11px sans-serif';
        uiIcon('lock', '🔒', L.playX + L.playW - 36 - ctx.measureText(lab2).width, y + 20, 13);
        txtR(lab2, L.playX + L.playW - 28, y + 20, PAL.sub, '11px sans-serif');
      } else if (!on) {
        const lab3 = T('blockblast.skinLocked', { n: t.stars });
        ctx.font = '11px sans-serif';
        uiIcon('lock', '🔒', L.playX + L.playW - 36 - ctx.measureText(lab3).width, y + 20, 13);
        txtR(lab3, L.playX + L.playW - 28, y + 20, PAL.sub, '11px sans-serif');
      } else if (cur) {
        txtR(T('blockblast.equipped'), L.playX + L.playW - 28, y + 20, '#7ef2a0', 'bold 11px sans-serif');
      } else {
        txtR(T('blockblast.equip'), L.playX + L.playW - 28, y + 20, PAL.accent, 'bold 11px sans-serif');
        addHit(L.playX + 14, y, L.playW - 28, 66, 'EQUIP', { id: t.id });
      }
    });
    if (pages > 1) {
      // ⚠ 夹一下：矮屏（360×640）上翻页钮会压到底部的「返回」，两个 hit 区重叠
      const py = Math.min(GameGlobal.safeTop + 116 + PER * 76 + 8, SH - 104);
      txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
      if (page > 0) {
        fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx - 110, py, 44, 32, 'SKIN_PAGE', { d: -1 });
      }
      if (page < pages - 1) {
        fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx + 66, py, 44, 32, 'SKIN_PAGE', { d: 1 });
      }
    }
    backButton();
  }

  /** 公平页 —— 本作最强的差异化：三条**可验证**的承诺（头部产品没人敢写）
   *  也是 App Store 的第一张截图：审核员 30 秒试玩只会看到「又一个 block puzzle」，
   *  差异化必须在这一屏里 5 秒说清（对抗 4.3(a)）。所以它要**填满屏幕**，不能一半空白。
   */
  function renderFair() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx, w = L.playW - 44;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    // 先量高度，再整体垂直居中（原来从顶部堆，下半屏一片空白）
    ctx.font = '13px sans-serif';
    const paras = ['fair1', 'fair2', 'fair3'].map(k => wrapLines(T('blockblast.' + k), w, 6));
    const textH = paras.reduce((a, ls) => a + ls.length * 19 + 16, 0);
    const BAR_H = 132, SEED_H = 58;
    const total = 44 + textH + BAR_H + SEED_H;
    let y = Math.max(GameGlobal.safeTop + 24, GameGlobal.safeTop + (SH - GameGlobal.safeTop - total) / 2 - 40);

    txt(T('blockblast.fairTitle'), cx, y, '#fff', 'bold 21px sans-serif');
    y += 40;

    for (const lines of paras) {
      lines.forEach((ln, i) => txtL(ln, L.playX + 22, y + i * 19, PAL.sub, '13px sans-serif'));
      y += lines.length * 19 + 16;
    }

    // 出块权重可视化 —— 「固定且公开」这条承诺的证据，光靠文字说服力不够
    const bars = [
      { pct: 25, color: '#7ef2a0', label: '25%' },
      { pct: 55, color: PAL.accent, label: '55%' },
      { pct: 20, color: '#f0abfc', label: '20%' },
    ];
    const bw2 = w - 90;
    bars.forEach((b, i) => {
      const by = y + i * 34;
      // 用真实的块画出「小/中/大」示意
      const cs = 11;
      const shape = [[[0, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]][i];
      shape.forEach(([r, c]) => drawBlock(L.playX + 24 + c * (cs + 1), by + 2 + r * (cs + 1), cs, b.color));
      fillRR(L.playX + 78, by + 6, bw2, 13, 6, 'rgba(0,0,0,0.25)');
      fillRR(L.playX + 78, by + 6, bw2 * b.pct / 100, 13, 6, b.color);
      txtR(b.label, L.playX + L.playW - 22, by + 12, PAL.sub, 'bold 11px sans-serif');
    });
    y += BAR_H;

    // 本局种子：玩家可以拿它复现整条块流 —— 承诺 1 的「可验证」就落在这里
    fillRR(L.playX + 22, y, w, 50, 10, 'rgba(0,0,0,0.26)');
    txt(T('blockblast.fairSeed', { s: G.s ? G.s.seed : '—' }), cx, y + 19, PAL.accent, 'bold 14px sans-serif');
    txt(T('blockblast.fairVerify'), cx, y + 38, PAL.sub, '11px sans-serif');

    backButton();
  }

  /** 商店：看广告领币 + 一次性去广告 IAP */
  function renderShop() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.shop'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    ctx.font = 'bold 16px sans-serif';
    const cw0 = ctx.measureText(String(G.wallet.coins)).width;
    uiIcon('coin', '\u{1FA99}', cx - cw0 / 2 - 14, GameGlobal.safeTop + 56, 20);
    txtL(String(G.wallet.coins), cx - cw0 / 2, GameGlobal.safeTop + 56, PAL.accent, 'bold 16px sans-serif');

    // 看广告领币（玩家**主动**触发的激励视频 —— 唯一允许的广告形态之一）
    // ⚠ **每日额度必须写在按钮上**：额度是防「一天刷穿长线经济」的设计，不是抠门，
    //   藏着不说会让人以为坏了（snake 的教训）。用完 ⇒ 灰掉且不挂 hit。
    const y1 = GameGlobal.safeTop + 90;
    const coinsLeft = Shop.adQuotaLeft(G.wallet, 'coins');
    fillRR(L.playX + 20, y1, L.playW - 40, 58, 12, coinsLeft > 0 ? '#22c55e' : 'rgba(255,255,255,0.10)');
    ctx.font = 'bold 15px sans-serif';
    const gw0 = ctx.measureText(T('blockblast.getCoins')).width;
    uiIcon('video-ad', '\u{1F4FA}', cx - gw0 / 2 - 15, y1 + 24, 19);
    txtL(T('blockblast.getCoins'), cx - gw0 / 2, y1 + 24,
         coinsLeft > 0 ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 15px sans-serif');
    txt(T('blockblast.adLeft', { n: coinsLeft }), cx, y1 + 44, 'rgba(255,255,255,0.6)', '10px sans-serif');
    if (coinsLeft > 0) addHit(L.playX + 20, y1, L.playW - 40, 58, 'AD_COINS', {});

    // 👼 画像加速：看广告 +5 张（每天 3 次），或直接花金币 —— 两条路给两种人，
    //    金币也因此多了一个**经常用得上**的去处（皮肤买完就没得花了）。
    const y15 = y1 + 66;
    const galLeft = Shop.adQuotaLeft(G.wallet, 'gallery');
    const galFull = (G.wallet.angels | 0) >= Shop.ANGELS.total;
    {
      const hw = (L.playW - 48) / 2;
      const on = galLeft > 0 && !galFull;
      fillRR(L.playX + 20, y15, hw, 50, 11, on ? '#7c3aed' : 'rgba(255,255,255,0.10)');
      // ⚠ 两个按钮给的是同一样东西，**必须靠图标一眼分清**「看广告」和「花金币」
      //   （只有文字时两颗一模一样，实拍抓到）
      ctx.font = 'bold 12px sans-serif';
      {
        const lab = T('blockblast.adGallery', { n: Shop.AD_REWARD.gallery });
        const lw = ctx.measureText(lab).width;
        uiIcon('video-ad', '\u{1F4FA}', L.playX + 20 + hw / 2 - lw / 2 - 11, y15 + 18, 15);
        txtL(lab, L.playX + 20 + hw / 2 - lw / 2, y15 + 18, on ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 12px sans-serif');
      }
      txt(T('blockblast.adLeft', { n: galLeft }), L.playX + 20 + hw / 2, y15 + 35, 'rgba(255,255,255,0.6)', '10px sans-serif');
      if (on) addHit(L.playX + 20, y15, hw, 50, 'AD_GALLERY', {});

      const afford = G.wallet.coins >= Shop.COIN_PRICE.gallery && !galFull;
      const bx = L.playX + 28 + hw;
      fillRR(bx, y15, hw, 50, 11, afford ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)');
      txt(T('blockblast.adGallery', { n: Shop.AD_REWARD.gallery }), bx + hw / 2, y15 + 18,
          afford ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 12px sans-serif');
      ctx.font = 'bold 11px sans-serif';
      const pl = String(Shop.COIN_PRICE.gallery);
      uiIcon('coin', '\u{1FA99}', bx + hw / 2 - ctx.measureText(pl).width / 2 - 9, y15 + 35, 13);
      txtL(pl, bx + hw / 2 - ctx.measureText(pl).width / 2 + 2, y15 + 35,
           afford ? PAL.accent : 'rgba(255,255,255,0.42)', 'bold 11px sans-serif');
      if (afford) addHit(bx, y15, hw, 50, 'BUY_GALLERY', {});
    }

    // 广告政策直接印在商店页（2026-07-31 定稿：前 50 盘零插屏、之后每 10 盘至多 1 个、只在赢时）——
    // 这是卖点，不是免责声明。IAP 已封存不接（假按钮比没有按钮更伤信任）。
    const y2 = y15 + 62;
    fillRR(L.playX + 20, y2, L.playW - 40, 66, 12, 'rgba(0,0,0,0.20)');
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.adPolicy'), L.playW - 70, 3)
      .forEach((ln, i) => txt(ln, cx, y2 + 20 + i * 15, PAL.sub, '11px sans-serif'));

    backButton();
  }

  /** 每日日历：本月完成打勾；过去 7 天（含今天）可点进去补玩 —— 补玩只记成绩不计 streak */
  function renderCal() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const now = new Date();
    pageTitle('calendar', '📅', T('blockblast.daily'), GameGlobal.safeTop + 30);
    txt(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'),
        cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');
    if (G.profile.dailyStreak) {
      const st = T('blockblast.dailyStreak', { n: G.profile.dailyStreak });
      ctx.font = 'bold 12px sans-serif';
      const stw = ctx.measureText(st).width;
      uiIcon('fire', '🔥', cx - stw / 2 - 10, GameGlobal.safeTop + 74, 15);
      txtL(st, cx - stw / 2, GameGlobal.safeTop + 74, PAL.accent, 'bold 12px sans-serif');
    }

    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDow = first.getDay();
    const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const cw = Math.min(46, (L.playW - 28) / 7);
    const gx = cx - cw * 3.5, gy = GameGlobal.safeTop + 92;
    const bests = G.profile.dailyBest || {};
    for (let d = 1; d <= daysIn; d++) {
      const slot = startDow + d - 1, r = Math.floor(slot / 7), c = slot % 7;
      const x = gx + c * cw, y = gy + r * cw;
      const dt = new Date(now.getFullYear(), now.getMonth(), d);
      const off = Daily.dayNo(now) - Daily.dayNo(dt);
      const playable = off >= 0 && off <= 6;                  // 未来的不能玩，太久远的也不开（防无限内容倒灌）
      const done = !!bests[Daily.dayId(dt)];
      fillRR(x + 2, y + 2, cw - 4, cw - 4, 8, done ? 'rgba(34,197,94,0.35)' : playable ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.15)');
      if (off === 0) { ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2; roundRect(x + 2, y + 2, cw - 4, cw - 4, 8); ctx.stroke(); }
      txt(String(d), x + cw / 2, y + cw / 2 - (done ? 5 : 0),
          playable || done ? '#fff' : 'rgba(255,255,255,0.35)', '12px sans-serif');
      if (done) txt('✓', x + cw / 2, y + cw - 12, '#7ef2a0', 'bold 10px sans-serif');
      if (playable) addHit(x + 2, y + 2, cw - 4, cw - 4, 'PLAY_DAILY_AT', { off });
    }
    const rows = Math.ceil((startDow + daysIn) / 7);
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.calHint'), L.playW - 60, 3)
      .forEach((ln, i) => txt(ln, cx, gy + rows * cw + 22 + i * 16, PAL.sub, '11px sans-serif'));
    backButton();
  }

  /** 水晶图鉴：收集过才点亮（审核员 5 秒能看见的收集外壳，也是长线目标）*/
  function renderDex() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.dexTitle'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    const got = G.profile.crystals || {};
    Levels.KINDS.forEach((k, i) => {
      const y = GameGlobal.safeTop + 56 + i * 86;
      const n = got[k] || 0, seen = n > 0;
      fillRR(L.playX + 14, y, L.playW - 28, 78, 12, 'rgba(0,0,0,0.20)');
      ctx.globalAlpha = seen ? 1 : 0.25;
      drawCrystalArt(L.playX + 24, y + 17, 44, k);
      ctx.globalAlpha = 1;
      txtL(seen ? T('blockblast.dex.' + k) : '???', L.playX + 76, y + 24,
           seen ? '#fff' : 'rgba(255,255,255,0.4)', 'bold 14px sans-serif');
      if (seen) txtR('×' + n, L.playX + L.playW - 26, y + 24, PAL.accent, 'bold 13px sans-serif');
      ctx.font = '11px sans-serif';
      wrapLines(seen ? T('blockblast.dexd.' + k) : T('blockblast.dexLocked'), L.playW - 120, 2)
        .forEach((ln, j) => txtL(ln, L.playX + 76, y + 46 + j * 15,
                                 seen ? PAL.sub : 'rgba(255,255,255,0.3)', '11px sans-serif'));
    });
    backButton();
  }

  // ── 天使图：素材是**全仓共享的那一份**（games/snake/assets/angels/），走 engine/angels.js。
  //    ⛔ 本目录曾拷过一份 26MB 的副本，2026-08-01 删了 —— 别再拷回来（包体积白涨 26MB）。
  //    缓存/LRU/路径（网页 ../snake/ vs 包内 assets/）全在 engine 那边，这里只管画。
  function drawAngel(i, x, y, w, h, r) {
    const im = Angels.img(i);
    ctx.save();
    roundRect(x, y, w, h, r);
    ctx.clip();
    if (im) ctx.drawImage(im, x, y, w, h);
    else { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    return !!im;
  }

  /** 天使图鉴（500 张收集，素材=「大头萌天使」词图）：网格分页 + 点开大图 */
  function renderAngels() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const have = G.wallet.angels | 0, total = Shop.ANGELS.total;
    pageTitle('frame', '\u{1F47C}', T('blockblast.angels'), GameGlobal.safeTop + 30);
    txt(have + ' / ' + total, cx, GameGlobal.safeTop + 54, PAL.accent, 'bold 14px sans-serif');

    const COLS = 4, ROWS = 6, PER = COLS * ROWS;
    const pages = Math.ceil(total / PER);
    const page = Math.max(0, Math.min(pages - 1, G.angPage || 0));
    const cell = Math.min(86, (L.playW - 32) / COLS, (SH - GameGlobal.safeTop - 214) / ROWS);   // 矮屏也放得下
    const gx = cx - (COLS * cell) / 2, gy = GameGlobal.safeTop + 72;
    for (let k = 0; k < PER; k++) {
      const idx0 = page * PER + k;
      if (idx0 >= total) break;
      const x = gx + (k % COLS) * cell, y = gy + Math.floor(k / COLS) * cell;
      if (idx0 < have) {
        drawAngel(idx0, x + 3, y + 3, cell - 6, cell - 6, 10);
        addHit(x + 3, y + 3, cell - 6, cell - 6, 'ANG_VIEW', { i: idx0 });
      } else {
        fillRR(x + 3, y + 3, cell - 6, cell - 6, 10, 'rgba(0,0,0,0.22)');
        txt('?', x + cell / 2, y + cell / 2, 'rgba(255,255,255,0.25)', 'bold 18px sans-serif');
      }
    }
    const py = gy + ROWS * cell + 8;
    txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
    if (page > 0) {
      fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx - 110, py, 44, 32, 'ANG_PAGE', { d: -1 });
    }
    if (page < pages - 1) {
      fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx + 66, py, 44, 32, 'ANG_PAGE', { d: 1 });
    }
    // 📺 收集加速（每天 3 次）：图鉴页是玩家**主动打开**的界面，转化远高于逼着看的位置
    {
      const left = Shop.adQuotaLeft(G.wallet, 'gallery');
      const on = left > 0 && have < total;
      fillRR(L.playX + 20, py + 40, L.playW - 40, 38, 11, on ? '#7c3aed' : 'rgba(255,255,255,0.10)');
      ctx.font = 'bold 12px sans-serif';
      const lab = T('blockblast.adGallery', { n: Shop.AD_REWARD.gallery });
      uiIcon('video-ad', '\u{1F4FA}', cx - ctx.measureText(lab).width / 2 - 13, py + 59, 17);
      txtL(lab, cx - ctx.measureText(lab).width / 2, py + 59,
           on ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 12px sans-serif');
      txtR(T('blockblast.adLeft', { n: left }), L.playX + L.playW - 30, py + 59, 'rgba(255,255,255,0.55)', '10px sans-serif');
      if (on) addHit(L.playX + 20, py + 40, L.playW - 40, 38, 'AD_GALLERY', {});
    }
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.angelHint'), L.playW - 60, 2)
      .forEach((ln, i) => txt(ln, cx, py + 90 + i * 15, PAL.sub, '11px sans-serif'));
    backButton();

    // 大图查看：全屏遮罩 + 居中大图，点任意处关闭
    if (G.angView >= 0 && G.angView < have) {
      drawDim('rgba(10,5,25,0.88)');
      const size = Math.min(L.playW - 48, SH * 0.5);
      drawAngel(G.angView, cx - size / 2, SH * 0.5 - size / 2 - 20, size, size, 18);
      txt('#' + (G.angView + 1), cx, SH * 0.5 + size / 2 + 8, PAL.accent, 'bold 14px sans-serif');
      clearHits();                                     // 遮罩层只留一个「点哪都关」
      addHit(0, 0, SW, SH, 'ANG_CLOSE', {});
    }
  }

  /** 天使榜：预设分数的追赶角色（明确是游戏角色——标题/文案绝不称「玩家」）*/
  function renderLadder() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    pageTitle('trophy', '\u{1F3C6}', T('blockblast.ladder'), GameGlobal.safeTop + 30);
    const beat = Ghosts.beatenCount(G.best);
    txt(T('blockblast.ladderYou', { n: G.best }) + '  ·  ' + beat + '/' + Ghosts.LADDER.length,
        cx, GameGlobal.safeTop + 54, PAL.accent, 'bold 13px sans-serif');

    const PER = 8;
    const pages = Math.ceil(Ghosts.LADDER.length / PER);
    const page = Math.max(0, Math.min(pages - 1, G.ladPage | 0));
    Ghosts.LADDER.slice(page * PER, page * PER + PER).forEach((g, i) => {
      const idx0 = page * PER + i;
      const y = GameGlobal.safeTop + 72 + i * 56;
      const won = G.best > g.score;
      fillRR(L.playX + 14, y, L.playW - 28, 48, 12, won ? 'rgba(34,197,94,0.18)' : 'rgba(0,0,0,0.20)');
      drawAngel(g.img, L.playX + 22, y + 6, 36, 36, 8);
      txtL('#' + (idx0 + 1) + '  ' + g.name, L.playX + 68, y + 24, won ? '#7ef2a0' : '#fff', 'bold 14px sans-serif');
      txtR(won ? g.score + '  ✓' : String(g.score), L.playX + L.playW - 26, y + 24,
           won ? '#7ef2a0' : PAL.sub, 'bold 13px sans-serif');
    });
    const py = GameGlobal.safeTop + 72 + PER * 56 + 6;
    txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
    if (page > 0) {
      fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx - 110, py, 44, 32, 'LAD_PAGE', { d: -1 });
    }
    if (page < pages - 1) {
      fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx + 66, py, 44, 32, 'LAD_PAGE', { d: 1 });
    }
    backButton();
  }

  /** 每日任务页：3 个轻任务 + 进度条（完成自动发奖，无需手动领）*/
  function renderQuests() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    pageTitle('scroll', '\u{1F4CB}', T('blockblast.quests'), GameGlobal.safeTop + 30);
    txt(T('blockblast.questReward'), cx, GameGlobal.safeTop + 54, PAL.sub, '12px sans-serif');

    const qs = Quests.status(G.profile, Daily.dayNo(new Date()));
    qs.forEach((q, i) => {
      const y = GameGlobal.safeTop + 80 + i * 96;
      fillRR(L.playX + 14, y, L.playW - 28, 84, 12, q.done ? 'rgba(34,197,94,0.20)' : 'rgba(0,0,0,0.20)');
      txtL(T('blockblast.q.' + q.t, { n: q.target }), L.playX + 28, y + 24,
           q.done ? '#7ef2a0' : '#fff', 'bold 14px sans-serif');
      // 进度条
      const bw = L.playW - 120;
      fillRR(L.playX + 28, y + 46, bw, 12, 6, 'rgba(0,0,0,0.30)');
      fillRR(L.playX + 28, y + 46, bw * (q.prog / q.target), 12, 6, q.done ? '#22c55e' : PAL.accent);
      txtR(q.done ? '✓' : q.prog + '/' + q.target, L.playX + L.playW - 28, y + 52,
           q.done ? '#7ef2a0' : PAL.sub, 'bold 12px sans-serif');
    });
    const qy = GameGlobal.safeTop + 80 + 3 * 96 + 10;
    // 全部完成的小彩蛋文案
    if (qs.every(q => q.done)) {
      txt('✨ ' + T('blockblast.questAllDone'), cx, qy + 6, '#7ef2a0', 'bold 13px sans-serif');
    } else {
      // 📺 任务加速：直接完成一个（奖励与自己打完**完全一致** —— 两条路给的东西必须一样，
      //    否则「看广告完成」就变成了另一套经济）
      const left = Shop.adQuotaLeft(G.wallet, 'quest');
      fillRR(L.playX + 14, qy, L.playW - 28, 40, 11, left > 0 ? '#7c3aed' : 'rgba(255,255,255,0.10)');
      ctx.font = 'bold 13px sans-serif';
      const lab = T('blockblast.adQuest');
      uiIcon('video-ad', '\u{1F4FA}', cx - ctx.measureText(lab).width / 2 - 14, qy + 20, 18);
      txtL(lab, cx - ctx.measureText(lab).width / 2, qy + 20,
           left > 0 ? '#fff' : 'rgba(255,255,255,0.42)', 'bold 13px sans-serif');
      txtR(T('blockblast.adLeft', { n: left }), L.playX + L.playW - 26, qy + 20, 'rgba(255,255,255,0.55)', '10px sans-serif');
      if (left > 0) addHit(L.playX + 14, qy, L.playW - 28, 40, 'AD_QUEST', {});
    }
    backButton();
  }

  /** 统计页：终身数据一屏（沉没成本可视化 = 留存）*/
  function renderStats() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    pageTitle('chart', '\u{1F4CA}', T('blockblast.stats'), GameGlobal.safeTop + 30);
    const p = G.profile, w = G.wallet;
    const crystals = Object.values(p.crystals || {}).reduce((a, v) => a + v, 0);
    const items = [
      ['stGames', w.gamesPlayed | 0], ['stBestScore', G.best],
      ['stTurns', p.turns | 0], ['stLines', p.lines | 0],
      ['stStreak', p.bestStreak | 0], ['stSweeps', p.sweepsTotal | 0],
      ['stPerfects', p.perfects | 0], ['stLevels', p.levelsWon | 0],
      ['stStars', p.stars | 0], ['stCrystals', crystals],
      ['stAngels', (w.angels | 0) + '/' + Shop.ANGELS.total], ['stDailyDays', p.dailyDays | 0],
      ['stBestDaily', p.bestDailyStreak | 0], ['stCoins', w.coins | 0],
      ['stBrilliant', p.brilliants | 0],
      ['stLevel', 'Lv.' + Meta.levelOf(Achievements.xpOf(p, w.angels))],
    ];
    // 📉「我的弱点」入口：教练的账本读出口（统计是「我做到了多少」，弱点是「我该练什么」）
    {
      const by = GameGlobal.safeTop + 52;
      fillRR(L.playX + 12, by, L.playW - 24, 30, 9, 'rgba(255,255,255,0.14)');
      ctx.font = 'bold 12px sans-serif';
      const lab = T('blockblast.weakTitle');
      uiIcon('search', '\u{1F50D}', cx - ctx.measureText(lab).width / 2 - 12, by + 15, 15);
      txtL(lab, cx - ctx.measureText(lab).width / 2, by + 15, '#fff', 'bold 12px sans-serif');
      addHit(L.playX + 12, by, L.playW - 24, 30, 'PAGE_WEAK', {});
    }
    const cw = (L.playW - 36) / 2;
    items.forEach(([k, v], i) => {
      const x = L.playX + 12 + (i % 2) * (cw + 12), y = GameGlobal.safeTop + 90 + Math.floor(i / 2) * 58;
      fillRR(x, y, cw, 50, 10, 'rgba(0,0,0,0.20)');
      txt(String(v), x + cw / 2, y + 18, PAL.accent, 'bold 16px sans-serif');
      txt(T('blockblast.' + k), x + cw / 2, y + 38, PAL.sub, '10px sans-serif');
    });
    backButton();
  }

  /**
   * 📉「我的弱点」—— 教练（coach.js）账本的读出口。
   *
   * ⭐ 这一页的说服力全在「它不是主观评价」：每一手都拿**和验关卡通关率同一套求解器**
   *   在你落子前算过一遍最优解，两类失误都是纯逻辑可判定的事实（放着能消的行不消 /
   *   一手造出 2 个以上孤格），不是「我觉得你打得不好」。
   * ⚠ 数据不足时**明说数据不足**，绝不硬凑一个诊断（编出来的诊断比没有更伤信任）。
   */
  function renderWeak() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    pageTitle('search', '\u{1F50D}', T('blockblast.weakTitle'), GameGlobal.safeTop + 30);

    const p = G.profile, f = p.faults || {};
    const rows = [['missLine', f.missLine | 0], ['isolate', f.isolate | 0]];
    const tot = rows.reduce((a, r) => a + r[1], 0);
    let y = GameGlobal.safeTop + 64;

    // ✨ 妙手（先说好的：教练不是来骂人的）
    fillRR(L.playX + 14, y, L.playW - 28, 52, 12, 'rgba(255,224,138,0.16)');
    uiIcon('sparkle', '✨', L.playX + 40, y + 26, 22);
    txtL(T('blockblast.stBrilliant'), L.playX + 60, y + 19, '#fff', 'bold 13px sans-serif');
    txtL(T('blockblast.weakBrilliantSub'), L.playX + 60, y + 36, PAL.sub, '10px sans-serif');
    txtR(String(p.brilliants | 0), L.playX + L.playW - 28, y + 26, PAL.accent, 'bold 20px sans-serif');
    y += 64;

    if (tot < 10) {
      // 数据不足：说清还差多少，别编诊断
      ctx.font = '12px sans-serif';
      wrapLines(T('blockblast.weakNeedMore', { n: 10 - tot }), L.playW - 60, 3)
        .forEach((ln, i) => txt(ln, cx, y + 16 + i * 18, PAL.sub, '12px sans-serif'));
    } else {
      const worst = rows.slice().sort((a, b) => b[1] - a[1])[0];
      const bw = L.playW - 56;
      rows.forEach(([k, n]) => {
        const isWorst = k === worst[0];
        // ⚠ 先量后画：建议是整段话，写死 2 行会被截成「…comes f…」（实拍抓到）
        ctx.font = '11px sans-serif';
        const tip = wrapLines(T('blockblast.weakTip.' + k), bw, 4);
        const h = 52 + tip.length * 14 + 6;
        fillRR(L.playX + 14, y, L.playW - 28, h, 12, isWorst ? 'rgba(244,63,94,0.18)' : 'rgba(0,0,0,0.20)');
        txtL(T('blockblast.weak.' + k), L.playX + 28, y + 20, '#fff', 'bold 13px sans-serif');
        txtR(n + '  (' + Math.round(n / tot * 100) + '%)', L.playX + L.playW - 28, y + 20,
             isWorst ? '#fda4af' : PAL.sub, 'bold 12px sans-serif');
        fillRR(L.playX + 28, y + 32, bw, 8, 4, 'rgba(0,0,0,0.30)');
        fillRR(L.playX + 28, y + 32, Math.max(4, bw * n / tot), 8, 4, isWorst ? '#f43f5e' : PAL.accent);
        tip.forEach((ln, i) => txtL(ln, L.playX + 28, y + 52 + i * 14, PAL.sub, '11px sans-serif'));
        y += h + 10;
      });
    }
    // 底注：这套判断的来源（可验证 = 本作的一贯立场）
    ctx.font = '10px sans-serif';
    wrapLines(T('blockblast.weakFrom'), L.playW - 60, 3)
      .forEach((ln, i) => txt(ln, cx, y + 18 + i * 14, 'rgba(255,255,255,0.45)', '10px sans-serif'));
    backButton();
  }

  /** 设置页：下一手预览（关掉 = 硬核模式）/ 粒子特效（低端机、减弱动态）。
   *  声音开关在引擎的悬浮控件里（同一开关不另起一套）。*/
  function renderSettings() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.settings'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');

    const rows = [
      { act: 'TOGGLE_PREVIEW', on: G.opts.preview, label: T('blockblast.optPreview'), sub: T('blockblast.optPreviewSub') },
      { act: 'TOGGLE_FX', on: G.opts.fx, label: T('blockblast.optFx'), sub: T('blockblast.optFxSub') },
    ];
    if (Notify.available) {
      rows.push({ act: 'TOGGLE_REMIND', on: !!G.opts.remind, label: T('blockblast.remind'), sub: T('blockblast.remindSub') });
    }
    rows.forEach((r, i) => {
      const y = GameGlobal.safeTop + 76 + i * 84;
      fillRR(L.playX + 14, y, L.playW - 28, 72, 12, 'rgba(0,0,0,0.20)');
      txtL(r.label, L.playX + 28, y + 24, '#fff', 'bold 14px sans-serif');
      txtL(r.sub, L.playX + 28, y + 48, PAL.sub, '11px sans-serif');
      // 开关胶囊
      const tx = L.playX + L.playW - 92, ty = y + 20;
      fillRR(tx, ty, 64, 30, 15, r.on ? '#22c55e' : 'rgba(255,255,255,0.18)');
      fillRR(r.on ? tx + 36 : tx + 4, ty + 4, 24, 22, 11, '#fff');
      txt(r.on ? T('blockblast.on') : T('blockblast.off'), r.on ? tx + 17 : tx + 46, ty + 15,
          r.on ? '#fff' : PAL.sub, 'bold 9px sans-serif');
      addHit(L.playX + 14, y, L.playW - 28, 72, r.act, {});
    });
    // 按钮行：统计 / 反馈 / Game Center 排行榜（原生）
    const btns = [
      { act: 'PAGE_STATS', icon: 'chart', emoji: '\u{1F4CA}', label: T('blockblast.stats'), data: {} },
      { act: 'FB_OPEN', icon: 'feedback', emoji: '\u{1F4AC}', label: T('blockblast.fbTitle'), data: {} },
    ];
    if (GC.available) btns.push({ act: 'SHOW_GC', icon: 'medal', emoji: '\u{1F3C5}', label: T('blockblast.leaderboards'), data: { board: 'endless' } });
    btns.forEach((b, i) => {
      const y = GameGlobal.safeTop + 76 + rows.length * 84 + i * 60;
      fillRR(L.playX + 14, y, L.playW - 28, 52, 12, 'rgba(0,0,0,0.20)');
      uiIcon(b.icon, b.emoji, L.playX + 38, y + 26, 20);
      txtL(b.label, L.playX + 56, y + 26, '#fff', 'bold 14px sans-serif');
      addHit(L.playX + 14, y, L.playW - 28, 52, b.act, b.data);
    });
    backButton();
  }

  /** 结算页的金币行：+n，未翻倍时旁边给「看广告×2」按钮（拒绝 ⇒ 什么也不发生，红线 2）。
   *  去广告玩家在 main 里已直接拿到双倍 ⇒ 这里只会走「已翻倍」分支，绝不会向付费玩家要广告。*/
  function earnRow(G, y) {
    const e = G.lastEarn;
    if (!e || !e.n) return;
    const cx = L.cx;
    if (e.doubled) {
      uiIcon('coin', '\u{1FA99}', cx - 34, y + 16, 18);
      txtL('+' + e.n + '  ✓', cx - 22, y + 16, '#7ef2a0', 'bold 14px sans-serif');   // ✓ 小到 16px 用图标只会是一团绿
      return;
    }
    uiIcon('coin', '\u{1FA99}', cx - 78, y + 16, 18);
    txtL('+' + e.n, cx - 66, y + 16, PAL.accent, 'bold 14px sans-serif');
    fillRR(cx - 8, y, 124, 32, 10, '#8b5cf6');
    uiIcon('video-ad', '\u{1F4FA}', cx + 10, y + 16, 17);
    txtL(T('blockblast.double'), cx + 22, y + 16, '#fff', 'bold 12px sans-serif');
    addHit(cx - 8, y, 124, 32, 'DOUBLE_COINS', {});
  }

  /** 子页面页头：共享 UI 图标 + 标题（⚠ 图标和文字分开量宽，拼进字符串必叠字）*/
  function pageTitle(icon, emoji, label, y) {
    const cx = L.cx, f = 'bold 22px sans-serif';
    ctx.font = f;
    const tw = ctx.measureText(label).width;
    uiIcon(icon, emoji, cx - tw / 2 - 17, y, 24);
    txtL(label, cx - tw / 2, y, '#fff', f);
  }

  function backButton() {
    // 返回键一律画在**左上角**（2026-08-03 全仓规范,见根 CLAUDE.md）:与系统返回一致不用学;
    // 底部是广告/工具条/home indicator 的地盘,放那儿迟早被压住(solitaire 被真横幅盖住过整颗)。
    // ⛔ y 从 safeTop 起算(刘海/灵动岛),别写死。
    const bx = Math.max(10, L.playX + 8), by = GameGlobal.safeTop + 4, bw = 62, bh = 34;
    fillRR(bx, by, bw, bh, 11, 'rgba(0,0,0,0.34)');
    txt('\u2039 ' + T('blockblast.back'), bx + bw / 2, by + bh / 2, '#fff', '13px sans-serif');
    // \u21d2 HOME \u4e0d\u662f MENU\uff1a\u6240\u6709\u5b50\u9875\u9762\u90fd\u662f**\u4ece\u4e3b\u754c\u9762\u8fdb\u6765\u7684**\uff0c\u5173\u5361\u5730\u56fe\u73b0\u5728\u53ea\u7ba1\u9009\u5173\uff08renderMenu \u7684\u6ce8\u91ca\uff09
    addHit(bx, by, bw, bh, 'HOME', {});
  }

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u7ed3\u7b97\u5361\u7247 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // \u26d4 \u7ed3\u7b97\u7684\u5185\u5bb9\u5fc5\u987b\u843d\u5728\u4e00\u5f20**\u4e0d\u900f\u660e\u7684\u5361**\u4e0a\u3002\u539f\u6765\u6587\u5b57\u76f4\u63a5\u98d8\u5728\u68cb\u76d8\u4e0a\u65b9\uff0c
  //   \u5f69\u5757\u4ece\u300cNext Level\u300d\u6309\u94ae\u8fb9\u4e0a\u900f\u51fa\u6765\u4e00\u7247\u82b1\uff0c\u622a\u56fe\u4e00\u773c\u5c31\u810f\uff08\u672c\u6b21\u6539\u7684\u8d77\u56e0\uff09\u3002
  /** \u753b\u5361\uff08\u5c45\u4e2d\uff0c\u9876\u90e8\u4e00\u6761\u7ae0\u8282\u8272\u5e26\uff09\uff0c\u8fd4\u56de\u5185\u5bb9\u533a\u8d77\u70b9 */
  function settleCard(w, h, accent) {
    const { SH } = GameGlobal, cx = L.cx;
    const x = cx - w / 2;
    const y = Math.max(GameGlobal.safeTop + GameGlobal.ctrlH + 6, (SH - h) / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    fillRR(x, y, w, h, 22, darken(PAL.bg1, 0.42));      // \u8ddf\u7740\u76ae\u80a4\u8d70\u7684\u6df1\u5e95\uff08\u4e0d\u900f\u660e\uff09
    ctx.restore();
    strokeRR(x, y, w, h, 22, 'rgba(255,255,255,0.16)', 1.5);
    ctx.save();                                          // \u9876\u90e8\u5f69\u5e26\uff08\u88c1\u8fdb\u5706\u89d2\u91cc\uff09
    roundRect(x, y, w, h, 22); ctx.clip();
    ctx.fillStyle = accent; ctx.fillRect(x, y, w, 6);
    ctx.restore();
    return { x, y, w, h };
  }
  /** \u5361\u4e0a\u7684\u884c\u5f0f\u5e03\u5c40\uff1a\u5148\u628a\u6bcf\u884c\u7684\u9ad8\u5ea6\u91cf\u597d\uff0c\u518d\u6309\u5e8f\u753b \u2014\u2014 canvas \u6ca1\u6709 flex\uff0c\u5199\u6b7b\u6bd4\u4f8b\u5fc5\u6324 */
  function drawRows(rows, cw, accent, padTop) {
    const h = rows.reduce((a, r) => a + r.h, 0) + (padTop || 14) + 14;
    const card = settleCard(cw, h, accent);
    let y = card.y + (padTop || 14);
    rows.forEach(r => { if (r.fn) r.fn(y); y += r.h; });
    return card;
  }
  const row = (h, fn) => ({ h, fn });
  /** \u4e3b/\u6b21\u6309\u94ae\uff08\u7ed3\u7b97\u5361\u901a\u7528\uff09*/
  function cardBtn(y, w, hgt, label, act, bg, fg, font, icon, emoji) {
    const cx = L.cx, x = cx - w / 2;
    fillRR(x, y, w, hgt, hgt / 2.6, bg);
    const f = font || 'bold 16px sans-serif';
    if (icon) {                                   // 图标钮：图标和文字分开量宽，别拼字符串
      ctx.font = f;
      const tw = ctx.measureText(label).width;
      uiIcon(icon, emoji, cx - tw / 2 - 14, y + hgt / 2, 18);
      txtL(label, cx - tw / 2, y + hgt / 2, fg || '#fff', f);
    } else {
      txt(label, cx, y + hgt / 2, fg || '#fff', f);
    }
    if (act) addHit(x, y, w, hgt, act, {});
  }
  /** \u672c\u76d8\u6536\u96c6\u5230\u7684\u5929\u4f7f\uff1a\u5e26\u7f29\u7565\u56fe\u7684\u5c0f\u836f\u4e38\uff08\u6bd4\u4e00\u884c\u5b57\u66f4\u50cf\u300c\u6211\u62ff\u5230\u4e86\u4e1c\u897f\u300d\uff09*/
  function angelPill(y, n) {
    const cx = L.cx, got = root.G.wallet.angels | 0;
    const label = '+' + n + '  \u00b7  ' + got + '/' + Shop.ANGELS.total;
    ctx.font = 'bold 12px sans-serif';
    const bw = 34 + 6 + ctx.measureText(label).width + 16, x = cx - bw / 2;
    fillRR(x, y, bw, 34, 17, 'rgba(255,255,255,0.12)');
    drawAngel(got - 1, x + 3, y + 3, 28, 28, 14);
    txtL(label, x + 39, y + 17, PAL.accent, 'bold 12px sans-serif');
    addHit(x, y, bw, 34, 'PAGE_ANG', {});
  }

  function renderAll() {
    const G0 = root.G;
    if (G0.phase !== 'HOME') G0.heroIdx = null;   // 离开主界面就作废，下次进来重抽一张主视觉
    if (G0.phase === 'HOME') return renderHome();
    if (G0.phase === 'MENU') return renderMenu();
    if (G0.phase === 'ACH') return renderAchievements();
    if (G0.phase === 'SKIN') return renderSkins();
    if (G0.phase === 'FAIR') return renderFair();
    if (G0.phase === 'SHOP') return renderShop();
    if (G0.phase === 'SET') return renderSettings();
    if (G0.phase === 'CAL') return renderCal();
    if (G0.phase === 'DEX') return renderDex();
    if (G0.phase === 'ANG') return renderAngels();
    if (G0.phase === 'QUESTS') return renderQuests();
    if (G0.phase === 'STATS') return renderStats();
    if (G0.phase === 'LADDER') return renderLadder();
    if (G0.phase === 'WEAK') return renderWeak();
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    computeTray(G.s);                          // 托盘槽位/尺寸随这一手变（实际大小优先）

    // 背景
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const off = FX.offset();
    ctx.save();
    ctx.translate(off.x, off.y);

    const s = G.s;

    // ── HUD（全部相对游戏区，不用 SW）──
    // 顶部一条：金币 + 返回菜单（并排；原来三者挤在一起，实机截图里 Best 被金币压成一团）
    fillRR(L.boardX, L.hudY - 34, 66, 24, 8, 'rgba(0,0,0,0.25)');
    uiIcon('coin', '\u{1FA99}', L.boardX + 15, L.hudY - 22, 16);
    txtL(String(G.wallet.coins), L.boardX + 26, L.hudY - 22, PAL.accent, 'bold 12px sans-serif');
    addHit(L.boardX, L.hudY - 34, 66, 24, 'PAGE_SHOP', {});
    fillRR(L.boardX + 72, L.hudY - 34, 58, 24, 8, 'rgba(255,255,255,0.18)');
    txt('‹ ' + T('blockblast.menu'), L.boardX + 101, L.hudY - 22, '#fff', '11px sans-serif');
    // 关卡局回**关卡地图**（接着挑下一关），其余模式回 🏠 主界面 —— 地图只管选关（renderMenu）
    addHit(L.boardX + 72, L.hudY - 34, 58, 24, s.mode === 'level' ? 'MENU' : 'HOME', {});

    if (s.mode === 'level') {
      // 目标条：每种水晶的「已收集 / 需要」；达成打勾。章节徽章画在关卡标签左侧（主题演进）
      const chIm = ART.get(CH_ART[Levels.chapterOf(s.levelId).id]);
      if (chIm) {
        ctx.drawImage(chIm, L.boardX, L.hudY - 13, 24, 24);
        txtL(T('blockblast.level', { n: s.levelId }), L.boardX + 30, L.hudY, PAL.sub, '13px sans-serif');
      } else {
        txtL(T('blockblast.level', { n: s.levelId }), L.boardX, L.hudY, PAL.sub, '13px sans-serif');
      }
      txtR(T('blockblast.moves', { n: s.stats.turns }) +
           (s.par ? '  ·  ' + T('blockblast.parHint', { n: s.par }) : ''),
           L.boardX + L.boardW, L.hudY, PAL.sub, '12px sans-serif');
      // 目标条压到左 62%，右侧留给迷你「下一手」——关卡模式原来完全没有预览，
      // 把「可见的公平」和规划能力都丢了（DESIGN §1 说预览**常驻**）。
      const kinds = Object.keys(s.goals);
      const showPv = !G.opts || G.opts.preview !== false;
      const gw = (showPv ? L.boardW * 0.62 : L.boardW) / kinds.length;
      kinds.forEach((k, i) => {
        const gx = L.boardX + gw * i + gw / 2, gy = L.nextY + 2;
        const got = s.collected[k] || 0, need = s.goals[k];
        drawCrystalArt(gx - 26 - L.cell * 0.5, gy - L.cell * 0.5, L.cell, k);   // 目标条用生成图（大尺寸质感好）
        const done = got >= need;
        txtL(done ? '✔' : `${need - got}`, gx - 4, gy,
             done ? '#7ef2a0' : '#fff', 'bold 17px sans-serif');
      });
      if (showPv) {
        const nh = Core.nextHand(s);
        const nSize = Math.max(4, Math.round(L.cell * 0.13));
        let nx = L.boardX + L.boardW * 0.66;
        txtL(T('blockblast.next'), nx, L.nextY - 16, PAL.sub, '9px sans-serif');
        for (const p of nh) {
          drawPieceAt(p, nx, L.nextY + 2 - (p.h * nSize) / 2, nSize, 0.5);
          nx += p.wdt * nSize + 8;
        }
      }
    } else {
      txt(String(s.score), L.cx, L.hudY + 2, PAL.text, 'bold 32px sans-serif');
      txtL(T('blockblast.best') + ' ' + G.best, L.boardX, L.hudY + 28, PAL.sub, '12px sans-serif');
      // 濒死心跳（DESIGN §8：fill≥75% 不给文字警告，只给生理紧张；越满跳越快）
      const occ = Core.fillCount(s.board);
      if (!s.over && occ >= 48) {
        const k = 0.5 + 0.5 * Math.sin(G.animClock * (occ >= 56 ? 9 : 5.5));
        ctx.globalAlpha = 0.45 + 0.55 * k;
        txtR('♥', L.boardX + L.boardW, L.hudY + 4, '#fb7185', 'bold ' + Math.round(15 + 5 * k) + 'px sans-serif');
        ctx.globalAlpha = 1;
      }
      if (s.streak >= 2) {
        const m = Core.streakMult(s.streak);
        // 宽限可视化：刚空放了一步 ⇒ 标签转橙闪烁——「再空一步连击就断」这份善意要看得见
        const grace = s.dryTurns === 1;
        const col = grace ? 'rgba(251,146,60,' + (0.5 + 0.5 * Math.sin(G.animClock * 8)).toFixed(2) + ')' : PAL.accent;
        txtR(T('blockblast.combo', { m: m.toFixed(1) }) + (grace ? ' !' : ''),
             L.boardX + L.boardW, L.hudY + 28, col, 'bold 14px sans-serif');
      }
    }

    // ── 下一手预览（块流是预生成的 ⇒ 预览天然成立，绝不会被偷偷换掉）。
    //    设置里可关 = 硬核模式（DESIGN §1 承诺的开关，1.0.1 兑现）。──
    const showPreview = !G.opts || G.opts.preview !== false;
    if (s.mode === 'level') { /* 目标条占了这一行；关卡的迷你预览画在目标条右侧（见上）*/ } else if (showPreview) {
    const nh = Core.nextHand(s);
    const nSize = Math.max(5, Math.round(L.cell * 0.20));
    txtL(T('blockblast.next'), L.boardX, L.nextY, PAL.sub, '11px sans-serif');
    let nx = L.boardX + 46;
    for (const p of nh) {
      drawPieceAt(p, nx, L.nextY - (p.h * nSize) / 2, nSize, 0.5);
      nx += p.wdt * nSize + 14;
    }
    }

    // ── 棋盘 ──
    fillRR(L.boardX - 6, L.boardY - 6, L.boardW + 12, L.boardW + 12, 14, PAL.boardBg);
    if (s.mode === 'level') {
      // 主题演进：棋盘描边用**章节色**（糖果粉 / 深海蓝 / 翡翠绿）
      ctx.strokeStyle = hexA(Levels.chapterOf(s.levelId).accent, 0.7);
      ctx.lineWidth = 3;
      roundRect(L.boardX - 6, L.boardY - 6, L.boardW + 12, L.boardW + 12, 14);
      ctx.stroke();
    }

    // 拖拽中：算出幽灵位置 + 将被消掉的行列；非法落点走虚线描边（DESIGN §5 的色盲友好方案）
    let ghost = null, badTarget = null, hintRows = [], hintCols = [];
    if (G.drag && G.drag.target) {
      const { r, c, piece } = G.drag.target;
      if (!Core.canPlace(s.board, piece, r, c)) {
        badTarget = { r, c, piece };
      } else {
        ghost = { r, c, piece };
        // 预演一次：这一步会消掉哪些行列（消行预览是本作最重要的一个 UI）
        const test = s.board.slice();
        for (const [dr, dc] of piece.cells) test[Core.idx(r + dr, c + dc)] = 1;
        // ⚠ 必须传 s.stone：不传的话，含石块的行会被高亮成「松手就消」，但 core 根本不消
        //    —— 石块的全部教学意义就是「这条线走不通」，预览却告诉玩家能走（红队实测第 11 关）。
        const f = Core.findFullLines(test, s.stone);
        hintRows = f.rows; hintCols = f.cols;
      }
    }

    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const { x, y } = cellXY(r, c);
      const hinted = hintRows.includes(r) || hintCols.includes(c);
      if (hinted) { ctx.fillStyle = PAL.lineHint; roundRect(x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.fill(); }
      else { ctx.fillStyle = PAL.cellEmpty; roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.fill(); }

      const i = Core.idx(r, c);
      if (s.mode === 'level' && s.stone[i]) { drawStone(x, y, L.cell); continue; }   // 石块永不消失
      if (s.board[i] && !FX.isDying(x, y)) {
        drawBlock(x, y, L.cell, G.cellColor[i] || COLORS[4]);
        if (s.mode === 'level' && s.crystal[i]) drawCrystal(x, y, L.cell, s.crystal[i]);
        // ⚠ 消行预览要盖在**已填的块**上 —— 否则高亮只画在背景层、被实心块挡得严严实实，
        //    玩家根本看不见「这一步会消掉这条线」。而这是本作最重要的一个 UI（DESIGN §5）。
        //    出 App Store 截图、逐张验图时才发现它一直是坏的。
        if (hinted) {
          // 提亮 + 金边，而不是拿半透明色**盖**在块上 —— 覆盖会把彩色块冲成灰白，
          // 看起来像「褪色/失焦」，而不是「这条线要炸了」（截图验收发现）。
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          roundRect(x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.fill();
          ctx.strokeStyle = PAL.accent; ctx.lineWidth = Math.max(2, L.cell * 0.07);
          roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
        }
      }
    }

    // 幽灵（合法落点的半透明预演）
    if (ghost) {
      for (const [dr, dc] of ghost.piece.cells) {
        const { x, y } = cellXY(ghost.r + dr, ghost.c + dc);
        ctx.fillStyle = PAL.ghostOk;
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.fill();
      }
    }
    // 非法落点：虚线描边（不用红/绿区分 —— 色盲友好，DESIGN §5；出界的格子不画）
    if (badTarget) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const [dr, dc] of badTarget.piece.cells) {
        const rr = badTarget.r + dr, cc = badTarget.c + dc;
        if (rr < 0 || cc < 0 || rr >= 8 || cc >= 8) continue;
        const { x, y } = cellXY(rr, cc);
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── 托盘（实际大小，见 computeTray）──
    const tray = Core.tray(s);
    for (let i = 0; i < 3; i++) {
      const p = tray[i];
      if (!p) continue;                                  // 已放下的槽留空（其余块不移动）
      if (G.drag && G.drag.slot === i) continue;         // 正在手上的那块不画在托盘里
      if (G.fly && G.fly.slot === i) continue;          // 正在飞回来的那块也不画（否则会重影）
      const r = L.traySlots[i];
      const dead = !Core.canPlaceAnywhere(s.board, p);   // 放不下的块暗掉：失败要看得见原因
      drawPieceAt(p, r.x, r.y, r.size, dead ? 0.35 : 1);
      // 拼块驮着的水晶：托盘里就要看见（玩家得为它规划落点）
      if (s.mode === 'level') {
        const pc = Core.pieceCrystalAt(s, s.streamIndex + i);
        if (pc) drawCrystal(r.x + pc.cell[1] * r.size, r.y + pc.cell[0] * r.size, r.size, pc.kind);
      }
    }

    // FTUE 指引（前 2 关首步）：托盘目标块 + 落点脉冲高亮——把勺子递到手上（DESIGN §6.3）
    if (G.hint && !s.over && !G.drag) {
      const h = G.hint;
      const pulse = (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(G.animClock * 4))).toFixed(2);
      ctx.strokeStyle = 'rgba(126,242,160,' + pulse + ')';
      const tr2 = L.traySlots && L.traySlots[h.slot];
      if (tr2) {
        ctx.lineWidth = 3;
        roundRect(tr2.x - 6, tr2.y - 6, tr2.w + 12, tr2.h + 12, 10); ctx.stroke();
      }
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const [dr, dc] of h.piece.cells) {
        const { x, y } = cellXY(h.r + dr, h.c + dc);
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 💡 教练提示（玩家**主动**求助时才出现）：金色脉冲标出最优落点 + 托盘里那一块。
    //    ⚠ 与上面的 FTUE 指引分开画：那个是前 2 关自动出现的教学，这个是随时可求助的提示，
    //      同时出现时颜色也要能分辨（绿=教学 / 金=提示）。
    if (G.coachHint && !s.over && !G.drag) {
      const h = G.coachHint, hp = tray[h.slot];
      if (hp) {
        const pulse = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(G.animClock * 4))).toFixed(2);
        ctx.strokeStyle = 'rgba(255,224,138,' + pulse + ')';
        const tr3 = L.traySlots && L.traySlots[h.slot];
        if (tr3) { ctx.lineWidth = 3; roundRect(tr3.x - 6, tr3.y - 6, tr3.w + 12, tr3.h + 12, 10); ctx.stroke(); }
        ctx.lineWidth = 2.5;
        for (const [dr, dc] of hp.cells) {
          const { x, y } = cellXY(h.r + dr, h.c + dc);
          roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
        }
      }
    }

    // ── 拖拽中的块（浮在指尖上方，尺寸从托盘尺寸**平滑长到**棋盘格尺寸）──
    if (G.drag) {
      const d = G.drag;
      const size = d.fromSize + (L.cell - d.fromSize) * Drag.ease(d.grow);
      const bx = d.px - d.anchorDC * size - size / 2;
      const by2 = d.py - d.anchorDR * size - size / 2 - L.cell * Drag.LIFT;
      drawPieceAt(d.piece, bx, by2, size, badTarget ? 0.55 : 0.95);   // 非法落点：块变暗（§5）
      if (s.mode === 'level') {
        const pc = Core.pieceCrystalAt(s, s.streamIndex + d.slot);
        if (pc) drawCrystal(bx + pc.cell[1] * size, by2 + pc.cell[0] * size, size, pc.kind);
      }
    }

    // ── 回弹中的块（非法松手 → 飞回托盘并缩回原尺寸）──
    if (G.fly) {
      const f = G.fly, k = Drag.ease(f.t / f.dur);
      const size = f.s0 + (f.s1 - f.s0) * k;
      drawPieceAt(f.piece, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k, size, 0.9);
    }

    // ── 道具条：撤销 / 换一手。标签直接显示「免费 / 看广告 / 多少金币」——
    //    玩家永远先拿到不花钱的选项（DESIGN §9；原作的撤销要 1300 金币是逼氪价，不学）。
    if (!s.over) {
      const gap2 = 6, bh2 = 36, uy = L.trayY + L.trayH + 6;
      const bw2 = Math.min(96, (L.boardW - gap2 * 3) / 4);
      // \u7B2C\u4E09\u4E2A\u4F4D\u7F6E**\u4E00\u683C\u4E24\u7528**\uFF08\u540C\u4E00\u4F4D\u7F6E\u3001\u8BED\u4E49\u90FD\u662F\u300C\u5C40\u5185\u589E\u76CA\u300D\u21D2 \u4E0D\u4F1A\u6296\u52A8\uFF09\uFF1A
      //   \u8FD8\u6CA1\u843D\u5B50 \u21D2 \uD83D\uDE80 \u5F00\u5C40\u793C\u5305\uFF08\u770B\u5E7F\u544A\u6216 200 \u5E01\uFF09\uFF1B\u5DF2\u7ECF\u5F00\u6253 \u21D2 \uD83E\uDDF1 \u9001\u65B9\u5757\uFF08\u76D8\u9762\u8D8A\u6EE1\u8D8A\u6551\u547D\uFF09
      const boostable = s.stats.turns === 0 && G.items;
      const md = (kind, coinKind) => (Shop.adMode(G.wallet, kind, Date.now()) !== 'no' ? 'ad'
                 : (G.wallet.coins >= Shop.COIN_PRICE[coinKind || kind] ? 'coins' : 'no'));
      const hintMode = (G.items && G.items.hintFree > 0) ? 'free' : Shop.adMode(G.wallet, 'hint', Date.now()) === 'no' ? 'no' : 'ad';
      const blocksOk = !s.daily && !s.challenge;         // \u26D4 \u6BCF\u65E5/\u6311\u6218\u7981\u7528\uFF1A\u540C\u79CD\u5B50\u7684\u5206\u6570\u5FC5\u987B\u53EF\u6BD4
      const items = [
        { act: 'UNDO', on: !!s.undo, label: '\u21A9 ' + T('blockblast.undo'),
          mode: Shop.undoMode(G.wallet, G.items), price: Shop.PRICE.undo },
        { act: 'REFRESH', on: true, label: '\u21BB ' + T('blockblast.refresh'),
          mode: Shop.refreshMode(G.wallet, G.items), price: Shop.PRICE.refresh },
        boostable
          ? { act: md('boost') === 'coins' ? 'BUY_BOOST' : 'AD_BOOST', on: true,
              label: '\u{1F680} ' + T('blockblast.boost'), mode: md('boost'), price: Shop.COIN_PRICE.boost }
          : { act: md('blocks') === 'coins' ? 'BUY_BLOCKS' : 'AD_BLOCKS', on: blocksOk,
              label: '\u{1F9F1} ' + T('blockblast.blocks'), mode: blocksOk ? md('blocks') : 'no',
              price: Shop.COIN_PRICE.blocks },
        { act: 'HINT', on: true, label: '\u{1F4A1} ' + T('blockblast.hint'), mode: hintMode, price: 0 },
      ];
      items.forEach((it, i) => {
        const x = L.cx - (bw2 * 4 + gap2 * 3) / 2 + i * (bw2 + gap2);
        const usable = it.on && it.mode !== 'no';
        fillRR(x, uy, bw2, bh2, 10, usable ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)');
        txt(it.label, x + bw2 / 2, uy + 12, usable ? '#fff' : 'rgba(255,255,255,0.35)', '11px sans-serif');
        const tagIcon = it.mode === 'ad' ? 'video-ad' : it.mode === 'coins' ? 'coin' : null;
        const tag = it.mode === 'free' ? T('blockblast.free')
                  : it.mode === 'ad' ? T('blockblast.watchAd')
                  : it.mode === 'coins' ? String(it.price)
                  : T('blockblast.notEnough');
        const tcol = it.mode === 'free' ? '#7ef2a0' : usable ? PAL.accent : 'rgba(255,255,255,0.3)';
        if (tagIcon) {
          ctx.font = '10px sans-serif';
          const tw2 = ctx.measureText(tag).width;
          uiIcon(tagIcon, it.mode === 'ad' ? '📺' : '🪙', x + bw2 / 2 - tw2 / 2 - 8, uy + 26, 13);
          txtL(tag, x + bw2 / 2 - tw2 / 2 + 1, uy + 26, tcol, '10px sans-serif');
        } else txt(tag, x + bw2 / 2, uy + 26, tcol, '10px sans-serif');
        if (usable) addHit(x, uy, bw2, bh2, it.act, {});
      });
    }


    FX.draw(ctx);
    ctx.restore();

    // ── 死亡序列（DESIGN §2「失败必须可归因」）：先回放最后几手，再逐块红色扫盘
    //    证明「剩余的每一块确实都放不下」。播完才轮到结算浮层；点任意处跳过。──
    if (s.over && G.overAnim && !s.won && !s.unwinnable) {
      const a = G.overAnim;
      drawDim('rgba(20,10,40,0.30)');
      if (a.t < a.prologue) {
        const seq = G.recentPlaces.slice(-3);
        const i = Math.min(Math.floor(a.t / 0.3), seq.length - 1);
        txt(T('blockblast.lastMoves'), L.cx, L.boardY - 16, PAL.accent, 'bold 13px sans-serif');
        if (seq[i]) {
          ctx.strokeStyle = PAL.accent; ctx.lineWidth = 3;
          for (const [r, c] of seq[i]) {
            const { x, y } = cellXY(r, c);
            roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
          }
        }
      } else {
        const ts = a.t - a.prologue;
        const i = Math.min(Math.floor(ts / a.per), a.n - 1);
        const k = Math.min((ts - i * a.per) / a.per, 1);
        txt(T('blockblast.noFit'), L.cx, L.boardY - 16, '#fb7185', 'bold 13px sans-serif');
        ctx.fillStyle = 'rgba(244,63,94,0.16)';                       // 红色扫描带扫过棋盘
        ctx.fillRect(L.boardX + (L.boardW - 44) * k, L.boardY, 44, L.boardW);
        const tray2 = Core.tray(s);                                    // 正被「审问」的那块红框脉冲
        let seen = -1;
        for (let j = 0; j < 3; j++) {
          if (!tray2[j]) continue;
          seen++;
          if (seen !== i || !L.traySlots) continue;
          const rct = L.traySlots[j];
          ctx.strokeStyle = 'rgba(244,63,94,' + (0.55 + 0.45 * Math.sin(G.animClock * 10)).toFixed(2) + ')';
          ctx.lineWidth = 3;
          roundRect(rct.x - 6, rct.y - 6, rct.w + 12, rct.h + 12, 10); ctx.stroke();
        }
      }
      addHit(0, 0, SW, SH, 'SKIP_OVERANIM', {});
      return;
    }

    // ── 关卡浮层：胜利（三星）/ 失败 / 不可胜 ──
    //    整块内容装在一张卡里（settleCard），行高先量后画 ⇒ 任何屏都不挤、也不会被棋盘透花。
    if (s.mode === 'level' && s.over) {
      drawDim('rgba(14,7,32,0.86)');
      const cx = L.cx;
      const cw = Math.min(L.playW - 36, 322);
      const cmp = SH < 700;                                    // 矮屏：字号/行高整体收一档
      const chp = Levels.chapterOf(s.levelId);
      const rows = [];
      rows.push(row(cmp ? 14 : 18, y => txt(T('blockblast.level', { n: s.levelId }), cx, y + 7, PAL.sub, '11px sans-serif')));

      if (s.won) {
        const stars = Core.starsFor(s);
        // ⏱ 入场进度（秒）：星星逐颗弹、天使淡入都按它算。没有 wonAt 就当已播完（不卡在半路）。
        const tIn = G0.wonAt ? (Date.now() - G0.wonAt) / 1000 : 9;

        // 🎀 天使来祝贺 —— 本作 500 张收藏品的世界观，赢的这一屏正该让她出场。
        // ⚠ 按关号**确定性**挑一张（同一关每次都是同一位；⛔ 每帧 Math.random 会疯狂闪）；
        //   只从**已解锁**的里挑，素材没加载好就整块不占位（不留空框）。
        const angN = (G0.wallet && G0.wallet.angels) | 0;
        const ar = cmp ? 34 : 42;
        if (angN > 0) {
          rows.push(row(ar * 2 + (cmp ? 4 : 8), y => {
            const ai = (s.levelId * 7919) % angN;
            const acy = y + ar + 2;
            const pop = Math.min(1, tIn / 0.32);                 // 淡入 + 轻微放大
            ctx.save();
            ctx.globalAlpha = pop;
            drawHalo(cx, acy, ar * (0.9 + 0.1 * pop), G0.animClock);
            const rr = ar * (0.86 + 0.14 * pop);
            drawAngel(ai, cx - rr, acy - rr, rr * 2, rr * 2, rr);
            ctx.restore();
          }));
        }

        rows.push(row(cmp ? 28 : 34, y =>
          txt(T('blockblast.levelWin'), cx, y + (cmp ? 14 : 17), '#fff', 'bold ' + (cmp ? 21 : 25) + 'px sans-serif')));
        // 三颗星**逐颗弹出**（第 i 颗在 0.18+i*0.22 秒落位）+ 落位后极缓呼吸。
        // ⚠ 弹出要「冲过头再回弹」，线性放大看着像卡顿。
        const sr = cmp ? 22 : 27;
        rows.push(row(sr * 2 + (cmp ? 6 : 12), y => {
          for (let i = 0; i < 3; i++) {
            const on = i < stars;
            const t0 = 0.18 + i * 0.22;
            const p = on ? Math.max(0, Math.min(1, (tIn - t0) / 0.26)) : 1;
            if (on && p <= 0) continue;                          // 还没轮到它
            const back = on && p < 1 ? 1 + Math.sin(p * Math.PI) * 0.34 : 1;
            const breathe = on && p >= 1 ? 1 + 0.045 * Math.sin(G0.animClock * 2.4 + i * 0.7) : 1;
            if (on) { ctx.save(); ctx.shadowColor = 'rgba(255,214,74,0.75)'; ctx.shadowBlur = 18; }
            drawStar(cx + (i - 1) * (sr * 2 + 6), y + sr + (cmp ? 3 : 6), sr * back * breathe, on);
            if (on) ctx.restore();
          }
        }));
        rows.push(row(20, y => txt(
          T('blockblast.moves', { n: s.stats.turns }) + (s.par ? '  ·  ' + T('blockblast.parHint', { n: s.par }) : ''),
          cx, y + 10, PAL.sub, '12px sans-serif')));
        rows.push(row(cmp ? 32 : 38, y => {
          txt(String(s.score), cx, y + (cmp ? 16 : 19), '#ffe08a', 'bold ' + (cmp ? 25 : 29) + 'px sans-serif');
        }));
        if (G0.lastEarn && G0.lastEarn.n) rows.push(row(42, y => earnRow(G0, y + 4)));   // 金币 + 看广告×2
        if (G0.newAngels > 0) rows.push(row(42, y => angelPill(y + 4, G0.newAngels)));
        rows.push(row(cmp ? 8 : 12, null));
        rows.push(row(cmp ? 46 : 52, y =>
          cardBtn(y, cw - 56, cmp ? 42 : 48, T('blockblast.nextLevel'), 'NEXT_LEVEL', '#22c55e', '#fff',
                  'bold ' + (cmp ? 15 : 17) + 'px sans-serif')));
      } else {
        const unwin = s.unwinnable;
        rows.push(row(cmp ? 28 : 34, y =>
          txt(T(unwin ? 'blockblast.unwinnable' : 'blockblast.levelFail'), cx, y + (cmp ? 14 : 17),
              '#fff', 'bold ' + (cmp ? 21 : 24) + 'px sans-serif')));
        const hint = T(unwin ? 'blockblast.unwinnableHint' : 'blockblast.levelFailHint');
        ctx.font = '12px sans-serif';                     // ⚠ wrapLines 按当前 font 量宽
        const lines = wrapLines(hint, cw - 44, 3);
        rows.push(row(lines.length * 17 + 12, y =>
          lines.forEach((ln, i) => txt(ln, cx, y + 8 + i * 17, PAL.sub, '12px sans-serif'))));
        rows.push(row(10, null));
        // ⚠ 关卡失败**只给「立刻重来」** —— 零广告、零插屏、零续命兜售（DESIGN §6.2）
        rows.push(row(cmp ? 46 : 52, y =>
          cardBtn(y, cw - 56, cmp ? 42 : 48, T('blockblast.retry'), 'RETRY_LEVEL', '#22c55e', '#fff',
                  'bold ' + (cmp ? 15 : 17) + 'px sans-serif')));
      }
      rows.push(row(8, null));
      rows.push(row(40, y =>
        cardBtn(y, cw - 96, 38, T('blockblast.levels'), 'MENU', 'rgba(255,255,255,0.16)', '#fff', '13px sans-serif')));

      drawRows(rows, cw, chp.accent, 14);
      return;                       // ⚠ 别再 restore：上面 FX.draw 之后已经 restore 过了
    }

    // ── 结束浮层（无尽/每日/挑战）：结算不只是「你死了」，是下一局的动机 ──
    //    与关卡结算同一张卡（settleCard + drawRows）：两套结算风格分裂比丑更糟。
    if (s.over) {
      drawDim('rgba(14,7,32,0.84)');
      const cx = L.cx;
      const cw = Math.min(L.playW - 36, 330);
      const cmp = SH < 700;
      const rows = [];
      rows.push(row(cmp ? 28 : 34, y =>
        txt(T('blockblast.gameOver'), cx, y + (cmp ? 14 : 17), '#fff', 'bold ' + (cmp ? 21 : 25) + 'px sans-serif')));
      ctx.font = '12px sans-serif';
      const nm = wrapLines(T('blockblast.noMoves'), cw - 44, 2);
      rows.push(row(nm.length * 16 + 8, y => nm.forEach((ln, i) => txt(ln, cx, y + 8 + i * 16, PAL.sub, '12px sans-serif'))));
      rows.push(row(cmp ? 34 : 40, y =>
        txt(T('blockblast.finalScore', { n: s.score }), cx, y + (cmp ? 17 : 20), '#ffe08a', 'bold ' + (cmp ? 25 : 29) + 'px sans-serif')));
      // ⚠ 用 G.newBestRun 标志，不能现比 score>best —— over 时 best 已被更新，现比永远是假
      //   （老写法就是因此从没显示过「New Best!」）。没破纪录就把差距亮出来 = 重开的理由。
      if (G.newBestRun) {
        rows.push(row(22, y => txt(T('blockblast.newBest'), cx, y + 11, '#7ef2a0', 'bold 15px sans-serif')));
      } else if (!s.daily && !s.challenge && G.best > s.score) {
        rows.push(row(20, y => txt(T('blockblast.bestGap', { n: G.best - s.score }), cx, y + 10, PAL.sub, '12px sans-serif')));
      }
      // 天使榜对比：本盘打到第几、下一个差多少（点击看全榜）
      const gBeat = Ghosts.beatenCount(Math.max(s.score, G.best));
      const gNext = Ghosts.nextTarget(Math.max(s.score, G.best));
      rows.push(row(26, y => {
        const label = T('blockblast.ghostLine', { a: gBeat, b: Ghosts.LADDER.length }) +
                      (gNext ? '  ·  ' + T('blockblast.ghostNext', { name: gNext.name, n: gNext.score + 1 - Math.max(s.score, G.best) }) : '');
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width;
        uiIcon('trophy', '\u{1F3C6}', cx - tw / 2 - 11, y + 12, 16);
        txtL(label, cx - tw / 2, y + 12, PAL.accent, 'bold 11px sans-serif');
        addHit(cx - tw / 2 - 20, y, tw + 26, 24, 'PAGE_LADDER', {});
      }));
      const sweeps = s.stats.sweeps + s.stats.deeps + s.stats.perfects;
      rows.push(row(22, y =>
        txt(T('blockblast.statLine', { a: s.stats.maxStreak, b: sweeps }), cx, y + 11, PAL.sub, '12px sans-serif')));
      // 🔍 死亡复盘（coach.js）：死亡序列已经证明了「都放不下」，这里回答**为什么会走到这一步**。
      //    ⚠ 只在真算出「当时换个放法能多活 ≥3 步」时才说 —— 算不出就闭嘴，绝不编故事。
      if (G.review) {
        ctx.font = '11px sans-serif';
        const rv = wrapLines(T('blockblast.reviewLine', { t: G.review.turn, n: G.review.gain }), cw - 44, 2);
        rows.push(row(rv.length * 15 + 10, y => {
          rv.forEach((ln, i) => txt(ln, cx, y + 8 + i * 15, '#fda4af', '11px sans-serif'));
        }));
      }
      if (G.lastEarn && G.lastEarn.n) rows.push(row(40, y => earnRow(G, y + 3)));   // 得分换金币 + 看广告×2
      if (G.newAngels > 0) rows.push(row(40, y => angelPill(y + 3, G.newAngels)));
      rows.push(row(20, y => txt(T('blockblast.seed', { s: s.seed }), cx, y + 10, 'rgba(255,255,255,0.42)', '11px sans-serif')));
      // 分享/补签按钮（按优先级）：断签补签 > 每日分享成绩 > 种子挑战
      const canRepair = G.repairOffer && G.wallet.coins >= Daily.REPAIR_COST;
      const shareBtn = (s.daily && G.repairOffer)
        ? { icon: 'fire', emoji: '\u{1F525}', label: T('blockblast.repair', { n: G.repairOffer.prev + 1 }),
            act: canRepair ? 'REPAIR_STREAK' : null,                  // 金币不够：按钮置灰不可点
            bg: canRepair ? '#f59e0b' : 'rgba(0,0,0,0.25)' }
        : s.daily
        ? { icon: 'share', emoji: '\u{1F4E4}', label: T('blockblast.shareScore'), act: 'SHARE_DAILY', bg: 'rgba(255,255,255,0.16)' }
        : { icon: 'share', emoji: '\u{1F517}', label: T('blockblast.challenge'), act: 'SHARE_SEED', bg: 'rgba(255,255,255,0.16)' };
      rows.push(row(6, null));
      rows.push(row(42, y => cardBtn(y, cw - 70, 36, shareBtn.label, shareBtn.act, shareBtn.bg,
                                     shareBtn.act ? '#fff' : 'rgba(255,255,255,0.4)', '13px sans-serif',
                                     shareBtn.icon, shareBtn.emoji)));
      rows.push(row(cmp ? 46 : 52, y =>
        cardBtn(y, cw - 56, cmp ? 42 : 48, T('blockblast.restart'), 'RESTART', '#22c55e', '#fff',
                'bold ' + (cmp ? 15 : 17) + 'px sans-serif')));
      rows.push(row(8, null));
      rows.push(row(40, y =>
        cardBtn(y, cw - 96, 38, T('blockblast.menu'), 'HOME', 'rgba(255,255,255,0.16)', '#fff', '13px sans-serif')));
      drawRows(rows, cw, PAL.accent, 14);
    }
  }

  const API = { layout, renderMenu, renderAchievements, renderSkins, renderFair, renderShop, computeTray, cellXY, cellAt, traySlotCenter, traySlotAt,
                colorOf, applyTheme, drawCrystal, L, COLORS };
  root.Render = API;
  applyTheme('candy');          // 默认皮肤（必须在 API 定义之后 —— 见上面的 TDZ 说明）
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
