// render.js — 立即模式渲染(浏览器专用)。renderAll 契约:clearHits → 重画全屏 → addHit。
// 棋盘模型:列 index0=顶,往下长,底=玩家侧/死线。故格子(c,i)画在 y = boardY + i*cell。
// ⚠ 致死那一格的 index === s.rows(core 判 length > rows 才死),它在死线【下方】——
//   必须画出来且视觉上压过死线,否则死亡画面里完全看不出是哪一列被顶爆(死因信息全丢)。
const PAL = {
  bg: '#04121f',
  boardBg: '#0a1f33',
  colBg: '#0d2740',
  line: '#2bb3c0',        // 死线
  text: '#cfe8f5',
  dim: 'rgba(2,10,18,0.82)',
  btn: '#2bb3c0',
  btnText: '#04121f',
  breach: '#ff4d5e',                  // 顶爆列的高亮红
  breachWash: 'rgba(255,77,94,0.18)', // 顶爆列的整列红洗
  // 按档位上色(浅礁→深渊,越深越冷艳)
  tiers: ['#38bdf8', '#34d399', '#a3e635', '#fbbf24', '#fb923c',
          '#f87171', '#f472b6', '#c084fc', '#a78bfa', '#818cf8',
          '#60a5fa', '#22d3ee', '#e2e8f0'],
};

const PAD = 12;
const BREACH_RISE = 0.25;   // 越线格上移的比例(× cell),使其骑跨死线 = 视觉上「冲破」

// 布局:HUD 在顶(避开引擎顶栏 safeTop),棋盘居中,死线下留一整格的「越线区」,再是炮台行。
function layout(s) {
  const { SW, SH, safeTop } = GameGlobal;
  const hudY = safeTop + 8;
  const hudH = 44;
  const topY = hudY + hudH + 8;
  const bottomPad = 16;
  // 竖向要塞下:rows 行棋盘 + 1 行越线区 + 1 行炮台(+ 余量)
  const availH = SH - topY - bottomPad;
  const availW = SW - PAD * 2;
  // ⚠ 极小视口(门户 iframe)下 availH/availW 可能为负 → cell 负数 → fillRR 负宽高、
  //   font 尺寸非法(浏览器静默忽略,画面全乱)。夹一个下限,保证永不为负。
  const cell = Math.max(8, Math.floor(Math.min(availW / s.cols, availH / (s.rows + 2.1))));
  const boardW = cell * s.cols;
  const boardH = cell * s.rows;
  const boardX = Math.round((SW - boardW) / 2);
  const boardY = topY;
  const lineY = boardY + boardH;          // 死线
  const cannonY = lineY + cell;           // 越线区占死线下方一整格,炮台再往下一行
  return { SW, SH, hudY, hudH, cell, boardW, boardH, boardX, boardY, lineY, cannonY };
}

