// ════════════════════════════════════════
// render.js — v2 cute pastel renderer. Pure function of G.
// ════════════════════════════════════════

const NUM_COLORS = { 1:'#5b9bd5', 2:'#66b98a', 3:'#e8a13c', 4:'#c77bc2', 5:'#e2726e', 6:'#5ec3c9', 7:'#9b8cf0', 8:'#e88bb0', 9:'#8a9a5b' };
const C = {
  bg: '#fdf3e7', surface: '#fffdf9', border: '#ecd9c0', text: '#6b5340', muted: '#b09a83',
  tile: '#ffd9b8', tileEdge: '#f0b98c', open: '#fbf0df',
  accent: '#ff8fab', hp: '#ff6b81', xp: '#7cc98f', gold: '#e8a13c', purple: '#b48ce8',
};

function layout() {
  const SW = GameGlobal.SW, SH = GameGlobal.SH, PAD = 10;
  const hudY = GameGlobal.safeTop + 6, hudH = 66;
  const barH = 44;
  const availH = SH - hudY - hudH - barH - PAD * 3;
  const GAP = 2;
  const ts = Math.min((SW - PAD * 2 - GAP * (G.w - 1)) / G.w, (availH - GAP * (G.h - 1)) / G.h);
  const bw = ts * G.w + GAP * (G.w - 1), bh = ts * G.h + GAP * (G.h - 1);
  return { SW, SH, PAD, hudY, hudH, GAP, ts, boardX: (SW - bw) / 2, boardY: hudY + hudH + PAD, barY: hudY + hudH + PAD * 2 + bh };
}

function drawHud(L) {
  const { PAD, SW, hudY: y, hudH: h } = L;
  fillRR(PAD, y, SW - PAD * 2, h, 18, C.surface);
  strokeRR(PAD, y, SW - PAD * 2, h, 18, C.border, 1.5);
  // hearts row: filled / empty up to maxHp (cap 15 fits)
  const hs = Math.min(18, (SW - PAD * 2 - 24) / 15);
  for (let k = 0; k < G.maxHp; k++)
    txt(k < G.hp ? '❤️' : '🤍', PAD + 20 + k * hs, y + 18, C.text, `${Math.round(hs * 0.9)}px sans-serif`);
  if (G.hp === 0) txt(T('ui.zeroOk'), SW - PAD - 46, y + 18, C.accent, 'bold 10px sans-serif');
  // xp bar
  const bx = PAD + 14, bw = SW - PAD * 2 - 28, by = y + 38;
  txtL(`Lv${G.level}`, bx, by + 7, C.xp, 'bold 12px sans-serif');
  fillRR(bx + 36, by, bw - 36, 14, 7, '#efe3d2');
  fillRR(bx + 36, by, Math.max(8, (bw - 36) * Math.min(1, G.xp / xpNeed())), 14, 7, C.xp);
  txt(`${G.xp}/${xpNeed()}`, bx + 36 + (bw - 36) / 2, by + 7, '#fff', 'bold 9px sans-serif');
}

