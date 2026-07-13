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
  // 块的颜色纯装饰（消除只看行列是否填满，不看颜色）
  const COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
  const colorOf = id => COLORS[Math.abs(hashStr(id)) % COLORS.length];
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  const L = {};   // 布局（drag.js 也用）

  function layout() {
    const { SW, SH, safeTop } = GameGlobal;
    const boardW = Math.min(SW - 28, 460, (SH - safeTop) * 0.52);
    const cell = Math.floor(boardW / 8);
    const bw = cell * 8;
    L.cell = cell;
    L.boardX = Math.round((SW - bw) / 2);
    L.boardY = Math.round(safeTop + (SH - safeTop) * 0.20);
    L.boardW = bw;
    L.hudY = safeTop + 24;
    L.trayY = L.boardY + bw + Math.round(cell * 0.7);
    L.trayH = Math.round(cell * 3.2);
    L.traySlotW = Math.floor(SW / 3);
    L.trayScale = 0.62;                       // 托盘里的块比棋盘格小
    return L;
  }

  /** 棋盘坐标 → 屏幕 */
  const cellXY = (r, c) => ({ x: L.boardX + c * L.cell, y: L.boardY + r * L.cell });
  /** 屏幕 → 棋盘格（可能越界，调用方自己判断）*/
  const cellAt = (x, y) => ({ r: Math.floor((y - L.boardY) / L.cell), c: Math.floor((x - L.boardX) / L.cell) });
  /** 托盘槽的中心 */
  function traySlotCenter(i) {
    return { x: L.traySlotW * i + L.traySlotW / 2, y: L.trayY + L.trayH / 2 };
  }
  /** 屏幕点命中哪个托盘槽（-1 = 没命中）*/
  function traySlotAt(x, y) {
    if (y < L.trayY || y > L.trayY + L.trayH) return -1;
    const i = Math.floor(x / L.traySlotW);
    return i >= 0 && i <= 2 ? i : -1;
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

  function drawPieceAt(piece, x, y, size, alpha) {
    const col = colorOf(piece.id);
    for (const [dr, dc] of piece.cells) drawBlock(x + dc * size, y + dr * size, size, col, alpha);
  }

  function renderAll() {
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;

    // 背景
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const off = FX.offset();
    ctx.save();
    ctx.translate(off.x, off.y);

    const s = G.s;

    // ── HUD ──
    txt(String(s.score), SW / 2, L.hudY, PAL.text, 'bold 34px sans-serif');
    txtL(T('blockblast.best') + ' ' + G.best, 16, L.hudY, PAL.sub, '13px sans-serif');
    if (s.streak >= 2) {
      const m = Core.streakMult(s.streak);
      txtR(T('blockblast.combo', { m: m.toFixed(1) }), SW - 16, L.hudY, '#ffe08a', 'bold 14px sans-serif');
    }

    // ── 下一手预览（块流是预生成的 ⇒ 预览天然成立，绝不会被偷偷换掉）──
    const nh = Core.nextHand(s);
    const nSize = Math.max(5, Math.round(L.cell * 0.22));
    txtL(T('blockblast.next'), L.boardX, L.boardY - 20, PAL.sub, '11px sans-serif');
    let nx = L.boardX + 44;
    for (const p of nh) {
      drawPieceAt(p, nx, L.boardY - 20 - (p.h * nSize) / 2, nSize, 0.55);
      nx += p.wdt * nSize + 12;
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
        const f = Core.findFullLines(test);
        hintRows = f.rows; hintCols = f.cols;
      }
    }

    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const { x, y } = cellXY(r, c);
      const hinted = hintRows.includes(r) || hintCols.includes(c);
      if (hinted) { ctx.fillStyle = PAL.lineHint; roundRect(x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.fill(); }
      else { ctx.fillStyle = PAL.cellEmpty; roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.fill(); }

      if (s.board[Core.idx(r, c)] && !FX.isDying(x, y)) {
        drawBlock(x, y, L.cell, G.cellColor[Core.idx(r, c)] || COLORS[4]);
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

    // ── 托盘 ──
    const tray = Core.tray(s);
    for (let i = 0; i < 3; i++) {
      const p = tray[i];
      if (!p) continue;
      if (G.drag && G.drag.slot === i) continue;         // 正在手上的那块不画在托盘里
      const size = Math.round(L.cell * L.trayScale);
      const ctr = traySlotCenter(i);
      const x = ctr.x - (p.wdt * size) / 2, y = ctr.y - (p.h * size) / 2;
      const dead = !Core.canPlaceAnywhere(s.board, p);   // 放不下的块暗掉：失败要看得见原因
      drawPieceAt(p, x, y, size, dead ? 0.35 : 1);
    }

    // ── 拖拽中的块（浮在指尖上方）──
    if (G.drag) {
      const d = G.drag;
      const size = L.cell;
      drawPieceAt(d.piece, d.px - d.anchorDC * size - size / 2, d.py - d.anchorDR * size - size / 2 - L.cell * 1.2, size, 0.95);
    }

    FX.draw(ctx);
    ctx.restore();

    // ── 结束浮层 ──
    if (s.over) {
      drawDim('rgba(20,10,40,0.78)');
      txt(T('blockblast.gameOver'), SW / 2, SH * 0.34, '#fff', 'bold 26px sans-serif');
      txtLWrap(T('blockblast.noMoves'), SW / 2 - 140, SH * 0.43, 280, PAL.sub, '13px sans-serif', 18);
      txt(T('blockblast.finalScore', { n: s.score }), SW / 2, SH * 0.53, '#ffe08a', 'bold 30px sans-serif');
      if (s.score >= G.best && s.score > 0) txt(T('blockblast.newBest'), SW / 2, SH * 0.585, '#7ef2a0', 'bold 15px sans-serif');
      txt(T('blockblast.seed', { s: s.seed }), SW / 2, SH * 0.63, 'rgba(255,255,255,0.45)', '11px sans-serif');
      fillRR(SW / 2 - 90, SH * 0.68, 180, 50, 14, '#22c55e');
      txt(T('blockblast.restart'), SW / 2, SH * 0.68 + 25, '#fff', 'bold 17px sans-serif');
      addHit(SW / 2 - 90, SH * 0.68, 180, 50, 'RESTART', {});
    }
  }

  root.Render = { layout, cellXY, cellAt, traySlotCenter, traySlotAt, colorOf, L, COLORS };
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