// 画一个鱼格:圆角色块 + 数字(P1b 用纯色+数字占位,鱼图 P2 接 makeArt/drawArtIcon)
function drawTile(x, y, cell, v) {
  const t = Tiles.tierOf(v);
  // 超纲档(tierOf → -1,如合出 16384)取最后一档色,别退化成 tier0 的最浅礁色:
  // 那会让最大的鱼画得跟最小的一样,方向性误导。
  const color = t < 0 ? PAL.tiers[PAL.tiers.length - 1] : PAL.tiers[t % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  fillRR(x + m, y + m, cell - m * 2, cell - m * 2, Math.round(cell * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.max(6, Math.round(cell * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42)));
  txt(label, x + cell / 2, y + cell / 2, '#04121f', `bold ${fs}px sans-serif`);
}

// 覆盖层大按钮(HOME/DEAD 共用;同 minesweeper 的 bigButton 先例)
function button(cy, key, action) {
  const { SW } = GameGlobal;
  const bw = 180, bh = 52, bx = SW / 2 - bw / 2;
  fillRR(bx, cy, bw, bh, 14, PAL.btn);
  txt(T(key), SW / 2, cy + bh / 2, PAL.btnText, 'bold 18px sans-serif');
  addHit(bx, cy, bw, bh, action, {});
  return cy + bh;   // 按钮底边,方便在其下继续排版
}

// 顶爆列:把越过死线的格子(i >= rows)画出来 —— 骑跨死线 + 整列红洗 + 红环,
// 一眼看出是哪一列被顶爆。最后画(在覆盖层之上),不被 dim 压暗。
function drawBreaches(L, s) {
  for (let c = 0; c < s.cols; c++) {
    const col = s.board[c];
    if (col.length <= s.rows) continue;
    const x = L.boardX + c * L.cell;
    // 整列红洗 + 红框:标出「就是这一列」
    ctx.fillStyle = PAL.breachWash;
    ctx.fillRect(x, L.boardY, L.cell, L.boardH);
    strokeRR(x + 1, L.boardY, L.cell - 2, L.boardH, 8, PAL.breach, 2);
    // 越线的格子:上移 BREACH_RISE 使其骑跨死线
    for (let i = s.rows; i < col.length; i++) {
      const y = L.lineY + (i - s.rows) * L.cell - L.cell * BREACH_RISE;
      drawTile(x, y, L.cell, col[i]);
      const m = Math.round(L.cell * 0.06);
      strokeRR(x + m, y + m, L.cell - m * 2, L.cell - m * 2, Math.round(L.cell * 0.18), PAL.breach, 3);
    }
  }
}

function renderAll() {
  clearHits();
  const s = G.s;
  const L = layout(s);
  const { SW, SH } = L;

  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, SW, SH);

  // ── HUD:分数(左) + 最深(右,用引擎 txtR 右对齐:变长文案不会双向溢出) ──
  txtL(`${T('abyss.score')} ${s.score}`, PAD, L.hudY + L.hudH / 2, PAL.text, 'bold 18px sans-serif');
  const best = s.maxTile ? Tiles.fmt(s.maxTile) : '—';
  txtR(`${T('abyss.best')} ${best}`, SW - PAD, L.hudY + L.hudH / 2, PAL.text, '14px sans-serif');

  // ── 棋盘底 + 列底 ──
  fillRR(L.boardX - 4, L.boardY - 4, L.boardW + 8, L.boardH + 8, 10, PAL.boardBg);
  for (let c = 0; c < s.cols; c++) {
    fillRR(L.boardX + c * L.cell + 2, L.boardY + 2, L.cell - 4, L.boardH - 4, 8, PAL.colBg);
  }

  // ── 盘内鱼格:(c,i) → y = boardY + i*cell(index0 在顶);越线的格子留给 drawBreaches ──
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
  ctx.moveTo(L.boardX, L.lineY + 1);
  ctx.lineTo(L.boardX + L.boardW, L.lineY + 1);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 炮台:每列一个 ▲ ──
  for (let c = 0; c < s.cols; c++) {
    const cx = L.boardX + c * L.cell + L.cell / 2;
    txt('▲', cx, L.cannonY + L.cell * 0.5, '#3b6a86', `${Math.round(L.cell * 0.34)}px sans-serif`);
  }
  // 当前弹药:画在炮台行正中。死后仍显示(s.ammo 停在致死那发),让死亡画面完整可读。
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
      addHit(L.boardX + c * L.cell, L.boardY, L.cell, L.cannonY + L.cell - L.boardY, 'SHOOT', { col: c });
    }
  }

  // ── 覆盖层 ──
  if (G.phase === 'HOME') {
    drawDim(PAL.dim);
    txt(T('abyss.title'), SW / 2, SH * 0.34, PAL.text, 'bold 30px sans-serif');
    txtLWrap(T('abyss.tagline'), SW / 2 - 130, SH * 0.42, 260, '#8ab6cd', '14px sans-serif', 18);
    const bBot = button(SH * 0.54, 'abyss.start', 'START');
    txt(T('abyss.hint'), SW / 2, bBot + 28, '#5b87a3', '12px sans-serif');
  } else if (G.phase === 'DEAD') {
    drawDim(PAL.dim);
    txt(T('abyss.gameOver'), SW / 2, SH * 0.36, '#f87171', 'bold 28px sans-serif');
    txt(T('abyss.finalScore', { n: s.score }), SW / 2, SH * 0.44, PAL.text, 'bold 20px sans-serif');
    txt(T('abyss.deepest', { v: Tiles.fmt(s.maxTile || 0) }), SW / 2, SH * 0.50, '#8ab6cd', '14px sans-serif');
    button(SH * 0.58, 'abyss.restart', 'RESTART');
  }

  // ── 顶爆列最后画:压过死线、也压过 dim,死亡画面必须一眼看出是哪列被顶爆 ──
  drawBreaches(L, s);
}
