// ════════════════════════════════════════
// render.js — v2.1 cute pastel renderer for the faithful ruleset.
// ════════════════════════════════════════

const NUM_COLORS = { 1:'#5b9bd5', 2:'#66b98a', 3:'#e8a13c', 4:'#c77bc2', 5:'#e2726e', 6:'#5ec3c9', 7:'#9b8cf0', 8:'#e88bb0', 9:'#8a9a5b' };
const C = {
  bg: '#fdf3e7', surface: '#fffdf9', border: '#ecd9c0', text: '#6b5340', muted: '#b09a83',
  tile: '#ffd9b8', tileEdge: '#f0b98c', open: '#fbf0df',
  accent: '#ff8fab', hp: '#ff6b81', xp: '#7cc98f', purple: '#b48ce8',
};

function layout() {
  const SW = GameGlobal.SW, SH = GameGlobal.SH, PAD = 8;
  const hudY = GameGlobal.safeTop + 6, hudH = 84;
  const availH = SH - hudY - hudH - PAD * 3;
  const GAP = 2;
  const ts = Math.min((SW - PAD * 2 - GAP * (G.w - 1)) / G.w, (availH - GAP * (G.h - 1)) / G.h);
  const bw = ts * G.w + GAP * (G.w - 1);
  return { SW, SH, PAD, hudY, hudH, GAP, ts, boardX: (SW - bw) / 2, boardY: hudY + hudH + PAD };
}

function drawHud(L) {
  const { PAD, SW, hudY: y, hudH: h } = L;
  fillRR(PAD, y, SW - PAD * 2, h, 16, C.surface);
  strokeRR(PAD, y, SW - PAD * 2, h, 16, C.border, 1.5);
  // hearts (halfHeart: a budding half after the last full one)
  const hs = Math.min(17, (SW - PAD * 2 - 130) / MAX_HP);
  for (let k = 0; k < G.maxHp; k++)
    txt(k < G.hp ? '❤️' : '🤍', PAD + 16 + k * hs, y + 17, C.text, `${Math.round(hs * 0.85)}px sans-serif`);
  if (G.halfHeart && G.maxHp < MAX_HP)
    txt('💗', PAD + 16 + G.maxHp * hs, y + 17, C.text, `${Math.round(hs * 0.6)}px sans-serif`);
  // xp bar + manual level-up button (the faithful bit)
  const bx = PAD + 14, bw = SW - PAD * 2 - 122, by = y + 36;
  txtL(`Lv${G.level}`, bx, by + 8, C.xp, 'bold 12px sans-serif');
  fillRR(bx + 34, by, bw - 34, 16, 8, '#efe3d2');
  fillRR(bx + 34, by, Math.max(8, (bw - 34) * Math.min(1, G.xp / xpNeed())), 16, 8, C.xp);
  txt(`${G.xp}/${xpNeed()}`, bx + 34 + (bw - 34) / 2, by + 8, '#fff', 'bold 9px sans-serif');
  const can = canLevelUp();
  fillRR(SW - PAD - 104, by - 6, 94, 30, 15, can ? C.xp : '#e8dcc9');
  txt(`⬆ ${T('ui.levelUp')}`, SW - PAD - 57, by + 9, can ? '#fff' : C.muted, 'bold 12px sans-serif');
  if (can) addHit(SW - PAD - 104, by - 6, 94, 30, 'LEVEL_UP', {});
  // codex
  fillRR(SW - PAD - 104, y + 58, 94, 22, 11, C.surface);
  strokeRR(SW - PAD - 104, y + 58, 94, 22, 11, C.border);
  txt(`📖 ${T('home.codex')}`, SW - PAD - 57, y + 69, C.text, 'bold 10px sans-serif');
  addHit(SW - PAD - 104, y + 58, 94, 22, 'OPEN_CODEX', {});
}

