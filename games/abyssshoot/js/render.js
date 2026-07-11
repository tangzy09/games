// render.js — 立即模式渲染(浏览器专用)。renderAll 契约:clearHits → 重画全屏 → addHit。
// 棋盘模型:列 index0=顶,往下长,底=玩家侧/死线。故格子(c,i)画在 y = boardY + i*cell。
const PAL = {
  bg: '#04121f',
  boardBg: '#0a1f33',
  colBg: '#0d2740',
  line: '#2bb3c0',        // 死线
  text: '#cfe8f5',
  dim: 'rgba(2,10,18,0.82)',
  btn: '#2bb3c0',
  btnText: '#04121f',
  // 按档位上色(浅礁→深渊,越深越冷艳);超出档位循环取
  tiers: ['#38bdf8', '#34d399', '#a3e635', '#fbbf24', '#fb923c',
          '#f87171', '#f472b6', '#c084fc', '#a78bfa', '#818cf8',
          '#60a5fa', '#22d3ee', '#e2e8f0'],
};

const PAD = 12;

// 布局:HUD 在顶(避开引擎顶栏 safeTop),棋盘居中,炮台在棋盘正下方。
function layout(s) {
  const { SW, SH, safeTop } = GameGlobal;
  const hudY = safeTop + 8;
  const hudH = 44;
  const topY = hudY + hudH + 8;
  const bottomPad = 16;
  // 竖向要塞下 rows 行棋盘 + 1 行炮台
  const availH = SH - topY - bottomPad;
  const availW = SW - PAD * 2;
  const cell = Math.floor(Math.min(availW / s.cols, availH / (s.rows + 1.4)));
  const boardW = cell * s.cols;
  const boardH = cell * s.rows;
  const boardX = Math.round((SW - boardW) / 2);
  const boardY = topY;
  const cannonY = boardY + boardH + 10;   // 死线下方留 10px 再放炮台
  return { SW, SH, hudY, hudH, cell, boardW, boardH, boardX, boardY, cannonY };
}

// 画一个鱼格:圆角色块 + 数字(P1b 用纯色+数字占位,鱼图 P2 接 makeArt/drawArtIcon)
function drawTile(x, y, cell, v) {
  const t = Tiles.tierOf(v);
  const color = PAL.tiers[(t < 0 ? 0 : t) % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  fillRR(x + m, y + m, cell - m * 2, cell - m * 2, Math.round(cell * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.round(cell * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42));
  txt(label, x + cell / 2, y + cell / 2, '#04121f', `bold ${fs}px sans-serif`);
}

function renderAll() {
  clearHits();
  const s = G.s;
  const L = layout(s);
  const { SW, SH } = L;

  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, SW, SH);

  // ── HUD:分数 + 最深 ──
  txtL(`${T('abyss.score')} ${s.score}`, PAD, L.hudY + L.hudH / 2, PAL.text, 'bold 18px sans-serif');
  const best = s.maxTile ? Tiles.fmt(s.maxTile) : '—';
  txt(`${T('abyss.best')} ${best}`, SW - PAD - 60, L.hudY + L.hudH / 2, PAL.text, '14px sans-serif');

  // ── 棋盘底 + 列底 ──
  fillRR(L.boardX - 4, L.boardY - 4, L.boardW + 8, L.boardH + 8, 10, PAL.boardBg);
  for (let c = 0; c < s.cols; c++) {
    fillRR(L.boardX + c * L.cell + 2, L.boardY + 2, L.cell - 4, L.boardH - 4, 8, PAL.colBg);
  }

  // ── 鱼格:(c,i) → y = boardY + i*cell(index0 在顶) ──
  for (let c = 0; c < s.cols; c++) {
    const col = s.board[c];
    for (let i = 0; i < col.length && i < s.rows; i++) {
      drawTile(L.boardX + c * L.cell, L.boardY + i * L.cell, L.cell, col[i]);
    }
  }

  // ── 死线 ──
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(L.boardX, L.boardY + L.boardH + 1);
  ctx.lineTo(L.boardX + L.boardW, L.boardY + L.boardH + 1);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 炮台:每列一个 ▲,当前弹药画在中间列位置之外(独立一格居中显示) ──
  for (let c = 0; c < s.cols; c++) {
    const cx = L.boardX + c * L.cell + L.cell / 2;
    txt('▲', cx, L.cannonY + L.cell * 0.5, '#3b6a86', `${Math.round(L.cell * 0.34)}px sans-serif`);
  }
  // 当前弹药:画在炮台行正中。死后仍显示(s.ammo 停在致死那发),让死亡截图/画面完整可读。
  {
    const ax = L.boardX + Math.floor(s.cols / 2) * L.cell;
    drawTile(ax, L.cannonY, L.cell, s.ammo);
  }
  // 下一发预览
  if (s.queue.length) {
    const nx = L.boardX + L.boardW - L.cell * 0.62;
    const ny = L.cannonY + L.cell * 0.5;
    txt(T('abyss.next'), nx, ny - L.cell * 0.34, '#5b87a3', '10px sans-serif');
    const sz = L.cell * 0.5;
    drawTile(nx - sz / 2, ny - sz / 2 + 4, sz, s.queue[0]);
  }

  // ── 可点区域:5 条整列竖条(棋盘顶 → 炮台底),点哪列射哪列 ──
  if (G.phase === 'PLAYING') {
    for (let c = 0; c < s.cols; c++) {
      addHit(L.boardX + c * L.cell, L.boardY, L.cell, L.boardH + L.cell + 10, 'SHOOT', { col: c });
    }
  }

  // ── 覆盖层 ──
  if (G.phase === 'HOME') {
    drawDim(PAL.dim);
    txt(T('abyss.title'), SW / 2, SH * 0.34, PAL.text, 'bold 30px sans-serif');
    txtLWrap(T('abyss.tagline'), SW / 2 - 130, SH * 0.42, 260, '#8ab6cd', '14px sans-serif', 18);
    const bw = 180, bh = 52, bx = SW / 2 - bw / 2, by = SH * 0.54;
    fillRR(bx, by, bw, bh, 14, PAL.btn);
    txt(T('abyss.start'), SW / 2, by + bh / 2, PAL.btnText, 'bold 18px sans-serif');
    addHit(bx, by, bw, bh, 'START', {});
    txt(T('abyss.hint'), SW / 2, by + bh + 28, '#5b87a3', '12px sans-serif');
  } else if (G.phase === 'DEAD') {
    drawDim(PAL.dim);
    txt(T('abyss.gameOver'), SW / 2, SH * 0.36, '#f87171', 'bold 28px sans-serif');
    txt(T('abyss.finalScore', { n: s.score }), SW / 2, SH * 0.44, PAL.text, 'bold 20px sans-serif');
    txt(T('abyss.deepest', { v: Tiles.fmt(s.maxTile || 0) }), SW / 2, SH * 0.50, '#8ab6cd', '14px sans-serif');
    const bw = 180, bh = 52, bx = SW / 2 - bw / 2, by = SH * 0.58;
    fillRR(bx, by, bw, bh, 14, PAL.btn);
    txt(T('abyss.restart'), SW / 2, by + bh / 2, PAL.btnText, 'bold 18px sans-serif');
    addHit(bx, by, bw, bh, 'RESTART', {});
  }
}
