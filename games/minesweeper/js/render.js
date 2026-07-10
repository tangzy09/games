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
  // hearts, grouped in fives for easy counting (a small gap every 5)
  const GAP5 = 7;
  const hGroups = Math.floor((MAX_HP - 1) / 5);
  const hs = Math.min(17, (SW - PAD * 2 - 130 - hGroups * GAP5) / MAX_HP);
  const heartX = (k) => PAD + 16 + k * hs + Math.floor(k / 5) * GAP5;
  for (let k = 0; k < G.maxHp; k++)
    txt(k < G.hp ? '❤️' : '🤍', heartX(k), y + 17, C.text, `${Math.round(hs * 0.85)}px sans-serif`);
  if (G.halfHeart && G.maxHp < MAX_HP)
    txt('💗', heartX(G.maxHp), y + 17, C.text, `${Math.round(hs * 0.6)}px sans-serif`);
  // xp as gold nuggets (original style): earned bright, still-needed dim
  const bx = PAD + 14, bw = SW - PAD * 2 - 126, by = y + 36;
  txtL(`Lv${G.level}`, bx, by + 8, C.xp, 'bold 12px sans-serif');
  const need = xpNeed(), shown = Math.min(G.xp, need);
  const gGroups = Math.floor((need - 1) / 5);
  const gs = Math.max(8, Math.min(14, (bw - 40 - gGroups * 7) / need));
  const goldX = (k) => bx + 36 + k * gs + Math.floor(k / 5) * 7; // gap every 5: countable at a glance
  const gfont = `${Math.round(gs * 0.95)}px sans-serif`;
  for (let k = 0; k < need; k++) {
    if (k >= shown) ctx.globalAlpha = 0.22;
    txt('🪙', goldX(k), by + 8, C.text, gfont);
    ctx.globalAlpha = 1;
  }
  if (G.xp > need) txtL(`+${G.xp - need}`, goldX(need) + 4, by + 8, '#e8a13c', 'bold 10px sans-serif');
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
      strokeRR(x, y, ts, ts, rad, G.markMenu === i ? '#f5b301' : C.tileEdge, G.markMenu === i ? 2.5 : 1);
      if (c.mark) { // player's pencil note: dark ink on the tile back
        fillRR(x + 3, y + 3, ts - 6, ts - 6, rad * 0.7, 'rgba(107,83,64,0.14)');
        txt(c.mark === 'bomb' ? '💣' : c.mark, x + ts / 2, y + ts / 2, '#6b5340', `bold ${Math.round(ts * 0.5)}px sans-serif`);
      }
      addHit(x, y, ts, ts, 'CELL', { i });
      continue;
    }
    fillRR(x, y, ts, ts, rad, C.open);
    const mid = x + ts / 2, midy = y + ts / 2;
    if (c.mon && !c.defeated) {
      const M = MONSTERS[c.mon];
      const disguised = c.mimicHidden;
      // color language: red-ish = costs HP; green = pure benefit (lv 0);
      // a disguised mimic paints itself green like a real chest — that IS its lie
      const harmless = M.lv === 0;
      const bg = disguised || harmless ? '#e9f6e7' : (c.mon === 'dragon' ? '#ffe3ec' : '#ffe9e0');
      const bd = disguised || harmless ? '#9ccc9c' : (c.mon === 'dragon' ? C.accent : '#f0a58f');
      fillRR(x, y, ts, ts, rad, bg);
      strokeRR(x, y, ts, ts, rad, bd, 1.5);
      txt(disguised ? ITEMS.chest.icon : M.icon, mid, midy - 1, C.text, `${fs}px sans-serif`);
      if (!disguised && M.lv > 0)
        txt(String(M.lv), x + ts - 6, y + 7, C.hp, `bold ${sm}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.mon && c.defeated) { // corpse: tap to collect its XP — pure benefit now
      fillRR(x, y, ts, ts, rad, '#e9f6e7');
      strokeRR(x, y, ts, ts, rad, '#9ccc9c');
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
      fillRR(x, y, ts, ts, rad, '#e9f6e7');
      strokeRR(x, y, ts, ts, rad, '#9ccc9c');
      txt('📜', mid, midy, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.treasureXp) {
      fillRR(x, y, ts, ts, rad, '#e9f6e7');
      strokeRR(x, y, ts, ts, rad, '#9ccc9c');
      txt('💎', mid, midy, C.text, `${fs}px sans-serif`);
      txt('+' + c.treasureXp, x + ts - 7, y + 7, '#66b98a', `bold ${sm}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (c.item) {
      if (c.item === 'wall') { // wall costs HP to dig: warm tone, not green
        fillRR(x, y, ts, ts, rad, '#eadcCB');
        txt(ITEMS.wall.icon, mid, midy, C.text, `${fs}px sans-serif`);
        txt(String(c.wallHP), x + ts - 6, y + 7, C.muted, `bold ${sm}px sans-serif`);
      } else {
        fillRR(x, y, ts, ts, rad, '#e9f6e7');
        strokeRR(x, y, ts, ts, rad, '#9ccc9c');
        txt(ITEMS[c.item].icon, mid, midy, C.text, `${fs}px sans-serif`);
      }
      addHit(x, y, ts, ts, 'CELL', { i });
    } else {
      if (isFogged(i)) txt('?', mid, midy, C.purple, `bold ${fs}px sans-serif`);
      else {
        const n = cellNumber(i);
        if (n > 0) { // bomb-poisoned numbers show as-is: 100+ = one bomb nearby, 200+ = two…
          const nf = n > 99 ? Math.round(ts * 0.34) : n > 9 ? Math.round(ts * 0.44) : fs;
          txt(String(n), mid, midy, n > 99 ? C.hp : (NUM_COLORS[Math.min(n, 9)] || C.purple), `bold ${nf}px sans-serif`);
        }
      }
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
  drawDim('rgba(80,55,35,0.97)');
  const { SW, SH } = GameGlobal;
  txt(T('codex.title'), SW / 2, 46, '#ffe0b8', 'bold 20px sans-serif');
  const ids = Object.keys(MONSTERS);
  const PER = 6, pages = Math.ceil(ids.length / PER);
  const page = Math.min(G.codexPage || 0, pages - 1);
  const slice = ids.slice(page * PER, page * PER + PER);
  const cardH = Math.min(88, (SH - 200) / PER - 8), w = SW - 36;
  slice.forEach((id, k) => {
    const y = 72 + k * (cardH + 8);
    fillRR(18, y, w, cardH, 14, 'rgba(255,250,240,0.97)');
    txt(MONSTERS[id].icon, 18 + 30, y + cardH / 2, C.text, '30px sans-serif');
    txtL(T('mon.' + id + '.name'), 18 + 58, y + 20, C.text, 'bold 15px sans-serif');
    if (MONSTERS[id].lv > 0)
      txtR('⚔️ ' + MONSTERS[id].lv, 18 + w - 14, y + 20, C.hp, 'bold 15px sans-serif');
    ctx.font = '12px sans-serif';
    wrapLines(T('mon.' + id + '.trait'), w - 76, 3).forEach((ln, j) =>
      txtL(ln, 18 + 58, y + 40 + j * 15, C.muted, '12px sans-serif'));
  });
  const navY = 72 + PER * (cardH + 8) + 6;
  if (page > 0) {
    fillRR(24, navY, 88, 40, 20, 'rgba(255,255,255,0.25)');
    txt('◀', 24 + 44, navY + 20, '#fff', 'bold 16px sans-serif');
    addHit(24, navY, 88, 40, 'CODEX_PAGE', { d: -1 });
  }
  txt(`${page + 1} / ${pages}`, SW / 2, navY + 20, '#ffe0b8', 'bold 14px sans-serif');
  if (page < pages - 1) {
    fillRR(SW - 24 - 88, navY, 88, 40, 20, 'rgba(255,255,255,0.25)');
    txt('▶', SW - 24 - 44, navY + 20, '#fff', 'bold 16px sans-serif');
    addHit(SW - 24 - 88, navY, 88, 40, 'CODEX_PAGE', { d: 1 });
  }
  fillRR(SW / 2 - 70, navY + 50, 140, 40, 20, 'rgba(255,255,255,0.2)');
  txt(T('codex.back'), SW / 2, navY + 70, '#fff', 'bold 14px sans-serif');
  addHit(SW / 2 - 70, navY + 50, 140, 40, 'CLOSE_OVERLAY', {});
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
  let y = SH * 0.5;
  if (!win) {
    fillRR(SW / 2 - 96, y, 192, 40, 20, 'rgba(255,255,255,0.25)');
    strokeRR(SW / 2 - 96, y, 192, 40, 20, 'rgba(255,255,255,0.5)');
    txt(`🔍 ${T('end.review')}`, SW / 2, y + 20, '#fff', 'bold 13px sans-serif');
    addHit(SW / 2 - 96, y, 192, 40, 'REVEAL_ALL', {});
    y += 50;
  }
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

// mark picker: appears after long-pressing a hidden tile
function drawMarkMenu(L) {
  if (G.markMenu == null || G.phase !== 'PLAYING') return;
  const { SW, SH } = GameGlobal;
  const opts = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '13', 'bomb', '?'];
  const cols = 6, bw2 = 52, bh2 = 46, gap = 8;
  const menuW = cols * bw2 + (cols - 1) * gap;
  const x0 = (SW - menuW) / 2, y0 = SH - 190;
  fillRR(x0 - 14, y0 - 34, menuW + 28, 2 * bh2 + gap + 92, 18, 'rgba(80,55,35,0.96)');
  txt(T('ui.markTitle'), SW / 2, y0 - 16, '#ffe0b8', 'bold 13px sans-serif');
  opts.forEach((m, k) => {
    const x = x0 + (k % cols) * (bw2 + gap), y = y0 + Math.floor(k / cols) * (bh2 + gap);
    fillRR(x, y, bw2, bh2, 12, 'rgba(255,250,240,0.95)');
    txt(m === 'bomb' ? '💣' : m, x + bw2 / 2, y + bh2 / 2, '#6b5340', 'bold 18px sans-serif');
    addHit(x, y, bw2, bh2, 'SET_MARK', { m });
  });
  const cy = y0 + 2 * (bh2 + gap) + 4;
  fillRR(x0 - 2, cy, menuW / 2 - 4, 36, 18, 'rgba(255,255,255,0.22)');
  txt(T('ui.clearMark'), x0 - 2 + (menuW / 2 - 4) / 2, cy + 18, '#fff', 'bold 12px sans-serif');
  addHit(x0 - 2, cy, menuW / 2 - 4, 36, 'SET_MARK', { m: null });
  fillRR(x0 + menuW / 2 + 6, cy, menuW / 2 - 4, 36, 18, 'rgba(255,255,255,0.22)');
  txt(T('tut.next'), x0 + menuW / 2 + 6 + (menuW / 2 - 4) / 2, cy + 18, '#fff', 'bold 12px sans-serif');
  addHit(x0 + menuW / 2 + 6, cy, menuW / 2 - 4, 36, 'MARK_CLOSE', {});
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
  drawMarkMenu(L);
  if (G.overlay === 'codex') drawCodex();
  else if (G.phase === 'LOSE' && G.reviewMode) { // post-mortem: full board + bottom bar
    const y = SH - 62;
    fillRR(12, y, SW / 2 - 18, 46, 23, C.accent);
    txt(T('end.retry'), 12 + (SW / 2 - 18) / 2, y + 23, '#fff', 'bold 14px sans-serif');
    addHit(12, y, SW / 2 - 18, 46, 'RESTART', {});
    fillRR(SW / 2 + 6, y, SW / 2 - 18, 46, 23, C.surface);
    strokeRR(SW / 2 + 6, y, SW / 2 - 18, 46, 23, C.border);
    txt(T('end.home'), SW / 2 + 6 + (SW / 2 - 18) / 2, y + 23, C.text, 'bold 14px sans-serif');
    addHit(SW / 2 + 6, y, SW / 2 - 18, 46, 'GO_HOME', {});
    return;
  }
  else if (G.phase === 'WIN') { drawEnd(true); return; }
  else if (G.phase === 'LOSE') { drawEnd(false); return; }
  drawFloat();
}