function drawGrid(L) {
  const { boardX: bx, boardY: by, ts, GAP } = L;
  const fs = Math.round(ts * 0.55);
  for (let i = 0; i < G.grid.length; i++) {
    const r = Math.floor(i / G.w), c = i % G.w;
    const x = bx + c * (ts + GAP), y = by + r * (ts + GAP), rad = Math.max(5, ts * 0.24);
    const cell = G.grid[i];
    if (!cell.rev) {
      fillRR(x, y, ts, ts, rad, C.tile);
      strokeRR(x, y, ts, ts, rad, G.orbMode ? '#f5b301' : C.tileEdge);
      if (cell.peek) { // drop-intel: show what's hiding
        ctx.globalAlpha = 0.6;
        txt(cell.mon ? MONSTERS[cell.mon].icon : '·', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
        ctx.globalAlpha = 1;
      }
      addHit(x, y, ts, ts, 'CELL', { i });
      continue;
    }
    fillRR(x, y, ts, ts, rad, C.open);
    if (cell.mon && !cell.dead) { // revealed live monster: shown, tap again to fight
      const M = MONSTERS[cell.mon];
      fillRR(x, y, ts, ts, rad, M.boss ? '#ffe3ec' : '#fff4e0');
      strokeRR(x, y, ts, ts, rad, M.boss ? C.accent : C.gold, 1.5);
      const icon = (M.disguise && !cell.mimicPoked) ? '🎁' : M.icon;
      txt(icon, x + ts / 2, y + ts / 2 - 2, C.text, `${fs}px sans-serif`);
      if (!(M.disguise && !cell.mimicPoked))
        txt(String(M.lv), x + ts - 6, y + 8, C.hp, `bold ${Math.max(8, Math.round(ts * 0.3))}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (cell.mon && cell.dead) {
      ctx.globalAlpha = 0.22;
      txt(MONSTERS[cell.mon].icon, x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      ctx.globalAlpha = 1;
    } else if (cell.t === 'chest') {
      txt('🎀', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (cell.t === 'heartscroll') {
      fillRR(x, y, ts, ts, rad, '#ffe9f0');
      txt('💗', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else {
      const n = cellNumber(i);
      if (n === null) txt('?', x + ts / 2, y + ts / 2, C.purple, `bold ${fs}px sans-serif`);
      else if (n > 0) txt(String(n), x + ts / 2, y + ts / 2, NUM_COLORS[Math.min(n, 9)] || C.purple, `bold ${fs}px sans-serif`);
    }
  }
}

function drawBar(L) {
  const { PAD, SW, barY: y } = L;
  // orb buttons
  for (let k = 0; k < START_ORBS; k++) {
    const x = PAD + k * 46;
    const has = k < G.orbs;
    fillRR(x, y, 40, 36, 12, has ? '#e8f4ff' : '#f1ece4');
    strokeRR(x, y, 40, 36, 12, G.orbMode && has ? '#f5b301' : C.border, G.orbMode && has ? 2.5 : 1);
    ctx.globalAlpha = has ? 1 : 0.3;
    txt('🔮', x + 20, y + 18, C.text, '18px sans-serif');
    ctx.globalAlpha = 1;
    if (has) addHit(x, y, 40, 36, 'USE_ORB', {});
  }
  if (G.orbMode) txtL(T('ui.orbAim'), PAD + 100, y + 18, '#b8860b', 'bold 11px sans-serif');
  // codex
  fillRR(SW - PAD - 44, y, 44, 36, 12, C.surface);
  strokeRR(SW - PAD - 44, y, 44, 36, 12, C.border);
  txt('📖', SW - PAD - 22, y + 18, C.text, '17px sans-serif');
  addHit(SW - PAD - 44, y, 44, 36, 'OPEN_CODEX', {});
}

function bigButton(cy, key, action, color) {
  const { SW } = GameGlobal;
  fillRR(SW / 2 - 96, cy, 192, 48, 24, color || C.accent);
  txt(T(key), SW / 2, cy + 24, '#fff', 'bold 15px sans-serif');
  addHit(SW / 2 - 96, cy, 192, 48, action, {});
}

function drawHome() {
  const { SW, SH } = GameGlobal;
  txt('🐉', SW / 2, SH * 0.2, C.text, '58px sans-serif');
  txt(T('home.title'), SW / 2, SH * 0.29, C.accent, 'bold 27px sans-serif');
  ctx.font = '13px sans-serif';
  wrapLines(T('home.subtitle'), 290, 3).forEach((ln, k) =>
    txt(ln, SW / 2, SH * 0.36 + k * 17, C.muted, '13px sans-serif'));
  txt(`🏆 ${T('home.wins', { n: Meta.wins })}` + (Meta.streak > 0 ? `   🔥 ${Meta.streak}` : ''), SW / 2, SH * 0.46, C.purple, 'bold 13px sans-serif');
  bigButton(SH * 0.52, 'home.start', 'START_RUN');
  const dy = SH * 0.52 + 60;
  const can = Meta.canDaily();
  fillRR(SW / 2 - 96, dy, 192, 42, 21, can ? C.purple : 'rgba(180,140,232,0.3)');
  txt(can ? T('home.daily') : T('home.dailyDone'), SW / 2, dy + 21, '#fff', 'bold 13px sans-serif');
  if (can) addHit(SW / 2 - 96, dy, 192, 42, 'START_DAILY', {});
  fillRR(SW / 2 - 96, dy + 52, 192, 38, 19, C.surface);
  strokeRR(SW / 2 - 96, dy + 52, 192, 38, 19, C.border);
  txt(`📖 ${T('home.codex')}`, SW / 2, dy + 71, C.text, 'bold 13px sans-serif');
  addHit(SW / 2 - 96, dy + 52, 192, 38, 'OPEN_CODEX', {});
}

function drawCodex() {
  drawDim('rgba(80,55,35,0.96)');
  const { SW, SH } = GameGlobal;
  txt(T('codex.title'), SW / 2, 54, '#ffe0b8', 'bold 19px sans-serif');
  const ids = Object.keys(MONSTERS);
  const colW = (SW - 44) / 2, cardH = Math.min(52, (SH - 140) / Math.ceil(ids.length / 2) - 6);
  ids.forEach((id, k) => {
    const col = k % 2, row = Math.floor(k / 2);
    const x = 22 + col * (colW + 4), y = 78 + row * (cardH + 6);
    const known = Meta.seen.has(id);
    fillRR(x, y, colW - 4, cardH, 12, 'rgba(255,250,240,0.95)');
    ctx.globalAlpha = known ? 1 : 0.45;
    txt(known ? MONSTERS[id].icon : '❓', x + 18, y + cardH / 2, C.text, '17px sans-serif');
    if (known) {
      txtL(`${T('mon.' + id + '.name')}  ${MONSTERS[id].lv || '?'}`, x + 34, y + 14, C.text, 'bold 10px sans-serif');
      txtLWrap(T('mon.' + id + '.trait'), x + 34, y + cardH / 2 + 8, colW - 44, C.muted, '8px sans-serif', 10);
    } else {
      txtL(T('codex.unknown'), x + 34, y + cardH / 2, C.muted, '9px sans-serif');
    }
    ctx.globalAlpha = 1;
  });
  const backY = 78 + Math.ceil(ids.length / 2) * (cardH + 6) + 8;
  fillRR(SW / 2 - 70, backY, 140, 36, 18, 'rgba(255,255,255,0.2)');
  txt(T('codex.back'), SW / 2, backY + 18, '#fff', 'bold 12px sans-serif');
  addHit(SW / 2 - 70, backY, 140, 36, 'CLOSE_OVERLAY', {});
}

function drawEnd(win) {
  drawDim(win ? 'rgba(90,150,110,0.92)' : 'rgba(120,70,80,0.92)');
  const { SW, SH } = GameGlobal;
  txt(win ? '🎉' : '😵', SW / 2, SH * 0.2, '#fff', '52px sans-serif');
  txt(T(win ? 'win.title' : 'lose.title'), SW / 2, SH * 0.29, '#fff', 'bold 24px sans-serif');
  if (G.mode === 'daily') txt(win ? T('end.streakUp', { n: Meta.streak }) : T('end.streakLost'), SW / 2, SH * 0.35, '#ffe08a', 'bold 13px sans-serif');
  else txt(T('end.sub', { n: G.level }), SW / 2, SH * 0.35, 'rgba(255,255,255,0.85)', '13px sans-serif');
  let y = SH * 0.46;
  if (!win && G.mode === 'normal' && !G.adRevived) {
    fillRR(SW / 2 - 96, y, 192, 44, 22, C.purple);
    txt(`📺 ${T('end.adRevive')}`, SW / 2, y + 22, '#fff', 'bold 13px sans-serif');
    addHit(SW / 2 - 96, y, 192, 44, 'AD_REVIVE', {});
    y += 54;
  }
  bigButton(y, 'end.retry', 'RESTART', win ? '#66b98a' : C.accent);
  y += 58;
  fillRR(SW / 2 - 96, y, 192, 38, 19, 'rgba(255,255,255,0.22)');
  txt(T('end.home'), SW / 2, y + 19, '#fff', '13px sans-serif');
  addHit(SW / 2 - 96, y, 192, 38, 'GO_HOME', {});
}

function drawTut(L) {
  if (!G.tut || G.phase !== 'PLAYING') return;
  const { SW, SH } = GameGlobal;
  const bh = 96, by = SH - bh - 10, bx = 12, bw = SW - 24;
  fillRR(bx, by, bw, bh, 16, 'rgba(80,55,35,0.94)');
  strokeRR(bx, by, bw, bh, 16, '#ffce7a');
  ctx.font = '12px sans-serif';
  wrapLines(T('tut.s' + G.tut.step), bw - 28, 3).forEach((ln, k) =>
    txtL(ln, bx + 14, by + 30 + k * 15, '#ffe9c7', '12px sans-serif'));
  if (G.tut.step !== 1 && G.tut.step !== 3) {
    fillRR(bx + bw - 86, by + bh - 30, 76, 22, 11, '#ffce7a');
    txt(T('tut.next'), bx + bw - 48, by + bh - 19, '#5a3d1e', 'bold 11px sans-serif');
    addHit(bx + bw - 86, by + bh - 30, 76, 22, 'TUT_NEXT', {});
  }
  txtR(T('tut.skip'), bx + bw - 10, by + 13, 'rgba(255,233,199,0.5)', '9px sans-serif');
  addHit(bx + bw - 100, by + 3, 92, 18, 'TUT_SKIP', {});
}

function drawFloat() {
  if (!G.floatMsg) return;
  const { SW, SH } = GameGlobal;
  ctx.font = 'bold 13px sans-serif';
  const w = ctx.measureText(G.floatMsg).width + 30;
  fillRR((SW - w) / 2, SH * 0.12, w, 38, 19, 'rgba(80,55,35,0.92)');
  txt(G.floatMsg, SW / 2, SH * 0.12 + 19, '#ffe9c7', 'bold 13px sans-serif');
}

function renderAll() {
  clearHits();
  const { SW, SH } = GameGlobal;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);
  if (G.phase === 'HOME') {
    drawHome();
    if (G.overlay === 'codex') drawCodex();
    drawFloat();
    return;
  }
  const L = layout();
  drawHud(L);
  if (G.grid.length) drawGrid(L);
  drawBar(L);
  drawTut(L);
  if (G.overlay === 'codex') drawCodex();
  else if (G.phase === 'WIN') { drawEnd(true); return; }
  else if (G.phase === 'LOSE') { drawEnd(false); return; }
  drawFloat();
}
