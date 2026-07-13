// ════════════════════════════════════════
// render.js — 布局 + 全屏重画（引擎契约：每帧 clearHits() → 从 G 重画 → addHit()）。
// ⚠ 棋盘/托盘区域**故意不 addHit()**：它们由 drag.js 用 pointer 事件处理。
//    引擎 Input 的 tap 因此在这些区域无区域可命中，放下拼块的那次 pointerup
//    不会被 hitTest 误判成一次点击（DESIGN §5）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const PAL = {
    bg1: '#6d3fb4', bg2: '#8e5ad0',
    boardBg: 'rgba(40,26,74,0.55)', cellEmpty: 'rgba(255,255,255,0.06)',
    text: '#ffffff', sub: 'rgba(255,255,255,0.75)',
    ghostOk: 'rgba(255,255,255,0.35)', lineHint: 'rgba(255,236,140,0.55)',
  };
  // 块的颜色纯装饰（消除只看行列是否填满，不看颜色）。
  // ⚠ 按块在表中的**序号**取色，不要用 id 的字符串哈希 —— 哈希会撞车，
  //    实机出现过「一手三块全是黄的」（34 块 % 7 色，序号取色则均匀铺开）。
  const COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
  const COLOR_BY_ID = {};
  Pieces.PIECES.forEach((p, i) => { COLOR_BY_ID[p.id] = COLORS[i % COLORS.length]; });
  const colorOf = id => COLOR_BY_ID[id] || COLORS[4];

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
    const gapNext = 34, gapBoard = Math.round(cell * 0.8), gapTray = Math.round(cell * 0.55);
    const contentH = 26 + gapNext + gapBoard + bw + gapTray + L.trayH;
    const top = Math.max(safeTop + 8, safeTop + (avail - contentH) / 2);

    L.hudY = Math.round(top + 13);
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
    const GAP_MIN = 5, GAP_NICE = 14;
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
  };
  function drawCrystal(x, y, size, kind) {
    const cr = CRYSTAL[kind] || CRYSTAL.blue;
    const cx = x + size / 2, cy = y + size / 2, r = size * 0.26;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
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
  function renderMenu() {
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const cx = L.cx;
    txt(T('blockblast.title'), cx, GameGlobal.safeTop + 46, '#fff', 'bold 30px sans-serif');
    txtLWrap(T('blockblast.tagline'), cx - 150, GameGlobal.safeTop + 78, 300, PAL.sub, '12px sans-serif', 16);

    // 关卡格子（已通关的显示星数；未解锁的锁住）
    const cols = 5, cell = Math.min(58, (L.playW - 40) / cols);
    const gx0 = cx - (cols * cell) / 2, gy0 = GameGlobal.safeTop + 120;
    Levels.LEVELS.forEach((lv, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = gx0 + c * cell, y = gy0 + r * cell;
      const stars = G.progress[lv.id] || 0;
      const unlocked = lv.id === 1 || (G.progress[lv.id - 1] || 0) > 0;
      fillRR(x + 3, y + 3, cell - 6, cell - 6, 10, unlocked ? (stars ? '#22c55e' : 'rgba(255,255,255,0.20)') : 'rgba(0,0,0,0.25)');
      txt(unlocked ? String(lv.id) : '🔒', x + cell / 2, y + cell / 2 - 5, '#fff', 'bold 16px sans-serif');
      if (stars) txt('★'.repeat(stars), x + cell / 2, y + cell - 14, '#ffe08a', '10px sans-serif');
      if (unlocked) addHit(x + 3, y + 3, cell - 6, cell - 6, 'PLAY_LEVEL', { id: lv.id });
    });

    const by = gy0 + Math.ceil(Levels.count() / cols) * cell + 24;
    fillRR(cx - 95, by, 190, 50, 14, '#f59e0b');
    txt(T('blockblast.endless'), cx, by + 25, '#fff', 'bold 17px sans-serif');
    addHit(cx - 95, by, 190, 50, 'PLAY_ENDLESS', {});
    txt(T('blockblast.best') + ' ' + G.best, cx, by + 72, PAL.sub, '13px sans-serif');
  }

  function renderAll() {
    const G0 = root.G;
    if (G0.phase === 'MENU') return renderMenu();
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
    if (s.mode === 'level') {
      // 目标条：每种水晶的「已收集 / 需要」；达成打勾
      txtL(T('blockblast.level', { n: s.levelId }), L.boardX, L.hudY, PAL.sub, '13px sans-serif');
      txtR(T('blockblast.moves', { n: s.stats.turns }) +
           (s.par ? '  ·  ' + T('blockblast.parHint', { n: s.par }) : ''),
           L.boardX + L.boardW, L.hudY, PAL.sub, '12px sans-serif');
      const kinds = Object.keys(s.goals);
      const gw = L.boardW / kinds.length;
      kinds.forEach((k, i) => {
        const gx = L.boardX + gw * i + gw / 2, gy = L.nextY + 2;
        const got = s.collected[k] || 0, need = s.goals[k];
        drawCrystal(gx - 26 - L.cell * 0.5, gy - L.cell * 0.5, L.cell, k);
        const done = got >= need;
        txtL(done ? '✔' : `${need - got}`, gx - 4, gy,
             done ? '#7ef2a0' : '#fff', 'bold 17px sans-serif');
      });
    } else {
      txt(String(s.score), L.cx, L.hudY, PAL.text, 'bold 34px sans-serif');
      txtL(T('blockblast.best') + ' ' + G.best, L.boardX, L.hudY - 14, PAL.sub, '12px sans-serif');
      // 返回菜单：没有它，进过无尽模式的玩家**永远回不到关卡地图**（唯一出路是清 localStorage）
      fillRR(L.boardX, L.hudY + 2, 52, 22, 8, 'rgba(255,255,255,0.18)');
      txt('‹ ' + T('blockblast.menu'), L.boardX + 26, L.hudY + 13, '#fff', '11px sans-serif');
      addHit(L.boardX, L.hudY + 2, 52, 22, 'MENU', {});
      if (s.streak >= 2) {
        const m = Core.streakMult(s.streak);
        txtR(T('blockblast.combo', { m: m.toFixed(1) }), L.boardX + L.boardW, L.hudY, '#ffe08a', 'bold 14px sans-serif');
      }
    }

    // ── 下一手预览（块流是预生成的 ⇒ 预览天然成立，绝不会被偷偷换掉）──
    if (s.mode === 'level') { /* 关卡模式：这一行给目标条用了 */ } else {
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

    // 拖拽中：算出幽灵位置 + 将被消掉的行列
    let ghost = null, hintRows = [], hintCols = [];
    if (G.drag && G.drag.target) {
      const { r, c, piece } = G.drag.target;
      if (Core.canPlace(s.board, piece, r, c)) {
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
    }

    // ── 拖拽中的块（浮在指尖上方，尺寸从托盘尺寸**平滑长到**棋盘格尺寸）──
    if (G.drag) {
      const d = G.drag;
      const size = d.fromSize + (L.cell - d.fromSize) * Drag.ease(d.grow);
      drawPieceAt(d.piece, d.px - d.anchorDC * size - size / 2,
                  d.py - d.anchorDR * size - size / 2 - L.cell * Drag.LIFT, size, 0.95);
    }

    // ── 回弹中的块（非法松手 → 飞回托盘并缩回原尺寸）──
    if (G.fly) {
      const f = G.fly, k = Drag.ease(f.t / f.dur);
      const size = f.s0 + (f.s1 - f.s0) * k;
      drawPieceAt(f.piece, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k, size, 0.9);
    }

    // ── 撤销按钮（每局 1 次免费；DESIGN §10 的减压机制之一）──
    if (!s.over && s.undo) {
      const uw = 92, uh = 34, ux = L.cx - uw / 2, uy = L.trayY + L.trayH + 6;
      fillRR(ux, uy, uw, uh, 10, 'rgba(255,255,255,0.18)');
      txt('↩ ' + T('blockblast.undo'), L.cx, uy + uh / 2, '#fff', '13px sans-serif');
      addHit(ux, uy, uw, uh, 'UNDO', {});
    }

    FX.draw(ctx);
    ctx.restore();

    // ── 关卡浮层：胜利（三星）/ 失败 / 不可胜 ──
    if (s.mode === 'level' && s.over) {
      drawDim('rgba(20,10,40,0.80)');
      const cx = L.cx, w = Math.min(L.playW - 40, 300);
      if (s.won) {
        txt(T('blockblast.levelWin'), cx, SH * 0.32, '#fff', 'bold 28px sans-serif');
        const stars = Core.starsFor(s);
        for (let i = 0; i < 3; i++) {
          txt('★', cx - 52 + i * 52, SH * 0.42, i < stars ? '#ffe08a' : 'rgba(255,255,255,0.18)',
              (i < stars ? 'bold 44px' : '44px') + ' sans-serif');
        }
        txt(T('blockblast.moves', { n: s.stats.turns }) + (s.par ? ` / ${T('blockblast.parHint', { n: s.par })}` : ''),
            cx, SH * 0.50, PAL.sub, '13px sans-serif');
        txt(String(s.score), cx, SH * 0.56, '#ffe08a', 'bold 26px sans-serif');
        fillRR(cx - 95, SH * 0.63, 190, 48, 14, '#22c55e');
        txt(T('blockblast.nextLevel'), cx, SH * 0.63 + 24, '#fff', 'bold 16px sans-serif');
        addHit(cx - 95, SH * 0.63, 190, 48, 'NEXT_LEVEL', {});
      } else {
        const unwin = s.unwinnable;
        txt(T(unwin ? 'blockblast.unwinnable' : 'blockblast.levelFail'), cx, SH * 0.34, '#fff', 'bold 24px sans-serif');
        txtLWrap(T(unwin ? 'blockblast.unwinnableHint' : 'blockblast.levelFailHint'),
                 cx - w / 2, SH * 0.44, w, PAL.sub, '13px sans-serif', 18);
        // ⚠ 关卡失败**只给「立刻重来」** —— 零广告、零插屏、零续命兜售（DESIGN §6.2）
        fillRR(cx - 95, SH * 0.60, 190, 48, 14, '#22c55e');
        txt(T('blockblast.retry'), cx, SH * 0.60 + 24, '#fff', 'bold 16px sans-serif');
        addHit(cx - 95, SH * 0.60, 190, 48, 'RETRY_LEVEL', {});
      }
      fillRR(cx - 95, SH * 0.72, 190, 42, 12, 'rgba(255,255,255,0.16)');
      txt(T('blockblast.menu'), cx, SH * 0.72 + 21, '#fff', '14px sans-serif');
      addHit(cx - 95, SH * 0.72, 190, 42, 'MENU', {});
      return;                       // ⚠ 别再 restore：上面 FX.draw 之后已经 restore 过了
    }

    // ── 结束浮层（无尽）──
    if (s.over) {
      drawDim('rgba(20,10,40,0.78)');
      const cx = L.cx, w = Math.min(L.playW - 40, 300);
      txt(T('blockblast.gameOver'), cx, SH * 0.34, '#fff', 'bold 26px sans-serif');
      txtLWrap(T('blockblast.noMoves'), cx - w / 2, SH * 0.43, w, PAL.sub, '13px sans-serif', 18);
      txt(T('blockblast.finalScore', { n: s.score }), cx, SH * 0.53, '#ffe08a', 'bold 30px sans-serif');
      if (s.score > G.best && s.score > 0) txt(T('blockblast.newBest'), cx, SH * 0.585, '#7ef2a0', 'bold 15px sans-serif');
      txt(T('blockblast.seed', { s: s.seed }), cx, SH * 0.63, 'rgba(255,255,255,0.45)', '11px sans-serif');
      fillRR(cx - 90, SH * 0.68, 180, 50, 14, '#22c55e');
      txt(T('blockblast.restart'), cx, SH * 0.68 + 25, '#fff', 'bold 17px sans-serif');
      addHit(cx - 90, SH * 0.68, 180, 50, 'RESTART', {});
      fillRR(cx - 90, SH * 0.78, 180, 42, 12, 'rgba(255,255,255,0.16)');
      txt(T('blockblast.menu'), cx, SH * 0.78 + 21, '#fff', '14px sans-serif');
      addHit(cx - 90, SH * 0.78, 180, 42, 'MENU', {});
    }
  }

  root.Render = { layout, renderMenu, computeTray, cellXY, cellAt, traySlotCenter, traySlotAt, colorOf, L, COLORS };
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