function drawGrid(L) {
  const { boardX: bx, boardY: by, ts, GAP } = L;
  const fs = Math.round(ts * 0.55), sm = Math.max(8, Math.round(ts * 0.28));
  for (let i = 0; i < G.grid.length; i++) {
    const [cx, cy] = xy(i);
    const x = bx + cx * (ts + GAP), y = by + cy * (ts + GAP), rad = Math.max(4, ts * 0.22);
    const c = G.grid[i];
    if (!c.rev) {
      fillRR(x, y, ts, ts, rad, C.tile);
      strokeRR(x, y, ts, ts, rad, C.tileEdge);
      addHit(x, y, ts, ts, 'CELL', { i });
      continue;
    }
    fillRR(x, y, ts, ts, rad, C.open);
    const mid = x + ts / 2, midy = y + ts / 2;
    if (c.mon && !c.defeated) {
      const M = MONSTERS[c.mon];
      const disguised = c.mimicHidden;
      fillRR(x, y, ts, ts, rad, c.mon === 'dragon' ? '#ffe3ec' : '#fff4e0');
      strokeRR(x, y, ts, ts, rad, c.mon === 'dragon' ? C.accent : '#f0c987', 1.5);
      txt(disguised ? ITEMS.chest.icon : M.icon, mid, midy - 1, C.text, `${fs}px sans-serif`);
      if (!disguised && M.lv > 0)
        txt(String(M.lv), x + ts - 6, y + 7, C.hp, `bold ${sm}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.mon && c.defeated) { // corpse: tap to collect its XP
      ctx.globalAlpha = 0.45;
      txt(MONSTERS[c.mon].icon, mid, midy, C.text, `${fs}px sans-serif`);
      ctx.globalAlpha = 1;
      txt('✦', x + ts - 6, y + 7, '#e8a13c', `bold ${sm}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.spell === 'crown') {
      fillRR(x, y, ts, ts, rad, '#fff3c2');
      strokeRR(x, y, ts, ts, rad, '#e8a13c', 2);
      txt('👑', mid, midy, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.spell) {
      txt('📜', mid, midy, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.treasureXp) {
      txt('💎', mid, midy, C.text, `${fs}px sans-serif`);
      txt('+' + c.treasureXp, x + ts - 7, y + 7, '#66b98a', `bold ${sm}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.item) {
      if (c.item === 'wall') {
        fillRR(x, y, ts, ts, rad, '#eadcCB');
        txt(ITEMS.wall.icon, mid, midy, C.text, `${fs}px sans-serif`);
        txt(String(c.wallHP), x + ts - 6, y + 7, C.muted, `bold ${sm}px sans-serif`);
      } else {
        txt(ITEMS[c.item].icon, mid, midy, C.text, `${fs}px sans-serif`);
      }
      addHit(x, y, ts, ts, 'CELL', { i });
    } else {
      if (isFogged(i)) txt('?', mid, midy, C.purple, `bold ${fs}px sans-serif`);
      else { const n = cellNumber(i); if (n > 0) txt(n > 99 ? '☠' : String(n), mid, midy, n > 99 ? C.hp : (NUM_COLORS[Math.min(n, 9)] || C.purple), `bold ${n > 9 ? sm + 2 : fs}px sans-serif`); }
    }
  }
}

function bigButton(cy, key, action, color) {
  const { SW } = GameGlobal;
  fillRR(SW / 2 - 96, cy, 192, 48, 24, color || C.accent);
  txt(T(key), SW / 2, cy + 24, '#fff', 'bold 15px sans-serif');
  addHit(SW / 2 - 96, cy, 192, 48, action, {});
}

function drawHome() {
  const { SW, SH } = GameGlobal;
  txt('🐉', SW / 2, SH * 0.18, C.text, '58px sans-serif');
  txt(T('home.title'), SW / 2, SH * 0.27, C.accent, 'bold 27px sans-serif');
  ctx.font = '13px sans-serif';
  wrapLines(T('home.subtitle'), 290, 3).forEach((ln, k) =>
    txt(ln, SW / 2, SH * 0.34 + k * 17, C.muted, '13px sans-serif'));
  txt(`🏆 ${T('home.wins', { n: Meta.wins })}` + (Meta.streak > 0 ? `   🔥 ${Meta.streak}` : ''), SW / 2, SH * 0.43, C.purple, 'bold 13px sans-serif');
  const owned = BADGES.filter(b => Meta.badges.has(b));
  if (owned.length) txt(owned.map(b => T('badge.' + b + '.icon')).join(' '), SW / 2, SH * 0.47, C.text, '16px sans-serif');
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
  txt(T('codex.title'), SW / 2, 44, '#ffe0b8', 'bold 18px sans-serif');
  const ids = Object.keys(MONSTERS);
  const colW = (SW - 40) / 2, cardH = Math.min(56, (SH - 130) / Math.ceil(ids.length / 2) - 5);
  ids.forEach((id, k) => {
    const col = k % 2, row = Math.floor(k / 2);
    const x = 20 + col * (colW + 2), y = 64 + row * (cardH + 5);
    const known = Meta.seen.has(id);
    fillRR(x, y, colW - 4, cardH, 10, 'rgba(255,250,240,0.95)');
    ctx.globalAlpha = known ? 1 : 0.45;
    txt(known ? MONSTERS[id].icon : '❓', x + 16, y + cardH / 2, C.text, '15px sans-serif');
    if (known) {
      txtL(`${T('mon.' + id + '.name')} · ${MONSTERS[id].lv}`, x + 30, y + 12, C.text, 'bold 9px sans-serif');
      txtLWrap(T('mon.' + id + '.trait'), x + 30, y + cardH / 2 + 7, colW - 40, C.muted, '8px sans-serif', 10);
    } else txtL(T('codex.unknown'), x + 30, y + cardH / 2, C.muted, '9px sans-serif');
    ctx.globalAlpha = 1;
  });
  const backY = 64 + Math.ceil(ids.length / 2) * (cardH + 5) + 6;
  fillRR(SW / 2 - 70, backY, 140, 34, 17, 'rgba(255,255,255,0.2)');
  txt(T('codex.back'), SW / 2, backY + 17, '#fff', 'bold 12px sans-serif');
  addHit(SW / 2 - 70, backY, 140, 34, 'CLOSE_OVERLAY', {});
}

function drawEnd(win) {
  drawDim(win ? 'rgba(90,150,110,0.92)' : 'rgba(120,70,80,0.92)');
  const { SW, SH } = GameGlobal;
  txt(win ? '👑' : '😵', SW / 2, SH * 0.17, '#fff', '52px sans-serif');
  txt(T(win ? 'win.title' : 'lose.title'), SW / 2, SH * 0.26, '#fff', 'bold 24px sans-serif');
  if (G.mode === 'daily') txt(win ? T('end.streakUp', { n: Meta.streak }) : T('end.streakLost'), SW / 2, SH * 0.32, '#ffe08a', 'bold 13px sans-serif');
  else txt(T('end.sub', { n: G.level }), SW / 2, SH * 0.32, 'rgba(255,255,255,0.85)', '13px sans-serif');
  if (win && G.badgesThisRun.length) {
    G.badgesThisRun.forEach((b, k) => {
      const y = SH * 0.37 + k * 22;
      txt(`${T('badge.' + b + '.icon')} ${T('badge.' + b + '.name')}`, SW / 2, y, '#fff3c2', 'bold 12px sans-serif');
    });
  }
  let y = SH * 0.52;
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
    txtL(ln, bx + 14, by + 28 + k * 15, '#ffe9c7', '12px sans-serif'));
  if (G.tut.step !== 1 && G.tut.step !== 3) {
    fillRR(bx + bw - 86, by + bh - 30, 76, 22, 11, '#ffce7a');
    txt(T('tut.next'), bx + bw - 48, by + bh - 19, '#5a3d1e', 'bold 11px sans-serif');
    addHit(bx + bw - 86, by + bh - 30, 76, 22, 'TUT_NEXT', {});
  }
  txtR(T('tut.skip'), bx + bw - 10, by + 12, 'rgba(255,233,199,0.5)', '9px sans-serif');
  addHit(bx + bw - 100, by + 3, 92, 18, 'TUT_SKIP', {});
}

function drawFloat() {
  if (!G.floatMsg) return;
  const { SW, SH } = GameGlobal;
  ctx.font = 'bold 13px sans-serif';
  const w = ctx.measureText(G.floatMsg).width + 30;
  fillRR((SW - w) / 2, SH * 0.1, w, 38, 19, 'rgba(80,55,35,0.92)');
  txt(G.floatMsg, SW / 2, SH * 0.1 + 19, '#ffe9c7', 'bold 13px sans-serif');
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
  drawTut(L);
  if (G.overlay === 'codex') drawCodex();
  else if (G.phase === 'WIN') { drawEnd(true); return; }
  else if (G.phase === 'LOSE') { drawEnd(false); return; }
  drawFloat();
}
